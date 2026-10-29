import { z } from "zod/v4";

export const threadEventSchema = z.object({
  thread_id: z.string().uuid(),
  seq: z.number().int().nonnegative(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  raw: z.string().optional(),
});

export type ThreadEvent = z.infer<typeof threadEventSchema>;

export const normalizedEventTypes = [
  "assistant",
  "tool",
  "stderr",
  "exit",
  "approval_required",
  "approval_timeout",
  "buffer_trimmed",
  "raw",
] as const;
