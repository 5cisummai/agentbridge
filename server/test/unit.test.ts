import { describe, expect, it } from "vitest";
import {
  hashDeviceSecret,
  verifyDeviceSecret,
} from "../src/services/devices.js";
import { parseScopeClaim, hasScope } from "../src/mcp/scopes.js";
import {
  jsonRpcRequestSchema,
  jsonRpcResult,
} from "../src/protocol/rpc.js";

describe("devices", () => {
  it("hashes and verifies secrets", () => {
    const secret = "test-secret-value";
    const hash = hashDeviceSecret(secret);
    expect(verifyDeviceSecret(secret, hash)).toBe(true);
    expect(verifyDeviceSecret("wrong", hash)).toBe(false);
  });
});

describe("scopes", () => {
  it("parses scope strings", () => {
    const scopes = parseScopeClaim("openid agentbridge:threads");
    expect(hasScope([...scopes], "agentbridge:threads")).toBe(true);
    expect(hasScope([...scopes], "agentbridge:admin")).toBe(false);
  });
});

describe("protocol", () => {
  it("round-trips json rpc", () => {
    const req = jsonRpcRequestSchema.parse({
      jsonrpc: "2.0",
      id: 1,
      method: "thread.spawn",
      params: { profile: "generic" },
    });
    const res = jsonRpcResult(req.id, { ok: true });
    expect(res.result).toEqual({ ok: true });
  });
});
