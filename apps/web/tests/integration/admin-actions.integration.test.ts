import { adminAuditLogs, runEvents, runs, users } from "@wakil/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  cancelRunAdminAction,
  changeUserRoleAction,
  changeUserStatusAction,
  retryRunAdminAction,
} from "../../src/server/admin/actions";
import { getProjectConversation } from "../../src/server/features/conversations/queries";
import { createProject } from "../../src/server/features/projects/mutations";
import type { ServiceContext } from "../../src/server/features/types";
import { key, startHarness, type IntegrationHarness } from "./harness";

/* ------------------------------------------------------------------ *
 * Hoisted shared state so the vi.mock factories (which run before the
 * module body) can read the harness handle and the simulated actor.
 * ------------------------------------------------------------------ */

const hoisted = vi.hoisted(() => {
  class MockForbiddenError extends Error {
    constructor() {
      super("FORBIDDEN");
      this.name = "AdminForbiddenError";
    }
  }
  return {
    MockForbiddenError,
    enqueueSpy: vi.fn(() => Promise.resolve()),
    state: {
      db: null as unknown,
      account: null as {
        id: string;
        email: string | null;
        name: string | null;
        role: "user" | "support" | "admin";
        status: "active" | "suspended";
        plan: "free" | "pro" | "business";
      } | null,
    },
  };
});

// Real database (the harness) but stubbed request/session/queue seams so the
// genuine action logic executes end-to-end against PostgreSQL.
vi.mock("../../src/server/db", () => ({
  getDatabase: () => hoisted.state.db,
  getDatabaseHandle: () => ({ db: hoisted.state.db }),
}));

