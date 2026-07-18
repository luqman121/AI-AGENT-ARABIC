import pino, { type Logger } from "pino";

import { getWebEnv } from "../env";

const globalScope = globalThis as typeof globalThis & {
  __wakilWebLogger?: Logger;
};

export function getWebLogger(): Logger {
  globalScope.__wakilWebLogger ??= pino({
    base: { service: "web" },
    level: getWebEnv().LOG_LEVEL,
    redact: {
      censor: "[REDACTED]",
      paths: [
        "AUTH_GOOGLE_SECRET",
        "AUTH_SECRET",
        "DATABASE_URL",
        "REDIS_URL",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "SMTP_PASSWORD",
        "SMTP_USER",
        "*.AUTH_GOOGLE_SECRET",
        "*.AUTH_SECRET",
        "*.DATABASE_URL",
        "*.REDIS_URL",
        "*.S3_ACCESS_KEY_ID",
        "*.S3_SECRET_ACCESS_KEY",
        "*.SMTP_PASSWORD",
        "*.SMTP_USER",
      ],
    },
  });
  return globalScope.__wakilWebLogger;
}
