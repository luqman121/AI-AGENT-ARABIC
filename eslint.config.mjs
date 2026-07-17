import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import globals from "globals";
import tseslint from "typescript-eslint";

const webFiles = ["apps/web/**/*.{ts,tsx}"];
const scopeToWeb = (config) => ({ ...config, files: webFiles });

export default defineConfig(
  globalIgnores([
    "**/.next/**",
    "**/.turbo/**",
    "**/coverage/**",
    "**/dist/**",
    "**/node_modules/**",
    ".agents/**",
    ".codex/**",
    ".tools/**",
    "packages/db/migrations/**",
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["scripts/**/*.{js,mjs}"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  ...nextVitals.map(scopeToWeb),
  ...nextTypeScript.map(scopeToWeb),
);
