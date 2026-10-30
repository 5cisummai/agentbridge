import { z } from "zod/v4";
import type { Auth } from "../auth/index.js";
import type { Env } from "../env.js";
import type { GatewayDb } from "../db/client.js";
import { devices } from "../db/schema.js";
import { generateDeviceSecret, hashDeviceSecret } from "../services/devices.js";
import { verifyOAuthUserRequest } from "./verify-oauth.js";

export const MAX_ENROLLMENT_BODY_BYTES = 32 * 1024;

export const enrollmentBodySchema = z
  .object({
    device_name: z.string().trim().min(1).max(128),
    capabilities: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.capabilities &&
      JSON.stringify(value.capabilities).length > MAX_ENROLLMENT_BODY_BYTES
    ) {
      context.addIssue({
        code: "custom",
        path: ["capabilities"],
        message: "capabilities are too large",
      });
    }
  });

export async function enrollDevice(
  auth: Auth,
  env: Env,
  db: GatewayDb["db"],
  request: Request,
  body: unknown,
) {
  const verified = await verifyOAuthUserRequest(auth, env, request);
  if (!verified) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = enrollmentBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const { device_name, capabilities } = parsed.data;
  const deviceSecret = generateDeviceSecret();
  const [device] = await db
    .insert(devices)
    .values({
      ownerUserId: verified.userId,
      name: device_name,
      credentialHash: hashDeviceSecret(deviceSecret),
      capabilities,
    })
    .returning();

  return Response.json({
    device_id: device!.id,
    device_secret: deviceSecret,
    device_name: device!.name,
  });
}
