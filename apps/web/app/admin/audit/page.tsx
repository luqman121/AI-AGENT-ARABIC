import { ADMIN_PAGE_SIZE, clampPage } from "@wakil/shared";

import { formatDateTimeLabel } from "../../../src/lib/format-date";
import { listAuditLogs } from "../../../src/server/admin/queries";
import { requireAdminPage } from "../../../src/server/admin/rbac";
import { getDatabase } from "../../../src/server/db";
import { AdminFilters, Pagination } from "../_components/filters";
import {
  AUDIT_ACTION_LABEL,
  labelFor,
  roleTone,
  ROLE_LABEL,
  TARGET_TYPE_LABEL,
} from "../_components/labels";
import { AdminEmpty, AdminPageHeader, Badge } from "../_components/ui";

export const dynamic = "force-dynamic";

type Search = Record<string, string | undefined>;

function DataBlock({ label, data }: { label: string; data: Record<string, unknown> | null }) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold text-fg-3">{label}</span>
      <dl className="flex flex-col gap-0.5">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex gap-2 text-xs">
            <dt className="text-fg-3">{key}:</dt>
            <dd className="break-all text-fg-2" dir="auto">
              {value === null ? "—" : String(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdminPage("support");
  const params = await searchParams;
  const page = clampPage(params.page);

  const { rows, hasNext } = await listAuditLogs(getDatabase(), {
    action: params.action || undefined,
    page,
    pageSize: ADMIN_PAGE_SIZE,
    targetId: params.id?.trim() || undefined,
    targetType: params.target || undefined,
  });

  const activeParams: Search = { action: params.action, id: params.id, target: params.target };

  return (
    <div className="flex flex-col gap-5">
      <AdminPageHeader
        title="سجل الإدارة"
        description="سجل غير قابل للتعديل لكل الإجراءات الإدارية الحساسة."
      />

      <AdminFilters
        action="/admin/audit"
        selects={[
          {
            label: "الإجراء",
            name: "action",
            options: [
              { label: "كل الإجراءات", value: "" },
              ...Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => ({ label, value })),
            ],
            value: params.action ?? "",
          },
          {
            label: "نوع الهدف",
            name: "target",
            options: [
              { label: "الكل", value: "" },
              ...Object.entries(TARGET_TYPE_LABEL).map(([value, label]) => ({ label, value })),
            ],
            value: params.target ?? "",
          },
        ]}
      />

      {rows.length === 0 ? (
        <AdminEmpty title="لا توجد سجلات" description="لم تُسجّل إجراءات إدارية بعد." />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {rows.map((row) => (
              <li key={row.id} className="wk-elevate-1 flex flex-col gap-2 rounded-md p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="accent">{labelFor(AUDIT_ACTION_LABEL, row.action)}</Badge>
                    <Badge tone="neutral">{labelFor(TARGET_TYPE_LABEL, row.targetType)}</Badge>
                  </div>
                  <span className="text-xs text-fg-3">{formatDateTimeLabel(row.createdAt)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-fg-2">
                  <span dir="ltr">{row.actorEmail ?? "—"}</span>
                  <Badge tone={roleTone(row.actorRole)}>
                    {labelFor(ROLE_LABEL, row.actorRole)}
                  </Badge>
                  {row.targetId ? (
                    <span className="font-mono text-fg-3" dir="ltr">
                      {row.targetId.slice(0, 8)}
                    </span>
                  ) : null}
                </div>
                {row.reason ? (
                  <p className="text-xs text-fg-2">
                    <span className="text-fg-3">السبب: </span>
                    {row.reason}
                  </p>
                ) : null}
                {row.before || row.after ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DataBlock label="قبل" data={row.before} />
                    <DataBlock label="بعد" data={row.after} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <Pagination basePath="/admin/audit" params={activeParams} page={page} hasNext={hasNext} />
        </>
      )}
    </div>
  );
}
