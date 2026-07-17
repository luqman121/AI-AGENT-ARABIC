import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/cn";

/**
 * Isolates code, URLs, IDs, and email addresses as LTR inside RTL text.
 * Multi-part tokens always need this wrapper; bare inline numbers do not.
 */
export function Ltr({ className, children, ...props }: ComponentPropsWithoutRef<"span">) {
  return (
    <span dir="ltr" className={cn("wk-ltr font-mono", className)} {...props}>
      {children}
    </span>
  );
}
