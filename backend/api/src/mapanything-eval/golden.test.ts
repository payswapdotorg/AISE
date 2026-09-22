/**
 * HFX-101 — the GOLDEN tests: the LIVE regeneration leg of the MapAnything
 * provider benchmark (the tools/reality-eval + tools/vlm-eval two-leg
 * discipline).
 *
 * The boundary matrix forbids tools → packages/backend imports, so the
 * tools-side check runner (tools/mapanything-eval/benchmark.test.ts)
 * consumes the COMMITTED ARTIFACTS as data. THIS is the backend-side live
 * leg: the freshly computed corpus suite and benchmark run equal the
 * committed files BYTE-FOR-BYTE — drift fails the gate.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  goldenMapAnythingExpectedOutcomesJson,
  goldenMapAnythingScenarioSuiteJson,
} from "./golden";

const TOOLS_MAPANYTHING_EVAL = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "tools",
  "mapanything-eval",
);
const SCENARIO_PATH = join(TOOLS_MAPANYTHING_EVAL, "scenario.json");
const OUTCOMES_PATH = join(TOOLS_MAPANYTHING_EVAL, "fixtures", "expected-outcomes.json");

describe("HFX-101 golden: the committed artifacts are the live benchmark's projection", () => {
  test("tools/mapanything-eval/scenario.json equals the freshly built corpus suite byte-for-byte", () => {
    const committed = readFileSync(SCENARIO_PATH, "utf8");
    expect(committed).toBe(goldenMapAnythingScenarioSuiteJson());
  });

  test("tools/mapanything-eval/fixtures/expected-outcomes.json equals the freshly computed benchmark byte-for-byte", () => {
    const committed = readFileSync(OUTCOMES_PATH, "utf8");
    expect(committed).toBe(goldenMapAnythingExpectedOutcomesJson());
  });

  test("both artifacts are canonical (idempotent under the canonical JSON form)", () => {
    for (const path of [SCENARIO_PATH, OUTCOMES_PATH]) {
      const committed = readFileSync(path, "utf8");
      expect(canonicalForm(JSON.parse(committed))).toBe(committed);
    }
  });
});

/** Canonical JSON form (sorted keys, 2-space indent, trailing newline). */
function canonicalForm(value: unknown): string {
  const sortValue = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(sortValue);
    }
    if (input !== null && typeof input === "object") {
      const record = input as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        out[key] = sortValue(record[key]);
      }
      return out;
    }
    return input;
  };
  return `${JSON.stringify(sortValue(value), null, 2)}\n`;
}
