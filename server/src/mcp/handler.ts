import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { requireMcpAuth } from "@better-auth/mcp";
import type { Auth } from "../auth/index.js";
import type { AppDeps } from "../app.js";
import { registerAgentbridgeTools } from "./register-tools.js";
import { toolAuthFromClaims } from "./tool-auth.js";

export function createProtectedMcpHandler(deps: AppDeps & { auth: Auth }) {
  const mcpCore = createMcpHandler(
    ({ authInfo }) => {
      const server = new McpServer({
        name: "agentbridge",
        version: "0.1.0",
      });

      const claims = (
        authInfo?.extra as { claims?: Record<string, unknown> } | undefined
      )?.claims;
      if (claims) {
        registerAgentbridgeTools(
          server,
          deps,
          toolAuthFromClaims(claims as Record<string, unknown>),
        );
      }

      return server;
    },
    { legacy: "reject" },
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
