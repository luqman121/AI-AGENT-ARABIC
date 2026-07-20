import Link from "next/link";

export type FilterSelect = {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
};

/** Builds a querystring from a params map, dropping empty values. */
export function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * Server-first filters: a plain GET form that rewrites the URL search params.
 * No client JS is required; the page re-queries from the new params. Submitting
 * always resets to page 1 (the page param is intentionally not carried).
 */
export function AdminFilters({
  action,
  search,
  selects = [],
  dates,
}: {
  action: string;
  search?: { name: string; value: string; placeholder: string; label: string };
  selects?: FilterSelect[];
  dates?: { fromValue: string; toValue: string };
}) {
  return (
    <form method="get" action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        {search ? (
          <div className="flex min-w-52 flex-1 flex-col gap-1">
            <label htmlFor="admin-filter-search" className="text-xs font-semibold text-fg-3">
              {search.label}
            </label>
            <input
              id="admin-filter-search"
              type="search"
              name={search.name}
              defaultValue={search.value}
              placeholder={search.placeholder}
              dir="auto"
              className="wk-focus-ring min-h-11 rounded-md border border-line-input bg-input px-3 text-sm text-fg placeholder:text-fg-3"
            />
          </div>
        ) : null}

        {selects.map((select) => (
          <div key={select.name} className="flex min-w-40 flex-col gap-1">
            <label
              htmlFor={`admin-filter-${select.name}`}
              className="text-xs font-semibold text-fg-3"
            >
              {select.label}
            </label>
            <select
              id={`admin-filter-${select.name}`}
              name={select.name}
              defaultValue={select.value}
              className="wk-focus-ring min-h-11 rounded-md border border-line-input bg-input px-3 text-sm text-fg"
            >
              {select.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        {dates ? (
          <>
            <div className="flex min-w-36 flex-col gap-1">
              <label htmlFor="admin-filter-from" className="text-xs font-semibold text-fg-3">
                من
              </label>
              <input
                id="admin-filter-from"
                type="date"
                name="from"
                defaultValue={dates.fromValue}
                className="wk-focus-ring min-h-11 rounded-md border border-line-input bg-input px-3 text-sm text-fg"
              />
            </div>
            <div className="flex min-w-36 flex-col gap-1">
              <label htmlFor="admin-filter-to" className="text-xs font-semibold text-fg-3">
                إلى
              </label>
              <input
                id="admin-filter-to"
                type="date"
                name="to"
                defaultValue={dates.toValue}
                className="wk-focus-ring min-h-11 rounded-md border border-line-input bg-input px-3 text-sm text-fg"
              />
            </div>
          </>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="wk-focus-ring inline-flex min-h-11 items-center rounded-md bg-accent px-4 text-sm font-semibold text-fg-on-accent transition-colors duration-150 hover:bg-accent-hover"
          >
            تصفية
          </button>
          <Link
            href={action}
            className="wk-focus-ring inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-fg-2 hover:text-fg"
          >
            مسح
          </Link>
        </div>
      </div>
    </form>
  );
}

/** Prev/next pagination that preserves the active filter params. */
export function Pagination({
  basePath,
  params,
  page,
  hasNext,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  hasNext: boolean;
}) {
  const prevHref = `${basePath}${buildQuery({ ...params, page: String(page - 1) })}`;
  const nextHref = `${basePath}${buildQuery({ ...params, page: String(page + 1) })}`;
  const linkClass =
    "wk-focus-ring inline-flex min-h-11 items-center rounded-md border border-line px-4 text-sm font-semibold text-fg transition-colors duration-150 hover:bg-overlay";
  const disabledClass =
    "inline-flex min-h-11 items-center rounded-md border border-line/50 px-4 text-sm font-semibold text-fg-disabled";
  return (
    <nav aria-label="التنقل بين الصفحات" className="flex items-center justify-between gap-3 pt-2">
      {page > 1 ? (
        <Link href={prevHref} className={linkClass} rel="prev">
          الصفحة السابقة
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          الصفحة السابقة
        </span>
      )}
      <span className="text-sm text-fg-3">صفحة {page}</span>
      {hasNext ? (
        <Link href={nextHref} className={linkClass} rel="next">
          الصفحة التالية
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          الصفحة التالية
        </span>
      )}
    </nav>
  );
}
