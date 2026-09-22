/**
 * PROD-029 golden tests — the LIVE matrix computation equals the COMMITTED
 * tools/solution-eval benchmark artifacts byte-for-byte (the
 * building-benchmark discipline: drift fails the root verify gate; the
 * regeneration entry is documented in the module README).
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonText } from "./fixtures";
import {
  readCommittedArtifactText,
  runCommittedMatrix,
  scenarioMatrixDocument,
  expectedOutcomesDocument,
} from "./testkit";

describe("solution-eval golden: the committed benchmark artifacts", () => {
  test("the committed scenario.json equals the live scenario-matrix serialization byte-for-byte", async () => {
    const committed = readCommittedArtifactText("scenario.json");
    const live = canonicalJsonText(scenarioMatrixDocument());
    expect(committed).toBe(live);
  });

  test("the committed expected-outcomes.json equals the live matrix-run serialization byte-for-byte", async () => {
    const committed = readCommittedArtifactText("fixtures/expected-outcomes.json");
    const result = await runCommittedMatrix();
    const live = canonicalJsonText(expectedOutcomesDocument(result));
    expect(committed).toBe(live);
  });

  test("the committed golden matrix proves 4 equal substitutions and catches 4 divergences", async () => {
    const result = await runCommittedMatrix();
    expect(result.totals).toEqual({
      scenarios: 8,
      proven: 4,
      divergenceRecorded: 4,
      refused: 0,
      expectationSatisfied: 8,
    });
    // every emitted record id and manifest id is a 64-hex canonical digest
    for (const cell of result.summaries) {
      expect(cell.benchmarkRecordId).toMatch(/^[0-9a-f]{64}$/);
      expect(cell.manifestId).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
