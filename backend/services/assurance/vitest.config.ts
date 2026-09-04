import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Golden composition runs the full AISE-010 extraction, the
    // AISE-011 ingestion, and the AISE-012 evidence chain before
    // assessing readiness; keep generous timeouts rather than
    // skipping (deterministic-by-construction discipline).
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
