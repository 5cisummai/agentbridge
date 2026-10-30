import { eq, lte, and } from "drizzle-orm";
import type { AppDeps } from "../app.js";
import { approvals } from "../db/schema.js";
import { appendThreadEvent } from "./thread-events.js";
import { deliverApprovalDecisions } from "./approvals.js";

export async function resolveApprovalTimeouts(deps: AppDeps) {
  await deps.gatewayDb.db.transaction(async (tx) => {
    const now = new Date();
    const expired = await tx
      .update(approvals)
      .set({ status: "timeout", resolvedAt: now })
      .where(
        and(eq(approvals.status, "pending"), lte(approvals.expiresAt, now)),
      )
      .returning();
    for (const approval of expired) {
      await appendThreadEvent(tx, deps.env, {
        thread_id: approval.threadId,
        seq: 0,
        type: "approval_timeout",
        payload: { approval_id: approval.id },
      });
    }
  });
  await deliverApprovalDecisions(deps.gatewayDb.db, deps.hub);
}

export function startApprovalTimeoutJob(deps: AppDeps) {
  let running = false;
  const interval = setInterval(() => {
    if (running) return;
    running = true;
    void resolveApprovalTimeouts(deps)
      .catch(console.error)
      .finally(() => {
        running = false;
      });
  }, 30_000);
  return () => clearInterval(interval);
}
