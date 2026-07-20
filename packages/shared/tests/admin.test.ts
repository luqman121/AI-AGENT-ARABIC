import { describe, expect, it } from "vitest";

import {
  ADMIN_PERMISSIONS,
  adminRunActionInputSchema,
  can,
  canAccessAdmin,
  changeUsageLimitInputSchema,
  changeUserPlanInputSchema,
  changeUserRoleInputSchema,
  changeUserStatusInputSchema,
  clampPage,
  clampPageSize,
  formatBytes,
  formatTokens,
  formatUsdFromMicros,
  hasAtLeastRole,
  isKnownRole,
  microsToUsd,
  redactAuditData,
  successRate,
  type AdminPermission,
} from "../src/index.js";

const validUuid = "3f0d9a6a-64ab-4f3e-9d59-6a2f9f6f2b1c";

/* ------------------------------------------------------------------ *
 * Role hierarchy
 * ------------------------------------------------------------------ */

describe("hasAtLeastRole", () => {
  it("ranks admin above support above user", () => {
    expect(hasAtLeastRole("admin", "support")).toBe(true);
    expect(hasAtLeastRole("admin", "admin")).toBe(true);
    expect(hasAtLeastRole("support", "support")).toBe(true);
    expect(hasAtLeastRole("support", "admin")).toBe(false);
    expect(hasAtLeastRole("user", "support")).toBe(false);
  });
});

