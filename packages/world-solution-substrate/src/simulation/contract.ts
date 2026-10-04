/**
 * WORLD-P0-C — the EXECUTION-SIMULATION substrate CONTRACT (`src/simulation/`).
 *
 * The contract for deterministic 4D / execution-simulation state
 * transitions — activity sequencing, time-anchored world states and
 * simulated-progress capture feeding the Outcome lane — expressed as
 * TYPED TRANSFORMS over the canonical Solution Graph +
 * EngineeringOperation vocabulary (`@aise/solution-contract`, PROD-021).
 *
 * AUTHORITY LAW (directive §10 — binding on this whole family):
 *
 *   THE SIMULATION SUBSTRATE COMPUTES TRAJECTORIES; THE CANONICAL
 *   SOLUTION GRAPH STAYS THE ONLY AUTHORITY.
 *
 * Concretely: the simulation consumes the solution version's RECORDED
 * operation sequence read-only, projects it onto an activity network
 * and a time-anchored world-state trajectory, and answers
 * simulated-progress captures that enter the Outcome lane as PROPOSED
 * with simulation provenance — NEVER as CONFIRMED observations. The
 * port exposes NO write-back: there is no operation on this interface
 * that can mutate a Solution Graph, an EngineeringOperation or a
 * ProposedState. A simulation result is derived projection data, and a
 * 4D world state is anchored to the proposed-state LAYER INDEX the
 * canonical state chain already defines (activity k completing ⇔
 * operation k applied ⇔ proposed state baselineIndex + k) — the
 * simulation invents no state semantics of its own.
 *
 * LAWS (on top of the seam laws, enforced by the doubles + tests):
 *
 *  1. CANONICAL INPUT LAW — `operations` are REAL canonical
 *     EngineeringOperations (the same wire records the Solution Graph
 *     stores; tests decode the committed solution-contract fixtures
 *     through the shared codec and simulate THEM). The request must
 *     carry one coherent version context: unique operationIds, a
 *     1..N operationIndex sequence, one solutionId + versionNumber —
 *     a mismatch is a typed refusal.
 *  2. DECLARED-DURATION LAW — every activity's duration is DECLARED by
 *     the AISE side with a typed unit from the closed vocabulary; the
 *     substrate NEVER invents, estimates or defaults a duration. An
 *     operation without a declared duration is a refusal
 *     (`contract-mismatch` naming the operationId). Durations are
 *     strictly positive and finite.
 *  3. SEQUENCING LAW — precedence comes from the canonical
 *     `completion-before` dependency edges (plus the operationIndex
 *     order as the tie-break for independent activities); a dependency
 *     cycle is a typed refusal (`operation-semantic-failure` — the
 *     activity graph must be a DAG). `state-precondition` edges are
 *     RECORDED on the activities but do not schedule — they are
 *     semantic preconditions the solution engine already enforced when
 *     it recorded the operations.
 *  4. DECLARED-CLOCK LAW — the simulation clock (epoch + time unit)
 *     and every instant (`recordedAt`, capture `asOfIso`) are DECLARED
 *     inputs, never sensed: no clock reads, no randomness, no network.
 *     Identical requests produce byte-identical, content-addressed
 *     trajectories.
 *  5. EPISTEMIC LAW — simulated-progress captures carry
 *     `epistemicStatus: "PROPOSED"` (the seam's
 *     SIMULATED_PROGRESS_EPISTEMIC_STATUS); `CONFIRMED` /
 *     `OBSERVED` / `INFERRED` are UNREPRESENTABLE in the capture type.
 *     Planned percent-complete is a PLANNED projection, never an
 *     observed progress fact.
 *  6. FAIL-CLOSED LAW — malformed requests (unknown duration
 *     references, unknown dependency targets, non-monotonic index
 *     sequences, non-positive durations, out-of-vocabulary units) are
 *     typed refusals from the HFX-000 closed vocabulary; nothing is
 *     fabricated, nothing silently defaults.
 *
 * NON-GOALS (declared honestly, behind the adapter until a future
 * occupant provides them): resource leveling/allocation, working-hours
 * calendars and holiday lags, discrete-event uncertainty, cost/time
 * trade-off optimization, linear scheduling — the P0 contract is the
 * deterministic sequencing/trajectory/capture transform only. The
 * SYNCHRO-parity interactive 4D experience (WORLD-P3) consumes this
 * port; it does not expand it in P0.
 */

