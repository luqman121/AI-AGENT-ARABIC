import { createDatabaseClient } from "@wakil/db/client";
import { users } from "@wakil/db/schema";
import { eq } from "drizzle-orm";
import { config as loadDotEnv } from "dotenv";
import { fileURLToPath } from "node:url";

// The E2E stack runs against the local dev database (see playwright.config.ts).
// Platform roles cannot be granted through the UI by design, so the browser
// tests provision support/admin accounts with a direct, minimal DB write.
const envPath = fileURLToPath(new URL("../../../.env.local", import.meta.url));
const localEnv: Record<string, string> = {};
loadDotEnv({ path: envPath, processEnv: localEnv, quiet: true });

const databaseUrl = localEnv.DATABASE_URL ?? process.env.DATABASE_URL;

/** Promotes an existing account to a platform role and returns its id. */
export async function setUserRole(
  email: string,
  role: "user" | "support" | "admin",
): Promise<string> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for admin e2e provisioning");
  }
  const handle = createDatabaseClient(databaseUrl);
  try {
    const [row] = await handle.db
      .update(users)
      .set({ role })
      .where(eq(users.email, email))
      .returning({ id: users.id });
    if (!row) throw new Error(`no account found for ${email}`);
    return row.id;
  } finally {
    await handle.close();
  }
}
