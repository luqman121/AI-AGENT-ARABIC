import { ProviderError, type ModelProviderAdapter, type ModelUsage } from "@wakil/model-router";
import {
  buildFileArtifactPrompt,
  compileSkillsAddendum,
  fileArtifactSchema,
  type ArtifactValidationResult,
  type DocumentDraft,
  type FileArtifactKind,
  type PresentationDraft,
  type SpreadsheetDraft,
} from "@wakil/skills";

import type { PlanningFailureCode } from "./planner.js";
import type { StaticSiteGenerationLimits } from "./static-site.js";
import type { SkillsRuntimeOption, SkillsRuntimeRunInfo } from "./static-site.js";

export type GeneratedFileDraft = DocumentDraft | SpreadsheetDraft | PresentationDraft;

export type FileArtifactGenerationResult =
  | {
      attempts: number;
      draft: GeneratedFileDraft;
      ok: true;
      skillsRuntime: SkillsRuntimeRunInfo;
      usage: ModelUsage & { costMicros: number };
    }
  | {
      attempts: number;
      code: PlanningFailureCode;
      ok: false;
      skillsRuntime: SkillsRuntimeRunInfo;
    };

export type FileArtifactGenerationInput = {
  adapter: ModelProviderAdapter;
  isCancelled: () => Promise<boolean>;
  kind: FileArtifactKind;
  limits: StaticSiteGenerationLimits;
  model: string;
  qualityReviewDraft?: GeneratedFileDraft;
  qualityReviewNotes?: string[];
  reviewedPlan: string;
  sleep?: (milliseconds: number) => Promise<void>;
  sourceContext?: string;
  skillsRuntime?: SkillsRuntimeOption;
  userRequest: string;
};

export type FileArtifactReviewOption = {
  enabled: boolean;
  maxRepairAttempts?: number;
};

export type FileArtifactWithReviewInput = FileArtifactGenerationInput & {
  qualityReview?: FileArtifactReviewOption;
};

export type FileArtifactWithReviewResult = FileArtifactGenerationResult & {
  repairAttempts: number;
  review?: ArtifactValidationResult;
};

const SKILLS_RUNTIME_DISABLED: SkillsRuntimeRunInfo = {
  enabled: false,
  fallbackUsed: false,
  used: false,
};

function applySkillsRuntime(
  developer: string,
  input: FileArtifactGenerationInput,
): { developer: string; skillsRuntime: SkillsRuntimeRunInfo } {
  const option = input.skillsRuntime;
  if (!option?.enabled) return { developer, skillsRuntime: SKILLS_RUNTIME_DISABLED };
  try {
    const compile = option.compile ?? compileSkillsAddendum;
    const addendum = compile({
      artifactType: input.kind,
      mode: input.sourceContext ? "analyze" : "create",
      requestText: input.userRequest,
      ...(option.maxPromptTokens !== undefined ? { maxPromptTokens: option.maxPromptTokens } : {}),
    });
    return {
      developer: addendum.block ? `${developer}\n\n${addendum.block}` : developer,
      skillsRuntime: {
        artifactType: addendum.metadata.artifactType,
        enabled: true,
        estimatedInstructionTokens: addendum.metadata.estimatedTokens,
        fallbackUsed: false,
        locale: addendum.metadata.locale,
        promptVersion: addendum.metadata.promptVersion,
        rtl: addendum.metadata.rtl,
        skillIds: addendum.metadata.skillIds,
        skillVersions: addendum.metadata.skillVersions,
        skipped: addendum.routed.skipped,
        used: true,
        validationProfile: addendum.metadata.validationProfile,
      },
    };
  } catch {
    return {
      developer,
      skillsRuntime: { enabled: true, fallbackUsed: true, used: false },
    };
  }
}

function costMicros(usage: ModelUsage, limits: StaticSiteGenerationLimits): number {
  if (usage.costMicros !== undefined) return usage.costMicros;
  return Math.ceil(
    (usage.inputTokens * limits.inputCostMicrosPerMillionTokens +
      usage.outputTokens * limits.outputCostMicrosPerMillionTokens) /
      1_000_000,
  );
}

function providerFailure(error: ProviderError): PlanningFailureCode {
  if (error.code === "authentication") return "provider_authentication";
  if (error.code === "rate_limited") return "provider_rate_limited";
  if (error.code === "timeout") return "timeout";
  if (error.code === "invalid_request" || error.code === "invalid_response") {
    return "invalid_response";
  }
  return "provider_unavailable";
}

