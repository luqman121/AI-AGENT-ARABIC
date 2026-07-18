import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { conversationMessages, conversations } from "./conversations.js";
import { projects } from "./projects.js";
import { workspaces } from "./tenancy.js";

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    kind: text("kind").notNull().default("planning"),
    parentRunId: uuid("parent_run_id"),
    status: text("status").notNull().default("queued"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    errorCode: text("error_code"),
    stepCount: integer("step_count").notNull().default(0),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    providerCostMicros: integer("provider_cost_micros").notNull().default(0),
    providerAttempts: integer("provider_attempts").notNull().default(0),
    modelConfigKey: text("model_config_key"),
    promptVersion: text("prompt_version"),
    assistantMessageId: uuid("assistant_message_id"),
    sandboxProvider: text("sandbox_provider"),
    sandboxId: text("sandbox_id"),
    sandboxDurationMs: integer("sandbox_duration_ms").notNull().default(0),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    // Composite key is the target for tenant-preserving run_events foreign keys.
    unique("runs_id_workspace_unique").on(table.id, table.workspaceId),
    // Composite FKs stop a run from crossing tenant/project/conversation ownership.
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "runs_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.workspaceId],
      foreignColumns: [conversations.id, conversations.workspaceId],
      name: "runs_conversation_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.assistantMessageId, table.workspaceId],
      foreignColumns: [conversationMessages.id, conversationMessages.workspaceId],
      name: "runs_assistant_message_workspace_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.parentRunId, table.workspaceId],
      foreignColumns: [table.id, table.workspaceId],
      name: "runs_parent_run_workspace_fk",
    }).onDelete("restrict"),
    index("runs_workspace_project_created_idx").on(
      table.workspaceId,
      table.projectId,
      table.createdAt,
    ),
    // At most one active run per project, enforced at the database level.
    uniqueIndex("runs_one_active_per_project")
      .on(table.projectId)
      .where(sql`${table.status} in ('queued', 'running')`),
    uniqueIndex("runs_assistant_message_unique")
      .on(table.assistantMessageId)
      .where(sql`${table.assistantMessageId} is not null`),
    check(
      "runs_status_check",
      sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check("runs_kind_check", sql`${table.kind} in ('planning', 'execution')`),
    check(
      "runs_parent_kind_check",
      sql`(${table.kind} = 'planning' and ${table.parentRunId} is null) or (${table.kind} = 'execution' and ${table.parentRunId} is not null)`,
    ),
  ],
);

export const runEvents = pgTable(
  "run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull(),
    // Monotonic per-run sequence starting at 1; the basis for Last-Event-ID replay.
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    // Bounded event data. Assistant deltas are user-visible content, never application logs.
    data: jsonb("data")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("run_events_run_seq_unique").on(table.runId, table.seq),
    index("run_events_run_seq_idx").on(table.runId, table.seq),
    foreignKey({
      columns: [table.runId, table.workspaceId],
      foreignColumns: [runs.id, runs.workspaceId],
      name: "run_events_run_workspace_fk",
    }).onDelete("cascade"),
    check(
      "run_events_type_check",
      sql`${table.type} in ('run.queued', 'run.started', 'run.step', 'agent.started', 'assistant.delta', 'assistant.completed', 'agent.refused', 'agent.limit_exceeded', 'artifact.generating', 'sandbox.created', 'sandbox.validated', 'artifact.uploading', 'artifact.ready', 'run.succeeded', 'run.failed', 'run.cancelled')`,
    ),
  ],
);
