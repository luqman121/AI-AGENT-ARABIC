import {
  generatePlanningTurn,
  generateStaticSite,
  type PlanningLimits,
  type StaticSiteGenerationLimits,
} from "@wakil/agent-core";
import {
  artifactObjectKeys,
  buildStaticSiteBundle,
  type ArtifactBundle,
  type ArtifactObjectKeys,
} from "@wakil/artifacts";
import type { createDatabaseClient } from "@wakil/db/client";
import { artifacts, conversationMessages, runs } from "@wakil/db/schema";
import type { ModelProviderAdapter } from "@wakil/model-router";
import { SandboxError, type SandboxAdapter, type SandboxLimits } from "@wakil/sandbox";
import {
  runEventLabel,
  type RunEventPayload,
  type RunEventType,
  type RunJobData,
  type RunStatus,
} from "@wakil/shared";
import { PLANNING_PROMPT_VERSION, STATIC_SITE_PROMPT_VERSION } from "@wakil/skills";
import { and, desc, eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";

import { appendRunEvent, publishRunEvent, type AppendRunEventInput } from "./events.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

type ExecutionDeps = {
  artifactStore: {
    uploadBundle(keys: ArtifactObjectKeys, bundle: ArtifactBundle): Promise<void>;
  };
  generationLimits: StaticSiteGenerationLimits;
  maxZipBytes: number;
  sandbox: SandboxAdapter | null;
  sandboxLimits: SandboxLimits;
};

export type ProcessorDeps = {
  adapter: ModelProviderAdapter;
  db: Database;
  execution?: ExecutionDeps;
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
    ...(input.artifactId ? { artifactId: input.artifactId } : {}),
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

/** Executes one bounded planning or artifact run and returns its terminal status. */
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
      .returning({
        conversationId: runs.conversationId,
        kind: runs.kind,
        parentRunId: runs.parentRunId,
      })
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
        .select({
          content: conversationMessages.content,
          createdAt: conversationMessages.createdAt,
        })
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

    if (!request) return finalizeFailure(deps, job, 0, "NOT_FOUND");
    if (claimed.kind === "execution") {
      return processExecutionRun(deps, job, claimed.parentRunId, request);
    }
    return processPlanningRun(deps, job, claimed.conversationId, request.content);
  } catch {
    return finalizeFailure(deps, job, 0, "INTERNAL_ERROR");
  }
}

async function processPlanningRun(
  deps: ProcessorDeps,
  job: RunJobData,
  conversationId: string,
  userRequest: string,
): Promise<RunStatus> {
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
    userRequest,
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
          conversationId,
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

    return terminalEvents(tx, job, "assistant.completed");
  });

  for (const event of events) await publishRunEvent(deps.redis, job.runId, event);
  return "succeeded";
}

