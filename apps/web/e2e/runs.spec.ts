import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { artifactObjectKeys, buildStaticSiteBundle, S3ArtifactStore } from "@wakil/artifacts";
import { createDatabaseClient } from "@wakil/db/client";
import { artifacts, conversationMessages, runs } from "@wakil/db/schema";
import { RUNS_QUEUE_NAME } from "@wakil/shared";
import { Queue } from "bullmq";
import { and, desc, eq, sql } from "drizzle-orm";
import { config as loadDotEnv } from "dotenv";
import { Redis } from "ioredis";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { assertMobileQuality, captureState, signIn, uniqueEmail, watchConsole } from "./helpers";

test.describe.configure({ mode: "serial" });

const localEnv: Record<string, string> = {};
loadDotEnv({
  path: fileURLToPath(new URL("../../../.env.local", import.meta.url)),
  processEnv: localEnv,
  quiet: true,
});

function requireLocalEnv(
  name:
    | "DATABASE_URL"
    | "REDIS_URL"
    | "S3_ACCESS_KEY_ID"
    | "S3_BUCKET"
    | "S3_REGION"
    | "S3_SECRET_ACCESS_KEY",
): string {
  const value = localEnv[name];
  if (!value) throw new Error(`E2E run tests require ${name}`);
  return value;
}

const databaseUrl = requireLocalEnv("DATABASE_URL");
const redisUrl = requireLocalEnv("REDIS_URL");

const queueRedis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const runQueue = new Queue(RUNS_QUEUE_NAME, { connection: queueRedis });

test.afterEach(async () => {
  await runQueue.resume();
});

test.afterAll(async () => {
  await runQueue.resume();
  await runQueue.close();
  queueRedis.disconnect();
});

