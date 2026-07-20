"use client";

import { Button, Toast, type ToastData } from "@wakil/ui";
import { RefreshCw, Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelRunAdminAction, retryRunAdminAction } from "../../../../src/server/admin/actions";
import { ConfirmWithReason } from "../../_components/confirm-with-reason";
import { DetailCard } from "../../_components/ui";

type Dialog = "cancel" | "retry" | null;

export function RunAdminActions({
  runId,
  isActive,
  isFailed,
  cancelRequested,
  canManage,
}: {
  runId: string;
  isActive: boolean;
  isFailed: boolean;
  cancelRequested: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<ToastData | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canManage) {
    return (
      <DetailCard title="الإجراءات">
        <p className="text-sm text-fg-3">إجراءات التشغيل متاحة للمدير فقط.</p>
      </DetailCard>
    );
  }

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    startTransition(async () => {
      const result = await action();
      setToast({ id: Date.now(), message: result.message, tone: result.ok ? "success" : "danger" });
      setDialog(null);
      setReason("");
      if (result.ok) router.refresh();
    });
  }

  return (
    <DetailCard title="الإجراءات">
      <div className="flex flex-col gap-2">
        {isActive ? (
          <Button
            variant="secondary"
            className="w-full"
            disabled={cancelRequested}
            onClick={() => setDialog("cancel")}
          >
            <Ban aria-hidden className="size-5" />
            {cancelRequested ? "تم طلب الإلغاء" : "إلغاء التشغيل"}
          </Button>
        ) : null}
        {isFailed ? (
          <Button className="w-full" onClick={() => setDialog("retry")}>
            <RefreshCw aria-hidden className="size-5" />
            إعادة التشغيل
          </Button>
        ) : null}
        {!isActive && !isFailed ? (
          <p className="text-sm text-fg-3">لا توجد إجراءات متاحة لهذه الحالة.</p>
        ) : null}
      </div>

      <ConfirmWithReason
        open={dialog === "cancel"}
        onOpenChange={(open) => setDialog(open ? "cancel" : null)}
        title="إلغاء التشغيل"
        description="سيُطلب من العامل التوقف عند نقطة التحقق التالية."
        confirmLabel="تأكيد الإلغاء"
        destructive
        pending={pending}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() => run(() => cancelRunAdminAction({ reason: reason || undefined, runId }))}
      />

      <ConfirmWithReason
        open={dialog === "retry"}
        onOpenChange={(open) => setDialog(open ? "retry" : null)}
        title="إعادة التشغيل"
        description="سيُنشأ تشغيل جديد من الخطة ذاتها ويُدرَج في الطابور."
        confirmLabel="تأكيد الإعادة"
        pending={pending}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() => run(() => retryRunAdminAction({ reason: reason || undefined, runId }))}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </DetailCard>
  );
}
