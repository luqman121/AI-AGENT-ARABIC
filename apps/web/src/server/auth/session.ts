import { users } from "@wakil/db/schema";
import type { PlatformRole, UserPlan, UserStatus } from "@wakil/shared";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "../../auth";
import { getDatabase } from "../db";
import { ensurePersonalWorkspace } from "./workspace";

/**
 * The only trusted actor identity is the server session. Client-supplied
 * user or workspace IDs are never accepted as authorization.
 */
export type AuthorizedContext = {
  userId: string;
  workspaceId: string;
};

/** Session identity joined with the persisted account fields that gate access. */
export type SessionAccount = {
  id: string;
  email: string | null;
  name: string | null;
  role: PlatformRole;
  status: UserStatus;
  plan: UserPlan;
};

export { ensurePersonalWorkspace } from "./workspace";

/** Session for optional-authentication pages (e.g. the root redirect). */
export const getSessionUser = cache(async () => {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;
  return { email: user.email ?? null, id: user.id, name: user.name ?? null };
});

/**
 * Session identity plus the durable role/status/plan, read from PostgreSQL on
 * each request so a role change or suspension takes effect immediately (the
 * JWT is never trusted for authorization decisions).
 */
export const getSessionAccount = cache(async (): Promise<SessionAccount | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const row = (
    await getDatabase()
      .select({
        email: users.email,
        id: users.id,
        name: users.name,
        plan: users.plan,
        role: users.role,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
  )[0];
  if (!row) return null;
  return {
    email: row.email,
    id: row.id,
    name: row.name,
    plan: row.plan as UserPlan,
    role: row.role as PlatformRole,
    status: row.status as UserStatus,
  };
});

/** Guards every authenticated route and resolves the active workspace. */
export const requireAuthorizedContext = cache(async (): Promise<AuthorizedContext> => {
  const account = await getSessionAccount();
  if (!account) redirect("/sign-in");
  // A suspended account cannot use the product; a dedicated public page avoids
  // the sign-in redirect bounce (the proxy sends authenticated users off /sign-in).
  if (account.status === "suspended") redirect("/suspended");
  const workspaceId = await ensurePersonalWorkspace(getDatabase(), account.id);
  return { userId: account.id, workspaceId };
});
