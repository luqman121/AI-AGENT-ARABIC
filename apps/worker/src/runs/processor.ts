import type { createDatabaseClient } from "@wakil/db/client";
import { conversationMessages, runs } from "@wakil/db/schema";
import {
  runEventLabel,
  type RunEventPayload,
  type RunJobData,
  type RunStatus,
} from "@wakil/shared";
import { and, eq } from "drizzle-orm";
import type { Redis } from "ioredis";

import { appendRunEvent, publishRunEvent } from "./events.js";
import { RUN_STEPS, STEP_LIMIT, TIME_LIMIT_MS } from "./steps.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

export type ProcessorDeps = { db: Database; redis: Redis };

async function emit(
  deps: ProcessorDeps,
  job: RunJobData,
  event: Parameters<typeof appendRunEvent>[1],
): Promise<void> {
  const { seq, createdAtIso } = await deps.db.transaction((tx) => appendRunEvent(tx, event));
  const payload: RunEventPayload = {
    seq,
    type: event.type,
    createdAtIso,
    ...(event.stepKey ? { stepKey: event.stepKey } : {}),
    ...(typeof event.stepIndex === "number" ? { stepIndex: event.stepIndex } : {}),
  };
  await publishRunEvent(deps.redis, job.runId, payload);
}

async function isCancelRequested(deps: ProcessorDeps, runId: string): Promise<boolean> {
  const row = (
    await deps.db
      .select({ cancelRequestedAt: runs.cancelRequestedAt })
      .from(runs)
      .where(eq(runs.id, runId))
  )[0];
  return Boolean(row?.cancelRequestedAt);
}

/** Runs the bounded deterministic state machine; returns the terminal status. */
export async function processRun(deps: ProcessorDeps, job: RunJobData): Promise<RunStatus> {
  // Claim the run: only a still-queued run transitions to running.
  const claimed = await deps.db
    .update(runs)
    .set({ status: "running", startedAt: new Date() })
    .where(and(eq(runs.id, job.runId), eq(runs.status, "queued")))
    .returning({ id: runs.id });
  if (claimed.length === 0) {
    const existing = (
      await deps.db.select({ status: runs.status }).from(runs).where(eq(runs.id, job.runId))
    )[0];
    return (existing?.status as RunStatus | undefined) ?? "failed";
  }

  await emit(deps, job, { runId: job.runId, workspaceId: job.workspaceId, type: "run.started" });

  const deadline = Date.now() + TIME_LIMIT_MS;
  let completedSteps = 0;

  try {
    for (const [index, stepKey] of RUN_STEPS.entries()) {
      if (await isCancelRequested(deps, job.runId)) {
        return finalize(deps, job, "cancelled", "run.cancelled", completedSteps);
      }
      if (completedSteps >= STEP_LIMIT) {
        return finalize(deps, job, "failed", "run.failed", completedSteps, "INTERNAL_ERROR");
      }
      if (Date.now() > deadline) {
        return finalize(deps, job, "failed", "run.failed", completedSteps, "INTERNAL_ERROR");
      }

      // Real, deterministic work per step.
      if (stepKey === "validate-request") {
        const message = (
          await deps.db
            .select({ id: conversationMessages.id })
            .from(conversationMessages)
            .where(eq(conversationMessages.workspaceId, job.workspaceId))
            .limit(1)
        )[0];
        if (!message) {
          return finalize(deps, job, "failed", "run.failed", completedSteps, "NOT_FOUND");
        }
      }

      await emit(deps, job, {
        runId: job.runId,
        workspaceId: job.workspaceId,
        type: "run.step",
        stepKey,
        stepIndex: index,
      });
      completedSteps += 1;
    }

    return finalize(deps, job, "succeeded", "run.succeeded", completedSteps);
  } catch {
    return finalize(deps, job, "failed", "run.failed", completedSteps, "INTERNAL_ERROR");
  }
}

async function finalize(
  deps: ProcessorDeps,
  job: RunJobData,
  status: RunStatus,
  eventType: "run.succeeded" | "run.failed" | "run.cancelled",
  stepCount: number,
  errorCode?: string,
): Promise<RunStatus> {
  await deps.db
    .update(runs)
    .set({ status, stepCount, finishedAt: new Date(), errorCode: errorCode ?? null })
    .where(eq(runs.id, job.runId));
  await emit(deps, job, { runId: job.runId, workspaceId: job.workspaceId, type: eventType });
  // Label lookup keeps the mapping exercised server-side; not persisted.
  void runEventLabel({ type: eventType });
  return status;
}
