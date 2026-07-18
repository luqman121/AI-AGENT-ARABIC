import { RUNS_QUEUE_NAME, type RunJobData } from "@wakil/shared";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { getWebEnv } from "../../../env";

const globalScope = globalThis as typeof globalThis & {
  __wakilRunQueue?: Queue<RunJobData>;
};

function getQueue(): Queue<RunJobData> {
  globalScope.__wakilRunQueue ??= new Queue<RunJobData>(RUNS_QUEUE_NAME, {
    connection: new Redis(getWebEnv().REDIS_URL, { maxRetriesPerRequest: null }),
  });
  return globalScope.__wakilRunQueue;
}

/** Enqueues a job keyed by runId so a duplicate enqueue is deduplicated. */
export async function enqueueRun(job: RunJobData): Promise<void> {
  await getQueue().add("run", job, {
    jobId: job.runId,
    removeOnComplete: true,
    // Retain a bounded failed-job record for operational diagnosis. The
    // database run and run_events remain the durable user-visible truth.
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 1_000 },
  });
}
