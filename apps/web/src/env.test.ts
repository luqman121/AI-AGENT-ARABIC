import { describe, expect, it } from "vitest";

import { readWebEnv } from "./env";

const validEnv = {
  DATABASE_URL: "postgres://wakil:local@127.0.0.1:5432/wakil",
  NODE_ENV: "test",
  REDIS_URL: "redis://127.0.0.1:6379",
} satisfies NodeJS.ProcessEnv;

describe("readWebEnv", () => {
  it("accepts the required server environment", () => {
    expect(readWebEnv(validEnv)).toEqual(validEnv);
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
});
