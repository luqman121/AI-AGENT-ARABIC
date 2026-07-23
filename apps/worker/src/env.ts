import { z } from "zod";

import { objectStorageEndpointKind } from "@wakil/artifacts";
import { MODEL_PROVIDERS } from "@wakil/model-router";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());
/**
 * Strict boolean flag: only the literal strings "true"/"false" (or unset)
 * are accepted, avoiding the classic `z.coerce.boolean()` footgun where any
 * non-empty string — including the literal text "false" — coerces to true.
 */
const booleanFlag = (defaultValue: boolean) =>
  z
    .preprocess(
      (value) => (value === "" || value === undefined ? String(defaultValue) : value),
      z.enum(["true", "false"]),
    )
    .transform((value) => value === "true");
const postgresUrl = z
  .url()
  .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
    message: "PostgreSQL URL required",
  });
const redisUrl = z
  .url()
  .refine((value) => value.startsWith("redis://") || value.startsWith("rediss://"), {
    message: "Redis URL required",
  });

const workerEnvSchema = z
  .object({
    DATABASE_URL: postgresUrl,
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    MODEL_DEADLINE_MS: z.coerce.number().int().positive().max(300_000).default(60_000),
    MODEL_INPUT_COST_MICROS_PER_MILLION_TOKENS: z.coerce.number().int().nonnegative(),
    MODEL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(3).default(2),
    MODEL_MAX_COST_MICROS: z.coerce.number().int().positive().default(50_000),
    MODEL_MAX_DELTA_EVENTS: z.coerce.number().int().positive().max(1_000).default(512),
    MODEL_MAX_OUTPUT_CHARS: z.coerce.number().int().min(100).max(8_000).default(8_000),
    MODEL_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(8_000).default(1_500),
    MODEL_OUTPUT_COST_MICROS_PER_MILLION_TOKENS: z.coerce.number().int().nonnegative(),
    MODEL_PROVIDER: z.enum(MODEL_PROVIDERS).default("openrouter"),
    EXECUTION_MODEL_MAX_COST_MICROS: z.coerce.number().int().positive().default(200_000),
    EXECUTION_MODEL_MAX_HTML_BYTES: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(500_000)
      .default(250_000),
    EXECUTION_MODEL_MAX_OUTPUT_CHARS: z.coerce
      .number()
      .int()
      .min(10_000)
      .max(400_000)
      .default(300_000),
    EXECUTION_MODEL_MAX_OUTPUT_TOKENS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(100_000)
      .default(32_000),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    ANTHROPIC_API_KEY: optionalString,
    ANTHROPIC_BASE_URL: optionalUrl,
    ANTHROPIC_MODEL: optionalString,
    GOOGLE_API_KEY: optionalString,
    GOOGLE_BASE_URL: optionalUrl,
    GOOGLE_MODEL: optionalString,
    OPENAI_API_KEY: optionalString,
    OPENAI_BASE_URL: optionalUrl,
    OPENAI_MODEL: optionalString,
    OPENROUTER_API_KEY: optionalString,
    OPENROUTER_BASE_URL: optionalUrl,
    OPENROUTER_MODEL: optionalString,
    DAYTONA_API_KEY: optionalString,
    DAYTONA_API_URL: optionalUrl,
    DAYTONA_TARGET: optionalString,
    SANDBOX_COMMAND_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(120).default(30),
    SANDBOX_MAX_DURATION_MS: z.coerce.number().int().min(10_000).max(600_000).default(120_000),
    SANDBOX_TTL_MINUTES: z.coerce.number().int().min(1).max(15).default(3),
    ARTIFACT_MAX_ZIP_BYTES: z.coerce.number().int().min(1_000).max(25_000_000).default(20_000_000),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ENDPOINT: z.url(),
    S3_FORCE_PATH_STYLE: z.literal("true").transform(() => true),
    S3_REGION: z.literal("auto"),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    REDIS_URL: redisUrl,
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
    WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    // Feature flag: routes website generation through the Skills Runtime
    // (skill selection + Design Critic repair loop) instead of the legacy
    // static-site prompt path. Off by default; a runtime compilation
    // failure always falls back to the legacy path rather than failing the
    // run. See docs/agent-skills-sources.md and CHANGELOG.md.
    AGENT_SKILLS_RUNTIME_ENABLED: booleanFlag(false),
    AGENT_SKILLS_MAX_PROMPT_TOKENS: z.coerce.number().int().positive().max(50_000).default(6_000),
    AGENT_SKILLS_MAX_REPAIR_ATTEMPTS: z.coerce.number().int().min(0).max(2).default(1),
  })
  .superRefine((env, ctx) => {
    const prefix = env.MODEL_PROVIDER.toUpperCase();
    const keyName = `${prefix}_API_KEY` as keyof typeof env;
    const modelName = `${prefix}_MODEL` as keyof typeof env;
    if (!env[keyName]) ctx.addIssue({ code: "custom", path: [keyName], message: "Required" });
    if (!env[modelName]) ctx.addIssue({ code: "custom", path: [modelName], message: "Required" });

    const storageKind = objectStorageEndpointKind(env.S3_ENDPOINT);
    if (!storageKind) {
      ctx.addIssue({
        code: "custom",
        message: "R2 or loopback endpoint required",
        path: ["S3_ENDPOINT"],
      });
    }
  });

export type WorkerEnv = z.infer<typeof workerEnvSchema>;

function issueNames(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "environment")))].sort();
}

export function readWorkerEnv(source: NodeJS.ProcessEnv): WorkerEnv {
  const result = workerEnvSchema.safeParse(source);

  if (!result.success) {
    throw new Error(`Invalid environment variables: ${issueNames(result.error).join(", ")}`);
  }

  return result.data;
}
