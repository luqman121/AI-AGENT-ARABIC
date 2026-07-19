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

import { projects } from "./projects.js";
import { runs } from "./runs.js";
import { workspaces } from "./tenancy.js";

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    runId: uuid("run_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull().default("نتيجة المشروع"),
    fileName: text("file_name").notNull().default("wakil-result.zip"),
    previewObjectKey: text("preview_object_key").notNull(),
    downloadObjectKey: text("download_object_key").notNull(),
    previewMediaType: text("preview_media_type").notNull(),
    downloadMediaType: text("download_media_type").notNull(),
    previewSizeBytes: integer("preview_size_bytes").notNull(),
    downloadSizeBytes: integer("download_size_bytes").notNull(),
    previewChecksumSha256: text("preview_checksum_sha256").notNull(),
    downloadChecksumSha256: text("download_checksum_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("artifacts_id_workspace_unique").on(table.id, table.workspaceId),
    unique("artifacts_preview_object_key_unique").on(table.previewObjectKey),
    unique("artifacts_download_object_key_unique").on(table.downloadObjectKey),
    foreignKey({
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
      name: "artifacts_project_workspace_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.runId, table.workspaceId],
      foreignColumns: [runs.id, runs.workspaceId],
      name: "artifacts_run_workspace_fk",
    }).onDelete("cascade"),
    index("artifacts_workspace_project_created_idx").on(
      table.workspaceId,
      table.projectId,
      table.createdAt,
    ),
    index("artifacts_workspace_run_created_idx").on(
      table.workspaceId,
      table.runId,
      table.createdAt,
    ),
    check(
      "artifacts_kind_check",
      sql`${table.kind} in ('static_site', 'document', 'presentation', 'spreadsheet', 'image')`,
    ),
    check(
      "artifacts_title_length_check",
      sql`char_length(btrim(${table.title})) between 1 and 200`,
    ),
    check(
      "artifacts_file_name_length_check",
      sql`char_length(btrim(${table.fileName})) between 1 and 255`,
    ),
    check(
      "artifacts_size_check",
      sql`${table.previewSizeBytes} between 1 and 500000 and ${table.downloadSizeBytes} between 1 and 2000000`,
    ),
    check(
      "artifacts_checksum_check",
      sql`${table.previewChecksumSha256} ~ '^[a-f0-9]{64}$' and ${table.downloadChecksumSha256} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);
