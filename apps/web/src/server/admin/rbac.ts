import {
  can,
  canAccessAdmin,
  hasAtLeastRole,
  type AdminPermission,
  type PlatformRole,
} from "@wakil/shared";
import { redirect } from "next/navigation";

import { getSessionAccount, type SessionAccount } from "../auth/session";

export type AdminAccount = SessionAccount;

/** Thrown by action-side guards; callers translate it into a safe result. */
export class AdminForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN");
    this.name = "AdminForbiddenError";
  }
}

/**
 * Page/layout guard. Enforces admin authorization server-side and never leaks
 * the existence of the dashboard to unauthorized users:
 *  - no session        → sign-in
 *  - suspended account → suspended page
 *  - insufficient role → the customer home (a safe, non-revealing redirect)
 */
export async function requireAdminPage(minimum: PlatformRole = "support"): Promise<AdminAccount> {
  const account = await getSessionAccount();
  if (!account) redirect("/sign-in");
  if (account.status === "suspended") redirect("/suspended");
  if (!canAccessAdmin(account.role) || !hasAtLeastRole(account.role, minimum)) {
    redirect("/new");
  }
  return account;
}

/**
 * Server-action / route-handler guard. Throws instead of redirecting so the
 * caller returns a safe generic failure. Verifies the specific permission,
 * not merely dashboard access.
 */
export async function requireAdminAction(permission: AdminPermission): Promise<AdminAccount> {
  const account = await getSessionAccount();
  if (!account || account.status === "suspended" || !can(account.role, permission)) {
    throw new AdminForbiddenError();
  }
  return account;
}
