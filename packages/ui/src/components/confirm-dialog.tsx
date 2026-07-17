"use client";

import { AlertDialog as RadixAlertDialog } from "radix-ui";

import { cn } from "../lib/cn";
import { Button } from "./button";

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Plain-language Arabic consequence sentence. */
  description: string;
  confirmLabel: string;
  cancelLabel?: string | undefined;
  /** Destructive confirmations render the danger button. */
  destructive?: boolean | undefined;
  loading?: boolean | undefined;
  onConfirm: () => void;
  className?: string;
};

/**
 * Confirmation before a consequential action. Every dismissal path
 * (scrim, escape, cancel) means cancel — only the confirm button confirms.
 */
export function ConfirmDialog({
  cancelLabel = "إلغاء",
  className,
  confirmLabel,
  description,
  destructive,
  loading,
  onConfirm,
  onOpenChange,
  open,
  title,
}: ConfirmDialogProps) {
  return (
    <RadixAlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className="wk-fade-in fixed inset-0 z-(--wk-z-overlay) bg-(--wk-bg-scrim)" />
        <RadixAlertDialog.Content
          className={cn(
            "wk-elevate-2 wk-dialog-in fixed left-1/2 top-1/2 z-(--wk-z-overlay) w-[calc(100vw-32px)] max-w-100",
            "-translate-x-1/2 -translate-y-1/2 rounded-md p-5",
            className,
          )}
        >
          <RadixAlertDialog.Title className="text-xl font-bold text-fg">
            {title}
          </RadixAlertDialog.Title>
          <RadixAlertDialog.Description className="mt-2 text-sm leading-6 text-fg-2">
            {description}
          </RadixAlertDialog.Description>
          <div className="mt-5 flex flex-col gap-2">
            <Button
              variant={destructive ? "danger" : "primary"}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
            <RadixAlertDialog.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </RadixAlertDialog.Cancel>
          </div>
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  );
}
