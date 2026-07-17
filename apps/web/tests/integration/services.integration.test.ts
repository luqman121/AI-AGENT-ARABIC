import { auditLogs, idempotencyKeys, projects, workspaces } from "@wakil/db/schema";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ensurePersonalWorkspace } from "../../src/server/auth/workspace";
import { appendRequirement } from "../../src/server/features/conversations/mutations";
import { getProjectConversation } from "../../src/server/features/conversations/queries";
import {
  archiveProject,
  createProject,
  renameProject,
} from "../../src/server/features/projects/mutations";
import { getProjectById, listProjects } from "../../src/server/features/projects/queries";
import type { ServiceContext } from "../../src/server/features/types";
import { key, startHarness, type IntegrationHarness } from "./harness";

let harness: IntegrationHarness;
let tenant: ServiceContext;

beforeAll(async () => {
  harness = await startHarness();
  tenant = await harness.createTenant("owner@wakil.test");
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

function deps() {
  return { db: harness.db, redis: harness.redis };
}

describe("personal workspace provisioning", () => {
  it("creates exactly one workspace and owner membership, even under concurrent retries", async () => {
    const user = await harness.createTenant("provision@wakil.test");
    const results = await Promise.all([
      ensurePersonalWorkspace(harness.db, user.userId),
      ensurePersonalWorkspace(harness.db, user.userId),
      ensurePersonalWorkspace(harness.db, user.userId),
    ]);
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBe(user.workspaceId);

    const owned = await harness.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, user.userId));
    expect(owned).toHaveLength(1);
  });
});

