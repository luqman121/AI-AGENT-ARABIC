import { z } from "zod";

import { objectStorageEndpointKind } from "@wakil/artifacts";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
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

const webEnvSchema = z
  .object({
    ALLOW_INSECURE_HTTP_PREVIEW: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    AUTH_SECRET: z.string().min(32),
    AUTH_URL: z.url(),
    DATABASE_URL: postgresUrl,
    EMAIL_FROM: z.string().min(3),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    REDIS_URL: redisUrl,
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ENDPOINT: z.url(),
    S3_FORCE_PATH_STYLE: z.literal("true").transform(() => true),
    S3_REGION: z.literal("auto"),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    SMTP_HOST: z.string().min(1),
    SMTP_PASSWORD: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_SECURE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    SMTP_USER: optionalString,
    // Optional: absolute URL of the worker's /health endpoint. When set, the
    // admin system view probes it; otherwise worker status reads "unknown".
    WORKER_HEALTH_URL: optionalString,
  })
  .superRefine((value, ctx) => {
    // Google OAuth is all-or-nothing: a half-configured pair must fail fast
    // instead of silently changing the available sign-in methods.
    const id = value.AUTH_GOOGLE_ID?.trim() ?? "";
    const secret = value.AUTH_GOOGLE_SECRET?.trim() ?? "";
    if ((id === "") !== (secret === "")) {
      const missing = id === "" ? "AUTH_GOOGLE_ID" : "AUTH_GOOGLE_SECRET";
      ctx.addIssue({ code: "custom", message: "paired value required", path: [missing] });
    }

    const smtpUser = value.SMTP_USER?.trim() ?? "";
    const smtpPassword = value.SMTP_PASSWORD?.trim() ?? "";
    if ((smtpUser === "") !== (smtpPassword === "")) {
      const missing = smtpUser === "" ? "SMTP_USER" : "SMTP_PASSWORD";
      ctx.addIssue({ code: "custom", message: "paired value required", path: [missing] });
    }

    if (value.NODE_ENV === "production") {
      const authUrl = new URL(value.AUTH_URL);
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(authUrl.hostname);
      if (authUrl.protocol !== "https:" && !loopback && !value.ALLOW_INSECURE_HTTP_PREVIEW) {
        ctx.addIssue({
          code: "custom",
          message: "HTTPS required in production",
          path: ["AUTH_URL"],
        });
      }
    }

    const storageKind = objectStorageEndpointKind(value.S3_ENDPOINT);
    if (!storageKind) {
      ctx.addIssue({
        code: "custom",
        message: "R2 or loopback endpoint required",
        path: ["S3_ENDPOINT"],
      });
    }
  });

export type WebEnv = z.infer<typeof webEnvSchema>;

let cachedEnv: WebEnv | undefined;

function issueNames(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((issue) => String(issue.path[0] ?? "environment")))].sort();
}

export function readWebEnv(source: NodeJS.ProcessEnv): WebEnv {
  const result = webEnvSchema.safeParse(source);

  if (!result.success) {
    throw new Error(`Invalid environment variables: ${issueNames(result.error).join(", ")}`);
  }

  return result.data;
}

export function getWebEnv(): WebEnv {
  cachedEnv ??= readWebEnv(process.env);
  return cachedEnv;
}

/** Google sign-in is offered only when both values are configured. */
export function isGoogleAuthEnabled(env: WebEnv): boolean {
  return Boolean(env.AUTH_GOOGLE_ID?.trim()) && Boolean(env.AUTH_GOOGLE_SECRET?.trim());
}
