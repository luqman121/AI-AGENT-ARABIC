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

export { ensurePersonalWorkspace } from "./workspace";

/** Session for optional-authentication pages (e.g. the root redirect). */
export const getSessionUser = cache(async () => {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;
  return { email: user.email ?? null, id: user.id, name: user.name ?? null };
});

/** Guards every authenticated route and resolves the active workspace. */
export const requireAuthorizedContext = cache(async (): Promise<AuthorizedContext> => {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const workspaceId = await ensurePersonalWorkspace(getDatabase(), user.id);
  return { userId: user.id, workspaceId };
});
