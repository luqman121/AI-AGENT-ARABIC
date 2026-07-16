import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./auth.js";
import { workspaces } from "./tenancy.js";

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    response: jsonb("response").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // A key is reusable only by the same actor, workspace, and mutation operation.
    uniqueIndex("idempotency_keys_scope_unique").on(
      table.workspaceId,
      table.userId,
      table.operation,
      table.key,
    ),
    index("idempotency_keys_expires_at_idx").on(table.expiresAt),
    check("idempotency_keys_key_length_check", sql`char_length(${table.key}) between 16 and 128`),
    check("idempotency_keys_request_hash_check", sql`char_length(${table.requestHash}) = 64`),
  ],
);
