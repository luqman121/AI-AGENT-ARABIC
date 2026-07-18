import { z } from "zod";

import { objectStorageEndpointKind } from "@wakil/artifacts";
import { MODEL_PROVIDERS } from "@wakil/model-router";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.url().optional());

const workerEnvSchema = z
  .object({
    DATABASE_URL: z.url(),
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
    ARTIFACT_MAX_ZIP_BYTES: z.coerce.number().int().min(1_000).max(2_000_000).default(1_000_000),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ENDPOINT: z.url(),
    S3_FORCE_PATH_STYLE: z.literal("true").transform(() => true),
    S3_REGION: z.literal("auto"),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    REDIS_URL: z.url(),
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
