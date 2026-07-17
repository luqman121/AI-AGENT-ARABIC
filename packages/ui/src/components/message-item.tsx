import { cn } from "../lib/cn";

export type MessageItemProps = {
  /** M1 stores user-authored requirements only. */
  content: string;
  /** Pre-formatted Arabic timestamp. */
  dateLabel: string;
  className?: string;
};

/** A saved user requirement inside the conversation. */
export function MessageItem({ className, content, dateLabel }: MessageItemProps) {
  return (
    <article className={cn("flex flex-col items-end gap-1", className)}>
      <div className="max-w-[85%] rounded-md rounded-ee-sm bg-accent-subtle px-4 py-3">
        <p className="whitespace-pre-wrap break-words text-base leading-7 text-fg">{content}</p>
      </div>
      <time className="px-1 text-xs text-fg-3">{dateLabel}</time>
    </article>
  );
}
