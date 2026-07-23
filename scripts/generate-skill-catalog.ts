/**
 * Generates the on-disk skill catalog under `skills/` from the runtime
 * registry (the single source of truth). Run after editing any skill:
 *
 *   pnpm exec tsx scripts/generate-skill-catalog.ts
 *
 * A vitest test (`catalog-sync.test.ts`) fails if the committed files drift
 * from the registry, so regeneration is enforced in CI.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RUNTIME_SKILLS } from "../packages/skills/src/runtime/registry.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogRoot = join(repoRoot, "skills");

type LockEntry = {
  id: string;
  version: string;
  category: string;
  trustLevel: string;
  license: string;
  source: string;
  checksum: string;
};

const lock: LockEntry[] = [];

for (const skill of RUNTIME_SKILLS) {
  const { instructions, ...meta } = skill;
  const dir = join(catalogRoot, skill.id);
  mkdirSync(dir, { recursive: true });

  writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  const skillMd = [
    `# ${skill.name}`,
    "",
    `- id: \`${skill.id}\``,
    `- version: \`${skill.version}\``,
    `- category: \`${skill.category}\``,
    `- trust: \`${skill.trustLevel}\``,
    `- license: \`${skill.license}\``,
    `- source: \`${skill.source}\``,
    "",
    skill.description,
    "",
    "## Instructions",
    "",
    instructions,
    "",
  ].join("\n");
  writeFileSync(join(dir, "SKILL.md"), skillMd, "utf8");

  lock.push({
    id: skill.id,
    version: skill.version,
    category: skill.category,
    trustLevel: skill.trustLevel,
    license: skill.license,
    source: skill.source,
    checksum: skill.checksum ?? "",
  });
}

writeFileSync(
  join(catalogRoot, "manifest.lock.json"),
  `${JSON.stringify({ generatedFrom: "packages/skills/src/runtime/registry.ts", skills: lock }, null, 2)}\n`,
  "utf8",
);

// eslint-disable-next-line no-console
console.log(`Wrote catalog for ${RUNTIME_SKILLS.length} skills to ${catalogRoot}`);
