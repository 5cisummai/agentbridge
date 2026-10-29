import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { GatewayDb } from "../db/client.js";
import { devices, userDefaults } from "../db/schema.js";

export function hashDeviceSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateDeviceSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function verifyDeviceSecret(
  secret: string,
  storedHash: string,
): boolean {
  const hash = hashDeviceSecret(secret);
  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

export type DeviceResolution =
  | { ok: true; deviceId: string }
  | {
      ok: false;
      code:
        | "device_required"
        | "device_not_found"
        | "device_name_ambiguous"
        | "device_forbidden";
      candidates?: Array<{ device_id: string; device_name: string }>;
    };

export async function resolveDeviceId(
  db: GatewayDb["db"],
  userId: string,
  input: { device_id?: string; device_name?: string },
): Promise<DeviceResolution> {
  if (input.device_id) {
    const [row] = await db
      .select()
      .from(devices)
      .where(
        and(eq(devices.id, input.device_id), eq(devices.ownerUserId, userId)),
      )
      .limit(1);
    if (!row) {
      return { ok: false, code: "device_not_found" };
    }
    return { ok: true, deviceId: row.id };
  }

  if (input.device_name) {
    const rows = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.ownerUserId, userId),
          eq(devices.name, input.device_name),
        ),
      );
    if (rows.length === 0) {
      return { ok: false, code: "device_not_found" };
    }
    if (rows.length > 1) {
      return {
        ok: false,
        code: "device_name_ambiguous",
        candidates: rows.map((r) => ({
          device_id: r.id,
          device_name: r.name,
        })),
      };
    }
    return { ok: true, deviceId: rows[0]!.id };
  }

  const [defaults] = await db
    .select()
    .from(userDefaults)
    .where(eq(userDefaults.userId, userId))
    .limit(1);
  if (defaults?.defaultDeviceId) {
    const [row] = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.id, defaults.defaultDeviceId),
          eq(devices.ownerUserId, userId),
        ),
      )
      .limit(1);
    if (row) {
      return { ok: true, deviceId: row.id };
    }
  }

  return { ok: false, code: "device_required" };
}

export async function getDeviceForUser(
  db: GatewayDb["db"],
  userId: string,
  deviceId: string,
) {
  const [row] = await db
    .select()
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.ownerUserId, userId)))
    .limit(1);
  return row;
}
