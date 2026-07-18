import { RUN_STEP_KEYS, type RunStepKey } from "@wakil/shared";

/** Ordered deterministic steps; each emits one persisted run.step event. */
export const RUN_STEPS: readonly RunStepKey[] = RUN_STEP_KEYS;

/** Guard: a run may never emit more step events than this. */
export const STEP_LIMIT = 8;

/** Guard: wall-clock budget for the whole run before it fails. */
export const TIME_LIMIT_MS = 60_000;
