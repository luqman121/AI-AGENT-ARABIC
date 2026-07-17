import { Redis } from "ioredis";

import { getWebEnv } from "../env";

const globalScope = globalThis as typeof globalThis & {
  __wakilRedis?: Redis;
};

/**
 * Redis is transport-only in M1 (rate-limit decisions). The client fails
 * fast instead of queueing commands so callers can fail closed.
 */
export function getRedis(): Redis {
  globalScope.__wakilRedis ??= new Redis(getWebEnv().REDIS_URL, {
    connectTimeout: 2000,
    enableOfflineQueue: false,
    lazyConnect: false,
    maxRetriesPerRequest: 1,
  });
  return globalScope.__wakilRedis;
}
