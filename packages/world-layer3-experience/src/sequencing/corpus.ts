/**
 * WORLD-P3 — the SEQUENCING family's committed fixture corpus.
 *
 * The execution-sequencing plan over the QUANTIFY world's RECORDED
 * operation sequence (the engine-replayed wall-upgrade operations —
 * canonical Solution Graph records with their completion-before
 * edges), with the AISE-DECLARED activity durations and clock, plus
 * the canonical replay-event sequence of the interactive session.
 *
 * PURE DATA + PURE COMPUTATION — no I/O, no clock reads, no randomness.
 */

import type { ActivityDurationDeclaration } from "@aise/world-solution-substrate";
import {
  referenceSimulationDouble,
  alternateSimulationDouble,
  type ExecutionSimulationAdapter,
} from "@aise/world-solution-substrate";
import type { LaneOperator } from "../seam";
import {
  FIXTURE_QUANTIFY_WORLD,
  FIXTURE_DEMOLITION_OPERATION_ID,
  FIXTURE_BLOCK_WALL_OPERATION_ID,
  FIXTURE_PLASTER_OPERATION_ID,
} from "../quantify/corpus";
import type { ExecutionSequencingPlan, SolutionReplayEvent } from "./contract";

/* ------------------------------------------------------------------ */
/* The sequencing plan fixtures                                         */
/* ------------------------------------------------------------------ */

/** The simulation epoch (the declared trajectory t=0). */
export const SEQUENCING_FIXTURE_EPOCH = "2026-10-05T08:00:00.000Z" as const;
export const SEQUENCING_FIXTURE_RECORDED_AT = "2026-10-05T07:00:00.000Z" as const;

/** The DECLARED activity durations (whole hours/days — IEEE-754 exact). */
export const FIXTURE_DECLARED_DURATIONS: readonly ActivityDurationDeclaration[] = [
  { operationId: FIXTURE_DEMOLITION_OPERATION_ID, durationValue: 8, durationUnit: "hour" },
  { operationId: FIXTURE_BLOCK_WALL_OPERATION_ID, durationValue: 1, durationUnit: "day" },
  { operationId: FIXTURE_PLASTER_OPERATION_ID, durationValue: 16, durationUnit: "hour" },
];

/** The canonical sequencing plan (the SEQUENCE-stage input). */
export const FIXTURE_SEQUENCING_PLAN: ExecutionSequencingPlan = {
  kind: "execution-sequencing-plan",
  schemaVersion: "execution-sequencing-plan/1",
  solutionId: FIXTURE_QUANTIFY_WORLD.version.solutionId,
  versionNumber: FIXTURE_QUANTIFY_WORLD.version.versionNumber,
  operations: [...FIXTURE_QUANTIFY_WORLD.operations],
  durations: [...FIXTURE_DECLARED_DURATIONS],
  clock: { epochIso: SEQUENCING_FIXTURE_EPOCH, timeUnit: "hour" },
  baselineStateIndex: 0,
  recordedAt: SEQUENCING_FIXTURE_RECORDED_AT,
};

/** A plan with a MISSING duration declaration (the law-1 drill). */
export const FIXTURE_PLAN_MISSING_DURATION: ExecutionSequencingPlan = {
  ...FIXTURE_SEQUENCING_PLAN,
  durations: FIXTURE_DECLARED_DURATIONS.slice(0, 2),
};

/** A plan with a NON-POSITIVE duration (the law-1 drill). */
export const FIXTURE_PLAN_ZERO_DURATION: ExecutionSequencingPlan = {
  ...FIXTURE_SEQUENCING_PLAN,
  durations: [
    { operationId: FIXTURE_DEMOLITION_OPERATION_ID, durationValue: 0, durationUnit: "hour" },
    { operationId: FIXTURE_BLOCK_WALL_OPERATION_ID, durationValue: 1, durationUnit: "day" },
    { operationId: FIXTURE_PLASTER_OPERATION_ID, durationValue: 16, durationUnit: "hour" },
  ],
};

