import { cn } from "../lib/cn";

export type MessageItemProps = {
  content: string;
  /** Pre-formatted Arabic timestamp. */
  dateLabel: string;
  role?: "user" | "assistant";
  className?: string;
};

/** A saved user or completed assistant message inside the conversation. */
export function MessageItem({ className, content, dateLabel, role = "user" }: MessageItemProps) {
  const assistant = role === "assistant";
  return (
    <article
      aria-label={assistant ? "رد وكيل" : "طلبك"}
      className={cn("flex flex-col gap-1", assistant ? "items-start" : "items-end", className)}
    >
      <div
        className={cn(
          "max-w-[88%] rounded-md px-4 py-3",
          assistant
            ? "rounded-es-sm border border-line bg-surface-2"
            : "rounded-ee-sm bg-accent-subtle",
        )}
      >
        <p className="whitespace-pre-wrap break-words text-base leading-7 text-fg">{content}</p>
      </div>
      <time className="px-1 text-xs text-fg-3">{dateLabel}</time>
    </article>
  );
}
