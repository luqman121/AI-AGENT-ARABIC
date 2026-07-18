import { describe, expect, it } from "vitest";

import {
  buildStaticSitePrompt,
  staticSiteDraftSchema,
  validateAndSecureStaticSite,
} from "./static-site.js";

const safeHtml = `<!doctype html><html lang="ar" dir="rtl"><head><title>مقهى مسقط</title><style>body{color:#fff}</style></head><body><h1>أهلاً بكم</h1></body></html>`;

describe("static site skill", () => {
  it("keeps prompt layers separate and secures a valid Arabic document", () => {
    const prompt = buildStaticSitePrompt({ reviewedPlan: "١. تصميم الصفحة", userRequest: "مقهى" });
    expect(prompt.system).not.toContain("مقهى");
    expect(prompt.user).toContain("reviewedPlan");
    const draft = staticSiteDraftSchema.parse({ html: safeHtml, summary: "اكتمل الموقع." });
    const result = validateAndSecureStaticSite(draft, 20_000);
    expect(result.html).toContain("Content-Security-Policy");
    expect(result.html).toContain("connect-src 'none'");
  });

  it.each([
    ["remote URL", safeHtml.replace("</body>", '<img src="https://example.com/a.png"></body>')],
    ["form", safeHtml.replace("</body>", "<form></form></body>")],
    [
      "provider CSP",
      safeHtml.replace("<head>", '<head><meta http-equiv="Content-Security-Policy">'),
    ],
  ])("rejects %s", (_label, html) => {
    const draft = staticSiteDraftSchema.parse({ html, summary: "ملخص" });
    expect(() => validateAndSecureStaticSite(draft, 20_000)).toThrow("Invalid static site");
  });
});
