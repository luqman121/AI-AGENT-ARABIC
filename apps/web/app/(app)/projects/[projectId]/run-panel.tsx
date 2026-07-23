"use client";

import {
  runEventPayloadSchema,
  type RunEventPayload,
  type RunKind,
  type OutputKind,
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
  outputKind: string;
  projectId: string;
  projectTitle: string;
};

export function RunPanel({
  archived,
  artifacts,
  autoStart,
  initialEvents,
  initialRun,
  outputKind,
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const seenRef = useRef(new Set(initialEvents.map((event) => event.seq)));
  const hydratedRunIdRef = useRef(initialRun?.id);
  const autoStartedRef = useRef(false);

  const runId = run?.id;
  const executionLabel: Partial<Record<OutputKind, string>> = {
    document: "ابدأ إنشاء المستند",
    pdf: "ابدأ إنشاء PDF",
    presentation: "ابدأ إنشاء العرض",
    spreadsheet: "ابدأ إنشاء Excel",
    static_site: "ابدأ إنشاء الموقع",
  };
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
      // Refresh every successful run: planning success persists the reviewable
      // assistant plan, while execution success persists the artifact.
      if (payload.type === "run.succeeded") {
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
  const latestEventType = events.length > 0 ? events[events.length - 1]?.type : undefined;
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

  const planReady = run?.kind === "planning" && run.status === "succeeded";
  const working = !archived && (isActive || (!run && autoStart));
  const isFailed = run?.status === "failed";
  const isCancelled = run?.status === "cancelled";

  return (
    <section id="activity" aria-label="حالة الوكيل" className="mb-4 scroll-mt-32">
      {working ? (
        <AgentWorking
          runKind={run?.kind ?? "planning"}
          status={run?.status ?? "queued"}
          events={visibleEvents}
          latestEventType={latestEventType}
          streamedText={streamedText}
          active={isActive}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((open) => !open)}
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

      {planReady && artifacts.length === 0 ? (
        <StatusBanner className="mb-3" tone="info">
          الخطة جاهزة للمراجعة. ابدأ الإنشاء عندما تتأكد من اتجاه المشروع.
        </StatusBanner>
      ) : null}

      {artifacts.length > 0 ? (
        <div className="mb-2 flex flex-col gap-3" aria-label="نتائج المشروع">
          {artifacts.map((artifact, index) => (
            <ArtifactResultCard
              artifact={artifact}
              key={artifact.id}
              projectId={projectId}
              primary={index === 0}
              rebuilding={pending}
              title={index === 0 ? projectTitle : `${projectTitle} — إصدار سابق`}
            />
          ))}
        </div>
      ) : null}

      {archived ? null : isActive ? (
        // While working, the only bottom action is Cancel.
        <Button
          className="w-full"
          variant="ghost"
          onClick={cancel}
          loading={pending}
          disabled={cancelRequested}
        >
          {cancelRequested ? "تم طلب الإلغاء" : "إلغاء التشغيل"}
        </Button>
      ) : planReady ? (
        <Button className="w-full" onClick={start} loading={pending}>
          {executionLabel[outputKind as OutputKind] ?? "ابدأ التنفيذ"}
        </Button>
      ) : isFailed ? (
        <Button className="w-full" onClick={start} loading={pending}>
          إعادة المحاولة
        </Button>
      ) : isCancelled ? (
        <Button className="w-full" onClick={start} loading={pending}>
          ابدأ من جديد
        </Button>
      ) : !run ? (
        <Button className="w-full" onClick={start} loading={pending}>
          ابدأ العمل
        </Button>
      ) : null}
    </section>
  );
}
