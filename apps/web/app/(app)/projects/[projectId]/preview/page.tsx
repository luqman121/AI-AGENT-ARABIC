import { projectIdSchema } from "@wakil/shared";
import { Button, AppHeader, EmptyState, PageShell, StatusBanner } from "@wakil/ui";
import { Download, ExternalLink, MonitorPlay } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAuthorizedContext } from "../../../../../src/server/auth/session";
import { getDatabase } from "../../../../../src/server/db";
import { getWebEnv } from "../../../../../src/env";
import {
  getArtifactById,
  getLatestArtifact,
} from "../../../../../src/server/features/artifacts/queries";
import { getArtifactStore } from "../../../../../src/server/features/artifacts/store";
import { getProjectById } from "../../../../../src/server/features/projects/queries";
import { BackToProjectButton } from "./back-button";

export const metadata: Metadata = { title: "المعاينة" };

export default async function ProjectPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ artifact?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  if (!projectIdSchema.safeParse(projectId).success) notFound();
  const ctx = await requireAuthorizedContext();
  const db = getDatabase();
  const project = await getProjectById(db, ctx, projectId);
  if (!project) notFound();
  const artifactId = query.artifact;
  if (artifactId && !projectIdSchema.safeParse(artifactId).success) notFound();
  const artifact = artifactId
    ? await getArtifactById(db, ctx, projectId, artifactId)
    : await getLatestArtifact(db, ctx, projectId);

  if (!artifact) {
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
            description="راجع خطة المشروع ثم ابدأ التنفيذ. ستظهر النتيجة المحفوظة هنا بعد اجتياز التحقق المعزول."
          />
        </PageShell>
      </>
    );
  }

  const artifactStore = getArtifactStore();
  const previewUrl = await artifactStore.signPreview(artifact.previewObjectKey, 300);
  if (new URL(previewUrl).origin === new URL(getWebEnv().AUTH_URL).origin) {
    throw new Error("Artifact preview origin must differ from the application origin");
  }

  return (
    <>
      <AppHeader
        title={`معاينة: ${project.title}`}
        start={<BackToProjectButton projectId={project.id} />}
      />
      <PageShell>
        <StatusBanner className="mb-4" tone="info">
          اجتازت النتيجة التحقق المعزول. المعاينة خاصة ومؤقتة، والتنزيل يمر عبر صلاحيات المشروع.
        </StatusBanner>
        <div className="overflow-hidden rounded-md border border-line bg-white shadow-sm">
          <iframe
            className="block h-[62dvh] min-h-[440px] w-full"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts"
            src={previewUrl}
            title={`معاينة موقع ${project.title}`}
          />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Button asChild>
            <a href={`/api/projects/${projectId}/artifacts/${artifact.id}/download`} rel="nofollow">
              <Download aria-hidden className="size-5" />
              تنزيل ملف ZIP
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href={previewUrl} rel="nofollow noreferrer" target="_blank">
              <ExternalLink aria-hidden className="size-5" />
              فتح المعاينة
            </a>
          </Button>
        </div>
        <p className="mt-3 text-xs leading-5 text-fg-3" dir="ltr">
          {(artifact.downloadSizeBytes / 1024).toFixed(1)} KB · ZIP
        </p>
      </PageShell>
    </>
  );
}
