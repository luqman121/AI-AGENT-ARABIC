import { ProviderError, type ModelProviderAdapter, type ModelUsage } from "@wakil/model-router";
import {
  buildStaticSitePrompt,
  compileSkillsAddendum,
  staticSiteDraftSchema,
  validateAndSecureStaticSite,
} from "@wakil/skills";

import type { PlanningFailureCode } from "./planner.js";

export type StaticSiteGenerationLimits = {
  deadlineMs: number;
  inputCostMicrosPerMillionTokens: number;
  maxAttempts: number;
  maxCostMicros: number;
  maxHtmlBytes: number;
  maxOutputChars: number;
  maxOutputTokens: number;
  outputCostMicrosPerMillionTokens: number;
};

/**
 * Admin-only debugging record of what the skills runtime did for this
 * generation call. Never surfaced to customers — the worker logs this
 * structure (ids/versions/counts only, never instruction bodies) and the
 * processor can act on `used`/`fallbackUsed` for operational visibility.
 */
export type SkillsRuntimeRunInfo = {
  enabled: boolean;
  used: boolean;
  fallbackUsed: boolean;
  promptVersion?: string;
  skillIds?: string[];
  skillVersions?: Record<string, string>;
  skipped?: { id: string; reason: string }[];
  estimatedInstructionTokens?: number;
  artifactType?: string;
  locale?: string;
  rtl?: boolean;
  validationProfile?: string;
};

const SKILLS_RUNTIME_DISABLED: SkillsRuntimeRunInfo = {
  enabled: false,
  fallbackUsed: false,
  used: false,
};

export type StaticSiteGenerationResult =
  | {
      attempts: number;
      html: string;
      ok: true;
      skillsRuntime: SkillsRuntimeRunInfo;
      summary: string;
      usage: ModelUsage & { costMicros: number };
    }
  | { attempts: number; code: PlanningFailureCode; ok: false; skillsRuntime: SkillsRuntimeRunInfo };

export type SkillsRuntimeOption = {
  /** Feature flag. When false, behavior is byte-identical to the legacy path. */
  enabled: boolean;
  maxPromptTokens?: number;
  /**
   * Test seam only: overrides the real compiler so tests can force a
   * "clearly identified runtime compilation failure" and prove the fallback
   * path. Production callers must never set this — it defaults to the real
   * `compileSkillsAddendum` from `@wakil/skills`.
   */
  compile?: typeof compileSkillsAddendum;
};

export type StaticSiteGenerationInput = {
  adapter: ModelProviderAdapter;
  isCancelled: () => Promise<boolean>;
  limits: StaticSiteGenerationLimits;
  model: string;
  reviewedPlan: string;
  sleep?: (milliseconds: number) => Promise<void>;
  userRequest: string;
  /** Off by default; preserves the exact legacy prompt path when omitted. */
  skillsRuntime?: SkillsRuntimeOption;
  /**
   * Short, non-sensitive issue summaries from a prior Design Critic pass.
   * When present, appended to the developer message as a repair directive.
   * Never contains customer content or secrets — only short Arabic labels.
   */
  repairNotes?: string[];
};

/**
 * Selects and compiles the relevant runtime skills for a website request and
 * appends their instructions to the developer message — without touching the
 * tested system persona or the JSON-envelope contract `generateStaticSite`
 * relies on to parse the model's response. Failure here is narrowly scoped:
 * only this compilation step falls back, never the whole generation call.
 */
function applySkillsRuntime(
  developer: string,
  input: StaticSiteGenerationInput,
): { developer: string; skillsRuntime: SkillsRuntimeRunInfo } {
  const option = input.skillsRuntime;
  if (!option?.enabled) return { developer, skillsRuntime: SKILLS_RUNTIME_DISABLED };

  try {
    const compile = option.compile ?? compileSkillsAddendum;
    const addendum = compile({
      requestText: input.userRequest,
      artifactType: "static_site",
      ...(option.maxPromptTokens !== undefined ? { maxPromptTokens: option.maxPromptTokens } : {}),
    });
    const withAddendum = addendum.block ? `${developer}\n\n${addendum.block}` : developer;
    return {
      developer: withAddendum,
      skillsRuntime: {
        enabled: true,
        used: true,
        fallbackUsed: false,
        promptVersion: addendum.metadata.promptVersion,
        skillIds: addendum.metadata.skillIds,
        skillVersions: addendum.metadata.skillVersions,
        skipped: addendum.routed.skipped,
        estimatedInstructionTokens: addendum.metadata.estimatedTokens,
        artifactType: addendum.metadata.artifactType,
        locale: addendum.metadata.locale,
        rtl: addendum.metadata.rtl,
        validationProfile: addendum.metadata.validationProfile,
      },
    };
  } catch {
    // A clearly identified runtime-compilation failure: fall back to the
    // legacy prompt untouched. Never surfaced to the customer; the caller
    // logs `fallbackUsed` for operational visibility.
    return {
      developer,
      skillsRuntime: { enabled: true, fallbackUsed: true, used: false },
    };
  }
}

