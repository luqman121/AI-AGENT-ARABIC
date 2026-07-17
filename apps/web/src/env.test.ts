import { describe, expect, it } from "vitest";

import { isGoogleAuthEnabled, readWebEnv } from "./env";

const validEnv = {
  AUTH_SECRET: "x".repeat(43),
  AUTH_URL: "http://127.0.0.1:3000",
  DATABASE_URL: "postgres://wakil:local@127.0.0.1:5432/wakil",
  EMAIL_FROM: "Wakil <no-reply@wakil.local>",
  NODE_ENV: "test",
  REDIS_URL: "redis://127.0.0.1:6379",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
} satisfies NodeJS.ProcessEnv;

describe("readWebEnv", () => {
  it("accepts the required server environment", () => {
    const parsed = readWebEnv(validEnv);
    expect(parsed.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(parsed.SMTP_PORT).toBe(1025);
  });

  it("reports invalid names without exposing their values", () => {
    const secretValue = "not-a-database-url";

    expect(() =>
      readWebEnv({
        ...validEnv,
        DATABASE_URL: secretValue,
        REDIS_URL: undefined,
      }),
    ).toThrowError(/DATABASE_URL, REDIS_URL/);

    try {
      readWebEnv({ ...validEnv, DATABASE_URL: secretValue });
    } catch (error) {
      expect(String(error)).not.toContain(secretValue);
    }
  });

  it("rejects a half-configured Google pair by name", () => {
    expect(() => readWebEnv({ ...validEnv, AUTH_GOOGLE_ID: "client-id" })).toThrowError(
      /AUTH_GOOGLE_SECRET/,
    );
    expect(() => readWebEnv({ ...validEnv, AUTH_GOOGLE_SECRET: "client-secret" })).toThrowError(
      /AUTH_GOOGLE_ID/,
    );
  });

  it("requires a strong auth secret", () => {
    expect(() => readWebEnv({ ...validEnv, AUTH_SECRET: "short" })).toThrowError(/AUTH_SECRET/);
  });
});

describe("isGoogleAuthEnabled", () => {
  it("is enabled only when both values are present", () => {
    expect(isGoogleAuthEnabled(readWebEnv(validEnv))).toBe(false);
    expect(
      isGoogleAuthEnabled(
        readWebEnv({
          ...validEnv,
          AUTH_GOOGLE_ID: "client-id",
          AUTH_GOOGLE_SECRET: "client-secret",
        }),
      ),
    ).toBe(true);
  });

  it("treats whitespace-only values as missing", () => {
    expect(() =>
      readWebEnv({ ...validEnv, AUTH_GOOGLE_ID: "  ", AUTH_GOOGLE_SECRET: "secret" }),
    ).toThrowError(/AUTH_GOOGLE_ID/);
  });
});
