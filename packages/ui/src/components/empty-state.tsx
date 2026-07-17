import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string | undefined;
  /** One inviting action, e.g. a create button. */
  action?: ReactNode | undefined;
  className?: string;
};

/** Truthful empty state: explains what is (not) here and invites one action. */
export function EmptyState({ action, className, description, icon: Icon, title }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-4 px-6 py-12 text-center", className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-accent-subtle">
        <Icon aria-hidden className="size-7 text-fg-accent" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-bold text-fg">{title}</h2>
        {description ? <p className="max-w-[36ch] text-sm text-fg-2">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
