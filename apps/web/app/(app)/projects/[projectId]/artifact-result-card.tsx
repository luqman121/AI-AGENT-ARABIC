import { Button } from "@wakil/ui";
import { Globe, MonitorPlay } from "lucide-react";
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

/**
 * The delivered artifact, shown inline in the conversation once the
 * execution run succeeds — mirrors the reference's result card, scoped to
 * the one real artifact type Wakil produces today.
 */
export function ArtifactResultCard({
  artifact,
  projectId,
  title,
}: {
  artifact: ArtifactResultSummary;
  projectId: string;
  title: string;
}) {
  const sizeLabel = (artifact.downloadSizeBytes / 1024).toFixed(1);
  return (
    <div className="wk-rise-in flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-info-subtle text-fg-info">
          <Globe aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-fg">{title}</p>
          <p className="text-xs text-fg-3">
            {KIND_LABELS[artifact.kind] ?? "ملف"} · <bdi dir="ltr">{sizeLabel}</bdi> كيلوبايت
          </p>
        </div>
      </div>
      <p className="text-xs text-fg-3">
        أُنشئ في {formatDateTimeLabel(new Date(artifact.createdAtIso))}
      </p>
      <Button asChild>
        <Link href={`/projects/${projectId}/preview?artifact=${artifact.id}`}>
          <MonitorPlay aria-hidden className="size-5" />
          معاينة النتيجة
        </Link>
      </Button>
      <ArtifactActions artifactId={artifact.id} projectId={projectId} title={title} />
    </div>
  );
}
