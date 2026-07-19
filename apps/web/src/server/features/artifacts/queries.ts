import { artifacts } from "@wakil/db/schema";
import { and, desc, eq } from "drizzle-orm";

import { getProjectById } from "../projects/queries";
import type { Database, ServiceContext } from "../types";

export type ArtifactSummary = {
  createdAt: Date;
  downloadObjectKey: string;
  downloadSizeBytes: number;
  id: string;
  kind: string;
  previewObjectKey: string;
};

export async function getArtifactById(
  db: Database,
  ctx: ServiceContext,
  projectId: string,
  artifactId: string,
): Promise<ArtifactSummary | null> {
  const project = await getProjectById(db, ctx, projectId);
  if (!project) return null;
  return (
    (
      await db
        .select({
          createdAt: artifacts.createdAt,
          downloadObjectKey: artifacts.downloadObjectKey,
          downloadSizeBytes: artifacts.downloadSizeBytes,
          id: artifacts.id,
          kind: artifacts.kind,
          previewObjectKey: artifacts.previewObjectKey,
        })
        .from(artifacts)
        .where(
          and(
            eq(artifacts.id, artifactId),
            eq(artifacts.projectId, project.id),
            eq(artifacts.workspaceId, ctx.workspaceId),
          ),
        )
        .limit(1)
    )[0] ?? null
  );
}

export async function listProjectArtifacts(
  db: Database,
  ctx: ServiceContext,
  projectId: string,
  limit = 20,
): Promise<ArtifactSummary[]> {
  const project = await getProjectById(db, ctx, projectId);
  if (!project) return [];
  return db
    .select({
      createdAt: artifacts.createdAt,
      downloadObjectKey: artifacts.downloadObjectKey,
      downloadSizeBytes: artifacts.downloadSizeBytes,
      id: artifacts.id,
      kind: artifacts.kind,
      previewObjectKey: artifacts.previewObjectKey,
    })
    .from(artifacts)
    .where(and(eq(artifacts.projectId, project.id), eq(artifacts.workspaceId, ctx.workspaceId)))
    .orderBy(desc(artifacts.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
}

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
          createdAt: artifacts.createdAt,
          downloadObjectKey: artifacts.downloadObjectKey,
          downloadSizeBytes: artifacts.downloadSizeBytes,
          id: artifacts.id,
          kind: artifacts.kind,
          previewObjectKey: artifacts.previewObjectKey,
        })
        .from(artifacts)
        .where(and(eq(artifacts.projectId, project.id), eq(artifacts.workspaceId, ctx.workspaceId)))
        .orderBy(desc(artifacts.createdAt))
        .limit(1)
    )[0] ?? null
  );
}
