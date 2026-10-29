#!/usr/bin/env node
/**
 * Mock agentbridge runner for local gateway testing.
 * Implements minimal JSON-RPC over WebSocket.
 */
import WebSocket from "ws";

const gateway = process.env.GATEWAY_URL ?? "ws://localhost:8787/ws";
const deviceId = process.env.DEVICE_ID;
const deviceSecret = process.env.DEVICE_SECRET;

if (!deviceId || !deviceSecret) {
  console.error("Set DEVICE_ID and DEVICE_SECRET from /v1/devices/enroll");
  process.exit(1);
}

const ws = new WebSocket(gateway);
const threads = new Map<string, { seq: number }>();

ws.on("open", () => {
  const id = "hello-1";
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "device.hello",
      params: {
        device_id: deviceId,
        credential: deviceSecret,
        capabilities: { mock: true },
      },
    }),
  );
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString()) as {
    id?: string | number;
    method?: string;
    params?: Record<string, unknown>;
    result?: unknown;
  };

  if (msg.id === "hello-1" && msg.result) {
    console.log("Connected as device", deviceId);
    setInterval(() => {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "device.heartbeat",
          params: {},
        }),
      );
    }, 15_000);
    return;
  }

  if (msg.method && msg.id !== undefined) {
    handleRpc(msg.id, msg.method, msg.params ?? {});
    return;
  }
});

function handleRpc(
  id: string | number,
  method: string,
  params: Record<string, unknown>,
) {
  switch (method) {
    case "thread.spawn": {
      const threadId = String(params.thread_id);
      threads.set(threadId, { seq: 0 });
      reply(id, { thread_id: threadId, status: "running" });
      emitEvent(threadId, "assistant", { text: "mock runner started" });
      break;
    }
    case "thread.send": {
      reply(id, { ok: true });
      emitEvent(String(params.thread_id), "assistant", {
        text: `echo: ${params.input}`,
      });
      break;
    }
    case "thread.kill": {
      reply(id, { ok: true });
      emitEvent(String(params.thread_id), "exit", { code: 0 });
      threads.delete(String(params.thread_id));
      break;
    }
    case "thread.list": {
      reply(
        id,
        [...threads.keys()].map((thread_id) => ({ thread_id, status: "running" })),
      );
      break;
    }
    case "profile.list": {
      reply(id, { profiles: [{ id: "generic", name: "Generic PTY" }] });
      break;
    }
    case "profile.upsert":
    case "profile.delete": {
      reply(id, { ok: true });
      break;
    }
    case "workspace.list_roots": {
      reply(id, { roots: [process.env.HOME ?? "/tmp"] });
      break;
    }
    case "workspace.add_root":
    case "workspace.remove_root": {
      reply(id, { ok: true });
      break;
    }
    case "approval.resolve": {
      reply(id, { ok: true });
      break;
    }
    default:
      reply(id, null, { code: -32601, message: `Method not found: ${method}` });
  }
}

function emitEvent(
  threadId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  const state = threads.get(threadId);
  if (!state) {
    return;
  }
  state.seq += 1;
  ws.send(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "thread.event",
      params: {
        thread_id: threadId,
        seq: state.seq,
        type,
        payload,
      },
    }),
  );
}

function reply(
  id: string | number,
  result: unknown,
  error?: { code: number; message: string },
) {
  ws.send(
    JSON.stringify(
      error
        ? { jsonrpc: "2.0", id, error }
        : { jsonrpc: "2.0", id, result },
    ),
  );
}

ws.on("close", () => {
  console.log("disconnected");
  process.exit(0);
});
