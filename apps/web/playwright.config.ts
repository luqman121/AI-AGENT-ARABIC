import { defineConfig, devices } from "@playwright/test";
import { config as loadDotEnv } from "dotenv";
import { fileURLToPath } from "node:url";

const rootEnvPath = fileURLToPath(new URL("../../.env.local", import.meta.url));
const localEnv: Record<string, string> = {};
loadDotEnv({ path: rootEnvPath, processEnv: localEnv, quiet: true });

const PORT = 3101;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: "../../artifacts/playwright",
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    locale: "ar-OM",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm start --port ${PORT}`,
    env: {
      ...localEnv,
      AUTH_TRUST_HOST: "true",
      AUTH_URL: BASE_URL,
      NODE_ENV: "production",
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `${BASE_URL}/api/health`,
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
