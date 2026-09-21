/**
 * Deterministic replay tests (PROD-022).
 *
 * Proves the work order's determinism acceptance structurally:
 *  - identical inputs/operation sequences reproduce IDENTICAL proposed
 *    states and quantities — byte-identical CANONICAL serialization via
 *    the contract codecs (encodeSolutionVersion, encodeEngineeringOperation,
 *    encodeProposedState) and identical ENGINE identities;
 *  - the committed golden fixture (wall-upgrade-expected.json) is
 *    reproduced by replaying the contract's committed intent corpus;
 *  - REPLAY DISCRIMINATION: two runs whose intents differ ONLY in
 *    provenance metadata (author name, authoredAt instant, command text,
 *    derivation note) that does not participate in identity produce
 *    IDENTICAL engine identities (operation ids, state ids, digest chain,
 *    transition ids, effects, quantities) while PRESERVING their distinct
 *    provenance in the recorded operations;
 *  - a mid-sequence refusal FAILS THE REPLAY CLOSED at the named step
 *    with machine-readable reasons (never silently truncated);
 *  - replaying onto a NEW version number produces the append-only lineage
 *    and DIFFERENT version-pinned identities.
 *
 * Deterministic: no network, no clock reads, no randomness.
 */

import { describe, expect, test } from "bun:test";
import {
  encodeEngineeringOperation,
  encodeProposedState,
  encodeSolutionVersion,
  type EngineeringOperationIntent,
} from "@aise/solution-contract";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import {
  fixedMaterializeClock,
  replaySolution,
  steppedMaterializeClock,
  type ReplayInput,
} from "./replay";
import { REFERENCE_PROFILE, WALL_WORLD, contractIntent, demoBaselineGeometry, engineFixture, wallUpgradeIntents } from "./testkit";

function wallUpgradeInput(overrides?: Partial<ReplayInput>): ReplayInput {
  return {
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
    ...overrides,
  };
}

