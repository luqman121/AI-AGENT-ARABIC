"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "../../auth";
import { createCredentialsUser, credentialsInputSchema, getUserByEmail } from "../auth/credentials";
import { getDatabase } from "../db";

export type SignInFormState = {
  formError?: string;
  fieldErrors?: {
    email?: string;
    password?: string;
  };
};

/**
 * Email + password sign-in. A known email logs in when the password matches;
 * an unknown email creates the account and logs in. Either way the user lands
 * directly in the app — there is no email round-trip. The password is never
 * logged or returned.
 */
export async function signInWithPasswordAction(
  _previous: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const parsed = credentialsInputSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const fieldErrors: SignInFormState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "email") fieldErrors.email ??= issue.message;
      if (field === "password") fieldErrors.password ??= issue.message;
    }
    return { fieldErrors };
  }

  const { email, password } = parsed.data;
  const db = getDatabase();

  // New email: create the account first, then authenticate it below so the
  // session is established through the same credentials path as a returning user.
  const existing = await getUserByEmail(db, email);
  if (!existing) {
    await createCredentialsUser(db, email, password);
  } else if (!existing.passwordHash) {
    // The email belongs to an OAuth-only account with no password set.
    return { formError: "هذا البريد مسجّل بطريقة دخول أخرى. استخدم Google للمتابعة." };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    // A credentials mismatch (wrong password for an existing account) surfaces
    // as an AuthError; anything else is unexpected and must propagate.
    if (error instanceof AuthError) {
      return { formError: "بيانات الدخول غير صحيحة. تحقق من البريد وكلمة المرور." };
    }
    throw error;
  }

  // Outside the try/catch so Next's redirect signal is never swallowed.
  redirect("/new");
}

export async function signInWithGoogleAction(): Promise<void> {
  await signIn("google", { redirectTo: "/new" });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/sign-in" });
}
