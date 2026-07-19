import { failure, type ActionFailure } from "@wakil/shared";
import type { Redis } from "ioredis";

/** Fixed-window per-user limits for authenticated product mutations. */
export const RATE_LIMITS = {
  "attachment.upload": { limit: 12, windowSeconds: 60 },
  "conversation.append": { limit: 30, windowSeconds: 60 },
  "project.archive": { limit: 15, windowSeconds: 60 },
  "project.create": { limit: 10, windowSeconds: 60 },
  "project.rename": { limit: 15, windowSeconds: 60 },
  "run.cancel": { limit: 20, windowSeconds: 60 },
  "run.start": { limit: 20, windowSeconds: 60 },
} as const;

export type RateLimitedOperation = keyof typeof RATE_LIMITS;

/** Waits briefly for the initial connection; commands are never queued. */
async function ensureReady(redis: Redis): Promise<void> {
  if (redis.status === "ready") return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("redis not ready"));
    }, 1500);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      redis.off("ready", onReady);
      redis.off("error", onError);
    };
    redis.once("ready", onReady);
    redis.once("error", onError);
  });
}

/**
 * Returns null when the mutation may proceed. Fails closed: if Redis cannot
 * make the decision, the caller receives a retryable Arabic error instead of
 * an unlimited pass.
 */
export async function enforceRateLimit(
  redis: Redis,
  userId: string,
  operation: RateLimitedOperation,
): Promise<ActionFailure | null> {
  const { limit, windowSeconds } = RATE_LIMITS[operation];
  const key = `wakil:rl:${operation}:${userId}`;
  try {
    await ensureReady(redis);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    return count > limit ? failure("RATE_LIMITED") : null;
  } catch {
    return failure("RATE_LIMITED");
  }
}