function parseJsonResponse(content: string): unknown {
  const trimmed = content.trim().replace(/^\uFEFF/, "");
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("model response does not contain JSON");
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

export async function generateFileArtifact(
  input: FileArtifactGenerationInput,
): Promise<FileArtifactGenerationResult> {
  const basePrompt = buildFileArtifactPrompt(input);
  const { developer, skillsRuntime } = applySkillsRuntime(basePrompt.developer, input);
  const prompt = { ...basePrompt, developer };
  const fail = (attempts: number, code: PlanningFailureCode): FileArtifactGenerationResult => ({
    attempts,
    code,
    ok: false,
    skillsRuntime,
  });
  const promptBytes = Buffer.byteLength(
    `${prompt.system}${prompt.developer}${prompt.user}`,
    "utf8",
  );
  const preflightCost = Math.ceil(
    (promptBytes * input.limits.inputCostMicrosPerMillionTokens +
      input.limits.maxOutputTokens * input.limits.outputCostMicrosPerMillionTokens) /
      1_000_000,
  );
  if (preflightCost > input.limits.maxCostMicros) {
    return fail(0, "limit_exceeded");
  }
  const sleep =
    input.sleep ??
    ((milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 1; attempt <= input.limits.maxAttempts; attempt += 1) {
    if (await input.isCancelled()) return fail(attempt - 1, "cancelled");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.limits.deadlineMs);
    let content = "";
    let completed = false;
    let refused = false;
    let usage: ModelUsage = { inputTokens: 0, outputTokens: 0 };

    try {
      for await (const event of input.adapter.stream({
        maxOutputTokens: input.limits.maxOutputTokens,
        model: input.model,
        prompt,
        signal: controller.signal,
      })) {
        if (await input.isCancelled()) {
          controller.abort();
          return fail(attempt, "cancelled");
        }
        if (event.type === "text-delta") {
          content += event.text;
          if (content.length > input.limits.maxOutputChars) {
            controller.abort();
            return fail(attempt, "limit_exceeded");
          }
        } else if (event.type === "usage") usage = event.usage;
        else if (event.type === "refusal") refused = true;
        else if (event.type === "completed") completed = true;
      }

      if (refused) return fail(attempt, "refused");
      if (!completed) {
        if (attempt < input.limits.maxAttempts) {
          await sleep(100 * 2 ** (attempt - 1));
          continue;
        }
        return fail(attempt, "invalid_response");
      }
      let json: unknown;
      try {
        json = parseJsonResponse(content);
      } catch {
        if (attempt < input.limits.maxAttempts) {
          await sleep(100 * 2 ** (attempt - 1));
          continue;
        }
        return fail(attempt, "invalid_response");
      }
      const parsed = fileArtifactSchema(input.kind).safeParse(json);
      if (!parsed.success) {
        if (attempt < input.limits.maxAttempts) {
          await sleep(100 * 2 ** (attempt - 1));
          continue;
        }
        return fail(attempt, "invalid_response");
      }
      const calculatedCost = costMicros(usage, input.limits);
      if (
        usage.outputTokens > input.limits.maxOutputTokens ||
        calculatedCost > input.limits.maxCostMicros
      ) {
        return fail(attempt, "limit_exceeded");
      }
      return {
        attempts: attempt,
        draft: parsed.data,
        ok: true,
        skillsRuntime,
        usage: { ...usage, costMicros: calculatedCost },
      };
    } catch (error) {
      const providerError =
        error instanceof ProviderError
          ? error
          : new ProviderError(controller.signal.aborted ? "timeout" : "unavailable", true);
      if (!providerError.retryable || content.length > 0 || attempt >= input.limits.maxAttempts) {
        return fail(attempt, providerFailure(providerError));
      }
      await sleep(100 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timeout);
    }
  }
  return fail(input.limits.maxAttempts, "provider_unavailable");
}

const ARABIC_LETTER = /[\u0621-\u063A\u0641-\u064A]/gu;
const LATIN_LETTER = /[A-Za-z]/g;
const PLACEHOLDER_TEXT =
  /lorem ipsum|(?:اكتب|أدخل|ادخل|ضع|أضف|اضف)[^\n.،؛]{0,50}هنا|نص تجريبي|عنوان (?:رئيسي|القسم|التقرير|المستند|العرض)|ملخص قصير/iu;

function draftText(kind: FileArtifactKind, draft: GeneratedFileDraft): string[] {
  if (kind === "spreadsheet") {
    const data = draft as SpreadsheetDraft;
    return [
      data.title,
      data.summary,
      ...data.sheets.flatMap((sheet) => [
        sheet.name,
        ...sheet.headers,
        ...sheet.rows.flatMap((row) =>
          row.filter((cell): cell is string => typeof cell === "string"),
        ),
      ]),
    ];
  }
  if (kind === "presentation") {
    const data = draft as PresentationDraft;
    return [
      data.title,
      data.summary,
      ...data.slides.flatMap((slide) => [
        slide.title,
        slide.subtitle ?? "",
        ...slide.bullets,
        slide.speakerNotes ?? "",
      ]),
    ];
  }
  const data = draft as DocumentDraft;
  return [
    data.title,
    data.summary,
    ...data.sections.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
      ...section.bullets,
    ]),
  ];
}

