"use client";

import {
  AlertCircle,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Mic,
  Music2,
  Paperclip,
  Pause,
  Play,
  SendHorizontal,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";

import { cn } from "../lib/cn";
import { FormError } from "./form-error";

export type ComposerAttachment = {
  id: string;
  name: string;
  sizeBytes: number;
  mediaType: string;
  status: "ready" | "uploading" | "error";
  previewUrl?: string | undefined;
  error?: string | undefined;
};

export type RequestComposerProps = {
  label: string;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  pending?: boolean | undefined;
  error?: string | undefined;
  sticky?: boolean | undefined;
  className?: string;
  attachments?: ComposerAttachment[] | undefined;
  attachmentAccept?: string | undefined;
  maxAttachments?: number | undefined;
  onFilesSelected?: ((files: File[]) => void) | undefined;
  onAttachmentRemove?: ((id: string) => void) | undefined;
  onVoiceRecorded?: ((file: File) => void) | undefined;
  onAttachmentError?: ((message: string) => void) | undefined;
  onHeightChange?: ((height: number) => void) | undefined;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

function attachmentIcon(mediaType: string) {
  if (mediaType.startsWith("image/")) return ImageIcon;
  if (mediaType.startsWith("audio/")) return Music2;
  return FileText;
}

export function RequestComposer({
  attachmentAccept = "image/jpeg,image/png,image/webp,application/pdf,text/plain,audio/webm,audio/mpeg,audio/wav,.doc,.docx,.xls,.xlsx",
  attachments = [],
  className,
  error,
  label,
  maxAttachments = 6,
  onAttachmentError,
  onAttachmentRemove,
  onFilesSelected,
  onHeightChange,
  onSubmit,
  onValueChange,
  onVoiceRecorded,
  pending,
  placeholder,
  sticky = true,
  value,
}: RequestComposerProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRecordingRef = useRef(false);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "paused">("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const canAttach = Boolean(onFilesSelected);
  const canRecord = Boolean(onVoiceRecorded);
  const hasUnreadyAttachment = attachments.some((attachment) => attachment.status !== "ready");
  const submitDisabled = Boolean(
    pending ||
    recordingState !== "idle" ||
    hasUnreadyAttachment ||
    (!value.trim() && attachments.length === 0),
  );

  useEffect(() => {
    if (recordingState !== "recording") return;
    const timer = window.setInterval(() => setRecordingSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    const form = formRef.current;
    if (!form || !onHeightChange) return;
    const report = () => onHeightChange(Math.ceil(form.getBoundingClientRect().height));
    report();
    const observer = new ResizeObserver(report);
    observer.observe(form);
    return () => observer.disconnect();
  }, [onHeightChange]);

  useEffect(
    () => () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  function autoGrow() {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 192)}px`;
  }

  function acceptFiles(files: File[]) {
    if (!onFilesSelected || files.length === 0) return;
    const available = Math.max(0, maxAttachments - attachments.length);
    if (available === 0) {
      onAttachmentError?.(`يمكنك إرفاق ${maxAttachments} ملفات كحد أقصى.`);
      return;
    }
    if (files.length > available) {
      onAttachmentError?.(`تم اختيار أول ${available} ملفات فقط.`);
    }
    onFilesSelected(files.slice(0, available));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    acceptFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  async function startRecording() {
    if (
      !canRecord ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      onAttachmentError?.("التسجيل الصوتي غير مدعوم في هذا المتصفح.");
      return;
    }
    if (attachments.length >= maxAttachments) {
      onAttachmentError?.(`يمكنك إرفاق ${maxAttachments} ملفات كحد أقصى.`);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(
        stream,
        preferredType ? { mimeType: preferredType } : undefined,
      );
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRecordingRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecordingState("idle");
        setRecordingSeconds(0);
        if (cancelledRecordingRef.current) return;
        const mediaType = recorder.mimeType.split(";")[0] || "audio/webm";
        const extension = mediaType === "audio/mp4" ? "m4a" : "webm";
        const blob = new Blob(chunksRef.current, { type: mediaType });
        if (blob.size === 0) {
          onAttachmentError?.("لم يتم التقاط صوت. حاول التسجيل مرة أخرى.");
          return;
        }
        onVoiceRecorded?.(
          new File([blob], `تسجيل-صوتي-${Date.now()}.${extension}`, { type: mediaType }),
        );
      };
      recorder.start(500);
      setRecordingSeconds(0);
      setRecordingState("recording");
    } catch {
      onAttachmentError?.("تعذر الوصول إلى الميكروفون. تحقق من إذن المتصفح.");
    }
  }

  function stopRecording(cancel = false) {
    cancelledRecordingRef.current = cancel;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      setRecordingState("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      setRecordingState("recording");
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!submitDisabled) onSubmit();
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={cn(
        sticky
          ? "fixed inset-x-0 bottom-14 z-(--wk-z-nav) mb-[env(safe-area-inset-bottom)] border-t border-line bg-page/95 px-4 py-3 backdrop-blur-sm"
          : "w-full",
        className,
      )}
      onDragOver={(event: DragEvent<HTMLFormElement>) => {
        if (!canAttach) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event: DragEvent<HTMLFormElement>) => {
        if (!canAttach) return;
        event.preventDefault();
        acceptFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="mx-auto w-full max-w-160">
        <FormError id={errorId} message={error} className="mb-2" />
        <div
          className={cn(
            "flex flex-col gap-2 rounded-md border border-line-input bg-accent-subtle p-2",
            "transition-colors duration-150 focus-within:border-focus",
          )}
        >
          {attachments.length > 0 ? (
            <div
              className="flex max-w-full gap-2 overflow-x-auto px-1 pt-1"
              aria-label="المرفقات المختارة"
            >
              {attachments.map((attachment) => {
                const AttachmentIcon = attachmentIcon(attachment.mediaType);
                return (
                  <div
                    key={attachment.id}
                    className="relative flex min-w-48 max-w-56 items-center gap-2 rounded-md border border-line bg-card p-2"
                  >
                    {attachment.mediaType.startsWith("image/") && attachment.previewUrl ? (
                      <img
                        src={attachment.previewUrl}
                        alt=""
                        className="size-10 shrink-0 rounded-sm object-cover"
                      />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-raised text-fg-2">
                        <AttachmentIcon aria-hidden className="size-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-xs font-semibold text-fg"
                        title={attachment.name}
                      >
                        {attachment.name}
                      </span>
                      <span
                        className="flex items-center gap-1 text-[11px] text-fg-3"
                        role={attachment.status === "ready" ? undefined : "status"}
                        aria-live={attachment.status === "ready" ? undefined : "polite"}
                      >
                        {attachment.status === "uploading" ? (
                          <>
                            <LoaderCircle aria-hidden className="size-3 animate-spin" /> جاري الرفع
                          </>
                        ) : attachment.status === "error" ? (
                          <>
                            <AlertCircle aria-hidden className="size-3" /> فشل الرفع
                          </>
                        ) : (
                          formatBytes(attachment.sizeBytes)
                        )}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`إزالة ${attachment.name}`}
                      disabled={pending || attachment.status === "uploading"}
                      onClick={() => onAttachmentRemove?.(attachment.id)}
                      className="wk-focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-fg-2 hover:bg-raised hover:text-fg disabled:pointer-events-none disabled:text-fg-disabled"
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                    {attachment.mediaType.startsWith("audio/") && attachment.previewUrl ? (
                      <audio
                        controls
                        preload="metadata"
                        src={attachment.previewUrl}
                        className="absolute inset-x-2 top-full z-10 mt-1 h-8 w-[calc(100%-1rem)]"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {recordingState !== "idle" ? (
            <div className="mx-1 flex min-h-12 items-center gap-2 rounded-md border border-danger/40 bg-danger-subtle px-3 text-sm text-fg">
              <span className="sr-only" role="status" aria-live="polite">
                {recordingState === "paused" ? "التسجيل متوقف مؤقتًا" : "جارٍ التسجيل"}
              </span>
              <span
                className="size-2 rounded-full bg-danger motion-safe:animate-pulse"
                aria-hidden
              />
              <span className="font-semibold">
                {recordingState === "paused" ? "التسجيل متوقف مؤقتًا" : "جارٍ التسجيل"}
              </span>
              <span dir="ltr" className="wk-ltr tabular-nums text-fg-2">
                {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:
                {String(recordingSeconds % 60).padStart(2, "0")}
              </span>
              <span className="ms-auto flex gap-1">
                <button
                  type="button"
                  onClick={togglePause}
                  className="wk-focus-ring inline-flex size-11 items-center justify-center rounded-sm hover:bg-raised"
                  aria-label={
                    recordingState === "paused" ? "متابعة التسجيل" : "إيقاف التسجيل مؤقتًا"
                  }
                >
                  {recordingState === "paused" ? (
                    <Play aria-hidden className="size-4" />
                  ) : (
                    <Pause aria-hidden className="size-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => stopRecording(false)}
                  className="wk-focus-ring inline-flex size-11 items-center justify-center rounded-sm bg-accent text-fg-on-accent"
                  aria-label="إنهاء التسجيل وإرفاقه"
                >
                  <Square aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => stopRecording(true)}
                  className="wk-focus-ring inline-flex size-11 items-center justify-center rounded-sm text-danger hover:bg-raised"
                  aria-label="حذف التسجيل"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </span>
            </div>
          ) : null}

          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <textarea
            id={id}
            ref={textareaRef}
            rows={sticky ? 1 : 3}
            value={value}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              onValueChange(event.target.value);
              autoGrow();
            }}
            onPaste={(event) => {
              const images = Array.from(event.clipboardData.files).filter((file) =>
                file.type.startsWith("image/"),
              );
              if (images.length > 0) acceptFiles(images);
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                if (!submitDisabled) onSubmit();
              }
            }}
            className="wk-focus-ring max-h-48 min-h-11 w-full flex-1 resize-none bg-transparent px-2 py-2.5 text-base leading-7 text-fg placeholder:text-fg-3"
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <input
              ref={fileInputRef}
              type="file"
              aria-label="إضافة ملفات"
              className="sr-only"
              multiple
              accept={attachmentAccept}
              onChange={handleFileChange}
              tabIndex={-1}
            />
            <button
              type="button"
              disabled={!canAttach || attachments.length >= maxAttachments || pending}
              aria-label="إرفاق ملف"
              onClick={() => fileInputRef.current?.click()}
              className="wk-focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-md text-fg-2 hover:bg-raised hover:text-fg disabled:pointer-events-none disabled:text-fg-disabled"
            >
              <Paperclip aria-hidden className="size-5" />
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={
                  !canRecord ||
                  recordingState !== "idle" ||
                  attachments.length >= maxAttachments ||
                  pending
                }
                aria-label="تسجيل رسالة صوتية"
                onClick={startRecording}
                className="wk-focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-md text-fg-2 hover:bg-raised hover:text-fg disabled:pointer-events-none disabled:text-fg-disabled"
              >
                <Mic aria-hidden className="size-5" />
              </button>
              <button
                type="submit"
                aria-label="إرسال الطلب"
                disabled={submitDisabled}
                aria-busy={pending ? true : undefined}
                className={cn(
                  "wk-focus-ring inline-flex size-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-md bg-accent text-fg-on-accent",
                  "transition-colors duration-150 hover:bg-accent-hover active:scale-[0.98] active:bg-accent-pressed motion-reduce:active:scale-100",
                  "disabled:pointer-events-none disabled:bg-disabled disabled:text-fg-disabled",
                )}
              >
                <SendHorizontal
                  aria-hidden
                  className={cn("size-5 -scale-x-100", pending && "animate-pulse")}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
