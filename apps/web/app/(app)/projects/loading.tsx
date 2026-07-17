import { AppHeader, PageShell, Skeleton, VisuallyHidden } from "@wakil/ui";

/** Real route-level loading state while the list query runs. */
export default function ProjectsLoading() {
  return (
    <>
      <AppHeader title="المشاريع" />
      <PageShell>
        <VisuallyHidden role="status">جارٍ تحميل المشاريع…</VisuallyHidden>
        <div className="flex flex-col gap-3 pb-1 pt-2" aria-hidden>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
        <div className="flex flex-col gap-3 py-4" aria-hidden>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </PageShell>
    </>
  );
}