import type { EngineeringOperation } from "@aise/solution-contract";
import type {
  SubstrateOutcome,
  SubstrateResultProvenance,
} from "../seam";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const SIMULATION_REQUEST_KIND = "execution-simulation-request" as const;
export const SIMULATION_REQUEST_SCHEMA_VERSION = "execution-simulation-request/1" as const;
export const TRAJECTORY_KIND = "execution-trajectory" as const;
export const TRAJECTORY_SCHEMA_VERSION = "execution-trajectory/1" as const;

/** The closed duration-unit vocabulary (converted to hours deterministically). */
export const SIMULATION_DURATION_UNITS = ["minute", "hour", "day"] as const;
export type SimulationDurationUnit = (typeof SIMULATION_DURATION_UNITS)[number];

/** The closed clock time-unit vocabulary (the anchor granularity). */
export const SIMULATION_CLOCK_UNITS = ["hour", "day"] as const;
export type SimulationClockUnit = (typeof SIMULATION_CLOCK_UNITS)[number];

/** Deterministic conversion of a duration into hours (documented table). */
export const DURATION_UNIT_TO_HOURS: Readonly<Record<SimulationDurationUnit, number>> = {
  minute: 1 / 60,
  hour: 1,
  day: 24,
};

/** Deterministic conversion of a clock unit into hours (documented table). */
export const CLOCK_UNIT_TO_HOURS: Readonly<Record<SimulationClockUnit, number>> = {
  hour: 1,
  day: 24,
};

/* ------------------------------------------------------------------ */
/* The request (canonical inputs + declared durations + declared clock) */
/* ------------------------------------------------------------------ */

/** One activity's DECLARED duration (typed value + closed-vocabulary unit). */
export interface ActivityDurationDeclaration {
  readonly operationId: string;
  readonly durationValue: number;
  readonly durationUnit: SimulationDurationUnit;
}

/** The DECLARED simulation clock: an epoch instant + anchor granularity. */
export interface SimulationClockDeclaration {
  /** ISO-8601 UTC millisecond instant — the trajectory's t=0 (declared). */
  readonly epochIso: string;
  readonly timeUnit: SimulationClockUnit;
}

/**
 * The execution-simulation request: the solution version's RECORDED
 * operation sequence (read-only canonical input) + the AISE-declared
 * durations + the declared clock + the declared recording instant.
 */
export interface ExecutionSimulationRequest {
  readonly kind: typeof SIMULATION_REQUEST_KIND;
  readonly schemaVersion: typeof SIMULATION_REQUEST_SCHEMA_VERSION;
  readonly solutionId: string;
  readonly versionNumber: number;
  /**
   * The canonical operation sequence (ordered by operationIndex, the
   * semantic order the Solution Graph recorded). Deep-frozen at the
   * governed entry — the substrate never mutates it.
   */
  readonly operations: readonly EngineeringOperation[];
  /** The proposed-state layer the trajectory starts from (0 = baseline overlay). */
  readonly baselineStateIndex: number;
  /** One declared duration per operation — REQUIRED, fail-closed. */
  readonly durations: readonly ActivityDurationDeclaration[];
  readonly clock: SimulationClockDeclaration;
  /** The declared recording instant (no clock reads). */
  readonly recordedAt: string;
}

/* ------------------------------------------------------------------ */
/* The trajectory (the deterministic 4D projection)                      */
/* ------------------------------------------------------------------ */

/** One simulated activity — a canonical operation projected onto time. */
export interface SimulatedActivity {
  readonly operationId: string;
  readonly operationIndex: number;
  readonly operationType: string;
  /** Hours from the declared epoch (deterministic forward pass). */
  readonly startHoursFromEpoch: number;
  readonly finishHoursFromEpoch: number;
  readonly durationHours: number;
  /** The completion-before predecessors honored by sequencing. */
  readonly predecessorOperationIds: readonly string[];
  /** The state-precondition references (recorded, not sequenced). */
  readonly statePreconditionOperationIds: readonly string[];
}

/**
 * One time-anchored world state: the proposed-state LAYER the world is
 * at, at a declared instant, with the operation completion classes.
 * Activity k completing ⇔ operation k applied ⇔ state layer
 * baselineStateIndex + k — the simulation invents no state semantics.
 */
export interface TimeAnchoredWorldState {
  /** The proposed-state layer index this snapshot corresponds to. */
  readonly stateIndex: number;
  /** Hours from the declared epoch (the anchor's t). */
  readonly anchorHoursFromEpoch: number;
  readonly completedOperationIds: readonly string[];
  readonly inProgressOperationIds: readonly string[];
  readonly pendingOperationIds: readonly string[];
}

