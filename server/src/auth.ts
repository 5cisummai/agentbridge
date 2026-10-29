import { loadEnv } from "./env.js";
import { createDb } from "./db/client.js";
import { createAuth } from "./auth/index.js";

const env = loadEnv();
const gatewayDb = createDb(env);

/** Default export for Better Auth CLI (`auth generate`). */
export const auth = createAuth(env, gatewayDb);
