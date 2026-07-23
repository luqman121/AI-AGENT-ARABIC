import { conversationMessages, conversations, projects } from "@wakil/db/schema";
import { searchProjectsInputSchema, type SearchProjectsInput } from "@wakil/shared";
import { and, asc, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";

import type { Database, ServiceContext } from "../types";

export type ProjectListRecord = {
  id: string;
  title: string;
  status: "active" | "archived";
  updatedAt: Date;
  /** Leading text of the first saved request. */
  excerpt: string;
};

export type ProjectRecord = {
  id: string;
  outputKind: string;
  title: string;
  status: "active" | "archived";
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Tenant-scoped list + Arabic substring search over titles and saved
 * request text. Every branch filters by the authenticated workspace.
 */
export async function listProjects(
  db: Database,
  ctx: ServiceContext,
  input: SearchProjectsInput,
): Promise<ProjectListRecord[]> {
  const { filter, query } = searchProjectsInputSchema.parse(input);

  const conditions: SQL[] = [
    eq(projects.workspaceId, ctx.workspaceId),
    eq(projects.status, filter),
  ];

  if (query) {
    const pattern = `%${escapeLikePattern(query)}%`;
    const matchingProjects = db
      .select({ projectId: conversations.projectId })
      .from(conversations)
      .innerJoin(
        conversationMessages,
        and(
          eq(conversationMessages.conversationId, conversations.id),
          eq(conversationMessages.workspaceId, ctx.workspaceId),
        ),
      )
      .where(
        and(
          eq(conversations.workspaceId, ctx.workspaceId),
          ilike(conversationMessages.content, pattern),
        ),
      );
    const searchCondition = or(
      ilike(projects.title, pattern),
      inArray(projects.id, matchingProjects),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  const rows = await db
    .select({
      id: projects.id,
      status: projects.status,
      title: projects.title,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(...conditions))
    .orderBy(desc(projects.updatedAt))
    .limit(100);

  if (rows.length === 0) return [];

  const projectIds = rows.map((row) => row.id);
  const messageRows = await db
    .select({
      content: conversationMessages.content,
      createdAt: conversationMessages.createdAt,
      projectId: conversations.projectId,
    })
    .from(conversationMessages)
    .innerJoin(
      conversations,
      and(
        eq(conversations.id, conversationMessages.conversationId),
        eq(conversations.workspaceId, ctx.workspaceId),
      ),
    )
    .where(
      and(
        eq(conversationMessages.workspaceId, ctx.workspaceId),
        inArray(conversations.projectId, projectIds),
      ),
    )
    .orderBy(asc(conversationMessages.createdAt));

  const excerpts = new Map<string, string>();
  for (const message of messageRows) {
    if (!excerpts.has(message.projectId)) {
      excerpts.set(message.projectId, message.content.slice(0, 160));
    }
  }

  return rows.map((row) => ({
    excerpt: excerpts.get(row.id) ?? "",
    id: row.id,
    status: row.status as "active" | "archived",
    title: row.title,
    updatedAt: row.updatedAt,
  }));
}

/**
 * Returns null for both missing and cross-tenant projects so responses
 * never reveal row existence in another workspace.
 */
export async function getProjectById(
  db: Database,
  ctx: ServiceContext,
  projectId: string,
): Promise<ProjectRecord | null> {
  const row = (
    await db
      .select({
        archivedAt: projects.archivedAt,
        createdAt: projects.createdAt,
        id: projects.id,
        outputKind: projects.outputKind,
        status: projects.status,
        title: projects.title,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)
  )[0];
  if (!row) return null;
  return { ...row, status: row.status as "active" | "archived" };
}
