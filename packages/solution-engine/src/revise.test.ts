/**
 * Undo/revision tests (PROD-022).
 *
 * Proves "undo/revision via new versions rather than destructive mutation":
 *  - a revision produces a NEW SolutionVersion (parent linkage, +1 number)
 *    whose operation sequence EXCLUDES the reverted operation — the effect
 *    of the named prior transition is reverted;
 *  - the undo act is recorded as its own PROVENANCE-CARRYING transition
 *    (who, why, when, deterministic transition identity);
 *  - the INPUT version is consumed READ-ONLY — deep structural equality
 *    after the revision (destructive mutation of historical versions is
 *    structurally impossible: there is no API surface for it);
 *  - dependency edges pointing at the reverted operation are DROPPED (no
 *    dangling references);
 *  - terminal versions / unknown revert targets / non-appendable inputs
 *    are typed refusals;
 *  - the revision is DETERMINISTIC (identical inputs rebuild the identical
 *    new version) and the new version re-validates cleanly.
 */

import { describe, expect, test } from "bun:test";
import {
  encodeSolutionVersion,
  type SolutionVersion,
} from "@aise/solution-contract";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { reviseVersion } from "./revise";
import { steppedMaterializeClock } from "./replay";
import { replaySolution } from "./replay";
import { validateSolutionVersion } from "./validation";
import {
  REFERENCE_PROFILE,
  WALL_WORLD,
  contractIntent,
  deepClone,
  demoBaselineGeometry,
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

const REVISION_INPUT = {
  createdAt: "2026-09-16T11:00:00.000Z",
  materializeClock: steppedMaterializeClock(Date.UTC(2026, 8, 16, 11, 0, 0, 0), 60_000),
  revisionProvenance: {
    authoredBy: "user-demo-engineer",
    reason: "the block-wall step was dimensioned incorrectly; revert and redo",
    authoredAt: "2026-09-16T10:45:00.000Z",
  },
} as const;

function revise(
  version: SolutionVersion,
  revertOperationId: string,
): ReturnType<typeof reviseVersion> {
  return reviseVersion({
    version,
    revertOperationId,
    capabilityProfile: REFERENCE_PROFILE,
    baselineGeometry: demoBaselineGeometry(),
    ...REVISION_INPUT,
  });
}

describe("undo semantics (revision via a NEW version)", () => {
  test("reverting the block-wall step produces version 2 without it, with parent lineage", () => {
    const version = replayedVersion();
    const blockWall = version.operations[1]!;
    const result = revise(version, blockWall.operationId);
    expect(result.outcome).toBe("revised");
    if (result.outcome !== "revised") {
      return;
    }
    expect(result.newVersion.versionNumber).toBe(2);
    expect(result.newVersion.parentVersionNumber).toBe(1);
    expect(result.newVersion.status).toBe("draft");
    expect(result.newVersion.operations).toHaveLength(2);
    expect(
      result.newVersion.operations.map((operation) => operation.operationType),
    ).toEqual(["demolition-removal", "plaster-application"]);
    // the state chain is rebuilt: 2 operations → 3 states (layer 0 + 2)
    expect(result.newVersion.states).toHaveLength(3);
    expect(result.newVersion.states[2]?.appliedOperationIds).toHaveLength(2);
  });

  test("the undo act is its own provenance-carrying transition with a deterministic identity", () => {
    const version = replayedVersion();
    const target = version.operations[2]!;
    const result = revise(version, target.operationId);
    expect(result.outcome).toBe("revised");
    if (result.outcome !== "revised") {
      return;
    }
    expect(result.revision.kind).toBe("undo");
    expect(result.revision.transitionId).toMatch(/^[0-9a-f]{64}$/);
    expect(result.revision.revertedOperationId).toBe(target.operationId);
    expect(result.revision.revertedOperationIndex).toBe(3);
    expect(result.revision.revertedOperationType).toBe("plaster-application");
    expect(result.revision.authoredBy).toBe("user-demo-engineer");
    expect(result.revision.reason).toContain("revert");
    expect(result.revision.appliedAt).toBe("2026-09-16T10:45:00.000Z");
    expect(result.revision.parentVersionNumber).toBe(1);
    expect(result.revision.newVersionNumber).toBe(2);
  });

  test("the INPUT version is consumed READ-ONLY (deep structural equality + identical bytes)", () => {
    const version = replayedVersion();
    const snapshot = deepClone(version);
    const bytes = encodeSolutionVersion(version);
    const target = version.operations[0]!;
    const result = revise(version, target.operationId);
    expect(result.outcome).toBe("revised");
    expect(version).toEqual(snapshot);
    expect(encodeSolutionVersion(version)).toBe(bytes);
  });

  test("the revision is DETERMINISTIC (identical inputs rebuild the identical new version)", () => {
    const version = replayedVersion();
    const target = version.operations[1]!;
    const first = revise(version, target.operationId);
    const second = revise(version, target.operationId);
    expect(first.outcome).toBe("revised");
    expect(second.outcome).toBe("revised");
    if (first.outcome !== "revised" || second.outcome !== "revised") {
      return;
    }
    expect(encodeSolutionVersion(first.newVersion)).toBe(
      encodeSolutionVersion(second.newVersion),
    );
    expect(first.revision.transitionId).toBe(second.revision.transitionId);
  });

  test("the kept operations preserve their ORIGINAL provenance verbatim", () => {
    const version = replayedVersion();
    const target = version.operations[1]!;
    const result = revise(version, target.operationId);
    expect(result.outcome).toBe("revised");
    if (result.outcome !== "revised") {
      return;
    }
    const demolition = result.newVersion.operations[0]!;
    expect(demolition.provenance.authoredBy).toBe("user-demo-engineer");
    expect(demolition.provenance.origin).toBe("direct-manipulation");
    expect(demolition.provenance.intentRef).toBe("intent-demo-0010");
    const plaster = result.newVersion.operations[1]!;
    expect(plaster.provenance.commandText).toBe(
      "Apply 30 mm plaster to the affected wall faces.",
    );
  });

  test("the rebuilt version re-validates cleanly (it is a fresh draft)", () => {
    const version = replayedVersion();
    const target = version.operations[1]!;
    const result = revise(version, target.operationId);
    expect(result.outcome).toBe("revised");
    if (result.outcome !== "revised") {
      return;
    }
    const snapshot = validateSolutionVersion({
      version: result.newVersion,
      capabilityProfile: REFERENCE_PROFILE,
      validatedAt: "2026-09-16T12:00:00.000Z",
    });
    expect(snapshot.outcome).toBe("pass");
  });

  test("dependency edges pointing at the reverted operation are DROPPED (no dangling refs)", () => {
    // build a version where the plaster depends on the block wall
    const replay = replaySolution({
      solutionId: WALL_WORLD.solutionId,
      projectId: WALL_WORLD.projectId,
      title: WALL_WORLD.title,
      problemStatement: WALL_WORLD.problemStatement,
      domain: WALL_WORLD.domain,
      baselineRealityVersionId: WALL_WORLD.baselineRealityVersionId,
      intents: [
        contractIntent("valid-demolition-removal"),
        contractIntent("valid-block-wall-placement"),
        {
          ...contractIntent("valid-plaster-application"),
          dependsOn: [],
        },
      ],
      capabilityProfile: REFERENCE_PROFILE,
      baselineGeometry: demoBaselineGeometry(),
      materializeClock: steppedMaterializeClock(WALL_WORLD.clockStartMs, WALL_WORLD.clockStepMs),
      createdAt: WALL_WORLD.createdAt,
    });
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    // hand-attach a dependency of op3 on op2 (record level)
    const version = deepClone(replay.version);
    const blockWallId = version.operations[1]!.operationId;
    version.operations[2] = {
      ...version.operations[2]!,
      dependsOn: [
        {
          contractVersion: "1.0.0",
          dependencyKind: "completion-before",
          operationRef: blockWallId,
          rationale: "plaster applies to the rebuilt wall surface",
        },
      ],
    };
    const result = revise(version, blockWallId);
    expect(result.outcome).toBe("revised");
    if (result.outcome !== "revised") {
      return;
    }
    const plaster = result.newVersion.operations.find(
      (operation) => operation.operationType === "plaster-application",
    );
    expect(plaster?.dependsOn).toEqual([]);
  });
});

describe("undo refusals (fail closed)", () => {
  test("a TERMINAL version admits no revision (version_terminal)", () => {
    const version = replayedVersion();
    const superseded = deepClone(version);
    superseded.status = "superseded";
    const result = revise(superseded, superseded.operations[0]!.operationId);
    expect(result.outcome).toBe("invalid");
    if (result.outcome !== "invalid") {
      return;
    }
    expect(result.reasons.map((reason) => reason.code)).toEqual(["version_terminal"]);
  });

  test("an UNKNOWN revert target is refused (unknown_operation_to_revert)", () => {
    const version = replayedVersion();
    const result = revise(version, "op-that-does-not-exist");
    expect(result.outcome).toBe("invalid");
    if (result.outcome !== "invalid") {
      return;
    }
    expect(result.reasons.map((reason) => reason.code)).toEqual(["unknown_operation_to_revert"]);
    expect(result.reasons[0]?.detail).toContain("op-that-does-not-exist");
  });

  test("the full undo chain: reverting step 1 then re-revising keeps append-only lineage", () => {
    const version = replayedVersion();
    const first = revise(version, version.operations[2]!.operationId);
    expect(first.outcome).toBe("revised");
    if (first.outcome !== "revised") {
      return;
    }
    const second = reviseVersion({
      version: first.newVersion,
      revertOperationId: first.newVersion.operations[0]!.operationId,
      capabilityProfile: REFERENCE_PROFILE,
      baselineGeometry: demoBaselineGeometry(),
      ...REVISION_INPUT,
    });
    expect(second.outcome).toBe("revised");
    if (second.outcome !== "revised") {
      return;
    }
    expect(second.newVersion.versionNumber).toBe(3);
    expect(second.newVersion.parentVersionNumber).toBe(2);
    expect(second.newVersion.operations).toHaveLength(1);
    expect(
      canonicalJsonStringify(
        second.newVersion.operations.map((operation) => operation.operationId),
      ),
    ).not.toBe(
      canonicalJsonStringify(
        first.newVersion.operations.map((operation) => operation.operationId),
      ),
    );
  });
});
