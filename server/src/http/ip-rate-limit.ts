import type { Context, MiddlewareHandler } from "hono";

type WindowRecord = {
  count: number;
  resetAt: number;
};

export type IpRateLimitOptions = {
  windowMs: number;
  limit: number;
  message?: string;
};

const MAX_STORE_ENTRIES = 10_000;

export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function createIpRateLimit(
  options: IpRateLimitOptions,
): MiddlewareHandler {
  const store = new Map<string, WindowRecord>();
  const { windowMs, limit } = options;
  const message = options.message ?? "Too many requests";

  return async (c, next) => {
    const now = Date.now();
    const key = clientIp(c);
    const result = consume(store, key, now, windowMs, limit);

    if (!result.allowed) {
      c.header("Retry-After", String(result.retryAfterSec));
      return c.json({ message }, 429);
    }

    await next();
  };
}

export function consume(
  store: Map<string, WindowRecord>,
  key: string,
  now: number,
  windowMs: number,
  limit: number,
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  pruneExpired(store, now);

  let record = store.get(key);
  if (!record || now >= record.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (record.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((record.resetAt - now) / 1000)),
    };
  }

  record.count += 1;
  return { allowed: true };
}

function pruneExpired(store: Map<string, WindowRecord>, now: number) {
  if (store.size <= MAX_STORE_ENTRIES) return;
  for (const [key, record] of store) {
    if (now >= record.resetAt) store.delete(key);
  }
}

/** In-memory IP limits for non-auth gateway routes (single-process). */
export const enrollRateLimit = createIpRateLimit({
  windowMs: 60_000,
  limit: 20,
  message: "Too many enrollment attempts. Try again later.",
});

export const mcpRateLimit = createIpRateLimit({
  windowMs: 60_000,
  limit: 120,
  message: "Too many MCP requests. Try again later.",
});
