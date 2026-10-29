import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../env.js";
import * as authSchema from "./auth-schema.js";
import * as gatewaySchema from "./schema.js";

const fullSchema = { ...gatewaySchema, ...authSchema };

export type GatewayDb = ReturnType<typeof createDb>;

export function createDb(env: Env) {
  const client = postgres(env.DATABASE_URL, { max: 10 });
  const db = drizzle(client, { schema: fullSchema });
  return { db, client, schema: fullSchema };
}
