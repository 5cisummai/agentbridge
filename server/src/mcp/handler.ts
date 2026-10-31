import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { requireMcpAuth } from "@better-auth/mcp";
import type { Auth } from "../auth/index.js";
import type { AppDeps } from "../app.js";
import { registerClithreadTools } from "./register-tools.js";
import { toolAuthFromClaims } from "./tool-auth.js";

export function createProtectedMcpHandler(deps: AppDeps & { auth: Auth }) {
  const mcpCore = createMcpHandler(
    ({ authInfo }) => {
      const server = new McpServer({
        name: "clithread",
        version: "0.1.0",
      });

      const claims = (
        authInfo?.extra as { claims?: Record<string, unknown> } | undefined
      )?.claims;
      if (claims) {
        registerClithreadTools(
          server,
          deps,
          toolAuthFromClaims(claims as Record<string, unknown>),
        );
      }

      return server;
    },
    // Temporary: serve 2026-07-28 for modern clients and accept 2025-era
    // initialize traffic (Grok, Cursor, etc.) via per-request stateless fallback.
    // Revisit when those clients negotiate 2026-07-28 by default.
    { legacy: "stateless" },
  );

  return requireMcpAuth(
    deps.auth,
    (request, accessTokenClaims) =>
      mcpCore.fetch(request, {
        authInfo: {
          token: "",
          clientId: String(accessTokenClaims.sub ?? ""),
          scopes: [],
          extra: { claims: accessTokenClaims },
        },
      }),
    { resource: deps.env.MCP_RESOURCE },
  );
}
