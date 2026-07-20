import { adminAuditLogs, users } from "@wakil/db/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { writeAdminAudit } from "../../src/server/admin/audit";
import { getUserDetail, listUsers } from "../../src/server/admin/queries";
import { startHarness, type IntegrationHarness } from "./harness";

let harness: IntegrationHarness;

// A realistic-looking bcrypt hash. The whole point of these tests is to prove
// this value can never travel out of the admin read layer.
const PASSWORD_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEeO0000000000000000000000000000000";

let adminId: string;
let customerId: string;

beforeAll(async () => {
  harness = await startHarness();

  const [admin] = await harness.db
    .insert(users)
    .values({ email: "admin@wakil.test", role: "admin", status: "active" })
    .returning({ id: users.id });
  const [customer] = await harness.db
    .insert(users)
    .values({
      email: "customer@wakil.test",
      passwordHash: PASSWORD_HASH,
      role: "user",
      status: "active",
    })
    .returning({ id: users.id });
  if (!admin || !customer) throw new Error("failed to seed users");
  adminId = admin.id;
  customerId = customer.id;
}, 180_000);

afterAll(async () => {
  await harness?.stop();
});

/** Deep scan for any string that equals or contains the seeded hash. */
function containsHash(value: unknown): boolean {
  if (typeof value === "string") return value.includes(PASSWORD_HASH) || value.includes("$2b$");
  if (Array.isArray(value)) return value.some(containsHash);
  if (value && typeof value === "object") return Object.values(value).some(containsHash);
  return false;
}

describe("password hash is never exposed through the admin read layer", () => {
  it("getUserDetail returns only a boolean presence flag, never the hash", async () => {
    const detail = await getUserDetail(harness.db, customerId);
    expect(detail).not.toBeNull();
    expect(detail?.hasPassword).toBe(true);
    // No key named like a hash, and the hash value appears nowhere.
    expect(Object.keys(detail ?? {})).not.toContain("passwordHash");
    expect(Object.keys(detail ?? {})).not.toContain("password_hash");
    expect(containsHash(detail)).toBe(false);
  });

  it("listUsers rows carry no password material", async () => {
    const { rows } = await listUsers(harness.db, {
      page: 1,
      pageSize: 25,
      search: undefined,
      role: undefined,
      status: undefined,
      plan: undefined,
      sort: undefined,
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("passwordHash");
      expect(containsHash(row)).toBe(false);
    }
  });
});

describe("admin audit ledger", () => {
  it("redacts sensitive keys before persisting the before/after snapshots", async () => {
    await writeAdminAudit(harness.db, {
      action: "user.plan_changed",
      actorRole: "admin",
      actorUserId: adminId,
      after: { plan: "pro" },
      before: {
        plan: "free",
        // Every one of these must be dropped by redaction before insert.
        passwordHash: PASSWORD_HASH,
        sessionToken: "sess-123",
        apiKey: "sk-live-abc",
      },
      reason: "upgrade for pilot",
      targetId: customerId,
      targetType: "user",
    });

    const [row] = await harness.db
      .select({
        action: adminAuditLogs.action,
        actorRole: adminAuditLogs.actorRole,
        afterData: adminAuditLogs.afterData,
        beforeData: adminAuditLogs.beforeData,
        reason: adminAuditLogs.reason,
      })
      .from(adminAuditLogs)
      .where(eq(adminAuditLogs.targetId, customerId))
      .limit(1);

    expect(row).toBeTruthy();
    expect(row?.action).toBe("user.plan_changed");
    expect(row?.beforeData).toEqual({ plan: "free" });
    expect(row?.afterData).toEqual({ plan: "pro" });
    expect(row?.reason).toBe("upgrade for pilot");
    expect(containsHash(row?.beforeData)).toBe(false);
  });

  it("rejects an audit row whose actor is not a privileged role (DB check)", async () => {
    await expect(
      harness.db.insert(adminAuditLogs).values({
        action: "user.plan_changed",
        actorRole: "user",
        actorUserId: customerId,
        targetType: "user",
      }),
    ).rejects.toThrow();
  });

  it("keeps history immutable: an actor with audit rows cannot be hard-deleted", async () => {
    // ON DELETE RESTRICT on the actor FK anchors the ledger — deleting an
    // administrator who has recorded actions is refused by the database.
    await expect(harness.db.delete(users).where(eq(users.id, adminId))).rejects.toThrow();
  });
});
