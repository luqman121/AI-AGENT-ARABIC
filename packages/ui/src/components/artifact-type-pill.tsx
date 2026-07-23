import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/cn";

export type ArtifactTypeOption = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Not yet a real generated format — shown for parity, not selectable. */
  disabled?: boolean;
  /** Truthful reason announced in the native tooltip for unavailable formats. */
  disabledReason?: string | undefined;
};

export type ArtifactTypeScrollerProps = {
  options: ArtifactTypeOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
};

/**
 * Horizontally scrolling row of compact type pills above the composer.
 * Disabled options stay visible (reference parity) but announce they are
 * not a real capability yet instead of silently doing nothing.
 */
export function ArtifactTypeScroller({
  className,
  onSelect,
  options,
  selectedId,
}: ArtifactTypeScrollerProps) {
  return (
    <div
      role="tablist"
      aria-label="نوع الإنتاج"
      className={cn(
        "-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.id === selectedId;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={option.disabled ? true : undefined}
            title={
              option.disabled
                ? `${option.label} — ${option.disabledReason ?? "غير متاح حاليًا"}`
                : option.label
            }
            onClick={() => {
              if (!option.disabled) onSelect(option.id);
            }}
            className={cn(
              "wk-focus-ring inline-flex h-11 shrink-0 cursor-pointer touch-manipulation items-center",
              "gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors duration-150",
              option.disabled
                ? "cursor-not-allowed border-line bg-transparent text-fg-3 opacity-60"
                : active
                  ? "border-transparent bg-accent text-fg-on-accent"
                  : "border-line bg-surface-2 text-fg-2 hover:bg-overlay hover:text-fg",
            )}
          >
            <Icon aria-hidden className="size-4" />
            {option.label}
            {option.disabled ? <span className="text-xs text-fg-3">· قريبًا</span> : null}
          </button>
        );
      })}
    </div>
  );
}
