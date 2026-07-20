import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { accounts, sessions, users, verificationTokens } from "@wakil/db/schema";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { getWebEnv, isGoogleAuthEnabled } from "./env";
import { credentialsInputSchema, verifyCredentials } from "./server/auth/credentials";
import { getDatabase } from "./server/db";

function buildProviders() {
  const env = getWebEnv();

  // Email + password against the local database. The provider only verifies
  // an existing hash; account creation happens in the sign-in server action.
  const credentials = Credentials({
    credentials: {
      email: { label: "البريد الإلكتروني", type: "email" },
      password: { label: "كلمة المرور", type: "password" },
    },
    async authorize(raw) {
      const parsed = credentialsInputSchema.safeParse(raw);
      if (!parsed.success) return null;
      return verifyCredentials(getDatabase(), parsed.data.email, parsed.data.password);
    },
  });

  const providers: NextAuthConfig["providers"] = [credentials];

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
    // The adapter still persists users and links Google accounts; the
    // credentials provider requires JWT sessions, so session rows are unused.
    adapter: DrizzleAdapter(getDatabase(), {
      accountsTable: accounts,
      sessionsTable: sessions,
      usersTable: users,
      verificationTokensTable: verificationTokens,
    }),
    callbacks: {
      session({ session, token }) {
        if (token.sub) session.user.id = token.sub;
        return session;
      },
    },
    pages: {
      error: "/sign-in",
      signIn: "/sign-in",
    },
    providers: buildProviders(),
    secret: env.AUTH_SECRET,
    session: { strategy: "jwt" },
    trustHost: true,
  };
});
