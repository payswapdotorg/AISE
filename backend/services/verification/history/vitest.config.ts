import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The golden composition runs the real AISE-010 extraction and
    // AISE-011 ingestion before comparison; keep generous timeouts
    // rather than skipping (deterministic-by-construction discipline).
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
