import { z } from "zod";

import { postStream, readSseJson, type Fetch } from "../http.js";
import {
  ProviderError,
  type ModelProviderAdapter,
  type ModelRequest,
  type ModelStreamEvent,
} from "../types.js";

const chunkSchema = z.looseObject({
  candidates: z
    .array(
      z.looseObject({
        content: z
          .looseObject({
            parts: z.array(z.looseObject({ text: z.string().max(10_000).optional() })).optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.looseObject({ blockReason: z.string().optional() }).optional(),
  usageMetadata: z
    .looseObject({
      candidatesTokenCount: z.number().int().nonnegative().optional(),
      promptTokenCount: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type GoogleAdapterOptions = { apiKey: string; baseUrl?: string; fetch?: Fetch };

export function createGoogleAdapter(options: GoogleAdapterOptions): ModelProviderAdapter {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";

  return {
    provider: "google",
    async *stream(request: ModelRequest): AsyncGenerator<ModelStreamEvent> {
      const model = encodeURIComponent(request.model);
      const response = await postStream(
        fetchImpl,
        `${baseUrl}/models/${model}:streamGenerateContent?alt=sse`,
        {
          body: JSON.stringify({
            contents: [{ parts: [{ text: request.prompt.user }], role: "user" }],
            generationConfig: { maxOutputTokens: request.maxOutputTokens },
            systemInstruction: {
              parts: [{ text: request.prompt.system }, { text: request.prompt.developer }],
            },
          }),
          headers: { "Content-Type": "application/json", "x-goog-api-key": options.apiKey },
          method: "POST",
          signal: request.signal,
        },
      );

      let completed = false;
      let gotUsage = false;
      let refused = false;
      let inputTokens = 0;
      let outputTokens = 0;
      for await (const value of readSseJson(response)) {
        const parsed = chunkSchema.safeParse(value);
        if (!parsed.success) throw new ProviderError("invalid_response", false);
        const chunk = parsed.data;
        if (chunk.promptFeedback?.blockReason) {
          refused = true;
          completed = true;
          yield { type: "refusal" };
        }
        for (const candidate of chunk.candidates ?? []) {
          for (const part of candidate.content?.parts ?? []) {
            if (part.text) yield { text: part.text, type: "text-delta" };
          }
          if (candidate.finishReason === "STOP") completed = true;
          if (
            ["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(candidate.finishReason ?? "")
          ) {
            refused = true;
            completed = true;
            yield { type: "refusal" };
          }
        }
        if (chunk.usageMetadata) gotUsage = true;
        inputTokens = chunk.usageMetadata?.promptTokenCount ?? inputTokens;
        outputTokens = chunk.usageMetadata?.candidatesTokenCount ?? outputTokens;
      }
      if (!completed || (!refused && !gotUsage)) {
        throw new ProviderError("invalid_response", false);
      }
      yield { type: "usage", usage: { inputTokens, outputTokens } };
      yield { type: "completed" };
    },
  };
}
