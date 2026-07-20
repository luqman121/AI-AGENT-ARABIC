import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    // Scrypt-derived hash for email + password sign-in. Null for accounts
    // created through an OAuth provider (e.g. Google), which never have one.
    passwordHash: text("password_hash"),
    // Platform role (distinct from workspace_members.role which is tenancy-scoped).
    // Only an authorized admin operation or direct DB provisioning may change it.
    role: text("role").notNull().default("user"),
    // Account lifecycle. A suspended account cannot use the product.
    status: text("status").notNull().default("active"),
    // Commercial plan; drives default usage allowances.
    plan: text("plan").notNull().default("free"),
    // Optional per-account monthly cost cap in integer micros (null = plan default).
    monthlyCostLimitMicros: bigint("monthly_cost_limit_micros", { mode: "number" }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    index("users_role_idx").on(table.role),
    index("users_status_idx").on(table.status),
    index("users_created_at_idx").on(table.createdAt),
    check("users_role_check", sql`${table.role} in ('user', 'support', 'admin')`),
    check("users_status_check", sql`${table.status} in ('active', 'suspended')`),
    check("users_plan_check", sql`${table.plan} in ('free', 'pro', 'business')`),
    check(
      "users_cost_limit_check",
      sql`${table.monthlyCostLimitMicros} is null or ${table.monthlyCostLimitMicros} >= 0`,
    ),
    check(
      "users_suspended_state_check",
      sql`(${table.status} = 'suspended' and ${table.suspendedAt} is not null) or (${table.status} = 'active' and ${table.suspendedAt} is null)`,
    ),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    // Snake_case TS property names are required by the Auth.js Drizzle
    // adapter, which spreads the raw OAuth account payload into this table.
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId], name: "accounts_pk" }),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.identifier, table.token], name: "verification_tokens_pk" }),
    uniqueIndex("verification_tokens_token_unique").on(table.token),
  ],
);
