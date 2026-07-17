import { createHash } from "node:crypto";

import { idempotencyKeys } from "@wakil/db/schema";
import { and, eq } from "drizzle-orm";

import type { TransactionClient } from "../types";

const KEY_TTL_MS = 24 * 60 * 60 * 1000;

/** Stable hash of the mutation payload; never stores the payload itself. */
export function hashRequest(operation: string, payload: Record<string, string>): string {
  const canonical = JSON.stringify(
    Object.keys(payload)
      .sort()
      .map((key) => [key, payload[key]]),
  );
  return createHash("sha256").update(`${operation}:${canonical}`).digest("hex");
}

export type IdempotencyScope = {
  workspaceId: string;
  userId: string;
  operation: string;
  key: string;
  requestHash: string;
};

export type IdempotencyBegin =
  { kind: "fresh" } | { kind: "replay"; response: Record<string, string> } | { kind: "conflict" };

/**
 * Claims the idempotency key inside the mutation transaction. A concurrent
 * duplicate blocks on the unique index until the first transaction commits,
 * then reads the committed row and replays instead of re-executing. A failed
 * transaction rolls the claim back, so retries after failure run fresh.
 */
export async function beginIdempotent(
  tx: TransactionClient,
  scope: IdempotencyScope,
): Promise<IdempotencyBegin> {
  const inserted = await tx
    .insert(idempotencyKeys)
    .values({
      expiresAt: new Date(Date.now() + KEY_TTL_MS),
      key: scope.key,
      operation: scope.operation,
      requestHash: scope.requestHash,
      response: {},
      userId: scope.userId,
      workspaceId: scope.workspaceId,
    })
    .onConflictDoNothing()
    .returning({ id: idempotencyKeys.id });

  if (inserted.length > 0) return { kind: "fresh" };

  const existing = (
    await tx
      .select({
        requestHash: idempotencyKeys.requestHash,
        response: idempotencyKeys.response,
      })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.workspaceId, scope.workspaceId),
          eq(idempotencyKeys.userId, scope.userId),
          eq(idempotencyKeys.operation, scope.operation),
          eq(idempotencyKeys.key, scope.key),
        ),
      )
      .limit(1)
  )[0];

  if (!existing) return { kind: "fresh" };
  if (existing.requestHash !== scope.requestHash) return { kind: "conflict" };
  return { kind: "replay", response: existing.response };
}

/** Stores the minimal replayable result (IDs only, never content). */
export async function completeIdempotent(
  tx: TransactionClient,
  scope: IdempotencyScope,
  response: Record<string, string>,
): Promise<void> {
  await tx
    .update(idempotencyKeys)
    .set({ response })
    .where(
      and(
        eq(idempotencyKeys.workspaceId, scope.workspaceId),
        eq(idempotencyKeys.userId, scope.userId),
        eq(idempotencyKeys.operation, scope.operation),
        eq(idempotencyKeys.key, scope.key),
      ),
    );
}
