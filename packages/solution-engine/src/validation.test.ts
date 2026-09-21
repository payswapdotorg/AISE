/**
 * Deterministic validation tests (PROD-022).
 *
 * Proves the server-side `Validate` acceptance:
 *  - the snapshot is CONTRACT-SHAPED (worst-of outcome via the contract's
 *    own helper, invariant-clean, snapshotId via the contract's
 *    derivation) and byte-stable across runs;
 *  - the golden fixture snapshot is reproduced identically;
 *  - check semantics: dimensions-positive / units / ordering / calculation
 *    refs / capability-declared (honest unknown vs fail) / Phase 1 limits
 *    (review-needed on exceedance);
 *  - the inputDigest pins the exact validated version bytes;
 *  - a version with a hand-broken operation FAILS closed (negative cases).
 */

import { describe, expect, test } from "bun:test";
import {
  REFERENCE_PARTIAL_BUILDING_OPERATION_PROFILE,
  checkSolutionValidationSnapshot,
  decodeSolutionVersion,
  encodeSolutionVersion,
  type SolutionVersion,
} from "@aise/solution-contract";
import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { validateSolutionVersion } from "./validation";
import { steppedMaterializeClock } from "./replay";
import { replaySolution } from "./replay";
import {
  REFERENCE_PROFILE,
  WALL_WORLD,
  contractIntent,
  demoBaselineGeometry,
  engineFixture,
  wallUpgradeIntents,
} from "./testkit";

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

const VALIDATED_AT = "2026-09-16T10:30:00.000Z";

function validate(version: SolutionVersion, profile = REFERENCE_PROFILE) {
  return validateSolutionVersion({
    version,
    capabilityProfile: profile,
    baselineGeometry: demoBaselineGeometry(),
    validatedAt: VALIDATED_AT,
  });
}

describe("validation snapshots (deterministic, contract-shaped)", () => {
  test("the golden fixture snapshot is reproduced identically (ids, digest, checks)", () => {
    const golden = engineFixture<{
      validationSnapshot: {
        snapshotId: string;
        outcome: string;
        inputDigest: string;
        checks: { checkId: string; result: string }[];
      };
    }>("wall-upgrade-expected.json");
    const snapshot = validate(replayedVersion());
    expect(snapshot.snapshotId).toBe(golden.validationSnapshot.snapshotId);
    expect(snapshot.outcome).toBe(
      golden.validationSnapshot.outcome as typeof snapshot.outcome,
    );
    expect(snapshot.inputDigest).toBe(golden.validationSnapshot.inputDigest);
    expect(
      JSON.parse(
        JSON.stringify(snapshot.checks.map((c) => ({ checkId: c.checkId, result: c.result }))),
      ),
    ).toEqual(golden.validationSnapshot.checks);
  });

  test("two validations produce byte-identical snapshots (determinism)", () => {
    expect(canonicalJsonStringify(validate(replayedVersion()))).toBe(
      canonicalJsonStringify(validate(replayedVersion())),
    );
  });

  test("the snapshot passes the contract's own validation-snapshot invariants", () => {
    const snapshot = validate(replayedVersion());
    expect(checkSolutionValidationSnapshot(snapshot)).toEqual([]);
  });

  test("the outcome is the worst-of the checks via the CONTRACT helper", () => {
    const snapshot = validate(replayedVersion());
    expect(snapshot.outcome).toBe("pass");
    expect(snapshot.checks.length).toBeGreaterThanOrEqual(7);
    expect(snapshot.checks.every((check) => check.result === "pass")).toBe(true);
  });

  test("the inputDigest pins the exact canonical version bytes", () => {
    const version = replayedVersion();
    const snapshot = validate(version);
    const expected = createHash("sha256")
      .update(canonicalJsonStringify(version), "utf8")
      .digest("hex");
    expect(snapshot.inputDigest).toBe(expected);
    // ...and a DIFFERENT version produces a different digest + snapshot id
    const altered = decodeSolutionVersion(
      JSON.parse(encodeSolutionVersion(version)),
    );
    altered.operations[0]!.parameters[0] = {
      ...altered.operations[0]!.parameters[0]!,
      value: 5.5,
    };
    const alteredSnapshot = validate(altered);
    expect(alteredSnapshot.inputDigest).not.toBe(snapshot.inputDigest);
    expect(alteredSnapshot.snapshotId).not.toBe(snapshot.snapshotId);
  });

  test("validatedAt never participates in the snapshot identity", () => {
    const version = replayedVersion();
    const first = validateSolutionVersion({
      version,
      capabilityProfile: REFERENCE_PROFILE,
      validatedAt: "2020-01-01T00:00:00.000Z",
    });
    const second = validateSolutionVersion({
      version,
      capabilityProfile: REFERENCE_PROFILE,
      validatedAt: "2030-01-01T00:00:00.000Z",
    });
    expect(first.snapshotId).toBe(second.snapshotId);
    expect(first.validatedAt).not.toBe(second.validatedAt);
  });

  test("the engine identity is the deterministic solution engine", () => {
    const snapshot = validate(replayedVersion());
    expect(snapshot.engine.kind).toBe("aise-solution-engine");
    expect(snapshot.engine.version).toBe("1.0.0");
  });
});

