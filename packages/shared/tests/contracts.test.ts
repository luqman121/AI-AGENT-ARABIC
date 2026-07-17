import { describe, expect, it } from "vitest";

import {
  appendRequirementInputSchema,
  archiveProjectInputSchema,
  createProjectInputSchema,
  idempotencyKeySchema,
  renameProjectInputSchema,
  searchProjectsInputSchema,
} from "../src/index.js";

const validKey = "k".repeat(24);
const validUuid = "3f0d9a6a-64ab-4f3e-9d59-6a2f9f6f2b1c";

describe("createProjectInputSchema", () => {
  it("accepts an Arabic title and request and trims whitespace", () => {
    const result = createProjectInputSchema.parse({
      title: "  موقع مطعم البيت  ",
      request: " أريد موقعًا بسيطًا لمطعمي مع قائمة الطعام ",
      idempotencyKey: validKey,
    });
    expect(result.title).toBe("موقع مطعم البيت");
    expect(result.request).toBe("أريد موقعًا بسيطًا لمطعمي مع قائمة الطعام");
  });

  it("rejects an empty title with an Arabic message", () => {
    const result = createProjectInputSchema.safeParse({
      title: "   ",
      request: "طلب",
      idempotencyKey: validKey,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("أدخل اسمًا للمشروع.");
    }
  });

  it("rejects titles above 120 characters and requests above 20000", () => {
    expect(
      createProjectInputSchema.safeParse({
        title: "م".repeat(121),
        request: "طلب",
        idempotencyKey: validKey,
      }).success,
    ).toBe(false);
    expect(
      createProjectInputSchema.safeParse({
        title: "مشروع",
        request: "م".repeat(20001),
        idempotencyKey: validKey,
      }).success,
    ).toBe(false);
  });
});

describe("idempotencyKeySchema", () => {
  it("accepts url-safe keys of 16 to 128 characters", () => {
    expect(idempotencyKeySchema.safeParse("Ab-19_".padEnd(16, "x")).success).toBe(true);
    expect(idempotencyKeySchema.safeParse("x".repeat(128)).success).toBe(true);
  });

  it("rejects short keys and unsafe characters", () => {
    expect(idempotencyKeySchema.safeParse("short").success).toBe(false);
    expect(idempotencyKeySchema.safeParse("x".repeat(129)).success).toBe(false);
    expect(idempotencyKeySchema.safeParse(`bad key${"x".repeat(16)}`).success).toBe(false);
  });
});

describe("renameProjectInputSchema and archiveProjectInputSchema", () => {
  it("requires a UUID project id", () => {
    expect(
      renameProjectInputSchema.safeParse({
        projectId: "not-a-uuid",
        title: "اسم جديد",
        idempotencyKey: validKey,
      }).success,
    ).toBe(false);
    expect(
      archiveProjectInputSchema.safeParse({ projectId: validUuid, idempotencyKey: validKey })
        .success,
    ).toBe(true);
  });
});

describe("appendRequirementInputSchema", () => {
  it("accepts Arabic requirement content", () => {
    const parsed = appendRequirementInputSchema.parse({
      projectId: validUuid,
      content: "أضف صفحة تواصل مع خريطة",
      idempotencyKey: validKey,
    });
    expect(parsed.content).toContain("خريطة");
  });
});

describe("searchProjectsInputSchema", () => {
  it("defaults to the active filter and drops empty queries", () => {
    const parsed = searchProjectsInputSchema.parse({});
    expect(parsed.filter).toBe("active");
    expect(parsed.query).toBeUndefined();

    const emptyQuery = searchProjectsInputSchema.parse({ query: "   " });
    expect(emptyQuery.query).toBeUndefined();
  });

  it("accepts the archived filter and keeps Arabic query text", () => {
    const parsed = searchProjectsInputSchema.parse({ query: "مطعم", filter: "archived" });
    expect(parsed.query).toBe("مطعم");
    expect(parsed.filter).toBe("archived");
  });
});
