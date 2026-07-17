import { conversationMessages, conversations } from "@wakil/db/schema";
import { and, asc, eq } from "drizzle-orm";

import { getProjectById, type ProjectRecord } from "../projects/queries";
import type { Database, ServiceContext } from "../types";

export type ConversationMessageRecord = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
};

export type ProjectConversation = {
  project: ProjectRecord;
  conversationId: string;
  messages: ConversationMessageRecord[];
};

/** Tenant-scoped conversation read; null hides cross-tenant existence. */
export async function getProjectConversation(
  db: Database,
  ctx: ServiceContext,
  projectId: string,
): Promise<ProjectConversation | null> {
  const project = await getProjectById(db, ctx, projectId);
  if (!project) return null;

  const conversation = (
    await db
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
  if (!conversation) return null;

  const messages = await db
    .select({
      content: conversationMessages.content,
      createdAt: conversationMessages.createdAt,
      id: conversationMessages.id,
      role: conversationMessages.role,
    })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, conversation.id),
        eq(conversationMessages.workspaceId, ctx.workspaceId),
      ),
    )
    .orderBy(asc(conversationMessages.createdAt));

  return { conversationId: conversation.id, messages, project };
}
