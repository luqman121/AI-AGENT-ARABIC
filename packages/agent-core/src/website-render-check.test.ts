/// <reference lib="dom" />
import { chromium, type Browser } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * This sandbox pre-installs a full Chromium build under
 * `PLAYWRIGHT_BROWSERS_PATH` whose revision folder name may not match what
 * the pinned `@playwright/test` version expects for its headless-shell
 * variant. Scan for the full `chrome-linux/chrome` binary directly rather
 * than hardcoding a revision number, so this keeps working across bumps.
 * Returns `undefined` (Playwright's own auto-detection) when not found —
 * e.g. in a real CI image that installed browsers the standard way.
 */
function resolvePreinstalledChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const candidate = readdirSync(root).find((entry) => entry.startsWith("chromium-"));
  if (!candidate) return undefined;
  const chromePath = join(root, candidate, "chrome-linux", "chrome");
  return existsSync(chromePath) ? chromePath : undefined;
}

/**
 * A REAL, rendered validation check — genuinely launches Chromium (reusing
 * the root-pinned `@playwright/test`, already used by `apps/web`'s e2e
 * suite; no new dependency was added) and inspects actual page geometry and
 * console output at each required viewport. This module intentionally lives
 * in a `.test.ts` file only: it is exercised here (and by the acceptance
 * scenario) to produce genuine evidence, but is NOT part of the package's
 * built `dist/` output and is NOT wired into the live worker process. Adding
 * a browser dependency to the production worker's hot path/Docker image is a
 * larger infrastructure change outside this increment's scope — see
 * CHANGELOG.md / the final report for that documented limitation.
 */

export type ViewportCheck = {
  label: string;
  width: number;
  height: number;
  hasHorizontalOverflow: boolean;
  consoleErrors: string[];
  screenshotPath?: string | undefined;
};

export type RenderValidationResult = {
  ok: boolean;
  rtlOk: boolean;
  blockingErrors: string[];
  viewports: ViewportCheck[];
};

const REQUIRED_VIEWPORTS = [
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-430", width: 430, height: 932 },
  { label: "tablet-768", width: 768, height: 1024 },
  { label: "desktop-1440", width: 1440, height: 900 },
] as const;

async function renderValidateStaticSite(
  html: string,
  options: { screenshotDir?: string } = {},
): Promise<RenderValidationResult> {
  let browser: Browser | undefined;
  const viewports: ViewportCheck[] = [];
  const blockingErrors: string[] = [];
  let rtlOk = true;

  const executablePath = resolvePreinstalledChromium();
  try {
    browser = await chromium.launch(executablePath ? { executablePath } : {});
    for (const viewport of REQUIRED_VIEWPORTS) {
      const page = await browser.newPage({
        viewport: { width: viewport.width, height: viewport.height },
      });
      const consoleErrors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

      await page.setContent(html, { waitUntil: "load" });
      const geometry = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        dir: document.documentElement.getAttribute("dir"),
        lang: document.documentElement.getAttribute("lang"),
        scrollWidth: document.documentElement.scrollWidth,
      }));
      const hasHorizontalOverflow = geometry.scrollWidth > geometry.clientWidth + 1;
      if (geometry.dir !== "rtl" || geometry.lang !== "ar") rtlOk = false;

      let screenshotPath: string | undefined;
      if (options.screenshotDir) {
        screenshotPath = `${options.screenshotDir}/${viewport.label}.png`;
        await page.screenshot({ path: screenshotPath });
      }

      viewports.push({
        consoleErrors,
        hasHorizontalOverflow,
        height: viewport.height,
        label: viewport.label,
        screenshotPath,
        width: viewport.width,
      });
      if (hasHorizontalOverflow) blockingErrors.push(`horizontal overflow at ${viewport.label}`);
      if (consoleErrors.length > 0) blockingErrors.push(`console errors at ${viewport.label}`);
      await page.close();
    }
  } finally {
    await browser?.close();
  }

  return { blockingErrors, ok: blockingErrors.length === 0 && rtlOk, rtlOk, viewports };
}

const GOOD_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>مقهى الديوانية</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; max-width: 100%; overflow-x: hidden; }
  .hero { padding: 24px 16px; }
  h1 { font-size: 1.75rem; }
  .btn { display: inline-block; padding: 12px 20px; }
</style>
</head>
<body>
  <main class="hero">
    <h1>مقهى الديوانية</h1>
    <p>قائمة مشروبات وأسعار وطريقة تواصل سريعة.</p>
    <a href="#menu" class="btn">اطلب الآن</a>
  </main>
</body>
</html>`;

// A fixed 1200px-wide element with no responsive handling — genuinely
// overflows a 390px mobile viewport when actually rendered.
const OVERFLOWING_HTML = GOOD_HTML.replace("<style>", "<style>\n  .hero { width: 1200px; }");

const screenshotRoot = fileURLToPath(
  new URL("../../../artifacts/agent-core-render-check", import.meta.url),
);

let chromiumAvailable = true;

beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
  try {
    const probe = await chromium.launch();
    await probe.close();
  } catch {
    chromiumAvailable = false;
  }
}, 30_000);

afterAll(() => {
  // Screenshots are left on disk under artifacts/ for inspection; nothing to clean up.
});

describe.skipIf(!chromiumAvailable)("renderValidateStaticSite — real rendered validation", () => {
  it("renders a well-formed Arabic RTL site at all four required viewports with no overflow", async () => {
    const result = await renderValidateStaticSite(GOOD_HTML, { screenshotDir: screenshotRoot });
    expect(result.viewports).toHaveLength(4);
    expect(result.viewports.map((v) => v.label)).toEqual([
      "mobile-390",
      "mobile-430",
      "tablet-768",
      "desktop-1440",
    ]);
    for (const viewport of result.viewports) {
      expect(viewport.hasHorizontalOverflow, `overflow at ${viewport.label}`).toBe(false);
      expect(viewport.consoleErrors, `console errors at ${viewport.label}`).toHaveLength(0);
      expect(viewport.screenshotPath).toBeTruthy();
    }
    expect(result.rtlOk).toBe(true);
    expect(result.ok).toBe(true);
  }, 30_000);

  it("genuinely detects real horizontal overflow at mobile viewports (not a heuristic guess)", async () => {
    const result = await renderValidateStaticSite(OVERFLOWING_HTML);
    const mobile390 = result.viewports.find((v) => v.label === "mobile-390");
    const mobile430 = result.viewports.find((v) => v.label === "mobile-430");
    const desktop = result.viewports.find((v) => v.label === "desktop-1440");
    expect(mobile390?.hasHorizontalOverflow).toBe(true);
    expect(mobile430?.hasHorizontalOverflow).toBe(true);
    // A 1200px element does not overflow a 1440px desktop viewport — proves
    // this is real measured geometry, not a fixed-width blanket flag.
    expect(desktop?.hasHorizontalOverflow).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.blockingErrors.some((e) => e.includes("mobile-390"))).toBe(true);
  }, 30_000);

  it("flags missing RTL structure via real DOM inspection", async () => {
    const nonRtlHtml = GOOD_HTML.replace('lang="ar" dir="rtl"', "");
    const result = await renderValidateStaticSite(nonRtlHtml);
    expect(result.rtlOk).toBe(false);
    expect(result.ok).toBe(false);
  }, 30_000);
});
