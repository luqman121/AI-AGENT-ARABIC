export type ReadinessProbe = () => Promise<void>;

export interface WebReadinessProbes {
  database: ReadinessProbe;
  redis: ReadinessProbe;
}

export interface WebReadinessResult {
  ready: boolean;
}

/** Returns only aggregate readiness so a public probe cannot enumerate private dependencies. */
export async function checkWebReadiness(probes: WebReadinessProbes): Promise<WebReadinessResult> {
  const checks = await Promise.allSettled([probes.database(), probes.redis()]);
  return { ready: checks.every((check) => check.status === "fulfilled") };
}
