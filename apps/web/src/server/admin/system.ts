import { getWebEnv } from "../../env";
import { getArtifactStore } from "../features/artifacts/store";
import { getRunQueueCounts } from "../features/runs/queue";
import { getDatabaseHandle } from "../db";
import { getRedis } from "../redis";

export type ServiceStatus = "healthy" | "degraded" | "unavailable" | "unknown";

export type ServiceHealth = {
  key: string;
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  note: string | null;
};

export type QueueHealth = {
  status: ServiceStatus;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
} | null;

export type SystemHealth = {
  checkedAtIso: string;
  services: ServiceHealth[];
  queue: QueueHealth;
};

const PROBE_TIMEOUT_MS = 3000;

async function timed(probe: () => Promise<void>): Promise<{ ok: boolean; latencyMs: number }> {
  const started = Date.now();
  try {
    await Promise.race([
      probe(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), PROBE_TIMEOUT_MS),
      ),
    ]);
    return { latencyMs: Date.now() - started, ok: true };
  } catch {
    return { latencyMs: Date.now() - started, ok: false };
  }
}

function service(
  key: string,
  name: string,
  result: { ok: boolean; latencyMs: number },
  note: string | null = null,
): ServiceHealth {
  return {
    key,
    latencyMs: result.latencyMs,
    name,
    note,
    status: result.ok ? "healthy" : "unavailable",
  };
}

/**
 * Server-side health snapshot. Every probe is bounded and swallows its own
 * errors so one failing dependency never breaks the page. A dependency that is
 * not actually probed reads "unknown" — never "healthy" by default.
 */
export async function checkSystemHealth(): Promise<SystemHealth> {
  const env = getWebEnv();

  const [postgres, redis, storage] = await Promise.all([
    timed(async () => {
      await getDatabaseHandle().ping();
    }),
    timed(async () => {
      await getRedis().ping();
    }),
    timed(async () => {
      await getArtifactStore().checkHealth();
    }),
  ]);

  let queue: QueueHealth = null;
  try {
    const counts = await getRunQueueCounts();
    queue = {
      active: counts.active,
      delayed: counts.delayed,
      failed: counts.failed,
      status: "healthy",
      waiting: counts.waiting,
    };
  } catch {
    queue = { active: 0, delayed: 0, failed: 0, status: "unavailable", waiting: 0 };
  }

  let worker: ServiceHealth;
  if (env.WORKER_HEALTH_URL) {
    const probe = await timed(async () => {
      const response = await fetch(env.WORKER_HEALTH_URL as string, { cache: "no-store" });
      if (!response.ok) throw new Error(`worker ${response.status}`);
    });
    worker = service("worker", "العامل (Worker)", probe);
  } else {
    worker = {
      key: "worker",
      latencyMs: null,
      name: "العامل (Worker)",
      note: "لم يُضبط WORKER_HEALTH_URL؛ لم يُفحص.",
      status: "unknown",
    };
  }

  const services: ServiceHealth[] = [
    {
      key: "web",
      latencyMs: null,
      name: "تطبيق الويب",
      note: "يخدم هذا الطلب.",
      status: "healthy",
    },
    worker,
    service("postgres", "PostgreSQL", postgres),
    service("redis", "Redis", redis),
    service("storage", "التخزين (R2)", storage),
    {
      key: "queue",
      latencyMs: null,
      name: "طابور المهام",
      note: queue
        ? `في الانتظار: ${queue.waiting} · نشطة: ${queue.active} · فاشلة: ${queue.failed}`
        : null,
      status: queue?.status ?? "unknown",
    },
  ];

  return { checkedAtIso: new Date().toISOString(), queue, services };
}
