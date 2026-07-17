import { expect, test } from "@playwright/test";

import { signIn, uniqueEmail } from "./helpers";

test("manifest describes an installable Arabic app", async ({ page }) => {
  const response = await page.request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Record<string, unknown>;
  expect(manifest["lang"]).toBe("ar");
  expect(manifest["dir"]).toBe("rtl");
  expect(manifest["display"]).toBe("standalone");
  expect(manifest["name"]).toBe("وكيل");
  const icons = manifest["icons"] as Array<{ sizes: string; purpose?: string }>;
  expect(icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable")).toBe(true);
  expect(icons.some((icon) => icon.sizes === "192x192" && icon.purpose === "any")).toBe(true);
});

test("app icons are served", async ({ page }) => {
  for (const path of [
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-192.png",
    "/icons/icon-maskable-512.png",
  ]) {
    const response = await page.request.get(path);
    expect(response.ok(), path).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
});

test("service worker caches only the public shell allowlist", async ({ page, context }) => {
  await signIn(page, uniqueEmail("pwa-cache"));

  // Wait for the service worker to activate and precache.
  await page.goto("/new");
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(registration?.active);
  });
  await page.waitForFunction(async () => (await caches.keys()).length > 0);

  const cachedUrls = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        urls.push(new URL(request.url).pathname);
      }
    }
    return urls;
  });

  expect(cachedUrls.length).toBeGreaterThan(0);
  for (const url of cachedUrls) {
    expect(
      url === "/offline" ||
        url === "/manifest.webmanifest" ||
        url.startsWith("/fonts/") ||
        url.startsWith("/icons/"),
      `cached URL must be on the allowlist: ${url}`,
    ).toBe(true);
  }

  // Navigate through private screens, then verify nothing private was cached.
  await page.goto("/projects");
  await page.goto("/account");
  const afterBrowsing = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        urls.push(new URL(request.url).pathname);
      }
    }
    return urls;
  });
  expect(afterBrowsing.filter((url) => /projects|account|api|new|usage/.test(url))).toHaveLength(0);

  // Offline navigation falls back to the static Arabic offline page.
  await context.setOffline(true);
  await page.goto("/projects").catch(() => undefined);
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toBeVisible();
  // The fallback contains no private project data.
  await expect(page.getByText("مقهى", { exact: false })).toHaveCount(0);
  await context.setOffline(false);
});
