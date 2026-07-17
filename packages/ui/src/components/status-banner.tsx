import { CircleAlert, Info, WifiOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

const TONES = {
  info: {
    container: "bg-info-subtle text-fg-info",
    defaultIcon: Info,
  },
  warning: {
    container: "bg-warning-subtle text-fg-warning",
    defaultIcon: WifiOff,
  },
  danger: {
    container: "bg-danger-subtle text-fg-danger",
    defaultIcon: CircleAlert,
  },
} as const;

export type StatusBannerProps = {
  tone: keyof typeof TONES;
  children: ReactNode;
  icon?: LucideIcon | undefined;
  /** An optional inline action, e.g. retry. */
  action?: ReactNode | undefined;
  className?: string;
};

/**
 * Status is announced politely and always pairs color with icon + text.
 * Used for offline/reconnecting and form-level failures.
 */
export function StatusBanner({ action, children, className, icon, tone }: StatusBannerProps) {
  const config = TONES[tone];
  const Icon = icon ?? config.defaultIcon;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "z-(--wk-z-banner) flex min-h-11 items-center gap-3 rounded-md px-4 py-2.5 text-sm font-semibold",
        config.container,
        className,
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}
