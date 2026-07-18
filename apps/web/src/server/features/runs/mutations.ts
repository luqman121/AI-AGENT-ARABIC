import { conversationMessages, conversations, runEvents, runs } from "@wakil/db/schema";
import {
  cancelRunInputSchema,
  failure,
  startRunInputSchema,
  success,
  type ActionFailure,
  type ActionResult,
  type RunJobData,
} from "@wakil/shared";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Redis } from "ioredis";
import { z } from "zod";

import { writeAuditLog } from "../audit/service";
import { beginIdempotent, completeIdempotent, hashRequest } from "../idempotency/service";
import { getProjectById } from "../projects/queries";
import { enforceRateLimit } from "../rate-limit/service";
import type { Database, ServiceContext } from "../types";

export type RunMutationDeps = {
  db: Database;
  redis: Redis;
  enqueueRun: (job: RunJobData) => Promise<void>;
};

class ServiceFailure extends Error {
  constructor(readonly result: ActionFailure) {
    super(result.code);
  }
}

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fields[field] ??= issue.message;
  }
  return fields;
}

/** PostgreSQL unique_violation on the partial active-run index. */
function isActiveRunConflict(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ("code" in current && (current as { code?: string }).code === "23505") {
      const constraint =
        "constraint_name" in current
          ? (current as { constraint_name?: string }).constraint_name
          : undefined;
      return constraint === undefined || constraint === "runs_one_active_per_project";
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

export async function startRun(
  deps: RunMutationDeps,
  ctx: ServiceContext,
  rawInput: unknown,
): Promise<ActionResult<{ runId: string }>> {
  const parsed = startRunInputSchema.safeParse(rawInput);
  if (!parsed.success) return failure("VALIDATION_FAILED", zodFieldErrors(parsed.error));
  const input = parsed.data;

  const limited = await enforceRateLimit(deps.redis, ctx.userId, "run.start");
  if (limited) return limited;

  const scope = {
    key: input.idempotencyKey,
    operation: "run.start",
    requestHash: hashRequest("run.start", { kind: input.kind, projectId: input.projectId }),
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  };

  let enqueue: RunJobData | null = null;
  try {
    const result = await deps.db.transaction(async (tx) => {
      const claim = await beginIdempotent(tx, scope);
      if (claim.kind === "conflict") {
        throw new ServiceFailure(failure("IDEMPOTENCY_CONFLICT"));
      }
      if (claim.kind === "replay") {
        const runId = claim.response["runId"];
        if (!runId) throw new ServiceFailure(failure("INTERNAL_ERROR"));
        // Retrying a request also retries a previously failed enqueue. BullMQ
        // deduplicates this job by runId when the original enqueue succeeded.
        enqueue = {
          projectId: input.projectId,
          runId,
          workspaceId: ctx.workspaceId,
        };
        return success({ runId });
      }

      const project = await getProjectById(tx as unknown as Database, ctx, input.projectId);
      if (!project) throw new ServiceFailure(failure("NOT_FOUND"));
      if (project.status !== "active") {
        throw new ServiceFailure(failure("PROJECT_ARCHIVED"));
      }

      const conversation = (
        await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.projectId, project.id),
              eq(conversations.workspaceId, ctx.workspaceId),
            ),
          )
          .orderBy(asc(conversations.createdAt))
          .limit(1)
      )[0];
      if (!conversation) throw new ServiceFailure(failure("NOT_FOUND"));

      let parentRunId: string | null = null;
      if (input.kind === "execution") {
        const plan = (
          await tx
            .select({
              assistantCreatedAt: conversationMessages.createdAt,
              id: runs.id,
            })
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
                eq(runs.projectId, project.id),
                eq(runs.workspaceId, ctx.workspaceId),
                eq(runs.kind, "planning"),
                eq(runs.status, "succeeded"),
                isNotNull(runs.assistantMessageId),
              ),
            )
            .orderBy(desc(runs.createdAt))
            .limit(1)
        )[0];
        if (!plan) throw new ServiceFailure(failure("EXECUTION_PLAN_REQUIRED"));

        const latestUser = (
          await tx
            .select({ createdAt: conversationMessages.createdAt })
            .from(conversationMessages)
            .where(
              and(
                eq(conversationMessages.conversationId, conversation.id),
                eq(conversationMessages.workspaceId, ctx.workspaceId),
                eq(conversationMessages.role, "user"),
              ),
            )
            .orderBy(desc(conversationMessages.createdAt))
            .limit(1)
        )[0];
        if (latestUser && latestUser.createdAt > plan.assistantCreatedAt) {
          throw new ServiceFailure(failure("EXECUTION_PLAN_STALE"));
        }
        parentRunId = plan.id;
      }

      const run = (
        await tx
          .insert(runs)
          .values({
            conversationId: conversation.id,
            createdByUserId: ctx.userId,
            kind: input.kind,
            parentRunId,
            projectId: project.id,
            workspaceId: ctx.workspaceId,
          })
          .returning({ id: runs.id })
      )[0];
      if (!run) throw new ServiceFailure(failure("INTERNAL_ERROR"));

      await tx.insert(runEvents).values({
        data: {},
        runId: run.id,
        seq: 1,
        type: "run.queued",
        workspaceId: ctx.workspaceId,
      });

      await writeAuditLog(tx, {
        action: "run.started",
        actorUserId: ctx.userId,
        targetId: run.id,
        targetType: "run",
        workspaceId: ctx.workspaceId,
      });

      await completeIdempotent(tx, scope, { runId: run.id });
      enqueue = {
        projectId: project.id,
        runId: run.id,
        workspaceId: ctx.workspaceId,
      };
      return success({ runId: run.id });
    });

    if (enqueue) await deps.enqueueRun(enqueue);
    return result;
  } catch (error) {
    if (error instanceof ServiceFailure) return error.result;
    if (isActiveRunConflict(error)) return failure("RUN_ALREADY_ACTIVE");
    return failure("INTERNAL_ERROR");
  }
}

