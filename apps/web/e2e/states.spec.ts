import { expect, test } from "@playwright/test";

import { captureState, signIn, uniqueEmail, watchConsole } from "./helpers";

test.describe.configure({ mode: "serial" });

const email = uniqueEmail("states");
const seededTitle = "موقع مقهى الروشن";
// A single idea that still leads with the seeded title and mentions the
// searchable "المقهى" term, since one composer now derives both.
const seededRequest = "موقع مقهى الروشن: قائمة المشروبات وساعات عمل المقهى";

test("auth states @visual", async ({ page }, testInfo) => {
  const consoleWatcher = watchConsole(page);

  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "وكيل" })).toBeVisible();
  await captureState(page, testInfo, "auth-sign-in");

  // Client-side validation error.
  await page.getByRole("button", { name: "أرسل رابط الدخول" }).click();
  await expect(page.getByText("أدخل بريدًا إلكترونيًا صحيحًا.")).toBeVisible();
  await captureState(page, testInfo, "auth-validation-error");

  consoleWatcher.assertClean();
});

test("projects empty, create, and conversation states @visual", async ({ page }, testInfo) => {
  const consoleWatcher = watchConsole(page);
  await signIn(page, email);

  await captureState(page, testInfo, "create-default");

  // Server-side validation error when nothing was typed yet.
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.getByText("اكتب طلبك أولًا.")).toBeVisible();
  await captureState(page, testInfo, "create-validation-error");

  await page.goto("/projects");
  await expect(page.getByText("ما عندك مشاريع بعد")).toBeVisible();
  await captureState(page, testInfo, "projects-empty");

  // Seed real data through the product itself: one idea, one submit.
  await page.goto("/new");
  await page.getByLabel("اوصف فكرتك").fill(seededRequest);
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: seededTitle })).toBeVisible();
  // The plan starts thinking immediately — no manual "start" tap needed.
  await expect(
    page
      .getByRole("region", { name: "إعداد خطة المشروع" })
      .getByRole("button", { name: "إلغاء التشغيل" }),
  ).toBeVisible({ timeout: 15_000 });
  await captureState(page, testInfo, "conversation-default");

  await page.getByRole("button", { name: "خيارات المشروع" }).click();
  await page.getByRole("menuitem", { name: "إعادة التسمية" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await captureState(page, testInfo, "conversation-rename-dialog");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "خيارات المشروع" }).click();
  await page.getByRole("menuitem", { name: "أرشفة المشروع" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await captureState(page, testInfo, "conversation-archive-confirmation");
  await page.getByRole("button", { name: "إلغاء" }).click();

  const projectUrl = page.url();
  await page.goto(`${projectUrl}/preview`);
  await expect(page.getByText("لا توجد معاينة بعد")).toBeVisible();
  await captureState(page, testInfo, "preview-empty");

  consoleWatcher.assertClean();
});

