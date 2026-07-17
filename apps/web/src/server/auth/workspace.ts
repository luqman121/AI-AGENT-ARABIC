import { workspaceMembers, workspaces } from "@wakil/db/schema";
import { eq } from "drizzle-orm";

import type { Database } from "../features/types";

/**
 * Provisions the single personal workspace on first authenticated access.
 * Idempotent and race-safe: the unique owner index absorbs concurrent
 * retries, and workspace + membership commit in one transaction.
 */
export async function ensurePersonalWorkspace(db: Database, userId: string): Promise<string> {
  const existing = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .limit(1);
  const existingMembership = existing[0];
  if (existingMembership) return existingMembership.workspaceId;

  return db.transaction(async (tx) => {
    await tx
      .insert(workspaces)
      .values({ name: "مساحتي", ownerUserId: userId })
      .onConflictDoNothing();
    const workspace = (
      await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.ownerUserId, userId))
        .limit(1)
    )[0];
    if (!workspace) {
      throw new Error("workspace provisioning failed");
    }
    await tx
      .insert(workspaceMembers)
      .values({ role: "owner", userId, workspaceId: workspace.id })
      .onConflictDoNothing();
    return workspace.id;
  });
}