/** The deterministic execution trajectory of a solution version. */
export interface ExecutionTrajectory {
  readonly kind: typeof TRAJECTORY_KIND;
  readonly schemaVersion: typeof TRAJECTORY_SCHEMA_VERSION;
  /** Content-derived 64-hex digest (byte-stable across implementations). */
  readonly trajectoryId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly baselineStateIndex: number;
  /** The DECLARED simulation clock carried verbatim (the trajectory is self-contained). */
  readonly clock: SimulationClockDeclaration;
  readonly activities: readonly SimulatedActivity[];
  /** World-state snapshots at every activity boundary (sorted by t). */
  readonly worldStates: readonly TimeAnchoredWorldState[];
  /** Sum of all declared durations (hours). */
  readonly totalDurationHours: number;
  /** Finish of the last activity (hours from epoch). */
  readonly makespanHours: number;
  readonly provenance: SubstrateResultProvenance;
}

/* ------------------------------------------------------------------ */
/* Simulated-progress capture (feeds the Outcome lane as PROPOSED)      */
/* ------------------------------------------------------------------ */

/**
 * The simulated-progress capture: what the trajectory says about
 * progress at a DECLARED instant. Epistemic status is PROPOSED —
 * structurally: the literal type admits nothing else (law 5).
 */
export interface SimulatedProgressCapture {
  readonly captureKind: "simulated-progress-capture";
  /** Content-derived 64-hex digest. */
  readonly captureId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly trajectoryId: string;
  /** The declared evaluation instant (the "as of"). */
  readonly asOfIso: string;
  /** Hours from the declared epoch of the evaluation instant. */
  readonly asOfHoursFromEpoch: number;
  /** Deterministic planned completion fraction [0,1] (completed duration / total). */
  readonly plannedPercentComplete: number;
  readonly completedOperationIds: readonly string[];
  readonly inProgressOperationIds: readonly string[];
  readonly pendingOperationIds: readonly string[];
  /** ALWAYS "PROPOSED" — the epistemic law, structural. */
  readonly epistemicStatus: "PROPOSED";
  readonly simulationProvenance: SubstrateResultProvenance;
}

/* ------------------------------------------------------------------ */
/* Capabilities + the port                                              */
/* ------------------------------------------------------------------ */

export interface ExecutionSimulationCapabilities {
  /** Sequencing + trajectory + capture (the P0 transform set). */
  readonly supportsDeterministicSequencing: boolean;
  readonly supportsTimeAnchoredWorldStates: boolean;
  readonly supportsSimulatedProgressCapture: boolean;
  /** Named BLOCKED capabilities with the honest reason (law 3 vocabulary). */
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/**
 * The execution-simulation port. The substrate behind it computes
 * trajectories over the canonical Solution Graph vocabulary — it never
 * becomes the solution engine's authority and never writes back.
 */
export interface ExecutionSimulationAdapter {
  readonly portId: "simulation.execution/1";
  readonly capabilities: ExecutionSimulationCapabilities;

  /**
   * Compute the deterministic execution trajectory of the solution
   * version's operation sequence. Fail-closed on every law violation.
   */
  simulate(request: ExecutionSimulationRequest): SubstrateOutcome<ExecutionTrajectory>;

