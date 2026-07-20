import { Ltr } from "@wakil/ui";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ *
 * Page header
 * ------------------------------------------------------------------ */

export function AdminPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-fg">{title}</h1>
        {description ? <p className="text-sm leading-6 text-fg-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Stat card
 * ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "danger" | "accent";
}) {
  const toneClass =
    tone === "success"
      ? "text-fg-success"
      : tone === "danger"
        ? "text-fg-danger"
        : tone === "accent"
          ? "text-fg-accent"
          : "text-fg";
  return (
    <div className="wk-elevate-1 flex flex-col gap-1 rounded-md p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-fg-3">{label}</span>
        {Icon ? <Icon aria-hidden className="size-4 text-fg-3" /> : null}
      </div>
      <span className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</span>
      {hint ? <span className="text-xs text-fg-3">{hint}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Badges
 * ------------------------------------------------------------------ */

export type BadgeTone = "neutral" | "success" | "danger" | "warning" | "info" | "accent";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-overlay text-fg-2",
  success: "bg-success-subtle text-fg-success",
  danger: "bg-danger-subtle text-fg-danger",
  warning: "bg-warning-subtle text-fg-warning",
  info: "bg-info-subtle text-fg-info",
  accent: "bg-accent-subtle text-fg-accent",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Definition list (detail pages)
 * ------------------------------------------------------------------ */

export function DetailCard({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="wk-elevate-1 flex flex-col gap-4 rounded-md p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-fg">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function DetailRow({
  label,
  children,
  ltr = false,
}: {
  label: string;
  children: ReactNode;
  ltr?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line/60 pb-2 last:border-0 last:pb-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="text-sm text-fg-3">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium text-fg sm:text-end">
        {ltr ? <Ltr>{children}</Ltr> : children}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

export function AdminEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-line px-6 py-12 text-center">
      <p className="text-base font-semibold text-fg">{title}</p>
      {description ? <p className="max-w-[40ch] text-sm text-fg-3">{description}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Responsive table: a real table on md+, stacked cards on mobile
 * ------------------------------------------------------------------ */

export type Column<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  /** Hide this column on small screens' card layout when noisy. */
  hideOnCard?: boolean;
};

export function AdminTable<Row>({
  columns,
  rows,
  rowKey,
  rowHref,
  caption,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  rowHref?: (row: Row) => string;
  caption: string;
}) {
  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto rounded-md border border-line md:block">
        <table className="w-full min-w-160 border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-overlay/40 text-start">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2.5 text-start text-xs font-semibold text-fg-3"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  className="border-b border-line/60 last:border-0 hover:bg-overlay/30"
                >
                  {columns.map((column, index) => (
                    <td key={column.key} className="px-3 py-2.5 align-middle text-fg">
                      {href && index === 0 ? (
                        <Link href={href} className="wk-focus-ring block">
                          {column.cell(row)}
                        </Link>
                      ) : (
                        column.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const inner = (
            <div className="wk-elevate-1 flex flex-col gap-2 rounded-md p-3">
              {columns
                .filter((column) => !column.hideOnCard)
                .map((column) => (
                  <div key={column.key} className="flex items-baseline justify-between gap-3">
                    <span className="shrink-0 text-xs text-fg-3">{column.header}</span>
                    <span className="min-w-0 break-words text-end text-sm text-fg">
                      {column.cell(row)}
                    </span>
                  </div>
                ))}
            </div>
          );
          return (
            <li key={rowKey(row)}>
              {href ? (
                <Link href={href} className="wk-focus-ring block">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
