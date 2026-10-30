import { oauthClient, oauthClientResource } from "../src/db/auth-schema.js";
import { createAuth } from "../src/auth/index.js";
import { ensureRunnerOAuthClient } from "../src/auth/bootstrap-runner.js";
import { verifyOAuthUserRequest } from "../src/enroll/verify-oauth.js";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb } from "../src/db/client.js";
import { devices, threads, approvals } from "../src/db/schema.js";
import {
  appendThreadEvent,
  listThreadEvents,
} from "../src/services/thread-events.js";
import {
  decideApproval,
  deliverApprovalDecisions,
  handleApprovalSubmit,
} from "../src/services/approvals.js";
import { resolveApprovalTimeouts } from "../src/services/approval-timeout.js";
import { createHubRegistry } from "../src/hub/registry.js";
import { hashDeviceSecret } from "../src/services/devices.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Env } from "../src/env.js";

const url = process.env.REVIEW_DATABASE_URL;
const env: Env = {
  DATABASE_URL: url ?? "postgres://unused:unused@127.0.0.1:1/unused",
  NODE_ENV: "test",
  PORT: 8787,
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:8787",
  MCP_RESOURCE: "http://localhost:8787/mcp",
  MAX_THREADS_PER_DEVICE: 8,
  MAX_EVENTS_PER_THREAD: 3,
  APPROVAL_TIMEOUT_MS: 900000,
};
it("consent posts the intact signed query and handles provider redirect", () => {
  const webRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../web/src/pages",
  );
  const consent = readFileSync(path.join(webRoot, "Consent.tsx"), "utf8");
  const passwordForm = readFileSync(
    path.join(webRoot, "../components/auth/password-form.tsx"),
    "utf8",
  );
  expect(consent).toContain('fetch("/api/auth/oauth2/consent"');
  expect(consent).toContain("oauth_query: oauthQuery");
  expect(consent).toContain("/api/auth/oauth2/public-client?client_id=");
  expect(consent).toContain("location.href = data.url");
  expect(passwordForm).toContain("oauth_query: location.search.slice(1)");
});

