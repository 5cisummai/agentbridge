import { z } from "zod/v4";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { eq } from "drizzle-orm";
import type { Env } from "../env.js";
import type { GatewayDb } from "../db/client.js";
import { devices } from "../db/schema.js";
import {
  jsonRpcError,
  jsonRpcRequestSchema,
  jsonRpcResult,
  jsonRpcResponseSchema,
  type JsonRpcRequest,
} from "../protocol/rpc.js";
import { threadEventSchema } from "../protocol/events.js";
import { verifyDeviceSecret } from "../services/devices.js";
import { appendThreadEvent } from "../services/thread-events.js";
import { handleApprovalSubmit } from "../services/approvals.js";

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type DeviceConnection = {
  deviceId: string;
  ws: import("ws").WebSocket;
  pending: Map<string | number, Pending>;
};

export type HubRegistry = {
  attachWebSocket: (
    server: Server<typeof IncomingMessage, typeof ServerResponse>,
  ) => void;
  close: () => void;
  call: (
    deviceId: string,
    method: string,
    params: unknown,
    timeoutMs?: number,
  ) => Promise<unknown>;
  isOnline: (deviceId: string) => boolean;
};

export function createHubRegistry(opts: {
  db: GatewayDb["db"];
  env: Env;
}): HubRegistry {
  const connections = new Map<string, DeviceConnection>();
  let wss: WebSocketServer | null = null;

  const presenceUpdates = new Map<string, Promise<void>>();
  const syncPresence = (deviceId: string) => {
    const previous = presenceUpdates.get(deviceId) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(async () => {
        await opts.db
          .update(devices)
          .set({ online: connections.has(deviceId) })
          .where(eq(devices.id, deviceId));
      });
    presenceUpdates.set(deviceId, next);
    void next
      .finally(() => {
        if (presenceUpdates.get(deviceId) === next)
          presenceUpdates.delete(deviceId);
      })
      .catch(() => {});
    return next;
  };

  const markOffline = async (deviceId: string, ws: import("ws").WebSocket) => {
    const current = connections.get(deviceId);
    if (current?.ws !== ws) return;
    connections.delete(deviceId);
    for (const pending of current.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("device_offline"));
    }
    await syncPresence(deviceId);
  };

  const handleNotification = async (
    deviceId: string,
    request: JsonRpcRequest,
  ) => {
    if (request.method === "device.heartbeat") {
      await opts.db
        .update(devices)
        .set({ lastSeenAt: new Date() })
        .where(eq(devices.id, deviceId));
      return;
    }

    if (request.method === "thread.event") {
      const parsed = threadEventSchema.safeParse(request.params);
      if (!parsed.success) throw new Error("invalid_event");
      await appendThreadEvent(opts.db, opts.env, parsed.data, deviceId);
      return;
    }

    if (request.method === "approval.submit") {
      await handleApprovalSubmit(opts.db, opts.env, deviceId, request.params);
      return;
    }
  };

  const handleMessage = async (deviceId: string, raw: string) => {
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    const responseParsed = jsonRpcResponseSchema.safeParse(msg);
    if (
      responseParsed.success &&
      responseParsed.data.id != null &&
      !(msg && typeof msg === "object" && "method" in msg)
    ) {
      const conn = connections.get(deviceId);
      if (!conn) {
        return;
      }
      const pending = conn.pending.get(responseParsed.data.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      conn.pending.delete(responseParsed.data.id);
      if (responseParsed.data.error) {
        pending.reject(new Error(responseParsed.data.error.message));
        return;
      }
      pending.resolve(responseParsed.data.result);
      return;
    }

    const parsed = jsonRpcRequestSchema.safeParse(msg);
    if (!parsed.success) {
      return;
    }

    const request = parsed.data;

    try {
      await handleNotification(deviceId, request);
      if (request.id !== undefined)
        connections
          .get(deviceId)
          ?.ws.send(JSON.stringify(jsonRpcResult(request.id, { ok: true })));
    } catch (error) {
      if (request.id !== undefined)
        connections
          .get(deviceId)
          ?.ws.send(
            JSON.stringify(jsonRpcError(request.id, -32000, "request_failed")),
          );
      else console.error("Device notification failed", error);
    }
  };

  return {
    attachWebSocket(
      server: Server<typeof IncomingMessage, typeof ServerResponse>,
    ) {
      wss = new WebSocketServer({ noServer: true });

      server.on("upgrade", (req, socket, head) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== "/ws") {
          socket.destroy();
          return;
        }
        wss!.handleUpgrade(req, socket, head, (ws) => {
          void handleConnection(ws);
        });
      });

      async function handleConnection(ws: import("ws").WebSocket) {
        let authenticatedDeviceId: string | null = null;

        let queue = Promise.resolve();
        ws.on("error", () => ws.close());
        ws.on("message", (data) => {
          queue = queue
            .then(async () => {
              if (!authenticatedDeviceId) await handleHello(data.toString());
              else if (connections.get(authenticatedDeviceId)?.ws === ws)
                await handleMessage(authenticatedDeviceId, data.toString());
            })
            .catch((error) => {
              console.error("Device message failed", error);
              ws.close(1011, "internal_error");
            });
        });

        ws.on("close", () => {
          if (authenticatedDeviceId)
            void markOffline(authenticatedDeviceId, ws).catch(console.error);
        });

        async function handleHello(raw: string) {
          let msg: unknown;
          try {
            msg = JSON.parse(raw);
          } catch {
            ws.close(4000, "invalid_json");
            return;
          }

          const parsed = jsonRpcRequestSchema.safeParse(msg);
          if (!parsed.success || parsed.data.method !== "device.hello") {
            ws.close(4001, "hello_required");
            return;
          }

          const hello = z
            .object({
              device_id: z.string().uuid(),
              credential: z.string().min(1),
              capabilities: z.record(z.string(), z.unknown()).optional(),
            })
            .safeParse(parsed.data.params);
          if (!hello.success) {
            ws.send(
              JSON.stringify(
                jsonRpcError(parsed.data.id, -32602, "invalid_params"),
              ),
            );
            ws.close(4002, "invalid_params");
            return;
          }

          const params = hello.data;
          const [device] = await opts.db
            .select()
            .from(devices)
            .where(eq(devices.id, params.device_id))
            .limit(1);

          if (
            !device ||
            !verifyDeviceSecret(params.credential, device.credentialHash)
          ) {
            ws.send(
              JSON.stringify(
                jsonRpcError(parsed.data.id, -32001, "unauthorized"),
              ),
            );
            ws.close(4003, "unauthorized");
            return;
          }

          if (ws.readyState !== ws.OPEN) return;
          const previous = connections.get(device.id);
          previous?.ws.close(4004, "replaced");
          for (const pending of previous?.pending.values() ?? []) {
            clearTimeout(pending.timer);
            pending.reject(new Error("connection_replaced"));
          }
          authenticatedDeviceId = device.id;
          connections.set(device.id, {
            deviceId: device.id,
            ws,
            pending: new Map(),
          });

          await syncPresence(device.id);
          await opts.db
            .update(devices)
            .set({
              lastSeenAt: new Date(),
              capabilities: params.capabilities ?? device.capabilities,
            })
            .where(eq(devices.id, device.id));

          if (ws.readyState !== ws.OPEN) return;
          ws.send(JSON.stringify(jsonRpcResult(parsed.data.id, { ok: true })));
        }
      }
    },

    close() {
      wss?.close();
      connections.clear();
    },

    isOnline(deviceId: string) {
      return connections.has(deviceId);
    },

    call(deviceId, method, params, timeoutMs = 30_000) {
      const conn = connections.get(deviceId);
      if (!conn) {
        return Promise.reject(
          Object.assign(new Error("device_offline"), {
            code: "device_offline",
          }),
        );
      }

      const id = randomUUID();
      const request: JsonRpcRequest = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          conn.pending.delete(id);
          reject(
            Object.assign(new Error("rpc_timeout"), { code: "rpc_timeout" }),
          );
        }, timeoutMs);

        conn.pending.set(id, { resolve, reject, timer });
        conn.ws.send(JSON.stringify(request), (error) => {
          if (!error) return;
          clearTimeout(timer);
          conn.pending.delete(id);
          reject(error);
        });
      });
    },
  };
}
