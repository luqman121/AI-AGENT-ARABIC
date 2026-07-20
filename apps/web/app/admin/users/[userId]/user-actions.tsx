"use client";

import { Button, TextField, Toast, type ToastData } from "@wakil/ui";
import { Ban, Coins, Gauge, ShieldCheck, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  changeUsageLimitAction,
  changeUserPlanAction,
  changeUserRoleAction,
  changeUserStatusAction,
} from "../../../../src/server/admin/actions";
import { ConfirmWithReason } from "../../_components/confirm-with-reason";
import { DetailCard } from "../../_components/ui";

type Dialog = "status" | "role" | "plan" | "limit" | null;
type Result = { ok: boolean; message: string };

const selectClass =
  "wk-focus-ring min-h-11 w-full rounded-md border border-line-input bg-input px-3 text-sm text-fg";

export function UserAdminActions({
  userId,
  role,
  status,
  plan,
  monthlyCostLimitMicros,
  canManage,
  isSelf,
}: {
  userId: string;
  email: string | null;
  role: string;
  status: string;
  plan: string;
  monthlyCostLimitMicros: number | null;
  canManage: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [nextRole, setNextRole] = useState(role);
  const [nextPlan, setNextPlan] = useState(plan);
  const [limitInput, setLimitInput] = useState(
    monthlyCostLimitMicros === null ? "" : String(monthlyCostLimitMicros / 1_000_000),
  );
  const [toast, setToast] = useState<ToastData | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <DetailCard title="الإجراءات الإدارية">
        <p className="text-sm text-fg-3">الإجراءات متاحة للمدير فقط. الدعم يملك صلاحية القراءة.</p>
        <Link
          href={`/admin/audit?target=user&id=${userId}`}
          className="wk-focus-ring text-sm font-semibold text-fg-accent"
        >
          عرض سجل هذا العميل
        </Link>
      </DetailCard>
    );
  }

  function run(action: () => Promise<Result>) {
    startTransition(async () => {
      const result = await action();
      setToast({ id: Date.now(), message: result.message, tone: result.ok ? "success" : "danger" });
      setDialog(null);
      setReason("");
      if (result.ok) router.refresh();
    });
  }

  const suspend = status === "active";
  const limitMicros = limitInput.trim() === "" ? null : Math.round(Number(limitInput) * 1_000_000);
  const limitValid =
    limitInput.trim() === "" || (Number.isFinite(Number(limitInput)) && Number(limitInput) >= 0);

  return (
    <DetailCard title="الإجراءات الإدارية">
      <div className="flex flex-col gap-2">
        <Button
          variant={suspend ? "danger" : "primary"}
          className="w-full"
          onClick={() => setDialog("status")}
        >
          {suspend ? (
            <Ban aria-hidden className="size-5" />
          ) : (
            <UserCheck aria-hidden className="size-5" />
          )}
          {suspend ? "إيقاف الحساب" : "إعادة التفعيل"}
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => setDialog("plan")}>
          <Coins aria-hidden className="size-5" />
          تغيير الخطة
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => setDialog("limit")}>
          <Gauge aria-hidden className="size-5" />
          تغيير حد الاستخدام
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => setDialog("role")}>
          <ShieldCheck aria-hidden className="size-5" />
          تغيير الدور
        </Button>
        <Link
          href={`/admin/audit?target=user&id=${userId}`}
          className="wk-focus-ring inline-flex min-h-11 items-center justify-center rounded-md text-sm font-semibold text-fg-accent"
        >
          عرض سجل هذا العميل
        </Link>
      </div>

      <ConfirmWithReason
        open={dialog === "status"}
        onOpenChange={(open) => setDialog(open ? "status" : null)}
        title={suspend ? "إيقاف الحساب" : "إعادة تفعيل الحساب"}
        description={
          suspend
            ? isSelf
              ? "تحذير: أنت توقف حسابك أنت. لن يُسمح بذلك إن كنت آخر مدير نشِط."
              : "لن يتمكن العميل من استخدام المنصة حتى إعادة التفعيل."
            : "سيستعيد العميل الوصول إلى المنصة."
        }
        confirmLabel={suspend ? "تأكيد الإيقاف" : "تأكيد التفعيل"}
        destructive={suspend}
        pending={pending}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() =>
          run(() =>
            changeUserStatusAction({
              reason: reason || undefined,
              status: suspend ? "suspended" : "active",
              userId,
            }),
          )
        }
      />

      <ConfirmWithReason
        open={dialog === "plan"}
        onOpenChange={(open) => setDialog(open ? "plan" : null)}
        title="تغيير الخطة"
        confirmLabel="حفظ"
        pending={pending}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() =>
          run(() => changeUserPlanAction({ plan: nextPlan, reason: reason || undefined, userId }))
        }
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-fg">الخطة</span>
          <select
            className={selectClass}
            value={nextPlan}
            onChange={(event) => setNextPlan(event.target.value)}
          >
            <option value="free">مجاني</option>
            <option value="pro">احترافي</option>
            <option value="business">أعمال</option>
          </select>
        </label>
      </ConfirmWithReason>

      <ConfirmWithReason
        open={dialog === "role"}
        onOpenChange={(open) => setDialog(open ? "role" : null)}
        title="تغيير الدور"
        description="الأدوار تتحكم في صلاحيات الوصول. لا يمكن إزالة آخر مدير نشِط."
        confirmLabel="حفظ"
        pending={pending}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() =>
          run(() => changeUserRoleAction({ reason: reason || undefined, role: nextRole, userId }))
        }
      >
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-fg">الدور</span>
          <select
            className={selectClass}
            value={nextRole}
            onChange={(event) => setNextRole(event.target.value)}
          >
            <option value="user">مستخدم</option>
            <option value="support">دعم</option>
            <option value="admin">مدير</option>
          </select>
        </label>
      </ConfirmWithReason>

      <ConfirmWithReason
        open={dialog === "limit"}
        onOpenChange={(open) => setDialog(open ? "limit" : null)}
        title="تغيير حد الاستخدام الشهري"
        description="حد التكلفة الشهري بالدولار. اترك الحقل فارغًا للعودة إلى حد الخطة الافتراضي."
        confirmLabel="حفظ"
        pending={pending}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() => {
          if (!limitValid) {
            setToast({ id: Date.now(), message: "قيمة الحد غير صالحة.", tone: "danger" });
            return;
          }
          run(() =>
            changeUsageLimitAction({
              monthlyCostLimitMicros: limitMicros,
              reason: reason || undefined,
              userId,
            }),
          );
        }}
      >
        <TextField
          label="الحد الشهري (دولار)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={limitInput}
          onChange={(event) => setLimitInput(event.target.value)}
          placeholder="مثال: 25"
          dir="ltr"
          className="text-start"
          error={limitValid ? undefined : "قيمة غير صالحة"}
        />
      </ConfirmWithReason>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </DetailCard>
  );
}
