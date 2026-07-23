"use client";

import { Activity, MessagesSquare, MonitorPlay } from "lucide-react";
import Link from "next/link";

import { arMessages } from "../../../../src/product/messages.ar";

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function MobileWorkspaceNav({ projectId }: { projectId: string }) {
  return (
    <nav
      aria-label="أقسام مساحة العمل"
      className="sticky top-[calc(56px+env(safe-area-inset-top))] z-(--wk-z-nav) border-b border-line bg-page/95 px-4 py-2 backdrop-blur-sm lg:hidden"
    >
      <div className="mx-auto grid w-full max-w-160 grid-cols-3 gap-1 rounded-lg bg-surface-1 p-1">
        <button
          type="button"
          onClick={() => scrollToSection("conversation")}
          className="wk-focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-accent-subtle px-2 text-xs font-semibold text-fg-accent"
        >
          <MessagesSquare aria-hidden className="size-4" />
          {arMessages.workspace.conversation}
        </button>
        <Link
          href={`/projects/${projectId}/preview`}
          className="wk-focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold text-fg-2 hover:bg-overlay hover:text-fg"
        >
          <MonitorPlay aria-hidden className="size-4" />
          {arMessages.workspace.preview}
        </Link>
        <button
          type="button"
          onClick={() => scrollToSection("activity")}
          className="wk-focus-ring inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold text-fg-2 hover:bg-overlay hover:text-fg"
        >
          <Activity aria-hidden className="size-4" />
          {arMessages.workspace.activity}
        </button>
      </div>
    </nav>
  );
}
