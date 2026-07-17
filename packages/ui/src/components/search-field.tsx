"use client";

import { Search, X } from "lucide-react";
import { useId, type ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/cn";

export type SearchFieldProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  label: string;
  onClear?: (() => void) | undefined;
};

export function SearchField({ className, id, label, onClear, value, ...props }: SearchFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const showClear = Boolean(onClear) && typeof value === "string" && value.length > 0;

  return (
    <div className="relative">
      <label htmlFor={fieldId} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden
        className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-fg-3"
      />
      <input
        id={fieldId}
        type="search"
        inputMode="search"
        value={value}
        className={cn(
          "wk-focus-ring min-h-12 w-full rounded-md border border-line-input bg-input",
          "ps-12 pe-12 text-base text-fg placeholder:text-fg-3",
          "transition-colors duration-150",
          "[&::-webkit-search-cancel-button]:hidden",
          className,
        )}
        {...props}
      />
      {showClear ? (
        <button
          type="button"
          aria-label="مسح البحث"
          onClick={onClear}
          className={cn(
            "wk-focus-ring absolute end-1 top-1/2 -translate-y-1/2",
            "inline-flex size-11 cursor-pointer items-center justify-center rounded-md",
            "text-fg-3 hover:text-fg",
          )}
        >
          <X aria-hidden className="size-5" />
        </button>
      ) : null}
    </div>
  );
}
