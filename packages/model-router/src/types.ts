import type { PlanningPrompt } from "@wakil/skills";

export const MODEL_PROVIDERS = ["openrouter", "openai", "anthropic", "google"] as const;
export type ModelProviderName = (typeof MODEL_PROVIDERS)[number];

export type ModelRequest = {
  model: string;
  prompt: PlanningPrompt;
  maxOutputTokens: number;
  signal: AbortSignal;
};

export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  costMicros?: number;
};

export type ModelStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "usage"; usage: ModelUsage }
  | { type: "refusal" }
  | { type: "completed" };

export interface ModelProviderAdapter {
  readonly provider: ModelProviderName;
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
}

export type ProviderErrorCode =
  | "authentication"
  | "invalid_request"
  | "invalid_response"
  | "rate_limited"
  | "timeout"
  | "unavailable";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: ProviderErrorCode, retryable: boolean) {
    super(`Model provider error: ${code}`);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}
