"use server";

import { projects, runEvents, runs, users } from "@wakil/db/schema";
import {
  adminRunActionInputSchema,
  changeUsageLimitInputSchema,
  changeUserPlanInputSchema,
  changeUserRoleInputSchema,
  changeUserStatusInputSchema,
  type RunJobData,
} from "@wakil/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getDatabase } from "../db";
import { enforceRateLimit } from "../features/rate-limit/service";
import { enqueueRun } from "../features/runs/queue";
import { getRedis } from "../redis";
import { getAdminRequestMeta, writeAdminAudit } from "./audit";
import { AdminForbiddenError, requireAdminAction, type AdminAccount } from "./rbac";

export type AdminActionResult = { ok: true; message: string } | { ok: false; message: string };

const ok = (message: string): AdminActionResult => ({ message, ok: true });
const fail = (message: string): AdminActionResult => ({ message, ok: false });

const FORBIDDEN = fail("ليس لديك صلاحية لهذا الإجراء.");
const RATE_LIMITED = fail("طلبات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.");
const INTERNAL = fail("حدث خطأ غير متوقع. أعد المحاولة.");
const NOT_FOUND = fail("العنصر غير موجود.");

async function guard(
  permission: Parameters<typeof requireAdminAction>[0],
): Promise<AdminAccount | null> {
  try {
    return await requireAdminAction(permission);
  } catch (error) {
    if (error instanceof AdminForbiddenError) return null;
    throw error;
  }
}

async function limited(userId: string): Promise<boolean> {
  const result = await enforceRateLimit(getRedis(), userId, "admin.action");
  return result !== null;
}

/** Count of accounts that are both admin and active — the lockout guard. */
async function activeAdminCount(db: ReturnType<typeof getDatabase>): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active")));
  return Number(row?.n ?? 0);
}

/* ------------------------------------------------------------------ *
 * User: suspend / reactivate
 * ------------------------------------------------------------------ */

export async function changeUserStatusAction(input: unknown): Promise<AdminActionResult> {
  const account = await guard("user.suspend");
  if (!account) return FORBIDDEN;
  if (await limited(account.id)) return RATE_LIMITED;

  const parsed = changeUserStatusInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "مدخلات غير صالحة.");
  const { userId, status, reason } = parsed.data;
  const db = getDatabase();
  const meta = await getAdminRequestMeta();

  try {
    const result = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: users.id, role: users.role, status: users.status })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!target) return NOT_FOUND;
      if (target.status === status) return ok("لا تغيير مطلوب.");

      // Suspending an active admin must never lock everyone out.
      if (status === "suspended" && target.role === "admin") {
        if ((await activeAdminCount(tx as unknown as ReturnType<typeof getDatabase>)) <= 1) {
          return fail("لا يمكن إيقاف آخر مدير نشِط.");
        }
      }

      await tx
        .update(users)
        .set({
          status,
          suspendedAt: status === "suspended" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      await writeAdminAudit(tx, {
        action: status === "suspended" ? "account.suspended" : "account.reactivated",
        actorRole: account.role,
        actorUserId: account.id,
        after: { status },
        before: { status: target.status },
        ipAddress: meta.ipAddress,
        reason,
        requestId: meta.requestId,
        targetId: userId,
        targetType: "user",
        userAgent: meta.userAgent,
      });
      return ok(status === "suspended" ? "تم إيقاف الحساب." : "تم إعادة تفعيل الحساب.");
    });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/audit");
    return result;
  } catch {
    return INTERNAL;
  }
}

/* ------------------------------------------------------------------ *
 * User: change plan
 * ------------------------------------------------------------------ */

export async function changeUserPlanAction(input: unknown): Promise<AdminActionResult> {
  const account = await guard("user.plan");
  if (!account) return FORBIDDEN;
  if (await limited(account.id)) return RATE_LIMITED;

  const parsed = changeUserPlanInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "مدخلات غير صالحة.");
  const { userId, plan, reason } = parsed.data;
  const db = getDatabase();
  const meta = await getAdminRequestMeta();

  try {
    const result = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ plan: users.plan })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!target) return NOT_FOUND;
      if (target.plan === plan) return ok("لا تغيير مطلوب.");

      await tx.update(users).set({ plan, updatedAt: new Date() }).where(eq(users.id, userId));
      await writeAdminAudit(tx, {
        action: "user.plan_changed",
        actorRole: account.role,
        actorUserId: account.id,
        after: { plan },
        before: { plan: target.plan },
        ipAddress: meta.ipAddress,
        reason,
        requestId: meta.requestId,
        targetId: userId,
        targetType: "user",
        userAgent: meta.userAgent,
      });
      return ok("تم تغيير الخطة.");
    });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/audit");
    return result;
  } catch {
    return INTERNAL;
  }
}

/* ------------------------------------------------------------------ *
 * User: change usage limit
 * ------------------------------------------------------------------ */

