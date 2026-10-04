/**
 * WORLD-P0-C — the EXECUTION-SIMULATION substitution DOUBLES (`src/simulation/`).
 *
 * Two INDEPENDENT in-memory providers of the
 * `ExecutionSimulationAdapter` port — the substitution proof that the
 * 4D/execution-simulation contract is implementable WITHOUT any
 * simulation substrate (no SYNCHRO-class engine, no scheduling solver):
 *
 *  - `ReferenceSimulationDouble` — DIRECT boundary-set iteration: the
 *    distinct activity boundary hours (every start and every finish)
 *    are collected into a sorted set; each boundary t yields a
 *    world-state snapshot classified directly from the activity
 *    intervals (completed: finish ≤ t; in-progress: start ≤ t <
 *    finish; pending: start > t);
 *  - `AlternateSimulationDouble` — GROUPED EVENT SWEEP: the same
 *    request compiles into start/finish events, which are grouped per
 *    boundary hour and applied to running sets (started/completed);
 *    the snapshot is accumulated from the sets after each group — an
 *    independent code path that must produce the byte-identical
 *    trajectory.
 *
 * Both compute the SAME canonical transform and MUST agree bit-for-bit
 * at every comparison point (activity times, world-state snapshots,
 * makespan, total duration, trajectoryId, capture content) — only the
 * provenance's provider identity differs, exactly as a real
 * execution-simulation engine and an alternative implementation would.
 *
 * EXACTNESS DISCIPLINE: the fixture durations are chosen so the
 * hour-converted values and their sums are exact in IEEE-754 double
 * arithmetic (whole hours and days; minutes avoided in the committed
 * fixture — the conversion table is still exercised by the tests).
 *
 * HONESTY OF THE DOUBLES (no fabrication):
 *
 *  - the doubles validate ALL the family laws BEFORE computing
 *    (canonical coherence, declared durations, DAG discipline,
 *    declared clock) — fail-closed;
 *  - there is NO write-back: no double method touches the request's
 *    operations (deep-frozen at the governed entry; a sabotage test
 *    proves it);
 *  - captures enter as PROPOSED (structural — the type admits nothing
 *    else) with simulation provenance;
 *  - no clock reads: every instant is a declared input; the capture
 *    converts `asOfIso` through the trajectory's CARRIED declared
 *    clock (self-contained — no hidden registry, no sensed time).
 */

import type { EngineeringOperation } from "@aise/solution-contract";
import {
  SOLUTION_LANE_STATEMENT,
  SIMULATED_PROGRESS_EPISTEMIC_STATUS,
  canonicalDigestOf,
  deepFreeze,
  refused,
  type SolutionSubstrateFamily,
  type SubstrateOutcome,
  type SubstrateProviderDescriptor,
  type SubstrateResultProvenance,
} from "../seam";
import {
  DURATION_UNIT_TO_HOURS,
  TRAJECTORY_KIND,
  TRAJECTORY_SCHEMA_VERSION,
  completionBeforeCycleOf,
  hoursBetween,
  simulationRequestViolations,
  type ActivityDurationDeclaration,
  type ExecutionSimulationAdapter,
  type ExecutionSimulationCapabilities,
  type ExecutionSimulationRequest,
  type ExecutionTrajectory,
  type SimulatedActivity,
  type SimulatedProgressCapture,
  type TimeAnchoredWorldState,
} from "./contract";

const FAMILY: SolutionSubstrateFamily = "simulation";

/* ------------------------------------------------------------------ */
/* The two provider descriptors                                         */
/* ------------------------------------------------------------------ */

/** The reference simulation double's port-occupant identity. */
export const REFERENCE_SIMULATION_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "solution-substrate.simulation.reference-double",
  family: "simulation",
  technologyVersion: "simulation-reference-double/1.0.0",
  engineNote:
    "in-memory substitution double — direct deterministic boundary-set iteration over " +
    "the canonical operation sequence; NO simulation substrate integrated (P0 defines " +
    "contracts; a real execution-simulation engine is a future occupant). The " +
    "canonical Solution Graph stays the only authority.",
  laneStatement: SOLUTION_LANE_STATEMENT,
};

