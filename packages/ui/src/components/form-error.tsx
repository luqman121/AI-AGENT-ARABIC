import { CircleAlert } from "lucide-react";

import { cn } from "../lib/cn";

export type FormErrorProps = {
  id?: string;
  message?: string | undefined;
  className?: string;
};

/** Inline field error, rendered under its field and referenced by aria-describedby. */
export function FormError({ className, id, message }: FormErrorProps) {
  if (!message) return null;
  return (
    <p id={id} className={cn("flex items-center gap-1.5 text-sm text-fg-danger", className)}>
      <CircleAlert aria-hidden className="size-4 shrink-0" />
      {message}
    </p>
  );
}