describe("replay determinism (identical inputs → identical states/quantities)", () => {
  test("two identical replays produce BYTE-IDENTICAL canonical version bytes", () => {
    const first = replaySolution(wallUpgradeInput());
    const second = replaySolution(wallUpgradeInput());
    expect(first.outcome).toBe("complete");
    expect(second.outcome).toBe("complete");
    if (first.outcome !== "complete" || second.outcome !== "complete") {
      return;
    }
    expect(encodeSolutionVersion(first.version)).toBe(encodeSolutionVersion(second.version));
    expect(encodeSolutionVersion(first.version)).toBe(encodeSolutionVersion(first.version));
    for (const [index, operation] of first.version.operations.entries()) {
      expect(encodeEngineeringOperation(operation)).toBe(
        encodeEngineeringOperation(second.version.operations[index] ?? operation),
      );
    }
    for (const [index, state] of first.version.states.entries()) {
      expect(encodeProposedState(state)).toBe(
        encodeProposedState(second.version.states[index] ?? state),
      );
    }
    expect(canonicalJsonStringify(first.steps)).toBe(canonicalJsonStringify(second.steps));
  });

  test("the materialization instant NEVER participates in identity (fixed vs stepped clock)", () => {
    const stepped = replaySolution(
      wallUpgradeInput({
        materializeClock: steppedMaterializeClock(WALL_WORLD.clockStartMs, WALL_WORLD.clockStepMs),
      }),
    );
    const fixed = replaySolution(
      wallUpgradeInput({ materializeClock: fixedMaterializeClock("2020-01-01T00:00:00.000Z") }),
    );
    expect(stepped.outcome).toBe("complete");
    expect(fixed.outcome).toBe("complete");
    if (stepped.outcome !== "complete" || fixed.outcome !== "complete") {
      return;
    }
    // identical ENGINE identities (state ids, digests, operation ids)...
    expect(fixed.version.states.map((state) => state.stateId)).toEqual(
      stepped.version.states.map((state) => state.stateId),
    );
    expect(fixed.version.states.map((state) => state.contentDigest)).toEqual(
      stepped.version.states.map((state) => state.contentDigest),
    );
    expect(fixed.version.operations.map((op) => op.operationId)).toEqual(
      stepped.version.operations.map((op) => op.operationId),
    );
    // ...but the materialization instants differ (provenance, not identity)
    expect(fixed.version.states[1]?.materializedAt).toBe("2020-01-01T00:00:00.000Z");
    expect(stepped.version.states[1]?.materializedAt).toBe("2026-09-16T10:01:00.000Z");
  });

  test("the committed golden fixture is reproduced exactly (states, operations, transitions, quantities)", () => {
    const golden = engineFixture<{
      replay: {
        states: { stateIndex: number; stateId: string; contentDigest: string; appliedOperationIds: string[]; materializedAt: string }[];
        operations: { operationIndex: number; operationId: string; operationType: string; intentRef: string; effectCount: number }[];
        steps: {
          stepIndex: number;
          intentId: string;
          operationId: string;
          transitionId: string;
          parentStateId: string;
          resultingStateId: string;
          limitsExceeded: number;
          quantities: { label: string; dimension: string; value: number; unit: string; direction: string; calculationRef: string; formula: string }[];
        }[];
      };
    }>("wall-upgrade-expected.json");
    const replay = replaySolution(wallUpgradeInput());
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    expect(
      replay.version.states.map((state) => ({
        stateIndex: state.stateIndex,
        stateId: state.stateId,
        contentDigest: state.contentDigest,
        appliedOperationIds: state.appliedOperationIds,
        materializedAt: state.materializedAt,
      })),
    ).toEqual(golden.replay.states);
    expect(
      replay.version.operations.map((operation) => ({
        operationIndex: operation.operationIndex,
        operationId: operation.operationId,
        operationType: operation.operationType,
        intentRef: operation.provenance.intentRef,
        effectCount: operation.effects.length,
      })),
    ).toEqual(golden.replay.operations);
    expect(
      JSON.parse(
        JSON.stringify(
          replay.steps.map((step) => ({
            stepIndex: step.stepIndex,
            intentId: step.intentId,
            operationId: step.applied.operation.operationId,
            transitionId: step.applied.lineage.transitionId,
            parentStateId: step.applied.lineage.parentStateId,
            resultingStateId: step.applied.lineage.resultingStateId,
            limitsExceeded: step.applied.limitsExceeded.length,
            quantities: step.applied.quantities.map((quantity) => ({
              label: quantity.label,
              dimension: quantity.dimension,
              value: quantity.value,
              unit: quantity.unit,
              direction: quantity.direction,
              calculationRef: quantity.calculationRef,
              formula: quantity.formula,
            })),
          })),
        ),
      ),
    ).toEqual(golden.replay.steps);
  });

  test("the replayed version satisfies the contract's own version invariants", async () => {
    const { checkSolutionVersion } = await import("@aise/solution-contract");
    const replay = replaySolution(wallUpgradeInput());
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    expect(checkSolutionVersion(replay.version)).toEqual([]);
  });

  test("replaying onto version 2 produces DIFFERENT version-pinned identities + parent lineage", () => {
    // The corpus intents pin proposedTo version 1 (fail-closed baseline
    // mismatch is proven elsewhere); the version-2 replay uses the same
    // SEMANTICS with the proposal context lifted (proposedTo is optional).
    const unpinned = wallUpgradeIntents().map((source) => {
      const { proposedTo, ...rest } = source;
      void proposedTo;
      return rest as EngineeringOperationIntent;
    });
    const first = replaySolution(wallUpgradeInput({ intents: unpinned }));
    const second = replaySolution(
      wallUpgradeInput({ intents: unpinned, versionNumber: 2, parentVersionNumber: 1 }),
    );
    expect(first.outcome).toBe("complete");
    expect(second.outcome).toBe("complete");
    if (first.outcome !== "complete" || second.outcome !== "complete") {
      return;
    }
    expect(second.version.versionNumber).toBe(2);
    expect(second.version.parentVersionNumber).toBe(1);
    expect(first.version.parentVersionNumber).toBeUndefined();
    expect(second.version.states[1]?.stateId).not.toBe(first.version.states[1]?.stateId);
    expect(second.version.operations[0]?.operationId).not.toBe(
      first.version.operations[0]?.operationId,
    );
  });

  test("an intent pinned to version 1 REFUSES to replay onto version 2 (no silent re-targeting)", () => {
    const replay = replaySolution(
      wallUpgradeInput({ versionNumber: 2, parentVersionNumber: 1 }),
    );
    expect(replay.outcome).toBe("failed");
    if (replay.outcome !== "failed") {
      return;
    }
    expect(replay.failedAtStep).toBe(1);
    expect(replay.failure.outcome).toBe("invalid");
    expect(replay.failure.reasons[0]?.code).toBe("baseline_mismatch");
  });
});

