import { z } from "zod";

import { idempotencyKeySchema, projectIdSchema, requestTextSchema } from "./fields.js";

export const appendRequirementInputSchema = z.object({
  projectId: projectIdSchema,
  content: requestTextSchema,
  attachmentIds: z.array(z.string().uuid()).max(6).default([]),
  clientMessageId: z.string().uuid().optional(),
  idempotencyKey: idempotencyKeySchema,
});

export type AppendRequirementInput = z.infer<typeof appendRequirementInputSchema>;
