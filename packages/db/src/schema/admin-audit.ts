import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth.js";

type AdminAuditData = Record<string, boolean | number | string | null>;

/**
 * Immutable, cross-tenant ledger of privileged administrator actions. Distinct
 * from `audit_logs` (which is workspace-scoped for customer actions). Rows are
 * append-only: the admin UI never edits or deletes them, and the actor FK is
 * ON DELETE RESTRICT so an actor with audit history cannot be hard-deleted.
 * Before/after snapshots are redacted server-side; secrets are never stored.
 */
export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    beforeData: jsonb("before_data").$type<AdminAuditData>(),
    afterData: jsonb("after_data").$type<AdminAuditData>(),
    reason: text("reason"),
    requestId: text("request_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("admin_audit_logs_actor_created_idx").on(table.actorUserId, table.createdAt),
    index("admin_audit_logs_action_created_idx").on(table.action, table.createdAt),
    index("admin_audit_logs_target_idx").on(table.targetType, table.targetId),
    index("admin_audit_logs_created_idx").on(table.createdAt),
    check("admin_audit_logs_actor_role_check", sql`${table.actorRole} in ('support', 'admin')`),
    check(
      "admin_audit_logs_reason_length_check",
      sql`${table.reason} is null or char_length(${table.reason}) <= 500`,
    ),
    check(
      "admin_audit_logs_user_agent_length_check",
      sql`${table.userAgent} is null or char_length(${table.userAgent}) <= 500`,
    ),
  ],
);
