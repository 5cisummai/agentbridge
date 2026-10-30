import { z } from "zod/v4";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(8787),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  MCP_RESOURCE: z.string().url(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Production opt-in for public MCP client dynamic registration. */
  ALLOW_UNAUTHENTICATED_CLIENT_REGISTRATION: z
    .enum(["true", "false"])
    .optional(),
  /** Resend API key; omit (or leave empty) in local/dev to log verification links. */
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default("agentbridge <onboarding@resend.dev>"),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  MAX_THREADS_PER_DEVICE: z.coerce.number().default(8),
  MAX_EVENTS_PER_THREAD: z.coerce.number().default(10_000),
  APPROVAL_TIMEOUT_MS: z.coerce.number().default(15 * 60 * 1000),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.flatten().fieldErrors}`,
    );
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    !parsed.data.RESEND_API_KEY?.trim()
  ) {
    throw new Error(
      "RESEND_API_KEY is required when NODE_ENV=production; refusing to log verification URLs",
    );
  }
  return parsed.data;
}

export function loadEnv(): Env {
  if (cached) {
    return cached;
  }
  cached = parseEnv(process.env);
  return cached;
}
