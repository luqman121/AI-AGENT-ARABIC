import { AppHeader, EmptyState, PageShell } from "@wakil/ui";
import { ChartNoAxesColumn } from "lucide-react";
import type { Metadata } from "next";

import { requireAuthorizedContext } from "../../../src/server/auth/session";

export const metadata: Metadata = {
  title: "الاستخدام",
};

/** Truthful usage state: no execution has happened, so there is no usage. */
export default async function UsagePage() {
  await requireAuthorizedContext();

  return (
    <>
      <AppHeader title="الاستخدام" />
      <PageShell>
        <EmptyState
          icon={ChartNoAxesColumn}
          title="لا يوجد استخدام بعد"
          description="لم تُنفَّذ أي طلبات حتى الآن. عند تشغيل أول طلب لك، سيظهر سجل الاستخدام هنا."
        />
      </PageShell>
    </>
  );
}
