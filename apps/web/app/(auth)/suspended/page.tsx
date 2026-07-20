import { Ltr } from "@wakil/ui";
import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionAccount } from "../../../src/server/auth/session";
import { SuspendedSignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "الحساب موقوف",
};

export default async function SuspendedPage() {
  const account = await getSessionAccount();
  // Only genuinely-suspended sessions belong here; everyone else returns to the app.
  if (!account) redirect("/sign-in");
  if (account.status !== "suspended") redirect("/new");

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-100 flex-1 flex-col justify-center px-6 py-10"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-danger-subtle">
          <ShieldAlert aria-hidden className="size-8 text-fg-danger" />
        </span>
        <h1 className="text-2xl font-bold text-fg">تم إيقاف هذا الحساب</h1>
        <p className="max-w-[40ch] text-base leading-7 text-fg-2">
          حسابك موقوف حاليًا ولا يمكنه استخدام المنصة. إن كنت تعتقد أن هذا خطأ، تواصل مع الدعم
          للمراجعة.
        </p>
        {account.email ? (
          <p className="text-sm text-fg-3">
            <Ltr>{account.email}</Ltr>
          </p>
        ) : null}
        <div className="mt-2 w-full">
          <SuspendedSignOutButton />
        </div>
      </div>
    </main>
  );
}