/** Deterministic final guard after the model's independent editorial pass. */
export function reviewGeneratedFileDraft(
  kind: FileArtifactKind,
  draft: GeneratedFileDraft,
  expectArabic: boolean,
): ArtifactValidationResult {
  const values = draftText(kind, draft)
    .map((value) => value.trim())
    .filter(Boolean);
  const text = values.join("\n");
  const blockingErrors: string[] = [];
  const warnings: string[] = [];
  if (PLACEHOLDER_TEXT.test(text))
    blockingErrors.push("المحتوى يحتوي على نص مؤقت أو حقول نموذجية.");
  if (expectArabic) {
    const arabic = text.match(ARABIC_LETTER)?.length ?? 0;
    const latin = text.match(LATIN_LETTER)?.length ?? 0;
    if (arabic < 40 || arabic / Math.max(1, arabic + latin) < 0.3) {
      blockingErrors.push("المحتوى العربي غير كافٍ أو يغلب عليه نص غير عربي.");
    }
  }
  const normalized = values
    .filter((value) => value.length >= 20)
    .map((value) => value.replace(/\s+/g, " ").toLocaleLowerCase("ar"));
  if (new Set(normalized).size < normalized.length) warnings.push("يوجد تكرار نصي يحتاج مراجعة.");
  if (kind === "presentation") {
    const slides = (draft as PresentationDraft).slides;
    if (slides.slice(1).some((slide) => slide.bullets.length === 0 && !slide.subtitle)) {
      blockingErrors.push("إحدى شرائح المحتوى بلا رسالة أو نقاط واضحة.");
    }
    if (slides.some((slide) => slide.bullets.length > 6)) {
      warnings.push("إحدى الشرائح مزدحمة بأكثر من ست نقاط.");
    }
  }
  if (kind === "spreadsheet") {
    const sheets = (draft as SpreadsheetDraft).sheets;
    if (sheets.some((sheet) => sheet.rows.some((row) => row.length !== sheet.headers.length))) {
      warnings.push("بعض صفوف الجدول لا تطابق عدد الأعمدة وسيتم ضبطها أثناء التوليد.");
    }
  }
  const penalty = blockingErrors.length * 45 + warnings.length * 8;
  return {
    artifactType: kind,
    blockingErrors,
    metadata: { expectArabic, textCharacters: text.length },
    repairAttempts: 1,
    repaired: true,
    score: Math.max(0, 100 - penalty),
    valid: blockingErrors.length === 0,
    warnings,
  };
}

/**
 * Two-stage file creation: authoring followed by one bounded, independent
 * editorial pass. The second call receives the first structured draft and
 * must return the same strict schema; deterministic checks gate completion.
 */
export async function generateFileArtifactWithReview(
  input: FileArtifactWithReviewInput,
): Promise<FileArtifactWithReviewResult> {
  const initial = await generateFileArtifact(input);
  if (!initial.ok || !input.qualityReview?.enabled) {
    return { ...initial, repairAttempts: 0 };
  }
  const expectArabic = /[\u0600-\u06ff]/u.test(input.userRequest);
  const initialReview = reviewGeneratedFileDraft(input.kind, initial.draft, expectArabic);
  const maxRepairAttempts = Math.max(0, Math.min(1, input.qualityReview.maxRepairAttempts ?? 1));
  if (maxRepairAttempts === 0) return { ...initial, repairAttempts: 0, review: initialReview };

  const remainingCost = input.limits.maxCostMicros - initial.usage.costMicros;
  if (remainingCost <= 0) {
    return {
      attempts: initial.attempts,
      code: "limit_exceeded",
      ok: false,
      repairAttempts: 0,
      review: initialReview,
      skillsRuntime: initial.skillsRuntime,
    };
  }
  const reviewed = await generateFileArtifact({
    ...input,
    limits: { ...input.limits, maxCostMicros: remainingCost },
    qualityReviewDraft: initial.draft,
    qualityReviewNotes: [
      "دقّق سلامة العربية والأسلوب وعلامات الترقيم قبل إعادة JSON.",
      "اجعل الصياغة طبيعية ومهنية ومباشرة، لا ترجمة حرفية ولا حشواً متكرراً.",
      "لا تغيّر الحقائق أو الأرقام ولا تضف ادعاءات غير موجودة في الطلب أو المصدر.",
      ...initialReview.blockingErrors,
      ...initialReview.warnings,
    ],
  });
  if (!reviewed.ok) {
    return {
      ...reviewed,
      attempts: initial.attempts + reviewed.attempts,
      repairAttempts: 1,
      review: initialReview,
    };
  }
  const review = reviewGeneratedFileDraft(input.kind, reviewed.draft, expectArabic);
  return {
    ...reviewed,
    attempts: initial.attempts + reviewed.attempts,
    repairAttempts: 1,
    review,
    usage: {
      ...reviewed.usage,
      costMicros: initial.usage.costMicros + reviewed.usage.costMicros,
      inputTokens: initial.usage.inputTokens + reviewed.usage.inputTokens,
      outputTokens: initial.usage.outputTokens + reviewed.usage.outputTokens,
    },
  };
}
