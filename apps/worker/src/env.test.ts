import { describe, expect, it } from "vitest";

import { readWorkerEnv } from "./env.js";

const modelEnv = {
  MODEL_INPUT_COST_MICROS_PER_MILLION_TOKENS: "1000",
  MODEL_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: "2000",
  OPENROUTER_API_KEY: "test-key",
  OPENROUTER_MODEL: "configured-model",
};

const storageEnv = {
  S3_ACCESS_KEY_ID: "test-access",
  S3_BUCKET: "test-bucket",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_FORCE_PATH_STYLE: "true",
  S3_REGION: "auto",
  S3_SECRET_ACCESS_KEY: "test-secret",
};

describe("readWorkerEnv", () => {
  it("applies safe local defaults", () => {
    const result = readWorkerEnv({
      DATABASE_URL: "postgres://wakil:local@127.0.0.1:5432/wakil",
      REDIS_URL: "redis://127.0.0.1:6379",
      ...modelEnv,
      ...storageEnv,
    });

    expect(result.LOG_LEVEL).toBe("info");
    expect(result.NODE_ENV).toBe("development");
  });

  it("redacts invalid values from its error", () => {
    const secretValue = "redis-secret-value";

    expect(() =>
      readWorkerEnv({
        DATABASE_URL: "invalid",
        REDIS_URL: secretValue,
        ...modelEnv,
        ...storageEnv,
      }),
    ).toThrowError("Invalid environment variables: DATABASE_URL, REDIS_URL");

    try {
      readWorkerEnv({
        DATABASE_URL: "invalid",
        REDIS_URL: secretValue,
        ...modelEnv,
        ...storageEnv,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secretValue);
    }
  });

  it.each([
    "S3_ACCESS_KEY_ID",
    "S3_BUCKET",
    "S3_ENDPOINT",
    "S3_FORCE_PATH_STYLE",
    "S3_REGION",
    "S3_SECRET_ACCESS_KEY",
  ] as const)("requires %s", (name) => {
    expect(() =>
      readWorkerEnv({
        DATABASE_URL: "postgres://wakil:local@127.0.0.1:5432/wakil",
        REDIS_URL: "redis://127.0.0.1:6379",
        ...modelEnv,
        ...storageEnv,
        [name]: undefined,
      }),
    ).toThrowError(name);
  });

  it("accepts Cloudflare R2 and rejects non-R2 endpoints", () => {
    const result = readWorkerEnv({
      DATABASE_URL: "postgres://wakil:local@127.0.0.1:5432/wakil",
      REDIS_URL: "redis://127.0.0.1:6379",
      ...modelEnv,
      ...storageEnv,
      S3_ENDPOINT: "https://0123456789abcdef.r2.cloudflarestorage.com",
      S3_REGION: "auto",
    });
    expect(result.S3_REGION).toBe("auto");

    expect(() =>
      readWorkerEnv({
        DATABASE_URL: "postgres://wakil:local@127.0.0.1:5432/wakil",
        REDIS_URL: "redis://127.0.0.1:6379",
        ...modelEnv,
        ...storageEnv,
        S3_ENDPOINT: "https://storage.example.com",
      }),
    ).toThrowError(/S3_ENDPOINT/);

    expect(() =>
      readWorkerEnv({
        DATABASE_URL: "postgres://wakil:local@127.0.0.1:5432/wakil",
        REDIS_URL: "redis://127.0.0.1:6379",
        ...modelEnv,
        ...storageEnv,
        S3_FORCE_PATH_STYLE: "false",
      }),
    ).toThrowError(/S3_FORCE_PATH_STYLE/);
  });
});
