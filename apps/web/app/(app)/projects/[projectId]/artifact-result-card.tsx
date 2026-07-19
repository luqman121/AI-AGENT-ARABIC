import { Button } from "@wakil/ui";
import { Globe, MonitorPlay } from "lucide-react";
import Link from "next/link";

import { formatDateTimeLabel } from "../../../../src/lib/format-date";

export type ArtifactResultSummary = {
  createdAtIso: string;
  downloadSizeBytes: number;
};

const KIND_LABEL = "موقع ويب";

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
  const sizeLabel = `${(artifact.downloadSizeBytes / 1024).toFixed(1)} كيلوبايت`;
  return (
    <div className="wk-rise-in flex flex-col gap-3 rounded-md border border-line bg-surface-2 p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-info-subtle text-fg-info">
          <Globe aria-hidden className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-fg">{title}</p>
          <p className="text-xs text-fg-3" dir="ltr">
            {KIND_LABEL} · {sizeLabel}
          </p>
        </div>
      </div>
      <p className="text-xs text-fg-3">
        أُنشئ في {formatDateTimeLabel(new Date(artifact.createdAtIso))}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild>
          <Link href={`/projects/${projectId}/preview`}>
            <MonitorPlay aria-hidden className="size-5" />
            معاينة الموقع
          </Link>
        </Button>
      </div>
    </div>
  );
}
