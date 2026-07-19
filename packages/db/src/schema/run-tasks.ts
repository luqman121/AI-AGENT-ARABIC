import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { runs } from "./runs.js";
import { workspaces } from "./tenancy.js";

/** Durable user-visible work units; events retain history while tasks expose current progress. */
export const runTasks = pgTable(
  "run_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull(),
    position: integer("position").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull().default("pending"),
    progressPercent: integer("progress_percent").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("run_tasks_run_position_unique").on(table.runId, table.position),
    unique("run_tasks_run_key_unique").on(table.runId, table.key),
    index("run_tasks_workspace_run_position_idx").on(
      table.workspaceId,
      table.runId,
      table.position,
    ),
    foreignKey({
      columns: [table.runId, table.workspaceId],
      foreignColumns: [runs.id, runs.workspaceId],
      name: "run_tasks_run_workspace_fk",
    }).onDelete("cascade"),
    check("run_tasks_position_check", sql`${table.position} >= 0`),
    check(
      "run_tasks_status_check",
      sql`${table.status} in ('pending', 'running', 'succeeded', 'failed', 'cancelled')`,
    ),
    check("run_tasks_progress_check", sql`${table.progressPercent} between 0 and 100`),
    check(
      "run_tasks_label_length_check",
      sql`char_length(btrim(${table.label})) between 1 and 200`,
    ),
  ],
);
