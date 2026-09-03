import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Golden ingestion runs the full AISE-010 extraction (~24k points)
    // before ingesting into the model; keep generous timeouts rather
    // than skipping (deterministic-by-construction discipline).
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
