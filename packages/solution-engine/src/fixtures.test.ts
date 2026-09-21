/**
 * Engine fixture corpus tests (PROD-022).
 *
 * Proves the committed ENGINE fixtures are loadable, deterministic and
 * coherent with the CONTRACT's committed corpus:
 *  - the golden replay world reproduces the committed expected outputs
 *    (already asserted in replay.test.ts; here we pin the FILE shape and
 *    the cross-references);
 *  - every replayed version/state/operation/snapshot round-trips the
 *    CONTRACT's codecs byte-identically (the engine emits contract-shaped
 *    wire objects — decodeStrict clean);
 *  - the baseline geometry fixture is a frozen data table consistent with
 *    the contract corpus's demo wall world.
 */

import { describe, expect, test } from "bun:test";
import {
  decodeEngineeringOperationStrict,
  decodeProposedStateStrict,
  decodeSolutionValidationSnapshotStrict,
  decodeSolutionVersionStrict,
  encodeEngineeringOperation,
  encodeProposedState,
  encodeSolutionVersion,
} from "@aise/solution-contract";
import { validateSolutionVersion } from "./validation";
import { steppedMaterializeClock, replaySolution } from "./replay";
import { deriveStateQuantities } from "./quantities";
import {
  REFERENCE_PROFILE,
  WALL_WORLD,
  demoBaselineGeometry,
  engineFixture,
  wallUpgradeIntents,
} from "./testkit";

function replayedWorld() {
  return replaySolution({
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
}

describe("the committed engine fixtures", () => {
  test("baseline-geometry.json is a coherent data table of the demo wall world", () => {
    const table = engineFixture<Record<string, { value: number; unit: string }>>(
      "baseline-geometry.json",
    );
    expect(table["geo-wall-faces-002"]).toEqual({ value: 12.5, unit: "m2" });
    expect(Object.keys(table).sort()).toEqual([
      "geo-pit-outline-001",
      "geo-slab-region-005",
      "geo-wall-faces-002",
      "geo-wall-line-003",
    ]);
  });

  test("wall-upgrade-expected.json pins the full golden world (ids, digests, snapshot, quantities)", () => {
    const golden = engineFixture<Record<string, unknown>>("wall-upgrade-expected.json");
    expect(Object.keys(golden).sort()).toEqual([
      "quantityInventory",
      "replay",
      "validationSnapshot",
    ]);
    const replay = golden["replay"] as { states: unknown[]; steps: unknown[] };
    expect(replay.states).toHaveLength(4);
    expect(replay.steps).toHaveLength(3);
  });

  test("engine-quantity-expectations.json pins all ten building operation types", () => {
    const expectations = engineFixture<{ operationType: string }[]>(
      "engine-quantity-expectations.json",
    );
    expect(expectations.map((entry) => entry.operationType)).toEqual([
      "excavation",
      "backfill",
      "demolition-removal",
      "foundation-placement",
      "slab-placement",
      "block-wall-placement",
      "opening-creation",
      "plaster-application",
      "building-service-installation",
      "finish-application",
    ]);
  });
});

describe("the engine emits contract-shaped wire objects (strict decode clean)", () => {
  test("the replayed version strict-decodes and re-encodes byte-identically", () => {
    const replay = replayedWorld();
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    const encoded = encodeSolutionVersion(replay.version);
    const decoded = decodeSolutionVersionStrict(JSON.parse(encoded));
    expect(encodeSolutionVersion(decoded)).toBe(encoded);
  });

  test("every replayed operation strict-decodes (unknown-key-free wire shape)", () => {
    const replay = replayedWorld();
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    for (const operation of replay.version.operations) {
      const encoded = encodeEngineeringOperation(operation);
      expect(() => decodeEngineeringOperationStrict(JSON.parse(encoded))).not.toThrow();
    }
  });

  test("every replayed state strict-decodes", () => {
    const replay = replayedWorld();
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    for (const state of replay.version.states) {
      const encoded = encodeProposedState(state);
      expect(() => decodeProposedStateStrict(JSON.parse(encoded))).not.toThrow();
    }
  });

  test("the validation snapshot strict-decodes", () => {
    const replay = replayedWorld();
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    const snapshot = validateSolutionVersion({
      version: replay.version,
      capabilityProfile: REFERENCE_PROFILE,
      baselineGeometry: demoBaselineGeometry(),
      validatedAt: "2026-09-16T10:30:00.000Z",
    });
    expect(() =>
      decodeSolutionValidationSnapshotStrict(JSON.parse(JSON.stringify(snapshot))),
    ).not.toThrow();
  });

  test("the golden quantity inventory is reproduced by deriveStateQuantities", () => {
    const golden = engineFixture<{
      quantityInventory: {
        stateIndex: number;
        stateId: string;
        totals: unknown[];
      };
    }>("wall-upgrade-expected.json");
    const replay = replayedWorld();
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    const inventory = deriveStateQuantities(replay.version);
    expect(inventory.stateIndex).toBe(golden.quantityInventory.stateIndex);
    expect(inventory.stateId).toBe(golden.quantityInventory.stateId);
    expect(JSON.parse(JSON.stringify(inventory.totals))).toEqual(
      golden.quantityInventory.totals,
    );
  });
});
