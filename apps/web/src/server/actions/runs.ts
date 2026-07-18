"use server";

import type { ActionResult } from "@wakil/shared";
import { revalidatePath } from "next/cache";

import { requireAuthorizedContext } from "../auth/session";
import { getDatabase } from "../db";
import { cancelRun, startRun } from "../features/runs/mutations";
import { enqueueRun } from "../features/runs/queue";
import { getRedis } from "../redis";

function deps() {
  return { db: getDatabase(), enqueueRun, redis: getRedis() };
}

export async function startRunAction(input: unknown): Promise<ActionResult<{ runId: string }>> {
  const ctx = await requireAuthorizedContext();
  const result = await startRun(deps(), ctx, input);
  if (result.ok && typeof input === "object" && input !== null && "projectId" in input) {
    revalidatePath(`/projects/${String((input as { projectId: unknown }).projectId)}`);
  }
  return result;
}

export async function cancelRunAction(input: unknown): Promise<ActionResult<{ runId: string }>> {
  const ctx = await requireAuthorizedContext();
  return cancelRun(deps(), ctx, input);
}
