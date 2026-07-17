import { expect, type Page, type TestInfo } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MAILPIT_URL = "http://127.0.0.1:8025";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@wakil.test`;
}

type MailpitSearchResult = {
  messages: Array<{ ID: string }>;
};

type MailpitMessage = {
  HTML: string;
  Text: string;
};

/** Polls Mailpit for the newest magic-link email sent to the address. */
export async function fetchMagicLink(email: string, baseUrl: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const search = (await (
      await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    ).json()) as MailpitSearchResult;
    const id = search.messages[0]?.ID;
    if (id) {
      const message = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)
      ).json()) as MailpitMessage;
      const source = `${message.HTML}\n${message.Text}`.replaceAll("&amp;", "&");
      const match = source.match(
        new RegExp(`${baseUrl.replaceAll(".", "\\.")}/api/auth/callback/nodemailer[^"'\\s<)]+`),
      );
      if (match?.[0]) return match[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No magic link email arrived for ${email}`);
}

const BASE_URL = "http://localhost:3101";

/** Full email magic-link sign-in through Mailpit. */
export async function signIn(page: Page, email: string): Promise<void> {
  const baseUrl = BASE_URL;
  await page.goto("/sign-in");
  await page.getByLabel("البريد الإلكتروني").fill(email);
  await page.getByRole("button", { name: "أرسل رابط الدخول" }).click();
  await expect(page).toHaveURL(/check-email/);
  const link = await fetchMagicLink(email, baseUrl);
  await page.goto(link);
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
  const targets = page.locator(
    "a[href]:not(.sr-only), button:not(.sr-only), input, textarea, [role='tab']",
  );
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
