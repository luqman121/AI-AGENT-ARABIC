import { describe, expect, it } from "vitest";

import { connectivityReducer } from "./connectivity";

describe("connectivityReducer", () => {
  it("goes offline from any state", () => {
    expect(connectivityReducer("online", "went-offline")).toBe("offline");
    expect(connectivityReducer("reconnecting", "went-offline")).toBe("offline");
  });

  it("shows reconnecting only after a real offline period", () => {
    expect(connectivityReducer("offline", "went-online")).toBe("reconnecting");
    // A spurious online event while already online never shows reconnecting.
    expect(connectivityReducer("online", "went-online")).toBe("online");
  });

  it("returns to online only when the pending refresh completes", () => {
    expect(connectivityReducer("reconnecting", "refresh-complete")).toBe("online");
    expect(connectivityReducer("offline", "refresh-complete")).toBe("offline");
    expect(connectivityReducer("online", "refresh-complete")).toBe("online");
  });
});
