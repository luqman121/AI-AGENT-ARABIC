import { z } from "zod";

/* ================================================================== *
 * Skill taxonomy
 *
 * These vocabularies are intentionally defined locally so that
 * `@wakil/skills` stays a leaf package (only `zod`), consumable by the
 * model router and worker without pulling in heavier dependencies. The
 * artifact list mirrors `OUTPUT_KINDS` in `@wakil/shared`; a test guards
 * the two against drift.
 * ================================================================== */

export const SKILL_CATEGORIES = [
  "website",
  "design",
  "pdf",
  "spreadsheet",
  "document",
  "presentation",
  "reading",
  "quality",
] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/**
 * Trust levels gate what a skill is allowed to do. Only `internal`,
 * `reviewed-open-source`, and `provider-managed` skills may ever be loaded
 * into the runtime prompt or execute tools. `untrusted`/`disabled` are
 * never routed.
 */
export const SKILL_TRUST_LEVELS = [
  "internal",
  "reviewed-open-source",
  "provider-managed",
  "untrusted",
  "disabled",
] as const;
export type SkillTrustLevel = (typeof SKILL_TRUST_LEVELS)[number];

/** Trust levels that may participate in a customer run. */
export const EXECUTABLE_TRUST_LEVELS: readonly SkillTrustLevel[] = [
  "internal",
  "reviewed-open-source",
  "provider-managed",
];

/** Requested artifact type. Mirrors `OUTPUT_KINDS` in `@wakil/shared`. */
export const ARTIFACT_TYPES = [
  "static_site",
  "web_app",
  "pdf",
  "spreadsheet",
  "image",
  "audio",
  "document",
  "presentation",
  "other",
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

/** What the customer wants done with/for the artifact. */
export const REQUEST_MODES = ["create", "read", "edit", "convert", "analyze"] as const;
export type RequestMode = (typeof REQUEST_MODES)[number];

/* ================================================================== *
 * Skill metadata (the AgentSkill contract) + runtime skill
 * ================================================================== */

const skillIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,48}$/, "Skill id must be kebab-case, 2-49 chars");

const semverSchema = z.string().regex(/^\d+\.\d+\.\d+$/, "Skill version must be semver (x.y.z)");

/**
 * Structured, validated metadata for a runtime skill. This is the shape the
 * admin dashboard, the on-disk manifest, and the lock file all agree on.
 */
export const agentSkillSchema = z.object({
  id: skillIdSchema,
  name: z.string().trim().min(1).max(80),
  version: semverSchema,
  description: z.string().trim().min(1).max(400),
  category: z.enum(SKILL_CATEGORIES),
  trustLevel: z.enum(SKILL_TRUST_LEVELS),
  triggers: z.array(z.string().trim().min(1).max(60)).max(64),
  supportedLanguages: z.array(z.string().trim().min(2).max(10)).min(1).max(20),
  requiredTools: z.array(z.string().trim().min(1).max(60)).max(32),
  optionalTools: z.array(z.string().trim().min(1).max(60)).max(32),
  source: z.string().trim().min(1).max(200),
  sourceCommit: z.string().trim().min(4).max(64).optional(),
  license: z.string().trim().min(1).max(60),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(1000),
  maxPromptTokens: z.number().int().positive().max(200_000).optional(),
  checksum: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "Checksum must be a sha-256 hex digest")
    .optional(),
});
export type AgentSkill = z.infer<typeof agentSkillSchema>;

/** A registered skill: validated metadata plus its instruction body. */
export type RuntimeSkill = AgentSkill & {
  /** The instruction text loaded into the runtime prompt when selected. */
  instructions: string;
};

/* ================================================================== *
 * Routing
 * ================================================================== */

export type RouterInput = {
  /** The raw customer request. Treated as untrusted text. */
  requestText: string;
  /** Requested output kind when the caller already knows it. */
  artifactType?: ArtifactType;
  /** Create / read / edit / convert / analyze. Inferred when omitted. */
  mode?: RequestMode;
  /** MIME types of uploaded files, if any. */
  uploadedMimeTypes?: string[];
  /** Original file names of uploaded files, if any. */
  uploadedFileNames?: string[];
  /** BCP-47-ish language tag, e.g. "ar", "ar-OM", "en". Inferred when omitted. */
  language?: string;
  /** Force RTL handling. Inferred from language when omitted. */
  requiresRtl?: boolean;
  /** Whether visual design skills are needed (websites, decks, PDFs). */
  requiresVisualDesign?: boolean;
  /** Optional existing-project context for consistency. */
  projectContext?: string;
  /** Prompt-token budget for the selected skill instructions. */
  maxPromptTokens?: number;
};

export type RoutedSkills = {
  artifactType: ArtifactType;
  mode: RequestMode;
  language: string;
  rtl: boolean;
  /** Selected skill ids, ordered by descending priority. */
  skillIds: string[];
  /** Skills dropped to stay within the token budget, with the reason. */
  skipped: { id: string; reason: string }[];
  /** Estimated tokens for the selected skill instructions only. */
  estimatedInstructionTokens: number;
};

/* ================================================================== *
 * Compiled runtime prompt
 * ================================================================== */

/** The provider-neutral prompt shape consumed by every model adapter. */
export type RuntimePrompt = {
  system: string;
  developer: string;
  user: string;
};

/**
 * Internal, admin-only run metadata for debugging and observability. Never
 * exposed to customers.
 */
export type RunPromptMetadata = {
  promptVersion: string;
  skillIds: string[];
  skillVersions: Record<string, string>;
  estimatedTokens: number;
  locale: string;
  validationProfile: string;
  artifactType: ArtifactType;
  mode: RequestMode;
  rtl: boolean;
};

export type CompiledPrompt = {
  prompt: RuntimePrompt;
  metadata: RunPromptMetadata;
};

/* ================================================================== *
 * Validation + design review results
 * ================================================================== */

export type ReviewIssueSeverity = "blocking" | "major" | "minor";

export type ReviewIssue = {
  id: string;
  severity: ReviewIssueSeverity;
  message: string;
  area?: string;
};

export type ReviewFix = {
  issueId: string;
  recommendation: string;
};

export type DesignReview = {
  score: number;
  blockingIssues: ReviewIssue[];
  majorIssues: ReviewIssue[];
  minorIssues: ReviewIssue[];
  recommendedFixes: ReviewFix[];
  passed: boolean;
};

export type ArtifactValidationResult = {
  artifactType: string;
  valid: boolean;
  score: number;
  blockingErrors: string[];
  warnings: string[];
  repaired: boolean;
  repairAttempts: number;
  metadata: Record<string, unknown>;
};
