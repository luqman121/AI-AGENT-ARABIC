"use client";

import { SendHorizontal } from "lucide-react";
import { useId, useRef, type FormEvent } from "react";

import { cn } from "../lib/cn";
import { FormError } from "./form-error";

export type RequestComposerProps = {
  /** Accessible name of the textarea. */
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  /** Real pending state of the running mutation. */
  pending?: boolean | undefined;
  error?: string | undefined;
  className?: string;
};

/**
 * The signature Wakil element: an accent-tinted composer fixed above the
 * bottom navigation. Auto-grows to six lines, then scrolls internally.
 * The layout above it reserves its height, so it never covers the newest
 * message. The mobile keyboard resizes the layout (interactive-widget).
 */
export function RequestComposer({
  className,
  error,
  label,
  onSubmit,
  onValueChange,
  pending,
  placeholder,
  value,
}: RequestComposerProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Six lines of 28px leading plus padding; beyond that the field scrolls.
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!pending) onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "fixed inset-x-0 bottom-14 z-(--wk-z-nav) border-t border-line bg-page/95 backdrop-blur-sm",
        "mb-[env(safe-area-inset-bottom)] px-4 py-3",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-160">
        <FormError id={errorId} message={error} className="mb-2" />
        <div
          className={cn(
            "flex items-end gap-2 rounded-md border border-line-input bg-accent-subtle p-2",
            "transition-colors duration-150 focus-within:border-focus",
          )}
        >
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <textarea
            id={id}
            ref={textareaRef}
            rows={1}
            value={value}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              onValueChange(event.target.value);
              autoGrow();
            }}
            className={cn(
              "wk-focus-ring max-h-48 min-h-11 w-full flex-1 resize-none bg-transparent",
              "px-2 py-2.5 text-base leading-7 text-fg placeholder:text-fg-3",
            )}
          />
          <button
            type="submit"
            aria-label="إرسال الطلب"
            disabled={pending}
            aria-busy={pending ? true : undefined}
            className={cn(
              "wk-focus-ring inline-flex size-11 shrink-0 cursor-pointer touch-manipulation",
              "items-center justify-center rounded-md bg-accent text-fg-on-accent",
              "transition-colors duration-150 hover:bg-accent-hover active:bg-accent-pressed",
              "active:scale-[0.98] motion-reduce:active:scale-100",
              "disabled:pointer-events-none disabled:bg-disabled disabled:text-fg-disabled",
            )}
          >
            <SendHorizontal
              aria-hidden
              className={cn("size-5 -scale-x-100", pending && "animate-pulse")}
            />
          </button>
        </div>
      </div>
    </form>
  );
}
