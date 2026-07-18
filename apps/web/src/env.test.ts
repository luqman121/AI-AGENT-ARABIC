import { describe, expect, it } from "vitest";

import { isGoogleAuthEnabled, readWebEnv } from "./env";

const validEnv = {
  AUTH_SECRET: "x".repeat(43),
  AUTH_URL: "http://127.0.0.1:3000",
  DATABASE_URL: "postgres://wakil:local@127.0.0.1:5432/wakil",
  EMAIL_FROM: "Wakil <no-reply@wakil.local>",
  NODE_ENV: "test",
  REDIS_URL: "redis://127.0.0.1:6379",
  S3_ACCESS_KEY_ID: "test-access",
  S3_BUCKET: "test-bucket",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_FORCE_PATH_STYLE: "true",
  S3_REGION: "auto",
  S3_SECRET_ACCESS_KEY: "test-secret",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
} satisfies NodeJS.ProcessEnv;

describe("readWebEnv", () => {
  it("accepts the required server environment", () => {
    const parsed = readWebEnv(validEnv);
    expect(parsed.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(parsed.LOG_LEVEL).toBe("info");
    expect(parsed.SMTP_PORT).toBe(1025);
    expect(parsed.SMTP_SECURE).toBe(false);
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

  it("requires HTTPS for non-loopback production auth callbacks", () => {
    expect(() =>
      readWebEnv({ ...validEnv, AUTH_URL: "http://wakil.example", NODE_ENV: "production" }),
    ).toThrowError(/AUTH_URL/);
    expect(
      readWebEnv({ ...validEnv, AUTH_URL: "https://wakil.example", NODE_ENV: "production" })
        .AUTH_URL,
    ).toBe("https://wakil.example");
  });

  it("validates database, Redis, and SMTP credential protocols and pairs", () => {
    expect(() => readWebEnv({ ...validEnv, DATABASE_URL: "https://db.example" })).toThrowError(
      /DATABASE_URL/,
    );
    expect(() => readWebEnv({ ...validEnv, REDIS_URL: "https://redis.example" })).toThrowError(
      /REDIS_URL/,
    );
    expect(() => readWebEnv({ ...validEnv, SMTP_USER: "mailer" })).toThrowError(/SMTP_PASSWORD/);
    expect(
      readWebEnv({ ...validEnv, SMTP_PASSWORD: "password", SMTP_USER: "mailer" }).SMTP_USER,
    ).toBe("mailer");
  });

  it.each([
    "S3_ACCESS_KEY_ID",
    "S3_BUCKET",
    "S3_ENDPOINT",
    "S3_FORCE_PATH_STYLE",
    "S3_REGION",
    "S3_SECRET_ACCESS_KEY",
  ] as const)("requires %s", (name) => {
    expect(() => readWebEnv({ ...validEnv, [name]: undefined })).toThrowError(name);
  });

  it("accepts Cloudflare R2 configuration", () => {
    const result = readWebEnv({
      ...validEnv,
      S3_ENDPOINT: "https://0123456789abcdef.r2.cloudflarestorage.com",
      S3_FORCE_PATH_STYLE: "true",
      S3_REGION: "auto",
    });
    expect(result.S3_REGION).toBe("auto");
  });

  it("rejects non-R2 endpoints and invalid signing settings", () => {
    expect(() =>
      readWebEnv({ ...validEnv, S3_ENDPOINT: "https://storage.example.com" }),
    ).toThrowError(/S3_ENDPOINT/);
    expect(() =>
      readWebEnv({
        ...validEnv,
        S3_ENDPOINT: "https://0123456789abcdef.r2.cloudflarestorage.com",
        S3_REGION: "us-east-1",
      }),
    ).toThrowError(/S3_REGION/);
    expect(() =>
      readWebEnv({
        ...validEnv,
        S3_ENDPOINT: "https://0123456789abcdef.r2.cloudflarestorage.com",
        S3_FORCE_PATH_STYLE: "false",
        S3_REGION: "auto",
      }),
    ).toThrowError(/S3_FORCE_PATH_STYLE/);
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
