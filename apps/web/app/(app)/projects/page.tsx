import {
  AppHeader,
  Button,
  EmptyState,
  PageShell,
  ProjectListItem,
  ProjectListItemContent,
} from "@wakil/ui";
import { PROJECT_FILTERS, searchProjectsInputSchema, type ProjectFilter } from "@wakil/shared";
import { Archive, FolderPlus, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { formatDateTimeLabel } from "../../../src/lib/format-date";
import { requireAuthorizedContext } from "../../../src/server/auth/session";
import { getDatabase } from "../../../src/server/db";
import { listProjects } from "../../../src/server/features/projects/queries";
import { ProjectsToolbar } from "./projects-toolbar";

export const metadata: Metadata = {
  title: "المشاريع",
};

function parseFilter(value: string | undefined): ProjectFilter {
  return PROJECT_FILTERS.includes(value as ProjectFilter) ? (value as ProjectFilter) : "active";
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params.filter);
  const input = searchProjectsInputSchema.parse({ filter, query: params.q ?? undefined });

  const ctx = await requireAuthorizedContext();
  const projects = await listProjects(getDatabase(), ctx, input);
  const searching = Boolean(input.query);

  return (
    <>
      <AppHeader title="المشاريع" />
      <PageShell>
        <ProjectsToolbar filter={filter} initialQuery={input.query ?? ""} />
        {projects.length === 0 ? (
          searching ? (
            <EmptyState
              icon={SearchX}
              title="لا توجد نتائج"
              description={`لم نجد مشاريع تطابق «${input.query ?? ""}». جرّب كلمة أخرى.`}
            />
          ) : filter === "archived" ? (
            <EmptyState
              icon={Archive}
              title="لا توجد مشاريع مؤرشفة"
              description="المشاريع التي تؤرشفها ستظهر هنا."
            />
          ) : (
            <EmptyState
              icon={FolderPlus}
              title="ما عندك مشاريع بعد"
              description="ابدأ أول مشروع لك ووصف ما تحتاجه بالعربي."
              action={
                <Button asChild>
                  <Link href="/new">إنشاء مشروع</Link>
                </Button>
              }
            />
          )
        ) : (
          <ul className="flex flex-col gap-3 py-4">
            {projects.map((project) => (
              <li key={project.id}>
                <ProjectListItem>
                  <Link href={`/projects/${project.id}`}>
                    <ProjectListItemContent
                      archived={project.status === "archived"}
                      dateLabel={formatDateTimeLabel(project.updatedAt)}
                      excerpt={project.excerpt}
                      title={project.title}
                    />
                  </Link>
                </ProjectListItem>
              </li>
            ))}
          </ul>
        )}
      </PageShell>
    </>
  );
}
