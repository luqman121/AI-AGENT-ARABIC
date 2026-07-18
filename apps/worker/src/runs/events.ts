import type { createDatabaseClient } from "@wakil/db/client";
import { runEvents } from "@wakil/db/schema";
import {
  runEventChannel,
  type RunEventPayload,
  type RunEventType,
  type RunStepKey,
} from "@wakil/shared";
import { eq, sql } from "drizzle-orm";
import type { Redis } from "ioredis";

// Drizzle transaction client type, derived from the db handle.
type Database = ReturnType<typeof createDatabaseClient>["db"];
type TransactionClient = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type AppendRunEventInput = {
  runId: string;
  workspaceId: string;
  type: RunEventType;
  stepKey?: RunStepKey;
  stepIndex?: number;
  textDelta?: string;
  errorCode?: string;
};

/** Inserts one append-only event with seq = max(seq)+1 for the run. */
export async function appendRunEvent(
  tx: TransactionClient,
  input: AppendRunEventInput,
): Promise<{ seq: number; createdAtIso: string }> {
  const next = (
    await tx
      .select({ seq: sql<number>`coalesce(max(${runEvents.seq}), 0) + 1` })
      .from(runEvents)
      .where(eq(runEvents.runId, input.runId))
  )[0];
  const seq = next?.seq ?? 1;

  const data: Record<string, number | string> = {};
  if (input.stepKey) data["stepKey"] = input.stepKey;
  if (typeof input.stepIndex === "number") data["stepIndex"] = input.stepIndex;
  if (input.textDelta) data["textDelta"] = input.textDelta;
  if (input.errorCode) data["errorCode"] = input.errorCode;

  const inserted = (
    await tx
      .insert(runEvents)
      .values({
        runId: input.runId,
        workspaceId: input.workspaceId,
        seq,
        type: input.type,
        data,
      })
      .returning({ createdAt: runEvents.createdAt })
  )[0];
  if (!inserted) throw new Error("run event insert returned no row");

  return { seq, createdAtIso: inserted.createdAt.toISOString() };
}

/** Publishes a live copy to Redis; PostgreSQL already holds the durable event. */
export async function publishRunEvent(
  redis: Redis,
  runId: string,
  payload: RunEventPayload,
): Promise<void> {
  await redis.publish(runEventChannel(runId), JSON.stringify(payload));
}
