import {
  accounts,
  adminAuditLogs,
  artifacts,
  conversationMessages,
  conversations,
  messageAttachments,
  projects,
  runEvents,
  runs,
  users,
} from "@wakil/db/schema";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";

import type { Database } from "../features/types";
import { startOfUtcDay, startOfUtcMonth } from "./time";

/** Coerce a possibly-string SQL aggregate (bigint/numeric come back as text) to a number. */
function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

const tokenSum = sql<number>`coalesce(sum(${runs.promptTokens} + ${runs.completionTokens}), 0)::bigint`;
const costSum = sql<number>`coalesce(sum(${runs.providerCostMicros}), 0)::bigint`;

/* ================================================================== *
 * Overview
 * ================================================================== */

export type OverviewMetrics = {
  totalUsers: number;
  newUsersToday: number;
  activeUsersToday: number;
  totalProjects: number;
  projectsToday: number;
  runningJobs: number;
  queuedJobs: number;
  completedToday: number;
  failedToday: number;
  tokensToday: number;
  costTodayMicros: number;
  costMonthMicros: number;
  storageBytes: number;
  avgDurationMs: number | null;
};

export async function getOverviewMetrics(db: Database): Promise<OverviewMetrics> {
  const day = startOfUtcDay();
  const month = startOfUtcMonth();

  const [usersRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      newToday: sql<number>`count(*) filter (where ${users.createdAt} >= ${day})::int`,
    })
    .from(users);

  const [activeRow] = await db
    .select({ activeToday: sql<number>`count(distinct ${runs.createdByUserId})::int` })
    .from(runs)
    .where(gte(runs.createdAt, day));

  const [projectRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      today: sql<number>`count(*) filter (where ${projects.createdAt} >= ${day})::int`,
    })
    .from(projects);

  const [stateRow] = await db
    .select({
      running: sql<number>`count(*) filter (where ${runs.status} = 'running')::int`,
      queued: sql<number>`count(*) filter (where ${runs.status} = 'queued')::int`,
    })
    .from(runs)
    .where(inArray(runs.status, ["queued", "running"]));

  const [windowRow] = await db
    .select({
      completedToday: sql<number>`count(*) filter (where ${runs.status} = 'succeeded' and ${runs.createdAt} >= ${day})::int`,
      failedToday: sql<number>`count(*) filter (where ${runs.status} = 'failed' and ${runs.createdAt} >= ${day})::int`,
      tokensToday: sql<number>`coalesce(sum(${runs.promptTokens} + ${runs.completionTokens}) filter (where ${runs.createdAt} >= ${day}), 0)::bigint`,
      costToday: sql<number>`coalesce(sum(${runs.providerCostMicros}) filter (where ${runs.createdAt} >= ${day}), 0)::bigint`,
      costMonth: sql<number>`coalesce(sum(${runs.providerCostMicros}), 0)::bigint`,
      avgDurationSeconds: sql<
        number | null
      >`avg(extract(epoch from (${runs.finishedAt} - ${runs.startedAt}))) filter (where ${runs.finishedAt} is not null and ${runs.startedAt} is not null and ${runs.createdAt} >= ${day})`,
    })
    .from(runs)
    .where(gte(runs.createdAt, month));

  const [artifactRow] = await db
    .select({
      bytes: sql<number>`coalesce(sum(${artifacts.downloadSizeBytes} + ${artifacts.previewSizeBytes}), 0)::bigint`,
    })
    .from(artifacts);
  const [attachmentRow] = await db
    .select({ bytes: sql<number>`coalesce(sum(${messageAttachments.sizeBytes}), 0)::bigint` })
    .from(messageAttachments)
    .where(eq(messageAttachments.status, "ready"));

  const avgSeconds = windowRow?.avgDurationSeconds;

  return {
    activeUsersToday: num(activeRow?.activeToday),
    avgDurationMs: avgSeconds === null || avgSeconds === undefined ? null : num(avgSeconds) * 1000,
    completedToday: num(windowRow?.completedToday),
    costMonthMicros: num(windowRow?.costMonth),
    costTodayMicros: num(windowRow?.costToday),
    failedToday: num(windowRow?.failedToday),
    newUsersToday: num(usersRow?.newToday),
    projectsToday: num(projectRow?.today),
    queuedJobs: num(stateRow?.queued),
    runningJobs: num(stateRow?.running),
    storageBytes: num(artifactRow?.bytes) + num(attachmentRow?.bytes),
    tokensToday: num(windowRow?.tokensToday),
    totalProjects: num(projectRow?.total),
    totalUsers: num(usersRow?.total),
  };
}