describe("project lifecycle", () => {
  it("creates project, conversation, first message, idempotency record, and audit log atomically", async () => {
    const result = await createProject(deps(), tenant, {
      idempotencyKey: key("create-1"),
      request: "أريد موقعًا بسيطًا لمطعمي مع قائمة الطعام",
      title: "موقع مطعم البيت",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const conversation = await getProjectConversation(harness.db, tenant, result.data.projectId);
    expect(conversation?.project.title).toBe("موقع مطعم البيت");
    expect(conversation?.messages).toHaveLength(1);
    expect(conversation?.messages[0]?.content).toContain("قائمة الطعام");
    expect(conversation?.messages[0]?.role).toBe("user");

    const audit = await harness.db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.workspaceId, tenant.workspaceId), eq(auditLogs.action, "project.created")),
      );
    expect(audit).toHaveLength(1);
    // Safe metadata only — never titles, prompts, or message bodies.
    expect(JSON.stringify(audit[0]?.metadata)).not.toContain("مطعم");
    expect(audit[0]?.metadata).toMatchObject({ titleLength: 15 });
  });

  it("lists, searches by title and request text, renames, and archives within the workspace", async () => {
    const created = await createProject(deps(), tenant, {
      idempotencyKey: key("create-2"),
      request: "عرض تقديمي عن خطة التسويق للربع القادم",
      title: "عرض التسويق",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const all = await listProjects(harness.db, tenant, { filter: "active" });
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all[0]?.excerpt.length).toBeGreaterThan(0);

    const byTitle = await listProjects(harness.db, tenant, { filter: "active", query: "التسويق" });
    expect(byTitle.map((p) => p.id)).toContain(created.data.projectId);

    const byRequest = await listProjects(harness.db, tenant, {
      filter: "active",
      query: "قائمة الطعام",
    });
    expect(byRequest.length).toBeGreaterThanOrEqual(1);

    const noResults = await listProjects(harness.db, tenant, {
      filter: "active",
      query: "لا يوجد شيء بهذا الاسم",
    });
    expect(noResults).toHaveLength(0);

    const renamed = await renameProject(deps(), tenant, {
      idempotencyKey: key("rename-1"),
      projectId: created.data.projectId,
      title: "عرض التسويق المحدث",
    });
    expect(renamed.ok).toBe(true);
    expect((await getProjectById(harness.db, tenant, created.data.projectId))?.title).toBe(
      "عرض التسويق المحدث",
    );

    const archived = await archiveProject(deps(), tenant, {
      idempotencyKey: key("archive-1"),
      projectId: created.data.projectId,
    });
    expect(archived.ok).toBe(true);

    const activeAfter = await listProjects(harness.db, tenant, { filter: "active" });
    expect(activeAfter.map((p) => p.id)).not.toContain(created.data.projectId);
    const archivedList = await listProjects(harness.db, tenant, { filter: "archived" });
    expect(archivedList.map((p) => p.id)).toContain(created.data.projectId);

    // Archived projects are read-only.
    const renameArchived = await renameProject(deps(), tenant, {
      idempotencyKey: key("rename-archived"),
      projectId: created.data.projectId,
      title: "اسم جديد",
    });
    expect(renameArchived).toMatchObject({ code: "PROJECT_ARCHIVED", ok: false });
    const appendArchived = await appendRequirement(deps(), tenant, {
      content: "متطلب إضافي",
      idempotencyKey: key("append-archived"),
      projectId: created.data.projectId,
    });
    expect(appendArchived).toMatchObject({ code: "PROJECT_ARCHIVED", ok: false });
  });

  it("appends user requirements to the conversation", async () => {
    const created = await createProject(deps(), tenant, {
      idempotencyKey: key("create-3"),
      request: "ملف PDF لقائمة الأسعار",
      title: "قائمة الأسعار",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const appended = await appendRequirement(deps(), tenant, {
      content: "أضف شعار المتجر في أعلى الملف",
      idempotencyKey: key("append-1"),
      projectId: created.data.projectId,
    });
    expect(appended.ok).toBe(true);

    const conversation = await getProjectConversation(harness.db, tenant, created.data.projectId);
    expect(conversation?.messages).toHaveLength(2);
    expect(conversation?.messages[1]?.content).toContain("شعار المتجر");
  });

  it("rejects invalid input with Arabic field errors before touching the database", async () => {
    const result = await createProject(deps(), tenant, {
      idempotencyKey: key("create-invalid"),
      request: "",
      title: "  ",
    });
    expect(result).toMatchObject({ code: "VALIDATION_FAILED", ok: false });
    if (result.ok) return;
    expect(result.fieldErrors?.["title"]).toBe("أدخل اسمًا للمشروع.");
    expect(result.fieldErrors?.["request"]).toBe("اكتب طلبك أولًا.");
  });
});

describe("idempotency", () => {
  it("replays the original result for the same key and payload", async () => {
    const input = {
      idempotencyKey: key("idem-replay"),
      request: "موقع لمحل الورد",
      title: "محل الورد",
    };
    const first = await createProject(deps(), tenant, input);
    const second = await createProject(deps(), tenant, input);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.projectId).toBe(first.data.projectId);

    const rows = await harness.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.workspaceId, tenant.workspaceId), eq(projects.title, "محل الورد")));
    expect(rows).toHaveLength(1);
  });

  it("returns a conflict for the same key with a different payload", async () => {
    const idempotencyKey = key("idem-conflict");
    const first = await createProject(deps(), tenant, {
      idempotencyKey,
      request: "الطلب الأصلي",
      title: "مشروع أ",
    });
    expect(first.ok).toBe(true);
    const conflict = await createProject(deps(), tenant, {
      idempotencyKey,
      request: "طلب مختلف تمامًا",
      title: "مشروع ب",
    });
    expect(conflict).toMatchObject({ code: "IDEMPOTENCY_CONFLICT", ok: false, retryable: false });
  });

  it("does not create duplicates under concurrent identical requests", async () => {
    const input = {
      idempotencyKey: key("idem-concurrent"),
      request: "جدول متابعة المخزون",
      title: "جدول المخزون",
    };
    const results = await Promise.all([
      createProject(deps(), tenant, input),
      createProject(deps(), tenant, input),
      createProject(deps(), tenant, input),
    ]);
    const ids = results.map((r) => (r.ok ? r.data.projectId : null));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(1);

    const rows = await harness.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.workspaceId, tenant.workspaceId), eq(projects.title, "جدول المخزون")));
    expect(rows).toHaveLength(1);
  });

  it("rolls back the idempotency claim with the failed transaction", async () => {
    const idempotencyKey = key("idem-rollback");
    const missingProject = "3f0d9a6a-64ab-4f3e-9d59-6a2f9f6f2b1c";
    const failed = await renameProject(deps(), tenant, {
      idempotencyKey,
      projectId: missingProject,
      title: "لن يحفظ",
    });
    expect(failed).toMatchObject({ code: "NOT_FOUND", ok: false });

    // The claim rolled back with the transaction, so the key is unused.
    const claims = await harness.db
      .select({ id: idempotencyKeys.id })
      .from(idempotencyKeys)
      .where(
        and(
          eq(idempotencyKeys.workspaceId, tenant.workspaceId),
          eq(idempotencyKeys.key, idempotencyKey),
        ),
      );
    expect(claims).toHaveLength(0);
  });
});

describe("rate limiting", () => {
  it("limits repeated mutations per user and fails closed without Redis", async () => {
    const user = await harness.createTenant("limited@wakil.test");
    const results = [];
    for (let index = 0; index < 11; index += 1) {
      results.push(
        await createProject(deps(), user, {
          idempotencyKey: key(`burst-${index}`),
          request: `طلب رقم ${index}`,
          title: `مشروع ${index}`,
        }),
      );
    }
    const last = results.at(-1);
    expect(last).toMatchObject({ code: "RATE_LIMITED", ok: false, retryable: true });

    const { Redis } = await import("ioredis");
    const deadRedis = new Redis("127.0.0.1", {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      port: 1,
      retryStrategy: () => null,
    });
    const failClosed = await createProject({ db: harness.db, redis: deadRedis }, tenant, {
      idempotencyKey: key("fail-closed"),
      request: "طلب أثناء تعطل الحد",
      title: "بدون Redis",
    });
    expect(failClosed).toMatchObject({ code: "RATE_LIMITED", ok: false, retryable: true });
    deadRedis.disconnect();
  });
});
