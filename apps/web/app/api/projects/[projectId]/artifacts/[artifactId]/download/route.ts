import { projectIdSchema } from "@wakil/shared";
import { NextResponse } from "next/server";

import { requireAuthorizedContext } from "../../../../../../../src/server/auth/session";
import { getDatabase } from "../../../../../../../src/server/db";
import { getArtifactById } from "../../../../../../../src/server/features/artifacts/queries";
import { getArtifactStore } from "../../../../../../../src/server/features/artifacts/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ artifactId: string; projectId: string }> },
) {
  const values = await params;
  const projectId = projectIdSchema.safeParse(values.projectId);
  const artifactId = projectIdSchema.safeParse(values.artifactId);
  if (!projectId.success || !artifactId.success) {
    return NextResponse.json({ error: "المعرّف غير صالح." }, { status: 400 });
  }

  const ctx = await requireAuthorizedContext();
  const artifact = await getArtifactById(getDatabase(), ctx, projectId.data, artifactId.data);
  if (!artifact) {
    return NextResponse.json({ error: "النتيجة غير موجودة." }, { status: 404 });
  }

  const signedUrl = await getArtifactStore().signDownload(artifact.downloadObjectKey, 60, {
    fileName: artifact.fileName,
    mediaType: artifact.downloadMediaType,
  });
  return NextResponse.redirect(signedUrl, 307);
}