test("projects list, search, archive, loading, usage, account states @visual", async ({
  page,
}, testInfo) => {
  const consoleWatcher = watchConsole(page);
  await signIn(page, email);

  await page.goto("/projects");
  await expect(page.getByRole("link", { name: new RegExp(seededTitle) })).toBeVisible();
  await captureState(page, testInfo, "projects-populated");

  await page.getByLabel("ابحث في المشاريع").fill("المقهى");
  await expect(page.getByRole("link", { name: new RegExp(seededTitle) })).toBeVisible();
  await captureState(page, testInfo, "projects-search-results");

  await page.getByLabel("ابحث في المشاريع").fill("كلمة لا تطابق شيئًا إطلاقًا");
  await expect(page.getByText("لا توجد نتائج")).toBeVisible();
  await captureState(page, testInfo, "projects-no-results");

  // Archived filter with data: archive the seeded project first.
  await page.getByLabel("ابحث في المشاريع").clear();
  await page.getByRole("link", { name: new RegExp(seededTitle) }).click();
  await page.getByRole("button", { name: "خيارات المشروع" }).click();
  await page.getByRole("menuitem", { name: "أرشفة المشروع" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "أرشفة المشروع" }).click();
  await expect(page).toHaveURL(/filter=archived/);
  await expect(page.getByRole("link", { name: new RegExp(seededTitle) })).toBeVisible();
  await captureState(page, testInfo, "projects-archived");

  // Route-level loading skeleton (throttled navigation).
  const client = await page.context().newCDPSession(page);
  await client.send("Network.emulateNetworkConditions", {
    downloadThroughput: 50_000,
    latency: 800,
    offline: false,
    uploadThroughput: 50_000,
  });
  const navigation = page.goto("/projects");
  await page
    .getByText("جارٍ تحميل المشاريع…")
    .waitFor({ state: "attached", timeout: 5_000 })
    .catch(() => {
      // The skeleton may resolve faster than the throttle on warm caches.
    });
  await captureState(page, testInfo, "projects-loading");
  await client.send("Network.emulateNetworkConditions", {
    downloadThroughput: -1,
    latency: 0,
    offline: false,
    uploadThroughput: -1,
  });
  await navigation;

  await page.goto("/usage");
  await expect(page.getByText("لا يوجد استخدام بعد")).toBeVisible();
  await captureState(page, testInfo, "usage-empty");

  await page.goto("/account");
  await expect(page.getByText("بيانات الحساب")).toBeVisible();
  await captureState(page, testInfo, "account");

  consoleWatcher.assertClean();
});

test("global error state @visual", async ({ page }, testInfo) => {
  await signIn(page, uniqueEmail("error-state"));

  // A genuine unexpected failure: a malformed project id is rejected by the
  // PostgreSQL uuid cast (parameterized — no injection) during the server
  // render, which the app error boundary catches. The message is generic;
  // no SQL, stack trace, or tenant detail is leaked to the user.
  await page.goto("/projects/not-a-valid-uuid");
  await expect(page.getByText("حدث خطأ غير متوقع")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "أعد المحاولة" })).toBeVisible();
  await captureState(page, testInfo, "global-error");

  // Navigating to a healthy route recovers the app.
  await page.goto("/projects");
  await expect(page.getByRole("heading", { level: 1, name: "المشاريع" })).toBeVisible();
});

test("offline and reconnecting states @visual", async ({ page, context }, testInfo) => {
  const consoleWatcher = watchConsole(page);
  await signIn(page, email);
  await page.goto("/projects?filter=archived");
  await expect(page.getByRole("link", { name: new RegExp(seededTitle) })).toBeVisible();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByText("لا يوجد اتصال بالإنترنت.")).toBeVisible();
  await captureState(page, testInfo, "offline");

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  // Reconnecting shows only while the real refresh is pending.
  await page
    .getByText("عاد الاتصال، جارٍ تحديث البيانات…")
    .waitFor({ state: "visible", timeout: 5_000 })
    .catch(() => undefined);
  await captureState(page, testInfo, "reconnecting");
  await expect(page.getByText("لا يوجد اتصال بالإنترنت.")).toHaveCount(0, { timeout: 10_000 });

  consoleWatcher.assertClean();
});

test("reduced motion is honored @visual", async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    baseURL: "http://localhost:3101",
    locale: "ar-OM",
    reducedMotion: "reduce",
    viewport:
      testInfo.project.name === "mobile-430"
        ? { height: 932, width: 430 }
        : { height: 844, width: 390 },
  });
  const page = await context.newPage();
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "وكيل" })).toBeVisible();
  // The global reduced-motion rule collapses every transition/animation.
  const duration = await page.evaluate(() => {
    const button = document.querySelector("button");
    return button ? getComputedStyle(button).transitionDuration : "";
  });
  expect(["0.01ms", "1e-05s"]).toContain(duration);
  await context.close();
});
