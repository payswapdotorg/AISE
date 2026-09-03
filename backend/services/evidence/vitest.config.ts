import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Golden composition runs the full AISE-010 extraction and the
    // AISE-011 ingestion chain before registering evidence and
    // computing validity; keep generous timeouts rather than
    // skipping (deterministic-by-construction discipline).
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
