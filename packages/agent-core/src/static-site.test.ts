import type { ModelProviderAdapter } from "@wakil/model-router";
import { describe, expect, it } from "vitest";

import { generateStaticSite, type StaticSiteGenerationLimits } from "./static-site.js";

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

describe("static website generation", () => {
  it("validates and secures model output", async () => {
    const output = JSON.stringify({
      html: '<!doctype html><html lang="ar" dir="rtl"><head><title>مقهى</title></head><body>أهلاً بكم في مسقط</body></html>',
      summary: "اكتمل الموقع.",
    });
    const adapter: ModelProviderAdapter = {
      provider: "openrouter",
      async *stream() {
        yield { type: "text-delta", text: output } as const;
        yield { type: "usage", usage: { inputTokens: 20, outputTokens: 50 } } as const;
        yield { type: "completed" } as const;
      },
    };
    const result = await generateStaticSite({
      adapter,
      isCancelled: async () => false,
      limits,
      model: "configured-model",
      reviewedPlan: "١. تصميم الصفحة\n٢. التحقق",
      userRequest: "موقع لمقهى",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain("Content-Security-Policy");
      expect(result.usage.costMicros).toBeGreaterThan(0);
    }
  });

  it("rejects remote generated dependencies", async () => {
    const adapter: ModelProviderAdapter = {
      provider: "openrouter",
      async *stream() {
        yield {
          type: "text-delta",
          text: JSON.stringify({
            html: '<!doctype html><html lang="ar" dir="rtl"><head><title>موقع</title></head><body>مرحباً<img src="https://example.com/a.png"></body></html>',
            summary: "اكتمل",
          }),
        } as const;
        yield { type: "usage", usage: { inputTokens: 1, outputTokens: 1 } } as const;
        yield { type: "completed" } as const;
      },
    };
    await expect(
      generateStaticSite({
        adapter,
        isCancelled: async () => false,
        limits,
        model: "configured-model",
        reviewedPlan: "خطة",
        userRequest: "طلب",
      }),
    ).resolves.toMatchObject({ code: "invalid_response", ok: false });
  });
});
