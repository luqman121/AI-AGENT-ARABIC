"use client";

import { Button } from "@wakil/ui";
import { Check, Download, Share2 } from "lucide-react";
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

  async function share() {
    const url = `${window.location.origin}/projects/${projectId}/preview?artifact=${artifactId}`;
    try {
      if (navigator.share) {
        await navigator.share({ text: "نتيجة أنشأها وكيل", title, url });
        setShareState("idle");
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareState("copied");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
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
        <Button type="button" variant="secondary" onClick={share}>
          {shareState === "copied" ? (
            <Check aria-hidden className="size-5" />
          ) : (
            <Share2 aria-hidden className="size-5" />
          )}
          {shareState === "copied" ? "تم نسخ الرابط" : "مشاركة"}
        </Button>
      </div>
      <p aria-live="polite" className="min-h-5 text-xs text-fg-3" role="status">
        {shareState === "error" ? "تعذرت المشاركة. انسخ رابط المشروع من شريط المتصفح." : ""}
      </p>
    </>
  );
}
