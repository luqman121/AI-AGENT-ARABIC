"use client";

import {
  ArtifactTypeScroller,
  RequestComposer,
  type ArtifactTypeOption,
  type ComposerAttachment,
} from "@wakil/ui";
import {
  FileSpreadsheet,
  FileText,
  GalleryVerticalEnd,
  Globe,
  Image as ImageIcon,
  MoreHorizontal,
  Smartphone,
  Volume2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { newIdempotencyKey } from "../../../src/lib/idempotency-key";
import {
  OUTPUT_CAPABILITIES,
  outputCapabilityById,
} from "../../../src/product/output-capabilities";
import { arMessages } from "../../../src/product/messages.ar";
import { createProjectAction } from "../../../src/server/actions/projects";

type DraftAttachment = ComposerAttachment & {
  file: File;
  serverId?: string | undefined;
};

const CAPABILITY_ICONS = {
  app: Smartphone,
  audio: Volume2,
  document: FileText,
  excel: FileSpreadsheet,
  image: ImageIcon,
  other: MoreHorizontal,
  pdf: FileText,
  presentation: GalleryVerticalEnd,
  website: Globe,
} as const;

const CREATION_TYPES: ArtifactTypeOption[] = OUTPUT_CAPABILITIES.map((capability) => ({
  disabled: !capability.enabled,
  disabledReason: capability.disabledReason,
  icon: CAPABILITY_ICONS[capability.id],
  id: capability.id,
  label: capability.label,
}));

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT =
  /^(image\/(jpeg|png|webp)|audio\/(webm|mpeg|wav|mp4)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|vnd\.ms-excel))$/;

export function CreateProjectForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [request, setRequest] = useState("");
  const [artifactType, setArtifactType] = useState("website");
  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);
  const [error, setError] = useState<string | undefined>(undefined);
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const attachmentUrlsRef = useRef(new Set<string>());
  const selected = outputCapabilityById(artifactType);

  useEffect(() => {
    const saved = window.sessionStorage.getItem("wakil:new-project-draft");
    const timer = window.setTimeout(() => {
      if (saved) setRequest(saved);
      setDraftLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    if (request) window.sessionStorage.setItem("wakil:new-project-draft", request);
    else window.sessionStorage.removeItem("wakil:new-project-draft");
  }, [draftLoaded, request]);

  useEffect(
    () => () => {
      for (const url of attachmentUrlsRef.current) URL.revokeObjectURL(url);
      attachmentUrlsRef.current.clear();
    },
    [],
  );

  function addFiles(files: File[]) {
    const accepted: DraftAttachment[] = [];
    const available = Math.max(0, 6 - attachments.length);
    if (available === 0) {
      setError("يمكنك إرفاق 6 ملفات كحد أقصى.");
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
      if (
        attachments.some(
          (attachment) =>
            attachment.file.name === file.name &&
            attachment.file.size === file.size &&
            attachment.file.lastModified === file.lastModified,
        )
      ) {
        continue;
      }
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
    if (accepted.length > 0) setAttachments((current) => [...current, ...accepted]);
    setError(selectionError);
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

  async function uploadAttachment(projectId: string, attachment: DraftAttachment) {
    if (attachment.serverId) return attachment.serverId;
    const form = new FormData();
    form.set("file", attachment.file);
    form.set("linkToInitial", "1");
    const response = await fetch(`/api/projects/${projectId}/attachments`, {
      body: form,
      method: "POST",
    });
    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      message?: string;
    } | null;
    if (!response.ok || !payload?.id) throw new Error(payload?.message ?? "فشل رفع الملف");
    return payload.id;
  }

  function submit() {
    if (pending) return;
    startTransition(async () => {
      try {
        const result = await createProjectAction({
          idempotencyKey: attemptKey,
          outputKind: selected.outputKind,
          request,
        });
        if (!result.ok) {
          setError(result.fieldErrors?.["request"] ?? result.message);
          return;
        }

        setAttachments((current) =>
          current.map((attachment) => ({ ...attachment, error: undefined, status: "uploading" })),
        );
        const uploaded: { localId: string; serverId: string }[] = [];
        for (const attachment of attachments) {
          const serverId = await uploadAttachment(result.data.projectId, attachment);
          uploaded.push({ localId: attachment.id, serverId });
          setAttachments((current) =>
            current.map((item) =>
              item.id === attachment.id ? { ...item, serverId, status: "ready" } : item,
            ),
          );
        }
        for (const attachment of attachments) {
          if (attachment.previewUrl) {
            URL.revokeObjectURL(attachment.previewUrl);
            attachmentUrlsRef.current.delete(attachment.previewUrl);
          }
        }
        setError(undefined);
        window.sessionStorage.removeItem("wakil:new-project-draft");
        setAttemptKey(newIdempotencyKey());
        router.push(`/projects/${result.data.projectId}?autostart=1`);
      } catch {
        const message = "تعذّر حفظ الطلب. تحقق من الاتصال ثم أعد المحاولة.";
        setAttachments((current) =>
          current.map((attachment) =>
            attachment.status === "uploading"
              ? { ...attachment, error: message, status: "error" }
              : attachment,
          ),
        );
        setError(message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ArtifactTypeScroller
        options={CREATION_TYPES}
        selectedId={artifactType}
        onSelect={(id) => {
          setArtifactType(id);
          setError(undefined);
        }}
      />
      <RequestComposer
        attachmentAccept={selected.accept}
        attachments={attachments}
        label={arMessages.home.composerLabel}
        placeholder={selected.placeholder}
        value={request}
        onValueChange={(value) => {
          setRequest(value);
          if (error) setError(undefined);
        }}
        onSubmit={submit}
        onFilesSelected={addFiles}
        onVoiceRecorded={(file) => addFiles([file])}
        onAttachmentRemove={removeAttachment}
        onAttachmentError={setError}
        pending={pending}
        error={error}
        sticky={false}
      />
    </div>
  );
}
