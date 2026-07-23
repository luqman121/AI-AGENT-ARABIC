import {
  generateFileArtifact,
  generatePlanningTurn,
  generateStaticSiteWithReview,
  type PlanningLimits,
  type SkillsRuntimeRunInfo,
  type StaticSiteGenerationLimits,
} from "@wakil/agent-core";
import {
  artifactObjectKeys,
  buildStaticSiteBundle,
  type ArtifactBundle,
  type ArtifactObjectKeys,
} from "@wakil/artifacts";
import {
  buildGeneratedFileBundle,
  extractAttachmentText,
  type GeneratedFileBundle,
} from "@wakil/artifacts/file-artifacts";
import type { createDatabaseClient } from "@wakil/db/client";
import {
  artifacts,
  conversationMessages,
  messageAttachments,
  projects,
  runs,
} from "@wakil/db/schema";
import type { ModelProviderAdapter } from "@wakil/model-router";
import { SandboxError, type SandboxAdapter, type SandboxLimits } from "@wakil/sandbox";
import {
  runEventLabel,
  type OutputKind,
  type RunEventPayload,
  type RunEventType,
  type RunJobData,
  type RunStatus,
} from "@wakil/shared";
import {
  FILE_ARTIFACT_PROMPT_VERSION,
  PLANNING_PROMPT_VERSION,
  STATIC_SITE_PROMPT_VERSION,
  type FileArtifactKind,
} from "@wakil/skills";
import { and, desc, eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

import { appendRunEvent, publishRunEvent, type AppendRunEventInput } from "./events.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

type ExecutionDeps = {
  artifactStore: {
    readPrivateObject(key: string, maxBytes?: number): Promise<Uint8Array>;
    uploadBundle(keys: ArtifactObjectKeys, bundle: ArtifactBundle): Promise<void>;
    uploadGeneratedFile(keys: ArtifactObjectKeys, bundle: GeneratedFileBundle): Promise<void>;
  };
  generationLimits: StaticSiteGenerationLimits;
  maxZipBytes: number;
  sandbox: SandboxAdapter | null;
  sandboxLimits: SandboxLimits;
};

/**
 * Feature-flagged Skills Runtime configuration for website generation. Off
 * (`enabled: false` or omitted) reproduces the exact legacy prompt path.
 */
export type SkillsRuntimeConfig = {
  enabled: boolean;
  maxPromptTokens?: number;
  maxRepairAttempts?: number;
};

/** Minimal structured-logging seam; defaults to a no-op so tests need not supply one. */
export type ProcessorLogger = {
  info: (fields: Record<string, unknown>, message: string) => void;
};

export type ProcessorDeps = {
  adapter: ModelProviderAdapter;
  db: Database;
  execution?: ExecutionDeps;
  limits: PlanningLimits;
  logger?: ProcessorLogger;
  model: string;
  modelConfigKey: string;
  redis: Redis;
  skillsRuntime?: SkillsRuntimeConfig;
};

const noopLogger: ProcessorLogger = { info: () => {} };

/**
 * Logs admin-only skills-runtime metadata (ids, versions, token estimate,
 * review outcome) — never the customer's request text, the full prompt, or
 * raw skill instruction bodies.
 */
function logSkillsRuntime(
  deps: ProcessorDeps,
  runId: string,
  info: SkillsRuntimeRunInfo,
  review?: { passed: boolean; score: number; repairAttempts: number },
): void {
  if (!info.enabled) return;
  (deps.logger ?? noopLogger).info(
    {
      artifactType: info.artifactType,
      estimatedInstructionTokens: info.estimatedInstructionTokens,
      fallbackUsed: info.fallbackUsed,
      locale: info.locale,
      modelProvider: deps.modelConfigKey,
      promptVersion: info.promptVersion,
      review,
      rtl: info.rtl,
      runId,
      skillIds: info.skillIds,
      skillVersions: info.skillVersions,
      skipped: info.skipped,
      used: info.used,
      validationProfile: info.validationProfile,
    },
    "skills_runtime.website",
  );
}

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

const FILE_OUTPUT_KINDS = new Set<OutputKind>(["pdf", "document", "spreadsheet", "presentation"]);

const FILE_EXTENSIONS: Record<FileArtifactKind, string> = {
  pdf: "pdf",
  document: "docx",
  spreadsheet: "xlsx",
  presentation: "pptx",
};

const ANALYZABLE_MEDIA_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/plain",
]);

