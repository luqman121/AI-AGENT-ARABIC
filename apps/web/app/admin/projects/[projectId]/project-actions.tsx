"use client";

import { Button, Toast, type ToastData } from "@wakil/ui";
import { Archive, Ban, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  archiveProjectAdminAction,
  cancelRunAdminAction,
  retryRunAdminAction,
} from "../../../../src/server/admin/actions";
import { ConfirmWithReason } from "../../_components/confirm-with-reason";
import { DetailCard } from "../../_components/ui";

type Dialog = "cancel" | "retry" | "archive" | null;

export function ProjectAdminActions({
  projectId,
  projectStatus,
  activeRunId,
  failedRunId,
  canManage,
}: {
  projectId: string;
  projectStatus: string;
  activeRunId: string | null;
  failedRunId: string | null;
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
        <p className="text-sm text-fg-3">إجراءات المشروع متاحة للمدير فقط.</p>
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
        {activeRunId ? (
          <Button variant="secondary" className="w-full" onClick={() => setDialog("cancel")}>
            <Ban aria-hidden className="size-5" />
            إلغاء التشغيل الحالي
          </Button>
        ) : null}
        {failedRunId ? (
          <Button variant="secondary" className="w-full" onClick={() => setDialog("retry")}>
            <RefreshCw aria-hidden className="size-5" />
            إعادة آخر تشغيل فاشل
          </Button>
        ) : null}
        {projectStatus === "active" ? (
          <Button variant="danger" className="w-full" onClick={() => setDialog("archive")}>
            <Archive aria-hidden className="size-5" />
            أرشفة المشروع
          </Button>
        ) : (
          <p className="text-sm text-fg-3">المشروع مؤرشف.</p>
        )}
      </div>

      {activeRunId ? (
        <ConfirmWithReason
          open={dialog === "cancel"}
          onOpenChange={(open) => setDialog(open ? "cancel" : null)}
          title="إلغاء التشغيل الحالي"
          description="سيُطلب من العامل التوقف عند نقطة التحقق التالية."
          confirmLabel="تأكيد الإلغاء"
          destructive
          pending={pending}
          reason={reason}
          onReasonChange={setReason}
          onConfirm={() =>
            run(() => cancelRunAdminAction({ reason: reason || undefined, runId: activeRunId }))
          }
        />
      ) : null}

      {failedRunId ? (
        <ConfirmWithReason
          open={dialog === "retry"}
          onOpenChange={(open) => setDialog(open ? "retry" : null)}
          title="إعادة التشغيل"
          description="سيُنشأ تشغيل جديد ويُدرَج في الطابور."
          confirmLabel="تأكيد الإعادة"
          pending={pending}
          reason={reason}
          onReasonChange={setReason}
          onConfirm={() =>
            run(() => retryRunAdminAction({ reason: reason || undefined, runId: failedRunId }))
          }
        />
      ) : null}

      <ConfirmWithReason
        open={dialog === "archive"}
        onOpenChange={(open) => setDialog(open ? "archive" : null)}
        title="أرشفة المشروع"
        description="سينتقل المشروع إلى المؤرشفة. لا يُحذف أي ملف — الأرشفة تغيير حالة آمن فقط."
        confirmLabel="تأكيد الأرشفة"
        destructive
        pending={pending}
        reason={reason}
        onReasonChange={setReason}
        onConfirm={() =>
          run(() => archiveProjectAdminAction({ projectId, reason: reason || undefined }))
        }
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </DetailCard>
  );
}
