import { z } from "zod";

import { postStream, readSseJson, type Fetch } from "../http.js";
import {
  ProviderError,
  type ModelProviderAdapter,
  type ModelRequest,
  type ModelStreamEvent,
} from "../types.js";

const eventSchema = z.looseObject({
  delta: z.string().max(10_000).optional(),
  response: z
    .looseObject({
      status: z.string().optional(),
      usage: z
        .looseObject({
          input_tokens: z.number().int().nonnegative(),
          output_tokens: z.number().int().nonnegative(),
        })
        .optional(),
    })
    .optional(),
  type: z.string(),
});

export type OpenAiAdapterOptions = { apiKey: string; baseUrl?: string; fetch?: Fetch };

export function createOpenAiAdapter(options: OpenAiAdapterOptions): ModelProviderAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? "https://api.openai.com/v1";

  return {
    provider: "openai",
    async *stream(request: ModelRequest): AsyncGenerator<ModelStreamEvent> {
      const response = await postStream(fetchImpl, `${baseUrl}/responses`, {
        body: JSON.stringify({
          input: request.prompt.user,
          instructions: `${request.prompt.system}\n\n${request.prompt.developer}`,
          max_output_tokens: request.maxOutputTokens,
          model: request.model,
          stream: true,
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
        const parsed = eventSchema.safeParse(value);
        if (!parsed.success) throw new ProviderError("invalid_response", false);
        const event = parsed.data;
        if (event.type === "response.output_text.delta" && event.delta) {
          yield { text: event.delta, type: "text-delta" };
        } else if (event.type === "response.refusal.delta") {
          refused = true;
          yield { type: "refusal" };
        } else if (event.type === "error" || event.type === "response.failed") {
          throw new ProviderError("unavailable", true);
        } else if (event.type === "response.completed") {
          completed = event.response?.status === undefined || event.response.status === "completed";
          const usage = event.response?.usage;
          if (usage) {
            gotUsage = true;
            yield {
              type: "usage",
              usage: {
                inputTokens: usage.input_tokens,
                outputTokens: usage.output_tokens,
              },
            };
          }
        }
      }
      if (!completed || (!refused && !gotUsage)) {
        throw new ProviderError("invalid_response", false);
      }
      yield { type: "completed" };
    },
  };
}
