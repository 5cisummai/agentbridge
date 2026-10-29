import { z } from "zod/v4";

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

export const jsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).nullable(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.unknown().optional(),
    })
    .optional(),
});

export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;
export type JsonRpcResponse = z.infer<typeof jsonRpcResponseSchema>;

export function jsonRpcResult(
  id: JsonRpcRequest["id"],
  result: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

export function jsonRpcError(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

export const HUB_METHODS = [
  "device.hello",
  "device.heartbeat",
  "thread.spawn",
  "thread.send",
  "thread.kill",
  "thread.list",
  "thread.events",
  "profile.list",
  "profile.upsert",
  "profile.delete",
  "workspace.list_roots",
  "workspace.add_root",
  "workspace.remove_root",
  "approval.resolve",
  "approval.submit",
  "thread.event",
] as const;

export type HubMethod = (typeof HUB_METHODS)[number];
