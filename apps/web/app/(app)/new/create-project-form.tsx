"use client";

import { ArtifactTypeScroller, RequestComposer, type ArtifactTypeOption } from "@wakil/ui";
import {
  FileSpreadsheet,
  FileText,
  Globe,
  Image as ImageIcon,
  MoreHorizontal,
  Palette,
  Presentation,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { newIdempotencyKey } from "../../../src/lib/idempotency-key";
import { createProjectAction } from "../../../src/server/actions/projects";

/** Only "موقع ويب" (and the open-ended "أخرى") drive a real Wakil pipeline today. */
const ARTIFACT_TYPES: ArtifactTypeOption[] = [
  { icon: Globe, id: "website", label: "موقع ويب" },
  { disabled: true, icon: Palette, id: "design", label: "تصميم" },
  { disabled: true, icon: Presentation, id: "slides", label: "عرض تقديمي" },
  { disabled: true, icon: FileText, id: "pdf", label: "PDF" },
  { disabled: true, icon: FileSpreadsheet, id: "excel", label: "Excel" },
  { disabled: true, icon: ImageIcon, id: "image", label: "صورة" },
  { disabled: true, icon: Search, id: "research", label: "بحث" },
  { icon: MoreHorizontal, id: "other", label: "أخرى" },
];

/**
 * The signature create flow: one composer, one idea. The server derives a
 * project title from the request text so the user never has to name it
 * before Wakil starts working. A failed submission keeps the text visibly
 * unsaved with a real retry; the idempotency key is reused across retries
 * of the same attempt so reconnects cannot create duplicates.
 *
 * The type pills are UX parity with the reference design, not a routed
 * pipeline: Wakil only ever produces a static website today, so non-website
 * types stay visibly disabled instead of pretending to generate a format
 * that does not exist yet.
 */
export function CreateProjectForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [request, setRequest] = useState("");
  const [artifactType, setArtifactType] = useState("website");
  const [attemptKey, setAttemptKey] = useState(newIdempotencyKey);
  const [error, setError] = useState<string | undefined>(undefined);

  function submit() {
    if (pending) return;
    startTransition(async () => {
      try {
        const result = await createProjectAction({
          idempotencyKey: attemptKey,
          request,
        });
        if (result.ok) {
          setError(undefined);
          setAttemptKey(newIdempotencyKey());
          router.push(`/projects/${result.data.projectId}?autostart=1`);
          return;
        }
        setError(result.fieldErrors?.["request"] ?? result.message);
      } catch {
        // Network failure: the request stays visibly unsaved with a retry.
        setError("تعذّر حفظ الطلب. تحقق من الاتصال ثم أعد المحاولة.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ArtifactTypeScroller
        options={ARTIFACT_TYPES}
        selectedId={artifactType}
        onSelect={setArtifactType}
      />
      <RequestComposer
        label="اوصف فكرتك"
        placeholder="صف فكرتك، وسيتولى وكيل تنفيذها…"
        value={request}
        onValueChange={(value) => {
          setRequest(value);
          if (error) setError(undefined);
        }}
        onSubmit={submit}
        pending={pending}
        error={error}
        sticky={false}
      />
    </div>
  );
}
