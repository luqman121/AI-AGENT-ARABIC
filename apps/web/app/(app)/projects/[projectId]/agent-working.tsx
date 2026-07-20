"use client";

import {
  runEventLabel,
  type RunEventPayload,
  type RunEventType,
  type RunKind,
  type RunStatus,
} from "@wakil/shared";
import { BrainCircuit, Check, ChevronDown, Circle, LoaderCircle, X } from "lucide-react";

export type AgentWorkingProps = {
  runKind: RunKind;
  status: RunStatus;
  /** Visible events (no assistant deltas), oldest first — drives the timeline. */
  events: RunEventPayload[];
  /** Type of the most recent event of any kind — drives the live status line. */
  latestEventType?: RunEventType | undefined;
  /** The streamed plan text; shown capped inside the details accordion. */
  streamedText: string;
  /** True while the run is genuinely queued or running. */
  active: boolean;
  detailsOpen: boolean;
  onToggleDetails: () => void;
};

type StepState = "completed" | "active" | "failed" | "pending";

/** Four high-level phases spanning the whole planning → build flow. */
const STEPS = ["فهم الطلب", "إعداد الخطة", "إنشاء الموقع", "تجهيز النتيجة"] as const;

/** Generic fallback lines, used only when no mapped event is available yet. */
const ACTIVE_LINE = [
  "جارٍ فهم الطلب…",
  "جارٍ إعداد الخطة…",
  "جارٍ إنشاء الموقع…",
  "جارٍ تجهيز النتيجة…",
] as const;

/** Honest, event-driven status lines — each maps to a real persisted event. */
const EVENT_STATUS: Partial<Record<RunEventType, string>> = {
  "agent.started": "جارٍ تحليل الطلب…",
  "artifact.generating": "جارٍ إنشاء الملفات…",
  "artifact.ready": "جارٍ تجهيز النتيجة…",
  "artifact.uploading": "جارٍ حفظ النتيجة…",
  "assistant.completed": "اكتملت الخطة…",
  "assistant.delta": "جارٍ إعداد الخطة…",
  "run.queued": "في قائمة الانتظار…",
  "run.started": "جارٍ البدء…",
  "sandbox.created": "جارٍ تجهيز بيئة التنفيذ…",
  "sandbox.validated": "جارٍ التحقق من الموقع…",
};

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"] as const;
const toArabicDigits = (value: number): string =>
  String(value).replace(/\d/g, (digit) => AR_DIGITS[Number(digit)] ?? digit);

type Phase = { activeIndex: number; mode: "active" | "failed" | "cancelled" | "done" };

/**
 * Maps the real run kind, status, and persisted event types to a phase across
 * the unified checklist. Planning occupies steps 0–1; execution 2–3. A
 * succeeded planning run reads as "building next" because execution
 * auto-continues immediately.
 */
function phaseFor(runKind: RunKind, status: RunStatus, events: RunEventPayload[]): Phase {
  const types = new Set(events.map((event) => event.type));

  if (runKind === "planning") {
    const planningActive = types.has("agent.started") || types.has("assistant.delta") ? 1 : 0;
    if (status === "failed") return { activeIndex: planningActive, mode: "failed" };
    if (status === "cancelled") return { activeIndex: planningActive, mode: "cancelled" };
    if (status === "succeeded") return { activeIndex: 2, mode: "active" };
    return { activeIndex: planningActive, mode: "active" };
  }

  // Execution: planning (steps 0–1) is already complete.
  const executionActive = types.has("artifact.uploading") || types.has("sandbox.validated") ? 3 : 2;
  if (status === "succeeded") return { activeIndex: 3, mode: "done" };
  if (status === "failed") return { activeIndex: executionActive, mode: "failed" };
  if (status === "cancelled") return { activeIndex: executionActive, mode: "cancelled" };
  return { activeIndex: executionActive, mode: "active" };
}

function stepStateFor(index: number, phase: Phase): StepState {
  if (phase.mode === "done") return "completed";
  if (index < phase.activeIndex) return "completed";
  if (index > phase.activeIndex) return "pending";
  if (phase.mode === "failed" || phase.mode === "cancelled") return "failed";
  return "active";
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "completed") return <Check aria-hidden className="wk-check-pop size-3.5" />;
  if (state === "failed") return <X aria-hidden className="size-3.5" />;
  if (state === "active")
    return <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />;
  return <Circle aria-hidden className="size-2" />;
}

