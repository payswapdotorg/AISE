/**
 * PROD-029 — the Layer-3 SUBSTITUTION BENCHMARK gate pickup (the
 * tools/building-benchmark convention): runs the pure check-runner over the
 * committed artifacts. Wired into the root `bun run verify` via `bun test`.
 *
 * The boundary matrix forbids tools → packages imports, so this test never
 * imports the harness — the LIVE leg (the freshly computed matrix equals
 * the committed fixture byte-for-byte) is the backend-side golden test
 * (`backend/api/src/solution-eval/golden.test.ts`), where the canonical
 * components can be imported.
 */

import { describe, expect, test } from "bun:test";
import {
  checkCanonicalForm,
  checkMatrixCompleteness,
  checkOutcomes,
  loadExpectedOutcomes,
  loadScenarioMatrix,
  outcomesDigest,
  runAllChecks,
} from "./runner";

describe("solution-eval benchmark: the committed substitution matrix", () => {
  test("the committed artifacts are in canonical form", () => {
    expect(checkCanonicalForm()).toEqual([]);
  });

  test("the matrix is complete: 4 seams × {equal, divergent}, closed vocabularies, lawful pairings", () => {
    const matrix = loadScenarioMatrix();
    expect(checkMatrixCompleteness(matrix)).toEqual([]);
    expect(matrix.scenarios).toHaveLength(8);
    expect(new Set(matrix.scenarios.map((scenario) => scenario.seam)).size).toBe(4);
  });

  test("every seam covers both the equal and the divergent substitution", () => {
    const matrix = loadScenarioMatrix();
    for (const seam of ["operation-compiler", "engine-execution", "validation", "boq-derivation"]) {
      const seamScenarios = matrix.scenarios.filter((scenario) => scenario.seam === seam);
      expect(seamScenarios).toHaveLength(2);
      expect(seamScenarios.filter((s) => s.expectation === "canonical-equality")).toHaveLength(1);
      expect(seamScenarios.filter((s) => s.expectation === "declared-divergence")).toHaveLength(1);
    }
  });

  test("the committed matrix is the committed scenario.json (the single source)", () => {
    const matrix = loadScenarioMatrix();
    expect(matrix.matrixId).toBe("layer3-substitution-matrix/1");
    expect(matrix.version).toBe("1.0.0");
  });
});

describe("solution-eval benchmark: the day-26/27 gates over the committed golden", () => {
  test("the day-26 gate: every equal substitution is PROVEN with zero divergent points", () => {
    const outcomes = loadExpectedOutcomes();
    const provenCells = outcomes.cells.filter((cell) => cell.verdict === "substitution-proven");
    expect(provenCells).toHaveLength(4);
    for (const cell of provenCells) {
      expect(cell.divergentPointCount).toBe(0);
      expect(cell.points.every((point) => point.equal)).toBe(true);
    }
  });

  test("the day-27 gate: every divergent substitution is CAUGHT with the declared closed-vocabulary kind", () => {
    const outcomes = loadExpectedOutcomes();
    const divergentCells = outcomes.cells.filter(
      (cell) => cell.verdict === "divergence-recorded",
    );
    expect(divergentCells).toHaveLength(4);
    const matrix = loadScenarioMatrix();
    for (const cell of divergentCells) {
      const scenario = matrix.scenarios.find((s) => s.scenarioId === cell.scenarioId);
      expect(scenario).toBeDefined();
      expect(cell.divergenceFailureKind).toBe(scenario?.expectedDivergenceKind);
      expect(cell.divergentPointCount).toBeGreaterThan(0);
    }
  });

  test("the recorded kinds are exactly the frozen taxonomy: identity/state/quantity → operation-semantic-failure; verdict → reasoning-failure", () => {
    const outcomes = loadExpectedOutcomes();
    const kinds = outcomes.cells
      .filter((cell) => cell.verdict === "divergence-recorded")
      .map((cell) => cell.divergenceFailureKind)
      .sort();
    expect(kinds).toEqual([
      "operation-semantic-failure",
      "operation-semantic-failure",
      "operation-semantic-failure",
      "reasoning-failure",
    ]);
  });

  test("the control-plane coherence: record/manifest ids are canonical digests and the event counts are lawful", () => {
    const matrix = loadScenarioMatrix();
    const outcomes = loadExpectedOutcomes();
    expect(checkOutcomes(matrix, outcomes)).toEqual([]);
  });

  test("the expectation gate: all 8 cells satisfy their declared expectation", () => {
    const outcomes = loadExpectedOutcomes();
    expect(outcomes.totals.expectationSatisfied).toBe(8);
    expect(outcomes.totals.refused).toBe(0);
  });
});

describe("solution-eval benchmark: the full runner", () => {
  test("the complete check-runner over the committed artifacts reports ZERO findings", () => {
    expect(runAllChecks()).toEqual([]);
  });

  test("the committed outcomes digest is stable across reads", () => {
    expect(outcomesDigest()).toBe(outcomesDigest());
    expect(outcomesDigest()).toMatch(/^[0-9a-f]{64}$/);
  });
});
