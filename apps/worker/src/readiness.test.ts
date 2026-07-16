import { describe, expect, it, vi } from "vitest";

import { checkReadiness } from "./readiness.js";

describe("checkReadiness", () => {
  it("reports ready only when both durable and transport dependencies respond", async () => {
    await expect(
      checkReadiness({
        database: vi.fn().mockResolvedValue(undefined),
        redis: vi.fn().mockResolvedValue(undefined),
      }),
    ).resolves.toEqual({
      checks: { database: "ready", redis: "ready" },
      ready: true,
    });
  });

  it("does not expose a dependency error", async () => {
    const result = await checkReadiness({
      database: vi.fn().mockRejectedValue(new Error("postgres://secret")),
      redis: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual({
      checks: { database: "unavailable", redis: "ready" },
      ready: false,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
