import type { DesignReview, ReviewFix, ReviewIssue } from "@wakil/skills";

/**
 * A deterministic, static-analysis Design Critic for generated website HTML.
 *
 * This is a real, testable, regex/text-based reviewer — it does not render
 * the page in a browser and therefore cannot see actual pixel overflow, real
 * computed contrast, or true text clipping. Where a check is a heuristic
 * proxy rather than a rendered-truth signal, the issue message says so.
 * Genuine rendered verification (screenshots, real overflow, real contrast)
 * is a separate concern — see the Playwright-based render check, which is
 * currently exercised at test time only (see project docs for the
 * limitation and rationale).
 *
 * Scoring: blocking issues always fail the review (matches the platform's
 * hard-blocker list); major/minor issues reduce the score but do not block.
 */

const GRADIENT_PATTERN = /linear-gradient\([^)]*\)/gi;
const PURPLE_TOKENS = /purple|violet|indigo|#7c3aed|#8b5cf6|#a855f7|#6d28d9|#4c1d95/i;
const BLUE_TOKENS = /\bblue\b|#3b82f6|#2563eb|#1d4ed8|#06b6d4|#0ea5e9/i;
const PLACEHOLDER_COPY = /lorem ipsum|اكتب هنا|نص تجريبي|عنوان رئيسي|وصف الخدمة|اسم الشركة/iu;

