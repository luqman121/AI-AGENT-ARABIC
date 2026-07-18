import { z } from "zod";

import { postStream, readSseJson, type Fetch } from "../http.js";
import {
  ProviderError,
  type ModelProviderAdapter,
  type ModelRequest,
  type ModelStreamEvent,
} from "../types.js";

const chunkSchema = z.looseObject({
  choices: z
    .array(
      z.looseObject({
        delta: z.looseObject({ content: z.string().max(10_000).nullable().optional() }).optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .optional(),
  error: z
    .looseObject({
      code: z.union([z.number(), z.string()]).optional(),
      metadata: z.looseObject({ error_type: z.string().optional() }).optional(),
    })
    .optional(),
  usage: z
    .looseObject({
      completion_tokens: z.number().int().nonnegative(),
      cost: z.number().nonnegative().optional(),
      prompt_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

export type OpenRouterAdapterOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: Fetch;
};

export function createOpenRouterAdapter(options: OpenRouterAdapterOptions): ModelProviderAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? "https://openrouter.ai/api/v1";

  return {
    provider: "openrouter",
    async *stream(request: ModelRequest): AsyncGenerator<ModelStreamEvent> {
      const response = await postStream(fetchImpl, `${baseUrl}/chat/completions`, {
        body: JSON.stringify({
          max_completion_tokens: request.maxOutputTokens,
          messages: [
            { content: request.prompt.system, role: "system" },
            { content: request.prompt.developer, role: "developer" },
            { content: request.prompt.user, role: "user" },
          ],
          model: request.model,
          stream: true,
          stream_options: { include_usage: true },
        }),
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: request.signal,
      });

      let completed = false;
      let gotUsage = false;
      let refused = false;
      for await (const value of readSseJson(response)) {
        const parsed = chunkSchema.safeParse(value);
        if (!parsed.success) throw new ProviderError("invalid_response", false);
        if (parsed.data.error) {
          const errorType = parsed.data.error.metadata?.error_type;
          throw new ProviderError(
            errorType === "rate_limit_exceeded" ? "rate_limited" : "unavailable",
            true,
          );
        }
        for (const choice of parsed.data.choices ?? []) {
          const text = choice.delta?.content;
          if (text) yield { text, type: "text-delta" };
          if (choice.finish_reason === "content_filter") {
            refused = true;
            completed = true;
            yield { type: "refusal" };
          }
          if (choice.finish_reason === "stop") completed = true;
        }
        const usage = parsed.data.usage;
        if (usage) {
          gotUsage = true;
          yield {
            type: "usage",
            usage: {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              ...(usage.cost === undefined
                ? {}
                : { costMicros: Math.round(usage.cost * 1_000_000) }),
            },
          };
        }
      }
      if (!completed || (!refused && !gotUsage)) {
        throw new ProviderError("invalid_response", false);
      }
      yield { type: "completed" };
    },
  };
}
