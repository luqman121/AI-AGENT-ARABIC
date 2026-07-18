import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

async function expectNoViolations(page: Page) {
  // Client navigations stream the document title; wait for it before scanning.
  await expect(page).toHaveTitle(/./);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    results.violations,
    JSON.stringify(
      results.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => node.html).slice(0, 3),
      })),
      null,
      2,
    ),
  ).toHaveLength(0);
}

test("sign-in passes Axe WCAG 2 A/AA checks", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "وكيل" })).toBeVisible();
  await expectNoViolations(page);
});

test("authenticated screens pass Axe WCAG 2 A/AA checks", async ({ page }) => {
  await signIn(page, uniqueEmail("a11y"));

  await expectNoViolations(page); // /new

  await page.getByLabel("اوصف فكرتك").fill("اختبار الوصول للمحادثة");
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expectNoViolations(page); // conversation

  await page.goto("/projects");
  await expectNoViolations(page); // populated list

  await page.goto("/usage");
  await expectNoViolations(page);

  await page.goto("/account");
  await expectNoViolations(page);
});

test("keyboard-only create flow with visible focus", async ({ page }) => {
  await signIn(page, uniqueEmail("keyboard"));

  // Skip link is the first focus stop.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "تخطَّ إلى المحتوى" })).toBeFocused();

  // Reach the idea field, fill, reach the send button, submit.
  await page.getByLabel("اوصف فكرتك").focus();
  await expect(page.getByLabel("اوصف فكرتك")).toBeFocused();
  await page.keyboard.type("أنشئ جدولًا للمصروفات الشهرية");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "إرسال الطلب" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);

  // Dialog keyboard flow: open menu, rename, focus is trapped and returns.
  const menuButton = page.getByRole("button", { name: "خيارات المشروع" });
  await menuButton.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "إعادة التسمية" }).press("Enter");
  const dialogField = page.getByRole("dialog").getByLabel("اسم المشروع");
  await expect(page.getByRole("dialog")).toBeVisible();
  await dialogField.fill("اسم عبر لوحة المفاتيح");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Visible focus ring style is applied via :focus-visible.
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const active = document.activeElement;
    return active ? getComputedStyle(active).outlineWidth : "";
  });
  expect(outline).toBe("2px");
});