function costMicros(usage: ModelUsage, limits: StaticSiteGenerationLimits): number {
  if (usage.costMicros !== undefined) return usage.costMicros;
  return Math.ceil(
    (usage.inputTokens * limits.inputCostMicrosPerMillionTokens +
      usage.outputTokens * limits.outputCostMicrosPerMillionTokens) /
      1_000_000,
  );
}

function providerFailure(error: ProviderError): PlanningFailureCode {
  if (error.code === "authentication") return "provider_authentication";
  if (error.code === "rate_limited") return "provider_rate_limited";
  if (error.code === "timeout") return "timeout";
  if (error.code === "invalid_request" || error.code === "invalid_response") {
    return "invalid_response";
  }
  return "provider_unavailable";
}

export async function generateStaticSite(
  input: StaticSiteGenerationInput,
): Promise<StaticSiteGenerationResult> {
  const basePrompt = buildStaticSitePrompt({
    reviewedPlan: input.reviewedPlan,
    userRequest: input.userRequest,
  });
  const { developer: developerWithSkills, skillsRuntime } = applySkillsRuntime(
    basePrompt.developer,
    input,
  );
  const developer =
    input.repairNotes && input.repairNotes.length > 0
      ? `${developerWithSkills}\n\nأصلح المشكلات التالية قبل التسليم:\n${input.repairNotes.map((note) => `- ${note}`).join("\n")}`
      : developerWithSkills;
  const prompt = { ...basePrompt, developer };

  const fail = (attempts: number, code: PlanningFailureCode): StaticSiteGenerationResult => ({
    attempts,
    code,
    ok: false,
    skillsRuntime,
  });

  const promptBytes = Buffer.byteLength(
    `${prompt.system}${prompt.developer}${prompt.user}`,
    "utf8",
  );
  const preflightCost = Math.ceil(
    (promptBytes * input.limits.inputCostMicrosPerMillionTokens +
      input.limits.maxOutputTokens * input.limits.outputCostMicrosPerMillionTokens) /
      1_000_000,
  );
  if (preflightCost > input.limits.maxCostMicros) {
    return fail(0, "limit_exceeded");
  }
  const sleep =
    input.sleep ?? ((milliseconds: number) => new Promise((r) => setTimeout(r, milliseconds)));

  for (let attempt = 1; attempt <= input.limits.maxAttempts; attempt += 1) {
    if (await input.isCancelled()) return fail(attempt - 1, "cancelled");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.limits.deadlineMs);
    let content = "";
    let completed = false;
    let refused = false;
    let usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };

    try {
      for await (const event of input.adapter.stream({
        maxOutputTokens: input.limits.maxOutputTokens,
        model: input.model,
        prompt,
        signal: controller.signal,
      })) {
        if (await input.isCancelled()) {
          controller.abort();
          return fail(attempt, "cancelled");
        }
        if (event.type === "text-delta") {
          content += event.text;
          if (content.length > input.limits.maxOutputChars) {
            controller.abort();
            return fail(attempt, "limit_exceeded");
          }
        } else if (event.type === "usage") usage = event.usage;
        else if (event.type === "refusal") refused = true;
        else if (event.type === "completed") completed = true;
      }

      if (refused) return fail(attempt, "refused");
      if (!completed) return fail(attempt, "invalid_response");
      let json: unknown;
      try {
        json = JSON.parse(content);
      } catch {
        return fail(attempt, "invalid_response");
      }
      const draft = staticSiteDraftSchema.safeParse(json);
      if (!draft.success) return fail(attempt, "invalid_response");
      let site: { html: string; summary: string };
      try {
        site = validateAndSecureStaticSite(draft.data, input.limits.maxHtmlBytes);
      } catch {
        return fail(attempt, "invalid_response");
      }
      const calculatedCost = costMicros(usage, input.limits);
      if (
        usage.outputTokens > input.limits.maxOutputTokens ||
        calculatedCost > input.limits.maxCostMicros
      ) {
        return fail(attempt, "limit_exceeded");
      }
      return {
        attempts: attempt,
        html: site.html,
        ok: true,
        skillsRuntime,
        summary: site.summary,
        usage: { ...usage, costMicros: calculatedCost },
      };
    } catch (error) {
      const providerError =
        error instanceof ProviderError
          ? error
          : new ProviderError(controller.signal.aborted ? "timeout" : "unavailable", true);
      if (!providerError.retryable || content.length > 0 || attempt >= input.limits.maxAttempts) {
        return fail(attempt, providerFailure(providerError));
      }
      await sleep(100 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  return fail(input.limits.maxAttempts, "provider_unavailable");
}
