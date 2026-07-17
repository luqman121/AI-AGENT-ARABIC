import { expect, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

test("failed offline mutations stay visibly unsaved and never duplicate after reconnect", async ({
  page,
  context,
}) => {
  await signIn(page, uniqueEmail("offline-mutation"));

  await page.getByLabel("اسم المشروع").fill("مشروع أثناء الانقطاع");
  await page.getByLabel("اوصف طلبك").fill("طلب كتب أثناء انقطاع الاتصال");
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));

  await page.getByRole("button", { name: "إنشاء المشروع" }).click();

  // The data stays visibly unsaved with a real retry action.
  await expect(page.getByText("تعذّر حفظ الطلب. تحقق من الاتصال ثم أعد المحاولة.")).toBeVisible();
  await expect(page.getByLabel("اسم المشروع")).toHaveValue("مشروع أثناء الانقطاع");
  const retry = page.getByRole("button", { name: "أعد المحاولة" });
  await expect(retry).toBeVisible();

  // Nothing was queued: reconnecting alone must not replay the mutation.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(1_500);
  await page.goto("/projects");
  await expect(page.getByText("ما عندك مشاريع بعد")).toBeVisible();

  // The explicit retry succeeds exactly once (same idempotency key).
  await page.goto("/new");
  await page.getByLabel("اسم المشروع").fill("مشروع أثناء الانقطاع");
  await page.getByLabel("اوصف طلبك").fill("طلب كتب أثناء انقطاع الاتصال");
  await page.getByRole("button", { name: "إنشاء المشروع" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

  await page.goto("/projects");
  await expect(page.getByRole("link", { name: /مشروع أثناء الانقطاع/ })).toHaveCount(1);
});
