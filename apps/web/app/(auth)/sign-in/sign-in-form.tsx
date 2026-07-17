"use client";

import { Button, StatusBanner, TextField } from "@wakil/ui";
import { useActionState } from "react";

import {
  signInWithEmailAction,
  signInWithGoogleAction,
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
  const [state, formAction, pending] = useActionState(signInWithEmailAction, INITIAL_STATE);

  return (
    <div className="flex flex-col gap-4">
      {authError ? <StatusBanner tone="danger">{authError}</StatusBanner> : null}
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
          error={state.emailError}
          required
        />
        <Button type="submit" loading={pending}>
          أرسل رابط الدخول
        </Button>
      </form>
      <p className="text-center text-sm text-fg-3">
        سنرسل لك رابط دخول صالحًا لمرة واحدة، بلا كلمة مرور.
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
