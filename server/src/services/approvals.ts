import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import type { Env } from "../env.js";
import type { GatewayDb } from "../db/client.js";
import { approvals, threads } from "../db/schema.js";

export async function handleApprovalSubmit(
  db: GatewayDb["db"],
  env: Env,
  deviceId: string,
  params: unknown,
) {
  if (!params || typeof params !== "object") return;
  const body = params as {
    thread_id?: string;
    approval_id?: string;
    prompt?: string;
  };

  if (
    typeof body.thread_id !== "string" ||
    typeof body.prompt !== "string" ||
    !body.prompt
  ) {
    return;
  }

  const [thread] = await db
    .select()
    .from(threads)
    .where(eq(threads.id, body.thread_id))
    .limit(1);

  if (!thread || thread.deviceId !== deviceId) {
    return;
  }

  const approvalId = body.approval_id ?? randomUUID();
  const expiresAt = new Date(Date.now() + env.APPROVAL_TIMEOUT_MS);

  await db
    .insert(approvals)
    .values({
      id: approvalId,
      threadId: body.thread_id,
      deviceId,
      prompt: body.prompt,
      expiresAt,
      status: "pending",
    })
    .onConflictDoNothing();
}

// Resolved decisions form a durable outbox. Repeated delivery is safe by approval ID.
export async function deliverApprovalDecisions(
  db: GatewayDb["db"],
  hub: {
    call: (
      deviceId: string,
      method: string,
      params: unknown,
    ) => Promise<unknown>;
  },
) {
  const rows = await db
    .select()
    .from(approvals)
    .where(and(ne(approvals.status, "pending"), isNull(approvals.deliveredAt)));
  for (const approval of rows) {
    try {
      await hub.call(approval.deviceId, "approval.resolve", {
        approval_id: approval.id,
        approved: approval.status === "approved",
        note:
          approval.status === "timeout" ? "approval_timeout" : approval.note,
      });
      await db
        .update(approvals)
        .set({ deliveredAt: new Date() })
        .where(eq(approvals.id, approval.id));
    } catch {
      /* Retain the decision for the next retry. */
    }
  }
}

export async function decideApproval(
  db: GatewayDb["db"],
  id: string,
  status: "approved" | "denied",
  note?: string,
) {
  const [row] = await db
    .update(approvals)
    .set({ status, resolvedAt: new Date(), note })
    .where(
      and(
        eq(approvals.id, id),
        eq(approvals.status, "pending"),
        gt(approvals.expiresAt, new Date()),
      ),
    )
    .returning();
  return row;
}
