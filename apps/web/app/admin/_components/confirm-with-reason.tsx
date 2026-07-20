"use client";

import { Button, Dialog, TextareaField } from "@wakil/ui";
import type { ReactNode } from "react";

/**
 * Confirmation dialog for a sensitive admin action. Every action carries an
 * optional reason that is recorded in the audit ledger. Extra fields (a role
 * select, a plan select, a number) render above the reason via `children`.
 */
export function ConfirmWithReason({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  pending = false,
  reason,
  onReasonChange,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  reason: string;
  onReasonChange: (value: string) => void;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex flex-col gap-4">
        {children}
        <TextareaField
          label="السبب (اختياري)"
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          rows={2}
          maxLength={500}
          placeholder="سبب هذا الإجراء للسجل الإداري"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            variant={destructive ? "danger" : "primary"}
            className="flex-1"
            loading={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
