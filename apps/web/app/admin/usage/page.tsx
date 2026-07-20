import { formatBytes, formatTokens, formatUsdFromMicros } from "@wakil/shared";
import { Coins, HardDrive } from "lucide-react";
import Link from "next/link";

import { getUsageSummary } from "../../../src/server/admin/queries";
import { requireAdminPage } from "../../../src/server/admin/rbac";
import { getDatabase } from "../../../src/server/db";
import { formatDurationMs } from "../../../src/server/admin/time";
import { labelFor, OUTPUT_KIND_LABEL } from "../_components/labels";
import { AdminPageHeader, DetailCard, StatCard } from "../_components/ui";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage() {
  await requireAdminPage("support");
  const usage = await getUsageSummary(getDatabase());

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="الاستخدام"
        description="تجميعات من قاعدة البيانات (المصدر الموثوق) — نوافذ اليوم/الشهر بتوقيت UTC."
      />

      <section aria-label="ملخص الاستخدام" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="رموز اليوم" value={formatTokens(usage.tokensToday)} icon={Coins} />
        <StatCard label="رموز الشهر" value={formatTokens(usage.tokensMonth)} icon={Coins} />
        <StatCard
          label="تكلفة اليوم"
          value={formatUsdFromMicros(usage.costTodayMicros)}
          icon={Coins}
        />
        <StatCard
          label="تكلفة الشهر"
          value={formatUsdFromMicros(usage.costMonthMicros)}
          icon={Coins}
        />
        <StatCard label="التخزين" value={formatBytes(usage.storageBytes)} icon={HardDrive} />
        <StatCard label="زمن التنفيذ" value={formatDurationMs(usage.executionMs)} />
        <StatCard
          label="متوسط تكلفة التشغيل"
          value={formatUsdFromMicros(usage.avgCostPerRunMicros)}
        />
        <StatCard
          label="تكلفة التشغيلات الفاشلة"
          value={formatUsdFromMicros(usage.failedCostMicros)}
          tone="danger"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailCard title="الأعلى تكلفة — العملاء">
          <UsageRows
            rows={usage.topUsers.map((row) => ({
              href: `/admin/users/${row.userId}`,
              label: row.email ?? row.userId.slice(0, 8),
              ltr: true,
              value: formatUsdFromMicros(row.costMicros),
            }))}
          />
        </DetailCard>

        <DetailCard title="الأعلى تكلفة — المشاريع">
          <UsageRows
            rows={usage.topProjects.map((row) => ({
              href: `/admin/projects/${row.projectId}`,
              label: row.title,
              value: formatUsdFromMicros(row.costMicros),
            }))}
          />
        </DetailCard>

        <DetailCard title="الاستخدام حسب النموذج">
          <UsageRows
            rows={usage.byModel.map((row) => ({
              label: row.key,
              ltr: true,
              value: `${formatUsdFromMicros(row.costMicros)} · ${formatTokens(row.tokens)} رمز`,
            }))}
          />
        </DetailCard>

        <DetailCard title="الاستخدام حسب نوع المخرجات">
          <UsageRows
            rows={usage.byOutputKind.map((row) => ({
              label: labelFor(OUTPUT_KIND_LABEL, row.key),
              value: `${formatUsdFromMicros(row.costMicros)} · ${row.runs} تشغيل`,
            }))}
          />
        </DetailCard>
      </div>
    </div>
  );
}

function UsageRows({
  rows,
}: {
  rows: { label: string; value: string; href?: string; ltr?: boolean }[];
}) {
  if (rows.length === 0) return <p className="text-sm text-fg-3">لا توجد بيانات بعد.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((row, index) => {
        const content = (
          <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-overlay/30">
            <span className="min-w-0 truncate text-sm text-fg" dir={row.ltr ? "ltr" : undefined}>
              {row.label}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-fg-2">{row.value}</span>
          </div>
        );
        return (
          <li key={`${row.label}-${index}`}>
            {row.href ? (
              <Link href={row.href} className="wk-focus-ring block">
                {content}
              </Link>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
