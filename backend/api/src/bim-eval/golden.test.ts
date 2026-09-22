/**
 * HFX-204 — the GOLDEN tests: the LIVE regeneration leg of the BIM
 * evaluation corpus benchmark.
 *
 * The boundary matrix forbids tools → packages/backend imports, so the
 * tools-side check runner (tools/bim-eval/benchmark.test.ts) consumes the
 * COMMITTED ARTIFACTS as data (the building-benchmark discipline). THIS is
 * the backend-side live leg: the freshly computed corpus suite and suite
 * run equal the committed files BYTE-FOR-BYTE — drift fails the gate.
 *
 * (Reading the committed artifacts with node:fs — a pure file read, never
 * an import — is the cross-zone companion convention of
 * tools/building-benchmark, whose regeneration CLI lives in the importable
 * zone for the same boundary reason.)
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonText } from "./model";
import { goldenExpectedOutcomesJson, goldenScenarioSuiteJson } from "./testkit";

const TOOLS_BIM_EVAL = join(import.meta.dir, "..", "..", "..", "..", "tools", "bim-eval");
const SCENARIO_PATH = join(TOOLS_BIM_EVAL, "scenario.json");
const OUTCOMES_PATH = join(TOOLS_BIM_EVAL, "fixtures", "expected-outcomes.json");

describe("HFX-204 golden: the committed artifacts are the live corpus's projection", () => {
  test("tools/bim-eval/scenario.json equals the freshly built corpus byte-for-byte", () => {
    const committed = readFileSync(SCENARIO_PATH, "utf8");
    expect(committed).toBe(goldenScenarioSuiteJson());
  });

  test("tools/bim-eval/fixtures/expected-outcomes.json equals the freshly computed suite run byte-for-byte", () => {
    const committed = readFileSync(OUTCOMES_PATH, "utf8");
    expect(committed).toBe(goldenExpectedOutcomesJson());
  });

  test("both artifacts are canonical (idempotent under the canonical JSON form)", () => {
    for (const path of [SCENARIO_PATH, OUTCOMES_PATH]) {
      const committed = readFileSync(path, "utf8");
      expect(canonicalJsonText(JSON.parse(committed))).toBe(committed);
    }
  });
});
