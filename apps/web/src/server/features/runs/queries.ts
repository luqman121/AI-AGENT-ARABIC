import { runEvents, runs } from "@wakil/db/schema";
import {
  type RunEventPayload,
  type RunEventType,
  type RunStatus,
  type RunStepKey,
} from "@wakil/shared";
import { and, asc, desc, eq, gt } from "drizzle-orm";

import { getProjectById } from "../projects/queries";
import type { Database, ServiceContext } from "../types";

export type RunSummary = {
  id: string;
  status: RunStatus;
  errorCode: string | null;
  cancelRequestedAtIso: string | null;
};

/** Latest run for a project, tenant-scoped; null hides cross-tenant existence. */
export async function getLatestRun(
  db: Database,
  ctx: ServiceContext,
  projectId: string,
): Promise<RunSummary | null> {
  const project = await getProjectById(db, ctx, projectId);
  if (!project) return null;

  const row = (
    await db
      .select({
        cancelRequestedAt: runs.cancelRequestedAt,
        errorCode: runs.errorCode,
        id: runs.id,
        status: runs.status,
      })
      .from(runs)
      .where(and(eq(runs.projectId, project.id), eq(runs.workspaceId, ctx.workspaceId)))
      .orderBy(desc(runs.createdAt))
      .limit(1)
  )[0];

  if (!row) return null;
  return {
    cancelRequestedAtIso: row.cancelRequestedAt?.toISOString() ?? null,
    errorCode: row.errorCode,
    id: row.id,
    status: row.status as RunStatus,
  };
}

/** Verifies the run belongs to the authenticated tenant and requested project. */
export async function getRunForStream(
  db: Database,
  ctx: ServiceContext,
  projectId: string,
  runId: string,
): Promise<{ status: RunStatus } | null> {
  const row = (
    await db
      .select({ status: runs.status })
      .from(runs)
      .where(
        and(
          eq(runs.id, runId),
          eq(runs.projectId, projectId),
          eq(runs.workspaceId, ctx.workspaceId),
        ),
      )
      .limit(1)
  )[0];

  return row ? { status: row.status as RunStatus } : null;
}

/** Ordered durable events with seq greater than a Last-Event-ID cursor. */
export async function getRunEventsAfter(
  db: Database,
  ctx: ServiceContext,
  projectId: string,
  runId: string,
  afterSeq: number,
): Promise<RunEventPayload[]> {
  const belongs = await getRunForStream(db, ctx, projectId, runId);
  if (!belongs) return [];

  const rows = await db
    .select({
      createdAt: runEvents.createdAt,
      data: runEvents.data,
      seq: runEvents.seq,
      type: runEvents.type,
    })
    .from(runEvents)
    .where(
      and(
        eq(runEvents.runId, runId),
        eq(runEvents.workspaceId, ctx.workspaceId),
        gt(runEvents.seq, afterSeq),
      ),
    )
    .orderBy(asc(runEvents.seq));

  return rows.map((row) => {
    const data = (row.data ?? {}) as {
      stepIndex?: number;
      stepKey?: RunStepKey;
      textDelta?: string;
      errorCode?: string;
    };
    return {
      createdAtIso: row.createdAt.toISOString(),
      seq: row.seq,
      ...(typeof data.stepIndex === "number" ? { stepIndex: data.stepIndex } : {}),
      ...(data.stepKey ? { stepKey: data.stepKey } : {}),
      ...(data.textDelta ? { textDelta: data.textDelta } : {}),
      ...(data.errorCode ? { errorCode: data.errorCode } : {}),
      type: row.type as RunEventType,
    };
  });
}