/** The two P0-C simulation substrate doubles (the port occupants). */
export function fixtureSimulationDoubles(): readonly [
  ExecutionSimulationAdapter,
  ExecutionSimulationAdapter,
] {
  return [referenceSimulationDouble(), alternateSimulationDouble()];
}

/* ------------------------------------------------------------------ */
/* The replay-event corpus (the canonical interactive session)          */
/* ------------------------------------------------------------------ */

export const REPLAY_FIXTURE_OPERATOR: LaneOperator = {
  operatorId: "user-demo-engineer",
  role: "engineer",
};

/**
 * The canonical replay-event sequence of the wall-upgrade interactive
 * session — one event per lane transition (AUTHOR → PRESENT →
 * CLASH → CONFLICT → QUANTIFY → WHAT-IF → SEQUENCE → ACCEPT), the
 * recorded audit trail the replay law must reproduce byte-identically.
 */
export const FIXTURE_REPLAY_EVENTS: readonly SolutionReplayEvent[] = [
  {
    event: "command-authored",
    operator: REPLAY_FIXTURE_OPERATOR,
    modality: "direct-manipulation",
    operationId: FIXTURE_DEMOLITION_OPERATION_ID,
    commandKind: "remove",
    authoredAt: "2026-09-16T09:00:00.000Z",
  },
  {
    event: "ghost-presented",
    operator: REPLAY_FIXTURE_OPERATOR,
    solutionId: FIXTURE_QUANTIFY_WORLD.version.solutionId,
    versionNumber: 1,
    presentationToken: "fixture-presentation-token-0001",
    proposedElementCount: 1,
    declaredAt: "2026-09-16T09:01:00.000Z",
  },
  {
    event: "clash-detected",
    operator: REPLAY_FIXTURE_OPERATOR,
    reportId: "fixture-clash-report-0001",
    clashCount: 1,
    withinToleranceCount: 1,
    declaredAt: "2026-10-05T09:00:00.000Z",
  },
  {
    event: "conflict-recorded",
    operator: REPLAY_FIXTURE_OPERATOR,
    conflictIds: ["fixture-conflict-0001"],
    problemId: "problem-demo-coordination-001",
    recordedAt: "2026-10-05T09:10:00.000Z",
  },
  {
    event: "quantity-projected",
    operator: REPLAY_FIXTURE_OPERATOR,
    projectionId: "fixture-projection-0001",
    lineCount: 1,
    baselineBoqId: FIXTURE_QUANTIFY_WORLD.boq.boqId,
    declaredAt: "2026-10-05T10:00:00.000Z",
  },
  {
    event: "what-if-compared",
    operator: REPLAY_FIXTURE_OPERATOR,
    comparisonId: "fixture-comparison-0001",
    alternativeCount: 2,
    declaredAt: "2026-10-05T10:30:00.000Z",
  },
  {
    event: "sequence-computed",
    operator: REPLAY_FIXTURE_OPERATOR,
    trajectoryId: "fixture-trajectory-0001",
    makespanHours: 48,
    activityCount: 3,
    declaredAt: "2026-10-05T11:00:00.000Z",
  },
  {
    event: "solution-accepted",
    operator: REPLAY_FIXTURE_OPERATOR,
    solutionId: FIXTURE_QUANTIFY_WORLD.version.solutionId,
    versionNumber: 1,
    decidedAt: "2026-10-05T12:00:00.000Z",
    note: "accepted after the shift-south alternative cleared the beam clash",
  },
];

/** A replay event with a malformed instant (the clock-read drill). */
export const FIXTURE_REPLAY_EVENT_BAD_INSTANT: SolutionReplayEvent = {
  event: "quantity-projected",
  operator: REPLAY_FIXTURE_OPERATOR,
  projectionId: "fixture-projection-0002",
  lineCount: 1,
  baselineBoqId: null,
  declaredAt: "not-an-instant",
};
