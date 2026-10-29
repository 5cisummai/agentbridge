import { desc, eq, lt, and } from "drizzle-orm";
import type { AppDeps } from "../app.js";
import { approvals, threadEvents, threads } from "../db/schema.js";
import { appendThreadEvent } from "./thread-events.js";

export async function resolveApprovalTimeouts(deps: AppDeps) {
  const now = new Date();
  const expired = await deps.gatewayDb.db
    .select({ approval: approvals, thread: threads })
    .from(approvals)
    .innerJoin(threads, eq(approvals.threadId, threads.id))
    .where(and(eq(approvals.status, "pending"), lt(approvals.expiresAt, now)));

  for (const { approval, thread } of expired) {
    await deps.gatewayDb.db
      .update(approvals)
      .set({ status: "timeout", resolvedAt: now })
      .where(eq(approvals.id, approval.id));

    if (deps.hub.isOnline(approval.deviceId)) {
      try {
        await deps.hub.call(approval.deviceId, "approval.resolve", {
          approval_id: approval.id,
          approved: false,
          note: "approval_timeout",
        });
      } catch {
        // device may disconnect mid-timeout
      }
    }

    const [lastEvent] = await deps.gatewayDb.db
      .select({ seq: threadEvents.seq })
      .from(threadEvents)
      .where(eq(threadEvents.threadId, thread.id))
      .orderBy(desc(threadEvents.seq))
      .limit(1);

    await appendThreadEvent(deps.gatewayDb.db, deps.env, {
      thread_id: thread.id,
      seq: (lastEvent?.seq ?? 0) + 1,
      type: "approval_timeout",
      payload: { approval_id: approval.id },
    });
  }
}

export function startApprovalTimeoutJob(deps: AppDeps) {
  const interval = setInterval(() => {
    void resolveApprovalTimeouts(deps);
  }, 30_000);
  return () => clearInterval(interval);
}
