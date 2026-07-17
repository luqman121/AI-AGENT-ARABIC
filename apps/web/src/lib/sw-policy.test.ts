import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const swSource = readFileSync(
  fileURLToPath(new URL("../../public/sw.js", import.meta.url)),
  "utf8",
);

function parseShellAssets(source: string): string[] {
  const match = source.match(/const SHELL_ASSETS = \[([^\]]+)\]/);
  if (!match?.[1]) throw new Error("SHELL_ASSETS not found in sw.js");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1] ?? "");
}

describe("service worker cache policy", () => {
  const assets = parseShellAssets(swSource);

  it("caches only the offline fallback and versioned public shell assets", () => {
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
      expect(
        asset === "/offline" ||
          asset === "/manifest.webmanifest" ||
          asset.startsWith("/fonts/") ||
          asset.startsWith("/icons/"),
        `unexpected cached asset: ${asset}`,
      ).toBe(true);
    }
  });

  it("never lists authenticated or data routes", () => {
    for (const asset of assets) {
      expect(asset).not.toMatch(/^\/(api|projects|new|usage|account|sign-in)/);
    }
  });

  it("ignores non-GET requests so mutations are never queued or replayed", () => {
    expect(swSource).toContain('if (request.method !== "GET") return;');
    expect(swSource).not.toContain("sync");
  });

  it("keeps navigations network-first with only the offline fallback substitute", () => {
    expect(swSource).toContain('request.mode === "navigate"');
    expect(swSource).toContain("cache.match(OFFLINE_URL)");
  });
});
