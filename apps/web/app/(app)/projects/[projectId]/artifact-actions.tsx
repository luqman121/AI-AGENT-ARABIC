"use client";

import { Button } from "@wakil/ui";
import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";

export function ArtifactActions({
  artifactId,
  projectId,
  title,
}: {
  artifactId: string;
  projectId: string;
  title: string;
}) {
  const [shareState, setShareState] = useState<"copied" | "error" | "idle">("idle");

  async function copyPrivateLink() {
    const url = `${window.location.origin}/projects/${projectId}/preview?artifact=${artifactId}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch {
      setShareState("error");
    }
  }

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="secondary">
          <a href={`/api/projects/${projectId}/artifacts/${artifactId}/download`}>
            <Download aria-hidden className="size-5" />
            تنزيل النتيجة
          </a>
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={copyPrivateLink}
          aria-label={`نسخ رابط خاص إلى ${title}`}
        >
          {shareState === "copied" ? (
            <Check aria-hidden className="size-5" />
          ) : (
            <Copy aria-hidden className="size-5" />
          )}
          {shareState === "copied" ? "تم نسخ الرابط الخاص" : "نسخ رابط خاص"}
        </Button>
      </div>
      <p className="mt-2 text-xs leading-5 text-fg-3">
        الرابط خاص بحسابك ويتطلب تسجيل الدخول إلى مساحة العمل.
      </p>
      <p aria-live="polite" className="min-h-5 text-xs text-fg-3" role="status">
        {shareState === "error" ? "تعذر نسخ الرابط. انسخه من شريط المتصفح." : ""}
      </p>
    </>
  );
}