/** The alternate simulation double's port-occupant identity (independent code path). */
export const ALTERNATE_SIMULATION_DOUBLE_DESCRIPTOR: SubstrateProviderDescriptor = {
  providerId: "solution-substrate.simulation.alternate-double",
  family: "simulation",
  technologyVersion: "simulation-alternate-double/1.0.0",
  engineNote:
    "in-memory substitution double — grouped event sweep over the same canonical " +
    "operation sequence; NO simulation substrate integrated (P0 defines contracts; " +
    "a real execution-simulation engine is a future occupant). The canonical " +
    "Solution Graph stays the only authority.",
  laneStatement: SOLUTION_LANE_STATEMENT,
};

/* ------------------------------------------------------------------ */
/* Shared helpers (the canonical transform content)                     */
/* ------------------------------------------------------------------ */

/** The canonical activity list computation (shared semantic content). */
function activitiesOf(
  operations: readonly EngineeringOperation[],
  durations: readonly ActivityDurationDeclaration[],
): SimulatedActivity[] {
  const durationByOperation = new Map(durations.map((d) => [d.operationId, d] as const));
  const finishByOperation = new Map<string, number>();
  const activities: SimulatedActivity[] = [];
  for (const operation of operations) {
    const declared = durationByOperation.get(operation.operationId);
    // (validated: every operation has a declared duration — the guard is structural)
    const durationHours =
      declared === undefined ? 0 : declared.durationValue * DURATION_UNIT_TO_HOURS[declared.durationUnit];
    const predecessors: string[] = [];
    const statePreconditions: string[] = [];
    for (const dependency of operation.dependsOn) {
      if (dependency.dependencyKind === "completion-before") {
        predecessors.push(dependency.operationRef);
      } else {
        statePreconditions.push(dependency.operationRef);
      }
    }
    let start = 0;
    for (const predecessor of predecessors) {
      const finish = finishByOperation.get(predecessor);
      if (finish !== undefined && finish > start) {
        start = finish;
      }
    }
    const finish = start + durationHours;
    finishByOperation.set(operation.operationId, finish);
    activities.push({
      operationId: operation.operationId,
      operationIndex: operation.operationIndex,
      operationType: operation.operationType,
      startHoursFromEpoch: start,
      finishHoursFromEpoch: finish,
      durationHours,
      predecessorOperationIds: predecessors,
      statePreconditionOperationIds: statePreconditions,
    });
  }
  return activities;
}

/** The canonical trajectory content (everything except provenance). */
function trajectoryContentOf(
  request: ExecutionSimulationRequest,
  activities: readonly SimulatedActivity[],
  worldStates: readonly TimeAnchoredWorldState[],
): {
  trajectoryId: string;
  totalDurationHours: number;
  makespanHours: number;
} {
  const totalDurationHours = activities.reduce((sum, a) => sum + a.durationHours, 0);
  const makespanHours = activities.reduce((max, a) => Math.max(max, a.finishHoursFromEpoch), 0);
  const trajectoryId = canonicalDigestOf({
    kind: TRAJECTORY_KIND,
    solutionId: request.solutionId,
    versionNumber: request.versionNumber,
    baselineStateIndex: request.baselineStateIndex,
    activities,
    worldStates,
    clock: request.clock,
  });
  return { trajectoryId, totalDurationHours, makespanHours };
}

/** Simulation provenance for a request (provider identity + digests). */
function simulationProvenanceOf(
  descriptor: SubstrateProviderDescriptor,
  request: ExecutionSimulationRequest,
): SubstrateResultProvenance {
  return {
    providerId: descriptor.providerId,
    technologyVersion: descriptor.technologyVersion,
    providerDescriptorDigest: canonicalDigestOf(descriptor),
    inputDigest: canonicalDigestOf({
      operations: request.operations.map((o) => o.operationId),
      durations: request.durations,
      clock: request.clock,
      baselineStateIndex: request.baselineStateIndex,
    }),
    parametersDigest: canonicalDigestOf({
      lane: "simulation.execution/1",
      method: "simulation.execution",
    }),
    laneStatement: descriptor.laneStatement,
  };
}

