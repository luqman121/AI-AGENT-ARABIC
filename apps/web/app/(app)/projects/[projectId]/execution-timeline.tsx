"use client";

import { runEventLabel, type RunEventPayload, type RunKind, type RunStatus } from "@wakil/shared";
import { Check, Circle, LoaderCircle, X } from "lucide-react";

export type ExecutionTimelineProps = {
  events: RunEventPayload[];
  runKind: RunKind;
  status: RunStatus;
};

type StageState = "active" | "completed" | "failed" | "pending";

const STAGE_STATE_LABEL: Record<StageState, string> = {
  active: "جارٍ التنفيذ",
  completed: "مكتملة",
  failed: "فشلت",
  pending: "بانتظار التنفيذ",
};

const STAGES = [
  { key: "understanding", label: "فهم الطلب", description: "قراءة المتطلبات وتحديد الهدف" },
  { key: "attachments", label: "تحليل الملفات", description: "استخراج السياق من المرفقات المتاحة" },
  {
    key: "planning",
    label: "تجهيز خطة التنفيذ",
    description: "ترتيب الخطوات واختيار طريقة الإنجاز",
  },
  { key: "generating", label: "إنشاء المحتوى", description: "تنفيذ الخطة وإنشاء النتيجة" },
  { key: "designing", label: "تصميم النتيجة", description: "تجهيز العرض والتنسيق النهائي" },
  { key: "reviewing", label: "مراجعة الجودة", description: "فحص النتيجة والتحقق من سلامتها" },
  { key: "finalizing", label: "تجهيز الملف النهائي", description: "حفظ الملفات وتأمين روابطها" },
  { key: "complete", label: "اكتمل العمل", description: "النتيجة جاهزة للمعاينة والتنزيل" },
] as const;

function progressFor(runKind: RunKind, events: RunEventPayload[], status: RunStatus) {
  if (status === "succeeded") return 100;
  const types = new Set(events.map((event) => event.type));
  if (runKind === "planning") {
    if (types.has("assistant.completed")) return 44;
    if (types.has("assistant.delta")) return 36;
    if (types.has("agent.started")) return 30;
    if (types.has("run.started")) return 12;
    return 5;
  }
  if (types.has("artifact.ready")) return 98;
  if (types.has("artifact.uploading")) return 93;
  if (types.has("sandbox.validated")) return 86;
  if (types.has("sandbox.created")) return 74;
  if (types.has("artifact.generating")) return 65;
  if (types.has("run.started")) return 52;
  return 48;
}

function activeStageIndex(runKind: RunKind, events: RunEventPayload[], status: RunStatus) {
  if (status === "succeeded") return STAGES.length - 1;
  const types = new Set(events.map((event) => event.type));
  if (runKind === "planning") {
    if (types.has("agent.started") || types.has("assistant.delta")) return 2;
    if (types.has("run.started")) return 1;
    return 0;
  }
  if (types.has("artifact.ready")) return 7;
  if (types.has("artifact.uploading")) return 6;
  if (types.has("sandbox.validated")) return 6;
  if (types.has("sandbox.created")) return 4;
  return 3;
}

function stateFor(index: number, activeIndex: number, status: RunStatus): StageState {
  if (status === "failed" || status === "cancelled") {
    if (index < activeIndex) return "completed";
    if (index === activeIndex) return "failed";
    return "pending";
  }
  if (index < activeIndex || status === "succeeded") return "completed";
  if (index === activeIndex) return "active";
  return "pending";
}

function StageIcon({ state }: { state: StageState }) {
  if (state === "completed") return <Check aria-hidden="true" className="size-4" />;
  if (state === "failed") return <X aria-hidden="true" className="size-4" />;
  if (state === "active")
    return <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />;
  return <Circle aria-hidden="true" className="size-3" />;
}

export function ExecutionTimeline({ events, runKind, status }: ExecutionTimelineProps) {
  const progress = progressFor(runKind, events, status);
  const activeIndex = activeStageIndex(runKind, events, status);

  return (
    <section aria-label="تقدم التنفيذ" className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold text-text-primary">تقدم التنفيذ</span>
          <span className="font-mono text-xs text-text-secondary" dir="ltr">
            {progress}%
          </span>
        </div>
        <div
          aria-label={`اكتمل ${progress} بالمئة`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-slow motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ol className="space-y-1" aria-live="polite">
        {STAGES.map((stage, index) => {
          const stageState = stateFor(index, activeIndex, status);
          return (
            <li
              aria-current={stageState === "active" ? "step" : undefined}
              className={`grid grid-cols-[2rem_1fr] gap-2 rounded-xl px-2 py-2.5 ${
                stageState === "active" ? "bg-brand-soft" : ""
              }`}
              key={stage.key}
            >
              <span
                className={`mt-0.5 flex size-7 items-center justify-center rounded-full ${
                  stageState === "completed"
                    ? "bg-success-soft text-success"
                    : stageState === "failed"
                      ? "bg-danger-soft text-danger"
                      : stageState === "active"
                        ? "bg-brand text-text-inverse"
                        : "bg-surface-muted text-text-tertiary"
                }`}
              >
                <StageIcon state={stageState} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text-primary">{stage.label}</span>
                <span className="sr-only">، {STAGE_STATE_LABEL[stageState]}.</span>
                <span className="block text-xs leading-5 text-text-secondary">
                  {stage.description}
                </span>
              </span>
            </li>
          );
        })}
      </ol>

      {events.length > 0 ? (
        <details className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-text-secondary">
          <summary className="cursor-pointer font-semibold text-text-primary">
            تفاصيل التنفيذ
          </summary>
          <ol className="mt-2 space-y-1 border-r border-border pr-3">
            {events.map((event) => (
              <li key={event.seq}>
                <span className="font-mono" dir="ltr">
                  #{event.seq}
                </span>{" "}
                {runEventLabel({ type: event.type })}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}
