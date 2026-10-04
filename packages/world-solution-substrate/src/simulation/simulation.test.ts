/**
 * WORLD-P0-C tests — the EXECUTION-SIMULATION family: deterministic 4D
 * typed transforms over the CANONICAL Solution Graph +
 * EngineeringOperation vocabulary. The fixtures are the REAL committed
 * solution-contract wire fixtures (decoded through the shared codec) —
 * the contract runs over the same records the Solution Graph stores.
 */

import { describe, expect, test } from "bun:test";
import {
  decodeEngineeringOperation,
  type EngineeringOperation,
} from "@aise/solution-contract";
import { loadCommittedFixtures } from "@aise/solution-contract/fixtures-loader";
import {
  AlternateSimulationDouble,
  ReferenceSimulationDouble,
  SIMULATION_FIXTURE_EPOCH,
  SIMULATION_FIXTURE_RECORDED_AT,
} from "./doubles";
import {
  completionBeforeCycleOf,
  simulationRequestViolations,
  type ActivityDurationDeclaration,
  type ExecutionSimulationAdapter,
  type ExecutionSimulationRequest,
  type ExecutionTrajectory,
} from "./contract";

/* ------------------------------------------------------------------ */
/* The canonical fixtures (committed solution-contract wire records)    */
/* ------------------------------------------------------------------ */

function committedOperations(): EngineeringOperation[] {
  const corpus = loadCommittedFixtures();
  const operations = corpus.fixtures
    .filter(
      (f) =>
        f.objectName === "EngineeringOperation" &&
        f.kind === "valid" &&
        f.fileName.startsWith("operation/"),
    )
    .map((f) => decodeEngineeringOperation(f.payload))
    .sort((a, b) => a.operationIndex - b.operationIndex);
  if (operations.length !== 3) {
    throw new Error(`expected the three committed valid operations, got ${operations.length}`);
  }
  return operations;
}

const DEMOLITION = "78be478643fcbb4aad1ba5e9165ab3382199c9165770f50b83a58c431096f2f9";
const BLOCK_WALL = "72ec9c913958934c4c10e4b2c1452676ca39f0c8ced106f328174dd0f024b699";
const PLASTER = "c5b25c38362e4a5af4a0ebe8597514f9c3a27cc7ab9da333d0fa7f543a78e7f2";

function canonicalDurations(): ActivityDurationDeclaration[] {
  return [
    { operationId: DEMOLITION, durationValue: 8, durationUnit: "hour" },
    { operationId: BLOCK_WALL, durationValue: 1, durationUnit: "day" },
    { operationId: PLASTER, durationValue: 16, durationUnit: "hour" },
  ];
}

function canonicalRequest(): ExecutionSimulationRequest {
  return {
    kind: "execution-simulation-request",
    schemaVersion: "execution-simulation-request/1",
    solutionId: "solution-demo-001",
    versionNumber: 1,
    operations: committedOperations(),
    baselineStateIndex: 0,
    durations: canonicalDurations(),
    clock: { epochIso: SIMULATION_FIXTURE_EPOCH, timeUnit: "hour" },
    recordedAt: SIMULATION_FIXTURE_RECORDED_AT,
  };
}

/** A clone of a canonical operation with fields patched (for negative tests). */
function patchedOperation(
  patch: Partial<EngineeringOperation>,
  index = 2,
): EngineeringOperation {
  const operations = committedOperations();
  const base = operations[index]!;
  return { ...base, ...patch } as EngineeringOperation;
}

/* ------------------------------------------------------------------ */
/* Canonical-input conformance (law 1)                                  */
/* ------------------------------------------------------------------ */

