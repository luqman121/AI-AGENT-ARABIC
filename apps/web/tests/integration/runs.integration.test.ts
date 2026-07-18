import { conversationMessages, conversations, projects, runEvents, runs } from "@wakil/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { startRun } from "../../src/server/features/runs/mutations";
import {
  getLatestRun,
  getRunEventsAfter,
  getRunForStream,
} from "../../src/server/features/runs/queries";
import type { ServiceContext } from "../../src/server/features/types";
import { key, startHarness, type IntegrationHarness } from "./harness";

let harness: IntegrationHarness;
let owner: ServiceContext;
let outsider: ServiceContext;

async function createProject(
  ctx: ServiceContext,
  title: string,
  archived = false,
): Promise<string> {
  const project = (
    await harness.db
      .insert(projects)
      .values({
        archivedAt: archived ? new Date() : null,
        createdByUserId: ctx.userId,
        status: archived ? "archived" : "active",
        title,
        workspaceId: ctx.workspaceId,
      })
      .returning({ id: projects.id })
  )[0];
  if (!project) throw new Error("failed to create project fixture");

  const conversation = (
    await harness.db
      .insert(conversations)
      .values({ projectId: project.id, workspaceId: ctx.workspaceId })
      .returning({ id: conversations.id })
  )[0];
  if (!conversation) throw new Error("failed to create conversation fixture");

  await harness.db.insert(conversationMessages).values({
    content: "أنشئ موقعًا تعريفيًا بسيطًا",
    conversationId: conversation.id,
    role: "user",
    workspaceId: ctx.workspaceId,
  });

  return project.id;
}

beforeAll(async () => {
  harness = await startHarness();
  owner = await harness.createTenant("runs-owner@example.test");
  outsider = await harness.createTenant("runs-outsider@example.test");
}, 120_000);

afterAll(async () => {
  await harness?.stop();
});

describe.sequential("run services", () => {
  it("creates one queued run, persists its first event, and supports ordered replay", async () => {
    const projectId = await createProject(owner, "واجهة المتجر");
    const enqueueRun = vi.fn(async () => undefined);

    const result = await startRun({ db: harness.db, enqueueRun, redis: harness.redis }, owner, {
      idempotencyKey: key("run-create"),
      projectId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(enqueueRun).toHaveBeenCalledOnce();
    expect(enqueueRun).toHaveBeenCalledWith({
      projectId,
      runId: result.data.runId,
      workspaceId: owner.workspaceId,
    });

    await expect(getLatestRun(harness.db, owner, projectId)).resolves.toEqual({
      errorCode: null,
      id: result.data.runId,
      status: "queued",
    });
    await expect(
      getRunEventsAfter(harness.db, owner, projectId, result.data.runId, 0),
    ).resolves.toMatchObject([{ seq: 1, type: "run.queued" }]);
    await expect(
      getRunEventsAfter(harness.db, owner, projectId, result.data.runId, 1),
    ).resolves.toEqual([]);

    const rows = await harness.db
      .select({ seq: runEvents.seq, type: runEvents.type })
      .from(runEvents)
      .where(eq(runEvents.runId, result.data.runId));
    expect(rows).toEqual([{ seq: 1, type: "run.queued" }]);
  });

  it("replays an idempotent start without inserting twice", async () => {
    const projectId = await createProject(owner, "ملف الشركة");
    const enqueueRun = vi.fn(async () => undefined);
    const input = { idempotencyKey: key("run-replay"), projectId };

    const first = await startRun(
      { db: harness.db, enqueueRun, redis: harness.redis },
      owner,
      input,
    );
    const second = await startRun(
      { db: harness.db, enqueueRun, redis: harness.redis },
      owner,
      input,
    );

    expect(first).toEqual(second);
    // Replays safely retry delivery; the real BullMQ producer deduplicates by runId.
    expect(enqueueRun).toHaveBeenCalledTimes(2);
    expect(enqueueRun.mock.calls[0]).toEqual(enqueueRun.mock.calls[1]);
    const rows = await harness.db
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.projectId, projectId), eq(runs.workspaceId, owner.workspaceId)));
    expect(rows).toHaveLength(1);
  });

  it("recovers when the first queue delivery fails after the database commit", async () => {
    const projectId = await createProject(owner, "نموذج التسجيل");
    const enqueueRun = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("queue unavailable"))
      .mockResolvedValueOnce(undefined);
    const input = { idempotencyKey: key("run-enqueue-retry"), projectId };

    const first = await startRun({ db: harness.db, enqueueRun, redis: harness.redis }, owner, input);
    const second = await startRun({ db: harness.db, enqueueRun, redis: harness.redis }, owner, input);

    expect(first).toMatchObject({ code: "INTERNAL_ERROR", ok: false, retryable: true });
    expect(second.ok).toBe(true);
    expect(enqueueRun).toHaveBeenCalledTimes(2);
    const rows = await harness.db
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.projectId, projectId), eq(runs.workspaceId, owner.workspaceId)));
    expect(rows).toHaveLength(1);
    if (second.ok) expect(rows[0]?.id).toBe(second.data.runId);
  });

  it("rejects another active run for the same project", async () => {
    const projectId = await createProject(owner, "صفحة الحملة");
    const enqueueRun = vi.fn(async () => undefined);

    const first = await startRun({ db: harness.db, enqueueRun, redis: harness.redis }, owner, {
      idempotencyKey: key("run-active-first"),
      projectId,
    });
    const second = await startRun({ db: harness.db, enqueueRun, redis: harness.redis }, owner, {
      idempotencyKey: key("run-active-second"),
      projectId,
    });

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ code: "RUN_ALREADY_ACTIVE", ok: false });
    expect(enqueueRun).toHaveBeenCalledOnce();
  });

  it("hides cross-tenant projects and runs", async () => {
    const projectId = await createProject(owner, "مشروع خاص");
    const enqueueRun = vi.fn(async () => undefined);

    const result = await startRun({ db: harness.db, enqueueRun, redis: harness.redis }, outsider, {
      idempotencyKey: key("run-outsider"),
      projectId,
    });

    expect(result).toMatchObject({ code: "NOT_FOUND", ok: false });
    expect(enqueueRun).not.toHaveBeenCalled();

    const ownerRun = await startRun({ db: harness.db, enqueueRun, redis: harness.redis }, owner, {
      idempotencyKey: key("run-owner"),
      projectId,
    });
    expect(ownerRun.ok).toBe(true);
    if (!ownerRun.ok) return;
    await expect(
      getRunForStream(harness.db, outsider, projectId, ownerRun.data.runId),
    ).resolves.toBeNull();
    await expect(
      getRunEventsAfter(harness.db, outsider, projectId, ownerRun.data.runId, 0),
    ).resolves.toEqual([]);
  });

  it("does not start a run for an archived project", async () => {
    const projectId = await createProject(owner, "مشروع مؤرشف", true);
    const enqueueRun = vi.fn(async () => undefined);

    const result = await startRun({ db: harness.db, enqueueRun, redis: harness.redis }, owner, {
      idempotencyKey: key("run-archived"),
      projectId,
    });

    expect(result).toMatchObject({ code: "PROJECT_ARCHIVED", ok: false });
    expect(enqueueRun).not.toHaveBeenCalled();
  });
});
