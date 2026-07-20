import { formatTokens, formatUsdFromMicros, runEventLabel, type RunEventType } from "@wakil/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTimeLabel } from "../../../../src/lib/format-date";
import { getRunDetail } from "../../../../src/server/admin/queries";
import { requireAdminPage } from "../../../../src/server/admin/rbac";
import { getDatabase } from "../../../../src/server/db";
import { durationBetween, formatDurationMs } from "../../../../src/server/admin/time";
import {
  labelFor,
  RUN_KIND_LABEL,
  runStatusTone,
  RUN_STATUS_LABEL,
} from "../../_components/labels";
import { AdminPageHeader, Badge, DetailCard, DetailRow } from "../../_components/ui";
import { RunAdminActions } from "./run-actions";

export const metadata: Metadata = { title: "تفاصيل التشغيل" };
export const dynamic = "force-dynamic";

const RUN_EVENT_TYPES_SAFE = new Set<string>([
  "run.queued",
  "run.started",
  "run.step",
  "agent.started",
  "assistant.completed",
  "agent.refused",
  "agent.limit_exceeded",
  "artifact.generating",
  "sandbox.created",
  "sandbox.validated",
  "artifact.uploading",
  "artifact.ready",
  "run.succeeded",
  "run.failed",
  "run.cancelled",
]);

export default async function AdminRunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const account = await requireAdminPage("support");
  const { runId } = await params;
  const run = await getRunDetail(getDatabase(), runId);
  if (!run) notFound();

  const isActive = run.status === "queued" || run.status === "running";
  const isFailed = run.status === "failed";
  // Assistant deltas are customer content and are excluded from the admin timeline.
  const timeline = run.events.filter((event) => RUN_EVENT_TYPES_SAFE.has(event.type));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={run.projectTitle}
        description="نظرة تشغيلية على عملية التنفيذ وأحداثها."
        actions={
          <Link
            href="/admin/runs"
            className="wk-focus-ring inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-fg-2 hover:text-fg"
          >
            رجوع للقائمة
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DetailCard title="نظرة عامة">
            <dl className="flex flex-col gap-2">
              <DetailRow label="الحالة">
                <Badge tone={runStatusTone(run.status)}>
                  {labelFor(RUN_STATUS_LABEL, run.status)}
                </Badge>
              </DetailRow>
              <DetailRow label="المعرّف" ltr>
                <span className="font-mono">{run.id}</span>
              </DetailRow>
              <DetailRow label="المشروع">
                <Link href={`/admin/projects/${run.projectId}`} className="wk-focus-ring underline">
                  {run.projectTitle}
                </Link>
              </DetailRow>
              <DetailRow label="العميل" ltr>
                {run.ownerEmail ?? "—"}
              </DetailRow>
              <DetailRow label="النوع">{labelFor(RUN_KIND_LABEL, run.kind)}</DetailRow>
              <DetailRow label="النموذج" ltr>
                {run.model ?? "—"}
              </DetailRow>
              <DetailRow label="مزوّد البيئة" ltr>
                {run.sandboxProvider ?? "—"}
              </DetailRow>
              <DetailRow label="الرموز (دخل/خرج)">
                {formatTokens(run.promptTokens)} / {formatTokens(run.completionTokens)}
              </DetailRow>
              <DetailRow label="التكلفة">{formatUsdFromMicros(run.costMicros)}</DetailRow>
              <DetailRow label="عدد المحاولات">{run.providerAttempts}</DetailRow>
              <DetailRow label="أُنشئ">{formatDateTimeLabel(run.createdAt)}</DetailRow>
              <DetailRow label="بدأ">
                {run.startedAt ? formatDateTimeLabel(run.startedAt) : "—"}
              </DetailRow>
              <DetailRow label="انتهى">
                {run.finishedAt ? formatDateTimeLabel(run.finishedAt) : "—"}
              </DetailRow>
              <DetailRow label="المدة">
                {formatDurationMs(durationBetween(run.startedAt, run.finishedAt))}
              </DetailRow>
              <DetailRow label="طلب الإلغاء">
                {run.cancelRequestedAt ? formatDateTimeLabel(run.cancelRequestedAt) : "—"}
              </DetailRow>
            </dl>
          </DetailCard>

          {isFailed || run.errorCode ? (
            <DetailCard title="معلومات الخطأ">
              <dl className="flex flex-col gap-2">
                <DetailRow label="رمز الخطأ" ltr>
                  {run.errorCode ?? "—"}
                </DetailRow>
                <DetailRow label="قابل لإعادة المحاولة">{isFailed ? "نعم" : "—"}</DetailRow>
              </dl>
            </DetailCard>
          ) : null}

          <DetailCard title="مسار الأحداث">
            {timeline.length === 0 ? (
              <p className="text-sm text-fg-3">لا توجد أحداث محفوظة.</p>
            ) : (
              <ol className="flex flex-col">
                {timeline.map((event, index) => (
                  <li key={event.seq} className="flex gap-3">
                    <span className="flex flex-col items-center">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-fg-accent" />
                      {index < timeline.length - 1 ? (
                        <span className="w-px flex-1 bg-line" />
                      ) : null}
                    </span>
                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3 pb-3">
                      <span className="text-sm text-fg">
                        {runEventLabel({ type: event.type as RunEventType })}
                      </span>
                      <span className="shrink-0 text-xs text-fg-3">
                        {formatDateTimeLabel(event.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </DetailCard>
        </div>

        <div className="flex flex-col gap-6">
          <RunAdminActions
            runId={run.id}
            isActive={isActive}
            isFailed={isFailed}
            cancelRequested={run.cancelRequestedAt !== null}
            canManage={account.role === "admin"}
          />
        </div>
      </div>
    </div>
  );
}
