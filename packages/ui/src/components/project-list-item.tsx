import { Archive, ChevronLeft } from "lucide-react";
import { Slot } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export type ProjectListItemContentProps = {
  title: string;
  /** First saved request line, clamped to two lines. */
  excerpt: string;
  /** Pre-formatted Arabic relative or absolute date. */
  dateLabel: string;
  archived?: boolean | undefined;
};

export type ProjectListItemProps = {
  /** Pass a Next.js Link as the child; it receives the row styling. */
  children: ReactNode;
};

/**
 * A whole-row link target (≥44px). The chevron points into the reading
 * direction (start → end in RTL means ChevronLeft).
 */
export function ProjectListItem({ children }: ProjectListItemProps) {
  return (
    <Slot.Root
      className={cn(
        "wk-focus-ring wk-elevate-1 flex min-h-11 w-full cursor-pointer touch-manipulation",
        "items-center gap-3 rounded-md p-4 text-start transition-colors duration-150",
        "hover:bg-overlay",
      )}
    >
      {children}
    </Slot.Root>
  );
}

export function ProjectListItemContent({
  archived,
  dateLabel,
  excerpt,
  title,
}: ProjectListItemContentProps) {
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          {archived ? <Archive aria-hidden className="size-4 shrink-0 text-fg-3" /> : null}
          <span className="truncate text-lg font-semibold text-fg">{title}</span>
        </span>
        <span className="line-clamp-2 text-sm leading-6 text-fg-2">{excerpt}</span>
        <span className="text-xs text-fg-3">{dateLabel}</span>
      </span>
      <ChevronLeft aria-hidden className="size-5 shrink-0 text-fg-3" />
    </>
  );
}
