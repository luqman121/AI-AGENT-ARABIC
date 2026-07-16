import { z } from "zod";

const webEnvSchema = z.object({
  DATABASE_URL: z.url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  REDIS_URL: z.url(),
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
