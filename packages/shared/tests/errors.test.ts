import { describe, expect, it } from "vitest";

import { APP_ERROR_CODES, APP_ERROR_MESSAGES, failure, success } from "../src/index.js";

describe("error mapping", () => {
  it("maps every code to a non-empty Arabic message", () => {
    for (const code of APP_ERROR_CODES) {
      const message = APP_ERROR_MESSAGES[code];
      expect(message.length).toBeGreaterThan(0);
      // Arabic-dominant text: contains at least one Arabic-block character.
      expect(/[؀-ۿ]/.test(message)).toBe(true);
    }
  });

  it("never leaks technical detail in messages", () => {
    for (const message of Object.values(APP_ERROR_MESSAGES)) {
      expect(message).not.toMatch(/sql|postgres|redis|stack|error:|exception/i);
    }
  });

  it("marks only transient failures as retryable", () => {
    expect(failure("RATE_LIMITED").retryable).toBe(true);
    expect(failure("INTERNAL_ERROR").retryable).toBe(true);
    expect(failure("NOT_FOUND").retryable).toBe(false);
    expect(failure("IDEMPOTENCY_CONFLICT").retryable).toBe(false);
    expect(failure("VALIDATION_FAILED").retryable).toBe(false);
  });

  it("carries field errors for validation failures", () => {
    const result = failure("VALIDATION_FAILED", { title: "أدخل اسمًا للمشروع." });
    expect(result.fieldErrors?.title).toBe("أدخل اسمًا للمشروع.");
  });

  it("wraps success data unchanged", () => {
    expect(success({ id: "x" })).toEqual({ ok: true, data: { id: "x" } });
  });
});
