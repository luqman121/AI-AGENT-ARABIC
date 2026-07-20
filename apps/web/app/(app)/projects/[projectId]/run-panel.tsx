"use client";

import {
  runEventPayloadSchema,
  type RunEventPayload,
  type RunKind,
  type RunStatus,
} from "@wakil/shared";
import { Button, StatusBanner } from "@wakil/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { newIdempotencyKey } from "../../../../src/lib/idempotency-key";
import { cancelRunAction, startRunAction } from "../../../../src/server/actions/runs";
import { AgentWorking } from "./agent-working";
import { ArtifactResultCard, type ArtifactResultSummary } from "./artifact-result-card";

export type RunPanelSummary = {
  cancelRequestedAtIso: string | null;
  errorCode: string | null;
  id: string;
  kind: RunKind;
  status: RunStatus;
};

const ACTIVE_STATUSES: ReadonlySet<RunStatus> = new Set(["queued", "running"]);
const TERMINAL_EVENTS = new Set(["run.cancelled", "run.failed", "run.succeeded"]);

export type RunPanelProps = {
  archived: boolean;
  /** Fires the first planning run once, right after project creation. */
  autoStart: boolean;
  initialEvents: RunEventPayload[];
  initialRun: RunPanelSummary | null;
  artifacts: ArtifactResultSummary[];
  projectId: string;
  projectTitle: string;
};

export function RunPanel({
  archived,
  artifacts,
  autoStart,
  initialEvents,
  initialRun,
  projectId,
  projectTitle,
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
  const hydratedRunIdRef = useRef(initialRun?.id);
  const autoStartedRef = useRef(false);
  const runKindRef = useRef<RunKind | null>(initialRun?.kind ?? null);
  const autoExecutedForRef = useRef<string | null>(null);

  const runId = run?.id;
  const isActive = run !== null && ACTIVE_STATUSES.has(run.status);
  const cancelRequested = Boolean(run?.cancelRequestedAtIso);
  const nextKind: RunKind =
    run?.kind === "execution" || (run?.kind === "planning" && run.status === "succeeded")
      ? "execution"
      : "planning";

  useEffect(() => {
    runKindRef.current = run?.kind ?? null;
  }, [run]);

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
      // Planning success flows straight into execution (handled by the
      // auto-continue effect); only refresh for execution success, which is
      // when the persisted artifact becomes available to load.
      if (payload.type === "run.succeeded" && runKindRef.current === "execution") {
        router.refresh();
      }
    },
    [router],
  );

  useEffect(() => {
    const incomingRunId = initialRun?.id;
    if (hydratedRunIdRef.current === incomingRunId) return;
    hydratedRunIdRef.current = incomingRunId;
    seenRef.current = new Set(initialEvents.map((event) => event.seq));
    setEvents(initialEvents);
    setRun(initialRun);
    setReconnecting(false);
  }, [initialEvents, initialRun]);

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

  // Fully automatic: a succeeded planning run continues straight into the
  // website build with no manual tap. Guarded per planning-run id so it fires
  // exactly once and never loops on a failed execution.
  useEffect(() => {
    if (archived || !run) return;
    if (run.kind !== "planning" || run.status !== "succeeded") return;
    if (artifacts.length > 0) return;
    if (autoExecutedForRef.current === run.id) return;
    autoExecutedForRef.current = run.id;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, archived, artifacts.length]);

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
            ? "تعذّر بدء العمل. تحقق من الاتصال ثم أعد المحاولة."
            : "تعذّر إنشاء الموقع. تحقق من الاتصال ثم أعد المحاولة.",
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

  const streamedText = events.map((event) => event.textDelta ?? "").join("");
  const visibleEvents = events.filter((event) => event.type !== "assistant.delta");
  const failureMessage =
    run?.errorCode === "AGENT_REFUSED"
      ? "تعذّر إعداد نتيجة مناسبة لهذا الطلب. عدّل الطلب ثم أعد المحاولة."
      : run?.errorCode === "AGENT_LIMIT_EXCEEDED"
        ? "توقف العمل عند حدّ الاستخدام المسموح. اختصر الطلب ثم أعد المحاولة."
        : run?.errorCode === "PROVIDER_RATE_LIMITED"
          ? "الخدمة مشغولة الآن. انتظر قليلاً ثم أعد المحاولة."
          : run?.errorCode?.startsWith("SANDBOX_")
            ? "تعذّر التحقق من الموقع في بيئة التنفيذ المعزولة. يمكنك إعادة المحاولة."
            : run?.errorCode === "STORAGE_UNAVAILABLE"
              ? "تعذّر حفظ ملفات النتيجة بشكل خاص. يمكنك إعادة المحاولة."
              : "تعذّر إكمال العمل. يمكنك إعادة المحاولة.";

  // "Working" spans the whole automatic flow: an active run, the brief window
  // where a succeeded plan is handing off to the build, and the pre-run instant
  // right after creation before the first run exists.
  const working =
    !archived &&
    (isActive ||
      (run?.kind === "planning" && run.status === "succeeded" && artifacts.length === 0) ||
      (!run && autoStart));
  const isFailed = run?.status === "failed";
  const isCancelled = run?.status === "cancelled";

  return (
    <section aria-label="حالة الوكيل" className="mb-4">
      {working ? (
        <AgentWorking
          runKind={run?.kind ?? "planning"}
          status={run?.status ?? "queued"}
          events={visibleEvents}
          streamedText={streamedText}
          active={isActive}
        />
      ) : null}

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

      {isFailed ? (
        <StatusBanner className="mb-3" tone="danger">
          {failureMessage}
        </StatusBanner>
      ) : null}

      {isCancelled ? (
        <StatusBanner className="mb-3" tone="info">
          أُلغيت العملية. يمكنك البدء من جديد.
        </StatusBanner>
      ) : null}

      {error ? (
        <StatusBanner className="mb-3" tone="danger">
          {error}
        </StatusBanner>
      ) : null}

      {artifacts.length > 0 ? (
        <div className="mb-4 flex flex-col gap-3" aria-label="نتائج المشروع">
          {artifacts.map((artifact, index) => (
            <ArtifactResultCard
              artifact={artifact}
              key={artifact.id}
              projectId={projectId}
              title={index === 0 ? projectTitle : `${projectTitle} — إصدار سابق`}
            />
          ))}
        </div>
      ) : null}

      {archived ? null : isActive ? (
        <Button
          className="w-full"
          variant="ghost"
          onClick={cancel}
          loading={pending}
          disabled={cancelRequested}
        >
          {cancelRequested ? "تم طلب الإلغاء" : "إلغاء التشغيل"}
        </Button>
      ) : isFailed ? (
        <Button className="w-full" onClick={start} loading={pending}>
          إعادة المحاولة
        </Button>
      ) : isCancelled ? (
        <Button className="w-full" onClick={start} loading={pending}>
          ابدأ من جديد
        </Button>
      ) : artifacts.length > 0 ? (
        <Button className="w-full" variant="ghost" onClick={start} loading={pending}>
          إعادة الإنشاء
        </Button>
      ) : !run ? (
        <Button className="w-full" onClick={start} loading={pending}>
          ابدأ العمل
        </Button>
      ) : null}
    </section>
  );
}
