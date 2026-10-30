import { decideApproval, deliverApprovalDecisions } from "../services/approvals.js";
import { McpServer } from "@modelcontextprotocol/server";
import { and, desc, eq } from "drizzle-orm";
import * as z from "zod/v4";
import type { Auth } from "../auth/index.js";
import type { AppDeps } from "../app.js";
import { approvals, devices, threads, userDefaults } from "../db/schema.js";
import { writeAudit } from "../services/audit.js";
import {
  getDeviceForUser,
  resolveDeviceId,
} from "../services/devices.js";
import {
  countRunningThreadsOnDevice,
  listThreadEvents,
} from "../services/thread-events.js";
import { resolveApprovalTimeouts } from "../services/approval-timeout.js";
import {
  AGENTBRIDGE_SCOPES,
  mcpTextResult,
  requireScopes,
  type ToolAuth,
} from "./tool-auth.js";

const deviceIdShape = {
  device_id: z.string().uuid().optional(),
  device_name: z.string().optional(),
};

export function registerAgentbridgeTools(
  server: McpServer,
  deps: AppDeps & { auth: Auth },
  toolAuth: ToolAuth,
) {
  const { gatewayDb, hub, env } = deps;
  const db = gatewayDb.db;
  const userId = toolAuth.userId;

  server.registerTool(
    "echo",
    {
      description: "Health check for MCP connectivity",
      inputSchema: {
        message: z.string().optional(),
      },
    },
    async ({ message }) =>
      mcpTextResult({ echo: message ?? "ok", sub: userId }),
  );

  server.registerTool(
    "devices_list",
    {
      description: "List registered devices for the current user",
      inputSchema: {},
    },
    async () => {
      requireScopes(toolAuth, AGENTBRIDGE_SCOPES.devices);
      const rows = await db
        .select()
        .from(devices)
        .where(eq(devices.ownerUserId, userId));
      return mcpTextResult(
        rows.map((d) => ({
          device_id: d.id,
          device_name: d.name,
          online: d.online,
          last_seen: d.lastSeenAt?.toISOString() ?? null,
        })),
      );
    },
  );

  server.registerTool(
    "devices_set_default",
    {
      description: "Set the default device for MCP tools",
      inputSchema: {
        device_id: z.string().uuid(),
      },
    },
    async ({ device_id }) => {
      requireScopes(toolAuth, AGENTBRIDGE_SCOPES.devices);
      const device = await getDeviceForUser(db, userId, device_id);
      if (!device) {
        return mcpTextResult({ error: "device_not_found" });
      }
      await db
        .insert(userDefaults)
        .values({ userId, defaultDeviceId: device_id })
        .onConflictDoUpdate({
          target: userDefaults.userId,
          set: { defaultDeviceId: device_id },
        });
      return mcpTextResult({
        device_id: device.id,
        device_name: device.name,
      });
    },
  );

  server.registerTool(
    "threads_spawn",
    {
      description: "Spawn a PTY-backed CLI thread on a device",
      inputSchema: {
        ...deviceIdShape,
        profile: z.string(),
        cwd: z.string(),
        name: z.string().optional(),
        prompt: z.string().optional(),
      },
    },
    async (input) => {
      requireScopes(toolAuth, AGENTBRIDGE_SCOPES.threads);
      const resolved = await resolveDeviceId(db, userId, input);
      if (!resolved.ok) {
        return mcpTextResult(resolved);
      }
      const device = await getDeviceForUser(db, userId, resolved.deviceId);
      if (!device) {
        return mcpTextResult({ error: "device_not_found" });
      }
      if (!hub.isOnline(device.id)) {
        return mcpTextResult({ error: "device_offline", device_id: device.id });
      }
      const running = await countRunningThreadsOnDevice(db, device.id);
      if (running >= env.MAX_THREADS_PER_DEVICE) {
        return mcpTextResult({ error: "thread_limit", limit: env.MAX_THREADS_PER_DEVICE });
      }

      const [thread] = await db
        .insert(threads)
        .values({
          deviceId: device.id,
          ownerUserId: userId,
          profile: input.profile,
          cwd: input.cwd,
          name: input.name,
          status: "running",
        })
        .returning();

      try {
        await hub.call(
          device.id,
          "thread.spawn",
          {
            thread_id: thread!.id,
            profile: input.profile,
            cwd: input.cwd,
            name: input.name,
            initial_input: input.prompt,
          },
          120_000,
        );
      } catch (err) {
        await db.delete(threads).where(eq(threads.id, thread!.id));
        throw err;
      }

      await writeAudit(db, {
        userId,
        action: "thread.spawn",
        deviceId: device.id,
        threadId: thread!.id,
        profileId: input.profile,
      });

      return mcpTextResult({
        thread_id: thread!.id,
        device_id: device.id,
        device_name: device.name,
      });
    },
  );

  server.registerTool(
    "threads_send",
    {
      description: "Send input to a thread",
      inputSchema: {
        thread_id: z.string().uuid(),
        input: z.string(),
      },
    },
    async ({ thread_id, input }) => {
      requireScopes(toolAuth, AGENTBRIDGE_SCOPES.threads);
      const [thread] = await db
        .select()
        .from(threads)
        .where(and(eq(threads.id, thread_id), eq(threads.ownerUserId, userId)))
        .limit(1);
      if (!thread) {
        return mcpTextResult({ error: "thread_not_found" });
      }
      await hub.call(thread.deviceId, "thread.send", { thread_id, input });
      return mcpTextResult({ ok: true });
    },
  );

  server.registerTool(
    "threads_kill",
    {
      description: "Kill a running thread",
      inputSchema: {
        thread_id: z.string().uuid(),
      },
    },
    async ({ thread_id }) => {
      requireScopes(toolAuth, AGENTBRIDGE_SCOPES.threads);
      const [thread] = await db
        .select()
        .from(threads)
        .where(and(eq(threads.id, thread_id), eq(threads.ownerUserId, userId)))
        .limit(1);
      if (!thread) {
        return mcpTextResult({ error: "thread_not_found" });
      }
      await hub.call(thread.deviceId, "thread.kill", { thread_id });
      await db
        .update(threads)
        .set({ status: "killed", exitedAt: new Date() })
        .where(eq(threads.id, thread_id));
      await writeAudit(db, {
        userId,
        action: "thread.kill",
        deviceId: thread.deviceId,
        threadId: thread_id,
      });
      return mcpTextResult({ ok: true });
    },
  );

  server.registerTool(
    "threads_status",
    {
      description: "Get thread status",
      inputSchema: {
        thread_id: z.string().uuid(),
      },
    },
    async ({ thread_id }) => {
      requireScopes(toolAuth, AGENTBRIDGE_SCOPES.threads);
      const [thread] = await db
        .select()
        .from(threads)
        .where(and(eq(threads.id, thread_id), eq(threads.ownerUserId, userId)))
        .limit(1);
      if (!thread) {
        return mcpTextResult({ error: "thread_not_found" });
      }
      const device = await getDeviceForUser(db, userId, thread.deviceId);
      return mcpTextResult({
        thread_id: thread.id,
        status: thread.status,
        profile: thread.profile,
        cwd: thread.cwd,
        name: thread.name,
        device_id: thread.deviceId,
        device_name: device?.name,
      });
    },
  );

  server.registerTool(
    "threads_list",
    {
      description: "List threads for the current user",
      inputSchema: {
        device_id: z.string().uuid().optional(),
        name: z.string().optional(),
      },
    },
    async (input) => {
      requireScopes(toolAuth, AGENTBRIDGE_SCOPES.threads);
      const conditions = [eq(threads.ownerUserId, userId)];
      if (input.device_id) {
        conditions.push(eq(threads.deviceId, input.device_id));
      }
      if (input.name) {
        conditions.push(eq(threads.name, input.name));
      }
      const rows = await db
        .select()
        .from(threads)
        .where(and(...conditions))
        .orderBy(desc(threads.createdAt));
      return mcpTextResult(rows);
    },
  );

  server.registerTool(
    "threads_events",
    {
      description: "Read structured thread events after a sequence cursor",
      inputSchema: {
        thread_id: z.string().uuid(),
        after_seq: z.number().int().nonnegative().default(0),
        include_raw: z.boolean().optional(),
      },
    },
    async ({ thread_id, after_seq, include_raw }) => {
      requireScopes(toolAuth, AGENTBRIDGE_SCOPES.threads);
      const [thread] = await db
        .select()
        .from(threads)
        .where(and(eq(threads.id, thread_id), eq(threads.ownerUserId, userId)))
        .limit(1);
      if (!thread) {
        return mcpTextResult({ error: "thread_not_found" });
      }
      const events = await listThreadEvents(
        db,
        thread_id,
        after_seq,
        include_raw ?? false,
      );
      return mcpTextResult({ events });
    },
  );

  const forwardToDevice = async (
    scope: string,
    input: { device_id?: string; device_name?: string },
    method: string,
    params: Record<string, unknown>,
  ) => {
    requireScopes(toolAuth, scope);
    const resolved = await resolveDeviceId(db, userId, input);
    if (!resolved.ok) {
      return mcpTextResult(resolved);
    }
    if (!hub.isOnline(resolved.deviceId)) {
      return mcpTextResult({
        error: "device_offline",
        device_id: resolved.deviceId,
      });
    }
    const result = await hub.call(resolved.deviceId, method, params);
    return mcpTextResult(result);
  };

  server.registerTool(
    "profiles_list",
    {
      description: "List CLI profiles on a device",
      inputSchema: deviceIdShape,
    },
    async (input) => forwardToDevice(AGENTBRIDGE_SCOPES.profiles, input, "profile.list", {}),
  );

  server.registerTool(
    "profiles_upsert",
    {
      description: "Create or update a profile on a device",
      inputSchema: {
        ...deviceIdShape,
        profile: z.record(z.string(), z.unknown()),
      },
    },
    async (input) =>
      forwardToDevice(AGENTBRIDGE_SCOPES.profiles, input, "profile.upsert", {
        profile: input.profile,
      }),
  );

  server.registerTool(
    "profiles_delete",
    {
      description: "Delete a profile on a device",
      inputSchema: {
        ...deviceIdShape,
        profile_id: z.string(),
      },
    },
    async (input) =>
      forwardToDevice(AGENTBRIDGE_SCOPES.profiles, input, "profile.delete", {
        profile_id: input.profile_id,
      }),
  );

  server.registerTool(
    "approvals_list",
    {
      description: "List pending approvals for the current user",
      inputSchema: {},
    },
    async () => {
      requireScopes(toolAuth, AGENTBRIDGE_SCOPES.approvals);
      await resolveApprovalTimeouts(deps);
      const rows = await db
        .select({
          approval: approvals,
          thread: threads,
        })
        .from(approvals)
        .innerJoin(threads, eq(approvals.threadId, threads.id))
        .where(
          and(
            eq(approvals.status, "pending"),
            eq(threads.ownerUserId, userId),
          ),
        );
      return mcpTextResult(
        rows.map(({ approval, thread }) => ({
          id: approval.id,
          thread_id: approval.threadId,
          device_id: approval.deviceId,
          prompt: approval.prompt,
          expires_at: approval.expiresAt.toISOString(),
          thread_name: thread.name,
        })),
      );
    },
  );

  server.registerTool(
    "approvals_respond",
    {
      description: "Approve or deny a pending approval",
      inputSchema: {
        approval_id: z.string().uuid(),
        decision: z.enum(["approve", "deny"]),
        note: z.string().optional(),
      },
    },
    async ({ approval_id, decision, note }) => {
      requireScopes(toolAuth, AGENTBRIDGE_SCOPES.approvals);
      const [row] = await db
        .select({ approval: approvals, thread: threads })
        .from(approvals)
        .innerJoin(threads, eq(approvals.threadId, threads.id))
        .where(
          and(eq(approvals.id, approval_id), eq(threads.ownerUserId, userId)),
        )
        .limit(1);
      if (!row || row.approval.status !== "pending") {
        return mcpTextResult({ error: "approval_not_found" });
      }
      const status = decision === "approve" ? "approved" : "denied";
      const decided = await decideApproval(db, approval_id, status, note);
      if (!decided) return mcpTextResult({ error: "approval_expired_or_resolved" });
      await deliverApprovalDecisions(db, hub);
      await writeAudit(db, {
        userId,
        action: `approval.${status}`,
        deviceId: row.approval.deviceId,
        threadId: row.approval.threadId,
      });
      return mcpTextResult({ ok: true, status });
    },
  );

  server.registerTool(
    "workspaces_list_roots",
    {
      description: "List cwd allowlist roots on a device",
      inputSchema: deviceIdShape,
    },
    async (input) =>
      forwardToDevice(AGENTBRIDGE_SCOPES.devices, input, "workspace.list_roots", {}),
  );

  server.registerTool(
    "workspaces_add_root",
    {
      description: "Add an allowed cwd root on a device",
      inputSchema: {
        ...deviceIdShape,
        path: z.string(),
      },
    },
    async (input) =>
      forwardToDevice(AGENTBRIDGE_SCOPES.admin, input, "workspace.add_root", {
        path: input.path,
      }),
  );

  server.registerTool(
    "workspaces_remove_root",
    {
      description: "Remove an allowed cwd root on a device",
      inputSchema: {
        ...deviceIdShape,
        path: z.string(),
      },
    },
    async (input) =>
      forwardToDevice(AGENTBRIDGE_SCOPES.admin, input, "workspace.remove_root", {
        path: input.path,
      }),
  );
}
