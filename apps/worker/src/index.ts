import { createDatabaseClient } from "@wakil/db";
import { RUNS_QUEUE_NAME, type RunJobData } from "@wakil/shared";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { Server } from "node:http";
import { pathToFileURL } from "node:url";
import pino from "pino";

import { readWorkerEnv } from "./env.js";
import { createArtifactStore, createSandbox } from "./execution.js";
import { closeWorkerHealth, listenForWorkerHealth } from "./health-server.js";
import { checkReadiness } from "./readiness.js";
import { createConfiguredModel } from "./model.js";
import { processRun } from "./runs/processor.js";

async function main(): Promise<void> {
  const env = readWorkerEnv(process.env);
  const logger = pino({
    base: { service: "worker" },
    level: env.LOG_LEVEL,
    redact: {
      censor: "[REDACTED]",
      paths: [
        "DATABASE_URL",
        "REDIS_URL",
        "DAYTONA_API_KEY",
        "ANTHROPIC_API_KEY",
        "GOOGLE_API_KEY",
        "OPENAI_API_KEY",
        "OPENROUTER_API_KEY",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "*.DATABASE_URL",
        "*.REDIS_URL",
        "*.DAYTONA_API_KEY",
        "*.ANTHROPIC_API_KEY",
        "*.GOOGLE_API_KEY",
        "*.OPENAI_API_KEY",
        "*.OPENROUTER_API_KEY",
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
    connectTimeout: 5000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  const healthState = { ready: false };
  let healthServer: Server | undefined;
  let publisher: Redis | undefined;
  let queueConnection: Redis | undefined;
  let runWorker: Worker<RunJobData> | undefined;

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

    healthServer = await listenForWorkerHealth(healthState, env.WORKER_HEALTH_PORT);

    // BullMQ's blocking connection requires maxRetriesPerRequest: null.
    const blockingConnection = new Redis(env.REDIS_URL, {
      connectTimeout: 5000,
      maxRetriesPerRequest: null,
    });
    queueConnection = blockingConnection;
    const eventPublisher = new Redis(env.REDIS_URL, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });
    publisher = eventPublisher;

    runWorker = new Worker<RunJobData>(
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
            redis: eventPublisher,
          },
          job.data,
        );
        logger.info({ runId: job.data.runId, status }, "run processed");
      },
      { connection: blockingConnection, concurrency: env.WORKER_CONCURRENCY },
    );

    runWorker.on("failed", (job, error) => {
      logger.error({ runId: job?.data.runId, error: error.name }, "run job failed");
    });

    await runWorker.waitUntilReady();
    healthState.ready = true;
    logger.info(
      { concurrency: env.WORKER_CONCURRENCY, queue: RUNS_QUEUE_NAME, state: "consuming" },
      "worker ready",
    );

    await new Promise<void>((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });

    healthState.ready = false;
  } finally {
    healthState.ready = false;
    if (runWorker) await runWorker.close().catch(() => undefined);
    await Promise.allSettled([
      database.close(),
      redis.quit(),
      ...(queueConnection ? [queueConnection.quit()] : []),
      ...(publisher ? [publisher.quit()] : []),
      ...(healthServer ? [closeWorkerHealth(healthServer)] : []),
    ]);
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
