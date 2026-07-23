import { arMessages } from "./messages.ar";

export type ArtifactPresentation = {
  kind:
    | "audio"
    | "document"
    | "file"
    | "image"
    | "presentation"
    | "spreadsheet"
    | "static_site"
    | "web_app";
  label: string;
  previewable: boolean;
  readyCopy: string;
};

const ARTIFACT_PRESENTATIONS: Record<
  ArtifactPresentation["kind"],
  Omit<ArtifactPresentation, "kind">
> = {
  audio: {
    label: "ملف صوتي",
    previewable: false,
    readyCopy: arMessages.artifact.readyByKind.audio,
  },
  document: {
    label: "مستند",
    previewable: false,
    readyCopy: arMessages.artifact.readyByKind.document,
  },
  file: {
    label: "ملف",
    previewable: false,
    readyCopy: arMessages.artifact.readyByKind.file,
  },
  image: {
    label: "صورة",
    previewable: false,
    readyCopy: arMessages.artifact.readyByKind.image,
  },
  presentation: {
    label: "عرض تقديمي",
    previewable: false,
    readyCopy: arMessages.artifact.readyByKind.presentation,
  },
  spreadsheet: {
    label: "جدول بيانات",
    previewable: false,
    readyCopy: arMessages.artifact.readyByKind.spreadsheet,
  },
  static_site: {
    label: "موقع ويب",
    previewable: true,
    readyCopy: arMessages.artifact.readyByKind.static_site,
  },
  web_app: {
    label: "تطبيق ويب",
    previewable: false,
    readyCopy: arMessages.artifact.readyByKind.web_app,
  },
};

export function artifactPresentation(kind: string): ArtifactPresentation {
  const knownKind: ArtifactPresentation["kind"] =
    kind in ARTIFACT_PRESENTATIONS ? (kind as ArtifactPresentation["kind"]) : "file";
  return { kind: knownKind, ...ARTIFACT_PRESENTATIONS[knownKind] };
}
