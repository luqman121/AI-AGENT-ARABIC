import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export type PageShellProps = {
  children: ReactNode;
  /** Reserve space for the fixed bottom navigation (default true). */
  withBottomNav?: boolean;
  className?: string;
};

/**
 * Main content landmark. Bottom padding reserves the fixed navigation and
 * safe-area height so fixed chrome never covers content.
 */
export function PageShell({ children, className, withBottomNav = true }: PageShellProps) {
  return (
    <main
      id="main"
      className={cn(
        "mx-auto flex w-full max-w-160 flex-1 flex-col px-4 pt-4",
        withBottomNav
          ? "pb-[calc(72px+env(safe-area-inset-bottom))]"
          : "pb-[calc(16px+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {children}
    </main>
  );
}
