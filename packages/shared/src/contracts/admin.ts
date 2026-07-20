import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Roles, plans, statuses
 * ------------------------------------------------------------------ */

/** Platform role, distinct from the workspace-scoped tenancy role. */
export const PLATFORM_ROLES = ["user", "support", "admin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const USER_STATUSES = ["active", "suspended"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const USER_PLANS = ["free", "pro", "business"] as const;
export type UserPlan = (typeof USER_PLANS)[number];

const ROLE_RANK: Record<PlatformRole, number> = { user: 0, support: 1, admin: 2 };

/** True when `role` meets or exceeds `minimum` in the platform hierarchy. */
export function hasAtLeastRole(role: PlatformRole, minimum: PlatformRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function isKnownRole(value: unknown): value is PlatformRole {
  return typeof value === "string" && (PLATFORM_ROLES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ *
 * Permission matrix (server-enforced; the UI only mirrors it)
 * ------------------------------------------------------------------ */

export const ADMIN_PERMISSIONS = [
  "dashboard.read",
  "user.suspend",
  "user.plan",
  "user.limit",
  "user.role",
  "run.cancel",
  "run.retry",
  "project.archive",
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const PERMISSIONS_BY_ROLE: Record<PlatformRole, ReadonlySet<AdminPermission>> = {
  user: new Set(),
  support: new Set(["dashboard.read"]),
  admin: new Set(ADMIN_PERMISSIONS),
};

/** Whether a role may perform an admin permission. Support is read-only. */
export function can(role: PlatformRole, permission: AdminPermission): boolean {
  return PERMISSIONS_BY_ROLE[role].has(permission);
}

/** Any dashboard access at all (support or admin). */
export function canAccessAdmin(role: PlatformRole): boolean {
  return can(role, "dashboard.read");
}

/* ------------------------------------------------------------------ *
 * Cost + number formatting (pure)
 * ------------------------------------------------------------------ */

/** Model costs are stored as integer micros of USD. Never use floats for storage. */
export function microsToUsd(micros: number): number {
  return micros / 1_000_000;
}

/** Compact USD label for an ops surface; more precision for sub-cent amounts. */
export function formatUsdFromMicros(micros: number): string {
  const usd = microsToUsd(micros);
  const decimals = micros !== 0 && Math.abs(usd) < 1 ? 4 : 2;
  return `$${usd.toFixed(decimals)}`;
}

export function formatTokens(count: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.trunc(count)));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Completed / (completed + failed), as a 0–100 integer. Empty windows read 0. */
export function successRate(completed: number, failed: number): number {
  const total = completed + failed;
  if (total <= 0) return 0;
  return Math.round((completed / total) * 100);
}

/* ------------------------------------------------------------------ *
 * Pagination
 * ------------------------------------------------------------------ */

export const ADMIN_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function clampPage(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
}

export function clampPageSize(value: unknown, fallback: number = ADMIN_PAGE_SIZE): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(parsed)));
}

/* ------------------------------------------------------------------ *
 * Audit redaction (pure) — never persist secrets to the ledger
 * ------------------------------------------------------------------ */

const SENSITIVE_KEY_PATTERNS = [
  "password",
  "hash",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "credential",
  "session",
];

export type AuditData = Record<string, boolean | number | string | null>;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Produces a jsonb-safe snapshot: sensitive keys are dropped entirely, and only
 * primitive values are retained (objects/arrays are stringified). Never returns
 * a password, hash, token, or secret regardless of the input shape.
 */
export function redactAuditData(input: Record<string, unknown>): AuditData {
  const output: AuditData = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) continue;
    if (value === null) {
      output[key] = null;
    } else if (
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string"
    ) {
      output[key] = value;
    } else if (value instanceof Date) {
      output[key] = value.toISOString();
    } else {
      output[key] = JSON.stringify(value);
    }
  }
  return output;
}

/* ------------------------------------------------------------------ *
 * Admin action inputs (validated at the server boundary)
 * ------------------------------------------------------------------ */

const reasonSchema = z.string().trim().max(500, "السبب طويل جدًا.").optional();
const adminUserIdSchema = z.uuid({ error: "معرّف المستخدم غير صالح." });
const adminRunIdSchema = z.uuid({ error: "معرّف التشغيل غير صالح." });

export const changeUserRoleInputSchema = z.object({
  userId: adminUserIdSchema,
  role: z.enum(PLATFORM_ROLES, { error: "الدور غير صالح." }),
  reason: reasonSchema,
});
export type ChangeUserRoleInput = z.infer<typeof changeUserRoleInputSchema>;

export const changeUserStatusInputSchema = z.object({
  userId: adminUserIdSchema,
  status: z.enum(USER_STATUSES, { error: "الحالة غير صالحة." }),
  reason: reasonSchema,
});
export type ChangeUserStatusInput = z.infer<typeof changeUserStatusInputSchema>;

export const changeUserPlanInputSchema = z.object({
  userId: adminUserIdSchema,
  plan: z.enum(USER_PLANS, { error: "الخطة غير صالحة." }),
  reason: reasonSchema,
});
export type ChangeUserPlanInput = z.infer<typeof changeUserPlanInputSchema>;

export const changeUsageLimitInputSchema = z.object({
  userId: adminUserIdSchema,
  // Integer micros of USD; null clears the override back to the plan default.
  monthlyCostLimitMicros: z
    .number()
    .int("الحد يجب أن يكون رقمًا صحيحًا.")
    .min(0, "الحد لا يمكن أن يكون سالبًا.")
    .max(1_000_000_000_000, "الحد كبير جدًا.")
    .nullable(),
  reason: reasonSchema,
});
export type ChangeUsageLimitInput = z.infer<typeof changeUsageLimitInputSchema>;

export const adminRunActionInputSchema = z.object({
  runId: adminRunIdSchema,
  reason: reasonSchema,
});
export type AdminRunActionInput = z.infer<typeof adminRunActionInputSchema>;