export async function cancelRun(
  deps: RunMutationDeps,
  ctx: ServiceContext,
  rawInput: unknown,
): Promise<ActionResult<{ runId: string }>> {
  const parsed = cancelRunInputSchema.safeParse(rawInput);
  if (!parsed.success) return failure("VALIDATION_FAILED", zodFieldErrors(parsed.error));
  const input = parsed.data;

  const limited = await enforceRateLimit(deps.redis, ctx.userId, "run.cancel");
  if (limited) return limited;

  const scope = {
    key: input.idempotencyKey,
    operation: "run.cancel",
    requestHash: hashRequest("run.cancel", {
      projectId: input.projectId,
      runId: input.runId,
    }),
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  };

  try {
    return await deps.db.transaction(async (tx) => {
      const claim = await beginIdempotent(tx, scope);
      if (claim.kind === "conflict") {
        throw new ServiceFailure(failure("IDEMPOTENCY_CONFLICT"));
      }
      if (claim.kind === "replay") return success({ runId: input.runId });

      const run = (
        await tx
          .select({ id: runs.id, status: runs.status })
          .from(runs)
          .where(
            and(
              eq(runs.id, input.runId),
              eq(runs.projectId, input.projectId),
              eq(runs.workspaceId, ctx.workspaceId),
            ),
          )
          .limit(1)
      )[0];
      if (!run) throw new ServiceFailure(failure("NOT_FOUND"));

      if (run.status === "queued" || run.status === "running") {
        const updated = await tx
          .update(runs)
          .set({ cancelRequestedAt: new Date() })
          .where(
            and(
              eq(runs.id, run.id),
              eq(runs.workspaceId, ctx.workspaceId),
              inArray(runs.status, ["queued", "running"]),
            ),
          )
          .returning({ id: runs.id });

        if (updated.length > 0) {
          await writeAuditLog(tx, {
            action: "run.cancelled",
            actorUserId: ctx.userId,
            targetId: run.id,
            targetType: "run",
            workspaceId: ctx.workspaceId,
          });
        }
      }

      await completeIdempotent(tx, scope, { runId: run.id });
      return success({ runId: run.id });
    });
  } catch (error) {
    if (error instanceof ServiceFailure) return error.result;
    return failure("INTERNAL_ERROR");
  }
}
