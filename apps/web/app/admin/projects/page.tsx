import { ADMIN_PAGE_SIZE, clampPage, formatBytes } from "@wakil/shared";

import { formatDateLabel } from "../../../src/lib/format-date";
import { listProjects } from "../../../src/server/admin/queries";
import { requireAdminPage } from "../../../src/server/admin/rbac";
import { getDatabase } from "../../../src/server/db";
import { AdminFilters, Pagination } from "../_components/filters";
import {
  labelFor,
  OUTPUT_KIND_LABEL,
  PROJECT_STATUS_LABEL,
  runStatusTone,
  RUN_STATUS_LABEL,
} from "../_components/labels";
import { AdminEmpty, AdminPageHeader, AdminTable, Badge, type Column } from "../_components/ui";

export const dynamic = "force-dynamic";

type Search = Record<string, string | undefined>;

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireAdminPage("support");
  const params = await searchParams;
  const page = clampPage(params.page);

  const { rows, hasNext } = await listProjects(getDatabase(), {
    outputKind: params.kind || undefined,
    page,
    pageSize: ADMIN_PAGE_SIZE,
    search: params.search?.trim() || undefined,
    sort: params.sort || undefined,
    status: params.status || undefined,
  });

  const activeParams: Search = {
    kind: params.kind,
    search: params.search,
    sort: params.sort,
    status: params.status,
  };

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      cell: (row) => <span className="truncate text-sm font-semibold text-fg">{row.title}</span>,
      header: "المشروع",
      key: "title",
    },
    {
      cell: (row) => (
        <span className="truncate text-sm text-fg-2" dir="ltr">
          {row.ownerEmail ?? "—"}
        </span>
      ),
      header: "المالك",
      key: "owner",
    },
    {
      cell: (row) => (
        <span className="text-xs text-fg-2">{labelFor(OUTPUT_KIND_LABEL, row.outputKind)}</span>
      ),
      header: "النوع",
      key: "kind",
    },
    {
      cell: (row) => (
        <Badge tone={row.status === "archived" ? "neutral" : "success"}>
          {labelFor(PROJECT_STATUS_LABEL, row.status)}
        </Badge>
      ),
      header: "الحالة",
      key: "status",
    },
    {
      cell: (row) =>
        row.latestRunStatus ? (
          <Badge tone={runStatusTone(row.latestRunStatus)}>
            {labelFor(RUN_STATUS_LABEL, row.latestRunStatus)}
          </Badge>
        ) : (
          <span className="text-xs text-fg-3">—</span>
        ),
      header: "آخر تشغيل",
      key: "run",
    },
    {
      cell: (row) => <span className="text-xs text-fg-2">{row.hasResult ? "متوفرة" : "—"}</span>,
      header: "النتيجة",
      key: "result",
    },
    {
      cell: (row) => (
        <span className="text-xs tabular-nums text-fg-2">{formatBytes(row.storageBytes)}</span>
      ),
      header: "التخزين",
      key: "storage",
    },
    {
      cell: (row) => <span className="text-xs text-fg-3">{formatDateLabel(row.createdAt)}</span>,
      header: "أُنشئ",
      hideOnCard: true,
      key: "created",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader title="المشاريع" description="كل مشاريع العملاء مع حالتها ونتائجها." />

      <AdminFilters
        action="/admin/projects"
        search={{
          label: "بحث",
          name: "search",
          placeholder: "اسم المشروع",
          value: params.search ?? "",
        }}
        selects={[
          {
            label: "الحالة",
            name: "status",
            options: [
              { label: "الكل", value: "" },
              { label: "نشط", value: "active" },
              { label: "مؤرشف", value: "archived" },
            ],
            value: params.status ?? "",
          },
          {
            label: "النوع",
            name: "kind",
            options: [
              { label: "كل الأنواع", value: "" },
              { label: "موقع", value: "static_site" },
              { label: "تطبيق", value: "web_app" },
              { label: "PDF", value: "pdf" },
              { label: "جدول", value: "spreadsheet" },
              { label: "صورة", value: "image" },
              { label: "مستند", value: "document" },
              { label: "عرض", value: "presentation" },
              { label: "أخرى", value: "other" },
            ],
            value: params.kind ?? "",
          },
          {
            label: "الترتيب",
            name: "sort",
            options: [
              { label: "الأحدث", value: "" },
              { label: "الأقدم", value: "oldest" },
            ],
            value: params.sort ?? "",
          },
        ]}
      />

      {rows.length === 0 ? (
        <AdminEmpty title="لا توجد نتائج" description="لا توجد مشاريع تطابق هذه التصفية." />
      ) : (
        <>
          <AdminTable
            caption="قائمة المشاريع"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/admin/projects/${row.id}`}
          />
          <Pagination
            basePath="/admin/projects"
            params={activeParams}
            page={page}
            hasNext={hasNext}
          />
        </>
      )}
    </div>
  );
}