async function sourceContextForMessage(
  deps: ProcessorDeps,
  job: RunJobData,
  messageId: string,
): Promise<string> {
  const execution = deps.execution;
  if (!execution) return "";
  const rows = await deps.db
    .select({
      checksumSha256: messageAttachments.checksumSha256,
      mediaType: messageAttachments.mediaType,
      objectKey: messageAttachments.objectKey,
      originalName: messageAttachments.originalName,
    })
    .from(messageAttachments)
    .where(
      and(
        eq(messageAttachments.workspaceId, job.workspaceId),
        eq(messageAttachments.projectId, job.projectId),
        eq(messageAttachments.messageId, messageId),
        eq(messageAttachments.status, "ready"),
      ),
    )
    .limit(6);
  const parts: string[] = [];
  for (const row of rows) {
    if (!ANALYZABLE_MEDIA_TYPES.has(row.mediaType)) continue;
    const bytes = await execution.artifactStore.readPrivateObject(row.objectKey);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== row.checksumSha256) throw new Error("Attachment checksum mismatch");
    const text = await extractAttachmentText({
      bytes,
      mediaType: row.mediaType,
      name: row.originalName,
    });
    if (text) parts.push(`[الملف: ${row.originalName}]\n${text}`);
  }
  return parts.join("\n\n").slice(0, 48_000);
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
          id: conversationMessages.id,
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
    const project = (
      await deps.db
        .select({ outputKind: projects.outputKind })
        .from(projects)
        .where(and(eq(projects.id, job.projectId), eq(projects.workspaceId, job.workspaceId)))
        .limit(1)
    )[0];
    if (!project) return finalizeFailure(deps, job, 0, "NOT_FOUND");
    const outputKind = project.outputKind as OutputKind;
    const sourceContext = FILE_OUTPUT_KINDS.has(outputKind)
      ? await sourceContextForMessage(deps, job, request.id)
      : "";
    if (claimed.kind === "execution") {
      return processExecutionRun(
        deps,
        job,
        claimed.parentRunId,
        request,
        outputKind,
        sourceContext,
      );
    }
    return processPlanningRun(
      deps,
      job,
      claimed.conversationId,
      request.content,
      outputKind,
      sourceContext,
    );
  } catch {
    return finalizeFailure(deps, job, 0, "INTERNAL_ERROR");
  }
}

