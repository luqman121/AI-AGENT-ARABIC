import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";

import { getDatabaseEnv } from "./env.js";

const defaultMigrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export async function migrateDatabase(
  connectionString: string,
  migrationsFolder = defaultMigrationsFolder,
): Promise<void> {
  const client = postgres(connectionString, { max: 1, onnotice: () => undefined });

  try {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  await migrateDatabase(getDatabaseEnv().DATABASE_URL);
  process.stdout.write("Database migrations applied.\n");
}

function safeErrorSummary(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";

  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? ` [${error.code}]`
      : "";
  const message = error.message
    .replace(/:\/\/[^@\s]+@/gu, "://[REDACTED]@")
    .replace(/[\r\n]+/gu, " ")
    .slice(0, 500);

  return `${error.name}${code}: ${message}`;
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`Database migration failed: ${safeErrorSummary(error)}\n`);
    process.exitCode = 1;
  });
}
