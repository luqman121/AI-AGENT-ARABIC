import { conversationMessages, conversations, projects } from "@wakil/db/schema";
import {
  archiveProjectInputSchema,
  createProjectInputSchema,
  failure,
  renameProjectInputSchema,
  success,
  type ActionFailure,
  type ActionResult,
} from "@wakil/shared";
import { and, eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { z } from "zod";

import { writeAuditLog } from "../audit/service";
import { beginIdempotent, completeIdempotent, hashRequest } from "../idempotency/service";
import { enforceRateLimit } from "../rate-limit/service";
import type { Database, ServiceContext } from "../types";

export type MutationDeps = {
  db: Database;
  redis: Redis;
};

/** Thrown inside a transaction to roll everything back with a typed result. */
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

/** Falls back to the request's leading text (word-boundary truncated) when no title was given. */
function deriveProjectTitle(request: string): string {
  const normalized = request.replace(/\s+/g, " ").trim();
  const MAX_LENGTH = 80;
  if (normalized.length <= MAX_LENGTH) return normalized;
  const truncated = normalized.slice(0, MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  const base = lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated;
  return `${base}…`;
}

async function runMutation<T>(operation: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ServiceFailure) return error.result;
    return failure("INTERNAL_ERROR");
  }
}

export async function createProject(
  deps: MutationDeps,
  ctx: ServiceContext,
  rawInput: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  const parsed = createProjectInputSchema.safeParse(rawInput);
  if (!parsed.success) return failure("VALIDATION_FAILED", zodFieldErrors(parsed.error));
  const input = parsed.data;
  const title = input.title ?? deriveProjectTitle(input.request);

  const limited = await enforceRateLimit(deps.redis, ctx.userId, "project.create");
  if (limited) return limited;

  const scope = {
    key: input.idempotencyKey,
    operation: "project.create",
    requestHash: hashRequest("project.create", {
      outputKind: input.outputKind,
      request: input.request,
      title,
    }),
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  };

  return runMutation(async () =>
    deps.db.transaction(async (tx) => {
      const claim = await beginIdempotent(tx, scope);
      if (claim.kind === "conflict") throw new ServiceFailure(failure("IDEMPOTENCY_CONFLICT"));
      if (claim.kind === "replay") {
        const projectId = claim.response["projectId"];
        if (!projectId) throw new ServiceFailure(failure("INTERNAL_ERROR"));
        return success({ projectId });
      }

      const project = (
        await tx
          .insert(projects)
          .values({
            createdByUserId: ctx.userId,
            outputKind: input.outputKind,
            title,
            workspaceId: ctx.workspaceId,
          })
          .returning({ id: projects.id })
      )[0];
      if (!project) throw new ServiceFailure(failure("INTERNAL_ERROR"));

      const conversation = (
        await tx
          .insert(conversations)
          .values({ projectId: project.id, workspaceId: ctx.workspaceId })
          .returning({ id: conversations.id })
      )[0];
      if (!conversation) throw new ServiceFailure(failure("INTERNAL_ERROR"));

      await tx.insert(conversationMessages).values({
        content: input.request,
        conversationId: conversation.id,
        role: "user",
        workspaceId: ctx.workspaceId,
      });

      await writeAuditLog(tx, {
        action: "project.created",
        actorUserId: ctx.userId,
        metadata: { requestLength: input.request.length, titleLength: title.length },
        targetId: project.id,
        targetType: "project",
        workspaceId: ctx.workspaceId,
      });

      await completeIdempotent(tx, scope, { projectId: project.id });
      return success({ projectId: project.id });
    }),
  );
}

export async function renameProject(
  deps: MutationDeps,
  ctx: ServiceContext,
  rawInput: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  const parsed = renameProjectInputSchema.safeParse(rawInput);
  if (!parsed.success) return failure("VALIDATION_FAILED", zodFieldErrors(parsed.error));
  const input = parsed.data;

  const limited = await enforceRateLimit(deps.redis, ctx.userId, "project.rename");
  if (limited) return limited;

  const scope = {
    key: input.idempotencyKey,
    operation: "project.rename",
    requestHash: hashRequest("project.rename", {
      projectId: input.projectId,
      title: input.title,
    }),
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  };

  return runMutation(async () =>
    deps.db.transaction(async (tx) => {
      const claim = await beginIdempotent(tx, scope);
      if (claim.kind === "conflict") throw new ServiceFailure(failure("IDEMPOTENCY_CONFLICT"));
      if (claim.kind === "replay") {
        const projectId = claim.response["projectId"];
        if (!projectId) throw new ServiceFailure(failure("INTERNAL_ERROR"));
        return success({ projectId });
      }

      const project = (
        await tx
          .select({ id: projects.id, status: projects.status })
          .from(projects)
          .where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, ctx.workspaceId)))
          .limit(1)
      )[0];
      if (!project) throw new ServiceFailure(failure("NOT_FOUND"));
      if (project.status !== "active") throw new ServiceFailure(failure("PROJECT_ARCHIVED"));

      await tx
        .update(projects)
        .set({ title: input.title, updatedAt: new Date() })
        .where(and(eq(projects.id, project.id), eq(projects.workspaceId, ctx.workspaceId)));

      await writeAuditLog(tx, {
        action: "project.renamed",
        actorUserId: ctx.userId,
        metadata: { titleLength: input.title.length },
        targetId: project.id,
        targetType: "project",
        workspaceId: ctx.workspaceId,
      });

      await completeIdempotent(tx, scope, { projectId: project.id });
      return success({ projectId: project.id });
    }),
  );
}

export async function archiveProject(
  deps: MutationDeps,
  ctx: ServiceContext,
  rawInput: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  const parsed = archiveProjectInputSchema.safeParse(rawInput);
  if (!parsed.success) return failure("VALIDATION_FAILED", zodFieldErrors(parsed.error));
  const input = parsed.data;

  const limited = await enforceRateLimit(deps.redis, ctx.userId, "project.archive");
  if (limited) return limited;

  const scope = {
    key: input.idempotencyKey,
    operation: "project.archive",
    requestHash: hashRequest("project.archive", { projectId: input.projectId }),
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  };

  return runMutation(async () =>
    deps.db.transaction(async (tx) => {
      const claim = await beginIdempotent(tx, scope);
      if (claim.kind === "conflict") throw new ServiceFailure(failure("IDEMPOTENCY_CONFLICT"));
      if (claim.kind === "replay") {
        const projectId = claim.response["projectId"];
        if (!projectId) throw new ServiceFailure(failure("INTERNAL_ERROR"));
        return success({ projectId });
      }

      const project = (
        await tx
          .select({ id: projects.id, status: projects.status })
          .from(projects)
          .where(and(eq(projects.id, input.projectId), eq(projects.workspaceId, ctx.workspaceId)))
          .limit(1)
      )[0];
      if (!project) throw new ServiceFailure(failure("NOT_FOUND"));
      if (project.status !== "active") throw new ServiceFailure(failure("PROJECT_ARCHIVED"));

      await tx
        .update(projects)
        .set({ archivedAt: new Date(), status: "archived", updatedAt: new Date() })
        .where(and(eq(projects.id, project.id), eq(projects.workspaceId, ctx.workspaceId)));

      await writeAuditLog(tx, {
        action: "project.archived",
        actorUserId: ctx.userId,
        targetId: project.id,
        targetType: "project",
        workspaceId: ctx.workspaceId,
      });

      await completeIdempotent(tx, scope, { projectId: project.id });
      return success({ projectId: project.id });
    }),
  );
}
