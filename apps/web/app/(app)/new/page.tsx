import { AppHeader, PageShell } from "@wakil/ui";
import { UserRound } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { getSessionUser, requireAuthorizedContext } from "../../../src/server/auth/session";
import { firstNameOf } from "../../../src/lib/user-display";
import { CreateProjectForm } from "./create-project-form";

export const metadata: Metadata = {
  title: "إنشاء مشروع",
};

export default async function NewProjectPage() {
  await requireAuthorizedContext();
  const user = await getSessionUser();
  const firstName = firstNameOf(user?.name ?? null);

  return (
    <>
      <AppHeader
        title="وكيل"
        end={
          <Link
            href="/account"
            aria-label="الحساب"
            title="الحساب"
            className="wk-focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2 transition-colors duration-150 hover:bg-overlay hover:text-fg"
          >
            <UserRound aria-hidden className="size-5" />
          </Link>
        }
      />
      <PageShell
        withBottomNav={false}
        className="flex flex-1 flex-col justify-center gap-6 pb-[calc(160px+env(safe-area-inset-bottom))]"
      >
        <div className="flex flex-col gap-2 py-6 text-center">
          <h2 className="text-3xl font-bold leading-snug text-fg">
            مرحبًا {firstName}،
            <br />
            ماذا تريد أن تنشئ اليوم؟
          </h2>
        </div>
        <CreateProjectForm />
      </PageShell>
    </>
  );
}