describe("replay discrimination (provenance metadata does not participate in identity)", () => {
  /** Rewrites ONLY the provenance metadata of the corpus intents. */
  function permutedIntents(): EngineeringOperationIntent[] {
    return wallUpgradeIntents().map((source, index) => ({
      ...source,
      intentId: `intent-permuted-${index}`,
      provenance: {
        ...source.provenance,
        authoredBy: index % 2 === 0 ? "user-someone-else" : "agent-another-assistant",
        authoredAt: "2030-01-01T00:00:00.000Z",
        commandText: "A completely different command text.",
        derivationNote: "a completely different derivation note",
      },
    }));
  }

  test("permuted provenance yields IDENTICAL engine identities, distinct recorded provenance", () => {
    const original = replaySolution(wallUpgradeInput());
    const permuted = replaySolution(wallUpgradeInput({ intents: permutedIntents() }));
    expect(original.outcome).toBe("complete");
    expect(permuted.outcome).toBe("complete");
    if (original.outcome !== "complete" || permuted.outcome !== "complete") {
      return;
    }
    // IDENTICAL engine identities:
    expect(permuted.version.operations.map((op) => op.operationId)).toEqual(
      original.version.operations.map((op) => op.operationId),
    );
    expect(permuted.version.states.map((state) => state.stateId)).toEqual(
      original.version.states.map((state) => state.stateId),
    );
    expect(permuted.version.states.map((state) => state.contentDigest)).toEqual(
      original.version.states.map((state) => state.contentDigest),
    );
    expect(permuted.steps.map((step) => step.applied.lineage.transitionId)).toEqual(
      original.steps.map((step) => step.applied.lineage.transitionId),
    );
    // IDENTICAL quantities and effects:
    expect(permuted.steps.map((step) => step.applied.quantities)).toEqual(
      original.steps.map((step) => step.applied.quantities),
    );
    expect(permuted.steps.map((step) => step.applied.effects)).toEqual(
      original.steps.map((step) => step.applied.effects),
    );
    // ...while the RECORDED provenance stays distinct (attribution preserved):
    expect(permuted.version.operations[0]?.provenance.authoredBy).toBe("user-someone-else");
    expect(permuted.version.operations[1]?.provenance.authoredBy).toBe("agent-another-assistant");
    expect(original.version.operations[0]?.provenance.authoredBy).toBe("user-demo-engineer");
  });

  test("the direct-manipulation and agent excavation intents replay identically (identity ignores origin)", () => {
    const direct = replaySolution(
      wallUpgradeInput({ intents: [contractIntent("valid-excavation-direct")] }),
    );
    const agent = replaySolution(
      wallUpgradeInput({ intents: [contractIntent("valid-excavation-agent")] }),
    );
    expect(direct.outcome).toBe("complete");
    expect(agent.outcome).toBe("complete");
    if (direct.outcome !== "complete" || agent.outcome !== "complete") {
      return;
    }
    expect(agent.version.operations[0]?.operationId).toBe(
      direct.version.operations[0]?.operationId,
    );
    expect(agent.version.states[1]?.stateId).toBe(direct.version.states[1]?.stateId);
    expect(agent.version.operations[0]?.provenance.origin).toBe("agent");
    expect(direct.version.operations[0]?.provenance.origin).toBe("direct-manipulation");
  });
});

describe("replay fail-closed (mid-sequence refusals are named, never truncated)", () => {
  test("an unsupported operation at step 2 fails the replay AT STEP 2 with reasons", () => {
    const replay = replaySolution(
      wallUpgradeInput({
        intents: [
          contractIntent("valid-demolition-removal"),
          contractIntent("valid-undeclared-operation-trench-shoring"),
          contractIntent("valid-plaster-application"),
        ],
      }),
    );
    expect(replay.outcome).toBe("failed");
    if (replay.outcome !== "failed") {
      return;
    }
    expect(replay.failedAtStep).toBe(2);
    expect(replay.failure.outcome).toBe("unsupported");
    expect(replay.failure.reasons[0]?.code).toBe("capability_unsupported");
    expect(replay.appliedSteps).toHaveLength(1);
    // the failure names the operation type honestly
    expect(replay.failure.negotiation.reasons[0]?.detail).toContain("trench-shoring");
  });

  test("a blocked operation (missing parameter) fails the replay with missing_required_parameter", () => {
    const replay = replaySolution(
      wallUpgradeInput({
        intents: [contractIntent("valid-blocked-missing-depth")],
      }),
    );
    expect(replay.outcome).toBe("failed");
    if (replay.outcome !== "failed") {
      return;
    }
    expect(replay.failedAtStep).toBe(1);
    expect(replay.failure.outcome).toBe("needs-input");
    expect(replay.failure.reasons[0]?.code).toBe("missing_required_parameter");
    expect(replay.failure.negotiation.missingParameters).toEqual(["depth"]);
  });

  test("a coated operation with an unresolvable surface fails the replay closed", () => {
    const unresolvablePlaster: EngineeringOperationIntent = {
      ...contractIntent("valid-plaster-application"),
      target: {
        ...contractIntent("valid-plaster-application").target,
        geometryRefs: [
          { kind: "polygon", ref: "geo-nonexistent-faces", contractVersion: "1.0.0" },
        ],
      },
    };
    const replay = replaySolution(wallUpgradeInput({ intents: [unresolvablePlaster] }));
    expect(replay.outcome).toBe("failed");
    if (replay.outcome !== "failed") {
      return;
    }
    expect(replay.failure.outcome).toBe("needs-input");
    expect(replay.failure.reasons[0]?.code).toBe("surface_area_unresolved");
  });
});

describe("solution container shape (the replay emits contract-shaped objects)", () => {
  test("the replayed solution carries the PROPOSED seal, pinned baseline and draft status", () => {
    const replay = replaySolution(wallUpgradeInput());
    expect(replay.outcome).toBe("complete");
    if (replay.outcome !== "complete") {
      return;
    }
    expect(replay.solution.epistemicClass).toBe("PROPOSED");
    expect(replay.solution.baselineRealityVersionId).toBe(WALL_WORLD.baselineRealityVersionId);
    expect(replay.solution.status).toBe("draft");
    expect(replay.version.status).toBe("draft");
    expect(replay.version.states.every((state) => state.epistemicStatus === "PROPOSED")).toBe(
      true,
    );
    expect(replay.version.states.every((state) => state.versionNumber === 1)).toBe(true);
  });
});
