import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import type { Auth } from "../auth/index.js";
import type { Env } from "../env.js";

export async function verifyOAuthUserRequest(
  auth: Auth,
  env: Env,
  request: Request,
): Promise<{ userId: string } | null> {
  const { baseURL } = await auth.$context;
  if (!baseURL) {
    return null;
  }

  let userId: string | null = null;

  const handler = createMcpProtectedRequestHandler(
    {
      issuer: baseURL,
      audience: env.MCP_RESOURCE,
      jwksUrl: `${baseURL}/jwks`,
    },
    async (_req, accessTokenClaims) => {
      if (typeof accessTokenClaims.sub === "string") {
        userId = accessTokenClaims.sub;
      }
      return new Response("ok");
    },
  );

  const response = await handler(request);
  if (response.status === 401 || response.status === 403 || !userId) {
    return null;
  }

  return { userId };
}
