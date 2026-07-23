import { getSkill, RUNTIME_SKILLS } from "./registry.js";
import { isExecutableSkill } from "./security.js";
import { estimateTokens } from "./tokens.js";
import type {
  ArtifactType,
  RequestMode,
  RouterInput,
  RoutedSkills,
  RuntimeSkill,
} from "./types.js";

/* ================================================================== *
 * Inference helpers (deterministic; model classification is not needed
 * for the coarse decisions the router makes)
 * ================================================================== */

const ARABIC_RANGE = /[؀-ۿ]/u;

function inferLanguage(input: RouterInput): string {
  if (input.language) return input.language;
  return ARABIC_RANGE.test(input.requestText) ? "ar" : "en";
}

const READING_VERBS =
  /\b(read|analyz|summari|extract|review)\w*\b|اقرأ|حلّ?ل|لخّ?ص|استخرج|راجع|تلخيص|تحليل/iu;

const MIME_TO_ARTIFACT: Record<string, ArtifactType> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "spreadsheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "presentation",
  "text/csv": "spreadsheet",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
};

const EXTENSION_TO_ARTIFACT: Record<string, ArtifactType> = {
  pdf: "pdf",
  docx: "document",
  doc: "document",
  xlsx: "spreadsheet",
  xls: "spreadsheet",
  csv: "spreadsheet",
  pptx: "presentation",
  ppt: "presentation",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
};

function firstUploadArtifact(input: RouterInput): ArtifactType | undefined {
  for (const mime of input.uploadedMimeTypes ?? []) {
    const hit = MIME_TO_ARTIFACT[mime.trim().toLowerCase()];
    if (hit) return hit;
  }
  for (const name of input.uploadedFileNames ?? []) {
    const ext = name.split(".").pop()?.trim().toLowerCase();
    if (ext && EXTENSION_TO_ARTIFACT[ext]) return EXTENSION_TO_ARTIFACT[ext];
  }
  return undefined;
}

function inferMode(input: RouterInput): RequestMode {
  if (input.mode) return input.mode;
  const hasUpload =
    (input.uploadedMimeTypes?.length ?? 0) > 0 || (input.uploadedFileNames?.length ?? 0) > 0;
  if (hasUpload && READING_VERBS.test(input.requestText)) return "read";
  if (/\bconvert\b|حوّ?ل|تحويل/iu.test(input.requestText) && hasUpload) return "convert";
  return "create";
}

const KEYWORD_ARTIFACT: { type: ArtifactType; pattern: RegExp }[] = [
  {
    type: "presentation",
    pattern: /powerpoint|pptx|presentation|deck|slides|عرض تقديمي|شرائح|بوربوينت/iu,
  },
  { type: "spreadsheet", pattern: /excel|xlsx|spreadsheet|worksheet|جدول|اكسل|ميزانية|budget/iu },
  { type: "pdf", pattern: /\bpdf\b|بي ?دي ?اف/iu },
  { type: "document", pattern: /\bword\b|docx|خطاب|وثيقة|اتفاقية|عقد|مذكّ?رة/iu },
  { type: "web_app", pattern: /web app|dashboard|application|تطبيق|لوحة تحكم/iu },
  { type: "static_site", pattern: /website|landing|\bsite\b|\bpage\b|موقع|صفحة|هبوط/iu },
  { type: "image", pattern: /\bimage\b|\blogo\b|صورة|شعار|رسم/iu },
];

function inferArtifactType(input: RouterInput, mode: RequestMode): ArtifactType {
  if (input.artifactType) return input.artifactType;
  if (mode === "read" || mode === "analyze" || mode === "convert") {
    return firstUploadArtifact(input) ?? "other";
  }
  const upload = firstUploadArtifact(input);
  if (upload && mode !== "create") return upload;
  for (const { type, pattern } of KEYWORD_ARTIFACT) {
    if (pattern.test(input.requestText)) return type;
  }
  // Creation fallback matches the platform's default output kind.
  return "static_site";
}

