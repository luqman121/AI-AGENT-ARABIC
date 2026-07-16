import { createDatabaseClient } from "@wakil/db";
import { Redis } from "ioredis";
import pino from "pino";

import { readWorkerEnv } from "./env.js";
import { checkReadiness } from "./readiness.js";

async function main(): Promise<void> {
  const env = readWorkerEnv(process.env);
  const logger = pino({
    level: env.LOG_LEVEL,
    redact: {
      censor: "[REDACTED]",
      paths: ["DATABASE_URL", "REDIS_URL", "*.DATABASE_URL", "*.REDIS_URL"],
    },
  });
  const database = createDatabaseClient(env.DATABASE_URL);
  const redis = new Redis(env.REDIS_URL, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  try {
    const readiness = await checkReadiness({
      database: async () => database.ping(),
      redis: async () => {
        await redis.connect();
        await redis.ping();
      },
    });

    if (!readiness.ready) {
      logger.error({ checks: readiness.checks }, "worker dependencies unavailable");
      process.exitCode = 1;
      return;
    }

    logger.info({ checks: readiness.checks, state: "idle" }, "worker ready");

    if (process.argv.includes("--check")) {
      return;
    }

    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  } finally {
    await Promise.allSettled([database.close(), redis.quit()]);
    logger.info({ state: "stopped" }, "worker stopped");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.name : "UnknownError";
  process.stderr.write(`Worker startup failed: ${message}\n`);
  process.exitCode = 1;
});
