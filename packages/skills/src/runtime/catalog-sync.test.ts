import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { RUNTIME_SKILLS } from "./registry.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(`${repoRoot}${relativePath}`, "utf8"));
}

type LockEntry = { id: string; version: string; checksum: string };

describe("on-disk skill catalog stays in sync with the registry", () => {
  it("lock file matches the registry checksums and versions", () => {
    const lock = readJson("skills/manifest.lock.json") as { skills: LockEntry[] };
    const byId = new Map(lock.skills.map((entry) => [entry.id, entry]));
    expect(lock.skills).toHaveLength(RUNTIME_SKILLS.length);
    for (const skill of RUNTIME_SKILLS) {
      const entry = byId.get(skill.id);
      expect(entry, `missing lock entry for ${skill.id}`).toBeTruthy();
      expect(entry?.version).toBe(skill.version);
      expect(entry?.checksum).toBe(skill.checksum);
    }
  });

  it("each skill has a manifest.json matching the registry metadata", () => {
    for (const skill of RUNTIME_SKILLS) {
      const manifest = readJson(`skills/${skill.id}/manifest.json`) as Record<string, unknown>;
      expect(manifest.id).toBe(skill.id);
      expect(manifest.version).toBe(skill.version);
      expect(manifest.category).toBe(skill.category);
      expect(manifest.trustLevel).toBe(skill.trustLevel);
      expect(manifest.license).toBe(skill.license);
      expect(manifest.checksum).toBe(skill.checksum);
      expect(manifest).not.toHaveProperty("instructions");
    }
  });
});
