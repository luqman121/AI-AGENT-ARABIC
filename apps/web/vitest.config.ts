import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    environment: "node",
    include: ["app/**/*.test.ts", "src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 20_000,
  },
});
