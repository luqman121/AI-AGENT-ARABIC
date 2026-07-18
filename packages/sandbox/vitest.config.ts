import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: { provider: "v8" },
    environment: "node",
    exclude: [...configDefaults.exclude, "dist/**"],
  },
});
