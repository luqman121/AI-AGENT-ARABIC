import { RUN_STEP_KEYS } from "@wakil/shared";
import { describe, expect, it } from "vitest";

import { RUN_STEPS, STEP_LIMIT, TIME_LIMIT_MS } from "./steps.js";

describe("run steps", () => {
  it("runs the fixed deterministic step list in order", () => {
    expect(RUN_STEPS).toEqual(RUN_STEP_KEYS);
  });

  it("keeps the step count within the guard limit", () => {
    expect(RUN_STEPS.length).toBeLessThanOrEqual(STEP_LIMIT);
    expect(TIME_LIMIT_MS).toBe(60_000);
  });
});
