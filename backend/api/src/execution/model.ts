/**
 * AISE-031 — Execution/outcome loop domain model.
 *
 * Contract (spec/work-orders.md §031: "Owner ZAI. Record approved
 * intervention, execution evidence, post-work capture and outcome
 * observations without overwriting history. Verify lineage from issue to
 * outcome."; spec/requirements.md R13 — "After execution, new capture shall
 * create observed post-work state and link it to the intervention scenario
 * and outcome. Acceptance: historical states remain immutable; outcome data
 * can be used in future benchmark/learning datasets."; spec/domain-model.md
 * "Intervention semantics" — "States are `PROPOSED` until execution evidence
 * is recorded."; spec/architecture-lock.md "Authority" #6 — "Intervention
 * states are proposals until supported by post-execution evidence";
 * "Intervention" — "Executed outcomes require new field evidence before
 * becoming observed reality"):
 *
 * THE EXECUTION DOMAIN IS A RECORD KEEPER, NEVER A SECOND AUTHORITY:
 *
 *  - An `ExecutionRecord` records that an APPROVED intervention scenario
 *    state was executed in the field. It links, BY ID ONLY, the case
 *    (AISE-025 authority), the intervention scenario/state/step ids
 *    (AISE-026 authority), the execution evidence (AISE-008 authority) and
 *    post-work capture sessions (AISE-004 authority). Every reference is
 *    resolved READ-ONLY through injected resolvers (see service.ts) — this
 *    module never imports a sibling module's runtime surface, so there is
 *    structurally no write path from here into the case, intervention,
 *    evidence or capture authorities. Values behind the ids are NEVER
 *    re-parsed (house id-only-reference style).
 *  - PROJECTION DISCIPLINE for the intervention state transition: the
 *    domain model says intervention states are PROPOSED until execution
 *    evidence is recorded. The transition PROPOSED → EXECUTED is recorded
 *    HERE, as the embedded `StateTransitionRecord` on the execution record
 *    (plus the derived `getStateExecution` query in service.ts). The
 *    intervention module's own records are NEVER mutated by this domain —
 *    its scenario keeps `status: "approved"`; the post-evidence view of its
 *    states lives exclusively in the execution domain.
 *  - An `OutcomeObservation` is an OBSERVED post-work fact: `epistemicStatus`
 *    is the LITERAL type `"OBSERVED"` — carrying INFERRED/PROPOSED on an
 *    outcome is a COMPILE ERROR, and the boundary + stored-record parsers
 *    reject any other value at runtime. An outcome REQUIRES a non-empty
 *    `evidenceIds` list (`outcome_without_evidence`) — new field evidence
 *    after the work (R13); post-work capture sessions are referenced by id
 *    when the observation derives from a capture.
 *  - APPEND-ONLY HISTORY (exactly the AISE-025 case discipline): every
 *    mutation appends one `ExecutionEvent` carrying the sha256 digest of
 *    the full changed record content (see `executionContentDigest`). The
 *    file is rewritten, but prior events and their digests are never
 *    recomputed or changed. Records are never mutated: there is no
 *    update/delete; a CORRECTION is a NEW outcome observation (or a new
 *    execution record), never a rewrite.
 *  - Governed path: recording an execution of a scenario whose (read-only)
 *    context status is not `approved` is a typed refusal
 *    (`scenario_not_approved`) — the work order's "approved intervention".
 *  - Determinism: content-derived ids (`out-<16 hex>` via lib/hash over
 *    executionRecordId + position + canonical payload), positional event
 *    ids, injected clock only, canonical JSON everywhere. The same
 *    operation sequence plus the same clock produces byte-identical store
 *    files in fresh stores.
 *
 * This module owns the frozen vocabularies, record types, the typed error
 * registry, boundary input parsers (shape/vocabulary → typed codes), the
 * canonical content digest, the read-only authority projections
 * (`InterventionContext` / `CaseContext`) and the stored-record parser.
 * Policy lives in `service.ts`; persistence in `store.ts`; transport in
 * `router.ts`.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
// READ-ONLY TYPE imports from the owning authorities (erased at runtime —
// no value, store or write function ever crosses this boundary):
import type { InterventionScenario } from "../intervention/model";
import type { EngineeringCase } from "../cases/model";

/* ------------------------------------------------------------------ */
/* Vocabularies (frozen: `as const` types + Object.freeze runtime)      */
/* ------------------------------------------------------------------ */

