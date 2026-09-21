/**
 * Building-operation quantity tests (PROD-022) — the quantity inventory.
 *
 * Proves the deterministic quantity calculus over the CONTRACT's committed
 * ten-intent building corpus (applied by REFERENCE):
 *  - every operation type derives its documented quantities with EXACT
 *    hand-computed values (formula → fixture → expected value);
 *  - the golden fixture `fixtures/engine-quantity-expectations.json`
 *    (committed) is reproduced identically;
 *  - units are explicit and canonical; calculationRefs name the model;
 *  - parameter traces carry the parameter values + units verbatim.
 */

import { describe, expect, test } from "bun:test";
import {
  applyOperation,
  type AppliedOperation,
} from "./apply";
import { deriveStateQuantities } from "./quantities";
import { replaySolution, steppedMaterializeClock } from "./replay";
import {
  REFERENCE_PROFILE,
  WALL_WORLD,
  contractIntent,
  demoBaselineGeometry,
  engineFixture,
  wallUpgradeIntents,
} from "./testkit";
import type { ProposedState, SolutionVersion } from "@aise/solution-contract";

interface QuantityExpectation {
  readonly intentFixture: string;
  readonly operationType: string;
  readonly quantities: {
    readonly label: string;
    readonly dimension: string;
    readonly value: number;
    readonly unit: string;
    readonly direction: string;
    readonly calculationRef: string;
  }[];
}

const EXPECTATIONS = engineFixture<QuantityExpectation[]>("engine-quantity-expectations.json");

function probeBaseline(): ProposedState {
  return {
    contractVersion: "1.0.0",
    stateId: "state-quantity-probe-baseline",
    solutionId: "solution-demo-001",
    versionNumber: 1,
    stateIndex: 0,
    baselineRealityVersionId: "rgv-demo-0007",
    epistemicStatus: "PROPOSED",
    appliedOperationIds: [],
    materializedAt: "2026-09-16T00:00:00.000Z",
  };
}

function applyIntent(name: string): AppliedOperation {
  const result = applyOperation({
    baseline: probeBaseline(),
    intent: contractIntent(name),
    capabilityProfile: REFERENCE_PROFILE,
    materializedAt: "2026-09-16T00:01:00.000Z",
    baselineGeometry: demoBaselineGeometry(),
  });
  expect(result.outcome).toBe("applied");
  if (result.outcome !== "applied") {
    throw new Error(`intent ${name} did not apply`);
  }
  return result;
}

describe("the building operation quantity inventory (formula → fixture → expected value)", () => {
  test("excavation: 1.5 m × 2 m × 3 m → 9 m3 removed + 6 m2 footprint removed", () => {
    const result = applyIntent("valid-excavation-direct");
    expect(result.quantities.map((q) => [q.label, q.value, q.unit, q.direction])).toEqual([
      ["excavated-soil-volume", 9, "m3", "removed"],
      ["excavation-footprint", 6, "m2", "removed"],
    ]);
  });

  test("backfill: 1.5 × 2 × 3 → 9 m3 added", () => {
    const result = applyIntent("valid-backfill");
    expect(result.quantities.map((q) => [q.label, q.value, q.unit, q.direction])).toEqual([
      ["backfill-volume", 9, "m3", "added"],
    ]);
  });

  test("demolition-removal: 5 × 2.4 × 0.1 → 1.2 m3 removed + 12 m2 face removed", () => {
    const result = applyIntent("valid-demolition-removal");
    expect(result.quantities.map((q) => [q.label, q.value, q.unit, q.direction])).toEqual([
      ["removed-volume", 1.2, "m3", "removed"],
      ["removed-face-area", 12, "m2", "removed"],
    ]);
  });

  test("foundation-placement: 5 × 0.6 × 0.5 → 1.5 m3 + 3 m2 added", () => {
    const result = applyIntent("valid-foundation-placement");
    expect(result.quantities.map((q) => [q.label, q.value, q.unit, q.direction])).toEqual([
      ["footing-volume", 1.5, "m3", "added"],
      ["footing-plan-area", 3, "m2", "added"],
    ]);
  });

  test("slab-placement: 4 × 3 × 0.15 → 1.8 m3 + 12 m2 added", () => {
    const result = applyIntent("valid-slab-placement");
    expect(result.quantities.map((q) => [q.label, q.value, q.unit, q.direction])).toEqual([
      ["slab-volume", 1.8, "m3", "added"],
      ["slab-plan-area", 12, "m2", "added"],
    ]);
  });

  test("block-wall-placement: 5 × 1 × 0.1 → 0.5 m3 + 5 m2 + 65 blocks (5 courses × 13 modules)", () => {
    const result = applyIntent("valid-block-wall-placement");
    expect(result.quantities.map((q) => [q.label, q.value, q.unit, q.direction])).toEqual([
      ["wall-volume", 0.5, "m3", "added"],
      ["wall-face-area", 5, "m2", "added"],
      ["block-count", 65, "count", "added"],
    ]);
  });

  test("opening-creation: 0.9 × 2.1 → 1.89 m2 removed + 1 opening added", () => {
    const result = applyIntent("valid-opening-creation");
    expect(result.quantities.map((q) => [q.label, q.value, q.unit, q.direction])).toEqual([
      ["opening-area", 1.89, "m2", "removed"],
      ["opening-count", 1, "count", "added"],
    ]);
  });

  test("plaster-application: 12.5 m2 resolved surface × 30 mm → 12.5 m2 + 0.375 m3 added", () => {
    const result = applyIntent("valid-plaster-application");
    expect(result.quantities.map((q) => [q.label, q.value, q.unit, q.direction])).toEqual([
      ["plaster-area", 12.5, "m2", "added"],
      ["plaster-volume", 0.375, "m3", "added"],
    ]);
  });

  test("building-service-installation: 12 m run + 1 run added", () => {
    const result = applyIntent("valid-building-service-installation");
    expect(result.quantities.map((q) => [q.label, q.value, q.unit, q.direction])).toEqual([
      ["service-run-length", 12, "m", "added"],
      ["service-run-count", 1, "count", "added"],
    ]);
  });

  test("finish-application: 12.5 m2 × 2 mm → 12.5 m2 + 0.025 m3 added", () => {
    const result = applyIntent("valid-finish-application");
    expect(result.quantities.map((q) => [q.label, q.value, q.unit, q.direction])).toEqual([
      ["finish-area", 12.5, "m2", "added"],
      ["finish-volume", 0.025, "m3", "added"],
    ]);
  });
});

