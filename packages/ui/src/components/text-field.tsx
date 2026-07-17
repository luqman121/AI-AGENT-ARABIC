"use client";

import { useId, type ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/cn";
import { FormError } from "./form-error";

export type TextFieldProps = ComponentPropsWithoutRef<"input"> & {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
};

export function TextField({ className, error, hint, id, label, ...props }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-sm font-semibold text-fg">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "wk-focus-ring min-h-12 w-full rounded-md border border-line-input bg-input",
          "px-4 text-base text-fg placeholder:text-fg-3",
          "transition-colors duration-150",
          "disabled:border-line disabled:bg-disabled disabled:text-fg-disabled",
          error && "border-danger",
          className,
        )}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-fg-3">
          {hint}
        </p>
      ) : null}
      <FormError id={errorId} message={error} />
    </div>
  );
}
