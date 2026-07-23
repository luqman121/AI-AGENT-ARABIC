import { describe, expect, it } from "vitest";

import {
  getSkill,
  RUNTIME_SKILLS,
  skillCatalogMetadata,
  skillChecksum,
  skillsInCategory,
} from "./registry.js";
import { agentSkillSchema, ARTIFACT_TYPES } from "./types.js";

describe("runtime skill registry", () => {
  it("validates every skill against the strict metadata schema", () => {
    for (const skill of RUNTIME_SKILLS) {
      // Zod strips the extra `instructions` key; metadata must still be valid.
      expect(() => agentSkillSchema.parse(skill)).not.toThrow();
      expect(skill.instructions.length).toBeGreaterThan(40);
    }
  });

  it("has unique ids and priorities within range", () => {
    const ids = RUNTIME_SKILLS.map((skill) => skill.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const skill of RUNTIME_SKILLS) {
      expect(skill.priority).toBeGreaterThanOrEqual(0);
      expect(skill.priority).toBeLessThanOrEqual(1000);
    }
  });

  it("stamps a checksum that matches the instruction body", () => {
    for (const skill of RUNTIME_SKILLS) {
      expect(skill.checksum).toBe(skillChecksum(skill.instructions));
    }
  });

  it("exposes metadata without leaking instruction bodies", () => {
    const meta = skillCatalogMetadata();
    expect(meta).toHaveLength(RUNTIME_SKILLS.length);
    for (const entry of meta) {
      expect(entry).not.toHaveProperty("instructions");
    }
  });

  it("resolves by id and category", () => {
    expect(getSkill("website-design")?.category).toBe("website");
    expect(getSkill("does-not-exist")).toBeUndefined();
    expect(
      skillsInCategory("quality")
        .map((s) => s.id)
        .sort(),
    ).toEqual(["artifact-quality-gate", "design-critic", "website-quality-gate"]);
  });

  it("keeps the artifact vocabulary aligned with the platform output kinds", () => {
    // Mirror of OUTPUT_KINDS in @wakil/shared; a drift here means the router
    // and the project schema disagree about artifact types.
    expect([...ARTIFACT_TYPES]).toEqual([
      "static_site",
      "web_app",
      "pdf",
      "spreadsheet",
      "image",
      "audio",
      "document",
      "presentation",
      "other",
    ]);
  });
});
