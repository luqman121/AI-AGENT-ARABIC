import { z } from "zod";

import { idempotencyKeySchema, projectIdSchema } from "./fields.js";

export const RUN_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_EVENT_TYPES = [
  "run.queued",
  "run.started",
  "run.step",
  "run.succeeded",
  "run.failed",
  "run.cancelled",
] as const;
export type RunEventType = (typeof RUN_EVENT_TYPES)[number];

/** Fixed, deterministic steps executed by the worker in this milestone. */
export const RUN_STEP_KEYS = ["validate-request", "record-checkpoint", "finalize"] as const;
export type RunStepKey = (typeof RUN_STEP_KEYS)[number];

export const runIdSchema = z.uuid({ error: "معرّف التشغيل غير صالح." });

export const runEventPayloadSchema = z.object({
  seq: z.number().int().positive(),
  type: z.enum(RUN_EVENT_TYPES),
  stepKey: z.enum(RUN_STEP_KEYS).optional(),
  stepIndex: z.number().int().nonnegative().optional(),
  createdAtIso: z.string(),
});
export type RunEventPayload = z.infer<typeof runEventPayloadSchema>;

export const startRunInputSchema = z.object({
  projectId: projectIdSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type StartRunInput = z.infer<typeof startRunInputSchema>;

export const cancelRunInputSchema = z.object({
  projectId: projectIdSchema,
  runId: runIdSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type CancelRunInput = z.infer<typeof cancelRunInputSchema>;

/** BullMQ job payload; the only worker-facing contract for a run. */
export type RunJobData = {
  runId: string;
  workspaceId: string;
  projectId: string;
};

export const RUNS_QUEUE_NAME = "wakil-runs";

export function runEventChannel(runId: string): string {
  return `wakil:run:${runId}`;
}

const STEP_LABELS: Record<RunStepKey, string> = {
  "validate-request": "التحقق من الطلب",
  "record-checkpoint": "تسجيل نقطة تحقّق",
  finalize: "إنهاء التحضير",
};

const TYPE_LABELS: Record<RunEventType, string> = {
  "run.queued": "في قائمة الانتظار",
  "run.started": "بدأ التشغيل",
  "run.step": "خطوة",
  "run.succeeded": "اكتمل التشغيل",
  "run.failed": "تعذّر إكمال التشغيل",
  "run.cancelled": "أُلغي التشغيل",
};

/** Arabic label for a persisted event; step events use their step label. */
export function runEventLabel(payload: { type: RunEventType; stepKey?: RunStepKey }): string {
  if (payload.type === "run.step" && payload.stepKey) return STEP_LABELS[payload.stepKey];
  return TYPE_LABELS[payload.type];
}
