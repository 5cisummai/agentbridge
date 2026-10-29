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
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  MAX_THREADS_PER_DEVICE: z.coerce.number().default(8),
  MAX_EVENTS_PER_THREAD: z.coerce.number().default(10_000),
  APPROVAL_TIMEOUT_MS: z.coerce.number().default(15 * 60 * 1000),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) {
    return cached;
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment: ${parsed.error.flatten().fieldErrors}`,
    );
  }
  cached = parsed.data;
  return parsed.data;
}
