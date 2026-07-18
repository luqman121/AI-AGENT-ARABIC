import { conversations, runEvents, runs } from "@wakil/db/schema";
import {
  failure,
  startRunInputSchema,
  success,
  type ActionFailure,
  type ActionResult,
  type RunJobData,
} from "@wakil/shared";
import { and, asc, eq } from "drizzle-orm";
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
    requestHash: hashRequest("run.start", { projectId: input.projectId }),
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

      const run = (
        await tx
          .insert(runs)
          .values({
            conversationId: conversation.id,
            createdByUserId: ctx.userId,
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
