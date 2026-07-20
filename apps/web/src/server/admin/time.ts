/**
 * Admin time windows use UTC day/month boundaries so metrics are deterministic
 * and testable regardless of server locale. Documented in docs/admin-dashboard.md.
 */

export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function startOfUtcMonth(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Human-friendly Arabic duration from milliseconds (e.g. "٣٫٢ ث", "٢ د ١٠ ث"). */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} ث`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  if (minutes < 60) return rem > 0 ? `${minutes} د ${rem} ث` : `${minutes} د`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours} س ${remMin} د` : `${hours} س`;
}

/** Duration between two instants, in ms, or null when either is missing. */
export function durationBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return ms >= 0 ? ms : null;
}
