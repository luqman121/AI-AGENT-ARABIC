import type { ModelProviderAdapter } from "@wakil/model-router";
import { describe, expect, it } from "vitest";

import {
  generateFileArtifact,
  generateFileArtifactWithReview,
  reviewGeneratedFileDraft,
} from "./file-artifact.js";
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

  it("compiles the relevant PDF, RTL, and quality skills into the live file prompt", async () => {
    const result = await generateFileArtifact({
      adapter: adapterFor(
        '{"title":"تقرير عربي","summary":"ملخص مهني واضح","sections":[{"heading":"النتائج","paragraphs":["حقق المشروع نتائج قابلة للقياس."],"bullets":[]}]}',
      ),
      isCancelled: async () => false,
      kind: "pdf",
      limits,
      model: "configured-model",
      reviewedPlan: "خطة مراجعة",
      skillsRuntime: { enabled: true },
      userRequest: "أنشئ تقرير PDF عربي احترافي",
    });

    expect(result.ok).toBe(true);
    expect(result.skillsRuntime).toMatchObject({ enabled: true, fallbackUsed: false, used: true });
    expect(result.skillsRuntime.skillIds).toEqual(
      expect.arrayContaining(["pdf-studio", "arabic-rtl-ui", "artifact-quality-gate"]),
    );
  });

  it("runs a second editorial pass and gates the final Arabic draft", async () => {
    const outputs = [
      '{"title":"عنوان التقرير","summary":"ملخص قصير","sections":[{"heading":"النتائج","paragraphs":["نص تجريبي"],"bullets":[]}]}',
      '{"title":"تقرير أداء الحملات الإعلانية","summary":"مراجعة عملية توضح الأداء والفرص والخطوات التالية بلغة عربية مهنية واضحة.","sections":[{"heading":"النتائج الرئيسية","paragraphs":["أظهرت الحملة تحسنًا في جودة الزيارات، مع فرصة واضحة لتحسين صفحة الهبوط ورفع كفاءة الإنفاق دون اختلاق أرقام غير متاحة."],"bullets":["اختبار الرسالة الإعلانية","مراجعة تجربة الهاتف","قياس النتائج أسبوعيًا"]}]}',
    ];
    let calls = 0;
    const adapter: ModelProviderAdapter = {
      provider: "openrouter",
      async *stream() {
        const text = outputs[calls++] ?? outputs[1]!;
        yield { type: "text-delta", text } as const;
        yield { type: "usage", usage: { inputTokens: 20, outputTokens: 50 } } as const;
        yield { type: "completed" } as const;
      },
    };
    const result = await generateFileArtifactWithReview({
      adapter,
      isCancelled: async () => false,
      kind: "pdf",
      limits,
      model: "configured-model",
      qualityReview: { enabled: true, maxRepairAttempts: 1 },
      reviewedPlan: "خطة مراجعة",
      skillsRuntime: { enabled: true },
      userRequest: "أنشئ تقرير PDF عربي احترافي",
    });

    expect(calls).toBe(2);
    expect(result).toMatchObject({ ok: true, repairAttempts: 1 });
    expect(result.review).toMatchObject({ valid: true });
    if (result.ok) expect(result.usage.costMicros).toBeGreaterThan(0);
  });

  it("blocks placeholder copy in a supposedly final draft", () => {
    const review = reviewGeneratedFileDraft(
      "pdf",
      {
        title: "عنوان التقرير",
        summary: "ملخص قصير",
        sections: [{ heading: "القسم", paragraphs: ["نص تجريبي"], bullets: [] }],
      },
      true,
    );
    expect(review.valid).toBe(false);
    expect(review.blockingErrors.length).toBeGreaterThan(0);
  });
});
