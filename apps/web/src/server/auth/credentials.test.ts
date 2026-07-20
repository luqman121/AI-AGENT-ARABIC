import { describe, expect, it } from "vitest";

import { credentialsInputSchema, hashPassword, verifyPassword } from "./credentials";

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a self-describing scrypt string with a unique salt each time", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    expect(first.startsWith("scrypt$")).toBe(true);
    expect(first.split("$")).toHaveLength(6);
    // Random salt means identical passwords never yield identical hashes.
    expect(first).not.toBe(second);
    expect(await verifyPassword("same-password", first)).toBe(true);
    expect(await verifyPassword("same-password", second)).toBe(true);
  });

  it("rejects malformed stored hashes without throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$32768$8$1$$")).toBe(false);
  });
});

describe("credentialsInputSchema", () => {
  it("trims and lowercases the email", () => {
    const parsed = credentialsInputSchema.parse({
      email: "  Person@Example.COM ",
      password: "longenough",
    });
    expect(parsed.email).toBe("person@example.com");
  });

  it("rejects an invalid email and a short password with Arabic messages", () => {
    const badEmail = credentialsInputSchema.safeParse({ email: "nope", password: "longenough" });
    expect(badEmail.success).toBe(false);
    if (!badEmail.success) {
      expect(badEmail.error.issues[0]?.message).toBe("أدخل بريدًا إلكترونيًا صحيحًا.");
    }

    const shortPassword = credentialsInputSchema.safeParse({
      email: "person@example.com",
      password: "short",
    });
    expect(shortPassword.success).toBe(false);
    if (!shortPassword.success) {
      expect(shortPassword.error.issues[0]?.message).toContain("8 أحرف على الأقل");
    }
  });
});
