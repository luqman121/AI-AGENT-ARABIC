import { AppHeader, EmptyState, PageShell } from "@wakil/ui";
import { MonitorPlay } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAuthorizedContext } from "../../../../../src/server/auth/session";
import { getDatabase } from "../../../../../src/server/db";
import { getProjectById } from "../../../../../src/server/features/projects/queries";
import { BackToProjectButton } from "./back-button";

export const metadata: Metadata = {
  title: "المعاينة",
};

/** Truthful preview shell: no artifact exists before execution (M2+). */
export default async function ProjectPreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const ctx = await requireAuthorizedContext();
  const project = await getProjectById(getDatabase(), ctx, projectId);
  if (!project) notFound();

  return (
    <>
      <AppHeader
        title={`معاينة: ${project.title}`}
        start={<BackToProjectButton projectId={project.id} />}
      />
      <PageShell>
        <EmptyState
          icon={MonitorPlay}
          title="لا توجد معاينة بعد"
          description="لم يُنفَّذ هذا المشروع حتى الآن. عند توفر التنفيذ في مرحلة قادمة، ستظهر المعاينة هنا."
        />
      </PageShell>
    </>
  );
}
