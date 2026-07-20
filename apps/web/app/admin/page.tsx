import { formatBytes, formatTokens, formatUsdFromMicros, successRate } from "@wakil/shared";
import {
  Activity,
  CircleCheck,
  CircleX,
  Clock3,
  Coins,
  FolderKanban,
  HardDrive,
  Users,
} from "lucide-react";
import Link from "next/link";

import { formatDateLabel, formatDateTimeLabel } from "../../src/lib/format-date";
import { requireAdminPage } from "../../src/server/admin/rbac";
import {
  getOverviewMetrics,
  getRecentFailures,
  getRecentRuns,
  getRecentUsers,
} from "../../src/server/admin/queries";
import { getDatabase } from "../../src/server/db";
import { formatDurationMs } from "../../src/server/admin/time";
import { SystemStatusPanel } from "./system/system-status-panel";
import {
  accountStatusTone,
  labelFor,
  PLAN_LABEL,
  roleTone,
  ROLE_LABEL,
  runStatusTone,
  RUN_STATUS_LABEL,
  STATUS_LABEL,
} from "./_components/labels";
import { AdminPageHeader, Badge, DetailCard, StatCard } from "./_components/ui";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  await requireAdminPage("support");
  const db = getDatabase();
  const [metrics, recentUsers, recentRuns, recentFailures] = await Promise.all([
    getOverviewMetrics(db),
    getRecentUsers(db, 6),
    getRecentRuns(db, 6),
    getRecentFailures(db, 6),
  ]);

  const rate = successRate(metrics.completedToday, metrics.failedToday);

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="نظرة عامة"
        description="مؤشرات تشغيلية حيّة من قاعدة البيانات — بيانات حقيقية فقط."
      />

      <section aria-label="مؤشرات عامة" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="إجمالي العملاء" value={metrics.totalUsers} icon={Users} />
        <StatCard label="عملاء جدد اليوم" value={metrics.newUsersToday} icon={Users} />
        <StatCard label="نشطون اليوم" value={metrics.activeUsersToday} icon={Activity} />
        <StatCard label="إجمالي المشاريع" value={metrics.totalProjects} icon={FolderKanban} />
        <StatCard label="مشاريع اليوم" value={metrics.projectsToday} icon={FolderKanban} />
        <StatCard label="قيد التشغيل" value={metrics.runningJobs} icon={Activity} tone="accent" />
        <StatCard label="في الانتظار" value={metrics.queuedJobs} icon={Clock3} />
        <StatCard
          label="اكتملت اليوم"
          value={metrics.completedToday}
          icon={CircleCheck}
          tone="success"
        />
        <StatCard label="فشلت اليوم" value={metrics.failedToday} icon={CircleX} tone="danger" />
        <StatCard label="نسبة النجاح اليوم" value={`${rate}%`} icon={CircleCheck} />
        <StatCard label="رموز اليوم" value={formatTokens(metrics.tokensToday)} icon={Coins} />
        <StatCard
          label="متوسط مدة التشغيل"
          value={formatDurationMs(metrics.avgDurationMs)}
          icon={Clock3}
        />
        <StatCard
          label="تكلفة اليوم"
          value={formatUsdFromMicros(metrics.costTodayMicros)}
          icon={Coins}
        />
        <StatCard
          label="تكلفة الشهر"
          value={formatUsdFromMicros(metrics.costMonthMicros)}
          icon={Coins}
        />
        <StatCard
          label="التخزين المستخدم"
          value={formatBytes(metrics.storageBytes)}
          icon={HardDrive}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard
          title="أحدث العملاء"
          actions={
            <Link
              href="/admin/users"
              className="wk-focus-ring text-sm font-semibold text-fg-accent"
            >
              عرض الكل
            </Link>
          }
        >
          <ul className="flex flex-col gap-2">
            {recentUsers.length === 0 ? (
              <li className="text-sm text-fg-3">لا يوجد عملاء بعد.</li>
            ) : (
              recentUsers.map((user) => (
                <li key={user.id}>
                  <Link
                    href={`/admin/users/${user.id}`}
                    className="wk-focus-ring flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-overlay/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg" dir="ltr">
                        {user.email ?? "—"}
                      </span>
                      <span className="block text-xs text-fg-3">
                        {formatDateLabel(user.createdAt)} · {labelFor(PLAN_LABEL, user.plan)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge tone={roleTone(user.role)}>{labelFor(ROLE_LABEL, user.role)}</Badge>
                      <Badge tone={accountStatusTone(user.status)}>
                        {labelFor(STATUS_LABEL, user.status)}
                      </Badge>
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </DetailCard>

        <DetailCard
          title="أحدث عمليات التنفيذ"
          actions={
            <Link href="/admin/runs" className="wk-focus-ring text-sm font-semibold text-fg-accent">
              عرض الكل
            </Link>
          }
        >
          <ul className="flex flex-col gap-2">
            {recentRuns.length === 0 ? (
              <li className="text-sm text-fg-3">لا توجد عمليات تنفيذ بعد.</li>
            ) : (
              recentRuns.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/admin/runs/${run.id}`}
                    className="wk-focus-ring flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-overlay/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg">{run.projectTitle}</span>
                      <span className="block truncate text-xs text-fg-3" dir="ltr">
                        {run.ownerEmail ?? "—"} · {formatDateTimeLabel(run.createdAt)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-fg-3">
                        {formatDurationMs(
                          run.startedAt && run.finishedAt
                            ? run.finishedAt.getTime() - run.startedAt.getTime()
                            : null,
                        )}
                      </span>
                      <Badge tone={runStatusTone(run.status)}>
                        {labelFor(RUN_STATUS_LABEL, run.status)}
                      </Badge>
                    </span>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </DetailCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard title="أحدث حالات الفشل">
          <ul className="flex flex-col gap-2">
            {recentFailures.length === 0 ? (
              <li className="text-sm text-fg-3">لا توجد حالات فشل — لا شيء يحتاج انتباهك.</li>
            ) : (
              recentFailures.map((failure) => (
                <li key={failure.id}>
                  <Link
                    href={`/admin/runs/${failure.id}`}
                    className="wk-focus-ring flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-overlay/40"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-fg">{failure.projectTitle}</span>
                      <span className="block text-xs text-fg-3">
                        {formatDateTimeLabel(failure.createdAt)}
                      </span>
                    </span>
                    <Badge tone="danger">{failure.errorCode ?? "خطأ"}</Badge>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </DetailCard>

        <DetailCard
          title="حالة النظام"
          actions={
            <Link
              href="/admin/system"
              className="wk-focus-ring text-sm font-semibold text-fg-accent"
            >
              التفاصيل
            </Link>
          }
        >
          <SystemStatusPanel initialPollMs={0} />
        </DetailCard>
      </div>
    </div>
  );
}
