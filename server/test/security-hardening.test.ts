import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/env.js";
import { enrollmentBodySchema } from "../src/enroll/exchange.js";
import { hasScope } from "../src/mcp/scopes.js";

function baseEnv() {
  return {
    DATABASE_URL:
      "postgres://agentbridge:agentbridge@localhost:5432/agentbridge",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:8787",
    MCP_RESOURCE: "http://localhost:8787/mcp",
  };
}

describe("production security configuration", () => {
  it("requires Resend in production", () => {
    expect(() => parseEnv({ ...baseEnv(), NODE_ENV: "production" })).toThrow(
      "RESEND_API_KEY is required",
    );
  });

  it("accepts production configuration with Resend", () => {
    expect(
      parseEnv({
        ...baseEnv(),
        NODE_ENV: "production",
        RESEND_API_KEY: "re_test_key",
      }).NODE_ENV,
    ).toBe("production");
  });

  it("accepts split frontend and API origins", () => {
    const env = parseEnv({
      ...baseEnv(),
      NODE_ENV: "production",
      RESEND_API_KEY: "re_test_key",
      BETTER_AUTH_URL: "https://api.clithread.dev",
      MCP_RESOURCE: "https://api.clithread.dev/mcp",
      WEB_ORIGIN: "https://clithread.dev",
      AUTH_COOKIE_DOMAIN: ".clithread.dev",
    });
    expect(env.WEB_ORIGIN).toBe("https://clithread.dev");
    expect(env.AUTH_COOKIE_DOMAIN).toBe(".clithread.dev");
  });
});

describe("enrollment authorization and input", () => {
  it("requires the device enrollment scope", () => {
    expect(hasScope("openid profile", "agentbridge:devices")).toBe(false);
    expect(hasScope("openid agentbridge:devices", "agentbridge:devices")).toBe(
      true,
    );
  });

  it("rejects empty, oversized, and malformed enrollment data", () => {
    expect(enrollmentBodySchema.safeParse({ device_name: "" }).success).toBe(
      false,
    );
    expect(
      enrollmentBodySchema.safeParse({
        device_name: "runner",
        capabilities: { payload: "x".repeat(32 * 1024) },
      }).success,
    ).toBe(false);
    expect(
      enrollmentBodySchema.safeParse({
        device_name: "runner",
        capabilities: ["not", "an", "object"],
      }).success,
    ).toBe(false);
  });
});
