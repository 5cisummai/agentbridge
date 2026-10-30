import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { mcp } from "@better-auth/mcp";
import {
  DEVICE_CODE_GRANT_TYPE,
  oauthDeviceAuthorization,
} from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import type { GatewayDb } from "../db/client.js";
import * as authSchema from "../db/auth-schema.js";
import type { Env } from "../env.js";
import { sendVerificationEmail } from "./email/send-verification.js";
import { buildAuthRateLimit } from "./rate-limit.js";
import { buildSocialProviders } from "./social-providers.js";

export const AGENTBRIDGE_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "agentbridge:devices",
  "agentbridge:threads",
  "agentbridge:profiles",
  "agentbridge:approvals",
  "agentbridge:admin",
] as const;

export function createAuth(env: Env, gatewayDb: GatewayDb) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(gatewayDb.db, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        // Fire-and-forget to avoid timing attacks (Better Auth guidance).
        void sendVerificationEmail(env, {
          email: user.email,
          name: user.name,
          url,
        });
      },
    },
    socialProviders: buildSocialProviders(env),
    rateLimit: buildAuthRateLimit(env),
    advanced: {
      database: {
        joins: false,
      },
    },
    plugins: [
      jwt(),
      mcp({
        loginPage: "/sign-in",
        consentPage: "/consent",
        resource: env.MCP_RESOURCE,
        scopes: [...AGENTBRIDGE_SCOPES],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
        clientRegistrationDefaultResources: [env.MCP_RESOURCE],
        resources: [
          {
            identifier: env.MCP_RESOURCE,
            allowedScopes: [...AGENTBRIDGE_SCOPES],
          },
        ],
      }),
      cimd({
        fetchClientMetadataResource,
        metadataProfile: "mcp-2026-07-28",
      }),
      oauthDeviceAuthorization({
        verificationUri: "/device",
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export const RUNNER_OAUTH_CLIENT_ID = "agentbridge-runner";

export const RUNNER_OAUTH_GRANTS = [
  DEVICE_CODE_GRANT_TYPE,
  "refresh_token",
] as const;
