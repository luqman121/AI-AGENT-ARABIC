import { conversationMessages, conversations, projects } from "@wakil/db/schema";
import {
  appendRequirementInputSchema,
  failure,
  success,
  type ActionFailure,
  type ActionResult,
} from "@wakil/shared";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { writeAuditLog } from "../audit/service";
import { beginIdempotent, completeIdempotent, hashRequest } from "../idempotency/service";
import { enforceRateLimit } from "../rate-limit/service";
import type { MutationDeps } from "../projects/mutations";
import type { ServiceContext } from "../types";

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

/** Appends a user-authored requirement; M1 never writes assistant messages. */
export async function appendRequirement(
  deps: MutationDeps,
  ctx: ServiceContext,
  rawInput: unknown,
): Promise<ActionResult<{ messageId: string }>> {
  const parsed = appendRequirementInputSchema.safeParse(rawInput);
  if (!parsed.success) return failure("VALIDATION_FAILED", zodFieldErrors(parsed.error));
  const input = parsed.data;

  const limited = await enforceRateLimit(deps.redis, ctx.userId, "conversation.append");
  if (limited) return limited;

  const scope = {
    key: input.idempotencyKey,
    operation: "conversation.append",
    requestHash: hashRequest("conversation.append", {
      content: input.content,
      projectId: input.projectId,
    }),
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  };

  try {
    return await deps.db.transaction(async (tx) => {
      const claim = await beginIdempotent(tx, scope);
      if (claim.kind === "conflict") throw new ServiceFailure(failure("IDEMPOTENCY_CONFLICT"));
      if (claim.kind === "replay") {
        const messageId = claim.response["messageId"];
        if (!messageId) throw new ServiceFailure(failure("INTERNAL_ERROR"));
        return success({ messageId });
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

      const message = (
        await tx
          .insert(conversationMessages)
          .values({
            content: input.content,
            conversationId: conversation.id,
            role: "user",
            workspaceId: ctx.workspaceId,
          })
          .returning({ id: conversationMessages.id })
      )[0];
      if (!message) throw new ServiceFailure(failure("INTERNAL_ERROR"));

      const now = new Date();
      await tx
        .update(conversations)
        .set({ updatedAt: now })
        .where(eq(conversations.id, conversation.id));
      await tx
        .update(projects)
        .set({ updatedAt: now })
        .where(and(eq(projects.id, project.id), eq(projects.workspaceId, ctx.workspaceId)));

      await writeAuditLog(tx, {
        action: "requirement.appended",
        actorUserId: ctx.userId,
        metadata: { contentLength: input.content.length },
        targetId: conversation.id,
        targetType: "conversation",
        workspaceId: ctx.workspaceId,
      });

      await completeIdempotent(tx, scope, { messageId: message.id });
      return success({ messageId: message.id });
    });
  } catch (error) {
    if (error instanceof ServiceFailure) return error.result;
    return failure("INTERNAL_ERROR");
  }
}
