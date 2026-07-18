import { z } from "zod";

import { postStream, readSseJson, type Fetch } from "../http.js";
import {
  ProviderError,
  type ModelProviderAdapter,
  type ModelRequest,
  type ModelStreamEvent,
} from "../types.js";

const eventSchema = z.looseObject({
  delta: z
    .looseObject({
      stop_reason: z.string().nullable().optional(),
      text: z.string().max(10_000).optional(),
      type: z.string().optional(),
    })
    .optional(),
  message: z
    .looseObject({
      usage: z.looseObject({ input_tokens: z.number().int().nonnegative() }).optional(),
    })
    .optional(),
  type: z.string(),
  usage: z.looseObject({ output_tokens: z.number().int().nonnegative() }).optional(),
});

export type AnthropicAdapterOptions = { apiKey: string; baseUrl?: string; fetch?: Fetch };

export function createAnthropicAdapter(options: AnthropicAdapterOptions): ModelProviderAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1";

  return {
    provider: "anthropic",
    async *stream(request: ModelRequest): AsyncGenerator<ModelStreamEvent> {
      const response = await postStream(fetchImpl, `${baseUrl}/messages`, {
        body: JSON.stringify({
          max_tokens: request.maxOutputTokens,
          messages: [{ content: request.prompt.user, role: "user" }],
          model: request.model,
          stream: true,
          system: [
            { text: request.prompt.system, type: "text" },
            { text: request.prompt.developer, type: "text" },
          ],
        }),
        headers: {
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "x-api-key": options.apiKey,
        },
        method: "POST",
        signal: request.signal,
      });

      let completed = false;
      let refused = false;
      let inputTokens = 0;
      let outputTokens = 0;
      let stopReason: string | null = null;
      for await (const value of readSseJson(response)) {
        const parsed = eventSchema.safeParse(value);
        if (!parsed.success) throw new ProviderError("invalid_response", false);
        const event = parsed.data;
        if (event.type === "message_start") {
          inputTokens = event.message?.usage?.input_tokens ?? 0;
        } else if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta" &&
          event.delta.text
        ) {
          yield { text: event.delta.text, type: "text-delta" };
        } else if (event.type === "message_delta") {
          outputTokens = event.usage?.output_tokens ?? outputTokens;
          stopReason = event.delta?.stop_reason ?? stopReason;
          if (stopReason === "refusal") {
            refused = true;
            yield { type: "refusal" };
          }
        } else if (event.type === "error") {
          throw new ProviderError("unavailable", true);
        } else if (event.type === "message_stop") {
          completed = refused || stopReason === "end_turn" || stopReason === "stop_sequence";
        }
      }
      if (!completed || (!refused && (inputTokens === 0 || outputTokens === 0))) {
        throw new ProviderError("invalid_response", false);
      }
      yield { type: "usage", usage: { inputTokens, outputTokens } };
      yield { type: "completed" };
    },
  };
}
