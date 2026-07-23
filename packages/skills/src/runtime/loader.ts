import { getSkill } from "./registry.js";
import { isExecutableSkill } from "./security.js";
import type { RuntimeSkill } from "./types.js";

export type LoadedSkill = {
  id: string;
  version: string;
  instructions: string;
};

/**
 * Resolves an ordered list of skill ids to their instruction blocks. Silently
 * drops unknown or non-executable (untrusted/disabled) skills — the loader is
 * the last line of defense before instructions reach the prompt, so it never
 * loads a skill the trust gate would reject.
 */
export function loadSkillInstructions(skillIds: readonly string[]): LoadedSkill[] {
  const loaded: LoadedSkill[] = [];
  const seen = new Set<string>();
  for (const id of skillIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const skill: RuntimeSkill | undefined = getSkill(id);
    if (!skill || !isExecutableSkill(skill)) continue;
    loaded.push({ id: skill.id, version: skill.version, instructions: skill.instructions });
  }
  return loaded;
}

/** Joins loaded skill instructions into a single block for the developer message. */
export function composeInstructionsBlock(loaded: readonly LoadedSkill[]): string {
  if (loaded.length === 0) return "";
  return loaded.map((skill) => skill.instructions).join("\n\n");
}