describe.skipIf(!url)("review regressions with isolated PostgreSQL", () => {
  const gatewayDb = createDb(env);
  const db = gatewayDb.db;
  const owner = randomUUID();
  let deviceId: string;
  let threadId: string;
  const hub = createHubRegistry({ db, env });
  const server = createServer();
  let address: string;
  beforeAll(async () => {
    [{ id: deviceId }] = await db
      .insert(devices)
      .values({
        ownerUserId: owner,
        name: "test",
        credentialHash: hashDeviceSecret("secret"),
      })
      .returning();
    [{ id: threadId }] = await db
      .insert(threads)
      .values({ deviceId, ownerUserId: owner, profile: "generic", cwd: "/tmp" })
      .returning();
    hub.attachWebSocket(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    address = `ws://127.0.0.1:${(server.address() as { port: number }).port}/ws`;
  });
  afterAll(async () => {
    hub.close();
    server.close();
    await db.delete(devices).where(eq(devices.id, deviceId));
    await gatewayDb.client.end();
  });
  it("contains missing and malformed hello without DB access", async () => {
    for (const params of [
      undefined,
      null,
      [],
      { device_id: deviceId, credential: 5 },
    ]) {
      const ws = new WebSocket(address);
      await once(ws, "open");
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "device.hello",
          params,
        }),
      );
      const [data] = await once(ws, "message");
      expect(JSON.parse(data.toString()).error.message).toBe("invalid_params");
      await once(ws, "close");
    }
  });
  it("assigns monotonic cursors, dedupes replays after trim, rejects foreign device, saves raw and exit", async () => {
    const event = {
      thread_id: threadId,
      seq: 0,
      type: "assistant",
      payload: { text: "hello" },
      raw: "raw hello",
    };
    await expect(
      appendThreadEvent(db, env, event, randomUUID()),
    ).rejects.toThrow("thread_not_found");
    await appendThreadEvent(db, env, event, deviceId);
    const approvalId = randomUUID();
    await handleApprovalSubmit(db, env, deviceId, {
      thread_id: threadId,
      approval_id: approvalId,
      prompt: "approve?",
    });
    await handleApprovalSubmit(db, env, deviceId, {
      thread_id: threadId,
      approval_id: approvalId,
      prompt: "approve?",
    });
    expect(await listThreadEvents(db, threadId, 0, false)).toHaveLength(1);
    await appendThreadEvent(db, env, {
      ...event,
      type: "approval_timeout",
      payload: { approval_id: approvalId },
    });
    await appendThreadEvent(db, env, { ...event, seq: 1 }, deviceId);
    await appendThreadEvent(db, env, event, deviceId);
    let rows = await listThreadEvents(db, threadId, 0, true);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(rows[0]).toHaveProperty("raw", "raw hello");
    expect(await listThreadEvents(db, threadId, 0, false)).not.toContainEqual(
      expect.objectContaining({ raw: "raw hello" }),
    );
    expect(rows[0].payload).not.toHaveProperty("raw");
    await appendThreadEvent(
      db,
      env,
      { ...event, seq: 2, type: "exit" },
      deviceId,
    );
    await appendThreadEvent(db, env, event, deviceId);
    rows = await listThreadEvents(db, threadId, 0, false);
    expect(rows.map((r) => r.seq)).toEqual([2, 3, 4]);
    const [thread] = await db
      .select()
      .from(threads)
      .where(eq(threads.id, threadId));
    expect(thread.status).toBe("exited");
    expect(thread.exitedAt).toBeInstanceOf(Date);
  });
  it("claims decisions atomically and retries failed/offline delivery including timeout", async () => {
    const [a] = await db
      .insert(approvals)
      .values({
        threadId,
        deviceId,
        prompt: "ok?",
        expiresAt: new Date(Date.now() + 100000),
      })
      .returning();
    const outcomes = await Promise.all([
      decideApproval(db, a.id, "approved"),
      decideApproval(db, a.id, "denied"),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    await deliverApprovalDecisions(db, {
      call: async () => {
        throw new Error("offline");
      },
    });
    expect(
      (await db.select().from(approvals).where(eq(approvals.id, a.id)))[0]
        .deliveredAt,
    ).toBeNull();
    let calls = 0;
    await deliverApprovalDecisions(db, {
      call: async () => {
        calls++;
        return {};
      },
    });
    expect(calls).toBe(1);
    await deliverApprovalDecisions(db, {
      call: async () => {
        throw new Error("must not retry delivered");
      },
    });
    const [expired] = await db
      .insert(approvals)
      .values({ threadId, deviceId, prompt: "late?", expiresAt: new Date(0) })
      .returning();
    expect(await decideApproval(db, expired.id, "approved")).toBeUndefined();
    const deps = {
      gatewayDb,
      env,
      hub: { call: async () => ({}) },
    } as unknown as Parameters<typeof resolveApprovalTimeouts>[0];
    await Promise.all([
      resolveApprovalTimeouts(deps),
      resolveApprovalTimeouts(deps),
    ]);
    expect(
      (await db.select().from(approvals).where(eq(approvals.id, expired.id)))[0]
        .status,
    ).toBe("timeout");
    expect(
      (await listThreadEvents(db, threadId, 0, false)).filter(
        (e) =>
          e.type === "approval_timeout" && e.payload.approval_id === expired.id,
      ),
    ).toHaveLength(1);
  });
  it("issues resource-bound device OAuth tokens accepted for enrollment", async () => {
    const auth = createAuth(env, gatewayDb);
    await ensureRunnerOAuthClient(auth, env, db);
    const request = (path: string, body: unknown, cookie?: string) =>
      auth.handler(
        new Request(`${env.BETTER_AUTH_URL}/api/auth${path}`, {
          method: "POST",
          headers: {
            "content-type":
              path === "/oauth2/token"
                ? "application/x-www-form-urlencoded"
                : "application/json",
            origin: env.BETTER_AUTH_URL,
            ...(cookie ? { cookie } : {}),
          },
          body:
            path === "/oauth2/token"
              ? new URLSearchParams(body as Record<string, string>)
              : JSON.stringify(body),
        }),
      );
    const email = `review-${randomUUID()}@example.com`;
    const signed = await request("/sign-up/email", {
      name: "Review",
      email,
      password: "review-password-123!",
    });
    expect(signed.status).toBe(200);
    const signup = await signed.json();
    const cookie = signed.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    try {
      const code = await request("/device/code", {
        client_id: "agentbridge-runner",
        scope: "openid profile offline_access",
        resource: env.MCP_RESOURCE,
      });
      const device = await code.json();
      expect(code.status, JSON.stringify(device)).toBe(200);
      const verified = await auth.handler(
        new Request(
          `${env.BETTER_AUTH_URL}/api/auth/device?user_code=${device.user_code}`,
          { headers: { cookie } },
        ),
      );
      expect(verified.status, await verified.clone().text()).toBe(200);
      const approved = await request(
        "/device/approve",
        { userCode: device.user_code },
        cookie,
      );
      expect(approved.status, await approved.clone().text()).toBe(200);
      const token = await request("/oauth2/token", {
        client_id: "agentbridge-runner",
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: device.device_code,
        resource: env.MCP_RESOURCE,
      });
      const tokens = await token.json();
      expect(token.status, JSON.stringify(tokens)).toBe(200);
      const claims = JSON.parse(
        Buffer.from(tokens.access_token.split(".")[1], "base64url").toString(),
      );
      expect([claims.aud].flat()).toContain(env.MCP_RESOURCE);
      const clientId = `review-consent-${randomUUID()}`;
      await db.insert(oauthClient).values({
        id: randomUUID(),
        clientId,
        name: "Consent test",
        userId: signup.user.id,
        tokenEndpointAuthMethod: "none",
        applicationType: "native",
        grantTypes: ["authorization_code"],
        responseTypes: ["code"],
        scopes: ["openid", "profile"],
        redirectUris: ["http://127.0.0.1/callback"],
      });
      await db
        .insert(oauthClientResource)
        .values({ id: randomUUID(), clientId, resourceId: env.MCP_RESOURCE });
      try {
        const query = new URLSearchParams({
          client_id: clientId,
          response_type: "code",
          scope: "openid profile",
          redirect_uri: "http://127.0.0.1/callback",
          resource: env.MCP_RESOURCE,
          code_challenge: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          code_challenge_method: "S256",
          state: "review-state",
        });
        const authorization = await auth.handler(
          new Request(
            `${env.BETTER_AUTH_URL}/api/auth/oauth2/authorize?${query}`,
          ),
        );
        expect(authorization.status, await authorization.clone().text()).toBe(
          302,
        );
        const loginUrl = new URL(
          authorization.headers.get("location")!,
          env.BETTER_AUTH_URL,
        );
        expect(loginUrl.pathname).toBe("/sign-in");
        expect(loginUrl.searchParams.has("sig")).toBe(true);
        const resumed = await request("/sign-in/email", {
          email,
          password: "review-password-123!",
          oauth_query: loginUrl.search.slice(1),
        });
        const resumedData = await resumed.json();
        expect(resumed.status, JSON.stringify(resumedData)).toBe(200);
        const consentUrl = new URL(resumedData.url, env.BETTER_AUTH_URL);
        expect(consentUrl.pathname).toBe("/consent");
        expect(consentUrl.searchParams.has("sig")).toBe(true);
        const consent = await request(
          "/oauth2/consent",
          { accept: true, oauth_query: consentUrl.search.slice(1) },
          cookie,
        );
        const consentResult = await consent.json();
        expect(consent.status, JSON.stringify(consentResult)).toBe(200);
        const callback = new URL(consentResult.url);
        expect(callback.searchParams.get("state")).toBe("review-state");
        expect(callback.searchParams.has("code")).toBe(true);
      } finally {
        await db.delete(oauthClient).where(eq(oauthClient.clientId, clientId));
      }
      const originalFetch = globalThis.fetch;
      vi.stubGlobal(
        "fetch",
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const req =
            input instanceof Request ? input : new Request(input, init);
          if (req.url.startsWith(`${env.BETTER_AUTH_URL}/api/auth/`))
            return auth.handler(req);
          return originalFetch(input, init);
        },
      );
      const enrollment = new Request(
        `${env.BETTER_AUTH_URL}/v1/devices/enroll`,
        { headers: { authorization: `Bearer ${tokens.access_token}` } },
      );
      expect(await verifyOAuthUserRequest(auth, env, enrollment)).toEqual({
        userId: signup.user.id,
      });
      expect(
        await verifyOAuthUserRequest(
          auth,
          { ...env, MCP_RESOURCE: `${env.MCP_RESOURCE}/wrong` },
          enrollment,
        ),
      ).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("keeps a replacement socket online and ACKs durable event RPC replay", async () => {
    async function connect() {
      const ws = new WebSocket(address);
      await once(ws, "open");
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "hello",
          method: "device.hello",
          params: { device_id: deviceId, credential: "secret" },
        }),
      );
      await once(ws, "message");
      return ws;
    }
    const first = await connect();
    const closed = once(first, "close");
    const second = await connect();
    await closed;
    expect(hub.isOnline(deviceId)).toBe(true);
    const event = {
      thread_id: threadId,
      seq: 3,
      type: "assistant",
      payload: { text: "ack" },
    };
    for (let n = 0; n < 2; n++) {
      second.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "event",
          method: "thread.event",
          params: event,
        }),
      );
      const [data] = await once(second, "message");
      expect(JSON.parse(data.toString()).result).toEqual({ ok: true });
    }
    const rows = await listThreadEvents(db, threadId, 0, false);
    expect(rows.filter((e) => e.payload.text === "ack")).toHaveLength(1);
    second.close();
    await once(second, "close");
  });
});
