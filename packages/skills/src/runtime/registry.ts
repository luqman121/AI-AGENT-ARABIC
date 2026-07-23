import { createHash } from "node:crypto";

import {
  ARABIC_RTL_UI_INSTRUCTIONS,
  ARTIFACT_QUALITY_GATE_INSTRUCTIONS,
  DESIGN_CRITIC_INSTRUCTIONS,
  DESIGN_SYSTEM_GENERATOR_INSTRUCTIONS,
  DOCUMENT_READER_INSTRUCTIONS,
  DOCUMENT_STUDIO_INSTRUCTIONS,
  PDF_STUDIO_INSTRUCTIONS,
  PREMIUM_DEPTH_SHADOW_INSTRUCTIONS,
  PRESENTATION_STUDIO_INSTRUCTIONS,
  SPREADSHEET_STUDIO_INSTRUCTIONS,
  WEBSITE_DESIGN_INSTRUCTIONS,
  WEBSITE_QUALITY_GATE_INSTRUCTIONS,
} from "./instructions.js";
import { agentSkillSchema, type AgentSkill, type RuntimeSkill } from "./types.js";

/** sha-256 hex digest of an instruction body, for integrity + drift detection. */
export function skillChecksum(instructions: string): string {
  return createHash("sha256").update(instructions, "utf8").digest("hex");
}

/**
 * Validates skill metadata, attaches its instruction body, and stamps a
 * checksum so the on-disk manifest and lock file can be verified against the
 * source of truth (this registry).
 */
function defineSkill(meta: Omit<AgentSkill, "checksum">, instructions: string): RuntimeSkill {
  const checksum = skillChecksum(instructions);
  const parsed = agentSkillSchema.parse({ ...meta, checksum });
  return { ...parsed, instructions };
}

const COMMON: Pick<
  AgentSkill,
  "enabled" | "license" | "source" | "supportedLanguages" | "trustLevel"
> = {
  enabled: true,
  license: "proprietary",
  source: "internal:wakil",
  supportedLanguages: ["ar", "en"],
  trustLevel: "internal",
};

/**
 * The internal, provider-neutral runtime skill catalog. Every entry is
 * original content authored for this platform (trust level `internal`). The
 * router selects a minimal subset per request; the compiler loads only the
 * selected instructions.
 */
