import { AppHeader, Ltr, PageShell } from "@wakil/ui";
import type { Metadata } from "next";

import { getWebEnv, isGoogleAuthEnabled } from "../../../src/env";
import { getSessionUser, requireAuthorizedContext } from "../../../src/server/auth/session";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = {
  title: "الحساب",
};

export default async function AccountPage() {
  await requireAuthorizedContext();
  const user = await getSessionUser();
  const googleEnabled = isGoogleAuthEnabled(getWebEnv());

  return (
    <>
      <AppHeader title="الحساب" />
      <PageShell>
        <section className="wk-elevate-1 mt-2 flex flex-col gap-4 rounded-md p-4">
          <h2 className="text-lg font-bold text-fg">بيانات الحساب</h2>
          <dl className="flex flex-col gap-3">
            {user?.name ? (
              <div className="flex flex-col gap-0.5">
                <dt className="text-sm text-fg-3">الاسم</dt>
                <dd className="text-base text-fg">{user.name}</dd>
              </div>
            ) : null}
            <div className="flex flex-col gap-0.5">
              <dt className="text-sm text-fg-3">البريد الإلكتروني</dt>
              <dd className="text-base text-fg">
                <Ltr>{user?.email ?? "—"}</Ltr>
              </dd>
            </div>
          </dl>
        </section>

        <section className="wk-elevate-1 mt-4 flex flex-col gap-3 rounded-md p-4">
          <h2 className="text-lg font-bold text-fg">طرق تسجيل الدخول المتاحة</h2>
          <ul className="flex flex-col gap-2 text-base text-fg-2">
            <li>رابط الدخول عبر البريد الإلكتروني</li>
            {googleEnabled ? <li>حساب Google</li> : null}
          </ul>
        </section>

        <div className="mt-6">
          <SignOutButton />
        </div>
      </PageShell>
    </>
  );
}
