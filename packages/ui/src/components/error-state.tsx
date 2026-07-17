import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export type ErrorStateProps = {
  title: string;
  /** States the cause and the fix in simple Arabic; never technical detail. */
  description?: string | undefined;
  /** A real retry or recovery action. */
  action?: ReactNode | undefined;
  className?: string;
};

export function ErrorState({ action, className, description, title }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center gap-4 px-6 py-12 text-center", className)}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-danger-subtle">
        <TriangleAlert aria-hidden className="size-7 text-fg-danger" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-bold text-fg">{title}</h2>
        {description ? <p className="max-w-[36ch] text-sm text-fg-2">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