export const RUNTIME_SKILLS: readonly RuntimeSkill[] = [
  defineSkill(
    {
      ...COMMON,
      id: "website-design",
      name: "Website Design",
      version: "1.0.0",
      description: "Product-specific website structure, hierarchy, and mini design system.",
      category: "website",
      triggers: [
        "website",
        "site",
        "landing",
        "page",
        "web app",
        "dashboard",
        "موقع",
        "صفحة",
        "هبوط",
        "تطبيق",
        "لوحة",
        "واجهة",
      ],
      requiredTools: [],
      optionalTools: ["browser-render", "screenshot"],
      priority: 100,
    },
    WEBSITE_DESIGN_INSTRUCTIONS,
  ),
  defineSkill(
    {
      ...COMMON,
      id: "arabic-rtl-ui",
      name: "Arabic RTL UI",
      version: "1.0.0",
      description: "Structural RTL, logical properties, Arabic typography and locale formatting.",
      category: "design",
      triggers: ["arabic", "rtl", "عربي", "عربية", "اتجاه", "خليجي", "عماني"],
      requiredTools: [],
      optionalTools: [],
      priority: 95,
    },
    ARABIC_RTL_UI_INSTRUCTIONS,
  ),
  defineSkill(
    {
      ...COMMON,
      id: "design-system-generator",
      name: "Design System Generator",
      version: "1.0.0",
      description: "Defines and persists a mini design system before pages are written.",
      category: "design",
      triggers: ["design system", "tokens", "theme", "نظام تصميم", "هوية", "ألوان"],
      requiredTools: [],
      optionalTools: [],
      priority: 70,
    },
    DESIGN_SYSTEM_GENERATOR_INSTRUCTIONS,
  ),
  defineSkill(
    {
      ...COMMON,
      id: "premium-depth-shadow",
      name: "Premium Depth & Shadow",
      version: "1.0.0",
      description: "Controlled elevation system; shadows communicate depth, not decoration.",
      category: "design",
      triggers: ["shadow", "elevation", "depth", "ظل", "عمق", "ارتفاع"],
      requiredTools: [],
      optionalTools: [],
      priority: 60,
    },
    PREMIUM_DEPTH_SHADOW_INSTRUCTIONS,
  ),
  defineSkill(
    {
      ...COMMON,
      id: "design-critic",
      name: "Design Critic",
      version: "1.0.0",
      description: "Machine-readable design review; blocks generic or broken output.",
      category: "quality",
      triggers: ["critique", "review", "نقد", "مراجعة", "جودة التصميم"],
      requiredTools: [],
      optionalTools: ["browser-render", "screenshot"],
      priority: 85,
    },
    DESIGN_CRITIC_INSTRUCTIONS,
  ),
  defineSkill(
    {
      ...COMMON,
      id: "website-quality-gate",
      name: "Website Quality Gate",
      version: "1.0.0",
      description: "Blocks completion until RTL, states, a11y, console, and build pass.",
      category: "quality",
      triggers: ["quality gate", "validate site", "بوابة جودة", "تحقق الموقع"],
      requiredTools: [],
      optionalTools: ["browser-render", "axe"],
      priority: 80,
    },
    WEBSITE_QUALITY_GATE_INSTRUCTIONS,
  ),
  defineSkill(
    {
      ...COMMON,
      id: "document-reader",
      name: "Document Reader",
      version: "1.0.0",
      description: "Native-first extraction from PDF/DOCX/PPTX/XLSX with evidence references.",
      category: "reading",
      triggers: [
        "read",
        "analyze",
        "summarize",
        "extract",
        "اقرأ",
        "حلّل",
        "لخّص",
        "استخرج",
        "تحليل",
      ],
      requiredTools: ["document-extract"],
      optionalTools: ["ocr"],
      priority: 100,
    },
    DOCUMENT_READER_INSTRUCTIONS,
  ),
  defineSkill(
    {
      ...COMMON,
      id: "pdf-studio",
      name: "PDF Studio",
      version: "1.0.0",
      description: "Professional Arabic-capable PDF creation and manipulation with page QA.",
      category: "pdf",
      triggers: ["pdf", "report", "بي دي اف", "تقرير", "ملف pdf"],
      requiredTools: ["pdf-writer"],
      optionalTools: ["pdf-render", "html-to-pdf"],
      priority: 100,
    },
    PDF_STUDIO_INSTRUCTIONS,
  ),
  defineSkill(
    {
      ...COMMON,
      id: "spreadsheet-studio",
      name: "Spreadsheet Studio",
      version: "1.0.0",
      description: "XLSX workbooks with formulas, dashboards, and workbook validation.",
      category: "spreadsheet",
      triggers: ["excel", "spreadsheet", "xlsx", "sheet", "budget", "جدول", "اكسل", "ميزانية"],
      requiredTools: ["workbook-writer"],
      optionalTools: ["chart-render"],
      priority: 100,
    },
    SPREADSHEET_STUDIO_INSTRUCTIONS,
  ),
  defineSkill(
    {
      ...COMMON,
      id: "document-studio",
      name: "Document Studio",
      version: "1.0.0",
      description: "Professional Arabic RTL DOCX reports, letters, and proposals.",
      category: "document",
      triggers: ["word", "docx", "document", "letter", "proposal", "مستند", "خطاب", "عرض", "وثيقة"],
      requiredTools: ["docx-writer"],
      optionalTools: ["docx-render"],
      priority: 100,
    },
    DOCUMENT_STUDIO_INSTRUCTIONS,
  ),
  defineSkill(
    {
      ...COMMON,
      id: "presentation-studio",
      name: "Presentation Studio",
      version: "1.0.0",
      description: "16:9 Arabic RTL decks: one message per slide, intentional composition.",
      category: "presentation",
      triggers: [
        "powerpoint",
        "pptx",
        "presentation",
        "deck",
        "slides",
        "عرض تقديمي",
        "شرائح",
        "بوربوينت",
      ],
      requiredTools: ["pptx-writer"],
      optionalTools: ["slide-render"],
      priority: 100,
    },
    PRESENTATION_STUDIO_INSTRUCTIONS,
  ),
  defineSkill(
    {
      ...COMMON,
      id: "artifact-quality-gate",
      name: "Artifact Quality Gate",
      version: "1.0.0",
      description: "Type-specific completion gate; no fake links, structured pass/fail.",
      category: "quality",
      triggers: ["validate", "quality", "تحقق", "جودة", "اكتمال"],
      requiredTools: [],
      optionalTools: [],
      priority: 90,
    },
    ARTIFACT_QUALITY_GATE_INSTRUCTIONS,
  ),
];

const SKILL_BY_ID = new Map<string, RuntimeSkill>(RUNTIME_SKILLS.map((skill) => [skill.id, skill]));

/** Look up a runtime skill by id. */
export function getSkill(id: string): RuntimeSkill | undefined {
  return SKILL_BY_ID.get(id);
}

/** All skills in a category (any enabled state). */
export function skillsInCategory(category: AgentSkill["category"]): RuntimeSkill[] {
  return RUNTIME_SKILLS.filter((skill) => skill.category === category);
}

/** Metadata-only view (no instruction bodies) — safe for admin surfaces. */
export function skillCatalogMetadata(): AgentSkill[] {
  return RUNTIME_SKILLS.map((skill) => {
    const meta = { ...skill } as Partial<RuntimeSkill>;
    delete meta.instructions;
    return meta as AgentSkill;
  });
}
