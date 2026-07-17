"use server";

import type { ActionResult } from "@wakil/shared";
import { revalidatePath } from "next/cache";

import { requireAuthorizedContext } from "../auth/session";
import { getDatabase } from "../db";
import { getRedis } from "../redis";
import { appendRequirement } from "../features/conversations/mutations";
import { archiveProject, createProject, renameProject } from "../features/projects/mutations";

function deps() {
  return { db: getDatabase(), redis: getRedis() };
}

export async function createProjectAction(
  input: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  const ctx = await requireAuthorizedContext();
  const result = await createProject(deps(), ctx, input);
  if (result.ok) revalidatePath("/projects");
  return result;
}

export async function renameProjectAction(
  input: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  const ctx = await requireAuthorizedContext();
  const result = await renameProject(deps(), ctx, input);
  if (result.ok) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.data.projectId}`);
  }
  return result;
}

export async function archiveProjectAction(
  input: unknown,
): Promise<ActionResult<{ projectId: string }>> {
  const ctx = await requireAuthorizedContext();
  const result = await archiveProject(deps(), ctx, input);
  if (result.ok) {
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.data.projectId}`);
  }
  return result;
}

export async function appendRequirementAction(
  input: unknown,
): Promise<ActionResult<{ messageId: string }>> {
  const ctx = await requireAuthorizedContext();
  const result = await appendRequirement(deps(), ctx, input);
  if (result.ok && typeof input === "object" && input !== null && "projectId" in input) {
    revalidatePath(`/projects/${String((input as { projectId: unknown }).projectId)}`);
  }
  return result;
}
