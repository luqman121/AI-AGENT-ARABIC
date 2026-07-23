import { ProviderError, type ModelProviderAdapter, type ModelUsage } from "@wakil/model-router";
import { assistantPlanSchema, buildPlanningPrompt, type AssistantPlan } from "@wakil/skills";

export type PlanningLimits = {
  deadlineMs: number;
  inputCostMicrosPerMillionTokens: number;
  maxAttempts: number;
  maxCostMicros: number;
  maxDeltaEvents: number;
  maxOutputChars: number;
  maxOutputTokens: number;
  outputCostMicrosPerMillionTokens: number;
};

export type PlanningFailureCode =
  | "cancelled"
  | "invalid_response"
  | "limit_exceeded"
  | "provider_authentication"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "refused"
  | "timeout";

export type PlanningResult =
  | {
      ok: true;
      attempts: number;
      plan: AssistantPlan;
      usage: ModelUsage & { costMicros: number };
    }
  | { ok: false; attempts: number; code: PlanningFailureCode };

export type PlanningInput = {
  adapter: ModelProviderAdapter;
  isCancelled: () => Promise<boolean>;
  limits: PlanningLimits;
  model: string;
  outputKind?: string;
  onDelta: (textDelta: string) => Promise<void>;
  sourceContext?: string;
  userRequest: string;
  sleep?: (milliseconds: number) => Promise<void>;
};

function calculatedCostMicros(usage: ModelUsage, limits: PlanningLimits): number {
  if (usage.costMicros !== undefined) return usage.costMicros;
  return Math.ceil(
    (usage.inputTokens * limits.inputCostMicrosPerMillionTokens +
      usage.outputTokens * limits.outputCostMicrosPerMillionTokens) /
      1_000_000,
  );
}

function preflightCostMicros(promptBytes: number, limits: PlanningLimits): number {
  return Math.ceil(
    (promptBytes * limits.inputCostMicrosPerMillionTokens +
      limits.maxOutputTokens * limits.outputCostMicrosPerMillionTokens) /
      1_000_000,
  );
}

function failureFromProvider(error: ProviderError): PlanningFailureCode {
  if (error.code === "authentication") return "provider_authentication";
  if (error.code === "rate_limited") return "provider_rate_limited";
  if (error.code === "timeout") return "timeout";
  if (error.code === "invalid_response" || error.code === "invalid_request") {
    return "invalid_response";
  }
  return "provider_unavailable";
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function generatePlanningTurn(input: PlanningInput): Promise<PlanningResult> {
  const prompt = buildPlanningPrompt(input.userRequest, {
    ...(input.outputKind ? { outputKind: input.outputKind } : {}),
    ...(input.sourceContext ? { sourceContext: input.sourceContext } : {}),
  });
  const promptBytes = Buffer.byteLength(
    `${prompt.system}${prompt.developer}${prompt.user}`,
    "utf8",
  );
  if (preflightCostMicros(promptBytes, input.limits) > input.limits.maxCostMicros) {
    return { attempts: 0, code: "limit_exceeded", ok: false };
  }

  const sleep = input.sleep ?? defaultSleep;
  for (let attempt = 1; attempt <= input.limits.maxAttempts; attempt += 1) {
    if (await input.isCancelled()) return { attempts: attempt - 1, code: "cancelled", ok: false };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.limits.deadlineMs);
    let content = "";
    let deltaEvents = 0;
    let usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };
    let refused = false;
    let completed = false;

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
          for (let offset = 0; offset < event.text.length; offset += 2_000) {
            const chunk = event.text.slice(offset, offset + 2_000);
            deltaEvents += 1;
            content += chunk;
            if (
              deltaEvents > input.limits.maxDeltaEvents ||
              content.length > input.limits.maxOutputChars
            ) {
              controller.abort();
              return { attempts: attempt, code: "limit_exceeded", ok: false };
            }
            await input.onDelta(chunk);
          }
        } else if (event.type === "usage") {
          usage = event.usage;
        } else if (event.type === "refusal") {
          refused = true;
        } else if (event.type === "completed") {
          completed = true;
        }
      }

      if (refused) return { attempts: attempt, code: "refused", ok: false };
      if (!completed) return { attempts: attempt, code: "invalid_response", ok: false };
      const parsed = assistantPlanSchema.safeParse({ content });
      if (!parsed.success) return { attempts: attempt, code: "invalid_response", ok: false };
      const costMicros = calculatedCostMicros(usage, input.limits);
      if (
        usage.outputTokens > input.limits.maxOutputTokens ||
        costMicros > input.limits.maxCostMicros
      ) {
        return { attempts: attempt, code: "limit_exceeded", ok: false };
      }
      return { attempts: attempt, ok: true, plan: parsed.data, usage: { ...usage, costMicros } };
    } catch (error) {
      const providerError =
        error instanceof ProviderError
          ? error
          : new ProviderError(controller.signal.aborted ? "timeout" : "unavailable", true);
      const canRetry =
        providerError.retryable && content.length === 0 && attempt < input.limits.maxAttempts;
      if (!canRetry)
        return { attempts: attempt, code: failureFromProvider(providerError), ok: false };
      const backoff = 100 * 2 ** (attempt - 1) + Math.floor(Math.random() * 50);
      await sleep(backoff);
    } finally {
      clearTimeout(timeout);
    }
  }

  return { attempts: input.limits.maxAttempts, code: "provider_unavailable", ok: false };
}
