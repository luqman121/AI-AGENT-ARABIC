import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: true,
  outputDir: "../../artifacts/playwright",
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:3000",
    locale: "ar-OM",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { height: 844, width: 390 },
      },
    },
    {
      name: "mobile-430",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { height: 932, width: 430 },
      },
    },
  ],
});