// Note: a trailing `\b` after an Arabic word never matches — Arabic letters
// are non-word characters (\W) to JS regex, so no \w/\W transition occurs at
// the boundary. These patterns rely only on leading `\b` (before ASCII terms)
// or no boundary at all (Arabic terms), never a trailing one after Arabic.
const FAKE_CLAIM_PATTERNS: RegExp[] = [
  /\d[\d,]{2,}\s*\+?\s*(عميل|عملاء|مستخدم|مستخدمين|customers?\b|users?\b)/iu,
  /(جائزة|award|أفضل شركة|رقم\s*1\b|#1\b|leading provider)/iu,
  /class="[^"]*testimonial[^"]*"|شهادة\s*عميل/iu,
];

function countMatches(pattern: RegExp, html: string): number {
  return html.match(pattern)?.length ?? 0;
}

function extractHtmlTag(html: string): string {
  return html.match(/<html\b[^>]*>/i)?.[0] ?? "";
}

function checkRtlStructure(html: string, issues: ReviewIssue[]): void {
  const htmlTag = extractHtmlTag(html);
  if (!/\blang=["']ar["']/i.test(htmlTag) || !/\bdir=["']rtl["']/i.test(htmlTag)) {
    issues.push({
      id: "rtl-structure",
      severity: "blocking",
      message: 'الوسم <html> لا يحدد lang="ar" و dir="rtl" معاً؛ بنية RTL غير مكتملة.',
      area: "rtl",
    });
  }
}

function checkHeadingHierarchy(html: string, issues: ReviewIssue[]): void {
  const h1Count = countMatches(/<h1\b/gi, html);
  if (h1Count === 0) {
    issues.push({
      id: "no-h1",
      severity: "major",
      message: "لا يوجد عنوان رئيسي h1؛ التسلسل الهرمي للمحتوى غير واضح.",
      area: "hierarchy",
    });
  } else if (h1Count > 1) {
    issues.push({
      id: "multiple-h1",
      severity: "minor",
      message: `عدد عناصر h1 (${h1Count}) أكثر من واحد؛ قد يضعف وضوح التسلسل الهرمي.`,
      area: "hierarchy",
    });
  }
}

function checkPrimaryAction(html: string, issues: ReviewIssue[]): void {
  const hasButton = /<button\b[^>]*>[^<]*\S[^<]*<\/button>/i.test(html);
  const hasActionLink = /<a\b[^>]*href=["'](?!#\s*["'])[^"']+["'][^>]*>[^<]*\S[^<]*<\/a>/i.test(
    html,
  );
  if (!hasButton && !hasActionLink) {
    issues.push({
      id: "no-primary-action",
      severity: "blocking",
      message: "لا يوجد عنصر إجراء رئيسي واضح (زر أو رابط فعّال) في الصفحة.",
      area: "primary-action",
    });
  }
}

function checkFakeClaims(html: string, issues: ReviewIssue[]): void {
  for (const pattern of FAKE_CLAIM_PATTERNS) {
    if (pattern.test(html)) {
      issues.push({
        id: "fabricated-claim",
        severity: "blocking",
        message: "الصفحة تحتوي على ما يبدو أنه ادعاء عمل ملفّق (أرقام عملاء، جوائز، أو شهادات).",
        area: "content-integrity",
      });
      return;
    }
  }
}

function checkArabicCopyQuality(html: string, issues: ReviewIssue[]): void {
  const visible = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (PLACEHOLDER_COPY.test(visible)) {
    issues.push({
      id: "placeholder-copy",
      severity: "blocking",
      message: "النص الظاهر يحتوي على عبارات مؤقتة أو نموذجية ويجب تحريره قبل التسليم.",
      area: "content-quality",
    });
  }
  const arabic = visible.match(/[\u0621-\u063A\u0641-\u064A]/gu)?.length ?? 0;
  const latin = visible.match(/[A-Za-z]/g)?.length ?? 0;
  if (visible.length < 250) {
    issues.push({
      id: "thin-visible-copy",
      severity: "major",
      message: "المحتوى الظاهر قصير جداً ولا يكفي لصفحة مكتملة ومقنعة.",
      area: "content-quality",
    });
  }
  if (arabic < 80 || arabic / Math.max(1, arabic + latin) < 0.3) {
    issues.push({
      id: "insufficient-arabic-copy",
      severity: "blocking",
      message: "النص العربي غير كافٍ أو تغلب عليه صياغة غير عربية؛ يلزم تحرير عربي طبيعي.",
      area: "content-quality",
    });
  }
}

function checkGradients(html: string, issues: ReviewIssue[]): void {
  const gradients = html.match(GRADIENT_PATTERN) ?? [];
  const hasPurpleBlue = gradients.some(
    (gradient) => PURPLE_TOKENS.test(gradient) && BLUE_TOKENS.test(gradient),
  );
  if (hasPurpleBlue) {
    issues.push({
      id: "purple-blue-gradient",
      severity: "major",
      message: "تدرّج بنفسجي إلى أزرق نمطي يوحي بقالب عام؛ اختر اتجاهاً بصرياً خاصاً بالمنتج.",
      area: "visual-identity",
    });
  }
}

function checkShadowUsage(html: string, issues: ReviewIssue[]): void {
  const shadowCount = countMatches(/box-shadow\s*:/gi, html);
  if (shadowCount > 8) {
    issues.push({
      id: "excessive-shadows",
      severity: "minor",
      message: `استخدام box-shadow متكرر (${shadowCount} مرة) قد يبدو غير مضبوط؛ استخدم الحدود وتباين السطح أولاً.`,
      area: "elevation",
    });
  }
}

function checkRepetitiveCards(html: string, issues: ReviewIssue[]): void {
  const classAttributes = html.match(/class="[^"]*"/gi) ?? [];
  const counts = new Map<string, number>();
  for (const attribute of classAttributes) {
    if (!/card|feature/i.test(attribute)) continue;
    counts.set(attribute, (counts.get(attribute) ?? 0) + 1);
  }
  const repeated = [...counts.values()].some((count) => count >= 3);
  if (repeated) {
    issues.push({
      id: "repetitive-card-pattern",
      severity: "minor",
      message: "نمط بطاقات متطابقة متكرر ثلاث مرات أو أكثر؛ قد يقرأ كقالب عام.",
      area: "layout-variety",
    });
  }
}

function checkAccessibility(html: string, issues: ReviewIssue[]): void {
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const missingAlt = images.filter((tag) => !/\balt\s*=/i.test(tag));
  if (missingAlt.length > 0) {
    issues.push({
      id: "images-missing-alt",
      severity: "major",
      message: `${missingAlt.length} صورة بلا نص بديل (alt)؛ يحجب الوصول لقارئات الشاشة.`,
      area: "accessibility",
    });
  }
  if (!/<title>[^<]{1,120}<\/title>/i.test(html)) {
    issues.push({
      id: "missing-title",
      severity: "blocking",
      message: "لا يوجد عنوان صفحة (title) صالح.",
      area: "accessibility",
    });
  }
  if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) {
    issues.push({
      id: "missing-viewport-meta",
      severity: "major",
      message: "لا يوجد meta viewport؛ خطر عرض غير متجاوب على الجوال.",
      area: "responsive",
    });
  }
  const hasInteractiveElement = /<(button|a|input|select|textarea)\b/i.test(html);
  if (hasInteractiveElement && !/:focus/i.test(html)) {
    issues.push({
      id: "missing-focus-state",
      severity: "minor",
      message:
        "لا توجد حالة تركيز (:focus) ظاهرة للعناصر التفاعلية؛ يضعف إمكانية الاستخدام بلوحة المفاتيح.",
      area: "accessibility",
    });
  }
}

/** Narrow, high-confidence proxy: identical inline color/background hex = unreadable text. */
function checkObviousContrastFailure(html: string, issues: ReviewIssue[]): void {
  const styleBlocks = html.match(/style="[^"]*"/gi) ?? [];
  for (const block of styleBlocks) {
    const color = block.match(/color:\s*(#[0-9a-f]{3,8}|white|black)/i)?.[1]?.toLowerCase();
    const background = block
      .match(/background(?:-color)?:\s*(#[0-9a-f]{3,8}|white|black)/i)?.[1]
      ?.toLowerCase();
    if (color && background && color === background) {
      issues.push({
        id: "text-background-collision",
        severity: "blocking",
        message: "لون النص يطابق لون الخلفية في أحد العناصر؛ تباين معدوم يمنع القراءة.",
        area: "contrast",
      });
      return;
    }
  }
}

/** Weak heuristic proxy for mobile overflow risk — real overflow requires rendering. */
function checkOversizedFixedWidths(html: string, issues: ReviewIssue[]): void {
  const matches = html.matchAll(/width:\s*(\d{3,5})px/gi);
  for (const match of matches) {
    const value = Number(match[1]);
    if (value > 480) {
      issues.push({
        id: "fixed-width-overflow-risk",
        severity: "minor",
        message: `عرض ثابت كبير (${value}px) قد يسبب تجاوزاً أفقياً على الجوال — يتطلب فحصاً بصرياً فعلياً للتأكيد.`,
        area: "mobile-layout",
      });
      return;
    }
  }
}

function scoreFor(issues: ReviewIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === "blocking") score -= 40;
    else if (issue.severity === "major") score -= 15;
    else score -= 5;
  }
  return Math.max(0, score);
}

function fixFor(issue: ReviewIssue): ReviewFix {
  return { issueId: issue.id, recommendation: issue.message };
}

/**
 * Reviews generated static-site HTML and returns a machine-readable
 * `DesignReview`. `passed` is false whenever any blocking issue is present —
 * matching the platform rule that a design must not pass with mobile
 * overflow risk, clipped/inaccessible core content, a broken primary action,
 * unreadable contrast, or fabricated business claims.
 */
export function reviewStaticSiteHtml(html: string): DesignReview {
  const issues: ReviewIssue[] = [];
  checkRtlStructure(html, issues);
  checkHeadingHierarchy(html, issues);
  checkPrimaryAction(html, issues);
  checkFakeClaims(html, issues);
  checkArabicCopyQuality(html, issues);
  checkGradients(html, issues);
  checkShadowUsage(html, issues);
  checkRepetitiveCards(html, issues);
  checkAccessibility(html, issues);
  checkObviousContrastFailure(html, issues);
  checkOversizedFixedWidths(html, issues);

  const blockingIssues = issues.filter((issue) => issue.severity === "blocking");
  const majorIssues = issues.filter((issue) => issue.severity === "major");
  const minorIssues = issues.filter((issue) => issue.severity === "minor");

  return {
    score: scoreFor(issues),
    blockingIssues,
    majorIssues,
    minorIssues,
    recommendedFixes: issues.map(fixFor),
    passed: blockingIssues.length === 0,
  };
}
