"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn, signOut } from "../../auth";

const emailSchema = z.email({ error: "أدخل بريدًا إلكترونيًا صحيحًا." });

export type SignInFormState = {
  emailError?: string;
};

/**
 * Starts the email magic-link flow. Auth.js redirects to the Arabic
 * check-email page; the link itself is never logged or returned.
 */
export async function signInWithEmailAction(
  _previous: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) {
    return { emailError: parsed.error.issues[0]?.message ?? "أدخل بريدًا إلكترونيًا صحيحًا." };
  }
  try {
    await signIn("nodemailer", { email: parsed.data, redirect: false, redirectTo: "/new" });
  } catch {
    return { emailError: "تعذّر إرسال رابط الدخول. أعد المحاولة." };
  }
  redirect("/sign-in/check-email");
}

export async function signInWithGoogleAction(): Promise<void> {
  await signIn("google", { redirectTo: "/new" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/sign-in" });
}
