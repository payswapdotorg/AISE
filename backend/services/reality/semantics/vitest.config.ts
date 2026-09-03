import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Golden room scenes are ~24k-point deterministic extractions; the
    // permutation-invariance and regression suites each re-run full
    // extraction several times. Generous per-test timeouts keep the
    // deterministic-by-construction discipline (no test skipping) intact.
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
