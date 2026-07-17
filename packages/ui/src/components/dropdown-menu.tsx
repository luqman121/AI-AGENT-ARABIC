"use client";

import type { LucideIcon } from "lucide-react";
import { DropdownMenu as RadixDropdownMenu } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "../lib/cn";

export type DropdownMenuProps = {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
};

export function DropdownMenu({ children, className, trigger }: DropdownMenuProps) {
  return (
    <RadixDropdownMenu.Root>
      <RadixDropdownMenu.Trigger asChild>{trigger}</RadixDropdownMenu.Trigger>
      <RadixDropdownMenu.Portal>
        <RadixDropdownMenu.Content
          align="end"
          sideOffset={4}
          className={cn(
            "wk-elevate-2 wk-fade-in z-(--wk-z-overlay) min-w-44 rounded-md p-1.5",
            className,
          )}
        >
          {children}
        </RadixDropdownMenu.Content>
      </RadixDropdownMenu.Portal>
    </RadixDropdownMenu.Root>
  );
}

export type DropdownMenuItemProps = {
  icon?: LucideIcon | undefined;
  children: ReactNode;
  destructive?: boolean | undefined;
  onSelect: () => void;
  disabled?: boolean | undefined;
};

export function DropdownMenuItem({
  children,
  destructive,
  disabled,
  icon: Icon,
  onSelect,
}: DropdownMenuItemProps) {
  return (
    <RadixDropdownMenu.Item
      disabled={disabled ?? false}
      onSelect={onSelect}
      className={cn(
        "flex min-h-11 cursor-pointer select-none items-center gap-2.5 rounded-sm px-3 text-sm font-semibold",
        "outline-none data-highlighted:bg-overlay",
        "data-disabled:pointer-events-none data-disabled:text-fg-disabled",
        destructive ? "text-fg-danger" : "text-fg",
      )}
    >
      {Icon ? <Icon aria-hidden className="size-5 shrink-0" /> : null}
      {children}
    </RadixDropdownMenu.Item>
  );
}
