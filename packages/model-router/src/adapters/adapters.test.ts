import { buildPlanningPrompt } from "@wakil/skills";
import { describe, expect, it } from "vitest";

import { createAnthropicAdapter } from "./anthropic.js";
import { createGoogleAdapter } from "./google.js";
import { createOpenAiAdapter } from "./openai.js";
import { createOpenRouterAdapter } from "./openrouter.js";
import type { Fetch } from "../http.js";
import type { ModelProviderAdapter, ModelStreamEvent } from "../types.js";

function sse(values: readonly unknown[]): Response {
  return new Response(
    values.map((value) => `data: ${JSON.stringify(value)}\n\n`).join("") + "data: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

async function collect(adapter: ModelProviderAdapter): Promise<ModelStreamEvent[]> {
  const events: ModelStreamEvent[] = [];
  for await (const event of adapter.stream({
    maxOutputTokens: 100,
    model: "configured-model",
    prompt: buildPlanningPrompt("أنشئ خطة"),
    signal: new AbortController().signal,
  })) {
    events.push(event);
  }
  return events;
}

describe("provider adapters", () => {
  it("normalizes OpenRouter deltas and cost usage", async () => {
    const fetchImpl: Fetch = async () =>
      sse([
        { choices: [{ delta: { content: "خطة" }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: "stop" }] },
        { choices: [], usage: { completion_tokens: 2, cost: 0.00001, prompt_tokens: 3 } },
      ]);
    await expect(
      collect(createOpenRouterAdapter({ apiKey: "test-key", fetch: fetchImpl })),
    ).resolves.toEqual([
      { text: "خطة", type: "text-delta" },
      { type: "usage", usage: { costMicros: 10, inputTokens: 3, outputTokens: 2 } },
      { type: "completed" },
    ]);
  });

  it("normalizes OpenAI Responses API events", async () => {
    const fetchImpl: Fetch = async () =>
      sse([
        { delta: "خطة", type: "response.output_text.delta" },
        {
          response: {
            status: "completed",
            usage: { input_tokens: 4, output_tokens: 2 },
          },
          type: "response.completed",
        },
      ]);
    await expect(
      collect(createOpenAiAdapter({ apiKey: "test-key", fetch: fetchImpl })),
    ).resolves.toEqual([
      { text: "خطة", type: "text-delta" },
      { type: "usage", usage: { inputTokens: 4, outputTokens: 2 } },
      { type: "completed" },
    ]);
  });

  it("normalizes Anthropic message events", async () => {
    const fetchImpl: Fetch = async () =>
      sse([
        { message: { usage: { input_tokens: 5 } }, type: "message_start" },
        {
          delta: { text: "خطة", type: "text_delta" },
          type: "content_block_delta",
        },
        { delta: { stop_reason: "end_turn" }, type: "message_delta", usage: { output_tokens: 2 } },
        { type: "message_stop" },
      ]);
    await expect(
      collect(createAnthropicAdapter({ apiKey: "test-key", fetch: fetchImpl })),
    ).resolves.toEqual([
      { text: "خطة", type: "text-delta" },
      { type: "usage", usage: { inputTokens: 5, outputTokens: 2 } },
      { type: "completed" },
    ]);
  });

  it("normalizes Google Gemini stream chunks", async () => {
    const fetchImpl: Fetch = async () =>
      sse([
        {
          candidates: [{ content: { parts: [{ text: "خطة" }] }, finishReason: "STOP" }],
          usageMetadata: { candidatesTokenCount: 2, promptTokenCount: 6 },
        },
      ]);
    await expect(
      collect(createGoogleAdapter({ apiKey: "test-key", fetch: fetchImpl })),
    ).resolves.toEqual([
      { text: "خطة", type: "text-delta" },
      { type: "usage", usage: { inputTokens: 6, outputTokens: 2 } },
      { type: "completed" },
    ]);
  });

  it("rejects malformed provider events without exposing response content", async () => {
    const fetchImpl: Fetch = async () => sse([{ unexpected: "private response" }]);
    await expect(
      collect(createOpenAiAdapter({ apiKey: "test-key", fetch: fetchImpl })),
    ).rejects.toMatchObject({
      code: "invalid_response",
      message: "Model provider error: invalid_response",
    });
  });
});
