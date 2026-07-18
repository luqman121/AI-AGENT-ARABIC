import { generatePlanningTurn, type PlanningLimits } from "@wakil/agent-core";
import type { createDatabaseClient } from "@wakil/db/client";
import { conversationMessages, runs } from "@wakil/db/schema";
import type { ModelProviderAdapter } from "@wakil/model-router";
import {
  runEventLabel,
  type RunEventPayload,
  type RunEventType,
  type RunJobData,
  type RunStatus,
} from "@wakil/shared";
import { PLANNING_PROMPT_VERSION } from "@wakil/skills";
import { and, desc, eq } from "drizzle-orm";
import type { Redis } from "ioredis";

import { appendRunEvent, publishRunEvent, type AppendRunEventInput } from "./events.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

export type ProcessorDeps = {
  adapter: ModelProviderAdapter;
  db: Database;
  limits: PlanningLimits;
  model: string;
  modelConfigKey: string;
  redis: Redis;
};

function payloadFor(
  input: AppendRunEventInput,
  persisted: { seq: number; createdAtIso: string },
): RunEventPayload {
  return {
    ...persisted,
    type: input.type,
    ...(input.stepKey ? { stepKey: input.stepKey } : {}),
    ...(typeof input.stepIndex === "number" ? { stepIndex: input.stepIndex } : {}),
    ...(input.textDelta ? { textDelta: input.textDelta } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
  };
}

async function emit(deps: ProcessorDeps, input: AppendRunEventInput): Promise<void> {
  const persisted = await deps.db.transaction((tx) => appendRunEvent(tx, input));
  await publishRunEvent(deps.redis, input.runId, payloadFor(input, persisted));
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

function failureErrorCode(code: string): string {
  const codes: Record<string, string> = {
    invalid_response: "AGENT_INVALID_RESPONSE",
    limit_exceeded: "AGENT_LIMIT_EXCEEDED",
    provider_authentication: "PROVIDER_CONFIGURATION_ERROR",
    provider_rate_limited: "PROVIDER_RATE_LIMITED",
    provider_unavailable: "PROVIDER_UNAVAILABLE",
    refused: "AGENT_REFUSED",
    timeout: "PROVIDER_TIMEOUT",
  };
  return codes[code] ?? "INTERNAL_ERROR";
}

/** Executes one bounded real planning turn and returns its terminal status. */
export async function processRun(deps: ProcessorDeps, job: RunJobData): Promise<RunStatus> {
  const claimed = (
    await deps.db
      .update(runs)
      .set({ status: "running", startedAt: new Date() })
      .where(
        and(
          eq(runs.id, job.runId),
          eq(runs.workspaceId, job.workspaceId),
          eq(runs.projectId, job.projectId),
          eq(runs.status, "queued"),
        ),
      )
      .returning({ conversationId: runs.conversationId })
  )[0];

  if (!claimed) {
    const existing = (
      await deps.db.select({ status: runs.status }).from(runs).where(eq(runs.id, job.runId))
    )[0];
    return (existing?.status as RunStatus | undefined) ?? "failed";
  }

  await emit(deps, { runId: job.runId, workspaceId: job.workspaceId, type: "run.started" });

  try {
    const request = (
      await deps.db
        .select({ content: conversationMessages.content })
        .from(conversationMessages)
        .where(
          and(
            eq(conversationMessages.workspaceId, job.workspaceId),
            eq(conversationMessages.conversationId, claimed.conversationId),
            eq(conversationMessages.role, "user"),
          ),
        )
        .orderBy(desc(conversationMessages.createdAt))
        .limit(1)
    )[0];

    if (!request) {
      return finalizeFailure(deps, job, 0, "NOT_FOUND");
    }

    await emit(deps, { runId: job.runId, workspaceId: job.workspaceId, type: "agent.started" });
    const result = await generatePlanningTurn({
      adapter: deps.adapter,
      isCancelled: () => isCancelRequested(deps, job.runId),
      limits: deps.limits,
      model: deps.model,
      onDelta: (textDelta) =>
        emit(deps, {
          runId: job.runId,
          textDelta,
          type: "assistant.delta",
          workspaceId: job.workspaceId,
        }),
      userRequest: request.content,
    });

    if (!result.ok) {
      if (result.code === "cancelled") {
        return finalizeFailure(deps, job, result.attempts, null, "cancelled");
      }
      const eventType: RunEventType | undefined =
        result.code === "refused"
          ? "agent.refused"
          : result.code === "limit_exceeded"
            ? "agent.limit_exceeded"
            : undefined;
      if (eventType) {
        await emit(deps, { runId: job.runId, workspaceId: job.workspaceId, type: eventType });
      }
      return finalizeFailure(deps, job, result.attempts, failureErrorCode(result.code));
    }

    const events = await deps.db.transaction(async (tx) => {
      const message = (
        await tx
          .insert(conversationMessages)
          .values({
            content: result.plan.content,
            conversationId: claimed.conversationId,
            role: "assistant",
            workspaceId: job.workspaceId,
          })
          .returning({ id: conversationMessages.id })
      )[0];
      if (!message) throw new Error("assistant message insert returned no row");

      await tx
        .update(runs)
        .set({
          assistantMessageId: message.id,
          completionTokens: result.usage.outputTokens,
          errorCode: null,
          finishedAt: new Date(),
          modelConfigKey: deps.modelConfigKey,
          promptTokens: result.usage.inputTokens,
          promptVersion: PLANNING_PROMPT_VERSION,
          providerAttempts: result.attempts,
          providerCostMicros: result.usage.costMicros,
          status: "succeeded",
          stepCount: 4,
        })
        .where(eq(runs.id, job.runId));

      const completedInput: AppendRunEventInput = {
        runId: job.runId,
        type: "assistant.completed",
        workspaceId: job.workspaceId,
      };
      const terminalInput: AppendRunEventInput = {
        runId: job.runId,
        type: "run.succeeded",
        workspaceId: job.workspaceId,
      };
      const completed = await appendRunEvent(tx, completedInput);
      const terminal = await appendRunEvent(tx, terminalInput);
      return [payloadFor(completedInput, completed), payloadFor(terminalInput, terminal)];
    });

    for (const event of events) await publishRunEvent(deps.redis, job.runId, event);
    return "succeeded";
  } catch {
    return finalizeFailure(deps, job, 0, "INTERNAL_ERROR");
  }
}

async function finalizeFailure(
  deps: ProcessorDeps,
  job: RunJobData,
  attempts: number,
  errorCode: string | null,
  status: "failed" | "cancelled" = "failed",
): Promise<RunStatus> {
  await deps.db
    .update(runs)
    .set({
      errorCode,
      finishedAt: new Date(),
      modelConfigKey: deps.modelConfigKey,
      promptVersion: PLANNING_PROMPT_VERSION,
      providerAttempts: attempts,
      status,
    })
    .where(eq(runs.id, job.runId));
  const eventType = status === "cancelled" ? "run.cancelled" : "run.failed";
  await emit(deps, {
    runId: job.runId,
    workspaceId: job.workspaceId,
    type: eventType,
    ...(errorCode ? { errorCode } : {}),
  });
  void runEventLabel({ type: eventType });
  return status;
}
