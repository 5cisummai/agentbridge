import type { GatewayDb } from "../db/client.js";
import { auditEvents } from "../db/schema.js";

export async function writeAudit(
  db: GatewayDb["db"],
  entry: {
    userId: string;
    action: string;
    deviceId?: string;
    threadId?: string;
    profileId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(auditEvents).values({
    userId: entry.userId,
    action: entry.action,
    deviceId: entry.deviceId,
    threadId: entry.threadId,
    profileId: entry.profileId,
    metadata: entry.metadata,
  });
}
