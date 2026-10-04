/**
 * WORLD-P3 — the SEQUENCING family (`src/sequencing/`): stages 6–7 of
 * the lane (SEQUENCE + REPLAY).
 *
 *   SEQUENCE  — execution sequencing as typed activity orderings
 *               feeding the P0-C simulation contract: the AISE side
 *               declares the activity durations (typed units from the
 *               P0-C closed vocabulary), the declared clock and the
 *               recorded operation sequence; the lane compiles the plan
 *               into an `ExecutionSimulationRequest` (P0-C vocabulary,
 *               validated by the P0-C's own pure validator) and drives
 *               the simulation port. THE SIMULATION-NON-AUTHORITY LAW
 *               (seam law #6): the simulation substrate computes
 *               trajectories; the canonical Solution Graph stays the
 *               only authority — the trajectory is a DERIVED
 *               projection, and simulated progress is PROPOSED, never
 *               CONFIRMED.
 *   REPLAY    — solution replay as typed replay logs: the recorded
 *               session of the interactive world — every lane
 *               transition one content-chained, append-only entry
 *               (authoring commands, ghost presentations, clash
 *               verdicts, quantity projections, what-if comparisons,
 *               sequencing trajectories, acceptances). Replay is
 *               DETERMINISTIC and byte-identical; tampering is a typed
 *               refusal (the audit trail of the interactive world).
 *
 * THE 4D PLAYBACK VIEW: the sequencing output augments the P0-C
 * trajectory with the phase grouping derived from the CONTRACT's own
 * building-operation category table (`BUILDING_OPERATION_CATEGORIES` —
 * composed, never re-defined) — the SYNCHRO-parity playback surface
 * (which phase is active at which world state) as a typed projection.
 *
 * LAWS (on top of the seam's ten; enforced here and drilled by
 * `sequencing.test.ts`):
 *
 *  1. THE PLAN IS DECLARED: activity durations are DECLARED by the
 *     AISE side (typed units from the P0-C closed vocabulary); the
 *     substrate NEVER invents a duration — the P0-C law, enforced by
 *     the P0-C's own `simulationRequestViolations` validator which the
 *     compile delegates to (violation lists surface VERBATIM).
 *  2. THE OPERATIONS ARE CANONICAL: the plan carries the RECORDED
 *     operation sequence (the Solution Graph's own records — 1..N
 *     operationIndex, one version context); a mismatch is a typed
 *     refusal naming the P0-C violations.
 *  3. SEQUENCING SEMANTICS BELONG TO P0-C: precedence from the
 *     canonical completion-before edges (plus operationIndex
 *     tie-break), the DAG discipline, the declared clock — all the
 *     P0-C simulation contract's own semantics, driven verbatim
 *     through the port (this lane adds NO scheduling semantics).
 *  4. REPLAY ENTRIES ARE CHAINED: each entry's chain digest is
 *     sha-256 over (prior chain digest + the entry's canonical
 *     content); the log's identity is the final chain digest —
 *     tampering any entry breaks every later digest (fail-closed).
 *  5. REPLAY IS DETERMINISTIC: identical event sequences produce the
 *     byte-identical log (content-addressed logId); re-running the
 *     recorded transforms re-derives the identical chain.
 *  6. NO CLOCK READS: every instant (authoredAt/declaredAt/epoch) is a
 *     declared input; the simulation clock is the P0-C declared clock.
 */

import {
  BUILDING_OPERATION_CATEGORIES,
  type EngineeringOperation,
} from "@aise/solution-contract";
import {
  simulationRequestViolations,
  DURATION_UNIT_TO_HOURS,
  type ActivityDurationDeclaration,
  type ExecutionSimulationAdapter,
  type ExecutionSimulationRequest,
  type ExecutionTrajectory,
  type SimulatedActivity,
  type SimulationClockDeclaration,
  type SimulatedProgressCapture,
  type TimeAnchoredWorldState,
} from "@aise/world-solution-substrate";
import {
  canonicalDigestOf,
  isDeclaredInstant,
  isRecord,
  laneRefused,
  type LaneOperator,
  type Layer3Family,
  type LaneOutcome,
} from "../seam";

