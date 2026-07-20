"use client";

import { runEventLabel, type RunEventPayload, type RunKind, type RunStatus } from "@wakil/shared";
import { BrainCircuit, Check, Circle, LoaderCircle, X } from "lucide-react";

export type AgentWorkingProps = {
  runKind: RunKind;
  status: RunStatus;
  events: RunEventPayload[];
  /** The streamed plan/thinking text; hidden behind the details disclosure. */
  streamedText: string;
  /** True while the run is genuinely queued or running. */
  active: boolean;
};

type StepState = "completed" | "active" | "failed" | "pending";

/** Four high-level phases spanning the whole planning → build flow. */
const STEPS = ["فهم الطلب", "إعداد الخطة", "إنشاء الموقع", "تجهيز النتيجة"] as const;

const ACTIVE_LINE = [
  "جارٍ فهم الطلب…",
  "جارٍ إعداد الخطة…",
  "جارٍ إنشاء الموقع…",
  "جارٍ تجهيز النتيجة…",
] as const;

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
  if (state === "completed") return <Check aria-hidden className="size-3.5" />;
  if (state === "failed") return <X aria-hidden className="size-3.5" />;
  if (state === "active")
    return <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />;
  return <Circle aria-hidden className="size-2.5" />;
}

/**
 * The signature "working" surface: a slowly rotating brain, one honest status
 * line, and a compact checklist of the real phases. The agent's thinking text
 * stays hidden behind an opt-in disclosure so the default view is calm.
 */
export function AgentWorking({ active, events, runKind, status, streamedText }: AgentWorkingProps) {
  const phase = phaseFor(runKind, status, events);
  const activeLine = ACTIVE_LINE[phase.activeIndex] ?? "جارٍ العمل…";
  const hasDetails = streamedText.length > 0 || events.length > 0;

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="relative flex size-20 items-center justify-center">
        {active ? (
          <span
            aria-hidden
            className="absolute inset-0 rounded-full bg-accent-subtle motion-safe:animate-ping"
          />
        ) : null}
        <span className="relative flex size-20 items-center justify-center rounded-full bg-accent-subtle text-fg-accent">
          <BrainCircuit
            aria-hidden
            className="size-9 motion-safe:animate-spin [animation-duration:3s]"
          />
        </span>
      </div>

      <div className="flex flex-col gap-1" aria-live="polite">
        <p className="text-base font-bold text-fg">الوكيل يعمل الآن</p>
        <p className="text-sm leading-6 text-fg-2">{activeLine}</p>
      </div>

      <ol className="flex w-full max-w-xs flex-col gap-2 text-start" aria-label="مراحل العمل">
        {STEPS.map((label, index) => {
          const state = stepStateFor(index, phase);
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                  state === "completed"
                    ? "bg-success-subtle text-fg-success"
                    : state === "failed"
                      ? "bg-danger-subtle text-fg-danger"
                      : state === "active"
                        ? "bg-accent-subtle text-fg-accent"
                        : "bg-overlay text-fg-3"
                }`}
              >
                <StepIcon state={state} />
              </span>
              <span
                className={`text-sm ${state === "pending" ? "text-fg-3" : "font-semibold text-fg"}`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {hasDetails ? (
        <details className="w-full max-w-xs text-start">
          <summary className="wk-focus-ring inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-fg-accent">
            عرض التفاصيل
          </summary>
          {streamedText ? (
            <p className="mt-3 whitespace-pre-wrap break-words rounded-md bg-overlay p-3 text-sm leading-7 text-fg-2">
              {streamedText}
            </p>
          ) : null}
          {events.length > 0 ? (
            <ol className="mt-3 flex flex-col gap-1 border-s border-line ps-3 text-xs text-fg-3">
              {events.map((event) => (
                <li key={event.seq}>
                  <span className="font-mono" dir="ltr">
                    #{event.seq}
                  </span>{" "}
                  {runEventLabel({ type: event.type })}
                </li>
              ))}
            </ol>
          ) : null}
        </details>
      ) : null}
    </div>
  );
}
