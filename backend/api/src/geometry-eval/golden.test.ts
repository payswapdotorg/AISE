/**
 * HFX-302 — the GOLDEN tests: the LIVE regeneration leg of the geometry
 * substitution benchmark.
 *
 * The boundary matrix forbids tools → packages/backend imports, so the
 * tools-side check runner (tools/geometry-eval/benchmark.test.ts)
 * consumes the COMMITTED ARTIFACTS as data (the equivalence-eval
 * discipline). THIS is the backend-side live leg: the freshly computed
 * corpus suite and its canonical projection equal the committed files
 * BYTE-FOR-BYTE — drift fails the gate.
 *
 * (Reading the committed artifacts with node:fs — a pure file read, never
 * an import — is the cross-zone companion convention of
 * tools/equivalence-eval / tools/bim-eval, whose regeneration CLI lives
 * in the importable zone for the same boundary reason.)
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { goldenCorpusSuiteJson, goldenOutcomesJson } from "./testkit";

const TOOLS_GEOMETRY_EVAL = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "tools",
  "geometry-eval",
);
const SCENARIO_PATH = join(TOOLS_GEOMETRY_EVAL, "scenario.json");
const OUTCOMES_PATH = join(TOOLS_GEOMETRY_EVAL, "fixtures", "expected-outcomes.json");

describe("HFX-302 golden: the committed artifacts are the live corpus's projection", () => {
  test("tools/geometry-eval/scenario.json equals the freshly built corpus byte-for-byte", () => {
    const committed = readFileSync(SCENARIO_PATH, "utf8");
    expect(committed).toBe(goldenCorpusSuiteJson());
  });

  test(
    "tools/geometry-eval/fixtures/expected-outcomes.json equals the freshly computed suite run byte-for-byte",
    () => {
      const committed = readFileSync(OUTCOMES_PATH, "utf8");
      expect(committed).toBe(goldenOutcomesJson());
    },
    60000,
  );

  test("both artifacts are canonical (idempotent under the canonical JSON form)", () => {
    for (const path of [SCENARIO_PATH, OUTCOMES_PATH]) {
      const committed = readFileSync(path, "utf8");
      expect(canonicalJsonStringify(JSON.parse(committed))).toBe(committed);
    }
  });
});
