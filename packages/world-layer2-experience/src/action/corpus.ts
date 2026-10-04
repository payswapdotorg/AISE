/**
 * WORLD-P2 — the ACTION family corpus (`src/action/`).
 *
 * The committed, deterministic fixtures of the ACTION + AUDIT-TRAIL
 * stages: the fixture action inputs (ownership assignment, the
 * missing-evidence task dispatch, the gated solution proposal, the
 * governed resolution) and the audit-append inputs the lane runner emits
 * per stage transition.
 */

import { textDigestOf } from "../seam";
import type { RecordActionInput } from "./contract";
import {
  FIXTURE_ACTOR_ENGINEER,
  FIXTURE_ACTOR_FIELD_ENGINEER,
  FIXTURE_ACTOR_REVIEWER,
  FIXTURE_EVIDENCE_CRACK_PHOTO_1,
  FIXTURE_EVIDENCE_CRACK_PHOTO_2,
  FIXTURE_EVIDENCE_DIAL_GAUGE,
  FIXTURE_PROBLEM_ID,
  PROBLEM_FIXTURE_RECORDED_AT,
} from "../problem/corpus";
import { FIXTURE_EVIDENCE_PHOTO_1, FIXTURE_EVIDENCE_PHOTO_2 } from "../evidence/corpus";

/* ------------------------------------------------------------------ */
/* The fixture action inputs                                            */
/* ------------------------------------------------------------------ */

/** Scenario A: dispatch the explicit missing-evidence task (the readiness gap). */
export const SCENARIO_A_REQUEST_EVIDENCE_ACTION: RecordActionInput = {
  problemId: FIXTURE_PROBLEM_ID,
  actionKind: "request_evidence",
  payload: {
    actionKind: "request_evidence",
    /* Filled by the lane runner with the actual gap's task id. */
    taskId: "",
    requestedMethod: "SPECIALIST_INSTRUMENT",
    assignee: FIXTURE_ACTOR_FIELD_ENGINEER,
  },
  ownership: {
    owner: FIXTURE_ACTOR_FIELD_ENGINEER,
    assignedBy: FIXTURE_ACTOR_ENGINEER,
    assignedAt: PROBLEM_FIXTURE_RECORDED_AT,
  },
  evidenceContentIds: [FIXTURE_EVIDENCE_CRACK_PHOTO_1],
  createdAt: PROBLEM_FIXTURE_RECORDED_AT,
};

/** Scenario B: assign the strengthening investigation to the engineer. */
export const SCENARIO_B_ASSIGN_OWNER_ACTION: RecordActionInput = {
  problemId: FIXTURE_PROBLEM_ID,
  actionKind: "assign_owner",
  payload: {
    actionKind: "assign_owner",
    newOwner: FIXTURE_ACTOR_ENGINEER,
  },
  ownership: {
    owner: FIXTURE_ACTOR_ENGINEER,
    assignedBy: FIXTURE_ACTOR_ENGINEER,
    assignedAt: PROBLEM_FIXTURE_RECORDED_AT,
  },
  evidenceContentIds: [FIXTURE_EVIDENCE_CRACK_PHOTO_1, FIXTURE_EVIDENCE_CRACK_PHOTO_2],
  createdAt: PROBLEM_FIXTURE_RECORDED_AT,
};

/**
 * Scenario B: the gated solution proposal. `gateVerdictId` is filled by
 * the lane runner with the actual gate verdict id; the ACTION transform
 * refuses the action unless the supplied gate verdict resolves and
 * passes (law #3).
 */
export const SCENARIO_B_PROPOSE_OPERATION_ACTION: RecordActionInput = {
  problemId: FIXTURE_PROBLEM_ID,
  actionKind: "propose_solution_operation",
  payload: {
    actionKind: "propose_solution_operation",
    operationSummary:
      "Propose the governed strengthening operation: install a steel lintel replacement " +
      "keeping the opening geometry, per the deterministic engine snapshot attached.",
    gateVerdictId: "",
  },
  ownership: {
    owner: FIXTURE_ACTOR_ENGINEER,
    assignedBy: FIXTURE_ACTOR_ENGINEER,
    assignedAt: PROBLEM_FIXTURE_RECORDED_AT,
  },
  evidenceContentIds: [
    FIXTURE_EVIDENCE_CRACK_PHOTO_1,
    FIXTURE_EVIDENCE_CRACK_PHOTO_2,
    FIXTURE_EVIDENCE_DIAL_GAUGE,
  ],
  createdAt: PROBLEM_FIXTURE_RECORDED_AT,
};

/** The governed resolution (requires the approved review — law #4). */
export const FIXTURE_RESOLVE_ACTION: RecordActionInput = {
  problemId: FIXTURE_PROBLEM_ID,
  actionKind: "resolve_case",
  payload: {
    actionKind: "resolve_case",
    reviewDecision: "approved",
    note: "The reviewer approved the strengthening proposal on the measured basis.",
  },
  ownership: {
    owner: FIXTURE_ACTOR_REVIEWER,
    assignedBy: FIXTURE_ACTOR_ENGINEER,
    assignedAt: PROBLEM_FIXTURE_RECORDED_AT,
  },
  evidenceContentIds: [FIXTURE_EVIDENCE_DIAL_GAUGE],
  createdAt: PROBLEM_FIXTURE_RECORDED_AT,
};

/* ------------------------------------------------------------------ */
/* Negative fixtures (fail-closed drills)                               */
/* ------------------------------------------------------------------ */

/** An ungated consequential action (refused — law #3). */
export const UNGATED_PROPOSAL_ACTION: RecordActionInput = {
  ...SCENARIO_B_PROPOSE_OPERATION_ACTION,
  payload: {
    actionKind: "propose_solution_operation",
    operationSummary: "An ungated proposal — must be refused.",
    gateVerdictId: textDigestOf("AISE-WORLD-P2-fixture-gate-verdict-never-issued"),
  },
};

/** A resolution with a rejected review (refused — law #4). */
export const REJECTED_REVIEW_RESOLVE_ACTION: RecordActionInput = {
  ...FIXTURE_RESOLVE_ACTION,
  payload: {
    actionKind: "resolve_case",
    reviewDecision: "rejected",
    note: "A resolution attempt on a rejected review — must be refused.",
  },
};

/** An observation action without evidence (refused — law #5). */
export const UNEVIDENCED_OBSERVATION_ACTION: RecordActionInput = {
  problemId: FIXTURE_PROBLEM_ID,
  actionKind: "record_observation",
  payload: {
    actionKind: "record_observation",
    statement: "An observation without evidence — must be refused.",
    evidenceIds: [],
  },
  ownership: {
    owner: FIXTURE_ACTOR_FIELD_ENGINEER,
    assignedBy: FIXTURE_ACTOR_ENGINEER,
    assignedAt: PROBLEM_FIXTURE_RECORDED_AT,
  },
  evidenceContentIds: [],
  createdAt: PROBLEM_FIXTURE_RECORDED_AT,
};

/* Re-export the evidence photo fixtures for the lane runner's action set. */
export { FIXTURE_EVIDENCE_PHOTO_1, FIXTURE_EVIDENCE_PHOTO_2 };
