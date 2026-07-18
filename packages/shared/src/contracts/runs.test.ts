import { describe, expect, it } from "vitest";

import {
  cancelRunInputSchema,
  runEventChannel,
  runEventLabel,
  RUN_EVENT_TYPES,
  RUN_STEP_KEYS,
  RUNS_QUEUE_NAME,
  startRunInputSchema,
} from "./runs.js";

describe("run contracts", () => {
  it("accepts a valid startRun input", () => {
    const parsed = startRunInputSchema.safeParse({
      projectId: "30000000-0000-4000-8000-000000000001",
      idempotencyKey: "abcdef0123456789abcd",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a startRun input with a bad idempotency key", () => {
    const parsed = startRunInputSchema.safeParse({
      projectId: "30000000-0000-4000-8000-000000000001",
      idempotencyKey: "short",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires runId for cancelRun", () => {
    const parsed = cancelRunInputSchema.safeParse({
      projectId: "30000000-0000-4000-8000-000000000001",
      idempotencyKey: "abcdef0123456789abcd",
    });
    expect(parsed.success).toBe(false);
  });

  it("maps every event type and step key to a non-empty Arabic label", () => {
    for (const type of RUN_EVENT_TYPES) {
      expect(runEventLabel({ type }).length).toBeGreaterThan(0);
    }
    for (const stepKey of RUN_STEP_KEYS) {
      expect(runEventLabel({ type: "run.step", stepKey }).length).toBeGreaterThan(0);
    }
  });

  it("namespaces the redis channel and queue", () => {
    expect(runEventChannel("abc")).toBe("wakil:run:abc");
    expect(RUNS_QUEUE_NAME).toBe("wakil-runs");
  });
});
