"use client";

import {
  runEventLabel,
  runEventPayloadSchema,
  type RunEventPayload,
  type RunKind,
  type RunStatus,
} from "@wakil/shared";
import { Button, StatusBanner } from "@wakil/ui";
import {
  Activity,
  Ban,
  BrainCircuit,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { newIdempotencyKey } from "../../../../src/lib/idempotency-key";
import { cancelRunAction, startRunAction } from "../../../../src/server/actions/runs";

export type RunPanelSummary = {
  cancelRequestedAtIso: string | null;
  errorCode: string | null;
  id: string;
  kind: RunKind;
  status: RunStatus;
};

const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set(["queued", "running"]);
const TERMINAL_EVENTS = new Set(["run.cancelled", "run.failed", "run.succeeded"]);

const STATUS: Record<RunStatus, { icon: LucideIcon; label: string; className: string }> = {
  cancelled: { className: "text-fg-2", icon: Ban, label: "أُلغي" },
  failed: { className: "text-fg-danger", icon: CircleX, label: "تعذّر الإكمال" },
  queued: { className: "text-fg-info", icon: Clock3, label: "في قائمة الانتظار" },
  running: { className: "text-fg-accent", icon: Activity, label: "قيد التشغيل" },
  succeeded: { className: "text-fg-success", icon: CircleCheck, label: "اكتمل" },
};

export type RunPanelProps = {
  archived: boolean;
  /** Fires the first planning run once, right after project creation. */
  autoStart: boolean;
  initialEvents: RunEventPayload[];
  initialRun: RunPanelSummary | null;
  projectId: string;
};

export function RunPanel({
  archived,
  autoStart,
  initialEvents,
  initialRun,
  projectId,
}: RunPanelProps) {
  const router = useRouter();
  const [run, setRun] = useState<RunPanelSummary | null>(initialRun);
  const [events, setEvents] = useState<RunEventPayload[]>(initialEvents);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [startKey, setStartKey] = useState(newIdempotencyKey);
  const [cancelKey, setCancelKey] = useState(newIdempotencyKey);
  const [pending, startTransition] = useTransition();
  const seenRef = useRef(new Set(initialEvents.map((event) => event.seq)));
  const autoStartedRef = useRef(false);

  const runId = run?.id;
  const isActive = run !== null && ACTIVE_STATUSES.has(run.status);
  const cancelRequested = Boolean(run?.cancelRequestedAtIso);
  const nextKind: RunKind =
    run?.kind === "execution" || (run?.kind === "planning" && run.status === "succeeded")
      ? "execution"
      : "planning";

  const applyEvent = useCallback(
    (payload: RunEventPayload) => {
      if (seenRef.current.has(payload.seq)) return;
      seenRef.current.add(payload.seq);
      setEvents((previous) => [...previous, payload].sort((left, right) => left.seq - right.seq));

      const statusByType: Partial<Record<RunEventPayload["type"], RunStatus>> = {
        "run.cancelled": "cancelled",
        "run.failed": "failed",
        "run.started": "running",
        "run.succeeded": "succeeded",
      };
      const nextStatus = statusByType[payload.type];
      if (nextStatus) {
        setRun((current) =>
          current
            ? { ...current, status: nextStatus, errorCode: payload.errorCode ?? current.errorCode }
            : current,
        );
      }
      if (payload.type === "run.succeeded") router.refresh();
    },
    [router],
  );

  useEffect(() => {
    if (!runId || !isActive) return;

    const source = new EventSource(`/api/projects/${projectId}/runs/${runId}/events`);
    source.onopen = () => setReconnecting(false);
    source.onmessage = (message) => {
      let value: unknown;
      try {
        value = JSON.parse(message.data);
      } catch {
        return;
      }
      const parsed = runEventPayloadSchema.safeParse(value);
      if (!parsed.success) return;
      applyEvent(parsed.data);
      if (TERMINAL_EVENTS.has(parsed.data.type)) {
        source.close();
        setReconnecting(false);
      }
    };
    source.onerror = () => setReconnecting(true);

    return () => source.close();
  }, [applyEvent, isActive, projectId, runId]);

  useEffect(() => {
    if (!autoStart || archived || run || autoStartedRef.current) return;
    autoStartedRef.current = true;
    router.replace(`/projects/${projectId}`, { scroll: false });
    start();
    // Fires once: the guard ref, not the dependency list, decides re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, archived, run]);

  function start(): void {
    if (pending) return;
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await startRunAction({
          idempotencyKey: startKey,
          kind: nextKind,
          projectId,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }

        seenRef.current = new Set();
        setEvents([]);
        setRun({
          cancelRequestedAtIso: null,
          errorCode: null,
          id: result.data.runId,
          kind: nextKind,
          status: "queued",
        });
        setStartKey(newIdempotencyKey());
        setCancelKey(newIdempotencyKey());
      } catch {
        setError(
          nextKind === "planning"
            ? "تعذّر إعداد الخطة. تحقق من الاتصال ثم أعد المحاولة."
            : "تعذّر بدء التنفيذ. تحقق من الاتصال ثم أعد المحاولة.",
        );
      }
    });
  }

  function cancel(): void {
    if (!run || pending || cancelRequested) return;
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await cancelRunAction({
          idempotencyKey: cancelKey,
          projectId,
          runId: run.id,
        });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setRun((current) =>
          current ? { ...current, cancelRequestedAtIso: new Date().toISOString() } : current,
        );
        setCancelKey(newIdempotencyKey());
      } catch {
        setError("تعذّر طلب الإلغاء. تحقق من الاتصال ثم أعد المحاولة.");
      }
    });
  }

  if (archived && !run) return null;

  const status = run ? STATUS[run.status] : null;
  const StatusIcon = status?.icon;
  const streamedText = events.map((event) => event.textDelta ?? "").join("");
  const visibleEvents = events.filter((event) => event.type !== "assistant.delta");
  const failureMessage =
    run?.errorCode === "AGENT_REFUSED"
      ? "تعذّر إعداد خطة مناسبة لهذا الطلب. عدّل الطلب ثم أعد المحاولة."
      : run?.errorCode === "AGENT_LIMIT_EXCEEDED"
        ? "توقف إعداد الخطة عند حدّ الاستخدام المسموح. اختصر الطلب ثم أعد المحاولة."
        : run?.errorCode === "PROVIDER_RATE_LIMITED"
          ? "الخدمة مشغولة الآن. انتظر قليلاً ثم أعد المحاولة."
          : run?.errorCode?.startsWith("SANDBOX_")
            ? "تعذّر التحقق من الموقع في بيئة التنفيذ المعزولة. يمكنك إعادة المحاولة."
            : run?.errorCode === "STORAGE_UNAVAILABLE"
              ? "تعذّر حفظ ملفات النتيجة بشكل خاص. يمكنك إعادة المحاولة."
              : run?.kind === "execution"
                ? "تعذّر تنفيذ الموقع. يمكنك بدء محاولة جديدة."
                : "تعذّر إعداد الخطة. يمكنك بدء تشغيل جديد.";

  const executionMode = run?.kind === "execution";

  return (
    <section aria-labelledby="run-panel-title" className="wk-elevate-1 mb-4 rounded-md p-4">
      <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <h2 id="run-panel-title" className="text-base font-bold text-fg">
            {executionMode ? "تنفيذ الموقع" : "إعداد خطة المشروع"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">
            {executionMode
              ? "إنشاء وتحقق معزول ثم حفظ خاص للمعاينة والتنزيل."
              : "خطة عربية حقيقية تُحفظ أثناء وصولها."}
          </p>
        </div>
        {status && StatusIcon ? (
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full bg-overlay px-3 py-1.5 text-xs font-bold ${status.className}`}
          >
            <StatusIcon aria-hidden className={`size-4${isActive ? " animate-pulse" : ""}`} />
            {status.label}
          </span>
        ) : null}
      </div>

      {streamedText && isActive && !executionMode ? (
        <div aria-live="polite" className="my-4 rounded-md border border-line bg-surface-2 p-3">
          <p className="whitespace-pre-wrap break-words text-sm leading-7 text-fg">
            {streamedText}
          </p>
        </div>
      ) : null}

      {visibleEvents.length > 0 ? (
        <ol className="my-4 flex flex-col gap-3" aria-label="سجل خطوات التشغيل">
          {visibleEvents.map((event) => (
            <li key={event.seq} className="flex items-start gap-3 text-sm leading-6 text-fg-2">
              <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-subtle text-fg-success">
                <Check aria-hidden className="size-3.5" />
              </span>
              <span>{runEventLabel(event)}</span>
            </li>
          ))}
        </ol>
      ) : isActive ? (
        <div
          aria-live="polite"
          className="my-4 flex items-center gap-3 rounded-md border border-line bg-surface-2 p-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-fg-accent">
            <BrainCircuit aria-hidden className="size-5 animate-pulse" />
          </span>
          <p className="text-sm leading-6 text-fg">
            {executionMode ? "وكيل يجهّز بيئة التنفيذ الآن…" : "وكيل يفكّر في طلبك الآن…"}
          </p>
        </div>
      ) : run ? (
        <p className="my-4 text-sm leading-6 text-fg-2">بانتظار أول تحديث محفوظ من العامل.</p>
      ) : (
        <p className="my-4 text-sm leading-6 text-fg-2">
          ابدأ بإعداد خطة قصيرة لتراجعها قبل تنفيذ المشروع.
        </p>
      )}

      {reconnecting && isActive ? (
        <StatusBanner className="mb-3" tone="info">
          جارٍ إعادة الاتصال لمتابعة التحديثات المحفوظة…
        </StatusBanner>
      ) : null}

      {cancelRequested && isActive ? (
        <StatusBanner className="mb-3" tone="warning">
          تم إرسال طلب الإلغاء. سيتوقف العامل عند نقطة التحقق التالية.
        </StatusBanner>
      ) : null}

      {run?.status === "failed" ? (
        <StatusBanner className="mb-3" tone="danger">
          {failureMessage}
        </StatusBanner>
      ) : null}

      {error ? (
        <StatusBanner className="mb-3" tone="danger">
          {error}
        </StatusBanner>
      ) : null}

      {archived ? null : isActive ? (
        <Button
          className="w-full"
          variant="secondary"
          onClick={cancel}
          loading={pending}
          disabled={cancelRequested}
        >
          {cancelRequested ? "تم طلب الإلغاء" : "إلغاء التشغيل"}
        </Button>
      ) : run?.kind === "execution" && run.status === "succeeded" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Button onClick={() => router.push(`/projects/${projectId}/preview`)}>عرض النتيجة</Button>
          <Button variant="secondary" onClick={start} loading={pending}>
            إعادة التنفيذ
          </Button>
        </div>
      ) : (
        <Button className="w-full" onClick={start} loading={pending}>
          {nextKind === "execution" ? "بدء تنفيذ الموقع" : "إعداد الخطة"}
        </Button>
      )}
    </section>
  );
}
