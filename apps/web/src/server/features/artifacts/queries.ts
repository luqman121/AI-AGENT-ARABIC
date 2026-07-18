import { artifacts } from "@wakil/db/schema";
import { and, desc, eq } from "drizzle-orm";

import { getProjectById } from "../projects/queries";
import type { Database, ServiceContext } from "../types";

export type ArtifactSummary = {
  downloadObjectKey: string;
  downloadSizeBytes: number;
  id: string;
  previewObjectKey: string;
};

/** Latest artifact for an authorized project; null hides cross-tenant existence. */
export async function getLatestArtifact(
  db: Database,
  ctx: ServiceContext,
  projectId: string,
): Promise<ArtifactSummary | null> {
  const project = await getProjectById(db, ctx, projectId);
  if (!project) return null;
  return (
    (
      await db
        .select({
          downloadObjectKey: artifacts.downloadObjectKey,
          downloadSizeBytes: artifacts.downloadSizeBytes,
          id: artifacts.id,
          previewObjectKey: artifacts.previewObjectKey,
        })
        .from(artifacts)
        .where(and(eq(artifacts.projectId, project.id), eq(artifacts.workspaceId, ctx.workspaceId)))
        .orderBy(desc(artifacts.createdAt))
        .limit(1)
    )[0] ?? null
  );
}
