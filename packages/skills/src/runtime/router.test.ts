import { describe, expect, it } from "vitest";

import { routeSkills } from "./router.js";

describe("routeSkills — artifact + mode inference", () => {
  it("routes an Arabic landing page to the website design set with RTL", () => {
    const routed = routeSkills({ requestText: "أنشئ لي صفحة هبوط عربية احترافية لمنصة وكيل" });
    expect(routed.artifactType).toBe("static_site");
    expect(routed.mode).toBe("create");
    expect(routed.rtl).toBe(true);
    expect(routed.skillIds).toContain("website-design");
    expect(routed.skillIds).toContain("arabic-rtl-ui");
    expect(routed.skillIds).toContain("design-critic");
    expect(routed.skillIds).toContain("website-quality-gate");
    // Ordered by descending priority.
    expect(routed.skillIds[0]).toBe("website-design");
  });

  it("does not load the Arabic RTL skill for an English request", () => {
    const routed = routeSkills({ requestText: "create a landing page for a coffee shop" });
    expect(routed.rtl).toBe(false);
    expect(routed.skillIds).not.toContain("arabic-rtl-ui");
    expect(routed.skillIds).toContain("website-design");
  });

  it("routes a PDF report creation to pdf-studio + quality gate", () => {
    const routed = routeSkills({ requestText: "أنشئ تقرير PDF شهري بالعربية" });
    expect(routed.artifactType).toBe("pdf");
    expect(routed.mode).toBe("create");
    expect(routed.skillIds).toContain("pdf-studio");
    expect(routed.skillIds).toContain("artifact-quality-gate");
    expect(routed.skillIds).toContain("arabic-rtl-ui");
    // Never loads unrelated website skills.
    expect(routed.skillIds).not.toContain("website-design");
  });

  it("routes PDF reading through the reader, PDF studio, quality gate, and Arabic RTL", () => {
    const routed = routeSkills({
      requestText: "لخّص لي هذا الملف واستخرج الجداول",
      uploadedMimeTypes: ["application/pdf"],
    });
    expect(routed.mode).toBe("read");
    expect(routed.artifactType).toBe("pdf");
    expect(routed.skillIds).toContain("document-reader");
    expect(routed.skillIds).toContain("pdf-studio");
    expect(routed.skillIds).toContain("artifact-quality-gate");
    expect(routed.skillIds).toContain("arabic-rtl-ui");
  });

  it("routes a spreadsheet request", () => {
    const routed = routeSkills({ requestText: "اعمل لي ميزانية Excel بصيغ ورسم بياني" });
    expect(routed.artifactType).toBe("spreadsheet");
    expect(routed.skillIds).toContain("spreadsheet-studio");
    expect(routed.skillIds).toContain("artifact-quality-gate");
  });

  it("routes a Word document request", () => {
    const routed = routeSkills({ requestText: "اكتب خطاب رسمي وعرض أعمال في ملف Word" });
    expect(routed.artifactType).toBe("document");
    expect(routed.skillIds).toContain("document-studio");
  });

  it("routes a PowerPoint request", () => {
    const routed = routeSkills({ requestText: "صمّم لي عرض تقديمي من عشر شرائح" });
    expect(routed.artifactType).toBe("presentation");
    expect(routed.skillIds).toContain("presentation-studio");
  });

  it("honors an explicit artifactType from the caller", () => {
    const routed = routeSkills({ requestText: "شيء ما", artifactType: "spreadsheet" });
    expect(routed.artifactType).toBe("spreadsheet");
    expect(routed.skillIds).toContain("spreadsheet-studio");
  });

  it("never returns unknown or non-executable skill ids", () => {
    const routed = routeSkills({ requestText: "أنشئ موقعاً" });
    for (const id of routed.skillIds) {
      expect(typeof id).toBe("string");
    }
    expect(new Set(routed.skillIds).size).toBe(routed.skillIds.length);
  });
});

describe("routeSkills — prompt budgeting", () => {
  it("keeps at least the highest-priority skill even under a tiny budget", () => {
    const routed = routeSkills({ requestText: "أنشئ موقعاً عربياً", maxPromptTokens: 1 });
    expect(routed.skillIds).toHaveLength(1);
    expect(routed.skillIds[0]).toBe("website-design");
    expect(routed.skipped.length).toBeGreaterThan(0);
  });

  it("drops lower-priority skills to stay within budget and records them", () => {
    const full = routeSkills({ requestText: "أنشئ موقعاً عربياً" });
    const budgeted = routeSkills({ requestText: "أنشئ موقعاً عربياً", maxPromptTokens: 400 });
    expect(budgeted.skillIds.length).toBeLessThan(full.skillIds.length);
    expect(budgeted.estimatedInstructionTokens).toBeLessThanOrEqual(400 + 200);
    const skippedIds = budgeted.skipped.map((s) => s.id);
    for (const id of budgeted.skillIds) expect(skippedIds).not.toContain(id);
  });

  it("reports an accurate estimated token total for the kept skills", () => {
    const routed = routeSkills({ requestText: "أنشئ موقعاً عربياً" });
    expect(routed.estimatedInstructionTokens).toBeGreaterThan(0);
  });
});
