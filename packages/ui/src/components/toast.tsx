"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect } from "react";

import { cn } from "../lib/cn";

export type ToastData = {
  id: number;
  tone: "success" | "danger";
  message: string;
};

export type ToastProps = {
  toast: ToastData | null;
  onDismiss: (id: number) => void;
  /** Auto-dismiss delay; design system fixes it at 4s. */
  durationMs?: number;
};

/**
 * Single polite toast above the bottom navigation. Never steals focus;
 * screen readers hear it through the persistent aria-live region.
 */
export function Toast({ durationMs = 4000, onDismiss, toast }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => onDismiss(toast.id), durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDismiss, toast]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-(--wk-z-toast) flex justify-center px-4 pb-[env(safe-area-inset-bottom)]"
    >
      {toast ? (
        <div
          className={cn(
            "wk-elevate-2 wk-rise-in flex min-h-11 max-w-90 items-center gap-2.5 rounded-md px-4 py-2.5",
            "text-sm font-semibold text-fg",
          )}
        >
          {toast.tone === "success" ? (
            <CircleCheck aria-hidden className="size-5 shrink-0 text-fg-success" />
          ) : (
            <CircleAlert aria-hidden className="size-5 shrink-0 text-fg-danger" />
          )}
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
