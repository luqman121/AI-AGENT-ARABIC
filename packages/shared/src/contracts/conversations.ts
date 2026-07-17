import { z } from "zod";

import { idempotencyKeySchema, projectIdSchema, requestTextSchema } from "./fields.js";

export const appendRequirementInputSchema = z.object({
  projectId: projectIdSchema,
  content: requestTextSchema,
  idempotencyKey: idempotencyKeySchema,
});

export type AppendRequirementInput = z.infer<typeof appendRequirementInputSchema>;
