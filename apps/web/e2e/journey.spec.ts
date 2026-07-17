import { expect, test } from "@playwright/test";

import { signIn, uniqueEmail, watchConsole } from "./helpers";

test.describe.configure({ mode: "serial" });

const email = uniqueEmail("journey");
const projectTitle = "موقع مطعم البيت";
const renamedTitle = "موقع مطعم البيت الجديد";

test("complete M1 journey: sign in, create, append, rename, search, archive, persist", async ({
  page,
}) => {
  const consoleWatcher = watchConsole(page);

  // Sign in through a real Mailpit magic link.
  await signIn(page, email);

  // Create a database-backed project.
  await page.getByLabel("اسم المشروع").fill(projectTitle);
  await page
    .getByLabel("اوصف طلبك")
    .fill("أريد موقعًا بسيطًا لمطعمي مع قائمة الطعام وأرقام التواصل");
  await page.getByRole("button", { name: "إنشاء المشروع" }).click();

  // Lands in the saved conversation.
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: projectTitle })).toBeVisible();
  await expect(page.getByText("قائمة الطعام")).toBeVisible();
  const projectUrl = page.url();

  // Append an additional requirement.
  await page.getByLabel("أضف متطلبات إضافية").fill("أضف صفحة تواصل مع خريطة الموقع");
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.getByText("أضف صفحة تواصل مع خريطة الموقع")).toBeVisible();

  // The composer never covers the newest message.
  const lastMessage = page.locator("article").last();
  const composer = page.locator("form", { has: page.getByLabel("أضف متطلبات إضافية") });
  const messageBox = await lastMessage.boundingBox();
  const composerBox = await composer.boundingBox();
  expect(messageBox && composerBox && messageBox.y + messageBox.height <= composerBox.y + 1).toBe(
    true,
  );

  // Rename through the project menu dialog.
  await page.getByRole("button", { name: "خيارات المشروع" }).click();
  await page.getByRole("menuitem", { name: "إعادة التسمية" }).click();
  const renameField = page.getByRole("dialog").getByLabel("اسم المشروع");
  await renameField.fill(renamedTitle);
  await page.getByRole("button", { name: "حفظ الاسم" }).click();
  await expect(page.getByRole("heading", { level: 1, name: renamedTitle })).toBeVisible();

  // Search by title and by saved request text.
  await page.goto("/projects");
  await page.getByLabel("ابحث في المشاريع").fill("المطعم الجديد");
  await expect(page.getByRole("link", { name: new RegExp(renamedTitle) })).toBeVisible();
  await page.getByLabel("ابحث في المشاريع").fill("قائمة الطعام");
  await expect(page.getByRole("link", { name: new RegExp(renamedTitle) })).toBeVisible();

  // No-results state is truthful.
  await page.getByLabel("ابحث في المشاريع").fill("نص لا يطابق أي مشروع");
  await expect(page.getByText("لا توجد نتائج")).toBeVisible();
  await page.getByRole("button", { name: "مسح البحث" }).click();

  // Preview and usage are truthful empty states.
  await page.goto(`${projectUrl}/preview`);
  await expect(page.getByText("لا توجد معاينة بعد")).toBeVisible();
  await page.goto("/usage");
  await expect(page.getByText("لا يوجد استخدام بعد")).toBeVisible();

  // Account shows the real session identity with LTR isolation.
  await page.goto("/account");
  const emailValue = page.locator(`span[dir="ltr"]`, { hasText: email });
  await expect(emailValue).toBeVisible();

  // Archive from the conversation menu.
  await page.goto(projectUrl);
  await page.getByRole("button", { name: "خيارات المشروع" }).click();
  await page.getByRole("menuitem", { name: "أرشفة المشروع" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "أرشفة المشروع" }).click();
  await expect(page).toHaveURL(/filter=archived/);
  await expect(page.getByRole("link", { name: new RegExp(renamedTitle) })).toBeVisible();

  // Archived project is read-only.
  await page.goto(projectUrl);
  await expect(page.getByText("هذا المشروع مؤرشف؛ يمكنك قراءته فقط.")).toBeVisible();
  await expect(page.getByLabel("أضف متطلبات إضافية")).toHaveCount(0);

  consoleWatcher.assertClean();
});

test("sign out and sign in again preserves saved data", async ({ page }) => {
  const consoleWatcher = watchConsole(page);

  await signIn(page, email);
  await page.goto("/account");
  await page.getByRole("button", { name: "تسجيل الخروج" }).click();
  await expect(page).toHaveURL(/sign-in/);

  // Authenticated routes are protected again.
  await page.goto("/projects");
  await expect(page).toHaveURL(/sign-in/);

  // Second sign-in with the same email reaches the same workspace data.
  await signIn(page, email);
  await page.goto("/projects?filter=archived");
  await expect(page.getByRole("link", { name: new RegExp(renamedTitle) })).toBeVisible();

  consoleWatcher.assertClean();
});

test("guessed project UUIDs return the not-found state", async ({ page }) => {
  await signIn(page, uniqueEmail("guess"));
  await page.goto("/projects/3f0d9a6a-64ab-4f3e-9d59-6a2f9f6f2b1c");
  await expect(page.getByRole("heading", { name: "المشروع غير موجود" })).toBeVisible();
});
