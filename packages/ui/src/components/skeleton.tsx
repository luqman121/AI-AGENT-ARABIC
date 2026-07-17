import { cn } from "../lib/cn";

/** Loading placeholder shown only while a real request is in flight. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-overlay motion-reduce:animate-none", className)}
    />
  );
}
