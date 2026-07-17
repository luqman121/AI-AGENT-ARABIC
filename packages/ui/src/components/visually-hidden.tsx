import type { ComponentPropsWithoutRef } from "react";

/** Screen-reader-only text. */
export function VisuallyHidden({ children, ...props }: ComponentPropsWithoutRef<"span">) {
  return (
    <span
      className="absolute -m-px h-px w-px overflow-hidden whitespace-nowrap border-0 p-0 [clip:rect(0,0,0,0)]"
      {...props}
    >
      {children}
    </span>
  );
}
