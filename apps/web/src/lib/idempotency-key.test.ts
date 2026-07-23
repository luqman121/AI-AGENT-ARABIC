import { afterEach, describe, expect, it, vi } from "vitest";

import { newIdempotencyKey } from "./idempotency-key";

describe("newIdempotencyKey", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("generates a UUID when randomUUID is unavailable in an HTTP browser context", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.set(Array.from({ length: bytes.length }, (_, index) => index + 1));
        return bytes;
      },
    });

    expect(newIdempotencyKey()).toBe("01020304-0506-4708-890a-0b0c0d0e0f10");
  });
});