/** The shared refusal points (identical for both doubles). */
function validateRequest(request: ExecutionSimulationRequest): SubstrateOutcome<never> | null {
  const violations = simulationRequestViolations(request);
  if (violations.length > 0) {
    return refused(
      FAMILY,
      "contract-mismatch",
      `execution-simulation request refused: ${violations.join("; ")}`,
    );
  }
  const cycle = completionBeforeCycleOf(request.operations);
  if (cycle !== null) {
    return refused(
      FAMILY,
      "operation-semantic-failure",
      `the completion-before activity graph is not a DAG — cycle: ${cycle.join(" -> ")}`,
    );
  }
  return null;
}

/** The shared capture computation (canonical capture content). */
function captureContentOf(
  trajectory: ExecutionTrajectory,
  asOfIso: string,
): {
  solutionId: string;
  versionNumber: number;
  trajectoryId: string;
  asOfIso: string;
  asOfHoursFromEpoch: number;
  plannedPercentComplete: number;
  completedOperationIds: string[];
  inProgressOperationIds: string[];
  pendingOperationIds: string[];
  epistemicStatus: "PROPOSED";
} {
  const asOfHours = hoursBetween(trajectory.clock.epochIso, asOfIso);
  let completedDurations = 0;
  let partialContribution = 0;
  const completed: string[] = [];
  const inProgress: string[] = [];
  const pending: string[] = [];
  for (const activity of trajectory.activities) {
    if (activity.finishHoursFromEpoch <= asOfHours) {
      completedDurations += activity.durationHours;
      completed.push(activity.operationId);
    } else if (activity.startHoursFromEpoch <= asOfHours) {
      const span = activity.finishHoursFromEpoch - activity.startHoursFromEpoch;
      partialContribution +=
        (activity.durationHours * (asOfHours - activity.startHoursFromEpoch)) / span;
      inProgress.push(activity.operationId);
    } else {
      pending.push(activity.operationId);
    }
  }
  const plannedPercentComplete =
    trajectory.totalDurationHours === 0
      ? 0
      : (completedDurations + partialContribution) / trajectory.totalDurationHours;
  return {
    solutionId: trajectory.solutionId,
    versionNumber: trajectory.versionNumber,
    trajectoryId: trajectory.trajectoryId,
    asOfIso,
    asOfHoursFromEpoch: asOfHours,
    plannedPercentComplete,
    completedOperationIds: completed,
    inProgressOperationIds: inProgress,
    pendingOperationIds: pending,
    epistemicStatus: SIMULATED_PROGRESS_EPISTEMIC_STATUS,
  };
}

/** The shared capture-as-of validator (identical refusal points). */
function validateAsOf(asOfIso: string): SubstrateOutcome<never> | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(asOfIso)) {
    return refused(
      FAMILY,
      "contract-mismatch",
      "asOfIso must be an ISO-8601 UTC millisecond instant (declared, never sensed)",
    );
  }
  return null;
}

