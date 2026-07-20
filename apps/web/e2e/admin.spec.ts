import { expect, test } from "@playwright/test";

import { setUserRole } from "./db-admin";
import { assertMobileQuality, signIn, uniqueEmail, watchConsole } from "./helpers";

const NAV_LABELS = [
  "العملاء",
  "المشاريع",
  "عمليات التنفيذ",
  "الاستخدام",
  "حالة النظام",
  "سجل الإدارة",
];

test.describe("admin dashboard authorization", () => {
  test("a regular user cannot reach /admin and is redirected home", async ({ page }) => {
    const email = uniqueEmail("user");
    await signIn(page, email); // account is created with the default 'user' role
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/new$/);

    // A protected sub-route is equally unreachable.
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/new$/);
  });

  test("an admin sees the dashboard, navigates it, and it stays mobile-clean", async ({ page }) => {
    const watcher = watchConsole(page);
    const email = uniqueEmail("admin");
    await signIn(page, email);
    await setUserRole(email, "admin");

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "نظرة عامة" })).toBeVisible();

    for (const label of NAV_LABELS) {
      await expect(page.getByRole("link", { name: label }).first()).toBeVisible();
    }

    await page.goto("/admin/users");
    await expect(page.getByRole("heading", { name: "العملاء" })).toBeVisible();

    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "سجل الإدارة" })).toBeVisible();

    await assertMobileQuality(page);
    watcher.assertClean();
  });

  test("support has read access but no mutation controls", async ({ page }) => {
    const email = uniqueEmail("support");
    await signIn(page, email);
    const userId = await setUserRole(email, "support");

    // Read access to the dashboard is granted.
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "نظرة عامة" })).toBeVisible();

    // On a user detail page, support sees the read-only notice, not actions.
    await page.goto(`/admin/users/${userId}`);
    await expect(page.getByText("الإجراءات متاحة للمدير فقط", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "إيقاف الحساب" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "تغيير الدور" })).toHaveCount(0);
  });
});
