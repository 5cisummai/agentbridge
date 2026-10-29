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
  _env: Env,
  db: GatewayDb["db"],
) {
  const existing = await db
    .select()
    .from(authSchema.oauthClient)
    .where(eq(authSchema.oauthClient.clientId, RUNNER_OAUTH_CLIENT_ID))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  await db.insert(authSchema.oauthClient).values({
    id: randomUUID(),
    clientId: RUNNER_OAUTH_CLIENT_ID,
    name: "agentbridge Runner",
    tokenEndpointAuthMethod: "none",
    applicationType: "native",
    grantTypes: JSON.stringify([...RUNNER_OAUTH_GRANTS]),
    scopes: "openid profile offline_access",
    disabled: false,
    public: true,
    type: "native",
  });
}
