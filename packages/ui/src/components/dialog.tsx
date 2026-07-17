"use client";

import { X } from "lucide-react";
import { Dialog as RadixDialog } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Short supporting sentence under the title. */
  description?: string | undefined;
  children: ReactNode;
  className?: string;
};

/**
 * Centered mobile dialog. Focus is trapped while open and returns to the
 * trigger on close (Radix defaults). Scrim click and the close button dismiss.
 */
export function Dialog({
  children,
  className,
  description,
  onOpenChange,
  open,
  title,
}: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="wk-fade-in fixed inset-0 z-(--wk-z-overlay) bg-(--wk-bg-scrim)" />
        <RadixDialog.Content
          className={cn(
            "wk-elevate-2 wk-dialog-in fixed left-1/2 top-1/2 z-(--wk-z-overlay) w-[calc(100vw-32px)] max-w-100",
            "-translate-x-1/2 -translate-y-1/2 rounded-md p-5",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <RadixDialog.Title className="text-xl font-bold text-fg">{title}</RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button
                type="button"
                aria-label="إغلاق"
                className="wk-focus-ring -me-2 -mt-1 inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-2 hover:bg-overlay hover:text-fg"
              >
                <X aria-hidden className="size-5" />
              </button>
            </RadixDialog.Close>
          </div>
          {description ? (
            <RadixDialog.Description className="mt-1 text-sm text-fg-2">
              {description}
            </RadixDialog.Description>
          ) : null}
          <div className="mt-4">{children}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