async function processExecutionRun(
  deps: ProcessorDeps,
  job: RunJobData,
  parentRunId: string | null,
  request: { content: string; createdAt: Date },
): Promise<RunStatus> {
  const execution = deps.execution;
  if (!execution || !execution.sandbox || !parentRunId) {
    return finalizeFailure(
      deps,
      job,
      0,
      "SANDBOX_CONFIGURATION_ERROR",
      "failed",
      STATIC_SITE_PROMPT_VERSION,
    );
  }

  const plan = (
    await deps.db
      .select({ content: conversationMessages.content, createdAt: conversationMessages.createdAt })
      .from(runs)
      .innerJoin(
        conversationMessages,
        and(
          eq(conversationMessages.id, runs.assistantMessageId),
          eq(conversationMessages.workspaceId, runs.workspaceId),
        ),
      )
      .where(
        and(
          eq(runs.id, parentRunId),
          eq(runs.workspaceId, job.workspaceId),
          eq(runs.projectId, job.projectId),
          eq(runs.kind, "planning"),
          eq(runs.status, "succeeded"),
        ),
      )
      .limit(1)
  )[0];
  if (!plan || request.createdAt > plan.createdAt) {
    return finalizeFailure(
      deps,
      job,
      0,
      "EXECUTION_PLAN_STALE",
      "failed",
      STATIC_SITE_PROMPT_VERSION,
    );
  }

  await emit(deps, {
    runId: job.runId,
    workspaceId: job.workspaceId,
    type: "artifact.generating",
  });
  const generated = await generateStaticSite({
    adapter: deps.adapter,
    isCancelled: () => isCancelRequested(deps, job.runId),
    limits: execution.generationLimits,
    model: deps.model,
    reviewedPlan: plan.content,
    userRequest: request.content,
  });
  if (!generated.ok) {
    if (generated.code === "cancelled") {
      return finalizeFailure(
        deps,
        job,
        generated.attempts,
        null,
        "cancelled",
        STATIC_SITE_PROMPT_VERSION,
      );
    }
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      failureErrorCode(generated.code),
      "failed",
      STATIC_SITE_PROMPT_VERSION,
    );
  }

  if (await isCancelRequested(deps, job.runId)) {
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      null,
      "cancelled",
      STATIC_SITE_PROMPT_VERSION,
    );
  }

  let sandboxResult: { durationMs: number; provider: "daytona"; sandboxId: string };
  try {
    sandboxResult = await execution.sandbox.validateStaticSite({
      html: generated.html,
      limits: execution.sandboxLimits,
      onCreated: (sandboxId) =>
        emit(deps, {
          runId: job.runId,
          type: "sandbox.created",
          workspaceId: job.workspaceId,
        }).then(() =>
          deps.db
            .update(runs)
            .set({ sandboxId, sandboxProvider: "daytona" })
            .where(eq(runs.id, job.runId))
            .then(() => undefined),
        ),
      runId: job.runId,
    });
  } catch (error) {
    const code = error instanceof SandboxError ? error.code.toUpperCase() : "SANDBOX_UNAVAILABLE";
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      code,
      "failed",
      STATIC_SITE_PROMPT_VERSION,
    );
  }

  await emit(deps, {
    runId: job.runId,
    workspaceId: job.workspaceId,
    type: "sandbox.validated",
  });
  const bundle = buildStaticSiteBundle(generated.html);
  if (bundle.zip.sizeBytes > execution.maxZipBytes) {
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      "ARTIFACT_TOO_LARGE",
      "failed",
      STATIC_SITE_PROMPT_VERSION,
    );
  }
  if (await isCancelRequested(deps, job.runId)) {
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      null,
      "cancelled",
      STATIC_SITE_PROMPT_VERSION,
    );
  }

  const artifactId = randomUUID();
  const keys = artifactObjectKeys({ artifactId, ...job });
  await emit(deps, {
    runId: job.runId,
    workspaceId: job.workspaceId,
    type: "artifact.uploading",
  });
  try {
    await execution.artifactStore.uploadBundle(keys, bundle);
  } catch {
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      "STORAGE_UNAVAILABLE",
      "failed",
      STATIC_SITE_PROMPT_VERSION,
    );
  }

  const events = await deps.db.transaction(async (tx) => {
    await tx.insert(artifacts).values({
      downloadChecksumSha256: bundle.zip.checksumSha256,
      downloadMediaType: bundle.zip.mediaType,
      downloadObjectKey: keys.zipKey,
      downloadSizeBytes: bundle.zip.sizeBytes,
      id: artifactId,
      kind: "static_site",
      previewChecksumSha256: bundle.preview.checksumSha256,
      previewMediaType: bundle.preview.mediaType,
      previewObjectKey: keys.previewKey,
      previewSizeBytes: bundle.preview.sizeBytes,
      projectId: job.projectId,
      runId: job.runId,
      workspaceId: job.workspaceId,
    });
    const message = (
      await tx
        .insert(conversationMessages)
        .values({
          content: generated.summary,
          conversationId: (
            await tx.select({ id: runs.conversationId }).from(runs).where(eq(runs.id, job.runId))
          )[0]!.id,
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
        completionTokens: generated.usage.outputTokens,
        errorCode: null,
        finishedAt: new Date(),
        modelConfigKey: deps.modelConfigKey,
        promptTokens: generated.usage.inputTokens,
        promptVersion: STATIC_SITE_PROMPT_VERSION,
        providerAttempts: generated.attempts,
        providerCostMicros: generated.usage.costMicros,
        sandboxDurationMs: sandboxResult.durationMs,
        sandboxId: sandboxResult.sandboxId,
        sandboxProvider: sandboxResult.provider,
        status: "succeeded",
        stepCount: 7,
      })
      .where(eq(runs.id, job.runId));

    return terminalEvents(tx, job, "artifact.ready", artifactId);
  });
  for (const event of events) await publishRunEvent(deps.redis, job.runId, event);
  return "succeeded";
}

async function terminalEvents(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  job: RunJobData,
  firstType: "artifact.ready" | "assistant.completed",
  artifactId?: string,
): Promise<RunEventPayload[]> {
  const inputs: AppendRunEventInput[] = [
    {
      ...(artifactId ? { artifactId } : {}),
      runId: job.runId,
      type: firstType,
      workspaceId: job.workspaceId,
    },
    { runId: job.runId, type: "run.succeeded", workspaceId: job.workspaceId },
  ];
  const payloads: RunEventPayload[] = [];
  for (const input of inputs) {
    payloads.push(payloadFor(input, await appendRunEvent(tx, input)));
  }
  return payloads;
}

async function finalizeFailure(
  deps: ProcessorDeps,
  job: RunJobData,
  attempts: number,
  errorCode: string | null,
  status: "failed" | "cancelled" = "failed",
  promptVersion = PLANNING_PROMPT_VERSION,
): Promise<RunStatus> {
  await deps.db
    .update(runs)
    .set({
      errorCode,
      finishedAt: new Date(),
      modelConfigKey: deps.modelConfigKey,
      promptVersion,
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