vi.mock("../../src/server/redis", () => ({
  getRedis: () => null,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

vi.mock("../../src/server/features/rate-limit/service", () => ({
  enforceRateLimit: async () => null,
}));

// The retry action's "real re-enqueue" seam — asserted, never faked away.
vi.mock("../../src/server/features/runs/queue", () => ({
  enqueueRun: () => hoisted.enqueueSpy(),
}));

// Fully replaced (importing the real module would pull in NextAuth and fail
// env validation at import). The permission decision is driven by state.account.
vi.mock("../../src/server/admin/rbac", () => ({
  AdminForbiddenError: hoisted.MockForbiddenError,
  requireAdminAction: async () => {
    if (!hoisted.state.account) throw new hoisted.MockForbiddenError();
    return hoisted.state.account;
  },
}));

// Safe partial mock: keep real writeAdminAudit, stub only the header reader.
vi.mock("../../src/server/admin/audit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/server/admin/audit")>();
  return {
    ...actual,
    getAdminRequestMeta: async () => ({ ipAddress: null, requestId: null, userAgent: null }),
  };
});

let harness: IntegrationHarness;
let owner: ServiceContext;
let actorAdminId: string;

async function seedProjectWithConversation(seed: string): Promise<{
  projectId: string;
  conversationId: string;
}> {
  const created = await createProject({ db: harness.db, redis: harness.redis }, owner, {
    idempotencyKey: key(seed),
    request: `طلب اختبار لـ ${seed}`,
    title: `مشروع ${seed}`,
  });
  if (!created.ok) throw new Error("failed to seed project");
  const conversation = await getProjectConversation(harness.db, owner, created.data.projectId);
  if (!conversation) throw new Error("missing conversation");
  return { conversationId: conversation.conversationId, projectId: created.data.projectId };
}

async function seedRun(
  seed: string,
  status: "queued" | "running" | "succeeded" | "failed",
): Promise<{ runId: string; projectId: string }> {
  const { conversationId, projectId } = await seedProjectWithConversation(seed);
  const [run] = await harness.db
    .insert(runs)
    .values({
      conversationId,
      createdByUserId: owner.userId,
      kind: "planning",
      projectId,
      status,
      workspaceId: owner.workspaceId,
    })
    .returning({ id: runs.id });
  if (!run) throw new Error("failed to seed run");
  return { projectId, runId: run.id };
}

beforeAll(async () => {
  harness = await startHarness();
  hoisted.state.db = harness.db;

  owner = await harness.createTenant("owner@wakil.test");

  const [admin] = await harness.db
    .insert(users)
    .values({ email: "actor-admin@wakil.test", role: "admin", status: "active" })
    .returning({ id: users.id });
  if (!admin) throw new Error("failed to seed admin actor");
  actorAdminId = admin.id;

  hoisted.state.account = {
    email: "actor-admin@wakil.test",
    id: actorAdminId,
    name: null,
    plan: "free",
    role: "admin",
    status: "active",
  };
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

/* ------------------------------------------------------------------ *
 * RBAC enforcement at the action boundary
 * ------------------------------------------------------------------ */

describe("action-level authorization", () => {
  it("refuses run actions when the guard denies (no permission)", async () => {
    const previous = hoisted.state.account;
    hoisted.state.account = null;
    hoisted.enqueueSpy.mockClear();
    const { runId } = await seedRun("forbidden", "failed");

    const result = await retryRunAdminAction({ runId });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("ليس لديك صلاحية");
    expect(hoisted.enqueueSpy).not.toHaveBeenCalled();
    // No new run was created for the project.
    const projectRuns = await harness.db
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.createdByUserId, owner.userId));
    expect(projectRuns.some((r) => r.id === runId)).toBe(true);

    hoisted.state.account = previous;
  });
});

/* ------------------------------------------------------------------ *
 * Cancel: only an active run, and it must invoke real cooperative cancel
 * ------------------------------------------------------------------ */

describe("cancelRunAdminAction", () => {
  it("rejects cancelling a run that is not active", async () => {
    const { runId } = await seedRun("cancel-succeeded", "succeeded");
    const result = await cancelRunAdminAction({ runId });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("غير نشِط");
  });

  it("requests cancellation on an active run and writes an audit row", async () => {
    const { runId } = await seedRun("cancel-running", "running");
    const result = await cancelRunAdminAction({ runId, reason: "اختبار الإلغاء" });
    expect(result.ok).toBe(true);

    const [row] = await harness.db
      .select({ cancelRequestedAt: runs.cancelRequestedAt })
      .from(runs)
      .where(eq(runs.id, runId));
    expect(row?.cancelRequestedAt).toBeInstanceOf(Date);

    const [audit] = await harness.db
      .select({ action: adminAuditLogs.action, actorRole: adminAuditLogs.actorRole })
      .from(adminAuditLogs)
      .where(and(eq(adminAuditLogs.targetId, runId), eq(adminAuditLogs.action, "run.cancelled")));
    expect(audit?.action).toBe("run.cancelled");
    expect(audit?.actorRole).toBe("admin");
  });
});

/* ------------------------------------------------------------------ *
 * Retry: only a failed run, via a genuine new queued run + re-enqueue
 * ------------------------------------------------------------------ */

describe("retryRunAdminAction", () => {
  it("rejects retrying a run that did not fail", async () => {
    hoisted.enqueueSpy.mockClear();
    const { runId } = await seedRun("retry-succeeded", "succeeded");
    const result = await retryRunAdminAction({ runId });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("الفاشلة فقط");
    expect(hoisted.enqueueSpy).not.toHaveBeenCalled();
  });

  it("creates a new queued run, emits run.queued, audits, and re-enqueues", async () => {
    hoisted.enqueueSpy.mockClear();
    const { projectId, runId } = await seedRun("retry-failed", "failed");

    const result = await retryRunAdminAction({ runId, reason: "إعادة بعد فشل" });
    expect(result.ok).toBe(true);
    expect(hoisted.enqueueSpy).toHaveBeenCalledTimes(1);

    // A brand new queued run exists for the project (not a status flip of the old one).
    const projectRuns = await harness.db
      .select({ id: runs.id, status: runs.status })
      .from(runs)
      .where(eq(runs.projectId, projectId));
    const queued = projectRuns.find((r) => r.status === "queued");
    expect(queued).toBeTruthy();
    expect(queued?.id).not.toBe(runId);

    // The original failed run is untouched.
    const [original] = await harness.db
      .select({ status: runs.status })
      .from(runs)
      .where(eq(runs.id, runId));
    expect(original?.status).toBe("failed");

    // The new run has a seeded run.queued event.
    const events = await harness.db
      .select({ type: runEvents.type })
      .from(runEvents)
      .where(eq(runEvents.runId, queued!.id));
    expect(events.map((e) => e.type)).toContain("run.queued");

    const [audit] = await harness.db
      .select({ action: adminAuditLogs.action })
      .from(adminAuditLogs)
      .where(and(eq(adminAuditLogs.targetId, runId), eq(adminAuditLogs.action, "run.retried")));
    expect(audit?.action).toBe("run.retried");
  });

  it("refuses a second retry while an active run already exists for the project", async () => {
    // One project with a failed run; retrying it creates the project's active run.
    const { conversationId, projectId } = await seedProjectWithConversation("contended");
    const [failedA] = await harness.db
      .insert(runs)
      .values({
        conversationId,
        createdByUserId: owner.userId,
        kind: "planning",
        projectId,
        status: "failed",
        workspaceId: owner.workspaceId,
      })
      .returning({ id: runs.id });

    hoisted.enqueueSpy.mockClear();
    const firstRetry = await retryRunAdminAction({ runId: failedA!.id });
    expect(firstRetry.ok).toBe(true); // created the queued (active) run for the project

    // A second failed run in the SAME project cannot be retried while active.
    const [failedB] = await harness.db
      .insert(runs)
      .values({
        conversationId,
        createdByUserId: owner.userId,
        kind: "planning",
        projectId,
        status: "failed",
        workspaceId: owner.workspaceId,
      })
      .returning({ id: runs.id });

    const blocked = await retryRunAdminAction({ runId: failedB!.id });
    expect(blocked.ok).toBe(false);
    expect(blocked.message).toContain("تشغيل نشط");
  });
});

/* ------------------------------------------------------------------ *
 * Last-active-admin lockout guard (self-suspend / self-demote)
 * ------------------------------------------------------------------ */

describe("last active admin protection", () => {
  it("prevents suspending the only active admin", async () => {
    const result = await changeUserStatusAction({ status: "suspended", userId: actorAdminId });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("آخر مدير");
  });

  it("prevents demoting the only active admin", async () => {
    const result = await changeUserRoleAction({ role: "support", userId: actorAdminId });
    expect(result.ok).toBe(false);
    expect(result.message).toContain("آخر مدير");
  });

  it("allows suspending an admin once a second active admin exists", async () => {
    const [second] = await harness.db
      .insert(users)
      .values({ email: "second-admin@wakil.test", role: "admin", status: "active" })
      .returning({ id: users.id });
    const result = await changeUserStatusAction({ status: "suspended", userId: second!.id });
    expect(result.ok).toBe(true);
    const [row] = await harness.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, second!.id));
    expect(row?.status).toBe("suspended");
  });
});
