import type { Auth } from "../auth/index.js";
import type { Env } from "../env.js";
import type { GatewayDb } from "../db/client.js";
import { devices } from "../db/schema.js";
import {
  generateDeviceSecret,
  hashDeviceSecret,
} from "../services/devices.js";
import { verifyOAuthUserRequest } from "./verify-oauth.js";

export async function enrollDevice(
  auth: Auth,
  env: Env,
  db: GatewayDb["db"],
  request: Request,
  body: { device_name: string; capabilities?: Record<string, unknown> },
) {
  const verified = await verifyOAuthUserRequest(auth, env, request);
  if (!verified) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const deviceSecret = generateDeviceSecret();
  const [device] = await db
    .insert(devices)
    .values({
      ownerUserId: verified.userId,
      name: body.device_name,
      credentialHash: hashDeviceSecret(deviceSecret),
      capabilities: body.capabilities,
    })
    .returning();

  return Response.json({
    device_id: device!.id,
    device_secret: deviceSecret,
    device_name: device!.name,
  });
}