export async function changeUsageLimitAction(input: unknown): Promise<AdminActionResult> {
  const account = await guard("user.limit");
  if (!account) return FORBIDDEN;
  if (await limited(account.id)) return RATE_LIMITED;

  const parsed = changeUsageLimitInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "مدخلات غير صالحة.");
  const { userId, monthlyCostLimitMicros, reason } = parsed.data;
  const db = getDatabase();
  const meta = await getAdminRequestMeta();

  try {
    const result = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ limit: users.monthlyCostLimitMicros })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!target) return NOT_FOUND;

      await tx
        .update(users)
        .set({ monthlyCostLimitMicros, updatedAt: new Date() })
        .where(eq(users.id, userId));
      await writeAdminAudit(tx, {
        action: "user.limit_changed",
        actorRole: account.role,
        actorUserId: account.id,
        after: { monthlyCostLimitMicros },
        before: { monthlyCostLimitMicros: target.limit ?? null },
        ipAddress: meta.ipAddress,
        reason,
        requestId: meta.requestId,
        targetId: userId,
        targetType: "user",
        userAgent: meta.userAgent,
      });
      return ok("تم تحديث حد الاستخدام.");
    });
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/audit");
    return result;
  } catch {
    return INTERNAL;
  }
}

/* ------------------------------------------------------------------ *
 * User: change role (admin only)
 * ------------------------------------------------------------------ */