/**
 * The signature "working" surface: a small, alive brain (slow spin + breathe +
 * soft glow), one honest event-driven status line, and a compact checklist of
 * the real phases. Thinking stays hidden behind an opt-in timeline accordion so
 * the default view is calm.
 */
export function AgentWorking({
  active,
  detailsOpen,
  events,
  latestEventType,
  onToggleDetails,
  runKind,
  status,
  streamedText,
}: AgentWorkingProps) {
  const phase = phaseFor(runKind, status, events);
  const statusLine =
    (latestEventType ? EVENT_STATUS[latestEventType] : undefined) ??
    ACTIVE_LINE[phase.activeIndex] ??
    "جارٍ العمل…";
  const stageNumber = Math.min(phase.activeIndex + 1, STEPS.length);
  const hasDetails = streamedText.length > 0 || events.length > 0;

  return (
    <div className="flex flex-col items-center py-5 text-center">
      <div className="relative flex size-14 items-center justify-center">
        {active ? (
          <span
            aria-hidden
            className="wk-glow absolute size-14 rounded-full bg-accent/25 blur-md"
          />
        ) : null}
        <span className="wk-breathe relative flex size-14 items-center justify-center rounded-full bg-accent-subtle text-fg-accent">
          <BrainCircuit aria-hidden className="wk-brain-spin size-7" />
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-1.5" aria-live="polite">
        <p className="text-base font-bold leading-6 text-fg">الوكيل يعمل الآن</p>
        <p className="text-sm leading-6 text-fg-2">
          <span key={statusLine} className="wk-timeline-in inline-block">
            {statusLine}
          </span>
        </p>
        {phase.mode === "active" ? (
          <p className="text-xs tracking-wide text-fg-3">
            المرحلة {toArabicDigits(stageNumber)} من {toArabicDigits(STEPS.length)}
          </p>
        ) : null}
      </div>

      <ol
        className="mt-7 flex w-full max-w-[15rem] flex-col gap-3 text-start"
        aria-label="مراحل العمل"
      >
        {STEPS.map((label, index) => {
          const state = stepStateFor(index, phase);
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ${
                  state === "completed"
                    ? "bg-success-subtle text-fg-success"
                    : state === "failed"
                      ? "bg-danger-subtle text-fg-danger"
                      : state === "active"
                        ? "bg-accent-subtle text-fg-accent motion-safe:animate-pulse"
                        : "bg-overlay text-fg-3"
                }`}
              >
                <StepIcon state={state} />
              </span>
              <span
                className={`text-sm transition-colors duration-200 ${
                  state === "pending" ? "text-fg-3" : "font-semibold text-fg"
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {hasDetails ? (
        <div className="mt-6 w-full max-w-[15rem] text-start">
          <button
            type="button"
            aria-expanded={detailsOpen}
            onClick={onToggleDetails}
            className="wk-focus-ring inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-fg-accent"
          >
            عرض التفاصيل
            <ChevronDown
              aria-hidden
              className={`size-4 transition-transform duration-200 ${
                detailsOpen ? "rotate-180" : ""
              }`}
            />
          </button>
          <div
            className={`grid transition-[grid-template-rows] duration-200 ease-out ${
              detailsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="overflow-hidden">
              <div className="pt-3">
                {events.length > 0 ? (
                  <ol className="flex flex-col">
                    {events.map((event, index) => {
                      const last = index === events.length - 1;
                      return (
                        <li
                          key={event.seq}
                          className={`flex gap-3 ${last ? "wk-timeline-in" : ""}`}
                        >
                          <span className="flex flex-col items-center">
                            <span className="mt-1 size-1.5 shrink-0 rounded-full bg-fg-accent" />
                            {last ? null : <span className="w-px flex-1 bg-line" />}
                          </span>
                          <span className="pb-2.5 text-xs leading-5 text-fg-2">
                            {runEventLabel({ type: event.type })}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
                {streamedText ? (
                  <div className="mt-1">
                    <p className="mb-1 text-xs font-semibold text-fg-3">الخطة</p>
                    <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-overlay p-3 text-xs leading-6 text-fg-2">
                      {streamedText}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
