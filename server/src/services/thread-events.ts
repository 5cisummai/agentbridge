import { and, asc, count, eq, gt, sql } from "drizzle-orm";
import type { Env } from "../env.js";
import type { GatewayDb } from "../db/client.js";
import { threadEvents, threads } from "../db/schema.js";
import type { ThreadEvent } from "../protocol/events.js";

export async function appendThreadEvent(
  db: Omit<GatewayDb["db"], "$client">,
  env: Env,
  event: ThreadEvent,
  deviceId?: string,
) {
  return db.transaction(async (tx) => {
    const [thread] = await tx.select().from(threads)
      .where(eq(threads.id, event.thread_id)).for("update");
    if (!thread || (deviceId !== undefined && thread.deviceId !== deviceId)) {
      throw new Error("thread_not_found");
    }
    // The runner sequence is a durable replay watermark, independent of client cursors.
    if (deviceId !== undefined && event.seq <= thread.runnerSeq) return;
    const seq = thread.eventSeq + 1;
    await tx.insert(threadEvents).values({
      threadId: event.thread_id, seq, type: event.type,
      payload: { ...event.payload, ...(event.raw === undefined ? {} : { raw: event.raw }) },
    });
    await tx.update(threads).set({
      eventSeq: seq,
      ...(deviceId === undefined ? {} : { runnerSeq: event.seq }),
      ...(event.type === "exit" ? {
        status: thread.status === "killed" ? "killed" as const : "exited" as const,
        exitedAt: new Date(),
      } : {}),
    }).where(eq(threads.id, event.thread_id));
    await tx.delete(threadEvents).where(and(
      eq(threadEvents.threadId, event.thread_id),
      sql`${threadEvents.seq} <= ${seq - env.MAX_EVENTS_PER_THREAD}`,
    ));
  });
}

export async function listThreadEvents(
  db: GatewayDb["db"],
  threadId: string,
  afterSeq: number,
  includeRaw: boolean,
) {
  const rows = await db
    .select()
    .from(threadEvents)
    .where(
      and(eq(threadEvents.threadId, threadId), gt(threadEvents.seq, afterSeq)),
    )
    .orderBy(asc(threadEvents.seq));

  return rows.map((row) => {
    const { raw, ...payload } = row.payload as Record<string, unknown>;
    const base = {
      thread_id: threadId,
      seq: row.seq,
      type: row.type,
      payload,
    };
    if (includeRaw && typeof raw === "string") {
      return { ...base, raw };
    }
    return base;
  });
}

export async function countRunningThreadsOnDevice(
  db: GatewayDb["db"],
  deviceId: string,
) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(threads)
    .where(and(eq(threads.deviceId, deviceId), eq(threads.status, "running")));
  return value;
}