const FAMILY: Layer3Family = "sequencing";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const SEQUENCING_PLAN_KIND = "execution-sequencing-plan" as const;
export const SEQUENCING_PLAN_SCHEMA_VERSION = "execution-sequencing-plan/1" as const;
export const REPLAY_LOG_KIND = "solution-replay-log" as const;
export const REPLAY_LOG_SCHEMA_VERSION = "solution-replay-log/1" as const;
export const REPLAY_LEDGER_PORT_ID = "sequencing.replay-ledger/1" as const;

/**
 * The closed phase vocabulary — the CONTRACT's own building-operation
 * category keys, composed verbatim (the 4D playback phases).
 */
export const SEQUENCE_PHASES = [
  ...Object.keys(BUILDING_OPERATION_CATEGORIES),
] as readonly string[];
export type SequencePhase = (string & {});

/**
 * The phase of an operation type: the CONTRACT's own category table
 * (composed — never re-defined). An operation type outside the table
 * belongs to no phase (honestly null — never guessed).
 */
export function phaseOfOperationType(operationType: string): string | null {
  for (const [phase, types] of Object.entries(BUILDING_OPERATION_CATEGORIES)) {
    if ((types as readonly string[]).includes(operationType)) {
      return phase;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* SEQUENCE — the declared sequencing plan                              */
/* ------------------------------------------------------------------ */

/**
 * The DECLARED execution sequencing plan: the recorded operation
 * sequence + the AISE-declared activity durations + the declared clock.
 * Sequencing semantics (precedence, DAG, tie-break) belong to the P0-C
 * simulation contract; this plan only DECLARES the inputs.
 */
export interface ExecutionSequencingPlan {
  readonly kind: typeof SEQUENCING_PLAN_KIND;
  readonly schemaVersion: typeof SEQUENCING_PLAN_SCHEMA_VERSION;
  readonly solutionId: string;
  readonly versionNumber: number;
  /** The RECORDED canonical operation sequence (1..N, one version context). */
  readonly operations: readonly EngineeringOperation[];
  /** One DECLARED duration per operation (typed units — P0-C vocabulary). */
  readonly durations: readonly ActivityDurationDeclaration[];
  /** The DECLARED simulation clock (epoch + anchor granularity). */
  readonly clock: SimulationClockDeclaration;
  /** The proposed-state layer the trajectory starts from. */
  readonly baselineStateIndex: number;
  /** The declared recording instant (never a clock read). */
  readonly recordedAt: string;
}

/** The sequenced execution: the trajectory + the 4D playback phases. */
export interface SequencedExecution {
  readonly solutionId: string;
  readonly versionNumber: number;
  /** The P0-C execution trajectory (the substrate's derived projection). */
  readonly trajectory: ExecutionTrajectory;
  /**
   * The 4D playback view: the world states grouped by the ACTIVE phase
   * (the contract's own category table), a typed presentation layer.
   */
  readonly playbackPhases: readonly {
    readonly phase: SequencePhase | null;
    readonly activeOperationIds: readonly string[];
    readonly stateIndices: readonly number[];
  }[];
}

/**
 * Compile the plan into the P0-C `ExecutionSimulationRequest` — the
 * typed transform delegating ALL validation to the P0-C's own
 * `simulationRequestViolations` (violation lists surface VERBATIM in
 * the refusal detail — law 1 + law 2). PURE.
 */
export function compileExecutionSimulationRequest(
  plan: ExecutionSequencingPlan,
): LaneOutcome<ExecutionSimulationRequest> {
  if (!isRecord(plan) || plan.kind !== SEQUENCING_PLAN_KIND) {
    return laneRefused<ExecutionSimulationRequest>(
      FAMILY,
      "contract-mismatch",
      `the plan kind must be '${SEQUENCING_PLAN_KIND}'`,
    );
  }
  if (plan.schemaVersion !== SEQUENCING_PLAN_SCHEMA_VERSION) {
    return laneRefused<ExecutionSimulationRequest>(
      FAMILY,
      "contract-mismatch",
      `the plan schemaVersion must be '${SEQUENCING_PLAN_SCHEMA_VERSION}'`,
    );
  }
  const request: ExecutionSimulationRequest = {
    kind: "execution-simulation-request",
    schemaVersion: "execution-simulation-request/1",
    solutionId: plan.solutionId,
    versionNumber: plan.versionNumber,
    operations: [...plan.operations],
    baselineStateIndex: plan.baselineStateIndex,
    durations: [...plan.durations],
    clock: plan.clock,
    recordedAt: plan.recordedAt,
  };
  const violations = simulationRequestViolations(request);
  if (violations.length > 0) {
    return laneRefused<ExecutionSimulationRequest>(
      FAMILY,
      "contract-mismatch",
      `the sequencing plan violates the P0-C simulation contract laws: ${violations.join("; ")}`,
    );
  }
  return { ok: true, value: request };
}

/**
 * Run the sequencing plan through the simulation port (the controlled
 * entry): compile → simulate → augment with the 4D playback phases.
 * The simulation adapter is the P0-C port occupant (doubles in tests;
 * a real execution-simulation engine in P4). PURE given the adapter.
 */
export function sequenceExecution(
  plan: ExecutionSequencingPlan,
  simulation: ExecutionSimulationAdapter,
): LaneOutcome<SequencedExecution> {
  const compiled = compileExecutionSimulationRequest(plan);
  if (!compiled.ok) {
    return compiled;
  }
  const trajectory = simulation.simulate(compiled.value);
  if (!trajectory.ok) {
    return laneRefused<SequencedExecution>(
      FAMILY,
      trajectory.failure.kind,
      `the simulation substrate refused the sequencing plan: ${trajectory.failure.detail}`,
    );
  }
  const playbackPhases = playbackPhasesOf(trajectory.value);
  return {
    ok: true,
    value: {
      solutionId: plan.solutionId,
      versionNumber: plan.versionNumber,
      trajectory: trajectory.value,
      playbackPhases,
    },
  };
}

/**
 * The 4D playback view: for each world state of the trajectory, the
 * ACTIVE phase (the phase of the in-progress operations — the contract's
 * own category table) and the state indices it covers. PURE.
 */
export function playbackPhasesOf(
  trajectory: ExecutionTrajectory,
): SequencedExecution["playbackPhases"] {
  const activityById = new Map(
    trajectory.activities.map((activity) => [activity.operationId, activity] as const),
  );
  const phases: {
    phase: SequencePhase | null;
    activeOperationIds: string[];
    stateIndices: number[];
  }[] = [];
  for (const state of trajectory.worldStates) {
    const activePhases = new Set<string | null>();
    for (const operationId of state.inProgressOperationIds) {
      const activity = activityById.get(operationId);
      if (activity === undefined) {
        continue;
      }
      activePhases.add(phaseOfOperationType(activity.operationType));
    }
    const distinct = [...activePhases];
    const phase: string | null =
      distinct.length === 1
        ? (distinct[0] ?? null)
        : distinct.length === 0
          ? null
          : "mixed";
    phases.push({
      phase,
      activeOperationIds: [...state.inProgressOperationIds],
      stateIndices: [state.stateIndex],
    });
  }
  // Coalesce consecutive same-phase states into playback segments.
  const coalesced: typeof phases = [];
  for (const segment of phases) {
    const last = coalesced[coalesced.length - 1];
    if (
      last !== undefined &&
      last.phase === segment.phase &&
      last.activeOperationIds.join("|") === segment.activeOperationIds.join("|")
    ) {
      last.stateIndices.push(...segment.stateIndices);
    } else {
      coalesced.push({
        phase: segment.phase,
        activeOperationIds: [...segment.activeOperationIds],
        stateIndices: [...segment.stateIndices],
      });
    }
  }
  return coalesced;
}

/** Re-export the P0-C duration conversion table (the declared-unit law). */
export { DURATION_UNIT_TO_HOURS };

/* ------------------------------------------------------------------ */
/* REPLAY — the typed replay log (the audit trail of the world)         */
/* ------------------------------------------------------------------ */

/** The closed replay-event vocabulary (one entry per lane transition). */
export const REPLAY_EVENT_KINDS = [
  "command-authored",
  "ghost-presented",
  "clash-detected",
  "conflict-recorded",
  "quantity-projected",
  "what-if-compared",
  "sequence-computed",
  "solution-accepted",
  "solution-revised",
] as const;
export type ReplayEventKind = (typeof REPLAY_EVENT_KINDS)[number];

export function isReplayEventKind(value: unknown): value is ReplayEventKind {
  return (
    typeof value === "string" &&
    (REPLAY_EVENT_KINDS as readonly string[]).includes(value)
  );
}

/** The typed payload of one replay event (per event kind). */
export type SolutionReplayEvent =
  | {
      readonly event: "command-authored";
      readonly operator: LaneOperator;
      readonly modality: "direct-manipulation" | "agent";
      readonly operationId: string;
      readonly commandKind: string;
      readonly authoredAt: string;
    }
  | {
      readonly event: "ghost-presented";
      readonly operator: LaneOperator;
      readonly solutionId: string;
      readonly versionNumber: number;
      readonly presentationToken: string;
      readonly proposedElementCount: number;
      readonly declaredAt: string;
    }
  | {
      readonly event: "clash-detected";
      readonly operator: LaneOperator;
      readonly reportId: string;
      readonly clashCount: number;
      readonly withinToleranceCount: number;
      readonly declaredAt: string;
    }
  | {
      readonly event: "conflict-recorded";
      readonly operator: LaneOperator;
      readonly conflictIds: readonly string[];
      readonly problemId: string;
      readonly recordedAt: string;
    }
  | {
      readonly event: "quantity-projected";
      readonly operator: LaneOperator;
      readonly projectionId: string;
      readonly lineCount: number;
      readonly baselineBoqId: string | null;
      readonly declaredAt: string;
    }
  | {
      readonly event: "what-if-compared";
      readonly operator: LaneOperator;
      readonly comparisonId: string;
      readonly alternativeCount: number;
      readonly declaredAt: string;
    }
  | {
      readonly event: "sequence-computed";
      readonly operator: LaneOperator;
      readonly trajectoryId: string;
      readonly makespanHours: number;
      readonly activityCount: number;
      readonly declaredAt: string;
    }
  | {
      readonly event: "solution-accepted";
      readonly operator: LaneOperator;
      readonly solutionId: string;
      readonly versionNumber: number;
      readonly decidedAt: string;
      readonly note: string;
    }
  | {
      readonly event: "solution-revised";
      readonly operator: LaneOperator;
      readonly solutionId: string;
      readonly revisedVersionNumber: number;
      readonly decidedAt: string;
      readonly reason: string;
    };

/** One appended replay entry (content-chained — law 4). */
export interface SolutionReplayEntry {
  /** 1-based position in the log (monotonic). */
  readonly sequence: number;
  readonly event: SolutionReplayEvent;
  /** sha-256 over the PRIOR entry's chain digest + this entry's content. */
  readonly chainDigest: string;
}

/** The replay log (the audit trail of one interactive solution session). */
export interface SolutionReplayLog {
  readonly kind: typeof REPLAY_LOG_KIND;
  readonly schemaVersion: typeof REPLAY_LOG_SCHEMA_VERSION;
  readonly solutionId: string;
  readonly versionNumber: number;
  /** The entries, append-only, chain-ordered. */
  readonly entries: readonly SolutionReplayEntry[];
  /** The final chain digest (the log's content identity). */
  readonly logId: string;
}

/** The genesis digest (the chain's anchor — a fixed constant). */
export const REPLAY_GENESIS_DIGEST =
  "0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * The canonical event content of one replay event (the chain input).
 * PURE.
 */
function eventContentOf(event: SolutionReplayEvent): Record<string, unknown> {
  if (!isRecord(event) || !isReplayEventKind(event.event)) {
    throw new Error("the replay event must carry a closed-vocabulary event kind");
  }
  return event as Record<string, unknown>;
}

/** Validate one replay event's instants (fail-closed — law 6). */
function validateReplayEvent(event: SolutionReplayEvent): LaneOutcome<null> {
  if (!isRecord(event) || !isReplayEventKind(event.event)) {
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      `the replay event kind must be one of ${REPLAY_EVENT_KINDS.join(" | ")}`,
    );
  }
  const instantFields: readonly string[] = ["authoredAt", "declaredAt", "recordedAt", "decidedAt"];
  for (const field of instantFields) {
    const value = (event as Record<string, unknown>)[field];
    if (value !== undefined && !isDeclaredInstant(value)) {
      return laneRefused<null>(
        FAMILY,
        "contract-mismatch",
        `the replay event '${String(event.event)}' carries a malformed ${field} instant (declared inputs only — never a clock read)`,
      );
    }
  }
  return { ok: true, value: null };
}

/**
 * Append one replay event to the log (the chain law: chainDigest =
 * sha-256(prior chain digest + canonical event content)). PURE — the
 * input log is never mutated; a NEW log is returned.
 */
export function appendReplayEvent(
  log: SolutionReplayLog,
  event: SolutionReplayEvent,
): LaneOutcome<SolutionReplayLog> {
  const validation = validateReplayEvent(event);
  if (!validation.ok) {
    return validation;
  }
  const priorDigest =
    log.entries.length === 0
      ? REPLAY_GENESIS_DIGEST
      : log.entries[log.entries.length - 1]?.chainDigest ?? REPLAY_GENESIS_DIGEST;
  const content = eventContentOf(event);
  const chainDigest = canonicalDigestOf({
    priorDigest,
    sequence: log.entries.length + 1,
    event: content,
  });
  const entry: SolutionReplayEntry = {
    sequence: log.entries.length + 1,
    event,
    chainDigest,
  };
  return {
    ok: true,
    value: {
      ...log,
      entries: [...log.entries, entry],
      logId: chainDigest,
    },
  };
}

/** Start a fresh replay log for one solution version session. */
export function openReplayLog(
  solutionId: string,
  versionNumber: number,
): SolutionReplayLog {
  return {
    kind: REPLAY_LOG_KIND,
    schemaVersion: REPLAY_LOG_SCHEMA_VERSION,
    solutionId,
    versionNumber,
    entries: [],
    logId: REPLAY_GENESIS_DIGEST,
  };
}

/**
 * Verify the replay log's chain integrity (the tamper gate — law 4):
 * every entry's chain digest re-derives from the prior digest + the
 * entry's own content, the sequence is monotonic 1..N, and the logId
 * equals the final digest. A tampered log is a typed refusal naming the
 * first broken entry. PURE.
 */
export function verifyReplayLog(
  log: SolutionReplayLog,
): LaneOutcome<null> {
  if (!isRecord(log) || log.kind !== REPLAY_LOG_KIND) {
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      `the replay log kind must be '${REPLAY_LOG_KIND}'`,
    );
  }
  let priorDigest: string = REPLAY_GENESIS_DIGEST;
  for (let index = 0; index < log.entries.length; index += 1) {
    const entry = log.entries[index];
    if (entry === undefined) {
      return laneRefused<null>(
        FAMILY,
        "contract-mismatch",
        `replay entry ${index + 1} is missing`,
      );
    }
    if (entry.sequence !== index + 1) {
      return laneRefused<null>(
        FAMILY,
        "contract-mismatch",
        `replay entry ${index + 1} carries sequence ${entry.sequence} — the sequence must be the monotonic 1..N`,
      );
    }
    const eventValidation = validateReplayEvent(entry.event);
    if (!eventValidation.ok) {
      return eventValidation;
    }
    const expected = canonicalDigestOf({
      priorDigest,
      sequence: index + 1,
      event: eventContentOf(entry.event),
    });
    if (expected !== entry.chainDigest) {
      return laneRefused<null>(
        FAMILY,
        "contract-mismatch",
        `replay entry ${index + 1} fails the chain verification — the log was tampered with (expected digest ${expected.slice(0, 12)}…, found ${entry.chainDigest.slice(0, 12)}…)`,
      );
    }
    priorDigest = entry.chainDigest;
  }
  if (log.logId !== priorDigest) {
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      `the replay log's identity does not match its final chain digest (tamper or truncation)`,
    );
  }
  return { ok: true, value: null };
}

