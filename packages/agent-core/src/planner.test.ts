import type { ModelProviderAdapter, ModelStreamEvent } from "@wakil/model-router";
import { describe, expect, it } from "vitest";

import { generatePlanningTurn, type PlanningLimits } from "./planner.js";

const limits: PlanningLimits = {
  deadlineMs: 1_000,
  inputCostMicrosPerMillionTokens: 1,
  maxAttempts: 2,
  maxCostMicros: 10_000,
  maxDeltaEvents: 10,
  maxOutputChars: 1_000,
  maxOutputTokens: 100,
  outputCostMicrosPerMillionTokens: 1,
};

function adapter(events: readonly ModelStreamEvent[]): ModelProviderAdapter {
  return {
    provider: "openrouter",
    async *stream() {
      yield* events;
    },
  };
}

describe("generatePlanningTurn", () => {
  it("streams and validates a completed Arabic plan", async () => {
    const deltas: string[] = [];
    const result = await generatePlanningTurn({
      adapter: adapter([
        { text: "خطة موجزة\n1. جمع المحتوى\n", type: "text-delta" },
        { text: "2. مراجعة النتيجة", type: "text-delta" },
        { type: "usage", usage: { inputTokens: 20, outputTokens: 12 } },
        { type: "completed" },
      ]),
      isCancelled: async () => false,
      limits,
      model: "configured-model",
      onDelta: async (text) => void deltas.push(text),
      userRequest: "أنشئ خطة لموقع",
    });
    expect(result.ok).toBe(true);
    expect(deltas).toHaveLength(2);
  });

  it("does not call a provider when the maximum possible cost exceeds budget", async () => {
    let called = false;
    const result = await generatePlanningTurn({
      adapter: {
        provider: "openrouter",
        async *stream() {
          called = true;
          yield { type: "completed" } as const;
        },
      },
      isCancelled: async () => false,
      limits: { ...limits, inputCostMicrosPerMillionTokens: 1_000_000, maxCostMicros: 1 },
      model: "configured-model",
      onDelta: async () => undefined,
      userRequest: "طلب",
    });
    expect(result).toMatchObject({ code: "limit_exceeded", ok: false });
    expect(called).toBe(false);
  });
});
