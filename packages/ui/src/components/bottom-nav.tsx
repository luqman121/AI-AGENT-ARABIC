import type { LucideIcon } from "lucide-react";
import { Slot } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export type BottomNavProps = {
  /** Accessible name of the primary navigation landmark. */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Fixed bottom navigation (max 4 items in M1). Pages reserve its height
 * through the PageShell content padding so it never covers content.
 */
export function BottomNav({ children, className, label }: BottomNavProps) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "fixed inset-x-0 bottom-0 z-(--wk-z-nav) border-t border-line bg-raised",
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-160 items-stretch">{children}</div>
    </nav>
  );
}

export type BottomNavItemProps = {
  active?: boolean | undefined;
  /** Pass a Next.js Link as the child; its content comes from BottomNavItemContent. */
  children: ReactNode;
};

export function BottomNavItem({ active, children }: BottomNavItemProps) {
  return (
    <Slot.Root
      aria-current={active ? "page" : undefined}
      className={cn(
        "wk-focus-ring relative flex min-h-11 flex-1 cursor-pointer touch-manipulation flex-col",
        "items-center justify-center gap-0.5 text-xs font-semibold",
        active ? "text-fg-accent" : "text-fg-2",
      )}
    >
      {children}
    </Slot.Root>
  );
}

/** Inner content for a BottomNavItem link child. */
export function BottomNavItemContent({
  active,
  icon: Icon,
  label,
}: {
  active?: boolean | undefined;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <>
      {active ? (
        <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent" />
      ) : null}
      <Icon aria-hidden className="size-6" />
      {label}
    </>
  );
}