describe("golden quantity fixtures (committed expected values, reproduced identically)", () => {
  test("the committed engine-quantity-expectations.json matches the corpus exactly", () => {
    expect(EXPECTATIONS).toHaveLength(10);
    for (const expectation of EXPECTATIONS) {
      const result = applyIntent(expectation.intentFixture);
      expect(result.operation.operationType).toBe(expectation.operationType);
      expect(
        JSON.parse(
          JSON.stringify(
            result.quantities.map((q) => ({
              label: q.label,
              dimension: q.dimension,
              value: q.value,
              unit: q.unit,
              direction: q.direction,
              calculationRef: q.calculationRef,
            })),
          ),
        ),
      ).toEqual(expectation.quantities);
    }
  });

  test("every quantity calculationRef names the engine kind + model version", () => {
    for (const expectation of EXPECTATIONS) {
      for (const quantity of expectation.quantities) {
        expect(quantity.calculationRef).toBe(
          `aise-solution-engine/quantity/${expectation.operationType}/v1`,
        );
      }
    }
  });
});

describe("the state-level quantity inventory (per-operation + totals, traced)", () => {
  function replayedVersion(): SolutionVersion {
    const replay = replaySolution({
      solutionId: WALL_WORLD.solutionId,
      projectId: WALL_WORLD.projectId,
      title: WALL_WORLD.title,
      problemStatement: WALL_WORLD.problemStatement,
      domain: WALL_WORLD.domain,
      baselineRealityVersionId: WALL_WORLD.baselineRealityVersionId,
      intents: wallUpgradeIntents(),
      capabilityProfile: REFERENCE_PROFILE,
      baselineGeometry: demoBaselineGeometry(),
      materializeClock: steppedMaterializeClock(WALL_WORLD.clockStartMs, WALL_WORLD.clockStepMs),
      createdAt: WALL_WORLD.createdAt,
    });
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      throw new Error("replay failed");
    }
    return replay.version;
  }

  test("the final state's inventory totals net removed/added per dimension+unit", () => {
    const inventory = deriveStateQuantities(replayedVersion());
    expect(inventory.stateIndex).toBe(3);
    expect(inventory.perOperation).toHaveLength(7); // 2 + 3 + 2 quantities
    const totals = inventory.totals.map((t) => [t.dimension, t.unit, t.netValue, t.addedValue, t.removedValue]);
    expect(totals).toContainEqual(["area", "m2", 5.5, 17.5, 12]);
    expect(totals).toContainEqual(["volume", "m3", -0.325, 0.875, 1.2]);
    expect(totals).toContainEqual(["count", "count", 65, 65, 0]);
  });

  test("every traced quantity carries the parameter values + units and the source state", () => {
    const inventory = deriveStateQuantities(replayedVersion());
    for (const entry of inventory.perOperation) {
      expect(entry.parameters.length).toBeGreaterThan(0);
      for (const parameter of entry.parameters) {
        if (typeof parameter.value === "number") {
          expect(typeof parameter.unit).toBe("string");
        }
      }
      expect(entry.calculationRef).toMatch(/^aise-solution-engine\/quantity\//);
      expect(entry.sourceStateId).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.operationId).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("an intermediate state's inventory reflects only the applied prefix", () => {
    const inventory = deriveStateQuantities(replayedVersion(), 1);
    expect(inventory.stateIndex).toBe(1);
    expect(inventory.perOperation).toHaveLength(2); // demolition only
    expect(inventory.totals.map((t) => [t.dimension, t.netValue])).toEqual([
      ["area", -12],
      ["volume", -1.2],
    ]);
  });

  test("the inventory is deterministic (two derivations produce identical output)", () => {
    const first = deriveStateQuantities(replayedVersion());
    const second = deriveStateQuantities(replayedVersion());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