/**
 * The state-level epistemic vocabulary of the execution domain: a proposed
 * intervention state stays PROPOSED until execution evidence is recorded,
 * then the execution domain's derived view is EXECUTED (domain model,
 * "Intervention semantics"). OBSERVED reality remains the Reality Graph's
 * vocabulary — executed ≠ observed (lock: "Executed outcomes require new
 * field evidence before becoming observed reality").
 */
export const STATE_EXECUTION_STATUSES = Object.freeze(["PROPOSED", "EXECUTED"] as const);
export type StateExecutionStatusKind = (typeof STATE_EXECUTION_STATUSES)[number];

export const EXECUTION_EVENT_TYPES = Object.freeze([
  "execution_recorded",
  "outcome_recorded",
] as const);
export type ExecutionEventType = (typeof EXECUTION_EVENT_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)           */
/* ------------------------------------------------------------------ */

export const EXECUTION_ERROR_CODES = Object.freeze([
  // shape / vocabulary validation (422 at the HTTP boundary)
  "invalid_execution",
  "invalid_outcome",
  "invalid_statement",
  "invalid_evidence_ref",
  "invalid_capture_ref",
  "invalid_timestamp",
  // semantic invariants (422)
  "execution_without_steps",
  "execution_without_evidence",
  "outcome_without_evidence",
  "outcome_case_mismatch",
  "unknown_case_ref",
  "unknown_scenario_ref",
  "unknown_state_ref",
  "unknown_step_ref",
  "unknown_evidence_ref",
  "step_not_in_state",
  "scenario_not_approved",
  "execution_exists",
  // lineage verification — the issue→outcome chain must be complete (422)
  "lineage_missing_execution",
  "lineage_missing_outcome",
  "lineage_missing_capture",
  // not-found (404)
  "execution_not_found",
  "case_not_found",
  // identity / persistence / path addressing (400 / 422 / 422)
  "invalid_execution_id",
  "invalid_case_id",
  "invalid_scenario_ref",
  "invalid_execution_record",
] as const);
export type ExecutionErrorCode = (typeof EXECUTION_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class ExecutionError extends Error {
  readonly code: ExecutionErrorCode;
  readonly detail: string;

  constructor(code: ExecutionErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ExecutionError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Read-only authority projections (id-and-governance only)            */
/* ------------------------------------------------------------------ */

/**
 * The execution domain's READ-ONLY projection of an intervention scenario
 * (AISE-026 authority): identity, governance status and the id/index spine
 * of steps and states. Proposed node/property VALUES are deliberately NOT
 * projected — this domain links ids, it never re-parses the proposal
 * content. Foreign vocabularies (status, review decision) are carried
 * VERBATIM as strings: interpreting them belongs to their owning module.
 */
export interface InterventionContext {
  readonly scenarioId: string;
  /** Intervention scenario status, verbatim (draft|under_review|approved|rejected|superseded). */
  readonly status: string;
  readonly title: string;
  readonly baselineVersionId: string;
  /** Present on approved scenarios (their approval gate requires one). */
  readonly approvalReference?: {
    readonly caseId: string;
    readonly reviewDecision: string;
    readonly reviewedAt: string;
  };
  readonly steps: readonly {
    readonly stepId: string;
    readonly stepIndex: number;
  }[];
  readonly states: readonly {
    readonly stateId: string;
    readonly stateIndex: number;
    /** Steps 1..stateIndex in application order (their id spine). */
    readonly appliedStepIds: readonly string[];
  }[];
}

/**
 * The execution domain's READ-ONLY projection of an engineering case
 * (AISE-025 authority): identity, lifecycle status and the observation/
 * hypothesis spine (statements carried verbatim for the lineage report —
 * they are the "issue" end of the issue→outcome chain).
 */
export interface CaseContext {
  readonly caseId: string;
  /** Case status, verbatim (open|under_review|resolved|closed). */
  readonly status: string;
  readonly title: string;
  readonly observations: readonly {
    readonly observationId: string;
    readonly statement: string;
    readonly evidenceIds: readonly string[];
  }[];
  readonly hypotheses: readonly {
    readonly hypothesisId: string;
    readonly statement: string;
    readonly epistemicStatus: string;
    readonly confidence: string;
  }[];
}

/**
 * Pure projection: a full intervention scenario record → the execution
 * domain's read-only context. Ids, governance and the step/state spine
 * ONLY — proposal content values are never copied or re-parsed.
 */
export function projectInterventionContext(scenario: InterventionScenario): InterventionContext {
  return {
    scenarioId: scenario.scenarioId,
    status: scenario.status,
    title: scenario.title,
    baselineVersionId: scenario.baselineVersionId,
    ...(scenario.approvalReference === undefined
      ? {}
      : {
          approvalReference: {
            caseId: scenario.approvalReference.caseId,
            reviewDecision: scenario.approvalReference.reviewDecision,
            reviewedAt: scenario.approvalReference.reviewedAt,
          },
        }),
    steps: scenario.steps.map((step) => ({ stepId: step.stepId, stepIndex: step.stepIndex })),
    states: scenario.states.map((state) => ({
      stateId: state.stateId,
      stateIndex: state.stateIndex,
      appliedStepIds: [...state.appliedStepIds],
    })),
  };
}

/**
 * Pure projection: a full engineering case record → the execution domain's
 * read-only context (the issue end of the lineage chain).
 */
export function projectCaseContext(record: EngineeringCase): CaseContext {
  return {
    caseId: record.caseId,
    status: record.status,
    title: record.title,
    observations: record.observations.map((observation) => ({
      observationId: observation.observationId,
      statement: observation.statement,
      evidenceIds: [...observation.evidenceIds],
    })),
    hypotheses: record.hypotheses.map((hypothesis) => ({
      hypothesisId: hypothesis.hypothesisId,
      statement: hypothesis.statement,
      epistemicStatus: hypothesis.epistemicStatus,
      confidence: hypothesis.confidence,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Record types                                                         */
/* ------------------------------------------------------------------ */

/**
 * The execution-domain record of the intervention state transition
 * (domain model: "States are PROPOSED until execution evidence is
 * recorded"). Pinned at execution-record creation — the evidence list is
 * exactly the record's execution evidence. The intervention authority's
 * own records are never mutated; this record IS the post-evidence view.
 */
export interface StateTransitionRecord {
  readonly scenarioId: string;
  readonly stateId: string;
  readonly fromStatus: "PROPOSED";
  readonly toStatus: "EXECUTED";
  readonly executionRecordId: string;
  /** Exactly the execution record's evidenceIds (what made it evidence-backed). */
  readonly evidenceIds: readonly string[];
  readonly recordedAt: string;
}

/**
 * A recorded post-work fact. Always OBSERVED (literal type); requires new
 * field evidence; immutable once recorded (a contradicting outcome is a NEW
 * outcome observation, never a rewrite). `captureSessionIds` reference the
 * post-work capture sessions when the observation derives from capture
 * (ids only, verbatim — the Capture authority owns their records).
 */
export interface OutcomeObservation {
  readonly outcomeId: string;
  readonly executionRecordId: string;
  /** Must equal the execution record's caseId (the issue being closed out). */
  readonly caseId: string;
  readonly statement: string;
  readonly epistemicStatus: "OBSERVED";
  /** REQUIRED non-empty: new field evidence observed AFTER the work. */
  readonly evidenceIds: readonly string[];
  /** Post-work capture session references (ids only, verbatim). */
  readonly captureSessionIds: readonly string[];
  /** Optional measurement record references (ids only, values never re-parsed). */
  readonly measurementRefs?: readonly string[];
  readonly recordedAt: string;
}

/** One append-only audit event: pins the full record content digest. */
export interface ExecutionEvent {
  readonly eventId: string;
  readonly eventType: ExecutionEventType;
  readonly occurredAt: string;
  /** sha256 of the execution content (record minus history) AFTER this mutation. */
  readonly recordDigest: string;
}

/**
 * The record that an APPROVED intervention scenario state was executed in
 * the field. Links, BY ID ONLY: the case, the scenario/state/executed
 * steps, the execution evidence and (optionally) work-time capture
 * sessions. Append-only; never mutated; corrections are new records.
 */
export interface ExecutionRecord {
  readonly executionRecordId: string;
  readonly caseId: string;
  readonly scenarioId: string;
  /** The materialized intervention state layer this execution realizes. */
  readonly stateId: string;
  /** Scenario steps executed BY THIS RECORD (⊆ the state's applied steps). */
  readonly executedStepIds: readonly string[];
  /** REQUIRED non-empty: evidence that the work was executed. */
  readonly evidenceIds: readonly string[];
  /** Work-time capture session references (ids only, verbatim). */
  readonly captureSessionIds: readonly string[];
  /** Caller-declared work completion instant (ISO-8601 UTC, verbatim). */
  readonly executedAt: string;
  /** Injected clock — when the record was written. */
  readonly recordedAt: string;
  /** The execution-domain PROPOSED → EXECUTED state transition record. */
  readonly stateTransition: StateTransitionRecord;
  readonly outcomes: readonly OutcomeObservation[];
  readonly history: readonly ExecutionEvent[];
}

/** List projection (never the full record). */
export interface ExecutionSummary {
  readonly executionRecordId: string;
  readonly caseId: string;
  readonly scenarioId: string;
  readonly stateId: string;
  readonly executedStepCount: number;
  readonly evidenceCount: number;
  readonly captureSessionCount: number;
  readonly outcomeCount: number;
  readonly executedAt: string;
  readonly recordedAt: string;
}

/** Pure list projection of one execution record. */
export function summarizeExecution(record: ExecutionRecord): ExecutionSummary {
  return {
    executionRecordId: record.executionRecordId,
    caseId: record.caseId,
    scenarioId: record.scenarioId,
    stateId: record.stateId,
    executedStepCount: record.executedStepIds.length,
    evidenceCount: record.evidenceIds.length,
    captureSessionCount: record.captureSessionIds.length,
    outcomeCount: record.outcomes.length,
    executedAt: record.executedAt,
    recordedAt: record.recordedAt,
  };
}

/**
 * Derived per-state view implementing the domain-model rule: PROPOSED until
 * execution evidence is recorded, EXECUTED afterwards. `executionRecordId`,
 * `evidenceIds` and `recordedAt` are present iff status is EXECUTED (the
 * earliest recorded execution evidence for that state wins; ties break by
 * executionRecordId — deterministic, documented).
 */
export interface StateExecutionView {
  readonly scenarioId: string;
  readonly stateId: string;
  readonly stateIndex: number;
  readonly epistemicStatus: StateExecutionStatusKind;
  readonly executionRecordId?: string;
  readonly evidenceIds?: readonly string[];
  readonly recordedAt?: string;
}

/**
 * The verified issue→outcome lineage (work order: "Verify lineage from
 * issue to outcome"). Built ONLY when every hop resolves — a missing link
 * is a typed refusal, never a silently truncated chain.
 */
export interface CaseLineage {
  readonly caseId: string;
  readonly case: CaseContext;
  readonly executions: readonly {
    readonly executionRecordId: string;
    readonly executedAt: string;
    readonly recordedAt: string;
    readonly scenario: InterventionContext;
    readonly executedState: {
      readonly stateId: string;
      readonly stateIndex: number;
      readonly appliedStepIds: readonly string[];
    };
    readonly executedStepIds: readonly string[];
    readonly executionEvidenceIds: readonly string[];
    readonly postWorkCaptureSessionIds: readonly string[];
    readonly stateTransition: StateTransitionRecord;
    readonly outcomes: readonly OutcomeObservation[];
  }[];
}

/* ------------------------------------------------------------------ */
/* Digest                                                               */
/* ------------------------------------------------------------------ */

/**
 * sha256 over the canonical JSON of the execution CONTENT (every field
 * except the audit history). Pure: the same content always yields the same
 * digest — this pins what each event committed and keeps two stores
 * running the same operation sequence byte-identical.
 */
export function executionContentDigest(record: ExecutionRecord): string {
  const {
    executionRecordId,
    caseId,
    scenarioId,
    stateId,
    executedStepIds,
    evidenceIds,
    captureSessionIds,
    executedAt,
    recordedAt,
    stateTransition,
    outcomes,
  } = record;
  return sha256Hex(
    canonicalJsonStringify({
      executionRecordId,
      caseId,
      scenarioId,
      stateId,
      executedStepIds,
      evidenceIds,
      captureSessionIds,
      executedAt,
      recordedAt,
      stateTransition,
      outcomes,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Boundary input parsers (shape/vocabulary; semantic checks in service)*/
/* ------------------------------------------------------------------ */

export interface RecordExecutionInput {
  readonly executionRecordId: string;
  readonly caseId: string;
  readonly scenarioId: string;
  readonly stateId: string;
  readonly executedStepIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly captureSessionIds?: readonly string[];
  readonly executedAt: string;
}

export interface RecordOutcomeInput {
  readonly caseId: string;
  readonly statement: string;
  readonly evidenceIds: readonly string[];
  readonly captureSessionIds?: readonly string[];
  readonly measurementRefs?: readonly string[];
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTENT_ID = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && ISO_UTC.test(value);
}

function isContentId(value: unknown): value is string {
  return typeof value === "string" && CONTENT_ID.test(value);
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0)
  );
}

/** Evidence ids are Evidence-Graph content addresses (64 lowercase hex). */
function parseEvidenceIds(value: unknown, emptyCode: ExecutionErrorCode): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ExecutionError(
      emptyCode,
      "evidenceIds must be a NON-EMPTY array of evidence content ids",
    );
  }
  if (!value.every((entry) => isContentId(entry))) {
    throw new ExecutionError(
      "invalid_evidence_ref",
      "every evidenceId must be a 64-hex Evidence-Graph content address (values are never re-parsed)",
    );
  }
  return value;
}

/** Capture session ids are opaque non-empty strings, carried VERBATIM. */
function parseCaptureSessionIds(value: unknown): string[] {
  if (!isStringArray(value)) {
    throw new ExecutionError(
      "invalid_capture_ref",
      "captureSessionIds must be an array of non-empty strings (ids only, carried verbatim)",
    );
  }
  return value;
}

/** executionRecordId shape (caller-stable opaque identity, 1..256 chars). */
export function validateExecutionRecordId(executionRecordId: string): void {
  if (
    typeof executionRecordId !== "string" ||
    executionRecordId.length < 1 ||
    executionRecordId.length > 256
  ) {
    throw new ExecutionError("invalid_execution_id", "executionRecordId must be 1..256 characters");
  }
}

/** caseId shape (mirrors the Engineering Case authority's bounds). */
export function validateCaseRefId(caseId: string): void {
  if (typeof caseId !== "string" || caseId.length < 1 || caseId.length > 256) {
    throw new ExecutionError("invalid_case_id", "caseId must be 1..256 characters");
  }
}

/** scenarioId shape (mirrors the Intervention authority's bounds). */
export function validateScenarioRefId(scenarioId: string): void {
  if (typeof scenarioId !== "string" || scenarioId.length < 1 || scenarioId.length > 256) {
    throw new ExecutionError("invalid_scenario_ref", "scenarioId must be 1..256 characters");
  }
}

export function parseRecordExecutionInput(payload: unknown): RecordExecutionInput {
  if (!isRecord(payload)) {
    throw new ExecutionError("invalid_execution", "expected a JSON object");
  }
  const executionRecordId = payload["executionRecordId"];
  if (!isNonEmptyString(executionRecordId)) {
    throw new ExecutionError("invalid_execution_id", "executionRecordId must be a non-empty string");
  }
  validateExecutionRecordId(executionRecordId);
  const caseId = payload["caseId"];
  if (!isNonEmptyString(caseId)) {
    throw new ExecutionError("invalid_execution", "caseId must be a non-empty string");
  }
  validateCaseRefId(caseId);
  const scenarioId = payload["scenarioId"];
  if (!isNonEmptyString(scenarioId)) {
    throw new ExecutionError("invalid_execution", "scenarioId must be a non-empty string");
  }
  validateScenarioRefId(scenarioId);
  const stateId = payload["stateId"];
  if (!isContentId(stateId)) {
    throw new ExecutionError(
      "invalid_execution",
      "stateId must be the 64-hex content id of a materialized intervention state",
    );
  }
  const executedStepIds = payload["executedStepIds"];
  if (executedStepIds === undefined || !isStringArray(executedStepIds)) {
    throw new ExecutionError(
      "invalid_execution",
      "executedStepIds must be an array of non-empty strings (intervention step ids)",
    );
  }
  if (executedStepIds.length === 0) {
    throw new ExecutionError(
      "execution_without_steps",
      "executedStepIds is required and must be non-empty — an execution record must name the intervention steps it executes",
    );
  }
  const evidenceIds = parseEvidenceIds(payload["evidenceIds"], "execution_without_evidence");
  const captureSessionIds =
    payload["captureSessionIds"] === undefined
      ? undefined
      : parseCaptureSessionIds(payload["captureSessionIds"]);
  const executedAt = payload["executedAt"];
  if (!isIso(executedAt)) {
    throw new ExecutionError(
      "invalid_timestamp",
      "executedAt must be an ISO-8601 UTC timestamp (milliseconds, e.g. 2026-03-02T09:00:00.000Z)",
    );
  }
  return {
    executionRecordId,
    caseId,
    scenarioId,
    stateId,
    executedStepIds,
    evidenceIds,
    ...(captureSessionIds === undefined ? {} : { captureSessionIds }),
    executedAt,
  };
}

export function parseRecordOutcomeInput(payload: unknown): RecordOutcomeInput {
  if (!isRecord(payload)) {
    throw new ExecutionError("invalid_outcome", "expected a JSON object");
  }
  const caseId = payload["caseId"];
  if (!isNonEmptyString(caseId)) {
    throw new ExecutionError("invalid_outcome", "caseId must be a non-empty string");
  }
  validateCaseRefId(caseId);
  const statement = payload["statement"];
  if (!isNonEmptyString(statement)) {
    throw new ExecutionError("invalid_statement", "statement must be a non-empty string");
  }
  // Epistemic discipline enforced AT THE BOUNDARY: an outcome that claims an
  // inference status is a typed rejection, never a silent coercion.
  const claimed = payload["epistemicStatus"];
  if (claimed !== undefined && claimed !== "OBSERVED") {
    throw new ExecutionError(
      "invalid_outcome",
      "outcome observations are always OBSERVED — record an interpretation on the case instead",
    );
  }
  const evidenceIds = parseEvidenceIds(payload["evidenceIds"], "outcome_without_evidence");
  const captureSessionIds =
    payload["captureSessionIds"] === undefined
      ? undefined
      : parseCaptureSessionIds(payload["captureSessionIds"]);
  const measurementRefs = payload["measurementRefs"];
  if (measurementRefs !== undefined && !isStringArray(measurementRefs)) {
    throw new ExecutionError(
      "invalid_outcome",
      "measurementRefs must be an array of non-empty strings (ids only, values never re-parsed)",
    );
  }
  return {
    caseId,
    statement,
    evidenceIds,
    ...(captureSessionIds === undefined ? {} : { captureSessionIds }),
    ...(measurementRefs === undefined ? {} : { measurementRefs }),
  };
}

/* ------------------------------------------------------------------ */
/* Stored-record parser (store reads; write-time duty is the service's)*/
/* ------------------------------------------------------------------ */

function invalidRecord(detail: string): ExecutionError {
  return new ExecutionError("invalid_execution_record", detail);
}

function parseStoredStateTransition(
  value: unknown,
  record: {
    executionRecordId: string;
    scenarioId: string;
    stateId: string;
    evidenceIds: readonly string[];
  },
): StateTransitionRecord {
  if (!isRecord(value)) throw invalidRecord("stateTransition is not an object");
  if (!isNonEmptyString(value["scenarioId"])) throw invalidRecord("stateTransition.scenarioId");
  if (!isContentId(value["stateId"])) throw invalidRecord("stateTransition.stateId");
  if (value["fromStatus"] !== "PROPOSED") {
    throw invalidRecord("stateTransition.fromStatus must be PROPOSED");
  }
  if (value["toStatus"] !== "EXECUTED") {
    throw invalidRecord("stateTransition.toStatus must be EXECUTED");
  }
  if (!isNonEmptyString(value["executionRecordId"])) {
    throw invalidRecord("stateTransition.executionRecordId");
  }
  const evidenceIds = value["evidenceIds"];
  if (!Array.isArray(evidenceIds) || !evidenceIds.every((entry) => isContentId(entry))) {
    throw invalidRecord("stateTransition.evidenceIds must be 64-hex content ids");
  }
  if (!isIso(value["recordedAt"])) throw invalidRecord("stateTransition.recordedAt");
  // Structural coherence: the embedded transition must describe EXACTLY the
  // record it lives on (garbage on disk is a typed rejection, never a
  // silently misread projection).
  if (value["scenarioId"] !== record.scenarioId || value["stateId"] !== record.stateId) {
    throw invalidRecord("stateTransition must pin the record's own scenarioId/stateId");
  }
  if (value["executionRecordId"] !== record.executionRecordId) {
    throw invalidRecord("stateTransition must pin the record's own executionRecordId");
  }
  if (canonicalJsonStringify(evidenceIds) !== canonicalJsonStringify(record.evidenceIds)) {
    throw invalidRecord("stateTransition.evidenceIds must equal the record's evidenceIds");
  }
  return {
    scenarioId: value["scenarioId"],
    stateId: value["stateId"],
    fromStatus: "PROPOSED",
    toStatus: "EXECUTED",
    executionRecordId: value["executionRecordId"],
    evidenceIds,
    recordedAt: value["recordedAt"],
  };
}

function parseStoredOutcome(
  value: unknown,
  record: { executionRecordId: string; caseId: string },
): OutcomeObservation {
  if (!isRecord(value)) throw invalidRecord("outcome entry is not an object");
  if (!isNonEmptyString(value["outcomeId"])) throw invalidRecord("outcome.outcomeId");
  if (!isNonEmptyString(value["statement"])) throw invalidRecord("outcome.statement");
  // THE OBSERVED-FACTS DISCIPLINE, re-checked on every read: an outcome is
  // OBSERVED or it is corruption — never silently re-read as a fact.
  if (value["epistemicStatus"] !== "OBSERVED") {
    throw invalidRecord("outcome.epistemicStatus must be OBSERVED");
  }
  if (!isIso(value["recordedAt"])) throw invalidRecord("outcome.recordedAt");
  const evidenceIds = value["evidenceIds"];
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
    throw invalidRecord("outcome.evidenceIds must be a non-empty array");
  }
  if (!evidenceIds.every((entry) => isContentId(entry))) {
    throw invalidRecord("outcome.evidenceIds must be 64-hex content ids");
  }
  const captureSessionIds = value["captureSessionIds"];
  if (captureSessionIds === undefined || !isStringArray(captureSessionIds)) {
    throw invalidRecord("outcome.captureSessionIds must be a string array");
  }
  const measurementRefs = value["measurementRefs"];
  if (measurementRefs !== undefined && !isStringArray(measurementRefs)) {
    throw invalidRecord("outcome.measurementRefs");
  }
  if (value["executionRecordId"] !== record.executionRecordId) {
    throw invalidRecord("outcome must pin its own executionRecordId");
  }
  if (value["caseId"] !== record.caseId) {
    throw invalidRecord("outcome must pin the execution record's caseId");
  }
  return {
    outcomeId: value["outcomeId"],
    executionRecordId: value["executionRecordId"],
    caseId: value["caseId"],
    statement: value["statement"],
    epistemicStatus: "OBSERVED",
    recordedAt: value["recordedAt"],
    evidenceIds,
    captureSessionIds,
    ...(measurementRefs === undefined ? {} : { measurementRefs }),
  };
}

function parseStoredEvent(value: unknown): ExecutionEvent {
  if (!isRecord(value)) throw invalidRecord("history entry is not an object");
  if (!isNonEmptyString(value["eventId"])) throw invalidRecord("history.eventId");
  const eventType = value["eventType"];
  if (eventType !== "execution_recorded" && eventType !== "outcome_recorded") {
    throw invalidRecord("history.eventType");
  }
  if (!isIso(value["occurredAt"])) throw invalidRecord("history.occurredAt");
  if (!isContentId(value["recordDigest"])) {
    throw invalidRecord("history.recordDigest must be a 64-hex digest");
  }
  return {
    eventId: value["eventId"],
    eventType,
    occurredAt: value["occurredAt"],
    recordDigest: value["recordDigest"],
  };
}

/**
 * Structural validation of a persisted execution record (store reads;
 * garbage on disk is a typed `invalid_execution_record` rejection, never a
 * silent misparse). Deep semantic invariants are the write-time service's
 * duty.
 */
export function parseExecutionRecord(value: unknown): ExecutionRecord {
  if (!isRecord(value)) throw invalidRecord("execution record is not a JSON object");
  if (!isNonEmptyString(value["executionRecordId"])) {
    throw invalidRecord("executionRecordId");
  }
  validateExecutionRecordId(value["executionRecordId"]);
  if (!isNonEmptyString(value["caseId"])) throw invalidRecord("caseId");
  if (!isNonEmptyString(value["scenarioId"])) throw invalidRecord("scenarioId");
  if (!isContentId(value["stateId"])) {
    throw invalidRecord("stateId must be a 64-hex content id");
  }
  const executedStepIds = value["executedStepIds"];
  if (!Array.isArray(executedStepIds) || executedStepIds.length === 0) {
    throw invalidRecord("executedStepIds must be a non-empty array");
  }
  if (!isStringArray(executedStepIds)) throw invalidRecord("executedStepIds entries");
  const evidenceIds = value["evidenceIds"];
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
    throw invalidRecord("evidenceIds must be a non-empty array");
  }
  if (!evidenceIds.every((entry) => isContentId(entry))) {
    throw invalidRecord("evidenceIds must be 64-hex content ids");
  }
  const captureSessionIds = value["captureSessionIds"];
  if (captureSessionIds === undefined || !isStringArray(captureSessionIds)) {
    throw invalidRecord("captureSessionIds must be a string array");
  }
  if (!isIso(value["executedAt"])) throw invalidRecord("executedAt");
  if (!isIso(value["recordedAt"])) throw invalidRecord("recordedAt");
  const outcomes = value["outcomes"];
  if (!Array.isArray(outcomes)) throw invalidRecord("outcomes must be an array");
  const history = value["history"];
  if (!Array.isArray(history)) throw invalidRecord("history must be an array");
  const record = {
    executionRecordId: value["executionRecordId"],
    caseId: value["caseId"],
    scenarioId: value["scenarioId"],
    stateId: value["stateId"],
    executedStepIds,
    evidenceIds,
    captureSessionIds,
    executedAt: value["executedAt"],
    recordedAt: value["recordedAt"],
    outcomes,
  };
  return {
    ...record,
    stateTransition: parseStoredStateTransition(value["stateTransition"], record),
    outcomes: outcomes.map((entry) => parseStoredOutcome(entry, record)),
    history: history.map(parseStoredEvent),
  };
}
