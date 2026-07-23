import { describe, expect, it } from "vitest";

import { artifactPresentation } from "./artifact-presentations";
import { productFeatureFlags } from "./feature-flags";
import { arMessages } from "./messages.ar";
import { OUTPUT_CAPABILITIES, outputCapabilityById } from "./output-capabilities";

describe("Arabic output capabilities", () => {
  it("exposes all requested shortcuts with structured intent metadata", () => {
    expect(OUTPUT_CAPABILITIES.map((capability) => capability.label)).toEqual([
      "موقع",
      "تطبيق",
      "PDF",
      "Excel",
      "عرض تقديمي",
      "صورة",
      "صوت",
      "مستند",
      "المزيد",
    ]);
    expect(new Set(OUTPUT_CAPABILITIES.map((capability) => capability.outputKind)).size).toBe(
      OUTPUT_CAPABILITIES.length,
    );
  });

  it("enables only output kinds with complete worker generators", () => {
    const enabled = OUTPUT_CAPABILITIES.filter((capability) => capability.enabled);
    expect(enabled.map((capability) => capability.outputKind)).toEqual([
      "static_site",
      "pdf",
      "spreadsheet",
      "presentation",
      "document",
    ]);
    expect(
      OUTPUT_CAPABILITIES.filter((capability) => !capability.enabled).every(
        (capability) => capability.disabledReason && capability.disabledReason.length > 0,
      ),
    ).toBe(true);
  });

  it("falls back to the supported website capability for unknown UI state", () => {
    expect(outputCapabilityById("unknown").id).toBe("website");
  });
});

describe("Arabic product messages and feature boundaries", () => {
  it("keeps the prompt-first home copy Arabic", () => {
    expect(arMessages.home.headline).toBe("ماذا تريد من وكيل أن ينجز لك؟");
    expect(arMessages.home.supportingCopy).toContain("التخطيط والتنفيذ");
  });

  it("keeps unsafe visual editing disabled", () => {
    expect(productFeatureFlags.visualEditing).toBe(false);
  });

  it("shows preview actions for generated artifacts with safe HTML previews", () => {
    expect(artifactPresentation("static_site")).toMatchObject({
      label: "موقع ويب",
      previewable: true,
    });
    expect(artifactPresentation("pdf")).toMatchObject({
      kind: "pdf",
      previewable: true,
    });
    expect(artifactPresentation("spreadsheet").previewable).toBe(true);
    expect(artifactPresentation("presentation").previewable).toBe(true);
    expect(artifactPresentation("document").previewable).toBe(true);
    expect(artifactPresentation("audio").readyCopy).toContain("الصوتي");
  });
});
