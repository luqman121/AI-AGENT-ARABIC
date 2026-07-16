export type ReadinessProbe = () => Promise<void>;

export interface ReadinessProbes {
  database: ReadinessProbe;
  redis: ReadinessProbe;
}

export interface ReadinessResult {
  checks: {
    database: "ready" | "unavailable";
    redis: "ready" | "unavailable";
  };
  ready: boolean;
}

export async function checkReadiness(probes: ReadinessProbes): Promise<ReadinessResult> {
  const [database, redis] = await Promise.allSettled([probes.database(), probes.redis()]);
  const checks = {
    database: database.status === "fulfilled" ? "ready" : "unavailable",
    redis: redis.status === "fulfilled" ? "ready" : "unavailable",
  } as const;

  return {
    checks,
    ready: checks.database === "ready" && checks.redis === "ready",
  };
}
