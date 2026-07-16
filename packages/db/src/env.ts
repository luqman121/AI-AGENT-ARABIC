import { config as loadDotEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const rootEnvPath = fileURLToPath(new URL("../../../.env.local", import.meta.url));
loadDotEnv({ path: rootEnvPath, quiet: true });

const databaseEnvSchema = z.object({
  DATABASE_URL: z.url(),
});

export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

let cachedEnv: DatabaseEnv | undefined;

export function readDatabaseEnv(source: NodeJS.ProcessEnv): DatabaseEnv {
  const result = databaseEnvSchema.safeParse(source);

  if (!result.success) {
    throw new Error("Invalid environment variables: DATABASE_URL");
  }

  return result.data;
}

export function getDatabaseEnv(): DatabaseEnv {
  cachedEnv ??= readDatabaseEnv(process.env);
  return cachedEnv;
}
