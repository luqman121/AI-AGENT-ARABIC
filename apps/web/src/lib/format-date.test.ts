import { describe, expect, it } from "vitest";

import { formatDateLabel, formatDateTimeLabel } from "./format-date";

describe("Arabic product date formatting", () => {
  it("uses the Muscat product timezone independently of the runtime timezone", () => {
    const instant = new Date("2026-07-23T20:30:00.000Z");

    expect(formatDateTimeLabel(instant)).toContain("24");
    expect(formatDateTimeLabel(instant)).toContain("12:30");
    expect(formatDateLabel(instant)).toContain("24");
  });
});
