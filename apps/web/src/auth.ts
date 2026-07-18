import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { accounts, sessions, users, verificationTokens } from "@wakil/db/schema";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";

import { getWebEnv, isGoogleAuthEnabled } from "./env";
import { getDatabase } from "./server/db";

function buildProviders() {
  const env = getWebEnv();
  // Magic links go through local SMTP (Mailpit) in development.
  // Tokens are single-use and expire (Auth.js verification tokens).
  const nodemailer = Nodemailer({
    from: env.EMAIL_FROM,
    maxAge: 60 * 60,
    server: {
      disableFileAccess: true,
      disableUrlAccess: true,
      host: env.SMTP_HOST,
      ...(env.SMTP_USER && env.SMTP_PASSWORD
        ? { auth: { pass: env.SMTP_PASSWORD, user: env.SMTP_USER } }
        : {}),
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
    },
    // next-auth's NodemailerConfig is not assignable to Provider under
    // exactOptionalPropertyTypes; the value is a standard provider config.
  }) as unknown as NextAuthConfig["providers"][number];

  const providers: NextAuthConfig["providers"] = [nodemailer];

  // Google appears only when both values are configured; there is no
  // silent fallback between methods (env validation enforces the pair).
  const googleId = env.AUTH_GOOGLE_ID?.trim();
  const googleSecret = env.AUTH_GOOGLE_SECRET?.trim();
  if (isGoogleAuthEnabled(env) && googleId && googleSecret) {
    providers.push(
      Google({
        clientId: googleId,
        clientSecret: googleSecret,
      }),
    );
  }

  return providers;
}

export const { auth, handlers, signIn, signOut } = NextAuth(() => {
  const env = getWebEnv();
  return {
    adapter: DrizzleAdapter(getDatabase(), {
      accountsTable: accounts,
      sessionsTable: sessions,
      usersTable: users,
      verificationTokensTable: verificationTokens,
    }),
    callbacks: {
      session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
    pages: {
      error: "/sign-in",
      signIn: "/sign-in",
      verifyRequest: "/sign-in/check-email",
    },
    providers: buildProviders(),
    secret: env.AUTH_SECRET,
    session: { strategy: "database" },
    trustHost: true,
  };
});
