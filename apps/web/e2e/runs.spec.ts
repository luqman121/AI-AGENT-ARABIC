import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createDatabaseClient } from "@wakil/db/client";
import { RUNS_QUEUE_NAME } from "@wakil/shared";
import { Queue } from "bullmq";
import { sql } from "drizzle-orm";
import { config as loadDotEnv } from "dotenv";
import { Redis } from "ioredis";
import { fileURLToPath } from "node:url";

import { assertMobileQuality, captureState, signIn, uniqueEmail, watchConsole } from "./helpers";

test.describe.configure({ mode: "serial" });

const localEnv: Record<string, string> = {};
loadDotEnv({
  path: fileURLToPath(new URL("../../../.env.local", import.meta.url)),
  processEnv: localEnv,
  quiet: true,
});

function requireLocalEnv(name: "DATABASE_URL" | "REDIS_URL"): string {
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

async function createProject(page: Page, title: string): Promise<void> {
  await signIn(page, uniqueEmail("run"));
  await page.getByLabel("اسم المشروع").fill(title);
  await page.getByLabel("اوصف طلبك").fill("أنشئ صفحة تعريفية واضحة مع معلومات التواصل");
  await page.getByRole("button", { name: "إنشاء المشروع" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
}

function runPanel(page: Page) {
  return page.getByRole("region", { name: "التشغيل التقني" });
}

async function expectSuccessfulRun(page: Page): Promise<void> {
  const panel = runPanel(page);
  await panel.getByRole("button", { name: "بدء التشغيل" }).click();
  await expect(panel.getByText("اكتمل", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(
    panel.getByRole("list", { name: "سجل خطوات التشغيل" }).getByRole("listitem"),
  ).toHaveText([
    "في قائمة الانتظار",
    "بدأ التشغيل",
    "التحقق من الطلب",
    "تسجيل نقطة تحقّق",
    "إنهاء التحضير",
    "اكتمل التشغيل",
  ]);
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

test("queued, running, and succeeded run states @visual", async ({ page }, testInfo: TestInfo) => {
  const consoleWatcher = watchConsole(page);
  await createProject(page, "حالات تشغيل الموقع");
  const panel = runPanel(page);

  await runQueue.pause();
  await panel.getByRole("button", { name: "بدء التشغيل" }).click();
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

  await expect(panel.getByText("اكتمل", { exact: true })).toBeVisible({ timeout: 20_000 });
  await captureState(page, testInfo, "run-succeeded");
  consoleWatcher.assertClean();
});

test("reconnecting and cancelled run states @visual", async ({ page }, testInfo: TestInfo) => {
  await createProject(page, "إلغاء تشغيل التقرير");
  const panel = runPanel(page);

  await runQueue.pause();
  await page.route("**/api/projects/*/runs/*/events", (route) => route.abort("failed"));
  await panel.getByRole("button", { name: "بدء التشغيل" }).click();
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
