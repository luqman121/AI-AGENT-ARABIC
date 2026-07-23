import type { ModelProviderAdapter } from "@wakil/model-router";
import { describe, expect, it } from "vitest";

import { generateFileArtifact } from "./file-artifact.js";
import type { StaticSiteGenerationLimits } from "./static-site.js";

const limits: StaticSiteGenerationLimits = {
  deadlineMs: 5_000,
  inputCostMicrosPerMillionTokens: 1_000,
  maxAttempts: 1,
  maxCostMicros: 10_000,
  maxHtmlBytes: 20_000,
  maxOutputChars: 20_000,
  maxOutputTokens: 2_000,
  outputCostMicrosPerMillionTokens: 2_000,
};

function adapterFor(text: string): ModelProviderAdapter {
  return {
    provider: "openrouter",
    async *stream() {
      yield { type: "text-delta", text } as const;
      yield { type: "usage", usage: { inputTokens: 20, outputTokens: 50 } } as const;
      yield { type: "completed" } as const;
    },
  };
}

describe("native file artifact generation", () => {
  it("accepts JSON wrapped in a model Markdown fence", async () => {
    const result = await generateFileArtifact({
      adapter: adapterFor(
        '```json\n{"title":"تقرير","summary":"ملخص","sections":[{"heading":"النتائج","paragraphs":["نمو واضح"],"bullets":[]}]}\n```',
      ),
      isCancelled: async () => false,
      kind: "pdf",
      limits,
      model: "configured-model",
      reviewedPlan: "خطة مراجعة",
      userRequest: "أنشئ تقريرًا",
    });

    expect(result).toMatchObject({ ok: true });
  });

  it("accepts explanatory text around one valid JSON object", async () => {
    const result = await generateFileArtifact({
      adapter: adapterFor(
        'النتيجة:\n{"title":"مصنف","summary":"ملخص","sheets":[{"name":"المبيعات","headers":["الشهر","القيمة"],"rows":[["يناير",100]]}]}\nتم.',
      ),
      isCancelled: async () => false,
      kind: "spreadsheet",
      limits,
      model: "configured-model",
      reviewedPlan: "خطة مراجعة",
      userRequest: "أنشئ جدولًا",
    });

    expect(result).toMatchObject({ ok: true });
  });
});
