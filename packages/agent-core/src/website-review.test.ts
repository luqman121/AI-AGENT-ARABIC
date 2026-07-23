import { describe, expect, it } from "vitest";

import { reviewStaticSiteHtml } from "./website-review.js";

const GOOD_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>مقهى الديوانية</title>
<style>
  .btn:focus { outline: 2px solid #0ea5e9; }
</style>
</head>
<body>
  <h1>مقهى الديوانية</h1>
  <img src="data:image/png;base64,AAAA" alt="واجهة المقهى">
  <section><h2>قهوة تحضّر بعناية</h2><p>نقدّم تجربة هادئة تجمع بين جودة البن وحسن الضيافة، مع قائمة واضحة وخيارات تناسب الصباح ولقاءات المساء.</p></section>
  <section id="menu"><h2>القائمة</h2><p>اختر مشروبك المفضل واستمتع بنكهات متوازنة، وتحضير دقيق، وخدمة مباشرة تساعدك على الطلب بسهولة من الهاتف.</p></section>
  <a href="#menu" class="btn">اطلب الآن</a>
</body>
</html>`;

describe("reviewStaticSiteHtml — passing site", () => {
  it("passes a well-formed Arabic RTL site with a clear primary action", () => {
    const review = reviewStaticSiteHtml(GOOD_HTML);
    expect(review.passed).toBe(true);
    expect(review.blockingIssues).toHaveLength(0);
    expect(review.score).toBeGreaterThan(0);
  });
});

describe("reviewStaticSiteHtml — blocking issues", () => {
  it("blocks when RTL structure is missing", () => {
    const html = GOOD_HTML.replace('lang="ar" dir="rtl"', "");
    const review = reviewStaticSiteHtml(html);
    expect(review.passed).toBe(false);
    expect(review.blockingIssues.map((i) => i.id)).toContain("rtl-structure");
  });

  it("blocks when there is no primary action element", () => {
    const html = GOOD_HTML.replace('<a href="#menu" class="btn">اطلب الآن</a>', "");
    const review = reviewStaticSiteHtml(html);
    expect(review.passed).toBe(false);
    expect(review.blockingIssues.map((i) => i.id)).toContain("no-primary-action");
  });

  it("blocks when fabricated customer-count claims are present", () => {
    const html = GOOD_HTML.replace("</body>", "<p>أكثر من 5000 عميل يثقون بنا</p></body>");
    const review = reviewStaticSiteHtml(html);
    expect(review.passed).toBe(false);
    expect(review.blockingIssues.map((i) => i.id)).toContain("fabricated-claim");
  });

  it("blocks when a testimonial block is present", () => {
    const html = GOOD_HTML.replace(
      "</body>",
      '<div class="testimonial-card">"أفضل خدمة" - أحمد</div></body>',
    );
    const review = reviewStaticSiteHtml(html);
    expect(review.blockingIssues.map((i) => i.id)).toContain("fabricated-claim");
  });

  it("blocks on missing page title", () => {
    const html = GOOD_HTML.replace("<title>مقهى الديوانية</title>", "");
    const review = reviewStaticSiteHtml(html);
    expect(review.blockingIssues.map((i) => i.id)).toContain("missing-title");
  });

  it("blocks on text/background color collision", () => {
    const html = GOOD_HTML.replace(
      "</body>",
      '<p style="color:#ffffff; background-color:#ffffff;">نص غير مرئي</p></body>',
    );
    const review = reviewStaticSiteHtml(html);
    expect(review.blockingIssues.map((i) => i.id)).toContain("text-background-collision");
  });
});

describe("reviewStaticSiteHtml — non-blocking anti-patterns", () => {
  it("flags a purple-to-blue gradient as major but not blocking on its own", () => {
    const html = GOOD_HTML.replace(
      "</style>",
      ".hero { background: linear-gradient(90deg, #7c3aed, #2563eb); }\n</style>",
    );
    const review = reviewStaticSiteHtml(html);
    expect(review.majorIssues.map((i) => i.id)).toContain("purple-blue-gradient");
  });

  it("flags a repetitive card pattern", () => {
    const cards = Array.from({ length: 4 }, () => '<div class="feature-card">ميزة</div>').join("");
    const html = GOOD_HTML.replace("</body>", `${cards}</body>`);
    const review = reviewStaticSiteHtml(html);
    expect(review.minorIssues.map((i) => i.id)).toContain("repetitive-card-pattern");
  });

  it("flags images missing alt text", () => {
    const html = GOOD_HTML.replace(
      'alt="واجهة المقهى"',
      "", // strip alt entirely
    );
    const review = reviewStaticSiteHtml(html);
    expect(review.majorIssues.map((i) => i.id)).toContain("images-missing-alt");
  });

  it("flags a missing viewport meta tag", () => {
    const html = GOOD_HTML.replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      "",
    );
    const review = reviewStaticSiteHtml(html);
    expect(review.majorIssues.map((i) => i.id)).toContain("missing-viewport-meta");
  });

  it("flags an oversized fixed width as a mobile-overflow-risk heuristic", () => {
    const html = GOOD_HTML.replace("</style>", ".hero { width: 1200px; }\n</style>");
    const review = reviewStaticSiteHtml(html);
    expect(review.minorIssues.map((i) => i.id)).toContain("fixed-width-overflow-risk");
  });

  it("always includes a recommended fix for every reported issue", () => {
    const review = reviewStaticSiteHtml(GOOD_HTML.replace('lang="ar" dir="rtl"', ""));
    const issueIds = [...review.blockingIssues, ...review.majorIssues, ...review.minorIssues].map(
      (issue) => issue.id,
    );
    const fixIds = review.recommendedFixes.map((fix) => fix.issueId);
    for (const id of issueIds) expect(fixIds).toContain(id);
  });
});
