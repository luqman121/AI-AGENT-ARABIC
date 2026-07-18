import { createDatabaseClient } from "@wakil/db";
import { RUNS_QUEUE_NAME, type RunJobData } from "@wakil/shared";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { pathToFileURL } from "node:url";
import pino from "pino";

import { readWorkerEnv } from "./env.js";
import { createArtifactStore, createSandbox } from "./execution.js";
import { checkReadiness } from "./readiness.js";
import { createConfiguredModel } from "./model.js";
import { processRun } from "./runs/processor.js";

async function main(): Promise<void> {
  const env = readWorkerEnv(process.env);
  const logger = pino({
    level: env.LOG_LEVEL,
    redact: {
      censor: "[REDACTED]",
      paths: [
        "DATABASE_URL",
        "REDIS_URL",
        "DAYTONA_API_KEY",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "*.DATABASE_URL",
        "*.REDIS_URL",
        "*.DAYTONA_API_KEY",
        "*.S3_ACCESS_KEY_ID",
        "*.S3_SECRET_ACCESS_KEY",
      ],
    },
  });
  const database = createDatabaseClient(env.DATABASE_URL);
  const configuredModel = createConfiguredModel(env);
  const artifactStore = createArtifactStore(env);
  const sandbox = createSandbox(env);
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

    // BullMQ's blocking connection requires maxRetriesPerRequest: null.
    const queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    const publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });

    const worker = new Worker<RunJobData>(
      RUNS_QUEUE_NAME,
      async (job) => {
        const status = await processRun(
          {
            adapter: configuredModel.adapter,
            db: database.db,
            execution: {
              artifactStore,
              generationLimits: configuredModel.executionLimits,
              maxZipBytes: env.ARTIFACT_MAX_ZIP_BYTES,
              sandbox,
              sandboxLimits: {
                commandTimeoutSeconds: env.SANDBOX_COMMAND_TIMEOUT_SECONDS,
                maxDurationMs: env.SANDBOX_MAX_DURATION_MS,
                ttlMinutes: env.SANDBOX_TTL_MINUTES,
              },
            },
            limits: configuredModel.limits,
            model: configuredModel.model,
            modelConfigKey: configuredModel.configKey,
            redis: publisher,
          },
          job.data,
        );
        logger.info({ runId: job.data.runId, status }, "run processed");
      },
      { connection: queueConnection, concurrency: 4 },
    );

    worker.on("failed", (job, error) => {
      logger.error({ runId: job?.data.runId, error: error.name }, "run job failed");
    });

    logger.info({ queue: RUNS_QUEUE_NAME, state: "consuming" }, "worker ready");

    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });

    await worker.close();
    await Promise.allSettled([queueConnection.quit(), publisher.quit()]);
  } finally {
    await Promise.allSettled([database.close(), redis.quit()]);
    logger.info({ state: "stopped" }, "worker stopped");
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(`Worker startup failed: ${message}\n`);
    process.exitCode = 1;
  });
}
