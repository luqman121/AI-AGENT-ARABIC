import { formatBytes } from "@wakil/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTimeLabel } from "../../../../src/lib/format-date";
import { getProjectDetail } from "../../../../src/server/admin/queries";
import { requireAdminPage } from "../../../../src/server/admin/rbac";
import { getDatabase } from "../../../../src/server/db";
import { durationBetween, formatDurationMs } from "../../../../src/server/admin/time";
import {
  labelFor,
  OUTPUT_KIND_LABEL,
  PROJECT_STATUS_LABEL,
  runStatusTone,
  RUN_STATUS_LABEL,
} from "../../_components/labels";
import { AdminPageHeader, Badge, DetailCard, DetailRow } from "../../_components/ui";
import { ProjectAdminActions } from "./project-actions";

export const metadata: Metadata = { title: "تفاصيل المشروع" };
export const dynamic = "force-dynamic";

export default async function AdminProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const account = await requireAdminPage("support");
  const { projectId } = await params;
  const project = await getProjectDetail(getDatabase(), projectId);
  if (!project) notFound();

  const activeRun = project.runs.find((run) => run.status === "queued" || run.status === "running");
  const latestFailed = project.runs.find((run) => run.status === "failed");

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={project.title}
        description="تفاصيل المشروع، النتائج، والمرفقات."
        actions={
          <Link
            href="/admin/projects"
            className="wk-focus-ring inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-fg-2 hover:text-fg"
          >
            رجوع للقائمة
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DetailCard title="معلومات المشروع">
            <dl className="flex flex-col gap-2">
              <DetailRow label="المالك" ltr>
                {project.ownerEmail ? (
                  <Link
                    href={`/admin/users/${project.ownerId}`}
                    className="wk-focus-ring underline"
                  >
                    {project.ownerEmail}
                  </Link>
                ) : (
                  "—"
                )}
              </DetailRow>
              <DetailRow label="النوع">{labelFor(OUTPUT_KIND_LABEL, project.outputKind)}</DetailRow>
              <DetailRow label="الحالة">
                <Badge tone={project.status === "archived" ? "neutral" : "success"}>
                  {labelFor(PROJECT_STATUS_LABEL, project.status)}
                </Badge>
              </DetailRow>
              <DetailRow label="أُنشئ">{formatDateTimeLabel(project.createdAt)}</DetailRow>
              <DetailRow label="آخر تحديث">{formatDateTimeLabel(project.updatedAt)}</DetailRow>
              <DetailRow label="التخزين">{formatBytes(project.storageBytes)}</DetailRow>
            </dl>
          </DetailCard>

          <DetailCard title="طلب العميل الأصلي">
            {/* Rendered as plain text — React escapes it; never as HTML. */}
            <p className="whitespace-pre-wrap break-words rounded-md bg-overlay/40 p-3 text-sm leading-7 text-fg-2">
              {project.request ?? "—"}
            </p>
          </DetailCard>

          <DetailCard title="النتائج">
            {project.artifacts.length === 0 ? (
              <p className="text-sm text-fg-3">لا توجد نتائج بعد.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {project.artifacts.map((artifact) => (
                  <li
                    key={artifact.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                  >
                    <span className="min-w-0 truncate text-sm text-fg">{artifact.title}</span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-fg-3">
                      <span>{formatBytes(artifact.downloadSizeBytes)}</span>
                      <span>{formatDateTimeLabel(artifact.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DetailCard>

          <DetailCard title="المرفقات">
            {project.attachments.length === 0 ? (
              <p className="text-sm text-fg-3">لا توجد مرفقات.</p>
            ) : (
              // Metadata only — attachment contents are private and never auto-loaded here.
              <ul className="flex flex-col gap-1.5">
                {project.attachments.map((attachment) => (
                  <li
                    key={attachment.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                  >
                    <span className="min-w-0 truncate text-sm text-fg" dir="auto">
                      {attachment.originalName}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-fg-3">
                      <span dir="ltr">{attachment.mediaType}</span>
                      <span>{formatBytes(attachment.sizeBytes)}</span>
                      <Badge tone={attachment.status === "ready" ? "success" : "neutral"}>
                        {attachment.status}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DetailCard>

          <DetailCard title="عمليات التنفيذ">
            {project.runs.length === 0 ? (
              <p className="text-sm text-fg-3">لا توجد عمليات تنفيذ.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {project.runs.map((run) => (
                  <li key={run.id}>
                    <Link
                      href={`/admin/runs/${run.id}`}
                      className="wk-focus-ring flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-overlay/30"
                    >
                      <Badge tone={runStatusTone(run.status)}>
                        {labelFor(RUN_STATUS_LABEL, run.status)}
                      </Badge>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-fg-3">
                        <span>
                          {formatDurationMs(durationBetween(run.startedAt, run.finishedAt))}
                        </span>
                        <span>{formatDateTimeLabel(run.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DetailCard>
        </div>

        <div className="flex flex-col gap-6">
          <ProjectAdminActions
            projectId={project.id}
            projectStatus={project.status}
            activeRunId={activeRun?.id ?? null}
            failedRunId={latestFailed?.id ?? null}
            canManage={account.role === "admin"}
          />
        </div>
      </div>
    </div>
  );
}
