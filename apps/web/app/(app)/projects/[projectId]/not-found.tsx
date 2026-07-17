import { AppHeader, Button, EmptyState, PageShell } from "@wakil/ui";
import { FolderX } from "lucide-react";
import Link from "next/link";

/** Shown for missing projects and cross-tenant IDs alike. */
export default function ProjectNotFound() {
  return (
    <>
      <AppHeader title="المشاريع" />
      <PageShell>
        <EmptyState
          icon={FolderX}
          title="المشروع غير موجود"
          description="المشروع غير موجود أو لا تملك صلاحية الوصول إليه."
          action={
            <Button asChild variant="secondary">
              <Link href="/projects">الرجوع إلى المشاريع</Link>
            </Button>
          }
        />
      </PageShell>
    </>
  );
}
