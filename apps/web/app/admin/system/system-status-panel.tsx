"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge, type BadgeTone } from "../_components/ui";

type ServiceStatus = "healthy" | "degraded" | "unavailable" | "unknown";
type ServiceHealth = {
  key: string;
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
  note: string | null;
};
type SystemHealth = { checkedAtIso: string; services: ServiceHealth[] };

const STATUS_LABEL: Record<ServiceStatus, string> = {
  degraded: "متذبذب",
  healthy: "سليم",
  unavailable: "متوقف",
  unknown: "غير معروف",
};

const STATUS_TONE: Record<ServiceStatus, BadgeTone> = {
  degraded: "warning",
  healthy: "success",
  unavailable: "danger",
  unknown: "neutral",
};

function timeLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-u-nu-latn", { timeStyle: "medium" }).format(new Date(iso));
  } catch {
    return "—";
  }
}

/**
 * Fetches the server-side health snapshot. Optional low-frequency polling
 * (pollMs > 0) pauses whenever the tab is hidden, and a manual refresh is
 * always available. Never shows "healthy" before a real check has returned.
 */
export function SystemStatusPanel({ initialPollMs = 0 }: { initialPollMs?: number }) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/system", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as SystemHealth;
      setHealth(data);
      setState("ready");
    } catch {
      setState((current) => (current === "ready" ? "ready" : "error"));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    if (initialPollMs <= 0) return;
    function start() {
      if (timerRef.current) return;
      timerRef.current = setInterval(() => {
        if (!document.hidden) void load();
      }, initialPollMs);
    }
    function stop() {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    start();
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    return stop;
  }, [initialPollMs, load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-fg-3" aria-live="polite">
          {health ? `آخر فحص: ${timeLabel(health.checkedAtIso)}` : "جارٍ الفحص…"}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="wk-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-fg-accent"
        >
          <RefreshCw aria-hidden className="size-4" />
          تحديث
        </button>
      </div>

      {state === "loading" && !health ? (
        <ul className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((index) => (
            <li key={index} className="h-9 animate-pulse rounded-md bg-overlay/50" />
          ))}
        </ul>
      ) : state === "error" && !health ? (
        <p className="text-sm text-fg-danger">تعذّر جلب حالة النظام. أعد المحاولة.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {health?.services.map((svc) => (
            <li
              key={svc.key}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-overlay/30"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{svc.name}</span>
                {svc.note ? <span className="block text-xs text-fg-3">{svc.note}</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {svc.latencyMs !== null ? (
                  <span className="text-xs tabular-nums text-fg-3">{svc.latencyMs}ms</span>
                ) : null}
                <Badge tone={STATUS_TONE[svc.status]}>{STATUS_LABEL[svc.status]}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
