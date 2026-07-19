"use client";

import { runEventLabel, type RunEventPayload } from "@wakil/shared";
import { Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useState } from "react";

const COLLAPSE_THRESHOLD = 5;

/**
 * The visible, ordered execution log. Every persisted event stays in the
 * DOM (list role + item text are a load-bearing test contract) — collapsing
 * only hides older rows behind a toggle that defaults open, so nothing a
 * screen reader or a saved-state assertion depends on disappears silently.
 */
export function ExecutionTimeline({
  events,
  isActive,
}: {
  events: RunEventPayload[];
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const collapsible = events.length > COLLAPSE_THRESHOLD;
  const visible = collapsible && !expanded ? events.slice(-3) : events;

  return (
    <div className="my-4">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="wk-focus-ring mb-2 inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-fg-2 hover:text-fg"
        >
          {expanded ? (
            <ChevronUp aria-hidden className="size-4" />
          ) : (
            <ChevronDown aria-hidden className="size-4" />
          )}
          {expanded ? "إخفاء التفاصيل" : `عرض التفاصيل (${events.length} إجراء)`}
        </button>
      ) : null}
      <ol className="flex flex-col gap-3" aria-label="سجل خطوات التشغيل">
        {visible.map((event) => {
          const isLast = event.seq === events[events.length - 1]?.seq;
          const running = isLast && isActive;
          return (
            <li key={event.seq} className="flex items-start gap-3 text-sm leading-6 text-fg-2">
              <span
                className={
                  running
                    ? "mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-fg-accent"
                    : "mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-subtle text-fg-success"
                }
              >
                {running ? (
                  <Loader2 aria-hidden className="size-3.5 animate-spin" />
                ) : (
                  <Check aria-hidden className="size-3.5" />
                )}
              </span>
              <span>{runEventLabel(event)}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
