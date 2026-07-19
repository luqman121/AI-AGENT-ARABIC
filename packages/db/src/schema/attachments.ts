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
import { conversationMessages, conversations } from "./conversations.js";
import { projects } from "./projects.js";
import { workspaces } from "./tenancy.js";

/** Private user inputs. Object keys are immutable; signed URLs are never persisted. */
export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    conversationId: uuid("conversation_id").notNull(),
    messageId: uuid("message_id"),
    kind: text("kind").notNull().default("file"),
    status: text("status").notNull().default("pending"),
    originalName: text("original_name").notNull(),
    objectKey: text("object_key").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
  },
  (table) => [
    unique("message_attachments_id_workspace_unique").on(table.id, table.workspaceId),
    unique("message_attachments_object_key_unique").on(table.objectKey),
    index("message_attachments_workspace_project_created_idx").on(
      table.workspaceId,
      table.projectId,
      table.createdAt,
    ),
    index("message_attachments_workspace_message_idx").on(table.workspaceId, table.messageId),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "message_attachments_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.conversationId, table.workspaceId],
      foreignColumns: [conversations.id, conversations.workspaceId],
      name: "message_attachments_conversation_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.messageId, table.workspaceId],
      foreignColumns: [conversationMessages.id, conversationMessages.workspaceId],
      name: "message_attachments_message_workspace_fk",
    }).onDelete("cascade"),
    check("message_attachments_kind_check", sql`${table.kind} in ('file', 'voice')`),
    check(
      "message_attachments_status_check",
      sql`${table.status} in ('pending', 'ready', 'failed')`,
    ),
    check(
      "message_attachments_name_length_check",
      sql`char_length(btrim(${table.originalName})) between 1 and 255`,
    ),
    check(
      "message_attachments_media_type_length_check",
      sql`char_length(btrim(${table.mediaType})) between 1 and 127`,
    ),
    check("message_attachments_size_check", sql`${table.sizeBytes} between 1 and 10485760`),
    check("message_attachments_checksum_check", sql`${table.checksumSha256} ~ '^[a-f0-9]{64}$'`),
    check(
      "message_attachments_duration_check",
      sql`${table.durationMs} is null or ${table.durationMs} between 0 and 600000`,
    ),
    check(
      "message_attachments_state_check",
      sql`(${table.status} = 'ready' and ${table.readyAt} is not null) or (${table.status} <> 'ready' and ${table.readyAt} is null)`,
    ),
  ],
);
