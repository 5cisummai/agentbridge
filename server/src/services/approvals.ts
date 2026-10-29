import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { Env } from "../env.js";
import type { GatewayDb } from "../db/client.js";
import { approvals, threadEvents, threads } from "../db/schema.js";
import { appendThreadEvent } from "./thread-events.js";

export async function handleApprovalSubmit(
  db: GatewayDb["db"],
  env: Env,
  deviceId: string,
  params: unknown,
) {
  const body = params as {
    thread_id?: string;
    approval_id?: string;
    prompt?: string;
  };

  if (!body.thread_id || !body.prompt) {
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

  await db.insert(approvals).values({
    id: approvalId,
    threadId: body.thread_id,
    deviceId,
    prompt: body.prompt,
    expiresAt,
    status: "pending",
  });

  const [lastEvent] = await db
    .select({ seq: threadEvents.seq })
    .from(threadEvents)
    .where(eq(threadEvents.threadId, body.thread_id))
    .orderBy(desc(threadEvents.seq))
    .limit(1);
  const nextSeq = (lastEvent?.seq ?? 0) + 1;

  await appendThreadEvent(db, env, {
    thread_id: body.thread_id,
    seq: nextSeq,
    type: "approval_required",
    payload: {
      approval_id: approvalId,
      prompt: body.prompt,
      expires_at: expiresAt.toISOString(),
    },
  });
}
