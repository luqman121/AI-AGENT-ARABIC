import { defineConfig } from "drizzle-kit";

import { getDatabaseEnv } from "./src/env.js";

const env = getDatabaseEnv();

export default defineConfig({
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  dialect: "postgresql",
  out: "./migrations",
  schema: "./src/schema/index.ts",
  strict: true,
  verbose: true,
});
