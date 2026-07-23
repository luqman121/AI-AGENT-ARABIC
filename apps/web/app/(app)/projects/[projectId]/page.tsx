import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAuthorizedContext } from "../../../../src/server/auth/session";
import { getDatabase } from "../../../../src/server/db";
import { listProjectArtifacts } from "../../../../src/server/features/artifacts/queries";
import { getProjectConversation } from "../../../../src/server/features/conversations/queries";
import { getProjectById, listProjects } from "../../../../src/server/features/projects/queries";
import { getLatestRun, getRunEventsAfter } from "../../../../src/server/features/runs/queries";
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
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ autostart?: string }>;
}) {
  const { projectId } = await params;
  const { autostart } = await searchParams;
  const ctx = await requireAuthorizedContext();

  // A missing project and a cross-tenant project produce the same 404.
  const conversation = await getProjectConversation(getDatabase(), ctx, projectId);
  if (!conversation) notFound();

  const latestRun = await getLatestRun(getDatabase(), ctx, projectId);
  const initialEvents = latestRun
    ? await getRunEventsAfter(getDatabase(), ctx, projectId, latestRun.id, 0)
    : [];
  const projectArtifacts = await listProjectArtifacts(getDatabase(), ctx, projectId);
  const recentProjects = await listProjects(getDatabase(), ctx, { filter: "active", query: "" });

  return (
    <ConversationView
      archived={conversation.project.status === "archived"}
      autoStart={autostart === "1" && !latestRun}
      initialEvents={initialEvents}
      initialRun={latestRun}
      artifacts={projectArtifacts.map((artifact) => ({
        createdAtIso: artifact.createdAt.toISOString(),
        downloadSizeBytes: artifact.downloadSizeBytes,
        id: artifact.id,
        kind: artifact.kind,
      }))}
      messages={conversation.messages.map((message) => ({
        content: message.content,
        createdAtIso: message.createdAt.toISOString(),
        id: message.id,
        role: message.role,
      }))}
      projectId={conversation.project.id}
      recentProjects={recentProjects
        .filter((project) => project.id !== conversation.project.id)
        .slice(0, 6)
        .map((project) => ({
          excerpt: project.excerpt,
          id: project.id,
          title: project.title,
          updatedAtIso: project.updatedAt.toISOString(),
        }))}
      title={conversation.project.title}
    />
  );
}
