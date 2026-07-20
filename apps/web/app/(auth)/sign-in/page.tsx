import type { Metadata } from "next";

import { getWebEnv, isGoogleAuthEnabled } from "../../../src/env";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "تعذّر تسجيل الدخول بهذا الحساب. جرّب بريدًا آخر.",
  Configuration: "تعذّر تسجيل الدخول بسبب إعداد غير مكتمل. أعد المحاولة لاحقًا.",
  CredentialsSignin: "بيانات الدخول غير صحيحة. تحقق من البريد وكلمة المرور.",
  default: "تعذّر تسجيل الدخول. أعد المحاولة.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const authError = error
    ? (AUTH_ERROR_MESSAGES[error] ?? AUTH_ERROR_MESSAGES["default"] ?? null)
    : null;

  return (
    <main
      id="main"
      className="mx-auto flex w-full max-w-100 flex-1 flex-col justify-center px-6 py-10"
    >
      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        <span
          aria-hidden
          className="flex size-16 items-center justify-center rounded-md bg-accent-subtle text-3xl font-bold text-fg-accent"
        >
          و
        </span>
        <h1 className="text-2xl font-bold text-fg">وكيل</h1>
        <p className="text-base leading-7 text-fg-2">اوصف ما تحتاجه بالعربي، ووكيل ينجزه لك.</p>
      </div>
      <SignInForm googleEnabled={isGoogleAuthEnabled(getWebEnv())} authError={authError} />
    </main>
  );
}