  /**
   * Capture simulated progress at a DECLARED instant (feeds the Outcome
   * lane as PROPOSED with simulation provenance).
   */
  captureProgress(
    trajectory: ExecutionTrajectory,
    asOfIso: string,
  ): SubstrateOutcome<SimulatedProgressCapture>;
}

/* ------------------------------------------------------------------ */
/* Shared pure law helpers (reusable by real adapters)                  */
/* ------------------------------------------------------------------ */

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/**
 * Law 1 + law 6 helper — validate the canonical-input coherence of a
 * simulation request. Returns the violation list (empty = valid). PURE.
 */
export function simulationRequestViolations(
  request: ExecutionSimulationRequest,
): readonly string[] {
  const violations: string[] = [];
  if (request.solutionId.trim().length === 0) {
    violations.push("solutionId must be non-empty");
  }
  if (!Number.isInteger(request.versionNumber) || request.versionNumber < 1) {
    violations.push("versionNumber must be a positive integer");
  }
  if (!Number.isInteger(request.baselineStateIndex) || request.baselineStateIndex < 0) {
    violations.push("baselineStateIndex must be a non-negative integer");
  }
  if (request.operations.length === 0) {
    violations.push("the operation sequence must not be empty");
  }
  const seenIds = new Set<string>();
  for (let index = 0; index < request.operations.length; index += 1) {
    const operation = request.operations[index];
    const expectedIndex = index + 1;
    if (operation === undefined) {
      violations.push(`operations[${index}]: missing entry`);
      continue;
    }
    if (seenIds.has(operation.operationId)) {
      violations.push(`duplicate operationId ${operation.operationId}`);
    }
    seenIds.add(operation.operationId);
    if (operation.operationIndex !== expectedIndex) {
      violations.push(
        `operation ${operation.operationId} has operationIndex ${operation.operationIndex}, expected the canonical 1..N sequence position ${expectedIndex}`,
      );
    }
    if (operation.solutionId !== request.solutionId || operation.versionNumber !== request.versionNumber) {
      violations.push(
        `operation ${operation.operationId} belongs to solution ${operation.solutionId} v${operation.versionNumber}, not ${request.solutionId} v${request.versionNumber}`,
      );
    }
    for (const dependency of operation.dependsOn) {
      if (dependency.operationRef === operation.operationId) {
        violations.push(`operation ${operation.operationId} depends on itself`);
        continue;
      }
      const referenced = request.operations.find(
        (o) => o.operationId === dependency.operationRef,
      );
      if (referenced === undefined) {
        violations.push(
          `operation ${operation.operationId} depends on unknown operation ${dependency.operationRef}`,
        );
      } else if (referenced.operationIndex >= operation.operationIndex) {
        violations.push(
          `operation ${operation.operationId} depends on operation ${dependency.operationRef} at index ${referenced.operationIndex} — dependencies must reference EARLIER recorded operations`,
        );
      }
    }
  }
  // law 2 — declared durations, one per operation, positive and finite
  const durationIds = new Set<string>();
  for (const duration of request.durations) {
    if (durationIds.has(duration.operationId)) {
      violations.push(`duplicate duration declaration for ${duration.operationId}`);
    }
    durationIds.add(duration.operationId);
    if (!seenIds.has(duration.operationId)) {
      violations.push(
        `duration declared for unknown operation ${duration.operationId}`,
      );
    }
    if (!(duration.durationValue > 0) || !Number.isFinite(duration.durationValue)) {
      violations.push(
        `duration for ${duration.operationId} must be strictly positive and finite`,
      );
    }
    if (!(SIMULATION_DURATION_UNITS as readonly string[]).includes(duration.durationUnit)) {
      violations.push(
        `duration unit for ${duration.operationId} must be one of ${SIMULATION_DURATION_UNITS.join(" | ")}`,
      );
    }
  }
  for (const operationId of seenIds) {
    if (!durationIds.has(operationId)) {
      violations.push(
        `no declared duration for operation ${operationId} — the substrate never invents durations`,
      );
    }
  }
  // law 4 — the declared clock
  if (!ISO_TIMESTAMP.test(request.clock.epochIso)) {
    violations.push("clock.epochIso must be an ISO-8601 UTC millisecond instant");
  }
  if (!(SIMULATION_CLOCK_UNITS as readonly string[]).includes(request.clock.timeUnit)) {
    violations.push(`clock.timeUnit must be one of ${SIMULATION_CLOCK_UNITS.join(" | ")}`);
  }
  if (!ISO_TIMESTAMP.test(request.recordedAt)) {
    violations.push("recordedAt must be an ISO-8601 UTC millisecond instant");
  }
  return violations;
}

/**
 * Law 3 helper — detect dependency cycles in the completion-before
 * graph (the activity network must be a DAG). Returns one cycle path
 * or null. PURE.
 */
export function completionBeforeCycleOf(
  operations: readonly EngineeringOperation[],
): readonly string[] | null {
  const edges = new Map<string, string[]>();
  for (const operation of operations) {
    edges.set(
      operation.operationId,
      operation.dependsOn
        .filter((d) => d.dependencyKind === "completion-before")
        .map((d) => d.operationRef),
    );
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of edges.keys()) {
    color.set(id, WHITE);
  }
  const path: string[] = [];
  const visit = (id: string): readonly string[] | null => {
    color.set(id, GRAY);
    path.push(id);
    for (const next of edges.get(id) ?? []) {
      const nextColor = color.get(next) ?? WHITE;
      if (nextColor === GRAY) {
        return [...path.slice(path.indexOf(next)), next];
      }
      if (nextColor === WHITE) {
        const cycle = visit(next);
        if (cycle !== null) return cycle;
      }
    }
    path.pop();
    color.set(id, BLACK);
    return null;
  };
  for (const id of edges.keys()) {
    if ((color.get(id) ?? WHITE) === WHITE) {
      const cycle = visit(id);
      if (cycle !== null) return cycle;
    }
  }
  return null;
}

/** Deterministic conversion of a declared instant to hours from the epoch. */
export function hoursBetween(
  epochIso: string,
  instantIso: string,
): number {
  const epochMs = Date.parse(epochIso);
  const instantMs = Date.parse(instantIso);
  return (instantMs - epochMs) / (1000 * 60 * 60);
}
