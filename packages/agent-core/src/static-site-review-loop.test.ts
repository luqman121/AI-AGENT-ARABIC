import type { ModelProviderAdapter } from "@wakil/model-router";
import { describe, expect, it } from "vitest";

import { generateStaticSiteWithReview } from "./static-site-review-loop.js";
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

const GOOD_HTML =
  '<!doctype html><html lang="ar" dir="rtl"><head><meta name="viewport" content="width=device-width"><title>مقهى</title></head><body><h1>مقهى الديوانية</h1><section><h2>قهوة تحضّر بعناية</h2><p>نقدّم تجربة هادئة تجمع بين جودة البن وحسن الضيافة، مع قائمة واضحة وخيارات تناسب الصباح ولقاءات المساء.</p></section><section id="menu"><h2>القائمة</h2><p>اختر مشروبك المفضل واستمتع بنكهات متوازنة، وتحضير دقيق، وخدمة مباشرة تساعدك على الطلب بسهولة من الهاتف.</p></section><a href="#menu">اطلب الآن</a></body></html>';

// No primary-action element and no viewport meta — the critic will block this.
const BAD_HTML =
  '<!doctype html><html lang="ar" dir="rtl"><head><title>مقهى</title></head><body><h1>مقهى</h1><p>مرحباً</p></body></html>';

function scriptedAdapter(htmlSequence: string[]): ModelProviderAdapter {
  let call = 0;
  return {
    provider: "openrouter",
    async *stream() {
      const html = htmlSequence[Math.min(call, htmlSequence.length - 1)];
      call += 1;
      yield {
        type: "text-delta",
        text: JSON.stringify({ html, summary: "اكتمل الموقع." }),
      } as const;
      yield { type: "usage", usage: { inputTokens: 10, outputTokens: 20 } } as const;
      yield { type: "completed" } as const;
    },
  };
}

describe("generateStaticSiteWithReview — disabled review", () => {
  it("behaves exactly like generateStaticSite when designReview is not enabled", async () => {
    const result = await generateStaticSiteWithReview({
      adapter: scriptedAdapter([GOOD_HTML]),
      isCancelled: async () => false,
      limits,
      model: "configured-model",
      reviewedPlan: "خطة",
      userRequest: "موقع لمقهى",
    });
    expect(result.ok).toBe(true);
    expect(result.repairAttempts).toBe(0);
    expect(result.review).toBeUndefined();
  });
});

describe("generateStaticSiteWithReview — review enabled", () => {
  it("passes immediately when the first generation is already clean", async () => {
    const result = await generateStaticSiteWithReview({
      adapter: scriptedAdapter([GOOD_HTML]),
      designReview: { enabled: true },
      isCancelled: async () => false,
      limits,
      model: "configured-model",
      reviewedPlan: "خطة",
      userRequest: "موقع لمقهى",
    });
    expect(result.ok).toBe(true);
    expect(result.repairAttempts).toBe(0);
    expect(result.review?.passed).toBe(true);
  });

  it("repairs once and succeeds when the second generation fixes the blocking issues", async () => {
    const result = await generateStaticSiteWithReview({
      adapter: scriptedAdapter([BAD_HTML, GOOD_HTML]),
      designReview: { enabled: true, maxRepairAttempts: 2 },
      isCancelled: async () => false,
      limits,
      model: "configured-model",
      reviewedPlan: "خطة",
      userRequest: "موقع لمقهى",
    });
    expect(result.ok).toBe(true);
    expect(result.repairAttempts).toBe(1);
    expect(result.review?.passed).toBe(true);
    if (result.ok) expect(result.html).toContain("اطلب الآن");
  });

  it("caps repair attempts at the configured maximum and reports failure honestly", async () => {
    const result = await generateStaticSiteWithReview({
      adapter: scriptedAdapter([BAD_HTML]), // always bad — never passes
      designReview: { enabled: true, maxRepairAttempts: 2 },
      isCancelled: async () => false,
      limits,
      model: "configured-model",
      reviewedPlan: "خطة",
      userRequest: "موقع لمقهى",
    });
    expect(result.repairAttempts).toBe(2);
    expect(result.review?.passed).toBe(false);
    // Generation itself still "succeeded" (HTML exists) — the review is what
    // marks it as not ready; the caller must not treat ok:true alone as done.
    expect(result.ok).toBe(true);
  });

  it("never exceeds a hard cap of two repair passes even if configured higher", async () => {
    const result = await generateStaticSiteWithReview({
      adapter: scriptedAdapter([BAD_HTML]),
      designReview: { enabled: true, maxRepairAttempts: 10 },
      isCancelled: async () => false,
      limits,
      model: "configured-model",
      reviewedPlan: "خطة",
      userRequest: "موقع لمقهى",
    });
    expect(result.repairAttempts).toBeLessThanOrEqual(2);
  });

  it("does not attempt review when the initial generation itself fails", async () => {
    const refusingAdapter: ModelProviderAdapter = {
      provider: "openrouter",
      async *stream() {
        yield { type: "refusal" } as const;
      },
    };
    const result = await generateStaticSiteWithReview({
      adapter: refusingAdapter,
      designReview: { enabled: true },
      isCancelled: async () => false,
      limits,
      model: "configured-model",
      reviewedPlan: "خطة",
      userRequest: "موقع لمقهى",
    });
    expect(result.ok).toBe(false);
    expect(result.repairAttempts).toBe(0);
    expect(result.review).toBeUndefined();
  });
});
