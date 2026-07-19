import { createHash, randomUUID } from "node:crypto";

import {
  conversationMessages,
  conversations,
  messageAttachments,
  projects,
} from "@wakil/db/schema";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireAuthorizedContext } from "../../../../../src/server/auth/session";
import { getDatabase } from "../../../../../src/server/db";
import { getArtifactStore } from "../../../../../src/server/features/artifacts/store";
import { validateAttachment } from "../../../../../src/server/features/attachments/validation";
import { enforceRateLimit } from "../../../../../src/server/features/rate-limit/service";
import { getRedis } from "../../../../../src/server/redis";

export const runtime = "nodejs";
const MAX_MULTIPART_BYTES = 11 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BYTES) {
    return NextResponse.json({ message: "حجم طلب الرفع أكبر من الحد المسموح" }, { status: 413 });
  }
  const ctx = await requireAuthorizedContext();
  const rateLimit = await enforceRateLimit(getRedis(), ctx.userId, "attachment.upload");
  if (rateLimit) {
    return NextResponse.json({ message: rateLimit.message }, { status: 429 });
  }
  const { projectId } = await params;
  const db = getDatabase();
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
    .limit(1);
  if (!project) return NextResponse.json({ message: "المشروع غير موجود" }, { status: 404 });

  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.projectId, projectId), eq(conversations.workspaceId, ctx.workspaceId)),
    )
    .limit(1);
  if (!conversation) {
    return NextResponse.json({ message: "المحادثة غير موجودة" }, { status: 404 });
  }

  const form = await request.formData();
  const linkToInitial = form.get("linkToInitial") === "1";
  const initialMessage = linkToInitial
    ? (
        await db
          .select({ id: conversationMessages.id })
          .from(conversationMessages)
          .where(
            and(
              eq(conversationMessages.conversationId, conversation.id),
              eq(conversationMessages.workspaceId, ctx.workspaceId),
              eq(conversationMessages.role, "user"),
            ),
          )
          .orderBy(asc(conversationMessages.createdAt))
          .limit(1)
      )[0]
    : undefined;
  if (linkToInitial && !initialMessage) {
    return NextResponse.json({ message: "الطلب الأول غير موجود" }, { status: 409 });
  }
  const value = form.get("file");
  if (!(value instanceof File)) {
    return NextResponse.json({ message: "اختر ملفًا صالحًا" }, { status: 400 });
  }
  const validated = await validateAttachment(value);
  if (!validated.ok) return NextResponse.json({ message: validated.message }, { status: 415 });

  const id = randomUUID();
  const { bytes, safeName } = validated;
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const objectKey = `workspaces/${ctx.workspaceId}/projects/${projectId}/inputs/${id}/${safeName}`;
  const kind = value.type.startsWith("audio/") ? "voice" : "file";

  const artifactStore = getArtifactStore();
  let objectUploaded = false;
  let stored: boolean;
  try {
    stored = await db.transaction(async (tx) => {
      // Serialize uploads for this conversation so concurrent requests cannot
      // bypass the six-attachment server-side limit.
      await tx.execute(
        sql`select ${conversations.id} from ${conversations} where ${conversations.id} = ${conversation.id} for update`,
      );
      const attachmentTarget = initialMessage
        ? eq(messageAttachments.messageId, initialMessage.id)
        : isNull(messageAttachments.messageId);
      const [existing] = await tx
        .select({ value: count() })
        .from(messageAttachments)
        .where(
          and(
            eq(messageAttachments.conversationId, conversation.id),
            eq(messageAttachments.workspaceId, ctx.workspaceId),
            attachmentTarget,
          ),
        );
      if ((existing?.value ?? 0) >= 6) return false;

      await artifactStore.uploadPrivateObject({
        bytes,
        checksumSha256,
        fileName: safeName,
        key: objectKey,
        mediaType: value.type,
      });
      objectUploaded = true;
      await tx.insert(messageAttachments).values({
        checksumSha256,
        conversationId: conversation.id,
        id,
        kind,
        mediaType: value.type,
        messageId: initialMessage?.id,
        objectKey,
        originalName: safeName,
        projectId,
        readyAt: new Date(),
        sizeBytes: value.size,
        status: "ready",
        workspaceId: ctx.workspaceId,
      });
      return true;
    });
  } catch (error) {
    if (objectUploaded) await artifactStore.deletePrivateObject(objectKey).catch(() => undefined);
    throw error;
  }
  if (!stored) {
    return NextResponse.json({ message: "الحد الأقصى 6 مرفقات لكل طلب" }, { status: 409 });
  }

  return NextResponse.json({ id, kind, mediaType: value.type, name: value.name, size: value.size });
}
