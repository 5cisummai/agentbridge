import { and, asc, count, eq, gt } from "drizzle-orm";
import type { Env } from "../env.js";
import type { GatewayDb } from "../db/client.js";
import { threadEvents, threads } from "../db/schema.js";
import type { ThreadEvent } from "../protocol/events.js";

export async function appendThreadEvent(
  db: GatewayDb["db"],
  env: Env,
  event: ThreadEvent,
) {
  await db.insert(threadEvents).values({
    threadId: event.thread_id,
    seq: event.seq,
    type: event.type,
    payload: event.payload,
  });

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(threadEvents)
    .where(eq(threadEvents.threadId, event.thread_id));

  const maxEvents = env.MAX_EVENTS_PER_THREAD;
  if (total > maxEvents) {
    const toDrop = total - maxEvents;
    const oldest = await db
      .select({ seq: threadEvents.seq })
      .from(threadEvents)
      .where(eq(threadEvents.threadId, event.thread_id))
      .orderBy(asc(threadEvents.seq))
      .limit(toDrop);
    for (const row of oldest) {
      await db
        .delete(threadEvents)
        .where(
          and(
            eq(threadEvents.threadId, event.thread_id),
            eq(threadEvents.seq, row.seq),
          ),
        );
    }
  }
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
    const payload = row.payload as Record<string, unknown>;
    const base = {
      thread_id: threadId,
      seq: row.seq,
      type: row.type,
      payload,
    };
    if (includeRaw && typeof payload.raw === "string") {
      return { ...base, raw: payload.raw };
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