const SIMULATION_DOUBLE_CAPABILITIES: ExecutionSimulationCapabilities = {
  supportsDeterministicSequencing: true,
  supportsTimeAnchoredWorldStates: true,
  supportsSimulatedProgressCapture: true,
  blocked: [
    {
      capability: "resource-leveling",
      reason:
        "out of the P0 contract — deterministic sequencing only; a real " +
        "execution-simulation occupant may add it behind the same port",
    },
    {
      capability: "working-hours-calendars",
      reason: "out of the P0 contract — declared continuous-time clock only",
    },
    {
      capability: "discrete-event-uncertainty",
      reason:
        "out of the P0 contract — determinism is the law; stochastic " +
        "simulation would be a separate, explicitly-declared capability",
    },
    {
      capability: "cost-time-tradeoff-optimization",
      reason: "out of the P0 contract — the deterministic solution engine owns solution search",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* The reference double (direct boundary-set iteration)                */
/* ------------------------------------------------------------------ */

export class ReferenceSimulationDouble implements ExecutionSimulationAdapter {
  readonly portId = "simulation.execution/1" as const;
  readonly capabilities: ExecutionSimulationCapabilities = SIMULATION_DOUBLE_CAPABILITIES;
  readonly descriptor: SubstrateProviderDescriptor = REFERENCE_SIMULATION_DOUBLE_DESCRIPTOR;

  simulate(request: ExecutionSimulationRequest): SubstrateOutcome<ExecutionTrajectory> {
    const frozen = deepFreeze(request);
    const refusal = validateRequest(frozen);
    if (refusal !== null) {
      return refusal;
    }
    const activities = activitiesOf(frozen.operations, frozen.durations);
    // the distinct boundary set (every start and every finish), ascending
    const boundaries = [
      ...new Set(activities.flatMap((a) => [a.startHoursFromEpoch, a.finishHoursFromEpoch])),
    ].sort((a, b) => a - b);
    const worldStates: TimeAnchoredWorldState[] = boundaries.map((t) => {
      const completed = activities.filter((a) => a.finishHoursFromEpoch <= t).map((a) => a.operationId);
      return {
        stateIndex: frozen.baselineStateIndex + completed.length,
        anchorHoursFromEpoch: t,
        completedOperationIds: completed,
        inProgressOperationIds: activities
          .filter((a) => a.startHoursFromEpoch <= t && a.finishHoursFromEpoch > t)
          .map((a) => a.operationId),
        pendingOperationIds: activities
          .filter((a) => a.startHoursFromEpoch > t)
          .map((a) => a.operationId),
      };
    });
    const { trajectoryId, totalDurationHours, makespanHours } = trajectoryContentOf(
      frozen,
      activities,
      worldStates,
    );
    return {
      ok: true,
      value: {
        kind: TRAJECTORY_KIND,
        schemaVersion: TRAJECTORY_SCHEMA_VERSION,
        trajectoryId,
        solutionId: frozen.solutionId,
        versionNumber: frozen.versionNumber,
        baselineStateIndex: frozen.baselineStateIndex,
        clock: frozen.clock,
        activities,
        worldStates,
        totalDurationHours,
        makespanHours,
        provenance: simulationProvenanceOf(this.descriptor, frozen),
      },
    };
  }

  captureProgress(
    trajectory: ExecutionTrajectory,
    asOfIso: string,
  ): SubstrateOutcome<SimulatedProgressCapture> {
    const frozenTrajectory = deepFreeze(trajectory);
    const refusal = validateAsOf(asOfIso);
    if (refusal !== null) {
      return refusal;
    }
    const content = captureContentOf(frozenTrajectory, asOfIso);
    return {
      ok: true,
      value: {
        captureKind: "simulated-progress-capture",
        captureId: canonicalDigestOf(content),
        ...content,
        simulationProvenance: {
          providerId: this.descriptor.providerId,
          technologyVersion: this.descriptor.technologyVersion,
          providerDescriptorDigest: canonicalDigestOf(this.descriptor),
          inputDigest: canonicalDigestOf({ trajectoryId: frozenTrajectory.trajectoryId, asOfIso }),
          parametersDigest: canonicalDigestOf({
            lane: "simulation.execution/1",
            method: "simulation.execution",
          }),
          laneStatement: this.descriptor.laneStatement,
        },
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* The alternate double (grouped event sweep)                           */
/* ------------------------------------------------------------------ */

export class AlternateSimulationDouble implements ExecutionSimulationAdapter {
  readonly portId = "simulation.execution/1" as const;
  readonly capabilities: ExecutionSimulationCapabilities = SIMULATION_DOUBLE_CAPABILITIES;
  readonly descriptor: SubstrateProviderDescriptor = ALTERNATE_SIMULATION_DOUBLE_DESCRIPTOR;

  simulate(request: ExecutionSimulationRequest): SubstrateOutcome<ExecutionTrajectory> {
    const frozen = deepFreeze(request);
    const refusal = validateRequest(frozen);
    if (refusal !== null) {
      return refusal;
    }
    const activities = activitiesOf(frozen.operations, frozen.durations);
    // compile start/finish events, group per boundary hour, sweep the groups
    const events = new Map<number, { operationId: string; kind: "start" | "finish" }[]>();
    for (const activity of activities) {
      const startList = events.get(activity.startHoursFromEpoch) ?? [];
      startList.push({ operationId: activity.operationId, kind: "start" });
      events.set(activity.startHoursFromEpoch, startList);
      const finishList = events.get(activity.finishHoursFromEpoch) ?? [];
      finishList.push({ operationId: activity.operationId, kind: "finish" });
      events.set(activity.finishHoursFromEpoch, finishList);
    }
    const worldStates: TimeAnchoredWorldState[] = [];
    const startedSet = new Set<string>();
    const completedSet = new Set<string>();
    const allIds = activities.map((a) => a.operationId);
    for (const boundary of [...events.keys()].sort((a, b) => a - b)) {
      for (const event of events.get(boundary) ?? []) {
        if (event.kind === "start") {
          startedSet.add(event.operationId);
        } else {
          completedSet.add(event.operationId);
        }
      }
      worldStates.push({
        stateIndex: frozen.baselineStateIndex + completedSet.size,
        anchorHoursFromEpoch: boundary,
        completedOperationIds: allIds.filter((id) => completedSet.has(id)),
        inProgressOperationIds: allIds.filter(
          (id) => startedSet.has(id) && !completedSet.has(id),
        ),
        pendingOperationIds: allIds.filter(
          (id) => !startedSet.has(id) && !completedSet.has(id),
        ),
      });
    }
    const { trajectoryId, totalDurationHours, makespanHours } = trajectoryContentOf(
      frozen,
      activities,
      worldStates,
    );
    return {
      ok: true,
      value: {
        kind: TRAJECTORY_KIND,
        schemaVersion: TRAJECTORY_SCHEMA_VERSION,
        trajectoryId,
        solutionId: frozen.solutionId,
        versionNumber: frozen.versionNumber,
        baselineStateIndex: frozen.baselineStateIndex,
        clock: frozen.clock,
        activities,
        worldStates,
        totalDurationHours,
        makespanHours,
        provenance: simulationProvenanceOf(this.descriptor, frozen),
      },
    };
  }

  captureProgress(
    trajectory: ExecutionTrajectory,
    asOfIso: string,
  ): SubstrateOutcome<SimulatedProgressCapture> {
    const frozenTrajectory = deepFreeze(trajectory);
    const refusal = validateAsOf(asOfIso);
    if (refusal !== null) {
      return refusal;
    }
    const content = captureContentOf(frozenTrajectory, asOfIso);
    return {
      ok: true,
      value: {
        captureKind: "simulated-progress-capture",
        captureId: canonicalDigestOf(content),
        ...content,
        simulationProvenance: {
          providerId: this.descriptor.providerId,
          technologyVersion: this.descriptor.technologyVersion,
          providerDescriptorDigest: canonicalDigestOf(this.descriptor),
          inputDigest: canonicalDigestOf({ trajectoryId: frozenTrajectory.trajectoryId, asOfIso }),
          parametersDigest: canonicalDigestOf({
            lane: "simulation.execution/1",
            method: "simulation.execution",
          }),
          laneStatement: this.descriptor.laneStatement,
        },
      },
    };
  }
}

/* ------------------------------------------------------------------ */
/* Convenience constructors + the declared fixture instants            */
/* ------------------------------------------------------------------ */

/** The reference execution-simulation substitution double. */
export function referenceSimulationDouble(): ExecutionSimulationAdapter {
  return new ReferenceSimulationDouble();
}

/** The alternate execution-simulation substitution double (independent code path). */
export function alternateSimulationDouble(): ExecutionSimulationAdapter {
  return new AlternateSimulationDouble();
}

/** The declared fixture clock epoch (deterministic — no clock reads). */
export const SIMULATION_FIXTURE_EPOCH = "2026-10-05T08:00:00.000Z" as const;

/** The declared fixture recording instant. */
export const SIMULATION_FIXTURE_RECORDED_AT = "2026-10-02T00:00:00.000Z" as const;
