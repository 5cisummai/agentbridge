import type { Env } from "../env.js";

export function buildAuthRateLimit(env: Env) {
  return {
    enabled: env.NODE_ENV !== "test",
    storage: "database" as const,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": {
        window: 10,
        max: 5,
      },
      "/sign-up/email": {
        window: 60,
        max: 5,
      },
      "/send-verification-email": {
        window: 60,
        max: 3,
      },
      "/forget-password": {
        window: 60,
        max: 3,
      },
    },
  };
}
