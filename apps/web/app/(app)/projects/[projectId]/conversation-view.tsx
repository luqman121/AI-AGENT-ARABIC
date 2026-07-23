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
  type ComposerAttachment,
  type ToastData,
} from "@wakil/ui";
import type { RunEventPayload } from "@wakil/shared";
import {
  Archive,
  ArrowDown,
  ArrowRight,
  EllipsisVertical,
  Eye,
  FolderOpen,
  MessageSquarePlus,
  MonitorPlay,
  PencilLine,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { formatDateTimeLabel } from "../../../../src/lib/format-date";
import { newIdempotencyKey } from "../../../../src/lib/idempotency-key";
import { arMessages } from "../../../../src/product/messages.ar";
import {
  appendRequirementAction,
  archiveProjectAction,
  renameProjectAction,
} from "../../../../src/server/actions/projects";
import type { ArtifactResultSummary } from "./artifact-result-card";
import { MobileWorkspaceNav } from "./mobile-workspace-nav";
import { RunPanel, type RunPanelSummary } from "./run-panel";

export type ConversationMessage = {
  id: string;
  content: string;
  createdAtIso: string;
  role: "user" | "assistant";
};

type PendingAttachment = ComposerAttachment & {
  file: File;
  serverId?: string | undefined;
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT =
  /^(image\/(jpeg|png|webp)|audio\/(webm|mpeg|wav|mp4)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.ms-excel))$/;

type RecentProjectSummary = {
  excerpt: string;
  id: string;
  title: string;
  updatedAtIso: string;
};

type ViewProps = {
  archived: boolean;
  /** True only right after creation, when the page URL still carries `?autostart=1`. */
  autoStart: boolean;
  initialEvents: RunEventPayload[];
  initialRun: RunPanelSummary | null;
  artifacts: ArtifactResultSummary[];
  messages: ConversationMessage[];
  projectId: string;
  recentProjects: RecentProjectSummary[];
  title: string;
};

export function ConversationView({
  archived,
  artifacts,
  autoStart,
  initialEvents,
  initialRun,
  messages,
  projectId,
  recentProjects,
  title,
}: ViewProps) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [appendKey, setAppendKey] = useState(newIdempotencyKey);
  const [appendError, setAppendError] = useState<string | undefined>(undefined);
  const [appendPending, startAppend] = useTransition();
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [composerHeight, setComposerHeight] = useState(104);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState(title);
  const [renameKey, setRenameKey] = useState(newIdempotencyKey);
  const [renameError, setRenameError] = useState<string | undefined>(undefined);
  const [renamePending, startRename] = useTransition();

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveKey, setArchiveKey] = useState(newIdempotencyKey);
  const [archivePending, startArchive] = useTransition();

  const [toast, setToast] = useState<ToastData | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const initialScrollRef = useRef(false);
  const nearLatestRef = useRef(true);
  const attachmentUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    const update = () => {
      const end = endRef.current;
      const nearLatest = !end || end.getBoundingClientRect().top <= window.innerHeight + 160;
      nearLatestRef.current = nearLatest;
      setShowJumpToLatest(!nearLatest);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (initialScrollRef.current && !nearLatestRef.current) return;
    initialScrollRef.current = true;
    const frame = window.requestAnimationFrame(() =>
      endRef.current?.scrollIntoView({ block: "end" }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length]);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(`wakil:project-draft:${projectId}`);
    const timer = window.setTimeout(() => {
      if (saved) setDraft(saved);
      setDraftLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [projectId]);

  useEffect(() => {
    if (!draftLoaded) return;
    const key = `wakil:project-draft:${projectId}`;
    if (draft) window.sessionStorage.setItem(key, draft);
    else window.sessionStorage.removeItem(key);
  }, [draft, draftLoaded, projectId]);

  useEffect(
    () => () => {
      for (const url of attachmentUrlsRef.current) URL.revokeObjectURL(url);
      attachmentUrlsRef.current.clear();
    },
    [],
  );

  function showToast(tone: ToastData["tone"], message: string) {
    setToast({ id: Date.now(), message, tone });
  }

  function addFiles(files: File[]) {
    const accepted: PendingAttachment[] = [];
    const available = Math.max(0, 6 - attachments.length);
    if (available === 0) {
      setAppendError("يمكنك إرفاق 6 ملفات كحد أقصى.");
      return;
    }
    let selectionError =
      files.length > available ? `تم اختيار أول ${available} ملفات فقط.` : undefined;
    for (const file of files.slice(0, available)) {
      if (!ALLOWED_ATTACHMENT.test(file.type)) {
        selectionError = `نوع الملف غير مدعوم: ${file.name}`;
        continue;
      }
      if (file.size < 1 || file.size > MAX_ATTACHMENT_BYTES) {
        selectionError = `حجم الملف ${file.name} أكبر من الحد المسموح (10 ميجابايت).`;
        continue;
      }
      const duplicate = attachments.some(
        (attachment) =>
          attachment.file.name === file.name &&
          attachment.file.size === file.size &&
          attachment.file.lastModified === file.lastModified,
      );
      if (duplicate) continue;
      const previewUrl =
        file.type.startsWith("image/") || file.type.startsWith("audio/")
          ? URL.createObjectURL(file)
          : undefined;
      if (previewUrl) attachmentUrlsRef.current.add(previewUrl);
      accepted.push({
        file,
        id: crypto.randomUUID(),
        mediaType: file.type,
        name: file.name,
        previewUrl,
        sizeBytes: file.size,
        status: "ready",
      });
    }
    if (accepted.length > 0) {
      setAttachments((current) => [...current, ...accepted]);
    }
    setAppendError(selectionError);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const attachment = current.find((item) => item.id === id);
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
        attachmentUrlsRef.current.delete(attachment.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  async function uploadAttachment(attachment: PendingAttachment) {
    if (attachment.serverId) return attachment.serverId;
    const form = new FormData();
    form.set("file", attachment.file);
    const response = await fetch(`/api/projects/${projectId}/attachments`, {
      body: form,
      method: "POST",
    });
    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
    } | null;
    if (!response.ok || !payload?.id) {
      throw new Error(payload?.message ?? "فشل رفع الملف");
    }
    return payload.id;
  }

  function submitRequirement() {
    if (appendPending) return;
    startAppend(async () => {
      try {
        setAttachments((current) =>
          current.map((attachment) => ({ ...attachment, error: undefined, status: "uploading" })),
        );
        const uploaded: { localId: string; serverId: string }[] = [];
        for (const attachment of attachments) {
          const serverId = await uploadAttachment(attachment);
          uploaded.push({ localId: attachment.id, serverId });
          setAttachments((current) =>
            current.map((item) =>
              item.id === attachment.id ? { ...item, serverId, status: "ready" } : item,
            ),
          );
        }
        const result = await appendRequirementAction({
          attachmentIds: uploaded.map((attachment) => attachment.serverId),
          clientMessageId: appendKey,
          content: draft,
          idempotencyKey: appendKey,
          projectId,
        });
        if (result.ok) {
          for (const attachment of attachments) {
            if (attachment.previewUrl) {
              URL.revokeObjectURL(attachment.previewUrl);
              attachmentUrlsRef.current.delete(attachment.previewUrl);
            }
          }
          setAttachments([]);
          setDraft("");
          setAppendError(undefined);
          setAppendKey(newIdempotencyKey());
          router.refresh();
          return;
        }
        setAppendError(result.fieldErrors?.["content"] ?? result.message);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "فشل رفع الملف";
        setAttachments((current) =>
          current.map((attachment) =>
            attachment.status === "uploading"
              ? { ...attachment, error: message, status: "error" }
              : attachment,
          ),
        );
        setAppendError(`${message}. يمكنك إعادة المحاولة دون فقدان طلبك.`);
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

      <MobileWorkspaceNav projectId={projectId} />

      <main
        id="main"
        style={
          archived
            ? undefined
            : { paddingBottom: `calc(${composerHeight + 72}px + env(safe-area-inset-bottom))` }
        }
        className={
          archived
            ? "mx-auto grid w-full max-w-[1180px] flex-1 gap-4 px-4 pb-[calc(72px+env(safe-area-inset-bottom))] pt-4 lg:grid-cols-[240px_minmax(0,1fr)_300px]"
            : "mx-auto grid w-full max-w-[1180px] flex-1 gap-4 px-4 pt-4 lg:grid-cols-[240px_minmax(0,1fr)_300px]"
        }
      >
        <aside className="hidden min-h-0 rounded-lg border border-line bg-surface-1 p-3 lg:block">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-fg">مشاريع قريبة</p>
            <Link
              href="/new"
              aria-label="مشروع جديد"
              className="wk-focus-ring inline-flex size-10 items-center justify-center rounded-md bg-accent text-fg-on-accent"
            >
              <MessageSquarePlus aria-hidden className="size-4" />
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <div className="rounded-md border border-accent/60 bg-accent-subtle p-3">
              <p className="line-clamp-2 text-sm font-bold leading-6 text-fg">{title}</p>
              <p className="mt-1 text-xs text-fg-accent">المشروع الحالي</p>
            </div>
            {recentProjects.length > 0 ? (
              recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="wk-focus-ring rounded-md border border-line bg-card p-3 transition-colors hover:bg-overlay"
                >
                  <span className="line-clamp-1 text-sm font-semibold text-fg-2">
                    {project.title}
                  </span>
                  <span className="mt-1 line-clamp-2 text-xs leading-5 text-fg-3">
                    {project.excerpt || "لا يوجد وصف محفوظ."}
                  </span>
                  <span className="mt-2 block text-[11px] text-fg-3">
                    {formatDateTimeLabel(new Date(project.updatedAtIso))}
                  </span>
                </Link>
              ))
            ) : (
              <p className="rounded-md border border-dashed border-line p-3 text-xs leading-5 text-fg-3">
                ستظهر مشاريعك الأخيرة هنا بعد إنشاء مشاريع أخرى.
              </p>
            )}
          </div>
        </aside>

        <section id="conversation" className="min-w-0 scroll-mt-32">
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
          <div className="mx-auto flex w-full max-w-160 flex-1 flex-col justify-end gap-4">
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                content={message.content}
                dateLabel={formatDateTimeLabel(new Date(message.createdAtIso))}
                role={message.role}
              />
            ))}
            <RunPanel
              archived={archived}
              autoStart={autoStart}
              initialEvents={initialEvents}
              initialRun={initialRun}
              artifacts={artifacts}
              projectId={projectId}
              projectTitle={title}
            />
            <div ref={endRef} />
          </div>
        </section>

        <aside className="hidden min-h-0 rounded-lg border border-line bg-surface-1 p-3 lg:flex lg:flex-col">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-fg">المعاينة والنتيجة</p>
            <MonitorPlay aria-hidden className="size-4 text-fg-3" />
          </div>
          {artifacts[0] ? (
            <Link
              href={`/projects/${projectId}/preview?artifact=${artifacts[0].id}`}
              className="wk-focus-ring flex min-h-[260px] flex-1 flex-col justify-between overflow-hidden rounded-md border border-line bg-page p-3 transition-colors hover:bg-overlay"
            >
              <span className="rounded-md border border-line bg-white p-2 shadow-sm" dir="ltr">
                <span className="mb-2 flex gap-1 border-b border-slate-200 pb-2">
                  <span className="size-2 rounded-full bg-slate-300" />
                  <span className="size-2 rounded-full bg-slate-300" />
                  <span className="size-2 rounded-full bg-slate-300" />
                </span>
                <span className="block h-24 rounded bg-slate-100" />
              </span>
              <span className="mt-3 text-sm font-semibold text-fg">فتح المعاينة الكاملة</span>
              <span className="text-xs text-fg-3">المعاينة الخاصة تفتح في صفحة آمنة منفصلة.</span>
            </Link>
          ) : (
            <div className="flex min-h-[260px] flex-1 flex-col items-center justify-center rounded-md border border-dashed border-line p-4 text-center">
              <FolderOpen aria-hidden className="mb-3 size-8 text-fg-3" />
              <p className="text-sm font-semibold text-fg">لا توجد نتيجة بعد</p>
              <p className="mt-2 text-xs leading-5 text-fg-3">
                ستظهر المعاينة هنا على سطح المكتب بعد اكتمال التنفيذ الحقيقي.
              </p>
            </div>
          )}
        </aside>
      </main>

      {showJumpToLatest ? (
        <Button
          type="button"
          size="compact"
          variant="secondary"
          style={{
            bottom: `calc(${archived ? 72 : composerHeight + 72}px + env(safe-area-inset-bottom))`,
          }}
          onClick={() => {
            nearLatestRef.current = true;
            setShowJumpToLatest(false);
            endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
          }}
          className="fixed left-1/2 z-(--wk-z-nav) -translate-x-1/2 shadow-soft"
        >
          <ArrowDown aria-hidden className="size-4" />
          {arMessages.workspace.jumpToLatest}
        </Button>
      ) : null}

      {archived ? null : (
        <RequestComposer
          attachments={attachments}
          label="أضف متطلبات إضافية"
          placeholder="أضف تفاصيل أو متطلبات جديدة…"
          value={draft}
          onValueChange={(value) => {
            setDraft(value);
            if (appendError) setAppendError(undefined);
          }}
          onSubmit={submitRequirement}
          onFilesSelected={addFiles}
          onVoiceRecorded={(file) => addFiles([file])}
          onAttachmentRemove={removeAttachment}
          onAttachmentError={setAppendError}
          onHeightChange={setComposerHeight}
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
