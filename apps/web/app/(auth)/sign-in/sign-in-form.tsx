"use client";

import { Button, StatusBanner, TextField } from "@wakil/ui";
import { useActionState } from "react";

import {
  signInWithGoogleAction,
  signInWithPasswordAction,
  type SignInFormState,
} from "../../../src/server/actions/auth";

const INITIAL_STATE: SignInFormState = {};

export function SignInForm({
  authError,
  googleEnabled,
}: {
  authError: string | null;
  googleEnabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(signInWithPasswordAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      {authError ? <StatusBanner tone="danger">{authError}</StatusBanner> : null}
      {state.formError ? <StatusBanner tone="danger">{state.formError}</StatusBanner> : null}
      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <TextField
          name="email"
          type="email"
          label="البريد الإلكتروني"
          placeholder="name@example.com"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          className="text-start"
          error={state.fieldErrors?.email}
          required
        />
        <TextField
          name="password"
          type="password"
          label="كلمة المرور"
          placeholder="٨ أحرف على الأقل"
          autoComplete="current-password"
          dir="ltr"
          className="text-start"
          error={state.fieldErrors?.password}
          required
        />
        <Button type="submit" loading={pending}>
          الدخول
        </Button>
      </form>
      <p className="text-center text-sm text-fg-3">
        أدخل بريدك وكلمة المرور للدخول. إن لم يكن لديك حساب، سيُنشأ لك تلقائيًا.
      </p>
      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            <span className="text-sm text-fg-3">أو</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <form action={signInWithGoogleAction}>
            <Button type="submit" variant="secondary" className="w-full">
              المتابعة بحساب Google
            </Button>
          </form>
        </>
      ) : null}
    </div>
  );
}
