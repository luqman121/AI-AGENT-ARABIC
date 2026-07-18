import { ProviderError, type ModelProviderAdapter, type ModelUsage } from "@wakil/model-router";
import {
  buildStaticSitePrompt,
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

export type StaticSiteGenerationResult =
  | {
      attempts: number;
      html: string;
      ok: true;
      summary: string;
      usage: ModelUsage & { costMicros: number };
    }
  | { attempts: number; code: PlanningFailureCode; ok: false };

export type StaticSiteGenerationInput = {
  adapter: ModelProviderAdapter;
  isCancelled: () => Promise<boolean>;
  limits: StaticSiteGenerationLimits;
  model: string;
  reviewedPlan: string;
  sleep?: (milliseconds: number) => Promise<void>;
  userRequest: string;
};

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
  const prompt = buildStaticSitePrompt({
    reviewedPlan: input.reviewedPlan,
    userRequest: input.userRequest,
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
    return { attempts: 0, code: "limit_exceeded", ok: false };
  }
  const sleep =
    input.sleep ?? ((milliseconds: number) => new Promise((r) => setTimeout(r, milliseconds)));

  for (let attempt = 1; attempt <= input.limits.maxAttempts; attempt += 1) {
    if (await input.isCancelled()) return { attempts: attempt - 1, code: "cancelled", ok: false };
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
          return { attempts: attempt, code: "cancelled", ok: false };
        }
        if (event.type === "text-delta") {
          content += event.text;
          if (content.length > input.limits.maxOutputChars) {
            controller.abort();
            return { attempts: attempt, code: "limit_exceeded", ok: false };
          }
        } else if (event.type === "usage") usage = event.usage;
        else if (event.type === "refusal") refused = true;
        else if (event.type === "completed") completed = true;
      }

      if (refused) return { attempts: attempt, code: "refused", ok: false };
      if (!completed) return { attempts: attempt, code: "invalid_response", ok: false };
      let json: unknown;
      try {
        json = JSON.parse(content);
      } catch {
        return { attempts: attempt, code: "invalid_response", ok: false };
      }
      const draft = staticSiteDraftSchema.safeParse(json);
      if (!draft.success) return { attempts: attempt, code: "invalid_response", ok: false };
      let site: { html: string; summary: string };
      try {
        site = validateAndSecureStaticSite(draft.data, input.limits.maxHtmlBytes);
      } catch {
        return { attempts: attempt, code: "invalid_response", ok: false };
      }
      const calculatedCost = costMicros(usage, input.limits);
      if (
        usage.outputTokens > input.limits.maxOutputTokens ||
        calculatedCost > input.limits.maxCostMicros
      ) {
        return { attempts: attempt, code: "limit_exceeded", ok: false };
      }
      return {
        attempts: attempt,
        html: site.html,
        ok: true,
        summary: site.summary,
        usage: { ...usage, costMicros: calculatedCost },
      };
    } catch (error) {
      const providerError =
        error instanceof ProviderError
          ? error
          : new ProviderError(controller.signal.aborted ? "timeout" : "unavailable", true);
      if (!providerError.retryable || content.length > 0 || attempt >= input.limits.maxAttempts) {
        return { attempts: attempt, code: providerFailure(providerError), ok: false };
      }
      await sleep(100 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  return { attempts: input.limits.maxAttempts, code: "provider_unavailable", ok: false };
}
