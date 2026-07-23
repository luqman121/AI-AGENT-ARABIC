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
import type { CompiledPrompt, RequestMode, RoutedSkills, RouterInput } from "./types.js";

export type CompileParams = {
  input: RouterInput;
  /** Precomputed routing decision; recomputed from `input` when omitted. */
  routed?: RoutedSkills;
  /** Uploaded text to fence into the user message as untrusted data. */
  uploadedContent?: { label: string; text: string }[];
};

function isReadingMode(mode: RequestMode): boolean {
  return mode === "read" || mode === "analyze";
}

function localeLine(language: string, rtl: boolean): string {
  const dir = rtl ? "rtl" : "ltr";
  return `السياق: اللغة=${language}، الاتجاه=${dir}.`;
}

/**
 * Composes the final provider-neutral runtime prompt from:
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
    metadata: {
      promptVersion: CORE_SYSTEM_PROMPT_VERSION,
      skillIds: loaded.map((skill) => skill.id),
      skillVersions,
      estimatedTokens,
      locale: routed.language,
      validationProfile: reading ? "reading" : routed.artifactType,
      artifactType: routed.artifactType,
      mode: routed.mode,
      rtl: routed.rtl,
    },
  };
}
