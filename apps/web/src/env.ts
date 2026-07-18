import { z } from "zod";

import { objectStorageEndpointKind } from "@wakil/artifacts";

const webEnvSchema = z
  .object({
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    AUTH_SECRET: z.string().min(32),
    AUTH_URL: z.url(),
    DATABASE_URL: z.url(),
    EMAIL_FROM: z.string().min(3),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    REDIS_URL: z.url(),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ENDPOINT: z.url(),
    S3_FORCE_PATH_STYLE: z.literal("true").transform(() => true),
    S3_REGION: z.literal("auto"),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
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
