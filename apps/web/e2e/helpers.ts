import { expect, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@wakil.test`;
}

/** Shared test password; meets the 8-character minimum enforced by the form. */
export const TEST_PASSWORD = "wakil-passw0rd";

/**
 * Email + password sign-in. The first time an address is used the account is
 * created and logged in; later calls with the same address log straight in.
 */
export async function signIn(
  page: Page,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "الدخول" }).click();
  await expect(page).toHaveURL(/\/new$/, { timeout: 15_000 });
}

export type ConsoleWatcher = {
  errors: string[];
  assertClean: () => void;
};

/** Collects console errors, page errors, and hydration warnings. */
export function watchConsole(page: Page): ConsoleWatcher {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (message.type() === "warning" && /hydrat/i.test(message.text())) {
      errors.push(`hydration: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });
  return {
    assertClean: () => {
      const relevant = errors.filter(
        // Failed network requests while intentionally offline are expected.
        (entry) => !entry.includes("net::ERR_INTERNET_DISCONNECTED"),
      );
      expect(relevant, `console must be clean:\n${relevant.join("\n")}`).toHaveLength(0);
    },
    errors,
  };
}

/** Shared mobile-quality assertions for every captured state. */
export async function assertMobileQuality(page: Page): Promise<void> {
  // RTL root.
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");

  // No horizontal overflow.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(overflow.scrollWidth, "no horizontal overflow").toBeLessThanOrEqual(overflow.innerWidth);

  // Every visible interactive target is at least 44x44. Screen-reader-only
  // elements (e.g. the skip link) are keyboard/AT affordances, not touch
  // targets, and are excluded.
  const targets = page.locator(":is(a[href], button, input, textarea, [role='tab']):not(.sr-only)");
  const count = await targets.count();
  for (let index = 0; index < count; index += 1) {
    const target = targets.nth(index);
    if (!(await target.isVisible())) continue;
    const box = await target.boundingBox();
    if (!box) continue;
    const label = (await target.textContent())?.trim().slice(0, 30) ?? "";
    expect(box.height, `touch height of "${label}"`).toBeGreaterThanOrEqual(43.5);
    expect(box.width, `touch width of "${label}"`).toBeGreaterThanOrEqual(43.5);
  }
}

const screenshotRoot = fileURLToPath(new URL("./__screenshots__", import.meta.url));

/** Captures the state screenshot into the committed matrix. */
export async function captureState(page: Page, testInfo: TestInfo, state: string): Promise<void> {
  await assertMobileQuality(page);
  const path = join(screenshotRoot, testInfo.project.name, `${state}.png`);
  await mkdir(dirname(path), { recursive: true });
  await page.screenshot({ fullPage: false, path });
}
