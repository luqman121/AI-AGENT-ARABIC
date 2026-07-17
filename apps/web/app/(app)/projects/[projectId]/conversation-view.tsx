"use client";

import {
  AppHeader,
  Button,
  ConfirmDialog,
  Dialog,
  DropdownMenu,
  DropdownMenuItem,
  IconButton,
  MessageItem,
  RequestComposer,
  StatusBanner,
  TextField,
  Toast,
  type ToastData,
} from "@wakil/ui";
import { Archive, ArrowRight, EllipsisVertical, Eye, PencilLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { formatDateTimeLabel } from "../../../../src/lib/format-date";
import { newIdempotencyKey } from "../../../../src/lib/idempotency-key";
import {
  appendRequirementAction,
  archiveProjectAction,
  renameProjectAction,
} from "../../../../src/server/actions/projects";

export type ConversationMessage = {
  id: string;
  content: string;
  createdAtIso: string;
};

type ViewProps = {
  archived: boolean;
  messages: ConversationMessage[];
  projectId: string;
  title: string;
};

export function ConversationView({ archived, messages, projectId, title }: ViewProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [appendKey, setAppendKey] = useState(newIdempotencyKey);
  const [appendError, setAppendError] = useState<string | undefined>(undefined);
  const [appendPending, startAppend] = useTransition();

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState(title);
  const [renameKey, setRenameKey] = useState(newIdempotencyKey);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);
  const [renamePending, startRename] = useTransition();

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveKey, setArchiveKey] = useState(newIdempotencyKey);
  const [archivePending, startArchive] = useTransition();

  const [toast, setToast] = useState<ToastData | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function showToast(tone: ToastData["tone"], message: string) {
    setToast({ id: Date.now(), message, tone });
  }

  function submitRequirement() {
    if (appendPending) return;
    startAppend(async () => {
      try {
        const result = await appendRequirementAction({
          content: draft,
          idempotencyKey: appendKey,
          projectId,
        });
        if (result.ok) {
          setDraft("");
          setAppendError(undefined);
          setAppendKey(newIdempotencyKey());
          router.refresh();
          return;
        }
        setAppendError(result.fieldErrors?.["content"] ?? result.message);
      } catch {
        setAppendError("لم يُحفظ طلبك. تحقق من الاتصال ثم أعد المحاولة.");
      }
    });
  }

  function submitRename() {
    if (renamePending) return;
    startRename(async () => {
      try {
        const result = await renameProjectAction({
          idempotencyKey: renameKey,
          projectId,
          title: renameTitle,
        });
        if (result.ok) {
          setRenameOpen(false);
          setRenameError(undefined);
          setRenameKey(newIdempotencyKey());
          showToast("success", "تمت إعادة التسمية");
          router.refresh();
          return;
        }
        setRenameError(result.fieldErrors?.["title"] ?? result.message);
      } catch {
        setRenameError("لم يُحفظ الاسم الجديد. تحقق من الاتصال ثم أعد المحاولة.");
      }
    });
  }

  function submitArchive() {
    if (archivePending) return;
    startArchive(async () => {
      try {
        const result = await archiveProjectAction({
          idempotencyKey: archiveKey,
          projectId,
        });
        if (result.ok) {
          setArchiveOpen(false);
          setArchiveKey(newIdempotencyKey());
          router.push("/projects?filter=archived");
          return;
        }
        setArchiveOpen(false);
        showToast("danger", result.message);
      } catch {
        setArchiveOpen(false);
        showToast("danger", "لم تتم الأرشفة. تحقق من الاتصال ثم أعد المحاولة.");
      }
    });
  }

  return (
    <>
      <AppHeader
        title={title}
        start={
          <IconButton label="الرجوع إلى المشاريع" onClick={() => router.push("/projects")}>
            <ArrowRight aria-hidden className="size-5" />
          </IconButton>
        }
        end={
          <DropdownMenu
            trigger={
              <IconButton label="خيارات المشروع">
                <EllipsisVertical aria-hidden className="size-5" />
              </IconButton>
            }
          >
            <DropdownMenuItem
              icon={Eye}
              onSelect={() => router.push(`/projects/${projectId}/preview`)}
            >
              المعاينة
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={PencilLine}
              disabled={archived}
              onSelect={() => {
                setRenameTitle(title);
                setRenameOpen(true);
              }}
            >
              إعادة التسمية
            </DropdownMenuItem>
            <DropdownMenuItem
              icon={Archive}
              destructive
              disabled={archived}
              onSelect={() => setArchiveOpen(true)}
            >
              أرشفة المشروع
            </DropdownMenuItem>
          </DropdownMenu>
        }
      />

      <main
        id="main"
        className={
          archived
            ? "mx-auto flex w-full max-w-160 flex-1 flex-col px-4 pb-[calc(72px+env(safe-area-inset-bottom))] pt-4"
            : "mx-auto flex w-full max-w-160 flex-1 flex-col px-4 pb-[calc(160px+env(safe-area-inset-bottom))] pt-4"
        }
      >
        {archived ? (
          <StatusBanner tone="info" icon={Archive} className="mb-4">
            هذا المشروع مؤرشف؛ يمكنك قراءته فقط.
            <Link
              href="/projects?filter=archived"
              className="wk-focus-ring ms-1 inline-flex min-h-11 items-center underline"
            >
              عرض المؤرشفة
            </Link>
          </StatusBanner>
        ) : null}
        <div className="flex flex-1 flex-col justify-end gap-4">
          {messages.map((message) => (
            <MessageItem
              key={message.id}
              content={message.content}
              dateLabel={formatDateTimeLabel(new Date(message.createdAtIso))}
            />
          ))}
          <div ref={endRef} />
        </div>
      </main>

      {archived ? null : (
        <RequestComposer
          label="أضف متطلبات إضافية"
          placeholder="أضف تفاصيل أو متطلبات جديدة…"
          value={draft}
          onValueChange={(value) => {
            setDraft(value);
            if (appendError) setAppendError(undefined);
          }}
          onSubmit={submitRequirement}
          pending={appendPending}
          error={appendError}
        />
      )}

      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          setRenameOpen(open);
          if (!open) setRenameError(undefined);
        }}
        title="إعادة تسمية المشروع"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitRename();
          }}
          noValidate
        >
          <TextField
            label="اسم المشروع"
            value={renameTitle}
            onChange={(event) => setRenameTitle(event.target.value)}
            error={renameError}
            maxLength={120}
            required
          />
          <Button type="submit" loading={renamePending}>
            حفظ الاسم
          </Button>
        </form>
      </Dialog>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="أرشفة المشروع"
        description="سينتقل المشروع إلى قائمة المؤرشفة ولن تتمكن من التعديل عليه. بياناته المحفوظة ستبقى كما هي."
        confirmLabel="أرشفة المشروع"
        destructive
        loading={archivePending}
        onConfirm={submitArchive}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