async function createProject(
  page: Page,
  title: string,
  request = "أنشئ صفحة تعريفية واضحة مع معلومات التواصل",
): Promise<void> {
  await signIn(page, uniqueEmail("run"));
  await page.getByLabel("اسم المشروع").fill(title);
  await page.getByLabel("اوصف طلبك").fill(request);
  await page.getByRole("button", { name: "إنشاء المشروع" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
}

function runPanel(page: Page) {
  return page.getByRole("region", { name: "إعداد خطة المشروع" });
}

async function expectSuccessfulRun(page: Page): Promise<void> {
  const panel = runPanel(page);
  await panel.getByRole("button", { name: "إعداد الخطة" }).click();
  await expect(panel.getByText("اكتمل", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(
    panel.getByRole("list", { name: "سجل خطوات التشغيل" }).getByRole("listitem"),
  ).toHaveText([
    "في قائمة الانتظار",
    "بدأ التشغيل",
    "بدأ إعداد الخطة",
    "اكتملت الخطة",
    "اكتمل التشغيل",
  ]);
  await expect(page.getByRole("article", { name: "رد وكيل" })).toContainText("خطة موجزة للمشروع");
  await expect(panel.getByRole("button", { name: "بدء تنفيذ الموقع" })).toBeVisible();
}

async function seedPrivateArtifact(projectId: string): Promise<void> {
  const handle = createDatabaseClient(databaseUrl);
  try {
    const plan = (
      await handle.db
        .select({
          conversationId: runs.conversationId,
          createdByUserId: runs.createdByUserId,
          id: runs.id,
          projectId: runs.projectId,
          workspaceId: runs.workspaceId,
        })
        .from(runs)
        .where(and(eq(runs.projectId, projectId), eq(runs.kind, "planning")))
        .orderBy(desc(runs.createdAt))
        .limit(1)
    )[0];
    if (!plan) throw new Error("Planning run fixture missing");
    const executionRunId = randomUUID();
    const artifactId = randomUUID();
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>مقهى مسقط</title><style>body{font-family:sans-serif;background:#15131d;color:#fff;padding:32px}h1{color:#8b6cff}</style></head><body><h1>مقهى مسقط</h1><p>قهوة عُمانية أصيلة في قلب المدينة.</p></body></html>`;
    const bundle = buildStaticSiteBundle(html);
    const keys = artifactObjectKeys({
      artifactId,
      projectId: plan.projectId,
      runId: executionRunId,
      workspaceId: plan.workspaceId,
    });
    const store = new S3ArtifactStore({
      accessKeyId: requireLocalEnv("S3_ACCESS_KEY_ID"),
      bucket: requireLocalEnv("S3_BUCKET"),
      ...(localEnv["S3_ENDPOINT"] ? { endpoint: localEnv["S3_ENDPOINT"] } : {}),
      forcePathStyle: localEnv["S3_FORCE_PATH_STYLE"] === "true",
      region: requireLocalEnv("S3_REGION"),
      secretAccessKey: requireLocalEnv("S3_SECRET_ACCESS_KEY"),
    });
    await store.uploadBundle(keys, bundle);

    await handle.db.transaction(async (tx) => {
      const run = (
        await tx
          .insert(runs)
          .values({
            completionTokens: 80,
            conversationId: plan.conversationId,
            createdByUserId: plan.createdByUserId,
            finishedAt: new Date(),
            kind: "execution",
            modelConfigKey: "e2e-local",
            parentRunId: plan.id,
            projectId: plan.projectId,
            promptTokens: 40,
            promptVersion: "static-site.ar.v1",
            providerAttempts: 1,
            providerCostMicros: 20,
            sandboxDurationMs: 125,
            sandboxId: "e2e-isolated-fixture",
            sandboxProvider: "daytona",
            status: "succeeded",
            workspaceId: plan.workspaceId,
          })
          .returning({ id: runs.id })
      )[0]!;
      const message = (
        await tx
          .insert(conversationMessages)
          .values({
            content: "اكتمل إنشاء الموقع وأصبح جاهزاً للمعاينة والتنزيل.",
            conversationId: plan.conversationId,
            role: "assistant",
            workspaceId: plan.workspaceId,
          })
          .returning({ id: conversationMessages.id })
      )[0]!;
      await tx.update(runs).set({ assistantMessageId: message.id }).where(eq(runs.id, run.id));
      await tx.insert(artifacts).values({
        downloadChecksumSha256: bundle.zip.checksumSha256,
        downloadMediaType: bundle.zip.mediaType,
        downloadObjectKey: keys.zipKey,
        downloadSizeBytes: bundle.zip.sizeBytes,
        id: artifactId,
        kind: "static_site",
        previewChecksumSha256: bundle.preview.checksumSha256,
        previewMediaType: bundle.preview.mediaType,
        previewObjectKey: keys.previewKey,
        previewSizeBytes: bundle.preview.sizeBytes,
        projectId: plan.projectId,
        runId: run.id,
        workspaceId: plan.workspaceId,
      });
    });
  } finally {
    await handle.close();
  }
}

async function holdWorkerAtValidation(): Promise<() => Promise<void>> {
  const handle = createDatabaseClient(databaseUrl);
  let releaseLock: (() => void) | undefined;
  let markReady: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  const transaction = handle.db.transaction(async (tx) => {
    await tx.execute(sql`lock table conversation_messages in access exclusive mode`);
    markReady?.();
    await released;
  });
  await ready;

  return async () => {
    releaseLock?.();
    await transaction;
    await handle.close();
  };
}

test("completes a real run with ordered persisted events", async ({ page }) => {
  const consoleWatcher = watchConsole(page);
  await createProject(page, "موقع التشغيل المكتمل");

  await expectSuccessfulRun(page);
  await assertMobileQuality(page);
  consoleWatcher.assertClean();
});

test("private artifact preview and download @visual", async ({ page }, testInfo: TestInfo) => {
  const consoleWatcher = watchConsole(page);
  await createProject(page, "معاينة الموقع المحفوظ");
  await expectSuccessfulRun(page);
  const projectId = page.url().match(/projects\/([0-9a-f-]{36})/)?.[1];
  if (!projectId) throw new Error("Project ID missing from URL");
  await seedPrivateArtifact(projectId);

  await page.goto(`/projects/${projectId}/preview`);
  await expect(page.getByText("اجتاز الموقع التحقق المعزول.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "تنزيل ملف ZIP" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "allow-scripts");
  await expect(
    page.locator("iframe").contentFrame().getByRole("heading", { name: "مقهى مسقط" }),
  ).toBeVisible();
  await captureState(page, testInfo, "preview-artifact");
  consoleWatcher.assertClean();
});

test("queued, running, and succeeded run states @visual", async ({ page }, testInfo: TestInfo) => {
  const consoleWatcher = watchConsole(page);
  await createProject(page, "حالات تشغيل الموقع");
  const panel = runPanel(page);

  await runQueue.pause();
  await panel.getByRole("button", { name: "إعداد الخطة" }).click();
  await expect(panel.getByText("في قائمة الانتظار", { exact: true }).first()).toBeVisible();
  await captureState(page, testInfo, "run-queued");

  const releaseValidationLock = await holdWorkerAtValidation();
  try {
    await runQueue.resume();
    await expect(panel.getByText("قيد التشغيل", { exact: true })).toBeVisible({ timeout: 15_000 });
    await captureState(page, testInfo, "run-running");
  } finally {
    await releaseValidationLock();
  }

  await expect(panel.getByText("خطة موجزة للمشروع", { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  await captureState(page, testInfo, "run-streaming");

  await expect(panel.getByText("اكتمل", { exact: true })).toBeVisible({ timeout: 20_000 });
  await captureState(page, testInfo, "run-succeeded");
  consoleWatcher.assertClean();
});

test("reconnecting and cancelled run states @visual", async ({ page }, testInfo: TestInfo) => {
  await createProject(page, "إلغاء تشغيل التقرير");
  const panel = runPanel(page);

  await runQueue.pause();
  await page.route("**/api/projects/*/runs/*/events", (route) => route.abort("failed"));
  await panel.getByRole("button", { name: "إعداد الخطة" }).click();
  await expect(panel.getByText("جارٍ إعادة الاتصال لمتابعة التحديثات المحفوظة…")).toBeVisible({
    timeout: 15_000,
  });
  await captureState(page, testInfo, "run-reconnecting");

  await page.unroute("**/api/projects/*/runs/*/events");
  await expect(panel.getByText("في قائمة الانتظار", { exact: true }).first()).toBeVisible();
  await panel.getByRole("button", { name: "إلغاء التشغيل" }).click();
  await expect(
    panel.getByText("تم إرسال طلب الإلغاء. سيتوقف العامل عند نقطة التحقق التالية."),
  ).toBeVisible();

  await runQueue.resume();
  await expect(panel.getByText("أُلغي", { exact: true })).toBeVisible({ timeout: 20_000 });
  await captureState(page, testInfo, "run-cancelled");
});

test("refused run state @visual", async ({ page }, testInfo: TestInfo) => {
  await createProject(page, "طلب يحتاج إلى تعديل", "اختبر حالة الرفض");
  const panel = runPanel(page);
  await panel.getByRole("button", { name: "إعداد الخطة" }).click();
  await expect(panel.getByText("تعذّر إعداد خطة مناسبة لهذا الطلب.", { exact: false })).toBeVisible(
    {
      timeout: 20_000,
    },
  );
  await captureState(page, testInfo, "run-refused");
});

test("provider failure state @visual", async ({ page }, testInfo: TestInfo) => {
  await createProject(page, "تعذّر مزود الخطة", "اختبر فشل المزود");
  const panel = runPanel(page);
  await panel.getByRole("button", { name: "إعداد الخطة" }).click();
  await expect(panel.getByText("تعذّر إعداد الخطة. يمكنك بدء تشغيل جديد.")).toBeVisible({
    timeout: 20_000,
  });
  await captureState(page, testInfo, "run-provider-failed");
});

test("limit exceeded state @visual", async ({ page }, testInfo: TestInfo) => {
  await createProject(page, "خطة تتجاوز الحد", "اختبر حد الاستخدام");
  const panel = runPanel(page);
  await panel.getByRole("button", { name: "إعداد الخطة" }).click();
  await expect(
    panel.getByText("توقف إعداد الخطة عند حدّ الاستخدام المسموح.", { exact: false }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await captureState(page, testInfo, "run-limit-exceeded");
});
