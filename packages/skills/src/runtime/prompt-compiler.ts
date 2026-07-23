import {
  artifactAddendum,
  PLATFORM_SAFETY_RULES,
  VALIDATION_REQUIREMENTS,
} from "../prompts/artifact-system-prompt.js";
import { CORE_SYSTEM_PROMPT, CORE_SYSTEM_PROMPT_VERSION } from "../prompts/core-system-prompt.js";
import { composeInstructionsBlock, loadSkillInstructions } from "./loader.js";
import { routeSkills } from "./router.js";
import { wrapUntrustedContent } from "./security.js";
import { estimateTokens } from "./tokens.js";
import type {
  CompiledPrompt,
  RequestMode,
  RoutedSkills,
  RouterInput,
  RunPromptMetadata,
} from "./types.js";

function isReadingMode(mode: RequestMode): boolean {
  return mode === "read" || mode === "analyze";
}

function localeLine(language: string, rtl: boolean): string {
  const dir = rtl ? "rtl" : "ltr";
  return `السياق: اللغة=${language}، الاتجاه=${dir}.`;
}

function metadataFor(
  routed: RoutedSkills,
  skillVersions: Record<string, string>,
): RunPromptMetadata {
  return {
    promptVersion: CORE_SYSTEM_PROMPT_VERSION,
    skillIds: routed.skillIds,
    skillVersions,
    estimatedTokens: routed.estimatedInstructionTokens,
    locale: routed.language,
    validationProfile: isReadingMode(routed.mode) ? "reading" : routed.artifactType,
    artifactType: routed.artifactType,
    mode: routed.mode,
    rtl: routed.rtl,
  };
}

export type SkillsAddendum = {
  /** Selected skill instructions, ready to append to a developer message. Empty string if none selected. */
  block: string;
  /** The routing decision that produced this addendum. */
  routed: RoutedSkills;
  /** Admin-only run metadata. Token estimate here covers only the addendum block. */
  metadata: RunPromptMetadata;
};

/**
 * Routes and loads the minimal relevant skill set for a request and returns
 * just the instructions block (plus routing metadata) — without building a
 * full three-part prompt. This is the integration seam for callers (such as
 * `@wakil/agent-core`) that already own a tested system/developer envelope
 * and only want the runtime to select and compile skill guidance into it,
 * rather than replace it outright.
 */
export function compileSkillsAddendum(input: RouterInput): SkillsAddendum {
  const routed = routeSkills(input);
  const loaded = loadSkillInstructions(routed.skillIds);
  const instructionsBlock = composeInstructionsBlock(loaded);
  const block = instructionsBlock ? `المهارات المفعّلة:\n${instructionsBlock}` : "";

  const skillVersions: Record<string, string> = {};
  for (const skill of loaded) skillVersions[skill.id] = skill.version;

  return { block, routed, metadata: metadataFor(routed, skillVersions) };
}

export type CompileParams = {
  input: RouterInput;
  /** Precomputed routing decision; recomputed from `input` when omitted. */
  routed?: RoutedSkills;
  /** Uploaded text to fence into the user message as untrusted data. */
  uploadedContent?: { label: string; text: string }[];
};

/**
 * Composes the full provider-neutral runtime prompt from:
 *   core system prompt + platform safety + run/user context +
 *   selected skill instructions + artifact requirements + validation.
 *
 * The user request and any uploaded text are fenced as untrusted data so
 * embedded instructions cannot override the platform rules. Returns the
 * `{ system, developer, user }` shape every model adapter consumes, plus
 * admin-only run metadata that is never surfaced to customers.
 */
export function compileRuntimePrompt(params: CompileParams): CompiledPrompt {
  const routed = params.routed ?? routeSkills(params.input);
  const loaded = loadSkillInstructions(routed.skillIds);
  const reading = isReadingMode(routed.mode);

  const developerSections: string[] = [
    PLATFORM_SAFETY_RULES,
    localeLine(routed.language, routed.rtl),
    artifactAddendum(routed.artifactType, routed.mode),
  ];
  if (!reading) developerSections.push(VALIDATION_REQUIREMENTS);

  const instructionsBlock = composeInstructionsBlock(loaded);
  if (instructionsBlock) {
    developerSections.push(`المهارات المفعّلة:\n${instructionsBlock}`);
  }

  const developer = developerSections.join("\n\n");

  const userSections: string[] = [wrapUntrustedContent("طلب المستخدم", params.input.requestText)];
  if (params.input.projectContext) {
    userSections.push(wrapUntrustedContent("سياق المشروع", params.input.projectContext));
  }
  for (const upload of params.uploadedContent ?? []) {
    userSections.push(wrapUntrustedContent(upload.label, upload.text));
  }
  const user = userSections.join("\n\n");

  const prompt = { system: CORE_SYSTEM_PROMPT, developer, user };
  const estimatedTokens =
    estimateTokens(prompt.system) + estimateTokens(prompt.developer) + estimateTokens(prompt.user);

  const skillVersions: Record<string, string> = {};
  for (const skill of loaded) skillVersions[skill.id] = skill.version;

  return {
    prompt,
    metadata: { ...metadataFor(routed, skillVersions), estimatedTokens },
  };
}
