import { describe, expect, it } from "vitest";
import { consume } from "../src/http/ip-rate-limit.js";

describe("consume", () => {
  it("allows requests under the limit within a window", () => {
    const store = new Map();
    const now = 1_000_000;
    expect(consume(store, "1.2.3.4", now, 60_000, 3)).toEqual({
      allowed: true,
    });
    expect(consume(store, "1.2.3.4", now + 1, 60_000, 3)).toEqual({
      allowed: true,
    });
    expect(consume(store, "1.2.3.4", now + 2, 60_000, 3)).toEqual({
      allowed: true,
    });
  });

  it("blocks when the limit is exceeded", () => {
    const store = new Map();
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(consume(store, "1.2.3.4", now + i, 60_000, 3).allowed).toBe(
        true,
      );
    }
    const blocked = consume(store, "1.2.3.4", now + 3, 60_000, 3);
    expect(blocked).toEqual({ allowed: false, retryAfterSec: 60 });
  });

  it("resets the window after it expires", () => {
    const store = new Map();
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      consume(store, "1.2.3.4", now + i, 60_000, 3);
    }
    expect(
      consume(store, "1.2.3.4", now + 60_000, 60_000, 3).allowed,
    ).toBe(true);
  });
});
