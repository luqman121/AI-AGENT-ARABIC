import { Button } from "@wakil/ui";
import { Check, Globe, MonitorPlay, RefreshCw } from "lucide-react";
import Link from "next/link";

import { ArtifactActions } from "./artifact-actions";

export type ArtifactResultSummary = {
  createdAtIso: string;
  downloadSizeBytes: number;
  id: string;
  kind: string;
};

const KIND_LABELS: Record<string, string> = {
  document: "مستند",
  image: "صورة",
  presentation: "عرض تقديمي",
  spreadsheet: "جدول بيانات",
  static_site: "موقع ويب",
};

export type ArtifactResultCardProps = {
  artifact: ArtifactResultSummary;
  projectId: string;
  title: string;
  /** The newest result gets the full completion treatment; older ones stay compact. */
  primary?: boolean;
  /** When present, offers a subtle rebuild action (newest result only). */
  onRebuild?: (() => void) | undefined;
  rebuilding?: boolean;
};

/**
 * The delivered artifact, shown inline once the build succeeds. The newest
 * result reads as a calm completion moment — a success mark, a branded cover,
 * and one clear "preview" action — while earlier versions stay compact.
 */
export function ArtifactResultCard({
  artifact,
  onRebuild,
  primary = false,
  projectId,
  rebuilding = false,
  title,
}: ArtifactResultCardProps) {
  const sizeLabel = (artifact.downloadSizeBytes / 1024).toFixed(1);
  const kindLabel = KIND_LABELS[artifact.kind] ?? "ملف";
  const previewHref = `/projects/${projectId}/preview?artifact=${artifact.id}`;

  if (!primary) {
    return (
      <Link
        href={previewHref}
        className="wk-focus-ring flex items-center gap-3 rounded-md border border-line bg-card p-3 transition-colors duration-150 hover:bg-overlay"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-info-subtle text-fg-info">
          <Globe aria-hidden className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-fg">{title}</span>
          <span className="block text-xs text-fg-3">
            {kindLabel} · <bdi dir="ltr">{sizeLabel}</bdi> كيلوبايت
          </span>
        </span>
        <MonitorPlay aria-hidden className="size-5 shrink-0 text-fg-3" />
      </Link>
    );
  }

  return (
    <div className="wk-rise-in flex flex-col gap-5 rounded-lg border border-line bg-card p-5 shadow-soft">
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="wk-check-pop mb-1 flex size-12 items-center justify-center rounded-full bg-success-subtle text-fg-success">
          <Check aria-hidden className="size-6" />
        </span>
        <p className="text-lg font-bold leading-7 text-fg">{title}</p>
        <p className="text-sm leading-6 text-fg-2">موقعك جاهز للمعاينة والتنزيل.</p>
      </div>

      {/* A stylized website placeholder, not a real screenshot — a true page
          thumbnail needs a separate capture step Wakil does not produce yet. */}
      <Link
        href={previewHref}
        aria-label="معاينة النتيجة"
        className="wk-focus-ring relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-lg border border-line bg-page transition-transform duration-200 ease-out active:scale-[0.99] motion-reduce:active:scale-100"
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-2/3 bg-accent-subtle/40 blur-2xl" />
        <span
          aria-hidden
          className="relative w-[72%] overflow-hidden rounded-md border border-line-strong bg-raised"
        >
          <span className="flex gap-1 border-b border-line px-2.5 py-2">
            <span className="size-1.5 rounded-full bg-line-strong" />
            <span className="size-1.5 rounded-full bg-line-strong" />
            <span className="size-1.5 rounded-full bg-line-strong" />
          </span>
          <span className="flex flex-col gap-2 p-3">
            <span className="block h-1.5 w-2/3 rounded-full bg-accent-subtle" />
            <span className="block h-1.5 w-full rounded-full bg-overlay" />
            <span className="block h-1.5 w-4/5 rounded-full bg-overlay" />
          </span>
        </span>
      </Link>

      <div className="flex flex-col gap-3">
        <Button asChild className="min-h-[52px] text-base">
          <Link href={previewHref}>
            <MonitorPlay aria-hidden className="size-5" />
            معاينة النتيجة
          </Link>
        </Button>

        <ArtifactActions artifactId={artifact.id} projectId={projectId} title={title} />

        {onRebuild ? (
          <button
            type="button"
            onClick={onRebuild}
            disabled={rebuilding}
            className="wk-focus-ring mx-auto inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-fg-3 transition-colors duration-150 hover:text-fg-2 disabled:text-fg-disabled"
          >
            <RefreshCw
              aria-hidden
              className={`size-3.5 ${rebuilding ? "motion-safe:animate-spin" : ""}`}
            />
            إعادة الإنشاء
          </button>
        ) : null}
      </div>
    </div>
  );
}