async function processPlanningRun(
  deps: ProcessorDeps,
  job: RunJobData,
  conversationId: string,
  userRequest: string,
  outputKind: OutputKind,
  sourceContext: string,
): Promise<RunStatus> {
  await emit(deps, { runId: job.runId, workspaceId: job.workspaceId, type: "agent.started" });
  const result = await generatePlanningTurn({
    adapter: deps.adapter,
    isCancelled: () => isCancelRequested(deps, job.runId),
    limits: deps.limits,
    model: deps.model,
    outputKind,
    onDelta: (textDelta) =>
      emit(deps, {
        runId: job.runId,
        textDelta,
        type: "assistant.delta",
        workspaceId: job.workspaceId,
      }),
    ...(sourceContext ? { sourceContext } : {}),
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

  const completedEvents = await deps.db.transaction(async (tx) => {
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

  for (const event of completedEvents) {
    await publishRunEvent(deps.redis, job.runId, event);
  }
  return "succeeded";
}

async function processExecutionRun(
  deps: ProcessorDeps,
  job: RunJobData,
  parentRunId: string | null,
  request: { content: string; createdAt: Date },
  outputKind: OutputKind,
  sourceContext: string,
): Promise<RunStatus> {
  const execution = deps.execution;
  const promptVersion = FILE_OUTPUT_KINDS.has(outputKind)
    ? FILE_ARTIFACT_PROMPT_VERSION
    : STATIC_SITE_PROMPT_VERSION;
  if (!execution || !parentRunId) {
    return finalizeFailure(deps, job, 0, "EXECUTION_CONFIGURATION_ERROR", "failed", promptVersion);
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
    return finalizeFailure(deps, job, 0, "EXECUTION_PLAN_STALE", "failed", promptVersion);
  }

  if (FILE_OUTPUT_KINDS.has(outputKind)) {
    return processFileExecutionRun(
      deps,
      job,
      execution,
      outputKind as FileArtifactKind,
      request.content,
      plan.content,
      sourceContext,
    );
  }

  if (outputKind !== "static_site" || !execution.sandbox) {
    return finalizeFailure(
      deps,
      job,
      0,
      "OUTPUT_KIND_UNSUPPORTED",
      "failed",
      STATIC_SITE_PROMPT_VERSION,
    );
  }

  await emit(deps, {
    runId: job.runId,
    workspaceId: job.workspaceId,
    type: "artifact.generating",
  });
  const runtimeFlag = deps.skillsRuntime;
  const generated = await generateStaticSiteWithReview({
    adapter: deps.adapter,
    ...(runtimeFlag?.enabled
      ? {
          designReview: {
            enabled: true,
            ...(runtimeFlag.maxRepairAttempts !== undefined
              ? { maxRepairAttempts: runtimeFlag.maxRepairAttempts }
              : {}),
          },
          skillsRuntime: {
            enabled: true,
            ...(runtimeFlag.maxPromptTokens !== undefined
              ? { maxPromptTokens: runtimeFlag.maxPromptTokens }
              : {}),
          },
        }
      : {}),
    isCancelled: () => isCancelRequested(deps, job.runId),
    limits: execution.generationLimits,
    model: deps.model,
    reviewedPlan: plan.content,
    userRequest: request.content,
  });
  logSkillsRuntime(
    deps,
    job.runId,
    generated.skillsRuntime,
    generated.review
      ? {
          passed: generated.review.passed,
          repairAttempts: generated.repairAttempts,
          score: generated.review.score,
        }
      : undefined,
  );
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

  // The Design Critic gate: a design must not be marked ready while blocking
  // issues remain, even after the bounded repair passes. This never fires
  // when the skills runtime is disabled (`generated.review` is only set when
  // design review was enabled), so the legacy path is entirely unaffected.
  if (generated.review && !generated.review.passed) {
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      "DESIGN_VALIDATION_FAILED",
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

async function processFileExecutionRun(
  deps: ProcessorDeps,
  job: RunJobData,
  execution: ExecutionDeps,
  kind: FileArtifactKind,
  userRequest: string,
  reviewedPlan: string,
  sourceContext: string,
): Promise<RunStatus> {
  await emit(deps, {
    runId: job.runId,
    workspaceId: job.workspaceId,
    type: "artifact.generating",
  });
  const generated = await generateFileArtifact({
    adapter: deps.adapter,
    isCancelled: () => isCancelRequested(deps, job.runId),
    kind,
    limits: execution.generationLimits,
    model: deps.model,
    reviewedPlan,
    ...(sourceContext ? { sourceContext } : {}),
    userRequest,
  });
  if (!generated.ok) {
    if (generated.code === "cancelled") {
      return finalizeFailure(
        deps,
        job,
        generated.attempts,
        null,
        "cancelled",
        FILE_ARTIFACT_PROMPT_VERSION,
      );
    }
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      failureErrorCode(generated.code),
      "failed",
      FILE_ARTIFACT_PROMPT_VERSION,
    );
  }

  let bundle: GeneratedFileBundle;
  try {
    bundle = await buildGeneratedFileBundle(kind, generated.draft);
  } catch {
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      "ARTIFACT_GENERATION_ERROR",
      "failed",
      FILE_ARTIFACT_PROMPT_VERSION,
    );
  }
  if (bundle.preview.sizeBytes > 500_000 || bundle.download.sizeBytes > execution.maxZipBytes) {
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      "ARTIFACT_TOO_LARGE",
      "failed",
      FILE_ARTIFACT_PROMPT_VERSION,
    );
  }
  if (await isCancelRequested(deps, job.runId)) {
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      null,
      "cancelled",
      FILE_ARTIFACT_PROMPT_VERSION,
    );
  }

  const artifactId = randomUUID();
  const keys = artifactObjectKeys({
    artifactId,
    downloadExtension: FILE_EXTENSIONS[kind],
    ...job,
  });
  await emit(deps, {
    runId: job.runId,
    workspaceId: job.workspaceId,
    type: "artifact.uploading",
  });
  try {
    await execution.artifactStore.uploadGeneratedFile(keys, bundle);
  } catch {
    return finalizeFailure(
      deps,
      job,
      generated.attempts,
      "STORAGE_UNAVAILABLE",
      "failed",
      FILE_ARTIFACT_PROMPT_VERSION,
    );
  }

  const events = await deps.db.transaction(async (tx) => {
    await tx.insert(artifacts).values({
      downloadChecksumSha256: bundle.download.checksumSha256,
      downloadMediaType: bundle.download.mediaType,
      downloadObjectKey: keys.zipKey,
      downloadSizeBytes: bundle.download.sizeBytes,
      fileName: bundle.fileName,
      id: artifactId,
      kind,
      previewChecksumSha256: bundle.preview.checksumSha256,
      previewMediaType: bundle.preview.mediaType,
      previewObjectKey: keys.previewKey,
      previewSizeBytes: bundle.preview.sizeBytes,
      projectId: job.projectId,
      runId: job.runId,
      title: bundle.title,
      workspaceId: job.workspaceId,
    });
    const conversation = (
      await tx.select({ id: runs.conversationId }).from(runs).where(eq(runs.id, job.runId))
    )[0];
    if (!conversation) throw new Error("run conversation missing");
    const message = (
      await tx
        .insert(conversationMessages)
        .values({
          content: bundle.summary,
          conversationId: conversation.id,
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
        promptVersion: FILE_ARTIFACT_PROMPT_VERSION,
        providerAttempts: generated.attempts,
        providerCostMicros: generated.usage.costMicros,
        status: "succeeded",
        stepCount: 5,
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
