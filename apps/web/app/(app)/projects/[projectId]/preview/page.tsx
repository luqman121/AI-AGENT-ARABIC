import { projectIdSchema } from "@wakil/shared";
import { Button, AppHeader, EmptyState, PageShell, StatusBanner } from "@wakil/ui";
import {
  Download,
  ExternalLink,
  Monitor,
  MonitorPlay,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react";
import Link from "next/link";
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
  searchParams: Promise<{ artifact?: string; viewport?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  if (!projectIdSchema.safeParse(projectId).success) notFound();
  const ctx = await requireAuthorizedContext();
  const db = getDatabase();
  const project = await getProjectById(db, ctx, projectId);
  if (!project) notFound();
  const artifactId = query.artifact;
  const viewport = ["desktop", "tablet", "mobile"].includes(query.viewport ?? "")
    ? query.viewport
    : "desktop";
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-card p-2">
          <div className="flex flex-wrap gap-2" aria-label="حجم المعاينة">
            {[
              { icon: Monitor, id: "desktop", label: "سطح المكتب" },
              { icon: Tablet, id: "tablet", label: "جهاز لوحي" },
              { icon: Smartphone, id: "mobile", label: "هاتف" },
            ].map((item) => {
              const Icon = item.icon;
              const active = viewport === item.id;
              return (
                <Button
                  key={item.id}
                  asChild
                  size="compact"
                  variant={active ? "primary" : "secondary"}
                >
                  <Link
                    href={`/projects/${projectId}/preview?artifact=${artifact.id}&viewport=${item.id}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon aria-hidden className="size-4" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </div>
          <Button asChild size="compact" variant="ghost">
            <Link
              href={`/projects/${projectId}/preview?artifact=${artifact.id}&viewport=${viewport}`}
            >
              <RefreshCw aria-hidden className="size-4" />
              تحديث
            </Link>
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md border border-line bg-page p-2 shadow-sm">
          <div
            className={
              viewport === "mobile"
                ? "mx-auto w-[390px] max-w-full overflow-hidden rounded-md border border-line bg-white"
                : viewport === "tablet"
                  ? "mx-auto w-[768px] max-w-full overflow-hidden rounded-md border border-line bg-white"
                  : "overflow-hidden rounded-md border border-line bg-white"
            }
          >
            <iframe
              className="block h-[62dvh] min-h-[440px] w-full"
              referrerPolicy="no-referrer"
              sandbox="allow-scripts"
              src={previewUrl}
              title={`معاينة موقع ${project.title}`}
            />
          </div>
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
