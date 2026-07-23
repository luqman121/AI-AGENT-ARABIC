"use client";

import { Button } from "@wakil/ui";
import {
  Check,
  Copy,
  ExternalLink,
  Maximize2,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { arMessages } from "../../../../../src/product/messages.ar";

type PreviewViewport = "desktop" | "mobile" | "tablet";

const VIEWPORTS = [
  { icon: Monitor, id: "desktop", label: "سطح المكتب" },
  { icon: Tablet, id: "tablet", label: "جهاز لوحي" },
  { icon: Smartphone, id: "mobile", label: "هاتف" },
] as const;

export function PreviewExperience({
  artifactId,
  initialViewport,
  previewUrl,
  projectId,
  projectTitle,
}: {
  artifactId: string;
  initialViewport: PreviewViewport;
  previewUrl: string;
  projectId: string;
  projectTitle: string;
}) {
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<PreviewViewport>(initialViewport);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copyState, setCopyState] = useState<"copied" | "error" | "idle">("idle");
  const [fullScreenError, setFullScreenError] = useState(false);
  const stablePreviewPath = `/projects/${projectId}/preview?artifact=${artifactId}`;

  function selectViewport(next: PreviewViewport) {
    setViewport(next);
    router.replace(`${stablePreviewPath}&viewport=${next}`, { scroll: false });
  }

  async function copyPreviewLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${stablePreviewPath}`);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  async function enterFullScreen() {
    setFullScreenError(false);
    try {
      if (!shellRef.current?.requestFullscreen) throw new Error("fullscreen unavailable");
      await shellRef.current.requestFullscreen();
    } catch {
      setFullScreenError(true);
    }
  }

  return (
    <>
      <div className="mb-3 rounded-lg border border-line bg-card p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="حجم المعاينة">
            {VIEWPORTS.map((item) => {
              const Icon = item.icon;
              const active = viewport === item.id;
              return (
                <Button
                  key={item.id}
                  type="button"
                  size="compact"
                  variant={active ? "primary" : "secondary"}
                  aria-pressed={active}
                  onClick={() => selectViewport(item.id)}
                >
                  <Icon aria-hidden className="size-4" />
                  {item.label}
                </Button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="compact"
              variant="ghost"
              title={arMessages.preview.refresh}
              aria-label={arMessages.preview.refresh}
              onClick={() => setRefreshKey((key) => key + 1)}
            >
              <RefreshCw aria-hidden className="size-4" />
            </Button>
            <Button
              type="button"
              size="compact"
              variant="ghost"
              title={arMessages.preview.copyLink}
              aria-label={arMessages.preview.copyLink}
              onClick={copyPreviewLink}
            >
              {copyState === "copied" ? (
                <Check aria-hidden className="size-4" />
              ) : (
                <Copy aria-hidden className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              size="compact"
              variant="ghost"
              title={arMessages.preview.fullScreen}
              aria-label={arMessages.preview.fullScreen}
              onClick={enterFullScreen}
            >
              <Maximize2 aria-hidden className="size-4" />
            </Button>
            <Button asChild size="compact" variant="ghost">
              <a
                href={previewUrl}
                rel="nofollow noreferrer"
                target="_blank"
                aria-label={arMessages.preview.openExternal}
                title={arMessages.preview.openExternal}
              >
                <ExternalLink aria-hidden className="size-4" />
              </a>
            </Button>
          </div>
        </div>

        <div
          dir="ltr"
          className="mt-2 truncate rounded-md bg-overlay px-3 py-2 font-mono text-[11px] text-fg-3"
          title={stablePreviewPath}
        >
          {stablePreviewPath}
        </div>
        <p aria-live="polite" role="status" className="min-h-5 pt-1 text-xs text-fg-3">
          {copyState === "copied"
            ? arMessages.preview.copiedLink
            : copyState === "error"
              ? "تعذر نسخ الرابط. انسخه من شريط المتصفح."
              : fullScreenError
                ? "ملء الشاشة غير متاح في هذا المتصفح."
                : ""}
        </p>
      </div>

      <div
        ref={shellRef}
        className="overflow-x-auto rounded-lg border border-line bg-page p-2 shadow-sm fullscreen:bg-page fullscreen:p-3"
      >
        <div
          className={
            viewport === "mobile"
              ? "mx-auto w-[390px] shrink-0 overflow-hidden rounded-md border border-line bg-white"
              : viewport === "tablet"
                ? "mx-auto w-[768px] shrink-0 overflow-hidden rounded-md border border-line bg-white"
                : "overflow-hidden rounded-md border border-line bg-white"
          }
        >
          <iframe
            key={refreshKey}
            className="block h-[62dvh] min-h-[440px] w-full fullscreen:h-[calc(100dvh-1.5rem)]"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts"
            src={previewUrl}
            title={`معاينة موقع ${projectTitle}`}
          />
        </div>
      </div>
    </>
  );
}
