import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export type AppHeaderProps = {
  title: string;
  /** Start slot (back button in RTL flows). */
  start?: ReactNode;
  /** End slot (contextual actions). */
  end?: ReactNode;
  className?: string;
};

/** 56px sticky page header inside the safe area. */
export function AppHeader({ className, end, start, title }: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-(--wk-z-nav) border-b border-line bg-page/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-160 items-center gap-2 px-4">
        {start}
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-fg">{title}</h1>
        {end}
      </div>
    </header>
  );
}
