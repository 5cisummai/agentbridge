import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Auth } from "./auth/index.js";
import type { GatewayDb } from "./db/client.js";
import type { Env } from "./env.js";
import type { HubRegistry } from "./hub/registry.js";
import { enabledSocialProviders } from "./auth/social-providers.js";
import {
  enrollDevice,
  MAX_ENROLLMENT_BODY_BYTES,
} from "./enroll/exchange.js";
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

  app.get("/v1/auth-providers", (c) => {
    const providers = enabledSocialProviders(deps.env);
    return c.json({
      google: providers.includes("google"),
      github: providers.includes("github"),
    });
  });

  app.all("/api/auth/*", (c) => deps.auth.handler(c.req.raw));

  app.post("/v1/devices/enroll", async (c) => {
    const contentLength = Number(c.req.header("content-length") ?? 0);
    if (contentLength > MAX_ENROLLMENT_BODY_BYTES) {
      return c.json({ error: "request_too_large" }, 413);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }

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
