import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
let tenantA: ServiceContext;
let tenantB: ServiceContext;
let projectA1: string;
let projectA2: string;

beforeAll(async () => {
  harness = await startHarness();
  tenantA = await harness.createTenant("tenant-a@wakil.test");
  tenantB = await harness.createTenant("tenant-b@wakil.test");

  const first = await createProject({ db: harness.db, redis: harness.redis }, tenantA, {
    idempotencyKey: key("a-create-1"),
    request: "موقع لمقهى الديوانية مع قائمة المشروبات",
    title: "مقهى الديوانية",
  });
  const second = await createProject({ db: harness.db, redis: harness.redis }, tenantA, {
    idempotencyKey: key("a-create-2"),
    request: "ملف PDF لعرض الأسعار الشهري",
    title: "عرض الأسعار",
  });
  if (!first.ok || !second.ok) throw new Error("failed to seed tenant A projects");
  projectA1 = first.data.projectId;
  projectA2 = second.data.projectId;

  const other = await createProject({ db: harness.db, redis: harness.redis }, tenantB, {
    idempotencyKey: key("b-create-1"),
    request: "لعبة ويب بسيطة للأطفال",
    title: "لعبة الأطفال",
  });
  if (!other.ok) throw new Error("failed to seed tenant B project");
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

function deps() {
  return { db: harness.db, redis: harness.redis };
}

describe("cross-tenant isolation (two users, two workspaces)", () => {
  it("cannot list another workspace's projects", async () => {
    const listB = await listProjects(harness.db, tenantB, { filter: "active" });
    expect(listB.map((p) => p.id)).not.toContain(projectA1);
    expect(listB.map((p) => p.id)).not.toContain(projectA2);
    expect(listB).toHaveLength(1);
  });

  it("cannot open or preview another workspace's project by guessed UUID", async () => {
    expect(await getProjectById(harness.db, tenantB, projectA1)).toBeNull();
    expect(await getProjectConversation(harness.db, tenantB, projectA1)).toBeNull();
  });

  it("parameterizes ids so a malformed value cannot inject SQL", async () => {
    // A malformed id is rejected by PostgreSQL's uuid cast (parameterized,
    // so no injection); the page layer surfaces it as the generic error
    // boundary. The projects table is untouched.
    await expect(
      getProjectById(harness.db, tenantB, "'; drop table projects;--"),
    ).rejects.toThrow();
    const stillThere = await listProjects(harness.db, tenantB, { filter: "active" });
    expect(stillThere.length).toBeGreaterThanOrEqual(1);
  });

  it("cannot find another workspace's content through search", async () => {
    const byTitle = await listProjects(harness.db, tenantB, {
      filter: "active",
      query: "الديوانية",
    });
    expect(byTitle).toHaveLength(0);
    const byContent = await listProjects(harness.db, tenantB, {
      filter: "active",
      query: "قائمة المشروبات",
    });
    expect(byContent).toHaveLength(0);
  });

  it("cannot rename, archive, or append to another workspace's project", async () => {
    const rename = await renameProject(deps(), tenantB, {
      idempotencyKey: key("b-rename"),
      projectId: projectA1,
      title: "اختراق",
    });
    expect(rename).toMatchObject({ code: "NOT_FOUND", ok: false });

    const archive = await archiveProject(deps(), tenantB, {
      idempotencyKey: key("b-archive"),
      projectId: projectA1,
    });
    expect(archive).toMatchObject({ code: "NOT_FOUND", ok: false });

    const append = await appendRequirement(deps(), tenantB, {
      content: "محتوى دخيل",
      idempotencyKey: key("b-append"),
      projectId: projectA1,
    });
    expect(append).toMatchObject({ code: "NOT_FOUND", ok: false });

    // Tenant A's data is untouched and unrevealed.
    const project = await getProjectById(harness.db, tenantA, projectA1);
    expect(project?.title).toBe("مقهى الديوانية");
    expect(project?.status).toBe("active");
  });

  it("returns the same NOT_FOUND shape for missing and cross-tenant rows", async () => {
    const missing = await renameProject(deps(), tenantB, {
      idempotencyKey: key("b-missing"),
      projectId: "3f0d9a6a-64ab-4f3e-9d59-6a2f9f6f2b1c",
      title: "غير موجود",
    });
    const crossTenant = await renameProject(deps(), tenantB, {
      idempotencyKey: key("b-cross"),
      projectId: projectA1,
      title: "غير مسموح",
    });
    expect(missing).toEqual(crossTenant);
  });

  it("resolves the workspace from session membership, never from client input", async () => {
    // The only way services receive a workspace id is through
    // ensurePersonalWorkspace(sessionUserId): it must always resolve the
    // user's own membership and can never yield another tenant's workspace.
    const { ensurePersonalWorkspace } = await import("../../src/server/auth/workspace");
    const resolvedB = await ensurePersonalWorkspace(harness.db, tenantB.userId);
    expect(resolvedB).toBe(tenantB.workspaceId);
    expect(resolvedB).not.toBe(tenantA.workspaceId);
  });
});