/* ------------------------------------------------------------------ */
/* The replay-ledger port (the store substrate of the audit trail)      */
/* ------------------------------------------------------------------ */

/** Capabilities of one replay-ledger implementation. */
export interface ReplayLedgerCapabilities {
  readonly maxEntries: number | null;
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/**
 * The replay-ledger port: the append-only STORE of the replay log (a
 * real persisted ledger in P4; the two in-memory doubles here). The
 * ledger NEVER rewrites history: append is the only mutation.
 */
export interface SolutionReplayLedger {
  readonly portId: typeof REPLAY_LEDGER_PORT_ID;
  readonly capabilities: ReplayLedgerCapabilities;
  /** The current (verified) log — a tampered store fails closed. */
  currentLog(): LaneOutcome<SolutionReplayLog>;
  /** Append one event (the only mutation; verifies before appending). */
  append(event: SolutionReplayEvent): LaneOutcome<SolutionReplayLog>;
}

/* ------------------------------------------------------------------ */
/* Re-exports (the composed P0-C simulation vocabulary surface)         */
/* ------------------------------------------------------------------ */

export type {
  ActivityDurationDeclaration,
  ExecutionSimulationAdapter,
  ExecutionSimulationRequest,
  ExecutionTrajectory,
  SimulatedActivity,
  SimulationClockDeclaration,
  SimulatedProgressCapture,
  TimeAnchoredWorldState,
};
