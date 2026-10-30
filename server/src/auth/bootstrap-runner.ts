import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Auth } from "../auth/index.js";
import type { Env } from "../env.js";
import type { GatewayDb } from "../db/client.js";
import * as authSchema from "../db/auth-schema.js";
import {
  RUNNER_OAUTH_CLIENT_ID,
  RUNNER_OAUTH_GRANTS,
} from "../auth/index.js";

/** Ensures the public runner OAuth client exists for RFC 8628 enroll. */
export async function ensureRunnerOAuthClient(
  _auth: Auth,
  env: Env,
  db: GatewayDb["db"],
) {
  const existing = await db
    .select()
    .from(authSchema.oauthClient)
    .where(eq(authSchema.oauthClient.clientId, RUNNER_OAUTH_CLIENT_ID))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(authSchema.oauthClient).values({
      id: randomUUID(),
      clientId: RUNNER_OAUTH_CLIENT_ID,
      name: "agentbridge Runner",
      tokenEndpointAuthMethod: "none",
      applicationType: "native",
      grantTypes: [...RUNNER_OAUTH_GRANTS],
      scopes: ["openid", "profile", "offline_access"],
      disabled: false,
      public: true,
      type: "native",
    });
  }
  await db.insert(authSchema.oauthResource).values({
    id: randomUUID(), identifier: env.MCP_RESOURCE, name: "agentbridge MCP",
    allowedScopes: ["openid", "profile", "offline_access", "agentbridge:devices", "agentbridge:threads", "agentbridge:profiles", "agentbridge:approvals", "agentbridge:admin"],
  }).onConflictDoNothing();
  await db.insert(authSchema.oauthClientResource).values({
    id: randomUUID(), clientId: RUNNER_OAUTH_CLIENT_ID, resourceId: env.MCP_RESOURCE,
  }).onConflictDoNothing();
}
