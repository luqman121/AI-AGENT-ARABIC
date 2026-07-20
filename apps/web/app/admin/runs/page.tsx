import { ADMIN_PAGE_SIZE, clampPage, formatTokens, formatUsdFromMicros } from "@wakil/shared";

import { formatDateTimeLabel } from "../../../src/lib/format-date";
import { listRuns } from "../../../src/server/admin/queries";
import { requireAdminPage } from "../../../src/server/admin/rbac";
import { getDatabase } from "../../../src/server/db";
import { durationBetween, formatDurationMs } from "../../../src/server/admin/time";
import { AdminFilters, Pagination } from "../_components/filters";
import { labelFor, RUN_KIND_LABEL, runStatusTone, RUN_STATUS_LABEL } from "../_components/labels";
import { AdminEmpty, AdminPageHeader, AdminTable, Badge, type Column } from "../_components/ui";

export const dynamic = "force-dynamic";

type Search = Record<string, string | undefined>;

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default async function AdminRunsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdminPage("support");
  const params = await searchParams;
  const page = clampPage(params.page);

  const from = parseDate(params.from);
  const to = parseDate(params.to);
  const { rows, hasNext } = await listRuns(getDatabase(), {
    from,
    failedOnly: params.failed === "1",
    kind: params.kind || undefined,
    model: params.model?.trim() || undefined,
    page,
    pageSize: ADMIN_PAGE_SIZE,
    sort: params.sort || undefined,
    status: params.status || undefined,
    to,
  });

  const activeParams: Search = {
    failed: params.failed,
    from: params.from,
    kind: params.kind,
    model: params.model,
    sort: params.sort,
    status: params.status,
    to: params.to,
  };

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      cell: (row) => (
        <div className="flex flex-col">
          <span className="truncate text-sm font-semibold text-fg">{row.projectTitle}</span>
          <span className="font-mono text-xs text-fg-3" dir="ltr">
            {row.id.slice(0, 8)}
          </span>
        </div>
      ),
      header: "المشروع",
      key: "project",
    },
    {
      cell: (row) => (
        <span className="truncate text-sm text-fg-2" dir="ltr">
          {row.ownerEmail ?? "—"}
        </span>
      ),
      header: "العميل",
      key: "owner",
    },
    {
      cell: (row) => (
        <Badge tone={runStatusTone(row.status)}>{labelFor(RUN_STATUS_LABEL, row.status)}</Badge>
      ),
      header: "الحالة",
      key: "status",
    },
    {
      cell: (row) => (
        <span className="text-xs text-fg-2">{labelFor(RUN_KIND_LABEL, row.kind)}</span>
      ),
      header: "النوع",
      key: "kind",
    },
    {
      cell: (row) => (
        <span className="font-mono text-xs text-fg-2" dir="ltr">
          {row.model ?? "—"}
        </span>
      ),
      header: "النموذج",
      key: "model",
    },
    {
      cell: (row) => (
        <span className="text-xs tabular-nums text-fg-2" dir="ltr">
          {formatTokens(row.promptTokens)} / {formatTokens(row.completionTokens)}
        </span>
      ),
      header: "الرموز (دخل/خرج)",
      key: "tokens",
    },
    {
      cell: (row) => (
        <span className="text-sm tabular-nums text-fg-2">
          {formatUsdFromMicros(row.costMicros)}
        </span>
      ),
      header: "التكلفة",
      key: "cost",
    },
    {
      cell: (row) => (
        <span className="text-xs text-fg-2">
          {formatDurationMs(durationBetween(row.startedAt, row.finishedAt))}
        </span>
      ),
      header: "المدة",
      key: "duration",
    },
    {
      cell: (row) => (
        <span className="text-xs text-fg-3">{formatDateTimeLabel(row.createdAt)}</span>
      ),
      header: "أُنشئ",
      hideOnCard: true,
      key: "created",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="عمليات التنفيذ"
        description="الصفحة التشغيلية الأساسية — كل التشغيلات وحالاتها الحقيقية."
      />

      <AdminFilters
        action="/admin/runs"
        search={{
          label: "النموذج",
          name: "model",
          placeholder: "مفتاح النموذج",
          value: params.model ?? "",
        }}
        dates={{ fromValue: params.from ?? "", toValue: params.to ?? "" }}
        selects={[
          {
            label: "الحالة",
            name: "status",
            options: [
              { label: "كل الحالات", value: "" },
              { label: "في الانتظار", value: "queued" },
              { label: "قيد التشغيل", value: "running" },
              { label: "اكتمل", value: "succeeded" },
              { label: "فشل", value: "failed" },
              { label: "أُلغي", value: "cancelled" },
            ],
            value: params.status ?? "",
          },
          {
            label: "النوع",
            name: "kind",
            options: [
              { label: "الكل", value: "" },
              { label: "تخطيط", value: "planning" },
              { label: "تنفيذ", value: "execution" },
            ],
            value: params.kind ?? "",
          },
          {
            label: "الترتيب",
            name: "sort",
            options: [
              { label: "الأحدث", value: "" },
              { label: "الأقدم", value: "oldest" },
              { label: "الأطول مدة", value: "longest" },
              { label: "الأعلى رموزًا", value: "highest_tokens" },
              { label: "الأعلى تكلفة", value: "highest_cost" },
            ],
            value: params.sort ?? "",
          },
          {
            label: "الفشل فقط",
            name: "failed",
            options: [
              { label: "لا", value: "" },
              { label: "نعم", value: "1" },
            ],
            value: params.failed ?? "",
          },
        ]}
      />

      {rows.length === 0 ? (
        <AdminEmpty title="لا توجد نتائج" description="لا توجد تشغيلات تطابق هذه التصفية." />
      ) : (
        <>
          <AdminTable
            caption="قائمة عمليات التنفيذ"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/admin/runs/${row.id}`}
          />
          <Pagination basePath="/admin/runs" params={activeParams} page={page} hasNext={hasNext} />
        </>
      )}
    </div>
  );
}
