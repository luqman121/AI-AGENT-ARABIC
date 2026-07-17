"use client";

import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/cn";

export type IconButtonProps = ComponentPropsWithoutRef<"button"> & {
  /** Accessible name — required because the visual content is icon-only. */
  label: string;
};

export function IconButton({ className, children, label, type, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      type={type ?? "button"}
      className={cn(
        "wk-focus-ring inline-flex size-11 min-h-11 min-w-11 cursor-pointer touch-manipulation",
        "items-center justify-center rounded-md text-fg-2 transition-colors duration-150",
        "hover:bg-overlay hover:text-fg active:scale-[0.98] motion-reduce:active:scale-100",
        "disabled:pointer-events-none disabled:text-fg-disabled",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
