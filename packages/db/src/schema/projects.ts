import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { workspaces } from "./tenancy.js";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("active"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The composite key is the target for tenant-preserving conversation foreign keys.
    unique("projects_id_workspace_unique").on(table.id, table.workspaceId),
    index("projects_workspace_status_updated_idx").on(
      table.workspaceId,
      table.status,
      table.updatedAt,
    ),
    // Trigrams provide script-agnostic substring matching for Arabic project titles.
    index("projects_title_trgm_idx").using("gin", sql`${table.title} gin_trgm_ops`),
    check("projects_title_length_check", sql`char_length(btrim(${table.title})) between 1 and 120`),
    check("projects_status_check", sql`${table.status} in ('active', 'archived')`),
    check(
      "projects_archive_state_check",
      sql`(${table.status} = 'active' and ${table.archivedAt} is null) or (${table.status} = 'archived' and ${table.archivedAt} is not null)`,
    ),
  ],
);
