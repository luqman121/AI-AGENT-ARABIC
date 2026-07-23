import { AppHeader, PageShell } from "@wakil/ui";
import { UserRound } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { getSessionUser, requireAuthorizedContext } from "../../../src/server/auth/session";
import { getDatabase } from "../../../src/server/db";
import { listProjects } from "../../../src/server/features/projects/queries";
import { firstNameOf } from "../../../src/lib/user-display";
import { arMessages } from "../../../src/product/messages.ar";
import { CreateProjectForm } from "./create-project-form";
import { RecentProjects } from "./recent-projects";

export const metadata: Metadata = {
  title: "إنشاء مشروع",
};

export default async function NewProjectPage() {
  const ctx = await requireAuthorizedContext();
  const user = await getSessionUser();
  const firstName = firstNameOf(user?.name ?? null);
  const recentProjects = (
    await listProjects(getDatabase(), ctx, { filter: "active", query: "" })
  ).slice(0, 4);

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
        className="flex flex-1 flex-col gap-6 pb-[calc(160px+env(safe-area-inset-bottom))] pt-8 sm:pt-12"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 text-center">
          {firstName ? (
            <p className="text-sm font-semibold text-fg-accent">مرحبًا {firstName}</p>
          ) : null}
          <h1 className="text-3xl font-bold leading-snug text-fg sm:text-4xl">
            {arMessages.home.headline}
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-fg-2 sm:text-base">
            {arMessages.home.supportingCopy}
          </p>
        </div>
        <div className="mx-auto w-full max-w-3xl">
          <CreateProjectForm />
          <RecentProjects
            projects={recentProjects.map((project) => ({
              excerpt: project.excerpt,
              id: project.id,
              title: project.title,
              updatedAtIso: project.updatedAt.toISOString(),
            }))}
          />
        </div>
      </PageShell>
    </>
  );
}
