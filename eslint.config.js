// AISE root ESLint flat config.
// Scope: TypeScript/JavaScript sources under apps/, backend/, packages/ and tools/
// plus root-level config files. apps/android/** is owned by the GEMINI worker
// (AISE-002) and is intentionally excluded from this gate.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.vite/**",
      "apps/android/**",
      "spec/**",
      "docs/**",
      "bun.lock",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Application and library code must log through the structured logger,
    // never through raw console.* calls.
    files: ["apps/**/*.ts", "apps/**/*.tsx", "backend/**/*.ts", "packages/**/*.ts"],
    rules: {
      "no-console": "error",
    },
  },
  {
    // tools/ are command-line gates and may print to stdout/stderr.
    files: ["tools/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
);
