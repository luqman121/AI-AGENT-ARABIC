import { Clock3, FolderOpen } from "lucide-react";
import Link from "next/link";

import { formatDateTimeLabel } from "../../../src/lib/format-date";
import { arMessages } from "../../../src/product/messages.ar";

export type RecentProjectItem = {
  excerpt: string;
  id: string;
  title: string;
  updatedAtIso: string;
};

export function RecentProjects({ projects }: { projects: RecentProjectItem[] }) {
  if (projects.length === 0) return null;

  return (
    <section aria-labelledby="recent-projects-title" className="mt-3 border-t border-line pt-6">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 id="recent-projects-title" className="text-base font-bold text-fg">
            {arMessages.home.recentProjects}
          </h2>
          <p className="mt-1 text-sm leading-6 text-fg-3">
            {arMessages.home.recentProjectsDescription}
          </p>
        </div>
        <Link
          href="/projects"
          className="wk-focus-ring min-h-11 shrink-0 rounded-md px-2 py-2 text-sm font-semibold text-fg-accent"
        >
          عرض الكل
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="wk-focus-ring group flex min-w-0 gap-3 rounded-lg border border-line bg-card p-4 transition-colors duration-150 hover:bg-overlay"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-fg-accent">
              <FolderOpen aria-hidden className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-fg">{project.title}</span>
              <span className="mt-1 line-clamp-2 text-xs leading-5 text-fg-3">
                {project.excerpt || "لا يوجد وصف محفوظ."}
              </span>
              <span className="mt-2 flex items-center gap-1 text-[11px] text-fg-3">
                <Clock3 aria-hidden className="size-3.5" />
                {formatDateTimeLabel(new Date(project.updatedAtIso))}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
