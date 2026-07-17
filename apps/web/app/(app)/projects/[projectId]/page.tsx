import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAuthorizedContext } from "../../../../src/server/auth/session";
import { getDatabase } from "../../../../src/server/db";
import { getProjectConversation } from "../../../../src/server/features/conversations/queries";
import { getProjectById } from "../../../../src/server/features/projects/queries";
import { ConversationView } from "./conversation-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  const ctx = await requireAuthorizedContext();
  const project = await getProjectById(getDatabase(), ctx, projectId);
  return { title: project?.title ?? "المشروع غير موجود" };
}

export default async function ProjectConversationPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const ctx = await requireAuthorizedContext();

  // A missing project and a cross-tenant project produce the same 404.
  const conversation = await getProjectConversation(getDatabase(), ctx, projectId);
  if (!conversation) notFound();

  return (
    <ConversationView
      archived={conversation.project.status === "archived"}
      messages={conversation.messages.map((message) => ({
        content: message.content,
        createdAtIso: message.createdAt.toISOString(),
        id: message.id,
      }))}
      projectId={conversation.project.id}
      title={conversation.project.title}
    />
  );
}
