import { z } from "zod";

import { MODEL_PROVIDERS } from "@wakil/model-router";

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
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_BASE_URL: z.url().optional(),
    ANTHROPIC_MODEL: z.string().min(1).optional(),
    GOOGLE_API_KEY: z.string().min(1).optional(),
    GOOGLE_BASE_URL: z.url().optional(),
    GOOGLE_MODEL: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_BASE_URL: z.url().optional(),
    OPENAI_MODEL: z.string().min(1).optional(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_BASE_URL: z.url().optional(),
    OPENROUTER_MODEL: z.string().min(1).optional(),
    REDIS_URL: z.url(),
  })
  .superRefine((env, ctx) => {
    const prefix = env.MODEL_PROVIDER.toUpperCase();
    const keyName = `${prefix}_API_KEY` as keyof typeof env;
    const modelName = `${prefix}_MODEL` as keyof typeof env;
    if (!env[keyName]) ctx.addIssue({ code: "custom", path: [keyName], message: "Required" });
    if (!env[modelName]) ctx.addIssue({ code: "custom", path: [modelName], message: "Required" });
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
