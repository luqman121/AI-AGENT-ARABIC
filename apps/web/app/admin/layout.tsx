import { Ltr } from "@wakil/ui";
import { ArrowRight, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { requireAdminPage } from "../../src/server/admin/rbac";
import { AdminNav } from "./_components/admin-nav";
import { Badge } from "./_components/ui";

export const metadata: Metadata = {
  title: "لوحة الإدارة",
};

const ROLE_LABEL: Record<string, string> = { admin: "مدير", support: "دعم", user: "مستخدم" };

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Server-side gate for every admin route. Unauthorized users never reach here.
  const account = await requireAdminPage("support");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-(--wk-z-nav) border-b border-line bg-page/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-4">
          <Link
            href="/admin"
            className="wk-focus-ring flex items-center gap-2 text-base font-bold text-fg"
          >
            <ShieldCheck aria-hidden className="size-5 text-fg-accent" />
            <span>وكيل · الإدارة</span>
          </Link>
          <div className="ms-auto flex items-center gap-3">
            <Badge tone="accent">{ROLE_LABEL[account.role] ?? account.role}</Badge>
            {account.email ? (
              <span className="hidden text-sm text-fg-3 sm:inline">
                <Ltr>{account.email}</Ltr>
              </span>
            ) : null}
            <Link
              href="/new"
              className="wk-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-fg-2 hover:text-fg"
            >
              <ArrowRight aria-hidden className="size-4" />
              <span className="hidden sm:inline">العودة للتطبيق</span>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col lg:flex-row">
        <aside className="border-b border-line p-3 lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-e">
          <div className="overflow-x-auto lg:overflow-visible">
            <AdminNav />
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
