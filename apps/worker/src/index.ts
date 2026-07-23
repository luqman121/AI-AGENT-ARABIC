import { createDatabaseClient } from "@wakil/db";
import { runs } from "@wakil/db/schema";
import { RUNS_QUEUE_NAME, type RunJobData } from "@wakil/shared";
import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
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
  let dispatchQueue: Queue<RunJobData> | undefined;
  let producerConnection: Redis | undefined;
  let workerConnection: Redis | undefined;
  let runWorker: Worker<RunJobData> | undefined;
  let reconciliationTimer: ReturnType<typeof setInterval> | undefined;

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
    workerConnection = blockingConnection;
    const boundedProducerConnection = new Redis(env.REDIS_URL, {
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });
    producerConnection = boundedProducerConnection;
    dispatchQueue = new Queue<RunJobData>(RUNS_QUEUE_NAME, {
      connection: boundedProducerConnection,
    });
    const enqueue = async (runJob: RunJobData) => {
      if (!dispatchQueue) throw new Error("run dispatch queue is unavailable");
      await dispatchQueue.add("run", runJob, {
        jobId: runJob.runId,
        removeOnComplete: true,
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 1_000 },
      });
    };
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
            logger,
            model: configuredModel.model,
            modelConfigKey: configuredModel.configKey,
            redis: eventPublisher,
            skillsRuntime: {
              enabled: env.AGENT_SKILLS_RUNTIME_ENABLED,
              maxPromptTokens: env.AGENT_SKILLS_MAX_PROMPT_TOKENS,
              maxRepairAttempts: env.AGENT_SKILLS_MAX_REPAIR_ATTEMPTS,
            },
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
    let reconciling = false;
    const reconcileQueuedRuns = async () => {
      if (reconciling) return;
      reconciling = true;
      try {
        const queuedRuns = await database.db
          .select({ projectId: runs.projectId, runId: runs.id, workspaceId: runs.workspaceId })
          .from(runs)
          .where(eq(runs.status, "queued"))
          .limit(100);
        await Promise.all(queuedRuns.map((run) => enqueue(run)));
        if (queuedRuns.length > 0) {
          logger.info({ count: queuedRuns.length }, "reconciled queued runs with BullMQ");
        }
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.name : "UnknownError" },
          "run reconciliation failed",
        );
      } finally {
        reconciling = false;
      }
    };
    await reconcileQueuedRuns();
    reconciliationTimer = setInterval(() => void reconcileQueuedRuns(), 30_000);
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
    if (reconciliationTimer) clearInterval(reconciliationTimer);
    if (runWorker) await runWorker.close().catch(() => undefined);
    await Promise.allSettled([
      database.close(),
      redis.quit(),
      ...(dispatchQueue ? [dispatchQueue.close()] : []),
      ...(producerConnection ? [producerConnection.quit()] : []),
      ...(workerConnection ? [workerConnection.quit()] : []),
      ...(publisher ? [publisher.quit()] : []),
      ...(healthServer ? [closeWorkerHealth(healthServer)] : []),
    ]);
    logger.info({ state: "stopped" }, "worker stopped");
  }
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
  main().catch((error: unknown) => {
    const detail =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "UnknownError: unknown startup error";
    const safeDetail = detail
      .replace(/((?:postgres(?:ql)?|redis|https?):\/\/)[^@\s]+@/gi, "$1[REDACTED]@")
      .replace(/(api[_-]?key|token|secret|password)=([^\s&]+)/gi, "$1=[REDACTED]");
    process.stderr.write(`Worker startup failed: ${safeDetail}\n`);
    process.exitCode = 1;
  });
}
