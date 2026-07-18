import { describe, expect, it, vi } from "vitest";

import { checkWebReadiness } from "./readiness";

describe("checkWebReadiness", () => {
  it("reports ready only when PostgreSQL and Redis respond", async () => {
    await expect(
      checkWebReadiness({ database: vi.fn().mockResolvedValue(undefined), redis: vi.fn() }),
    ).resolves.toEqual({ ready: true });
  });

  it("fails closed without exposing dependency errors", async () => {
    await expect(
      checkWebReadiness({
        database: vi.fn().mockRejectedValue(new Error("private database detail")),
        redis: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toEqual({ ready: false });
  });
});
