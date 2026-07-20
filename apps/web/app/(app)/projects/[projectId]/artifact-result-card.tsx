import { Button } from "@wakil/ui";
import { Check, Globe, MonitorPlay, RefreshCw } from "lucide-react";
import Link from "next/link";

import { ArtifactActions } from "./artifact-actions";
import { formatDateTimeLabel } from "../../../../src/lib/format-date";

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
    <div className="wk-rise-in flex flex-col gap-4 rounded-md border border-line bg-card p-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="wk-check-pop flex size-12 items-center justify-center rounded-full bg-success-subtle text-fg-success">
          <Check aria-hidden className="size-6" />
        </span>
        <p className="text-lg font-bold text-fg">{title}</p>
        <p className="text-sm leading-6 text-fg-2">موقعك جاهز للمعاينة والتنزيل.</p>
      </div>

      {/* A branded cover, not a screenshot — a real page thumbnail needs a
          separate capture step that Wakil does not produce yet. */}
      <Link
        href={previewHref}
        aria-label="معاينة النتيجة"
        className="wk-focus-ring group relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-md border border-line bg-page"
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-accent-subtle/50 blur-2xl" />
        <span className="relative flex flex-col items-center gap-2 text-fg-accent">
          <Globe aria-hidden className="size-9" />
          <span className="text-xs font-semibold text-fg-2">{kindLabel}</span>
        </span>
      </Link>

      <Button asChild>
        <Link href={previewHref}>
          <MonitorPlay aria-hidden className="size-5" />
          معاينة النتيجة
        </Link>
      </Button>

      <ArtifactActions artifactId={artifact.id} projectId={projectId} title={title} />

      <div className="flex items-center justify-between text-xs text-fg-3">
        <span>أُنشئ في {formatDateTimeLabel(new Date(artifact.createdAtIso))}</span>
        {onRebuild ? (
          <button
            type="button"
            onClick={onRebuild}
            disabled={rebuilding}
            className="wk-focus-ring inline-flex min-h-11 items-center gap-1.5 font-semibold text-fg-accent disabled:text-fg-disabled"
          >
            <RefreshCw
              aria-hidden
              className={`size-4 ${rebuilding ? "motion-safe:animate-spin" : ""}`}
            />
            إعادة الإنشاء
          </button>
        ) : null}
      </div>
    </div>
  );
}
