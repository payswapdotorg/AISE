/**
 * PROD-030 — barrel-safety tests: the public barrel of this package can no
 * longer reach `node:fs`.
 *
 * The shared-contract barrel defect (escalated by PROD-026, documented in
 * docs/productization-evidence/PROD-012-R/repro-harness.ts Phase 0b): this
 * package's index re-exported the Node-only committed-fixture loader, so
 * every browser bundle that imported the barrel also bundled the loader —
 * whose module scope evaluates `join(import.meta.dir, "..")` from
 * `node:path` and crashed module evaluation in a plain browser (the
 * bundler externalizes the Node builtins).
 *
 * The seam fix: the loader is exported ONLY through the documented subpath
 * `@aise/adapter-contract/fixtures-loader` (package.json exports map), and
 * the barrel re-export is gone. These tests pin BOTH sides of that seam:
 *
 *  - the barrel namespace does NOT export `loadCommittedFixtures`, and the
 *    barrel source no longer references the fixtures-loader module at all
 *    (the type re-exports left the barrel too — types leave no runtime
 *    trace, so the source is scanned);
 *  - the deep import still loads the committed corpus (the round-trip
 *    proof the loader keeps working where it belongs — Node consumers);
 *  - the package's exports map declares the subpath (the public contract
 *    that makes the deep import resolvable for every consumer).
 *
 * Deterministic: committed files only; no network, no clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as api from "./index";
import { loadCommittedFixtures } from "./fixtures-loader";

describe("PROD-030 the barrel no longer exports the Node-only fixtures loader", () => {
  test("the barrel namespace does not export loadCommittedFixtures", () => {
    expect(Object.keys(api).includes("loadCommittedFixtures")).toBe(false);
  });

  test("the barrel source no longer imports/re-exports the fixtures-loader module", () => {
    const barrelSource = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    // The module SPECIFIER (not prose): a comment may honestly point at the
    // subpath, but no import/export statement may reference the loader.
    expect(barrelSource.includes('"./fixtures-loader"')).toBe(false);
  });

  test("the barrel still exports the contract surface (sentinels)", () => {
    const exportedNames = new Set(Object.keys(api));
    for (const sentinel of [
      "ADAPTER_CONTRACT_VERSION",
      "runConformance",
      "createLosslessBinding",
      "negotiateCapabilities",
      "decodeTaskIntent",
      "encodeOperationResult",
    ]) {
      expect(exportedNames.has(sentinel)).toBe(true);
    }
  });
});

describe("PROD-030 the documented fixtures-loader subpath still works (Node consumers)", () => {
  test("the package exports map declares the subpath", () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"),
    ) as { exports?: Record<string, string> };
    expect(packageJson.exports?.["."]).toBe("./src/index.ts");
    expect(packageJson.exports?.["./fixtures-loader"]).toBe("./src/fixtures-loader.ts");
  });

  test("the deep import loads the non-empty committed corpus", () => {
    const corpus = loadCommittedFixtures();
    expect(corpus.fixtures.length).toBeGreaterThan(0);
    for (const fixture of corpus.fixtures) {
      expect(fixture.objectName.length).toBeGreaterThan(0);
      expect(["valid", "invalid", "version-mismatch"]).toContain(fixture.kind);
      expect(fixture.fileName.endsWith(".json")).toBe(true);
    }
  });
});
