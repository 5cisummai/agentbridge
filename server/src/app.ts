import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Auth } from "./auth/index.js";
import type { GatewayDb } from "./db/client.js";
import type { Env } from "./env.js";
import type { HubRegistry } from "./hub/registry.js";
import { enrollDevice } from "./enroll/exchange.js";
import { createProtectedMcpHandler } from "./mcp/handler.js";
import { mountWebApp } from "./web.js";

export type AppDeps = {
  env: Env;
  gatewayDb: GatewayDb;
  hub: HubRegistry;
  auth: Auth;
};

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: deps.env.BETTER_AUTH_URL,
      credentials: true,
    }),
  );

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.all("/api/auth/*", (c) => deps.auth.handler(c.req.raw));

  app.post("/v1/devices/enroll", async (c) => {
    const body = await c.req.json<{
      device_name: string;
      capabilities?: Record<string, unknown>;
    }>();
    return enrollDevice(
      deps.auth,
      deps.env,
      deps.gatewayDb.db,
      c.req.raw,
      body,
    );
  });

  const mcpHandler = createProtectedMcpHandler(deps);
  app.post("/mcp", async (c) => mcpHandler(c.req.raw));

  mountWebApp(app);

  return app;
}
