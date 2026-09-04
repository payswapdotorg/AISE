import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Cases run the full extraction + ingestion chain per case;
    // keep generous timeouts rather than skipping.
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
