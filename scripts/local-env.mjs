import { randomBytes } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parse } from "dotenv";

const rootDirectory = resolve(import.meta.dirname, "..");
const localEnvPath = resolve(rootDirectory, ".env.local");

const localDefaults = () => ({
  AUTH_SECRET: randomBytes(32).toString("base64url"),
  // Next.js's Turbopack dev server always resolves its own request origin as
  // "localhost", regardless of the Host header used to reach it. AUTH_URL
  // must match that origin or magic-link callback verification silently
  // fails (the generated link's host won't match the session it produces).
  AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://wakil:wakil_local_only@127.0.0.1:5432/wakil",
  EMAIL_FROM: "Wakil <no-reply@wakil.local>",
  LOG_LEVEL: "info",
  NODE_ENV: "development",
  POSTGRES_DB: "wakil",
  POSTGRES_PASSWORD: "wakil_local_only",
  POSTGRES_USER: "wakil",
  REDIS_URL: "redis://127.0.0.1:6379",
  S3_ACCESS_KEY_ID: "wakil_local_access_key",
  S3_BUCKET: "wakil-dev",
  S3_ENDPOINT: "http://127.0.0.1:9000",
  S3_FORCE_PATH_STYLE: "true",
  S3_REGION: "auto",
  S3_SECRET_ACCESS_KEY: "wakil_local_secret_key",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
});

async function readExistingFile() {
  try {
    return await readFile(localEnvPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export async function ensureLocalEnv() {
  const existingText = await readExistingFile();
  const existing = parse(existingText);
  const missing = Object.entries(localDefaults()).filter(([name]) => !(name in existing));

  if (missing.length > 0) {
    const prefix = existingText.length === 0 || existingText.endsWith("\n") ? "" : "\n";
    const lines = missing.map(([name, value]) => `${name}=${value}`).join("\n");
    await appendFile(localEnvPath, `${prefix}${lines}\n`, { encoding: "utf8", mode: 0o600 });
  }

  return {
    ...process.env,
    ...parse(await readFile(localEnvPath, "utf8")),
  };
}

export { localEnvPath, rootDirectory };
