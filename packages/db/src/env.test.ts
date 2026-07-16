import { describe, expect, it } from "vitest";

import { readDatabaseEnv } from "./env.js";

describe("readDatabaseEnv", () => {
  it("accepts a PostgreSQL URL", () => {
    expect(
      readDatabaseEnv({ DATABASE_URL: "postgres://wakil:local@127.0.0.1:5432/wakil" }),
    ).toEqual({ DATABASE_URL: "postgres://wakil:local@127.0.0.1:5432/wakil" });
  });

  it("does not echo an invalid value", () => {
    const invalidValue = "database-secret";

    expect(() => readDatabaseEnv({ DATABASE_URL: invalidValue })).toThrowError(
      "Invalid environment variables: DATABASE_URL",
    );

    try {
      readDatabaseEnv({ DATABASE_URL: invalidValue });
    } catch (error) {
      expect(String(error)).not.toContain(invalidValue);
    }
  });
});
