import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppDeps } from "../src/app.js";

function mockDeps(): AppDeps {
  return {
    env: {
      NODE_ENV: "test",
      PORT: 8787,
      DATABASE_URL: "postgres://localhost/test",
      BETTER_AUTH_SECRET: "x".repeat(32),
      BETTER_AUTH_URL: "http://localhost:8787",
      MCP_RESOURCE: "http://localhost:8787/mcp",
      MAX_THREADS_PER_DEVICE: 8,
      MAX_EVENTS_PER_THREAD: 10_000,
      APPROVAL_TIMEOUT_MS: 900_000,
    },
    gatewayDb: {} as AppDeps["gatewayDb"],
    hub: {
      attachWebSocket: () => {},
      close: () => {},
      call: async () => ({}),
      isOnline: () => false,
    },
    auth: {
      handler: async () =>
        new Response(JSON.stringify({ resource: "http://localhost:8787/mcp" }), {
          headers: { "content-type": "application/json" },
        }),
    } as AppDeps["auth"],
  };
}

describe("healthz", () => {
  it("returns ok", async () => {
    const app = createApp(mockDeps());
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("forwards MCP protected-resource metadata to Better Auth", async () => {
    const app = createApp(mockDeps());
    const res = await app.request(
      "/.well-known/oauth-protected-resource/mcp",
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      resource: "http://localhost:8787/mcp",
    });
  });
});
