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
  attachWebSocket: (server: Server<typeof IncomingMessage, typeof ServerResponse>) => void;
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

  const markOffline = async (deviceId: string) => {
    connections.delete(deviceId);
    await opts.db
      .update(devices)
      .set({ online: false })
      .where(eq(devices.id, deviceId));
  };

  const handleNotification = async (
    deviceId: string,
    request: JsonRpcRequest,
  ) => {
    if (request.method === "device.heartbeat") {
      await opts.db
        .update(devices)
        .set({ lastSeenAt: new Date(), online: true })
        .where(eq(devices.id, deviceId));
      return;
    }

    if (request.method === "thread.event") {
      const parsed = threadEventSchema.safeParse(request.params);
      if (parsed.success) {
        await appendThreadEvent(opts.db, opts.env, parsed.data);
      }
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
    if (responseParsed.success && responseParsed.data.id != null) {
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

    if (request.id === undefined) {
      await handleNotification(deviceId, request);
    }
  };

  return {
    attachWebSocket(server: Server<typeof IncomingMessage, typeof ServerResponse>) {
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

        ws.on("message", (data) => {
          const text = data.toString();
          if (!authenticatedDeviceId) {
            void handleHello(text);
            return;
          }
          void handleMessage(authenticatedDeviceId, text);
        });

        ws.on("close", () => {
          if (authenticatedDeviceId) {
            void markOffline(authenticatedDeviceId);
          }
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

          const params = parsed.data.params as {
            device_id?: string;
            credential?: string;
            name?: string;
            capabilities?: Record<string, unknown>;
          };

          if (!params.device_id || !params.credential) {
            ws.send(
              JSON.stringify(
                jsonRpcError(parsed.data.id, -32602, "invalid_params"),
              ),
            );
            ws.close(4002, "invalid_params");
            return;
          }

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
              JSON.stringify(jsonRpcError(parsed.data.id, -32001, "unauthorized")),
            );
            ws.close(4003, "unauthorized");
            return;
          }

          authenticatedDeviceId = device.id;
          connections.set(device.id, {
            deviceId: device.id,
            ws,
            pending: new Map(),
          });

          await opts.db
            .update(devices)
            .set({
              online: true,
              lastSeenAt: new Date(),
              capabilities: params.capabilities ?? device.capabilities,
            })
            .where(eq(devices.id, device.id));

          ws.send(
            JSON.stringify(jsonRpcResult(parsed.data.id, { ok: true })),
          );
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
          Object.assign(new Error("device_offline"), { code: "device_offline" }),
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
          reject(Object.assign(new Error("rpc_timeout"), { code: "rpc_timeout" }));
        }, timeoutMs);

        conn.pending.set(id, { resolve, reject, timer });
        conn.ws.send(JSON.stringify(request));
      });
    },
  };
}
