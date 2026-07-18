import { AppHeader, PageShell } from "@wakil/ui";
import type { Metadata } from "next";

import { CreateProjectForm } from "./create-project-form";

export const metadata: Metadata = {
  title: "إنشاء مشروع",
};

export default function NewProjectPage() {
  return (
    <>
      <AppHeader title="وكيل" />
      <PageShell withBottomNav={false} className="pb-[calc(160px+env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-2 py-6">
          <h2 className="text-3xl font-bold leading-snug text-fg">وش تبي تنجز اليوم؟</h2>
          <p className="text-base leading-7 text-fg-2">
            اوصف طلبك بالعربي — موقع، ملف PDF، جدول، عرض تقديمي، صورة، أو لعبة بسيطة.
          </p>
        </div>
        <CreateProjectForm />
      </PageShell>
    </>
  );
}
