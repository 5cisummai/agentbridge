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

// Keep the existing agentbridge scope identifiers stable for already-issued
// tokens and enrolled clients while the product is rebranded to clithread.
export const CLITHREAD_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "agentbridge:devices",
  "agentbridge:threads",
  "agentbridge:profiles",
  "agentbridge:approvals",
  "agentbridge:admin",
] as const;

export const DEVICE_ENROLL_SCOPE = "agentbridge:devices";

function uiPath(env: Env, path: string): string {
  const origin = env.WEB_ORIGIN?.replace(/\/$/, "");
  return origin ? `${origin}${path}` : path;
}

export function createAuth(env: Env, gatewayDb: GatewayDb) {
  const trustedOrigins = Array.from(
    new Set(
      [env.BETTER_AUTH_URL, env.WEB_ORIGIN].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins,
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
        }).catch((error: unknown) => {
          console.error(
            "[auth] verification email delivery failed",
            error instanceof Error ? error.message : "unknown error",
          );
        });
      },
    },
    socialProviders: buildSocialProviders(env),
    rateLimit: buildAuthRateLimit(env),
    advanced: {
      database: {
        joins: false,
      },
      ipAddress: {
        ipAddressHeaders:
          env.NODE_ENV === "production"
            ? ["cf-connecting-ip", "x-forwarded-for"]
            : ["x-forwarded-for"],
      },
      ...(env.AUTH_COOKIE_DOMAIN
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: env.AUTH_COOKIE_DOMAIN,
            },
          }
        : {}),
    },
    plugins: [
      jwt(),
      mcp({
        loginPage: uiPath(env, "/sign-in"),
        consentPage: uiPath(env, "/consent"),
        resource: env.MCP_RESOURCE,
        scopes: [...CLITHREAD_SCOPES],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration:
          env.NODE_ENV !== "production" ||
          env.ALLOW_UNAUTHENTICATED_CLIENT_REGISTRATION === "true",
        clientRegistrationDefaultApplicationType: "infer",
        clientRegistrationDefaultResources: [env.MCP_RESOURCE],
        resources: [
          {
            identifier: env.MCP_RESOURCE,
            allowedScopes: [...CLITHREAD_SCOPES],
          },
        ],
      }),
      cimd({
        fetchClientMetadataResource,
        metadataProfile: "mcp-2026-07-28",
      }),
      oauthDeviceAuthorization({
        verificationUri: uiPath(env, "/device"),
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
