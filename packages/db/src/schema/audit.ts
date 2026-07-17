import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { workspaces } from "./tenancy.js";

type AuditMetadata = Record<string, boolean | number | string | null>;

// Both foreign keys use ON DELETE RESTRICT: audit rows are an append-only ledger,
// so a workspace or user with audit history cannot be hard-deleted by cascade.
// Account/workspace removal in later milestones must anonymize or retain instead.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    metadata: jsonb("metadata").$type<AuditMetadata>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("audit_logs_actor_created_idx").on(table.actorUserId, table.createdAt),
  ],
);
