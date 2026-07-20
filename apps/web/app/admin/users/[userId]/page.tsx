import { formatTokens, formatUsdFromMicros } from "@wakil/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { formatDateTimeLabel } from "../../../../src/lib/format-date";
import { getUserDetail } from "../../../../src/server/admin/queries";
import { requireAdminPage } from "../../../../src/server/admin/rbac";
import { getDatabase } from "../../../../src/server/db";
import { durationBetween, formatDurationMs } from "../../../../src/server/admin/time";
import {
  accountStatusTone,
  labelFor,
  OUTPUT_KIND_LABEL,
  PLAN_LABEL,
  PROJECT_STATUS_LABEL,
  roleTone,
  ROLE_LABEL,
  runStatusTone,
  RUN_STATUS_LABEL,
  STATUS_LABEL,
} from "../../_components/labels";
import { AdminPageHeader, Badge, DetailCard, DetailRow, StatCard } from "../../_components/ui";
import { UserAdminActions } from "./user-actions";

export const metadata: Metadata = { title: "تفاصيل العميل" };
export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const account = await requireAdminPage("support");
  const { userId } = await params;
  const user = await getUserDetail(getDatabase(), userId);
  if (!user) notFound();

  const isAdmin = account.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={user.email ?? "عميل"}
        description="ملف العميل وإحصاءاته والإجراءات الإدارية."
        actions={
          <Link
            href="/admin/users"
            className="wk-focus-ring inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-fg-2 hover:text-fg"
          >
            رجوع للقائمة
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DetailCard title="معلومات الحساب">
            <dl className="flex flex-col gap-2">
              <DetailRow label="البريد الإلكتروني" ltr>
                {user.email ?? "—"}
              </DetailRow>
              <DetailRow label="الاسم">{user.name ?? "—"}</DetailRow>
              <DetailRow label="الدور">
                <Badge tone={roleTone(user.role)}>{labelFor(ROLE_LABEL, user.role)}</Badge>
              </DetailRow>
              <DetailRow label="الحالة">
                <Badge tone={accountStatusTone(user.status)}>
                  {labelFor(STATUS_LABEL, user.status)}
                </Badge>
              </DetailRow>
              <DetailRow label="الخطة">{labelFor(PLAN_LABEL, user.plan)}</DetailRow>
              <DetailRow label="حد التكلفة الشهري">
                {user.monthlyCostLimitMicros === null
                  ? "افتراضي الخطة"
                  : formatUsdFromMicros(user.monthlyCostLimitMicros)}
              </DetailRow>
              <DetailRow label="تاريخ الإنشاء">{formatDateTimeLabel(user.createdAt)}</DetailRow>
              <DetailRow label="آخر نشاط">
                {user.usage.lastActivityAt ? formatDateTimeLabel(user.usage.lastActivityAt) : "—"}
              </DetailRow>
              <DetailRow label="دخول بكلمة مرور">{user.hasPassword ? "نعم" : "لا"}</DetailRow>
              <DetailRow label="مرتبط بحساب Google">{user.hasGoogle ? "نعم" : "لا"}</DetailRow>
            </dl>
          </DetailCard>

          <DetailCard title="مشاريع العميل">
            {user.projects.length === 0 ? (
              <p className="text-sm text-fg-3">لا توجد مشاريع.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {user.projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      href={`/admin/projects/${project.id}`}
                      className="wk-focus-ring flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-overlay/30"
                    >
                      <span className="min-w-0 truncate text-sm text-fg">{project.title}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-fg-3">
                          {labelFor(OUTPUT_KIND_LABEL, project.outputKind)}
                        </span>
                        <Badge tone={project.status === "archived" ? "neutral" : "success"}>
                          {labelFor(PROJECT_STATUS_LABEL, project.status)}
                        </Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DetailCard>

          <DetailCard title="أحدث عمليات التنفيذ">
            {user.runs.length === 0 ? (
              <p className="text-sm text-fg-3">لا توجد عمليات تنفيذ.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {user.runs.map((run) => (
                  <li key={run.id}>
                    <Link
                      href={`/admin/runs/${run.id}`}
                      className="wk-focus-ring flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-overlay/30"
                    >
                      <span className="flex items-center gap-2">
                        <Badge tone={runStatusTone(run.status)}>
                          {labelFor(RUN_STATUS_LABEL, run.status)}
                        </Badge>
                        <span className="font-mono text-xs text-fg-3" dir="ltr">
                          {run.model ?? "—"}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3 text-xs text-fg-3">
                        <span className="tabular-nums">
                          {formatTokens(run.promptTokens + run.completionTokens)} رمز
                        </span>
                        <span className="tabular-nums">{formatUsdFromMicros(run.costMicros)}</span>
                        <span>
                          {formatDurationMs(durationBetween(run.startedAt, run.finishedAt))}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </DetailCard>

          {user.errors.length > 0 ? (
            <DetailCard title="أحدث الأخطاء">
              <ul className="flex flex-col gap-1.5">
                {user.errors.map((error) => (
                  <li key={error.id}>
                    <Link
                      href={`/admin/runs/${error.id}`}
                      className="wk-focus-ring flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-overlay/30"
                    >
                      <Badge tone="danger">{error.errorCode ?? "خطأ"}</Badge>
                      <span className="text-xs text-fg-3">
                        {formatDateTimeLabel(error.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </DetailCard>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="المشاريع" value={user.usage.projectCount} />
            <StatCard label="التشغيلات" value={user.usage.runCount} />
            <StatCard label="ناجحة" value={user.usage.succeeded} tone="success" />
            <StatCard label="فاشلة" value={user.usage.failed} tone="danger" />
            <StatCard label="رموز الشهر" value={formatTokens(user.usage.tokensMonth)} />
            <StatCard label="تكلفة الشهر" value={formatUsdFromMicros(user.usage.costMonthMicros)} />
          </div>

          <UserAdminActions
            userId={user.id}
            email={user.email}
            role={user.role}
            status={user.status}
            plan={user.plan}
            monthlyCostLimitMicros={user.monthlyCostLimitMicros}
            canManage={isAdmin}
            isSelf={account.id === user.id}
          />
        </div>
      </div>
    </div>
  );
}