describe("simulation — canonical-input conformance", () => {
  test("the committed canonical operations decode through the shared wire codec", () => {
    const operations = committedOperations();
    expect(operations.map((o) => o.operationType)).toEqual([
      "demolition-removal",
      "block-wall-placement",
      "plaster-application",
    ]);
    expect(operations[1]?.dependsOn[0]?.dependencyKind).toBe("completion-before");
    expect(operations[1]?.dependsOn[0]?.operationRef).toBe(DEMOLITION);
  });

  test("the canonical request passes the structural law validators", () => {
    expect(simulationRequestViolations(canonicalRequest())).toEqual([]);
    expect(completionBeforeCycleOf(committedOperations())).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* The deterministic trajectory (laws 2 + 3 + 4)                        */
/* ------------------------------------------------------------------ */

describe("simulation — the deterministic trajectory", () => {
  test("the happy path: completion-before sequencing, day-unit conversion, makespan", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate(canonicalRequest());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const trajectory = outcome.value;
    // demolition: 0 → 8h; block-wall (depends on demolition): 8 → 32h (1 day = 24h);
    // plaster (depends on block-wall): 32 → 48h
    expect(trajectory.activities.map((a) => a.operationId)).toEqual([
      DEMOLITION,
      BLOCK_WALL,
      PLASTER,
    ]);
    expect(trajectory.activities[0]?.startHoursFromEpoch).toBe(0);
    expect(trajectory.activities[0]?.finishHoursFromEpoch).toBe(8);
    expect(trajectory.activities[1]?.startHoursFromEpoch).toBe(8);
    expect(trajectory.activities[1]?.finishHoursFromEpoch).toBe(32);
    expect(trajectory.activities[2]?.startHoursFromEpoch).toBe(32);
    expect(trajectory.activities[2]?.finishHoursFromEpoch).toBe(48);
    expect(trajectory.totalDurationHours).toBe(48);
    expect(trajectory.makespanHours).toBe(48);
    expect(trajectory.trajectoryId).toMatch(/^[0-9a-f]{64}$/);
    // the declared clock is carried verbatim (self-contained trajectory)
    expect(trajectory.clock.epochIso).toBe(SIMULATION_FIXTURE_EPOCH);
    expect(trajectory.clock.timeUnit).toBe("hour");
    // predecessor edges honored and recorded
    expect(trajectory.activities[1]?.predecessorOperationIds).toEqual([DEMOLITION]);
  });

  test("time-anchored world states follow the canonical state-chain semantics", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate(canonicalRequest());
    if (!outcome.ok) throw new Error("simulate failed");
    const states = outcome.value.worldStates;
    // boundaries: 0 (start), 8 (demolition done + block-wall start),
    // 32 (block-wall done + plaster start), 48 (all done)
    expect(states.map((s) => s.anchorHoursFromEpoch)).toEqual([0, 8, 32, 48]);
    expect(states[0]?.completedOperationIds).toEqual([]);
    expect(states[0]?.inProgressOperationIds).toEqual([DEMOLITION]);
    expect(states[0]?.pendingOperationIds).toEqual([BLOCK_WALL, PLASTER]);
    expect(states[0]?.stateIndex).toBe(0);
    // at t=8: demolition applied → the world is at proposed state layer 1
    expect(states[1]?.completedOperationIds).toEqual([DEMOLITION]);
    expect(states[1]?.inProgressOperationIds).toEqual([BLOCK_WALL]);
    expect(states[1]?.stateIndex).toBe(1);
    // at t=48: all three applied → state layer 3
    expect(states[3]?.completedOperationIds).toEqual([DEMOLITION, BLOCK_WALL, PLASTER]);
    expect(states[3]?.stateIndex).toBe(3);
    expect(states[3]?.inProgressOperationIds).toEqual([]);
  });

  test("state-precondition edges are recorded but do not schedule", () => {
    const operations = committedOperations();
    const withPrecondition: EngineeringOperation[] = [
      operations[0]!,
      operations[1]!,
      {
        ...operations[2]!,
        dependsOn: [
          {
            contractVersion: "1.0.0",
            dependencyKind: "state-precondition",
            operationRef: DEMOLITION,
            rationale: "the plaster needs the damaged section removed",
          },
        ],
      } as EngineeringOperation,
    ];
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate({
      ...canonicalRequest(),
      operations: withPrecondition,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const plaster = outcome.value.activities[2]!;
    expect(plaster.statePreconditionOperationIds).toEqual([DEMOLITION]);
    expect(plaster.predecessorOperationIds).toEqual([]);
    // no completion-before edge → plaster starts at t=0 (parallel)
    expect(plaster.startHoursFromEpoch).toBe(0);
  });

  test("parallel activities all start at the epoch and the makespan is the max finish", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate({
      ...canonicalRequest(),
      operations: committedOperations().map((o) =>
        ({ ...o, dependsOn: [] }) as EngineeringOperation,
      ),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    for (const activity of outcome.value.activities) {
      expect(activity.startHoursFromEpoch).toBe(0);
    }
    expect(outcome.value.makespanHours).toBe(24); // the 1-day block wall dominates
    expect(outcome.value.totalDurationHours).toBe(48);
    // at t=0 all three are in progress
    expect(outcome.value.worldStates[0]?.inProgressOperationIds).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ */
/* Fail-closed request discipline (law 6)                               */
/* ------------------------------------------------------------------ */

describe("simulation — fail-closed request discipline", () => {
  test("an operation without a declared duration is refused (the substrate never invents durations)", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate({
      ...canonicalRequest(),
      durations: canonicalDurations().slice(0, 2),
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("never invents durations");
    expect(outcome.failure.detail).toContain(PLASTER);
  });

  test("a duration for an unknown operation is refused", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate({
      ...canonicalRequest(),
      durations: [
        ...canonicalDurations(),
        { operationId: "unknown-op", durationValue: 1, durationUnit: "hour" },
      ],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.detail).toContain("unknown-op");
  });

  test("a non-positive duration is refused", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate({
      ...canonicalRequest(),
      durations: [
        { operationId: DEMOLITION, durationValue: 0, durationUnit: "hour" },
        ...canonicalDurations().slice(1),
      ],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.detail).toContain("strictly positive");
  });

  test("an out-of-vocabulary duration unit is refused", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate({
      ...canonicalRequest(),
      durations: [
        { operationId: DEMOLITION, durationValue: 1, durationUnit: "week" as never },
        ...canonicalDurations().slice(1),
      ],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.detail).toContain("minute | hour | day");
  });

  test("a cyclic completion-before graph is caught by the DAG tripwire (and refused through the port)", () => {
    // NOTE (honest law ordering): because dependencies must reference
    // EARLIER recorded operations, a request that reaches the DAG check
    // is acyclic by construction — the cycle detector is a DEFENSE-IN-DEPTH
    // tripwire for non-conforming inputs. It is exercised here directly
    // (the pure helper), and the port refuses a cyclic sequence through
    // the structural law (the forward edge is named).
    const cyclic = [
      {
        operationId: "op-a",
        operationIndex: 1,
        dependsOn: [{ dependencyKind: "completion-before" as const, operationRef: "op-c", contractVersion: "1.0.0", rationale: "" }],
      },
      {
        operationId: "op-b",
        operationIndex: 2,
        dependsOn: [{ dependencyKind: "completion-before" as const, operationRef: "op-a", contractVersion: "1.0.0", rationale: "" }],
      },
      {
        operationId: "op-c",
        operationIndex: 3,
        dependsOn: [{ dependencyKind: "completion-before" as const, operationRef: "op-b", contractVersion: "1.0.0", rationale: "" }],
      },
    ] as unknown as EngineeringOperation[];
    const cycle = completionBeforeCycleOf(cyclic);
    expect(cycle).not.toBeNull();
    expect(cycle).toHaveLength(4); // the closed walk op-a -> op-c -> op-b -> op-a
    // and the same shape through the port is refused (structurally: the
    // forward edges are named, contract-mismatch)
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate({ ...canonicalRequest(), operations: cyclic });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("EARLIER recorded operations");
  });

  test("a forward dependency (onto a later operation) is refused", () => {
    const forward: EngineeringOperation[] = [
      patchedOperation(
        {
          dependsOn: [
            {
              contractVersion: "1.0.0",
              dependencyKind: "completion-before",
              operationRef: BLOCK_WALL,
              rationale: "forward edge",
            },
          ],
        },
        0,
      ),
      committedOperations()[1]!,
      committedOperations()[2]!,
    ];
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate({
      ...canonicalRequest(),
      operations: forward,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.detail).toContain("EARLIER recorded operations");
  });

  test("an unknown dependency target is refused", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate({
      ...canonicalRequest(),
      operations: [
        patchedOperation(
          {
            dependsOn: [
              {
                contractVersion: "1.0.0",
                dependencyKind: "completion-before",
                operationRef: "missing-operation",
                rationale: "dangling edge",
              },
            ],
          },
          0,
        ),
      ],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.detail).toContain("missing-operation");
  });

  test("a version-context mismatch is refused (one coherent solution version per request)", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate({
      ...canonicalRequest(),
      operations: [patchedOperation({ solutionId: "solution-other-999" }, 0)],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.detail).toContain("solution-other-999");
  });

  test("a non-canonical operationIndex sequence is refused", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate({
      ...canonicalRequest(),
      operations: [patchedOperation({ operationIndex: 7 }, 0)],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.detail).toContain("canonical 1..N sequence");
  });

  test("an empty operation sequence and a malformed clock are refused", () => {
    const adapter = new ReferenceSimulationDouble();
    const empty = adapter.simulate({ ...canonicalRequest(), operations: [] });
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.failure.detail).toContain("operation sequence must not be empty");

    const badClock = adapter.simulate({
      ...canonicalRequest(),
      clock: { epochIso: "not-an-instant", timeUnit: "hour" },
    });
    expect(badClock.ok).toBe(false);
    if (badClock.ok) return;
    expect(badClock.failure.detail).toContain("epochIso");
  });
});

/* ------------------------------------------------------------------ */
/* Simulated-progress capture (law 5 — feeds the Outcome lane)          */
/* ------------------------------------------------------------------ */

describe("simulation — simulated-progress capture", () => {
  function simulateCanonical(adapter: ExecutionSimulationAdapter): ExecutionTrajectory {
    const outcome = adapter.simulate(canonicalRequest());
    if (!outcome.ok) throw new Error(`simulate failed: ${outcome.failure.detail}`);
    return outcome.value;
  }

  test("a capture mid-flight is deterministic and PROPOSED", () => {
    const adapter = new ReferenceSimulationDouble();
    const trajectory = simulateCanonical(adapter);
    // epoch 2026-10-05T08:00Z + 16h = 2026-10-06T00:00Z → demolition done
    // (8h), block-wall 8 of its 24h done
    const asOf = "2026-10-06T00:00:00.000Z";
    const capture = adapter.captureProgress(trajectory, asOf);
    expect(capture.ok).toBe(true);
    if (!capture.ok) return;
    // planned completion: (8 + 8) / 48 = 1/3
    expect(capture.value.plannedPercentComplete).toBe(1 / 3);
    expect(capture.value.completedOperationIds).toEqual([DEMOLITION]);
    expect(capture.value.inProgressOperationIds).toEqual([BLOCK_WALL]);
    expect(capture.value.pendingOperationIds).toEqual([PLASTER]);
    expect(capture.value.epistemicStatus).toBe("PROPOSED");
    expect(capture.value.captureId).toMatch(/^[0-9a-f]{64}$/);
    expect(capture.value.simulationProvenance.providerId).toBe(
      "solution-substrate.simulation.reference-double",
    );
  });

  test("a capture after the makespan is 100% complete; before the epoch 0%", () => {
    const adapter = new ReferenceSimulationDouble();
    const trajectory = simulateCanonical(adapter);
    const after = adapter.captureProgress(trajectory, "2026-10-08T00:00:00.000Z");
    expect(after.ok).toBe(true);
    if (after.ok) {
      expect(after.value.plannedPercentComplete).toBe(1);
      expect(after.value.completedOperationIds).toHaveLength(3);
    }
    const before = adapter.captureProgress(trajectory, "2026-10-04T00:00:00.000Z");
    expect(before.ok).toBe(true);
    if (before.ok) {
      expect(before.value.plannedPercentComplete).toBe(0);
      expect(before.value.pendingOperationIds).toHaveLength(3);
    }
  });

  test("a malformed as-of instant is refused", () => {
    const adapter = new ReferenceSimulationDouble();
    const trajectory = simulateCanonical(adapter);
    const outcome = adapter.captureProgress(trajectory, "2026-10-05 08:00");
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.failure.kind).toBe("contract-mismatch");
    expect(outcome.failure.detail).toContain("asOfIso");
  });

  test("identical captures are byte-identical (content-addressed capture ids)", () => {
    const adapter = new ReferenceSimulationDouble();
    const trajectory = simulateCanonical(adapter);
    const c1 = adapter.captureProgress(trajectory, "2026-10-06T00:00:00.000Z");
    const c2 = adapter.captureProgress(trajectory, "2026-10-06T00:00:00.000Z");
    if (!c1.ok || !c2.ok) throw new Error("capture failed");
    expect(c1.value.captureId).toBe(c2.value.captureId);
    expect(c1.value).toEqual(c2.value);
  });
});

/* ------------------------------------------------------------------ */
/* No write-back (the authority law) + non-interference                 */
/* ------------------------------------------------------------------ */

describe("simulation — the authority law (no write-back)", () => {
  test("simulate never mutates the request's canonical operations", () => {
    const adapter = new ReferenceSimulationDouble();
    const request = canonicalRequest();
    const before = JSON.stringify(request.operations.map((o) => [o.operationId, o.operationIndex, o.dependsOn]));
    const outcome = adapter.simulate(request);
    expect(outcome.ok).toBe(true);
    const after = JSON.stringify(request.operations.map((o) => [o.operationId, o.operationIndex, o.dependsOn]));
    expect(after).toBe(before);
    // the frozen request resists in-place sabotage
    expect(() => {
      (request.operations[0] as { operationId: string }).operationId = "sabotaged";
    }).toThrow();
  });

  test("the trajectory references operation ids VERBATIM — it invents no operations", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate(canonicalRequest());
    if (!outcome.ok) throw new Error("simulate failed");
    const known = new Set(outcome.value.activities.map((a) => a.operationId));
    expect(known.has(DEMOLITION)).toBe(true);
    expect(known.has(BLOCK_WALL)).toBe(true);
    expect(known.has(PLASTER)).toBe(true);
    // the trajectory has no field that could carry a NEW operation
    const activityFieldNames = Object.keys(outcome.value.activities[0]!).sort();
    expect(activityFieldNames).toEqual([
      "durationHours",
      "finishHoursFromEpoch",
      "operationId",
      "operationIndex",
      "operationType",
      "predecessorOperationIds",
      "startHoursFromEpoch",
      "statePreconditionOperationIds",
    ]);
  });

  test("the epistemic law is structural: PROPOSED is the only representable status", () => {
    const adapter = new ReferenceSimulationDouble();
    const outcome = adapter.simulate(canonicalRequest());
    if (!outcome.ok) throw new Error("simulate failed");
    const capture = adapter.captureProgress(outcome.value, "2026-10-06T00:00:00.000Z");
    if (!capture.ok) throw new Error("capture failed");
    // the literal type admits only "PROPOSED" — CONFIRMED is unrepresentable
    const status: "PROPOSED" = capture.value.epistemicStatus;
    expect(status).toBe("PROPOSED");
  });
});

/* ------------------------------------------------------------------ */
/* Substitution equivalence (law 1) + determinism                       */
/* ------------------------------------------------------------------ */

describe("simulation — substitution equivalence + determinism", () => {
  test("the reference and alternate doubles produce byte-identical trajectories", () => {
    const reference = new ReferenceSimulationDouble();
    const alternate = new AlternateSimulationDouble();
    const a = reference.simulate(canonicalRequest());
    const b = alternate.simulate(canonicalRequest());
    if (!a.ok || !b.ok) throw new Error("simulate failed");
    expect(a.value.trajectoryId).toBe(b.value.trajectoryId);
    expect(a.value.activities).toEqual(b.value.activities);
    expect(a.value.worldStates).toEqual(b.value.worldStates);
    expect(a.value.totalDurationHours).toBe(b.value.totalDurationHours);
    expect(a.value.makespanHours).toBe(b.value.makespanHours);
    expect(a.value.clock).toEqual(b.value.clock);
    // only the provider identity differs
    expect(a.value.provenance.providerId).not.toBe(b.value.provenance.providerId);
  });

  test("the two doubles produce byte-identical captures", () => {
    const reference = new ReferenceSimulationDouble();
    const alternate = new AlternateSimulationDouble();
    const a = reference.simulate(canonicalRequest());
    const b = alternate.simulate(canonicalRequest());
    if (!a.ok || !b.ok) throw new Error("simulate failed");
    const ca = reference.captureProgress(a.value, "2026-10-06T00:00:00.000Z");
    const cb = alternate.captureProgress(b.value, "2026-10-06T00:00:00.000Z");
    if (!ca.ok || !cb.ok) throw new Error("capture failed");
    expect(ca.value.captureId).toBe(cb.value.captureId);
    expect(ca.value.plannedPercentComplete).toBe(cb.value.plannedPercentComplete);
    expect(ca.value.completedOperationIds).toEqual(cb.value.completedOperationIds);
  });

  test("identical requests re-simulate to the identical trajectory id (determinism)", () => {
    const adapter = new ReferenceSimulationDouble();
    const a = adapter.simulate(canonicalRequest());
    const b = adapter.simulate(canonicalRequest());
    if (!a.ok || !b.ok) throw new Error("simulate failed");
    expect(a.value.trajectoryId).toBe(b.value.trajectoryId);
    expect(a.value.worldStates).toEqual(b.value.worldStates);
  });

  test("both doubles refuse identically on the same law violation", () => {
    const reference = new ReferenceSimulationDouble();
    const alternate = new AlternateSimulationDouble();
    const badRequest: ExecutionSimulationRequest = {
      ...canonicalRequest(),
      durations: [],
    };
    const a = reference.simulate(badRequest);
    const b = alternate.simulate(badRequest);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (a.ok || b.ok) return;
    expect(a.failure.kind).toBe(b.failure.kind);
    expect(a.failure.detail).toBe(b.failure.detail);
  });
});
