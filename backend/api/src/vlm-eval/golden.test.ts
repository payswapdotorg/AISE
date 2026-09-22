/**
 * HFX-201 — the GOLDEN tests: the LIVE regeneration leg of the VLM
 * provider benchmark (the tools/reasoning-eval two-leg discipline).
 *
 * The boundary matrix forbids tools → packages/backend imports, so the
 * tools-side check runner (tools/vlm-eval/benchmark.test.ts) consumes the
 * COMMITTED ARTIFACTS as data. THIS is the backend-side live leg: the
 * freshly computed corpus suite and benchmark run equal the committed
 * files BYTE-FOR-BYTE — drift fails the gate.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonText } from "../reasoning-eval/model";
import { goldenVlmExpectedOutcomesJson, goldenVlmScenarioSuiteJson } from "./golden";

const TOOLS_VLM_EVAL = join(import.meta.dir, "..", "..", "..", "..", "tools", "vlm-eval");
const SCENARIO_PATH = join(TOOLS_VLM_EVAL, "scenario.json");
const OUTCOMES_PATH = join(TOOLS_VLM_EVAL, "fixtures", "expected-outcomes.json");

describe("HFX-201 golden: the committed artifacts are the live benchmark's projection", () => {
  test("tools/vlm-eval/scenario.json equals the freshly built corpus suite byte-for-byte", () => {
    const committed = readFileSync(SCENARIO_PATH, "utf8");
    expect(committed).toBe(goldenVlmScenarioSuiteJson());
  });

  test("tools/vlm-eval/fixtures/expected-outcomes.json equals the freshly computed benchmark byte-for-byte", () => {
    const committed = readFileSync(OUTCOMES_PATH, "utf8");
    expect(committed).toBe(goldenVlmExpectedOutcomesJson());
  });

  test("both artifacts are canonical (idempotent under the canonical JSON form)", () => {
    for (const path of [SCENARIO_PATH, OUTCOMES_PATH]) {
      const committed = readFileSync(path, "utf8");
      expect(canonicalJsonText(JSON.parse(committed))).toBe(committed);
    }
  });
});
