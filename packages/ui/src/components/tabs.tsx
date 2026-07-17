"use client";

import { cn } from "../lib/cn";

export type TabItem = {
  value: string;
  label: string;
};

export type TabsProps = {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name for the filter group. */
  label: string;
  className?: string;
};

/**
 * Segmented filter control. Not ARIA tabs on purpose: the filtered content
 * lives elsewhere on the page, so tab/panel semantics would be invalid.
 * Selection is exposed through aria-pressed toggle buttons.
 */
export function Tabs({ className, items, label, onValueChange, value }: TabsProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex min-h-12 items-center gap-1 rounded-md bg-raised p-1", className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "wk-focus-ring min-h-11 flex-1 cursor-pointer touch-manipulation rounded-sm px-4",
              "text-sm font-semibold transition-colors duration-150",
              active ? "bg-selected text-fg-accent" : "text-fg-2 hover:text-fg",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
