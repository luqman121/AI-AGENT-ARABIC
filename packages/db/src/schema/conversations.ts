import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { projects } from "./projects.js";
import { workspaces } from "./tenancy.js";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Messages reference this pair so a conversation cannot cross workspace ownership.
    unique("conversations_id_workspace_unique").on(table.id, table.workspaceId),
    index("conversations_workspace_project_idx").on(table.workspaceId, table.projectId),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "conversations_project_workspace_fk",
    }).onDelete("cascade"),
  ],
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull(),
    role: text("role").notNull().default("user"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("conversation_messages_id_workspace_unique").on(table.id, table.workspaceId),
    index("conversation_messages_workspace_created_idx").on(table.workspaceId, table.createdAt),
    // Search in M1 includes saved Arabic request text without language-specific stemming.
    index("conversation_messages_content_trgm_idx").using(
      "gin",
      sql`${table.content} gin_trgm_ops`,
    ),
    foreignKey({
      columns: [table.conversationId, table.workspaceId],
      foreignColumns: [conversations.id, conversations.workspaceId],
      name: "conversation_messages_conversation_workspace_fk",
    }).onDelete("cascade"),
    check("conversation_messages_role_check", sql`${table.role} in ('user', 'assistant')`),
    check(
      "conversation_messages_content_length_check",
      sql`char_length(btrim(${table.content})) between 1 and 20000`,
    ),
  ],
);
