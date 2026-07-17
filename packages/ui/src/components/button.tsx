"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { Slot } from "radix-ui";

import { cn } from "../lib/cn";

const buttonVariants = cva(
  [
    "wk-focus-ring inline-flex cursor-pointer touch-manipulation select-none",
    "items-center justify-center gap-2 rounded-md font-semibold",
    "transition-colors duration-150 active:scale-[0.98] motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:bg-disabled disabled:text-fg-disabled",
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-fg-on-accent hover:bg-accent-hover active:bg-accent-pressed",
        secondary: "bg-secondary-action text-fg hover:bg-[var(--wk-neutral-4)]",
        ghost: "bg-transparent text-fg-2 hover:bg-overlay hover:text-fg",
        danger: "bg-danger text-white hover:bg-[#b9262b]",
      },
      size: {
        default: "min-h-12 px-5 text-base",
        compact: "min-h-11 px-4 text-sm",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "primary",
    },
  },
);

export type ButtonProps = ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Shows a real pending state: spinner + disabled, label kept visible. */
    loading?: boolean | undefined;
    asChild?: boolean | undefined;
  };

export function Button({
  asChild,
  className,
  children,
  disabled,
  loading,
  size,
  type,
  variant,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ size, variant }), className)}
      {...(asChild
        ? {}
        : {
            disabled: Boolean(disabled) || Boolean(loading),
            type: type ?? "button",
            "aria-busy": loading ? true : undefined,
          })}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Loader2 aria-hidden className="size-5 animate-spin" /> : null}
          {children}
        </>
      )}
    </Comp>
  );
}