function requiresVisualDesign(input: RouterInput, artifactType: ArtifactType): boolean {
  if (input.requiresVisualDesign !== undefined) return input.requiresVisualDesign;
  return (
    artifactType === "static_site" ||
    artifactType === "web_app" ||
    artifactType === "presentation" ||
    artifactType === "pdf"
  );
}

/* ================================================================== *
 * Category → skill-id selection
 * ================================================================== */

function selectSkillIds(params: {
  artifactType: ArtifactType;
  mode: RequestMode;
  rtl: boolean;
  visualDesign: boolean;
}): string[] {
  const { artifactType, mode, rtl, visualDesign } = params;
  const ids = new Set<string>();

  // Reading/analyzing an uploaded source is often followed by creation of a
  // polished output artifact. Keep the reader skill and continue selecting
  // the destination-kind studio + quality gate instead of dropping them.
  if (mode === "read" || mode === "analyze") ids.add("document-reader");

  switch (artifactType) {
    case "static_site":
    case "web_app": {
      ids.add("website-design");
      ids.add("design-system-generator");
      if (visualDesign) ids.add("premium-depth-shadow");
      ids.add("design-critic");
      ids.add("website-quality-gate");
      break;
    }
    case "pdf": {
      ids.add("pdf-studio");
      ids.add("artifact-quality-gate");
      break;
    }
    case "spreadsheet": {
      ids.add("spreadsheet-studio");
      ids.add("artifact-quality-gate");
      break;
    }
    case "document": {
      ids.add("document-studio");
      ids.add("artifact-quality-gate");
      break;
    }
    case "presentation": {
      ids.add("presentation-studio");
      ids.add("artifact-quality-gate");
      break;
    }
    default: {
      ids.add("artifact-quality-gate");
      break;
    }
  }

  // Arabic RTL guidance applies to any visual/document artifact in Arabic.
  if (rtl && artifactType !== "image" && artifactType !== "audio") {
    ids.add("arabic-rtl-ui");
  }
  return [...ids];
}

/* ================================================================== *
 * Public router
 * ================================================================== */

/**
 * Deterministically selects the minimal relevant skill set for a request and
 * enforces the prompt-token budget. Non-executable (untrusted/disabled) skills
 * are never returned. Never loads every skill into every request.
 */
export function routeSkills(input: RouterInput): RoutedSkills {
  const language = inferLanguage(input);
  const mode = inferMode(input);
  const artifactType = inferArtifactType(input, mode);
  const rtl = input.requiresRtl ?? language.toLowerCase().startsWith("ar");
  const visualDesign = requiresVisualDesign(input, artifactType);

  const candidateIds = selectSkillIds({ artifactType, mode, rtl, visualDesign });

  // Resolve to executable skills only, ordered by descending priority then id.
  const resolved: RuntimeSkill[] = candidateIds
    .map((id) => getSkill(id))
    .filter((skill): skill is RuntimeSkill => skill !== undefined && isExecutableSkill(skill))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  // Greedy budget: keep highest-priority skills whose instruction tokens fit.
  const budget = input.maxPromptTokens;
  const kept: RuntimeSkill[] = [];
  const skipped: { id: string; reason: string }[] = [];
  let used = 0;
  for (const skill of resolved) {
    const cost = estimateTokens(skill.instructions);
    if (budget !== undefined && kept.length > 0 && used + cost > budget) {
      skipped.push({ id: skill.id, reason: "budget" });
      continue;
    }
    kept.push(skill);
    used += cost;
  }

  return {
    artifactType,
    mode,
    language,
    rtl,
    skillIds: kept.map((skill) => skill.id),
    skipped,
    estimatedInstructionTokens: used,
  };
}

/** Convenience: the executable skills for a routing decision, in order. */
export function routedRuntimeSkills(routed: RoutedSkills): RuntimeSkill[] {
  return routed.skillIds
    .map((id) => getSkill(id))
    .filter((skill): skill is RuntimeSkill => skill !== undefined);
}

/** The full set of ids the router would consider before budgeting (for tests/debug). */
export const ALL_SKILL_IDS: readonly string[] = RUNTIME_SKILLS.map((skill) => skill.id);
