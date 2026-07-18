import type { PlanningLimits } from "@wakil/agent-core";
import {
  createAnthropicAdapter,
  createGoogleAdapter,
  createOpenAiAdapter,
  createOpenRouterAdapter,
  ModelRouter,
  type ModelProviderAdapter,
} from "@wakil/model-router";

import type { WorkerEnv } from "./env.js";

export type ConfiguredModel = {
  adapter: ModelProviderAdapter;
  configKey: string;
  limits: PlanningLimits;
  model: string;
};

export function createConfiguredModel(env: WorkerEnv): ConfiguredModel {
  const adapters: ModelProviderAdapter[] = [];
  if (env.OPENROUTER_API_KEY) {
    adapters.push(
      createOpenRouterAdapter({
        apiKey: env.OPENROUTER_API_KEY,
        ...(env.OPENROUTER_BASE_URL ? { baseUrl: env.OPENROUTER_BASE_URL } : {}),
      }),
    );
  }
  if (env.OPENAI_API_KEY) {
    adapters.push(
      createOpenAiAdapter({
        apiKey: env.OPENAI_API_KEY,
        ...(env.OPENAI_BASE_URL ? { baseUrl: env.OPENAI_BASE_URL } : {}),
      }),
    );
  }
  if (env.ANTHROPIC_API_KEY) {
    adapters.push(
      createAnthropicAdapter({
        apiKey: env.ANTHROPIC_API_KEY,
        ...(env.ANTHROPIC_BASE_URL ? { baseUrl: env.ANTHROPIC_BASE_URL } : {}),
      }),
    );
  }
  if (env.GOOGLE_API_KEY) {
    adapters.push(
      createGoogleAdapter({
        apiKey: env.GOOGLE_API_KEY,
        ...(env.GOOGLE_BASE_URL ? { baseUrl: env.GOOGLE_BASE_URL } : {}),
      }),
    );
  }

  const modelByProvider = {
    anthropic: env.ANTHROPIC_MODEL,
    google: env.GOOGLE_MODEL,
    openai: env.OPENAI_MODEL,
    openrouter: env.OPENROUTER_MODEL,
  } as const;
  const model = modelByProvider[env.MODEL_PROVIDER];
  if (!model) throw new Error("Configured model is unavailable");

  return {
    adapter: new ModelRouter(adapters).get(env.MODEL_PROVIDER),
    configKey: env.MODEL_PROVIDER,
    limits: {
      deadlineMs: env.MODEL_DEADLINE_MS,
      inputCostMicrosPerMillionTokens: env.MODEL_INPUT_COST_MICROS_PER_MILLION_TOKENS,
      maxAttempts: env.MODEL_MAX_ATTEMPTS,
      maxCostMicros: env.MODEL_MAX_COST_MICROS,
      maxDeltaEvents: env.MODEL_MAX_DELTA_EVENTS,
      maxOutputChars: env.MODEL_MAX_OUTPUT_CHARS,
      maxOutputTokens: env.MODEL_MAX_OUTPUT_TOKENS,
      outputCostMicrosPerMillionTokens: env.MODEL_OUTPUT_COST_MICROS_PER_MILLION_TOKENS,
    },
    model,
  };
}