export async function changeUserRoleAction(input: unknown): Promise<AdminActionResult> {
  const account = await guard("user.role");
  if (!account) return FORBIDDEN;
  if (await limited(account.id)) return RATE_LIMITED;

  const parsed = changeUserRoleInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "مدخلات غير صالحة.");
  const { userId, role, reason } = parsed.data;
  const db = getDatabase();
  const meta = await getAdminRequestMeta();

  try {
    const result = await db.transaction(async (tx) => {
      const [target] = await tx
        .select({ role: users.role, status: users.status })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!target) return NOT_FOUND;
      if (target.role === role) return ok("لا تغيير مطلوب.");

      // Demoting an active admin (incl. oneself) must keep at least one admin.
      if (target.role === "admin" && role !== "admin" && target.status === "active") {
        if ((await activeAdminCount(tx as unknown as ReturnType<typeof getDatabase>)) <= 1) {
          return fail("لا يمكن إزالة آخر مدير نشِط.");
        }
      }

      await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
      await writeAdminAudit(tx, {
        action: "user.role_changed",
        actorRole: account.role,
        actorUserId: account.id,
        after: { role },
        before: { role: target.role },
        ipAddress: meta.ipAddress,
        reason,
        requestId: meta.requestId,
        targetId: userId,
        targetType: "user",
        userAgent: meta.userAgent,
      });
      return ok("تم تغيير الدور.");
    });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${userId}`);
    revalidatePath("/admin/audit");
    return result;
  } catch {
    return INTERNAL;
  }
}

/* ------------------------------------------------------------------ *
 * Project: archive (safe status change; permanent deletion is intentionally
 * not implemented — R2 object cleanup semantics are not defined, see docs).
 * ------------------------------------------------------------------ */

export async function archiveProjectAdminAction(input: unknown): Promise<AdminActionResult> {
  const account = await guard("project.archive");
  if (!account) return FORBIDDEN;
  if (await limited(account.id)) return RATE_LIMITED;

  const record = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const projectId = typeof record.projectId === "string" ? record.projectId : "";
  const rawReason = typeof record.reason === "string" ? record.reason.trim() : undefined;
  const reason = rawReason ? rawReason.slice(0, 500) : undefined;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) return fail("معرّف المشروع غير صالح.");
  const db = getDatabase();
  const meta = await getAdminRequestMeta();

  try {
    const result = await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ status: projects.status, workspaceId: projects.workspaceId })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (!project) return NOT_FOUND;
      if (project.status !== "active") return ok("المشروع مؤرشف بالفعل.");

      await tx
        .update(projects)
        .set({ archivedAt: new Date(), status: "archived", updatedAt: new Date() })
        .where(eq(projects.id, projectId));
      await writeAdminAudit(tx, {
        action: "project.archived",
        actorRole: account.role,
        actorUserId: account.id,
        after: { status: "archived" },
        before: { status: project.status },
        ipAddress: meta.ipAddress,
        reason,
        requestId: meta.requestId,
        targetId: projectId,
        targetType: "project",
        userAgent: meta.userAgent,
      });
      return ok("تمت أرشفة المشروع.");
    });
    revalidatePath("/admin/projects");
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath("/admin/audit");
    return result;
  } catch {
    return INTERNAL;
  }
}

/* ------------------------------------------------------------------ *
 * Run: cancel (real cooperative cancellation)
 * ------------------------------------------------------------------ */

export async function cancelRunAdminAction(input: unknown): Promise<AdminActionResult> {
  const account = await guard("run.cancel");
  if (!account) return FORBIDDEN;
  if (await limited(account.id)) return RATE_LIMITED;

  const parsed = adminRunActionInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "مدخلات غير صالحة.");
  const { runId, reason } = parsed.data;
  const db = getDatabase();
  const meta = await getAdminRequestMeta();

  try {
    const result = await db.transaction(async (tx) => {
      const [run] = await tx
        .select({
          cancelRequestedAt: runs.cancelRequestedAt,
          projectId: runs.projectId,
          status: runs.status,
          workspaceId: runs.workspaceId,
        })
        .from(runs)
        .where(eq(runs.id, runId))
        .limit(1);
      if (!run) return NOT_FOUND;
      if (run.status !== "queued" && run.status !== "running") {
        return fail("لا يمكن إلغاء تشغيل غير نشِط.");
      }
      if (run.cancelRequestedAt) return ok("طلب الإلغاء مُرسَل بالفعل.");

      await tx
        .update(runs)
        .set({ cancelRequestedAt: new Date() })
        .where(and(eq(runs.id, runId), inArray(runs.status, ["queued", "running"])));

      await writeAdminAudit(tx, {
        action: "run.cancelled",
        actorRole: account.role,
        actorUserId: account.id,
        after: { cancelRequested: true },
        before: { status: run.status },
        ipAddress: meta.ipAddress,
        reason,
        requestId: meta.requestId,
        targetId: runId,
        targetType: "run",
        userAgent: meta.userAgent,
      });
      return ok("تم إرسال طلب الإلغاء. سيتوقف العامل عند نقطة التحقق التالية.");
    });
    revalidatePath(`/admin/runs/${runId}`);
    revalidatePath("/admin/runs");
    revalidatePath("/admin/audit");
    return result;
  } catch {
    return INTERNAL;
  }
}

/* ------------------------------------------------------------------ *
 * Run: retry a failed run (real re-enqueue, not a status flip)
 * ------------------------------------------------------------------ */

export async function retryRunAdminAction(input: unknown): Promise<AdminActionResult> {
  const account = await guard("run.retry");
  if (!account) return FORBIDDEN;
  if (await limited(account.id)) return RATE_LIMITED;

  const parsed = adminRunActionInputSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "مدخلات غير صالحة.");
  const { runId, reason } = parsed.data;
  const db = getDatabase();
  const meta = await getAdminRequestMeta();

  let enqueue: RunJobData | null = null;
  try {
    const result = await db.transaction(async (tx) => {
      const [run] = await tx
        .select({
          conversationId: runs.conversationId,
          createdByUserId: runs.createdByUserId,
          kind: runs.kind,
          parentRunId: runs.parentRunId,
          projectId: runs.projectId,
          status: runs.status,
          workspaceId: runs.workspaceId,
        })
        .from(runs)
        .where(eq(runs.id, runId))
        .limit(1);
      if (!run) return NOT_FOUND;
      if (run.status !== "failed") return fail("يمكن إعادة تشغيل العمليات الفاشلة فقط.");

      // The one-active-per-project index also enforces this, but a pre-check
      // gives a clean message and prevents an obviously-duplicate retry.
      const active = await tx
        .select({ id: runs.id })
        .from(runs)
        .where(and(eq(runs.projectId, run.projectId), inArray(runs.status, ["queued", "running"])))
        .limit(1);
      if (active.length > 0) return fail("هناك تشغيل نشط بالفعل لهذا المشروع.");

      const [created] = await tx
        .insert(runs)
        .values({
          conversationId: run.conversationId,
          createdByUserId: run.createdByUserId,
          kind: run.kind,
          parentRunId: run.parentRunId,
          projectId: run.projectId,
          status: "queued",
          workspaceId: run.workspaceId,
        })
        .returning({ id: runs.id });
      if (!created) return INTERNAL;

      await tx.insert(runEvents).values({
        data: {},
        runId: created.id,
        seq: 1,
        type: "run.queued",
        workspaceId: run.workspaceId,
      });

      await writeAdminAudit(tx, {
        action: "run.retried",
        actorRole: account.role,
        actorUserId: account.id,
        after: { newRunId: created.id },
        before: { failedRunId: runId },
        ipAddress: meta.ipAddress,
        reason,
        requestId: meta.requestId,
        targetId: runId,
        targetType: "run",
        userAgent: meta.userAgent,
      });

      enqueue = { projectId: run.projectId, runId: created.id, workspaceId: run.workspaceId };
      return ok("تمت إعادة التشغيل. سيلتقطه العامل قريبًا.");
    });

    if (enqueue) await enqueueRun(enqueue);
    revalidatePath(`/admin/runs/${runId}`);
    revalidatePath("/admin/runs");
    revalidatePath("/admin/audit");
    return result;
  } catch (error) {
    // Unique-violation on the active-run index = a concurrent retry won the race.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      return fail("هناك تشغيل نشط بالفعل لهذا المشروع.");
    }
    return INTERNAL;
  }
}