describe("check semantics (the Phase 1 check inventory)", () => {
  test("non-positive dimensions FAIL geometry.dimensions-positive", () => {
    const version = replayedVersion();
    version.operations[0]!.parameters[0] = {
      name: "length",
      value: -5,
      unit: "m",
    };
    const snapshot = validate(version);
    const check = snapshot.checks.find((c) => c.checkId === "geometry.dimensions-positive");
    expect(check?.result).toBe("fail");
    expect(check?.detail).toContain("length");
    expect(snapshot.outcome).toBe("fail");
  });

  test("unknown units FAIL units.quantity-units-typed", () => {
    const version = replayedVersion();
    version.operations[0]!.parameters[0] = {
      name: "length",
      value: 5,
      unit: "parsecs",
    };
    const snapshot = validate(version);
    const check = snapshot.checks.find((c) => c.checkId === "units.quantity-units-typed");
    expect(check?.result).toBe("fail");
    expect(check?.detail).toContain("parsecs");
    expect(snapshot.outcome).toBe("fail");
  });

  test("a forward dependency edge FAILS operation.ordering-dependencies", () => {
    const version = replayedVersion();
    // op 1 gets a dependency on op 3 (a forward edge)
    version.operations[0] = {
      ...version.operations[0]!,
      dependsOn: [
        {
          contractVersion: "1.0.0",
          dependencyKind: "completion-before",
          operationRef: version.operations[2]!.operationId,
        },
      ],
    };
    const snapshot = validate(version);
    const check = snapshot.checks.find((c) => c.checkId === "operation.ordering-dependencies");
    expect(check?.result).toBe("fail");
    expect(snapshot.outcome).toBe("fail");
  });

  test("an undeclared operation type FAILS operation.capability-declared", () => {
    const version = replayedVersion();
    version.operations[1] = {
      ...version.operations[1]!,
      operationType: "trench-shoring",
    };
    const snapshot = validate(version);
    const check = snapshot.checks.find((c) => c.checkId === "operation.capability-declared");
    expect(check?.result).toBe("fail");
    expect(check?.detail).toContain("trench-shoring");
    expect(snapshot.outcome).toBe("fail");
  });

  test("an UNDETERMINED capability yields check result UNKNOWN — never fail, never conflated", () => {
    // the partial profile declares excavation capability unknown; build a
    // version whose only operation is an excavation
    const replay = replaySolution({
      solutionId: WALL_WORLD.solutionId,
      projectId: WALL_WORLD.projectId,
      title: "excavation-only probe",
      problemStatement: "probe",
      domain: WALL_WORLD.domain,
      baselineRealityVersionId: WALL_WORLD.baselineRealityVersionId,
      intents: [contractIntent("valid-excavation-direct")],
      capabilityProfile: REFERENCE_PROFILE,
      materializeClock: steppedMaterializeClock(WALL_WORLD.clockStartMs, WALL_WORLD.clockStepMs),
      createdAt: WALL_WORLD.createdAt,
    });
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    const snapshot = validate(replay.version, REFERENCE_PARTIAL_BUILDING_OPERATION_PROFILE);
    const check = snapshot.checks.find((c) => c.checkId === "operation.capability-declared");
    expect(check?.result).toBe("unknown");
    expect(snapshot.outcome).toBe("unknown");
  });

  test("an over-limit excavation yields REVIEW-NEEDED on operation.phase1-limits", () => {
    const replay = replaySolution({
      solutionId: WALL_WORLD.solutionId,
      projectId: WALL_WORLD.projectId,
      title: "deep excavation probe",
      problemStatement: "probe",
      domain: WALL_WORLD.domain,
      baselineRealityVersionId: WALL_WORLD.baselineRealityVersionId,
      intents: [
        {
          ...contractIntent("valid-excavation-direct"),
          parameters: [
            { name: "depth", value: 8, unit: "m" },
            { name: "width", value: 2, unit: "m" },
            { name: "length", value: 3, unit: "m" },
          ],
        },
      ],
      capabilityProfile: REFERENCE_PROFILE,
      materializeClock: steppedMaterializeClock(WALL_WORLD.clockStartMs, WALL_WORLD.clockStepMs),
      createdAt: WALL_WORLD.createdAt,
    });
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    const snapshot = validate(replay.version);
    const check = snapshot.checks.find((c) => c.checkId === "operation.phase1-limits");
    expect(check?.result).toBe("review-needed");
    expect(check?.detail).toContain("6 m");
    expect(snapshot.outcome).toBe("review-needed");
  });

  test("a quantity effect without a calculation reference FAILS quantities.calculation-refs", () => {
    const version = replayedVersion();
    const broken = structuredClone(version);
    broken.operations[0]!.effects[1] = {
      ...broken.operations[0]!.effects[1]!,
      quantity: {
        ...broken.operations[0]!.effects[1]!.quantity!,
        calculationRef: "",
      },
    };
    const snapshot = validate(broken);
    const check = snapshot.checks.find((c) => c.checkId === "quantities.calculation-refs");
    expect(check?.result).toBe("fail");
    expect(snapshot.outcome).toBe("fail");
  });

  test("a hand-broken state layer FAILS the contract-invariants check", () => {
    const version = replayedVersion();
    const broken = structuredClone(version);
    broken.states[1]!.appliedOperationIds = []; // index mismatch
    const snapshot = validate(broken);
    const check = snapshot.checks.find((c) => c.checkId === "operation.contract-invariants");
    expect(check?.result).toBe("fail");
    expect(check?.detail).toContain("proposed_state_index_mismatch");
    expect(snapshot.outcome).toBe("fail");
  });
});