describe("isKnownRole", () => {
  it("accepts only the three platform roles", () => {
    expect(isKnownRole("user")).toBe(true);
    expect(isKnownRole("support")).toBe(true);
    expect(isKnownRole("admin")).toBe(true);
    expect(isKnownRole("owner")).toBe(false);
    expect(isKnownRole("")).toBe(false);
    expect(isKnownRole(null)).toBe(false);
    expect(isKnownRole(2)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Permission matrix — the security core
 * ------------------------------------------------------------------ */

describe("permission matrix", () => {
  it("gives a plain user no admin access at all", () => {
    expect(canAccessAdmin("user")).toBe(false);
    for (const permission of ADMIN_PERMISSIONS) {
      expect(can("user", permission)).toBe(false);
    }
  });

  it("makes support strictly read-only", () => {
    expect(canAccessAdmin("support")).toBe(true);
    expect(can("support", "dashboard.read")).toBe(true);
    const mutations: AdminPermission[] = [
      "user.suspend",
      "user.plan",
      "user.limit",
      "user.role",
      "run.cancel",
      "run.retry",
      "project.archive",
    ];
    for (const permission of mutations) {
      expect(can("support", permission)).toBe(false);
    }
  });

  it("grants admin every permission", () => {
    expect(canAccessAdmin("admin")).toBe(true);
    for (const permission of ADMIN_PERMISSIONS) {
      expect(can("admin", permission)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Cost + number formatting
 * ------------------------------------------------------------------ */

describe("microsToUsd", () => {
  it("divides integer micros into dollars without float storage", () => {
    expect(microsToUsd(1_000_000)).toBe(1);
    expect(microsToUsd(2_500_000)).toBe(2.5);
    expect(microsToUsd(0)).toBe(0);
  });
});

describe("formatUsdFromMicros", () => {
  it("uses two decimals for amounts of a dollar or more", () => {
    expect(formatUsdFromMicros(1_000_000)).toBe("$1.00");
    expect(formatUsdFromMicros(12_340_000)).toBe("$12.34");
  });

  it("uses four decimals for sub-cent amounts so tiny costs stay visible", () => {
    expect(formatUsdFromMicros(500)).toBe("$0.0005");
    expect(formatUsdFromMicros(1_234)).toBe("$0.0012");
  });

  it("renders exactly zero as $0.00", () => {
    expect(formatUsdFromMicros(0)).toBe("$0.00");
  });
});

describe("formatTokens", () => {
  it("groups thousands and never goes negative", () => {
    expect(formatTokens(1234567)).toBe("1,234,567");
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(-50)).toBe("0");
    expect(formatTokens(12.9)).toBe("12");
  });
});

describe("formatBytes", () => {
  it("scales through the byte units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });

  it("drops the decimal once the value reaches ten of a unit", () => {
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
  });
});

describe("successRate", () => {
  it("returns a 0–100 integer and treats an empty window as zero", () => {
    expect(successRate(0, 0)).toBe(0);
    expect(successRate(9, 1)).toBe(90);
    expect(successRate(1, 2)).toBe(33);
    expect(successRate(5, 0)).toBe(100);
  });
});

/* ------------------------------------------------------------------ *
 * Pagination clamps
 * ------------------------------------------------------------------ */

describe("clampPage", () => {
  it("floors to a minimum of page 1 and rejects junk", () => {
    expect(clampPage("3")).toBe(3);
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage("0")).toBe(1);
    expect(clampPage("-4")).toBe(1);
    expect(clampPage("abc")).toBe(1);
    expect(clampPage("2.9")).toBe(2);
  });
});

describe("clampPageSize", () => {
  it("bounds within 1..100 and falls back on junk", () => {
    expect(clampPageSize("10")).toBe(10);
    expect(clampPageSize("0")).toBe(1);
    expect(clampPageSize("9999")).toBe(100);
    expect(clampPageSize("nope")).toBe(25);
    expect(clampPageSize("nope", 40)).toBe(40);
  });
});

/* ------------------------------------------------------------------ *
 * Audit redaction — must never leak a secret
 * ------------------------------------------------------------------ */

describe("redactAuditData", () => {
  it("drops any key that looks like a credential regardless of case", () => {
    const redacted = redactAuditData({
      email: "user@example.com",
      passwordHash: "$2b$10$abcdef",
      password: "hunter2",
      apiKey: "sk-123",
      api_key: "sk-456",
      Authorization: "Bearer xyz",
      sessionToken: "abc",
      refreshToken: "def",
      credentialId: "cred-1",
      cookie: "sid=1",
    });
    expect(redacted).toEqual({ email: "user@example.com" });
    expect(Object.keys(redacted)).not.toContain("passwordHash");
    expect(Object.keys(redacted)).not.toContain("password");
  });

  it("keeps primitives, preserves null, and stringifies complex values", () => {
    const redacted = redactAuditData({
      status: "active",
      plan: "pro",
      limit: 25,
      flagged: false,
      previous: null,
      when: new Date("2026-01-02T03:04:05.000Z"),
      meta: { nested: true },
      tags: ["a", "b"],
    });
    expect(redacted.status).toBe("active");
    expect(redacted.limit).toBe(25);
    expect(redacted.flagged).toBe(false);
    expect(redacted.previous).toBeNull();
    expect(redacted.when).toBe("2026-01-02T03:04:05.000Z");
    expect(redacted.meta).toBe('{"nested":true}');
    expect(redacted.tags).toBe('["a","b"]');
  });
});

/* ------------------------------------------------------------------ *
 * Admin action input validation
 * ------------------------------------------------------------------ */

describe("changeUserRoleInputSchema", () => {
  it("accepts a known role with a UUID target", () => {
    const parsed = changeUserRoleInputSchema.parse({ userId: validUuid, role: "admin" });
    expect(parsed.role).toBe("admin");
    expect(parsed.reason).toBeUndefined();
  });

  it("rejects an unknown role and a non-UUID id", () => {
    expect(changeUserRoleInputSchema.safeParse({ userId: validUuid, role: "root" }).success).toBe(
      false,
    );
    expect(changeUserRoleInputSchema.safeParse({ userId: "nope", role: "admin" }).success).toBe(
      false,
    );
  });

  it("trims the reason and rejects one over 500 characters", () => {
    const parsed = changeUserRoleInputSchema.parse({
      userId: validUuid,
      role: "support",
      reason: "  ترقية مؤقتة  ",
    });
    expect(parsed.reason).toBe("ترقية مؤقتة");
    expect(
      changeUserRoleInputSchema.safeParse({
        userId: validUuid,
        role: "support",
        reason: "x".repeat(501),
      }).success,
    ).toBe(false);
  });
});

describe("changeUserStatusInputSchema and changeUserPlanInputSchema", () => {
  it("accepts only known statuses and plans", () => {
    expect(
      changeUserStatusInputSchema.safeParse({ userId: validUuid, status: "suspended" }).success,
    ).toBe(true);
    expect(
      changeUserStatusInputSchema.safeParse({ userId: validUuid, status: "deleted" }).success,
    ).toBe(false);
    expect(
      changeUserPlanInputSchema.safeParse({ userId: validUuid, plan: "business" }).success,
    ).toBe(true);
    expect(
      changeUserPlanInputSchema.safeParse({ userId: validUuid, plan: "enterprise" }).success,
    ).toBe(false);
  });
});

describe("changeUsageLimitInputSchema", () => {
  it("accepts a non-negative integer of micros or a null clear", () => {
    expect(
      changeUsageLimitInputSchema.parse({ userId: validUuid, monthlyCostLimitMicros: 25_000_000 })
        .monthlyCostLimitMicros,
    ).toBe(25_000_000);
    expect(
      changeUsageLimitInputSchema.parse({ userId: validUuid, monthlyCostLimitMicros: null })
        .monthlyCostLimitMicros,
    ).toBeNull();
  });

  it("rejects negative, fractional, and oversized limits", () => {
    expect(
      changeUsageLimitInputSchema.safeParse({ userId: validUuid, monthlyCostLimitMicros: -1 })
        .success,
    ).toBe(false);
    expect(
      changeUsageLimitInputSchema.safeParse({ userId: validUuid, monthlyCostLimitMicros: 1.5 })
        .success,
    ).toBe(false);
    expect(
      changeUsageLimitInputSchema.safeParse({
        userId: validUuid,
        monthlyCostLimitMicros: 2_000_000_000_000,
      }).success,
    ).toBe(false);
  });
});

describe("adminRunActionInputSchema", () => {
  it("requires a UUID run id", () => {
    expect(adminRunActionInputSchema.safeParse({ runId: validUuid }).success).toBe(true);
    expect(adminRunActionInputSchema.safeParse({ runId: "nope" }).success).toBe(false);
  });
});
