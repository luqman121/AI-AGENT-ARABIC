import { ADMIN_PAGE_SIZE, clampPage, formatUsdFromMicros } from "@wakil/shared";

import { formatDateLabel } from "../../../src/lib/format-date";
import { listUsers } from "../../../src/server/admin/queries";
import { requireAdminPage } from "../../../src/server/admin/rbac";
import { getDatabase } from "../../../src/server/db";
import { AdminFilters, Pagination } from "../_components/filters";
import {
  accountStatusTone,
  labelFor,
  PLAN_LABEL,
  roleTone,
  ROLE_LABEL,
  STATUS_LABEL,
} from "../_components/labels";
import { AdminEmpty, AdminPageHeader, AdminTable, Badge, type Column } from "../_components/ui";

export const dynamic = "force-dynamic";

type Search = Record<string, string | undefined>;

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdminPage("support");
  const params = await searchParams;
  const page = clampPage(params.page);

  const filters = {
    page,
    pageSize: ADMIN_PAGE_SIZE,
    plan: params.plan || undefined,
    role: params.role || undefined,
    search: params.search?.trim() || undefined,
    sort: params.sort || undefined,
    status: params.status || undefined,
  };
  const { rows, hasNext } = await listUsers(getDatabase(), filters);

  const activeParams: Search = {
    plan: params.plan,
    role: params.role,
    search: params.search,
    sort: params.sort,
    status: params.status,
  };

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      cell: (row) => (
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-fg" dir="ltr">
            {row.email ?? "—"}
          </span>
          {row.name ? <span className="text-xs text-fg-3">{row.name}</span> : null}
        </div>
      ),
      header: "العميل",
      key: "email",
    },
    {
      cell: (row) => <Badge tone={roleTone(row.role)}>{labelFor(ROLE_LABEL, row.role)}</Badge>,
      header: "الدور",
      key: "role",
    },
    {
      cell: (row) => (
        <Badge tone={accountStatusTone(row.status)}>{labelFor(STATUS_LABEL, row.status)}</Badge>
      ),
      header: "الحالة",
      key: "status",
    },
    {
      cell: (row) => <span className="text-sm text-fg-2">{labelFor(PLAN_LABEL, row.plan)}</span>,
      header: "الخطة",
      key: "plan",
    },
    {
      cell: (row) => <span className="text-sm tabular-nums text-fg-2">{row.projectCount}</span>,
      header: "المشاريع",
      key: "projects",
    },
    {
      cell: (row) => <span className="text-sm tabular-nums text-fg-2">{row.runCount}</span>,
      header: "التشغيلات",
      key: "runs",
    },
    {
      cell: (row) => (
        <span className="text-sm tabular-nums text-fg-2">
          {formatUsdFromMicros(row.costMonthMicros)}
        </span>
      ),
      header: "تكلفة الشهر",
      key: "cost",
    },
    {
      cell: (row) => <span className="text-sm text-fg-3">{formatDateLabel(row.createdAt)}</span>,
      header: "التسجيل",
      hideOnCard: true,
      key: "created",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader title="العملاء" description="بحث وتصفية العملاء مع مؤشرات الاستخدام." />

      <AdminFilters
        action="/admin/users"
        search={{
          label: "بحث",
          name: "search",
          placeholder: "البريد أو الاسم",
          value: params.search ?? "",
        }}
        selects={[
          {
            label: "الدور",
            name: "role",
            options: [
              { label: "كل الأدوار", value: "" },
              { label: "مستخدم", value: "user" },
              { label: "دعم", value: "support" },
              { label: "مدير", value: "admin" },
            ],
            value: params.role ?? "",
          },
          {
            label: "الحالة",
            name: "status",
            options: [
              { label: "كل الحالات", value: "" },
              { label: "نشط", value: "active" },
              { label: "موقوف", value: "suspended" },
            ],
            value: params.status ?? "",
          },
          {
            label: "الخطة",
            name: "plan",
            options: [
              { label: "كل الخطط", value: "" },
              { label: "مجاني", value: "free" },
              { label: "احترافي", value: "pro" },
              { label: "أعمال", value: "business" },
            ],
            value: params.plan ?? "",
          },
          {
            label: "الترتيب",
            name: "sort",
            options: [
              { label: "الأحدث", value: "" },
              { label: "الأقدم", value: "oldest" },
              { label: "الأكثر نشاطًا", value: "most_active" },
              { label: "الأعلى تكلفة", value: "highest_cost" },
            ],
            value: params.sort ?? "",
          },
        ]}
      />

      {rows.length === 0 ? (
        <AdminEmpty title="لا توجد نتائج" description="لا يوجد عملاء يطابقون هذه التصفية." />
      ) : (
        <>
          <AdminTable
            caption="قائمة العملاء"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/admin/users/${row.id}`}
          />
          <Pagination basePath="/admin/users" params={activeParams} page={page} hasNext={hasNext} />
        </>
      )}
    </div>
  );
}