export type RecentUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string;
  plan: string;
  createdAt: Date;
};

export async function getRecentUsers(db: Database, limit = 8): Promise<RecentUser[]> {
  return db
    .select({
      createdAt: users.createdAt,
      email: users.email,
      id: users.id,
      name: users.name,
      plan: users.plan,
      role: users.role,
      status: users.status,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit);
}

export type RecentRun = {
  id: string;
  projectId: string;
  projectTitle: string;
  ownerEmail: string | null;
  status: string;
  kind: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export async function getRecentRuns(db: Database, limit = 8): Promise<RecentRun[]> {
  return db
    .select({
      createdAt: runs.createdAt,
      finishedAt: runs.finishedAt,
      id: runs.id,
      kind: runs.kind,
      ownerEmail: users.email,
      projectId: runs.projectId,
      projectTitle: projects.title,
      startedAt: runs.startedAt,
      status: runs.status,
    })
    .from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .leftJoin(users, eq(users.id, runs.createdByUserId))
    .orderBy(desc(runs.createdAt))
    .limit(limit);
}

export type RecentFailure = {
  id: string;
  projectId: string;
  projectTitle: string;
  errorCode: string | null;
  createdAt: Date;
};

export async function getRecentFailures(db: Database, limit = 8): Promise<RecentFailure[]> {
  return db
    .select({
      createdAt: runs.createdAt,
      errorCode: runs.errorCode,
      id: runs.id,
      projectId: runs.projectId,
      projectTitle: projects.title,
    })
    .from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .where(eq(runs.status, "failed"))
    .orderBy(desc(runs.createdAt))
    .limit(limit);
}

/* ================================================================== *
 * Users list
 * ================================================================== */

export type UserListFilters = {
  search?: string | undefined;
  role?: string | undefined;
  status?: string | undefined;
  plan?: string | undefined;
  sort?: string | undefined;
  page: number;
  pageSize: number;
};

export type UserListRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string;
  plan: string;
  createdAt: Date;
  projectCount: number;
  runCount: number;
  tokensMonth: number;
  costMonthMicros: number;
  lastActivityAt: Date | null;
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listUsers(
  db: Database,
  filters: UserListFilters,
): Promise<{ rows: UserListRow[]; hasNext: boolean }> {
  const month = startOfUtcMonth();
  const conditions: SQL[] = [];
  if (filters.search) {
    const pattern = `%${escapeLike(filters.search)}%`;
    const match = or(ilike(users.email, pattern), ilike(users.name, pattern));
    if (match) conditions.push(match);
  }
  if (filters.role) conditions.push(eq(users.role, filters.role));
  if (filters.status) conditions.push(eq(users.status, filters.status));
  if (filters.plan) conditions.push(eq(users.plan, filters.plan));

  // Per-user aggregates as grouped subqueries, left-joined once (no N+1).
  const runAgg = db
    .select({
      userId: runs.createdByUserId,
      runCount: sql<number>`count(*)::int`.as("run_count"),
      tokensMonth:
        sql<number>`coalesce(sum(${runs.promptTokens} + ${runs.completionTokens}) filter (where ${runs.createdAt} >= ${month}), 0)::bigint`.as(
          "tokens_month",
        ),
      costMonth:
        sql<number>`coalesce(sum(${runs.providerCostMicros}) filter (where ${runs.createdAt} >= ${month}), 0)::bigint`.as(
          "cost_month",
        ),
      lastRunAt: sql<Date | null>`max(${runs.createdAt})`.as("last_run_at"),
    })
    .from(runs)
    .groupBy(runs.createdByUserId)
    .as("run_agg");

  const projectAgg = db
    .select({
      userId: projects.createdByUserId,
      projectCount: sql<number>`count(*)::int`.as("project_count"),
      lastProjectAt: sql<Date | null>`max(${projects.updatedAt})`.as("last_project_at"),
    })
    .from(projects)
    .groupBy(projects.createdByUserId)
    .as("project_agg");

  const costOrder = sql`coalesce(${runAgg.costMonth}, 0)`;
  const activeOrder = sql`coalesce(${runAgg.runCount}, 0)`;
  const orderBy =
    filters.sort === "oldest"
      ? asc(users.createdAt)
      : filters.sort === "highest_cost"
        ? desc(costOrder)
        : filters.sort === "most_active"
          ? desc(activeOrder)
          : desc(users.createdAt);

  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await db
    .select({
      costMonthMicros: sql<number>`coalesce(${runAgg.costMonth}, 0)`,
      createdAt: users.createdAt,
      email: users.email,
      id: users.id,
      lastProjectAt: projectAgg.lastProjectAt,
      lastRunAt: runAgg.lastRunAt,
      name: users.name,
      plan: users.plan,
      projectCount: sql<number>`coalesce(${projectAgg.projectCount}, 0)`,
      role: users.role,
      runCount: sql<number>`coalesce(${runAgg.runCount}, 0)`,
      status: users.status,
      tokensMonth: sql<number>`coalesce(${runAgg.tokensMonth}, 0)`,
    })
    .from(users)
    .leftJoin(runAgg, eq(runAgg.userId, users.id))
    .leftJoin(projectAgg, eq(projectAgg.userId, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderBy)
    .limit(filters.pageSize + 1)
    .offset(offset);

  const hasNext = rows.length > filters.pageSize;
  return {
    hasNext,
    rows: rows.slice(0, filters.pageSize).map((row) => ({
      costMonthMicros: num(row.costMonthMicros),
      createdAt: row.createdAt,
      email: row.email,
      id: row.id,
      lastActivityAt: latest(row.lastRunAt, row.lastProjectAt),
      name: row.name,
      plan: row.plan,
      projectCount: num(row.projectCount),
      role: row.role,
      runCount: num(row.runCount),
      status: row.status,
      tokensMonth: num(row.tokensMonth),
    })),
  };
}

function latest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/* ================================================================== *
 * User detail
 * ================================================================== */

export type AdminUserDetail = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string;
  plan: string;
  monthlyCostLimitMicros: number | null;
  createdAt: Date;
  suspendedAt: Date | null;
  hasPassword: boolean;
  hasGoogle: boolean;
  usage: {
    projectCount: number;
    runCount: number;
    succeeded: number;
    failed: number;
    tokensMonth: number;
    costMonthMicros: number;
    executionMs: number;
    lastActivityAt: Date | null;
  };
  projects: {
    id: string;
    title: string;
    outputKind: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }[];
  runs: {
    id: string;
    projectId: string;
    status: string;
    kind: string;
    model: string | null;
    promptTokens: number;
    completionTokens: number;
    costMicros: number;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
  }[];
  errors: { id: string; projectId: string; errorCode: string | null; createdAt: Date }[];
};

export async function getUserDetail(db: Database, userId: string): Promise<AdminUserDetail | null> {
  const [account] = await db
    .select({
      createdAt: users.createdAt,
      email: users.email,
      // Never selects the hash itself — only whether one exists.
      hasPassword: sql<boolean>`${users.passwordHash} is not null`,
      id: users.id,
      monthlyCostLimitMicros: users.monthlyCostLimitMicros,
      name: users.name,
      plan: users.plan,
      role: users.role,
      status: users.status,
      suspendedAt: users.suspendedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) return null;

  const month = startOfUtcMonth();

  const [runAgg] = await db
    .select({
      runCount: sql<number>`count(*)::int`,
      succeeded: sql<number>`count(*) filter (where ${runs.status} = 'succeeded')::int`,
      failed: sql<number>`count(*) filter (where ${runs.status} = 'failed')::int`,
      tokensMonth: sql<number>`coalesce(sum(${runs.promptTokens} + ${runs.completionTokens}) filter (where ${runs.createdAt} >= ${month}), 0)::bigint`,
      costMonth: sql<number>`coalesce(sum(${runs.providerCostMicros}) filter (where ${runs.createdAt} >= ${month}), 0)::bigint`,
      executionMs: sql<number>`coalesce(sum(${runs.sandboxDurationMs}), 0)::bigint`,
      lastRunAt: sql<Date | null>`max(${runs.createdAt})`,
    })
    .from(runs)
    .where(eq(runs.createdByUserId, userId));

  const [projectAgg] = await db
    .select({
      projectCount: sql<number>`count(*)::int`,
      lastProjectAt: sql<Date | null>`max(${projects.updatedAt})`,
    })
    .from(projects)
    .where(eq(projects.createdByUserId, userId));

  const [googleRow] = await db
    .select({ hasGoogle: sql<boolean>`count(*) > 0` })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "google")));

  const recentProjects = await db
    .select({
      createdAt: projects.createdAt,
      id: projects.id,
      outputKind: projects.outputKind,
      status: projects.status,
      title: projects.title,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(eq(projects.createdByUserId, userId))
    .orderBy(desc(projects.updatedAt))
    .limit(10);

  const recentRuns = await db
    .select({
      completionTokens: runs.completionTokens,
      costMicros: runs.providerCostMicros,
      createdAt: runs.createdAt,
      finishedAt: runs.finishedAt,
      id: runs.id,
      kind: runs.kind,
      model: runs.modelConfigKey,
      projectId: runs.projectId,
      promptTokens: runs.promptTokens,
      startedAt: runs.startedAt,
      status: runs.status,
    })
    .from(runs)
    .where(eq(runs.createdByUserId, userId))
    .orderBy(desc(runs.createdAt))
    .limit(10);

  const recentErrors = await db
    .select({
      createdAt: runs.createdAt,
      errorCode: runs.errorCode,
      id: runs.id,
      projectId: runs.projectId,
    })
    .from(runs)
    .where(and(eq(runs.createdByUserId, userId), eq(runs.status, "failed")))
    .orderBy(desc(runs.createdAt))
    .limit(10);

  return {
    createdAt: account.createdAt,
    email: account.email,
    errors: recentErrors,
    hasGoogle: Boolean(googleRow?.hasGoogle),
    hasPassword: Boolean(account.hasPassword),
    id: account.id,
    monthlyCostLimitMicros: account.monthlyCostLimitMicros ?? null,
    name: account.name,
    plan: account.plan,
    projects: recentProjects,
    role: account.role,
    runs: recentRuns.map((row) => ({
      completionTokens: num(row.completionTokens),
      costMicros: num(row.costMicros),
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
      id: row.id,
      kind: row.kind,
      model: row.model,
      projectId: row.projectId,
      promptTokens: num(row.promptTokens),
      startedAt: row.startedAt,
      status: row.status,
    })),
    status: account.status,
    suspendedAt: account.suspendedAt,
    usage: {
      costMonthMicros: num(runAgg?.costMonth),
      executionMs: num(runAgg?.executionMs),
      failed: num(runAgg?.failed),
      lastActivityAt: latest(runAgg?.lastRunAt ?? null, projectAgg?.lastProjectAt ?? null),
      projectCount: num(projectAgg?.projectCount),
      runCount: num(runAgg?.runCount),
      succeeded: num(runAgg?.succeeded),
      tokensMonth: num(runAgg?.tokensMonth),
    },
  };
}

/* ================================================================== *
 * Projects list + detail
 * ================================================================== */

export type ProjectListFilters = {
  search?: string | undefined;
  status?: string | undefined;
  outputKind?: string | undefined;
  sort?: string | undefined;
  page: number;
  pageSize: number;
};

export type ProjectListRow = {
  id: string;
  title: string;
  ownerEmail: string | null;
  outputKind: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  latestRunStatus: string | null;
  hasResult: boolean;
  storageBytes: number;
};

export async function listProjects(
  db: Database,
  filters: ProjectListFilters,
): Promise<{ rows: ProjectListRow[]; hasNext: boolean }> {
  const conditions: SQL[] = [];
  if (filters.search) {
    conditions.push(ilike(projects.title, `%${escapeLike(filters.search)}%`));
  }
  if (filters.status) conditions.push(eq(projects.status, filters.status));
  if (filters.outputKind) conditions.push(eq(projects.outputKind, filters.outputKind));

  const orderBy = filters.sort === "oldest" ? asc(projects.createdAt) : desc(projects.createdAt);
  const offset = (filters.page - 1) * filters.pageSize;

  const rows = await db
    .select({
      createdAt: projects.createdAt,
      hasResult: sql<boolean>`exists (select 1 from ${artifacts} a where a.project_id = ${projects.id})`,
      id: projects.id,
      latestRunStatus: sql<
        string | null
      >`(select r.status from ${runs} r where r.project_id = ${projects.id} order by r.created_at desc limit 1)`,
      outputKind: projects.outputKind,
      ownerEmail: users.email,
      status: projects.status,
      storageBytes: sql<number>`coalesce((select sum(a.download_size_bytes + a.preview_size_bytes) from ${artifacts} a where a.project_id = ${projects.id}), 0)::bigint`,
      title: projects.title,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.createdByUserId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderBy)
    .limit(filters.pageSize + 1)
    .offset(offset);

  const hasNext = rows.length > filters.pageSize;
  return {
    hasNext,
    rows: rows.slice(0, filters.pageSize).map((row) => ({
      createdAt: row.createdAt,
      hasResult: Boolean(row.hasResult),
      id: row.id,
      latestRunStatus: row.latestRunStatus,
      outputKind: row.outputKind,
      ownerEmail: row.ownerEmail,
      status: row.status,
      storageBytes: num(row.storageBytes),
      title: row.title,
      updatedAt: row.updatedAt,
    })),
  };
}

export type AdminProjectDetail = {
  id: string;
  title: string;
  outputKind: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  ownerEmail: string | null;
  request: string | null;
  storageBytes: number;
  artifacts: {
    id: string;
    kind: string;
    title: string;
    downloadSizeBytes: number;
    createdAt: Date;
  }[];
  attachments: {
    id: string;
    originalName: string;
    mediaType: string;
    sizeBytes: number;
    status: string;
    createdAt: Date;
  }[];
  runs: {
    id: string;
    status: string;
    kind: string;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
  }[];
};

export async function getProjectDetail(
  db: Database,
  projectId: string,
): Promise<AdminProjectDetail | null> {
  const [project] = await db
    .select({
      createdAt: projects.createdAt,
      id: projects.id,
      outputKind: projects.outputKind,
      ownerEmail: users.email,
      ownerId: projects.createdByUserId,
      status: projects.status,
      title: projects.title,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.createdByUserId))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) return null;

  // The original customer request: the first user message in the conversation.
  const [firstMessage] = await db
    .select({ content: conversationMessages.content })
    .from(conversationMessages)
    .innerJoin(conversations, eq(conversations.id, conversationMessages.conversationId))
    .where(and(eq(conversations.projectId, projectId), eq(conversationMessages.role, "user")))
    .orderBy(asc(conversationMessages.createdAt))
    .limit(1);

  const projectArtifacts = await db
    .select({
      createdAt: artifacts.createdAt,
      downloadSizeBytes: artifacts.downloadSizeBytes,
      id: artifacts.id,
      kind: artifacts.kind,
      title: artifacts.title,
    })
    .from(artifacts)
    .where(eq(artifacts.projectId, projectId))
    .orderBy(desc(artifacts.createdAt))
    .limit(20);

  const projectAttachments = await db
    .select({
      createdAt: messageAttachments.createdAt,
      id: messageAttachments.id,
      mediaType: messageAttachments.mediaType,
      originalName: messageAttachments.originalName,
      sizeBytes: messageAttachments.sizeBytes,
      status: messageAttachments.status,
    })
    .from(messageAttachments)
    .where(eq(messageAttachments.projectId, projectId))
    .orderBy(desc(messageAttachments.createdAt))
    .limit(20);

  const projectRuns = await db
    .select({
      createdAt: runs.createdAt,
      finishedAt: runs.finishedAt,
      id: runs.id,
      kind: runs.kind,
      startedAt: runs.startedAt,
      status: runs.status,
    })
    .from(runs)
    .where(eq(runs.projectId, projectId))
    .orderBy(desc(runs.createdAt))
    .limit(20);

  const storageBytes = projectArtifacts.reduce((sum, a) => sum + num(a.downloadSizeBytes), 0);

  return {
    artifacts: projectArtifacts.map((a) => ({
      createdAt: a.createdAt,
      downloadSizeBytes: num(a.downloadSizeBytes),
      id: a.id,
      kind: a.kind,
      title: a.title,
    })),
    attachments: projectAttachments.map((a) => ({
      createdAt: a.createdAt,
      id: a.id,
      mediaType: a.mediaType,
      originalName: a.originalName,
      sizeBytes: num(a.sizeBytes),
      status: a.status,
    })),
    createdAt: project.createdAt,
    id: project.id,
    outputKind: project.outputKind,
    ownerEmail: project.ownerEmail,
    ownerId: project.ownerId,
    request: firstMessage?.content ?? null,
    runs: projectRuns,
    status: project.status,
    storageBytes,
    title: project.title,
    updatedAt: project.updatedAt,
  };
}

/* ================================================================== *
 * Runs list + detail
 * ================================================================== */

export type RunListFilters = {
  status?: string | undefined;
  model?: string | undefined;
  kind?: string | undefined;
  failedOnly?: boolean | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  sort?: string | undefined;
  page: number;
  pageSize: number;
};

export type RunListRow = {
  id: string;
  projectId: string;
  projectTitle: string;
  ownerEmail: string | null;
  status: string;
  kind: string;
  model: string | null;
  sandboxProvider: string | null;
  promptTokens: number;
  completionTokens: number;
  costMicros: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export async function listRuns(
  db: Database,
  filters: RunListFilters,
): Promise<{ rows: RunListRow[]; hasNext: boolean }> {
  const conditions: SQL[] = [];
  if (filters.failedOnly) conditions.push(eq(runs.status, "failed"));
  else if (filters.status) conditions.push(eq(runs.status, filters.status));
  if (filters.model) conditions.push(eq(runs.modelConfigKey, filters.model));
  if (filters.kind) conditions.push(eq(runs.kind, filters.kind));
  if (filters.from) conditions.push(gte(runs.createdAt, filters.from));
  if (filters.to) conditions.push(lte(runs.createdAt, filters.to));

  const durationOrder = sql`extract(epoch from (coalesce(${runs.finishedAt}, now()) - coalesce(${runs.startedAt}, ${runs.createdAt})))`;
  const orderBy =
    filters.sort === "oldest"
      ? asc(runs.createdAt)
      : filters.sort === "longest"
        ? desc(durationOrder)
        : filters.sort === "highest_tokens"
          ? desc(sql`${runs.promptTokens} + ${runs.completionTokens}`)
          : filters.sort === "highest_cost"
            ? desc(runs.providerCostMicros)
            : desc(runs.createdAt);

  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await db
    .select({
      completionTokens: runs.completionTokens,
      costMicros: runs.providerCostMicros,
      createdAt: runs.createdAt,
      finishedAt: runs.finishedAt,
      id: runs.id,
      kind: runs.kind,
      model: runs.modelConfigKey,
      ownerEmail: users.email,
      projectId: runs.projectId,
      projectTitle: projects.title,
      promptTokens: runs.promptTokens,
      sandboxProvider: runs.sandboxProvider,
      startedAt: runs.startedAt,
      status: runs.status,
    })
    .from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .leftJoin(users, eq(users.id, runs.createdByUserId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(orderBy)
    .limit(filters.pageSize + 1)
    .offset(offset);

  const hasNext = rows.length > filters.pageSize;
  return {
    hasNext,
    rows: rows.slice(0, filters.pageSize).map((row) => ({
      completionTokens: num(row.completionTokens),
      costMicros: num(row.costMicros),
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
      id: row.id,
      kind: row.kind,
      model: row.model,
      ownerEmail: row.ownerEmail,
      projectId: row.projectId,
      projectTitle: row.projectTitle,
      promptTokens: num(row.promptTokens),
      sandboxProvider: row.sandboxProvider,
      startedAt: row.startedAt,
      status: row.status,
    })),
  };
}

export type AdminRunDetail = {
  id: string;
  workspaceId: string;
  projectId: string;
  projectTitle: string;
  ownerEmail: string | null;
  status: string;
  kind: string;
  model: string | null;
  promptVersion: string | null;
  sandboxProvider: string | null;
  sandboxId: string | null;
  promptTokens: number;
  completionTokens: number;
  costMicros: number;
  providerAttempts: number;
  errorCode: string | null;
  cancelRequestedAt: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  events: { seq: number; type: string; createdAt: Date }[];
};

export async function getRunDetail(db: Database, runId: string): Promise<AdminRunDetail | null> {
  const [run] = await db
    .select({
      cancelRequestedAt: runs.cancelRequestedAt,
      completionTokens: runs.completionTokens,
      costMicros: runs.providerCostMicros,
      createdAt: runs.createdAt,
      errorCode: runs.errorCode,
      finishedAt: runs.finishedAt,
      id: runs.id,
      kind: runs.kind,
      model: runs.modelConfigKey,
      ownerEmail: users.email,
      projectId: runs.projectId,
      projectTitle: projects.title,
      promptTokens: runs.promptTokens,
      promptVersion: runs.promptVersion,
      providerAttempts: runs.providerAttempts,
      sandboxId: runs.sandboxId,
      sandboxProvider: runs.sandboxProvider,
      startedAt: runs.startedAt,
      status: runs.status,
      workspaceId: runs.workspaceId,
    })
    .from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .leftJoin(users, eq(users.id, runs.createdByUserId))
    .where(eq(runs.id, runId))
    .limit(1);
  if (!run) return null;

  // Only safe event envelopes are exposed — never the raw `data` payload,
  // which can contain assistant deltas (customer content).
  const events = await db
    .select({ createdAt: runEvents.createdAt, seq: runEvents.seq, type: runEvents.type })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(asc(runEvents.seq))
    .limit(200);

  return {
    cancelRequestedAt: run.cancelRequestedAt,
    completionTokens: num(run.completionTokens),
    costMicros: num(run.costMicros),
    createdAt: run.createdAt,
    errorCode: run.errorCode,
    events,
    finishedAt: run.finishedAt,
    id: run.id,
    kind: run.kind,
    model: run.model,
    ownerEmail: run.ownerEmail,
    projectId: run.projectId,
    projectTitle: run.projectTitle,
    promptTokens: num(run.promptTokens),
    promptVersion: run.promptVersion,
    providerAttempts: num(run.providerAttempts),
    sandboxId: run.sandboxId,
    sandboxProvider: run.sandboxProvider,
    startedAt: run.startedAt,
    status: run.status,
    workspaceId: run.workspaceId,
  };
}

/* ================================================================== *
 * Usage
 * ================================================================== */

export type UsageSummary = {
  tokensToday: number;
  tokensMonth: number;
  costTodayMicros: number;
  costMonthMicros: number;
  storageBytes: number;
  executionMs: number;
  avgCostPerRunMicros: number;
  failedCostMicros: number;
  byModel: { key: string; runs: number; tokens: number; costMicros: number }[];
  byOutputKind: { key: string; runs: number; costMicros: number }[];
  topUsers: { userId: string; email: string | null; costMicros: number }[];
  topProjects: { projectId: string; title: string; costMicros: number }[];
};

export async function getUsageSummary(db: Database): Promise<UsageSummary> {
  const day = startOfUtcDay();
  const month = startOfUtcMonth();

  const [totals] = await db
    .select({
      tokensToday: sql<number>`coalesce(sum(${runs.promptTokens} + ${runs.completionTokens}) filter (where ${runs.createdAt} >= ${day}), 0)::bigint`,
      tokensMonth: sql<number>`coalesce(sum(${runs.promptTokens} + ${runs.completionTokens}), 0)::bigint`,
      costToday: sql<number>`coalesce(sum(${runs.providerCostMicros}) filter (where ${runs.createdAt} >= ${day}), 0)::bigint`,
      costMonth: sql<number>`coalesce(sum(${runs.providerCostMicros}), 0)::bigint`,
      executionMs: sql<number>`coalesce(sum(${runs.sandboxDurationMs}), 0)::bigint`,
      completed: sql<number>`count(*) filter (where ${runs.status} = 'succeeded')::int`,
      completedCost: sql<number>`coalesce(sum(${runs.providerCostMicros}) filter (where ${runs.status} = 'succeeded'), 0)::bigint`,
      failedCost: sql<number>`coalesce(sum(${runs.providerCostMicros}) filter (where ${runs.status} = 'failed'), 0)::bigint`,
    })
    .from(runs)
    .where(gte(runs.createdAt, month));

  const [artifactRow] = await db
    .select({
      bytes: sql<number>`coalesce(sum(${artifacts.downloadSizeBytes} + ${artifacts.previewSizeBytes}), 0)::bigint`,
    })
    .from(artifacts);
  const [attachmentRow] = await db
    .select({ bytes: sql<number>`coalesce(sum(${messageAttachments.sizeBytes}), 0)::bigint` })
    .from(messageAttachments)
    .where(eq(messageAttachments.status, "ready"));

  const byModel = await db
    .select({
      key: sql<string>`coalesce(${runs.modelConfigKey}, 'غير محدد')`,
      runs: sql<number>`count(*)::int`,
      tokens: tokenSum,
      costMicros: costSum,
    })
    .from(runs)
    .where(gte(runs.createdAt, month))
    .groupBy(runs.modelConfigKey)
    .orderBy(desc(costSum))
    .limit(10);

  const byOutputKind = await db
    .select({
      key: projects.outputKind,
      runs: sql<number>`count(${runs.id})::int`,
      costMicros: costSum,
    })
    .from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .where(gte(runs.createdAt, month))
    .groupBy(projects.outputKind)
    .orderBy(desc(costSum))
    .limit(10);

  const topUsers = await db
    .select({
      userId: runs.createdByUserId,
      email: users.email,
      costMicros: costSum,
    })
    .from(runs)
    .leftJoin(users, eq(users.id, runs.createdByUserId))
    .where(gte(runs.createdAt, month))
    .groupBy(runs.createdByUserId, users.email)
    .orderBy(desc(costSum))
    .limit(10);

  const topProjects = await db
    .select({
      projectId: runs.projectId,
      title: projects.title,
      costMicros: costSum,
    })
    .from(runs)
    .innerJoin(projects, eq(projects.id, runs.projectId))
    .where(gte(runs.createdAt, month))
    .groupBy(runs.projectId, projects.title)
    .orderBy(desc(costSum))
    .limit(10);

  const completed = num(totals?.completed);
  const completedCost = num(totals?.completedCost);

  return {
    avgCostPerRunMicros: completed > 0 ? Math.round(completedCost / completed) : 0,
    byModel: byModel.map((r) => ({
      costMicros: num(r.costMicros),
      key: r.key,
      runs: num(r.runs),
      tokens: num(r.tokens),
    })),
    byOutputKind: byOutputKind.map((r) => ({
      costMicros: num(r.costMicros),
      key: r.key,
      runs: num(r.runs),
    })),
    costMonthMicros: num(totals?.costMonth),
    costTodayMicros: num(totals?.costToday),
    executionMs: num(totals?.executionMs),
    failedCostMicros: num(totals?.failedCost),
    storageBytes: num(artifactRow?.bytes) + num(attachmentRow?.bytes),
    tokensMonth: num(totals?.tokensMonth),
    tokensToday: num(totals?.tokensToday),
    topProjects: topProjects.map((r) => ({
      costMicros: num(r.costMicros),
      projectId: r.projectId,
      title: r.title,
    })),
    topUsers: topUsers.map((r) => ({
      costMicros: num(r.costMicros),
      email: r.email,
      userId: r.userId,
    })),
  };
}

/* ================================================================== *
 * Audit log
 * ================================================================== */

export type AuditListFilters = {
  action?: string | undefined;
  targetType?: string | undefined;
  targetId?: string | undefined;
  page: number;
  pageSize: number;
};

export type AuditListRow = {
  id: string;
  actorEmail: string | null;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: Date;
};

export async function listAuditLogs(
  db: Database,
  filters: AuditListFilters,
): Promise<{ rows: AuditListRow[]; hasNext: boolean }> {
  const conditions: SQL[] = [];
  if (filters.action) conditions.push(eq(adminAuditLogs.action, filters.action));
  if (filters.targetType) conditions.push(eq(adminAuditLogs.targetType, filters.targetType));
  if (filters.targetId) conditions.push(eq(adminAuditLogs.targetId, filters.targetId));

  const offset = (filters.page - 1) * filters.pageSize;
  const rows = await db
    .select({
      action: adminAuditLogs.action,
      actorEmail: users.email,
      actorRole: adminAuditLogs.actorRole,
      after: adminAuditLogs.afterData,
      before: adminAuditLogs.beforeData,
      createdAt: adminAuditLogs.createdAt,
      id: adminAuditLogs.id,
      reason: adminAuditLogs.reason,
      targetId: adminAuditLogs.targetId,
      targetType: adminAuditLogs.targetType,
    })
    .from(adminAuditLogs)
    .leftJoin(users, eq(users.id, adminAuditLogs.actorUserId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(filters.pageSize + 1)
    .offset(offset);

  const hasNext = rows.length > filters.pageSize;
  return {
    hasNext,
    rows: rows.slice(0, filters.pageSize).map((row) => ({
      action: row.action,
      actorEmail: row.actorEmail,
      actorRole: row.actorRole,
      after: (row.after as Record<string, unknown> | null) ?? null,
      before: (row.before as Record<string, unknown> | null) ?? null,
      createdAt: row.createdAt,
      id: row.id,
      reason: row.reason,
      targetId: row.targetId,
      targetType: row.targetType,
    })),
  };
}
