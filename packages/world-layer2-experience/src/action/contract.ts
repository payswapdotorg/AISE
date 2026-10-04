/**
 * WORLD-P2 — the ACTION family (`src/action/`): stages 7–8 of the lane.
 *
 *   ACTION      — the typed contract for actions on problems: OWNERSHIP
 *                 (owner / assigned-by / assigned-at — the incumbent's
 *                 assignee workflow behavior translated into typed AISE
 *                 records), a governed STATUS LIFECYCLE (the closed
 *                 transition table; invalid transitions are typed
 *                 refusals), typed per-kind payloads, evidence binding
 *                 and — for engineering-consequential kinds — a REQUIRED
 *                 deterministic-check gate verdict (an action claiming
 *                 engineering authority without a passing gate verdict is
 *                 refused).
 *   AUDIT TRAIL — the append-only audit ledger: EVERY lane transition is
 *                 one auditable record carrying WHO (the typed actor),
 *                 WHAT (the committed record's content digest), WHEN (a
 *                 declared instant), WHY (a human-readable reason + a
 *                 closed reason-kind vocabulary) and EVIDENCE-BOUND (the
 *                 evidence content ids the transition cites). Events
 *                 chain by content digests (each event pins the prior
 *                 event's id + digest — tamper-evident); replay re-derives
 *                 every event id deterministically (byte-identical).
 *
 * This is the incumbent's "action ownership/status + audit history +
 * information continuity" translated into the AISE evidence/case
 * architecture: there is no parallel task-management domain — an action
 * IS a typed, evidence-bound, auditable record on the problem.
 *
 * LAWS (on top of the seam's nine; enforced here and drilled by
 * `action.test.ts`):
 *
 *  1. OWNERSHIP IS EXPLICIT (seam law #7): every action carries an
 *     ownership block; an unowned action is refused.
 *  2. THE LIFECYCLE IS GOVERNED: only the closed transition table's edges
 *     are legal; anything else is a typed refusal (fail-closed).
 *  3. CONSEQUENTIAL ACTIONS REQUIRE THE GATE: `propose_solution_operation`
 *     REQUIRES a deterministic-check gate verdict whose verdict is `pass`
 *     — a failed/refused gate blocks the action; claiming a gate verdict
 *     that does not resolve is refused.
 *  4. RESOLUTION IS GOVERNED: `resolve_case` REQUIRES an approved review
 *     decision (the AISE-025 review laws translated); a rejected or
 *     needs-more-evidence review refuses the resolution.
 *  5. OBSERVATIONS REQUIRE EVIDENCE: a `record_observation` action's
 *     payload requires non-empty evidence ids (the Evidence Envelope law).
 *  6. THE AUDIT LEDGER IS APPEND-ONLY: sequences are monotonic; each
 *     event chains to the prior (id + digest); event ids are the content
 *     digests of the event records (re-derivable); MUTATION of a past
 *     event breaks replay and is refused by verification.
 *  7. EVERY LANE TRANSITION IS AUDITED: the lane runner emits exactly one
 *     audit event per stage transition, with the five mandatory fields
 *     (who/what/when/why/evidence-bound).
 *  8. DETERMINISM: replay is byte-identical; instants are declared; ids
 *     are content-derived.
 */

import {
  canonicalDigestOf,
  contentIdOf,
  deepFreeze,
  isCanonicalDigest,
  isDeclaredInstant,
  isNonEmptyString,
  isRecord,
  isStringArray,
  laneRefused,
  type LaneActor,
  type LaneOutcome,
  type LaneProviderDescriptor,
} from "../seam";
import type { Layer2StageName } from "../seam";
import type { DeterministicCheckGateVerdict } from "../reasoning/contract";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const PROBLEM_ACTION_KIND = "problem-action" as const;
export const PROBLEM_ACTION_SCHEMA_VERSION = "problem-action/1" as const;
export const AUDIT_TRAIL_KIND = "layer2-audit-trail" as const;
export const AUDIT_TRAIL_SCHEMA_VERSION = "layer2-audit-trail/1" as const;
export const AUDIT_RECORD_KIND = "layer2-audit-record" as const;

/**
 * Closed action-kind vocabulary — the incumbent's action workflow
 * behavior translated into typed AISE records. `propose_solution_operation`
 * is the engineering-consequential kind (gate-required, law #3);
 * `resolve_case` is the review-governed kind (law #4).
 */
export const ACTION_KINDS = [
  "assign_owner",
  "request_evidence",
  "record_observation",
  "record_inference",
  "propose_solution_operation",
  "request_review",
  "resolve_case",
  "close_case",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export function isActionKind(value: unknown): value is ActionKind {
  return typeof value === "string" && (ACTION_KINDS as readonly string[]).includes(value);
}

/** Closed action-status vocabulary + the governed transition table (law #2). */
export const ACTION_STATUSES = ["open", "in_progress", "completed", "blocked"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export function isActionStatus(value: unknown): value is ActionStatus {
  return (
    typeof value === "string" &&
    (ACTION_STATUSES as readonly string[]).includes(value)
  );
}

/**
 * THE CLOSED LIFECYCLE TRANSITION TABLE. Keys: from-state; values: the
 * legal to-states. `completed` is terminal. Invalid edges are typed
 * refusals — never silent state edits.
 */
export const ACTION_TRANSITIONS: Readonly<Record<ActionStatus, readonly ActionStatus[]>> = {
  open: ["in_progress", "blocked"],
  in_progress: ["completed", "blocked"],
  blocked: ["in_progress"],
  completed: [],
};

/** Closed review-decision vocabulary — mirrors AISE-025 verbatim. */
export const REVIEW_DECISIONS = ["approved", "rejected", "needs_more_evidence"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/** Closed audit reason-kind vocabulary (the typed WHY). */
export const AUDIT_REASON_KINDS = [
  "problem_statement",
  "context_assembly",
  "evidence_binding",
  "readiness_verdict",
  "insufficient_evidence_refusal",
  "bounded_reasoning_output",
  "engineering_authority",
  "ownership_assignment",
  "review_decision",
  "lifecycle_transition",
  "explicit_request",
] as const;
export type AuditReasonKind = (typeof AUDIT_REASON_KINDS)[number];

export function isAuditReasonKind(value: unknown): value is AuditReasonKind {
  return (
    typeof value === "string" &&
    (AUDIT_REASON_KINDS as readonly string[]).includes(value)
  );
}

/** Closed audit-event-kind vocabulary (which transition was audited). */
export const AUDIT_EVENT_KINDS = [
  "problem_defined",
  "context_assembled",
  "evidence_bound",
  "missing_evidence_detected",
  "bounded_reasoning_completed",
  "bounded_reasoning_refused",
  "deterministic_checks_gated",
  "action_recorded",
  "action_status_changed",
  "audit_replay_verified",
] as const;
export type AuditEventKind = (typeof AUDIT_EVENT_KINDS)[number];

/** Closed validation-failure vocabulary of this family (shape layer). */
export const ACTION_VALIDATION_FAILURE_KINDS = [
  "not-an-object",
  "missing-field",
  "type-mismatch",
  "value-out-of-range",
  "vocabulary-violation",
  "digest-format",
  "unresolved-gate-verdict",
  "gate-verdict-not-pass",
  "review-not-approved",
  "observation-without-evidence",
  "invalid-lifecycle-transition",
  "sequence-not-monotonic",
  "chain-broken",
  "event-id-not-content-derived",
  "reason-kind-inconsistent",
] as const;
export type ActionValidationFailureKind =
  (typeof ACTION_VALIDATION_FAILURE_KINDS)[number];

export interface ActionValidationFailure {
  readonly kind: ActionValidationFailureKind;
  readonly path: string;
  readonly detail: string;
}

export type ActionValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failures: readonly ActionValidationFailure[] };

/* ------------------------------------------------------------------ */
/* The typed action payloads (discriminated per kind)                   */
/* ------------------------------------------------------------------ */

export interface AssignOwnerPayload {
  readonly actionKind: "assign_owner";
  readonly newOwner: LaneActor;
}

export interface RequestEvidencePayload {
  readonly actionKind: "request_evidence";
  /** The missing-evidence task id being dispatched (must exist on the report). */
  readonly taskId: string;
  readonly requestedMethod: string | null;
  readonly assignee: LaneActor;
}

export interface RecordObservationPayload {
  readonly actionKind: "record_observation";
  readonly statement: string;
  /** REQUIRED non-empty (the Evidence Envelope law). */
  readonly evidenceIds: readonly string[];
}

export interface RecordInferencePayload {
  readonly actionKind: "record_inference";
  readonly claimId: string;
  readonly statement: string;
  /** The reasoning provenance digest the claim cites. */
  readonly provenanceDigest: string;
}

export interface ProposeSolutionOperationPayload {
  readonly actionKind: "propose_solution_operation";
  readonly operationSummary: string;
  /** REQUIRED: the deterministic-check gate verdict id (law #3). */
  readonly gateVerdictId: string;
}

export interface RequestReviewPayload {
  readonly actionKind: "request_review";
  readonly reviewer: LaneActor;
}

export interface ResolveCasePayload {
  readonly actionKind: "resolve_case";
  /** REQUIRED: the review decision must be `approved` (law #4). */
  readonly reviewDecision: ReviewDecision;
  readonly note: string;
}

export interface CloseCasePayload {
  readonly actionKind: "close_case";
  readonly closingNote: string;
}

export type ActionPayload =
  | AssignOwnerPayload
  | RequestEvidencePayload
  | RecordObservationPayload
  | RecordInferencePayload
  | ProposeSolutionOperationPayload
  | RequestReviewPayload
  | ResolveCasePayload
  | CloseCasePayload;

/* ------------------------------------------------------------------ */
/* The problem action                                                   */
/* ------------------------------------------------------------------ */

/** The ownership block (law #1 — explicit, typed, declared instants). */
export interface ActionOwnership {
  readonly owner: LaneActor;
  readonly assignedBy: LaneActor;
  readonly assignedAt: string;
}

/**
 * A typed action on a problem. `evidenceContentIds` binds the action to
 * the evidence it cites (the information-continuity law: the action is
 * auditable to evidence).
 */
export interface ProblemAction {
  readonly kind: typeof PROBLEM_ACTION_KIND;
  readonly schemaVersion: typeof PROBLEM_ACTION_SCHEMA_VERSION;
  readonly actionId: string;
  readonly problemId: string;
  readonly actionKind: ActionKind;
  readonly payload: ActionPayload;
  readonly ownership: ActionOwnership;
  readonly status: ActionStatus;
  readonly evidenceContentIds: readonly string[];
  readonly createdAt: string;
}

/** The ACTION-stage input (the controlled entry point's request). */
export interface RecordActionInput {
  readonly problemId: string;
  readonly actionKind: ActionKind;
  readonly payload: ActionPayload;
  readonly ownership: ActionOwnership;
  readonly evidenceContentIds: readonly string[];
  readonly createdAt: string;
}

/* ------------------------------------------------------------------ */
/* The audit records                                                    */
/* ------------------------------------------------------------------ */

/**
 * One append-only audit record: WHO / WHAT / WHEN / WHY / EVIDENCE-BOUND,
 * chained to the prior record (law #6). `eventId` is the content digest
 * of the record minus its own id — re-derivable, tamper-evident.
 */
export interface AuditRecord {
  readonly kind: typeof AUDIT_RECORD_KIND;
  readonly eventId: string;
  /** Monotonic 1-based sequence. */
  readonly sequence: number;
  readonly problemId: string;
  /** Which lane stage produced this transition. */
  readonly laneStage: Layer2StageName;
  readonly eventKind: AuditEventKind;
  readonly actor: LaneActor;
  /** WHAT: the digest of the committed typed record this event pins. */
  readonly subjectDigest: string;
  /** WHAT: the closed subject-kind name (which record type was committed). */
  readonly subjectKind: string;
  /** WHEN: the declared instant. */
  readonly occurredAt: string;
  /** WHY: human-readable. */
  readonly reason: string;
  /** WHY: the closed reason kind. */
  readonly reasonKind: AuditReasonKind;
  /** EVIDENCE-BOUND: the evidence content ids this transition cites. */
  readonly evidenceContentIds: readonly string[];
  /** The chain: the prior event's id + digest (null for the first event). */
  readonly priorEventId: string | null;
  readonly priorEventDigest: string | null;
}

/** The append-only audit trail of one problem. */
export interface AuditTrail {
  readonly kind: typeof AUDIT_TRAIL_KIND;
  readonly schemaVersion: typeof AUDIT_TRAIL_SCHEMA_VERSION;
  readonly problemId: string;
  readonly records: readonly AuditRecord[];
}

/** One append request (the controlled entry point's input). */
export interface AuditAppendInput {
  readonly problemId: string;
  readonly laneStage: Layer2StageName;
  readonly eventKind: AuditEventKind;
  readonly actor: LaneActor;
  readonly subjectDigest: string;
  readonly subjectKind: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly reasonKind: AuditReasonKind;
  readonly evidenceContentIds: readonly string[];
}

/** The deterministic replay-verification outcome. */
export interface ReplayVerification {
  readonly ok: boolean;
  readonly checkedEvents: number;
  readonly failures: readonly {
    readonly sequence: number;
    readonly kind: ActionValidationFailureKind;
    readonly detail: string;
  }[];
}

/* ------------------------------------------------------------------ */
/* The action-family ports                                              */
/* ------------------------------------------------------------------ */

/**
 * The provider-neutral action-recorder port: records a typed action on a
 * problem (validating the governance laws). The real occupant is the
 * WORLD-P4 wiring over the backend case/action store; the two in-memory
 * doubles in `doubles.ts` prove the contract WITHOUT any store.
 */
export interface ActionRecorder {
  readonly descriptor: LaneProviderDescriptor;
  readonly record: (
    input: RecordActionInput,
    gate: DeterministicCheckGateVerdict | null,
  ) => LaneOutcome<ProblemAction>;
}

/**
 * The provider-neutral audit-ledger port: appends auditable records and
 * verifies deterministic replay. The real occupant is the WORLD-P4 wiring
 * over the backend persistence; the two in-memory doubles prove the
 * contract WITHOUT any store.
 */
export interface AuditLedger {
  readonly descriptor: LaneProviderDescriptor;
  readonly append: (
    trail: AuditTrail | null,
    entry: AuditAppendInput,
  ) => LaneOutcome<AuditTrail>;
  readonly verifyReplay: (trail: AuditTrail) => ReplayVerification;
}

/* ------------------------------------------------------------------ */
/* Pure validators                                                      */
/* ------------------------------------------------------------------ */

function fail(
  failures: ActionValidationFailure[],
  kind: ActionValidationFailureKind,
  path: string,
  detail: string,
): void {
  failures.push({ kind, path, detail });
}

/** Validates an unknown payload as a `RecordActionInput`. PURE. */
export function validateRecordActionInput(
  input: unknown,
): ActionValidation<RecordActionInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "the action input must be an object" },
      ],
    };
  }
  const failures: ActionValidationFailure[] = [];
  if (!isCanonicalDigest(input["problemId"])) {
    fail(failures, "digest-format", "problemId", "must be a 64-hex problem id");
  }
  if (!isActionKind(input["actionKind"])) {
    fail(failures, "vocabulary-violation", "actionKind", `must be one of ${ACTION_KINDS.join(" | ")}`);
  }
  const payload = input["payload"];
  if (!isRecord(payload)) {
    fail(failures, "missing-field", "payload", "the typed action payload is required");
  } else if (
    input["actionKind"] !== undefined &&
    payload["actionKind"] !== input["actionKind"]
  ) {
    fail(
      failures,
      "vocabulary-violation",
      "payload.actionKind",
      `the payload discriminant must match the action kind (${String(input["actionKind"])})`,
    );
  }
  const ownership = input["ownership"];
  if (!isRecord(ownership)) {
    fail(failures, "missing-field", "ownership", "the ownership block is required (law #1)");
  } else {
    if (!isRecord(ownership["owner"]) || !isNonEmptyString(ownership["owner"]?.["actorId"])) {
      fail(failures, "type-mismatch", "ownership.owner", "the owner must be a typed actor");
    }
    if (!isRecord(ownership["assignedBy"]) || !isNonEmptyString(ownership["assignedBy"]?.["actorId"])) {
      fail(failures, "type-mismatch", "ownership.assignedBy", "the assigner must be a typed actor");
    }
    if (!isDeclaredInstant(ownership["assignedAt"])) {
      fail(failures, "type-mismatch", "ownership.assignedAt", "must be a declared ISO-8601 UTC instant");
    }
  }
  if (!isStringArray(input["evidenceContentIds"] ?? []) && !Array.isArray(input["evidenceContentIds"])) {
    fail(failures, "type-mismatch", "evidenceContentIds", "must be an array of evidence content ids");
  }
  if (!isDeclaredInstant(input["createdAt"])) {
    fail(failures, "type-mismatch", "createdAt", "must be a declared ISO-8601 UTC instant");
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as RecordActionInput };
}

/** Validates an unknown payload as a `ProblemAction` (the sealed record). PURE. */
export function validateProblemAction(
  input: unknown,
): ActionValidation<ProblemAction> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "the action record must be an object" },
      ],
    };
  }
  const failures: ActionValidationFailure[] = [];
  if (input["kind"] !== PROBLEM_ACTION_KIND) {
    fail(failures, "vocabulary-violation", "kind", `must be "${PROBLEM_ACTION_KIND}"`);
  }
  if (input["schemaVersion"] !== PROBLEM_ACTION_SCHEMA_VERSION) {
    fail(failures, "vocabulary-violation", "schemaVersion", `must be "${PROBLEM_ACTION_SCHEMA_VERSION}"`);
  }
  if (!isCanonicalDigest(input["actionId"])) {
    fail(failures, "digest-format", "actionId", "must be a 64-hex content-derived id");
  }
  if (!isCanonicalDigest(input["problemId"])) {
    fail(failures, "digest-format", "problemId", "must be a 64-hex problem id");
  }
  if (!isActionKind(input["actionKind"])) {
    fail(failures, "vocabulary-violation", "actionKind", "not a closed action kind");
  }
  if (!isActionStatus(input["status"])) {
    fail(failures, "vocabulary-violation", "status", "not a closed action status");
  }
  if (!isDeclaredInstant(input["createdAt"])) {
    fail(failures, "type-mismatch", "createdAt", "must be a declared ISO-8601 UTC instant");
  }
  if (!isRecord(input["ownership"]) || !isRecord(input["ownership"]?.["owner"])) {
    fail(failures, "missing-field", "ownership", "the ownership block is required");
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as ProblemAction };
}

/** Validates an unknown payload as an `AuditAppendInput`. PURE. */
export function validateAuditAppendInput(
  input: unknown,
): ActionValidation<AuditAppendInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      failures: [
        { kind: "not-an-object", path: "", detail: "the audit append input must be an object" },
      ],
    };
  }
  const failures: ActionValidationFailure[] = [];
  if (!isCanonicalDigest(input["problemId"])) {
    fail(failures, "digest-format", "problemId", "must be a 64-hex problem id");
  }
  if (!isCanonicalDigest(input["subjectDigest"])) {
    fail(failures, "digest-format", "subjectDigest", "must pin the committed record's 64-hex digest");
  }
  if (!isNonEmptyString(input["subjectKind"])) {
    fail(failures, "type-mismatch", "subjectKind", "must name the committed record type");
  }
  if (!isDeclaredInstant(input["occurredAt"])) {
    fail(failures, "type-mismatch", "occurredAt", "must be a declared ISO-8601 UTC instant");
  }
  if (!isNonEmptyString(input["reason"])) {
    fail(failures, "type-mismatch", "reason", "the WHY is mandatory — an unexplained transition is refused");
  }
  if (!isAuditReasonKind(input["reasonKind"])) {
    fail(failures, "vocabulary-violation", "reasonKind", "not a closed audit reason kind");
  }
  if (!Array.isArray(input["evidenceContentIds"])) {
    fail(failures, "type-mismatch", "evidenceContentIds", "must be an array of evidence content ids");
  }
  if (!isRecord(input["actor"]) || !isNonEmptyString(input["actor"]?.["actorId"])) {
    fail(failures, "missing-field", "actor", "the WHO is mandatory (a typed actor)");
  }
  if (failures.length > 0) {
    return { ok: false, failures };
  }
  return { ok: true, value: input as unknown as AuditAppendInput };
}

/* ------------------------------------------------------------------ */
/* The ACTION-stage typed transform                                     */
/* ------------------------------------------------------------------ */

/**
 * The ACTION transform: record a typed action on a problem under the
 * governance laws. PURE + deterministic; seals the action with its
 * content-derived `actionId`.
 *
 * Law #3 (the gate): `propose_solution_operation` requires a supplied
 * gate verdict with verdict `pass`.
 * Law #4 (the review): `resolve_case` requires an `approved` review
 * decision in the payload.
 * Law #5 (the envelope): `record_observation` requires non-empty
 * evidence ids.
 */
export function recordProblemAction(
  input: RecordActionInput,
  gate: DeterministicCheckGateVerdict | null,
): LaneOutcome<ProblemAction> {
  const validation = validateRecordActionInput(input);
  if (!validation.ok) {
    return laneRefused(
      "action",
      "contract-mismatch",
      `the action input violates the contract: ${validation.failures
        .map((failure) => `${failure.path} ${failure.kind} (${failure.detail})`)
        .join("; ")}`,
    );
  }
  if (input.actionKind === "propose_solution_operation") {
    if (gate === null) {
      return laneRefused(
        "action",
        "operation-semantic-failure",
        "a propose_solution_operation action REQUIRES a deterministic-check gate verdict — " +
          "engineering-consequential actions are never recorded ungated",
      );
    }
    if (gate.verdict !== "pass") {
      return laneRefused(
        "action",
        "operation-semantic-failure",
        `the deterministic-check gate verdict is ${gate.verdict} — a consequential action is ` +
          "blocked until the engine-owned checks pass",
      );
    }
    const payload = input.payload as ProposeSolutionOperationPayload;
    if (payload.gateVerdictId !== gate.gateId) {
      return laneRefused(
        "action",
        "contract-mismatch",
        `the payload cites gate verdict ${payload.gateVerdictId} but the supplied verdict is ${gate.gateId} — the citation must resolve`,
      );
    }
  }
  if (input.actionKind === "resolve_case") {
    const payload = input.payload as ResolveCasePayload;
    if (payload.reviewDecision !== "approved") {
      return laneRefused(
        "action",
        "operation-semantic-failure",
        `resolution requires an approved review; the recorded decision is ${payload.reviewDecision}`,
      );
    }
  }
  if (input.actionKind === "record_observation") {
    const payload = input.payload as RecordObservationPayload;
    if (payload.evidenceIds.length === 0) {
      return laneRefused(
        "action",
        "contract-mismatch",
        "a record_observation action requires non-empty evidence ids — observations without evidence are refused",
      );
    }
  }
  const action: Omit<ProblemAction, "actionId"> = {
    kind: PROBLEM_ACTION_KIND,
    schemaVersion: PROBLEM_ACTION_SCHEMA_VERSION,
    problemId: input.problemId,
    actionKind: input.actionKind,
    payload: input.payload,
    ownership: input.ownership,
    status: "open",
    evidenceContentIds: input.evidenceContentIds,
    createdAt: input.createdAt,
  };
  const actionId = contentIdOf(action as unknown as Record<string, unknown>, "actionId");
  return { ok: true, value: { ...action, actionId } };
}

/* ------------------------------------------------------------------ */
/* The lifecycle machine                                                */
/* ------------------------------------------------------------------ */

/**
 * The governed status transition (law #2): only the closed table's edges
 * are legal. Returns the typed refusal on an illegal edge. PURE.
 */
export function transitionActionStatus(
  action: ProblemAction,
  to: ActionStatus,
): LaneOutcome<ProblemAction> {
  const legal = ACTION_TRANSITIONS[action.status];
  if (!legal.includes(to)) {
    return laneRefused(
      "action",
      "operation-semantic-failure",
      `the action lifecycle transition ${action.status} → ${to} is not in the closed transition table ` +
        `(legal targets from ${action.status}: ${legal.join(", ") || "(terminal)"})`,
    );
  }
  return { ok: true, value: { ...action, status: to } };
}

/* ------------------------------------------------------------------ */
/* The audit-chain helpers (shared by the doubles)                      */
/* ------------------------------------------------------------------ */

/** The digest of one audit record's content (minus its own id). */
export function auditRecordContentDigest(record: Omit<AuditRecord, "eventId">): string {
  return contentIdOf(record as unknown as Record<string, unknown>, "eventId");
}

/** The full digest of a sealed audit record (the chain pin). */
export function auditRecordDigest(record: AuditRecord): string {
  return canonicalDigestOf(record);
}

/**
 * Builds the next append-only record: derives the sequence, chains to the
 * prior record, derives the content-addressed event id. PURE +
 * deterministic — the canonical builder shared by both ledger doubles so
 * their outputs are byte-identical by construction.
 */
export function buildAuditRecord(
  trail: AuditTrail | null,
  entry: AuditAppendInput,
): LaneOutcome<AuditRecord> {
  const validation = validateAuditAppendInput(entry);
  if (!validation.ok) {
    return laneRefused(
      "action",
      "contract-mismatch",
      `the audit append input violates the contract: ${validation.failures
        .map((failure) => `${failure.path} (${failure.detail})`)
        .join("; ")}`,
    );
  }
  if (trail !== null && trail.problemId !== entry.problemId) {
    return laneRefused(
      "action",
      "contract-mismatch",
      `the trail belongs to problem ${trail.problemId} but the entry targets ${entry.problemId}`,
    );
  }
  const prior = trail === null ? null : trail.records[trail.records.length - 1] ?? null;
  const body: Omit<AuditRecord, "eventId"> = {
    kind: AUDIT_RECORD_KIND,
    sequence: prior === null ? 1 : prior.sequence + 1,
    problemId: entry.problemId,
    laneStage: entry.laneStage,
    eventKind: entry.eventKind,
    actor: entry.actor,
    subjectDigest: entry.subjectDigest,
    subjectKind: entry.subjectKind,
    occurredAt: entry.occurredAt,
    reason: entry.reason,
    reasonKind: entry.reasonKind,
    evidenceContentIds: entry.evidenceContentIds,
    priorEventId: prior === null ? null : prior.eventId,
    priorEventDigest: prior === null ? null : auditRecordDigest(prior),
  };
  const eventId = auditRecordContentDigest(body);
  return { ok: true, value: { ...body, eventId } };
}

/**
 * The deterministic replay verification (law #6 + #8): re-derives every
 * event id from content, checks the sequence monotonicity and the digest
 * chain. A mutated past event fails with the typed `event-id-not-content-
 * derived` failure. PURE.
 */
export function verifyAuditReplay(
  trail: AuditTrail,
): ReplayVerification {
  const failures: {
    sequence: number;
    kind: ActionValidationFailureKind;
    detail: string;
  }[] = [];
  let prior: AuditRecord | null = null;
  for (const record of trail.records) {
    const expectedId = auditRecordContentDigest(record);
    if (record.eventId !== expectedId) {
      failures.push({
        sequence: record.sequence,
        kind: "event-id-not-content-derived",
        detail:
          `event ${record.sequence}'s id is not the content digest of its record — the trail was ` +
          "mutated after commit (append-only violation)",
      });
    }
    if (prior === null) {
      if (record.sequence !== 1) {
        failures.push({
          sequence: record.sequence,
          kind: "sequence-not-monotonic",
          detail: "the first event must have sequence 1",
        });
      }
      if (record.priorEventId !== null || record.priorEventDigest !== null) {
        failures.push({
          sequence: record.sequence,
          kind: "chain-broken",
          detail: "the first event must not chain to a prior event",
        });
      }
    } else {
      if (record.sequence !== prior.sequence + 1) {
        failures.push({
          sequence: record.sequence,
          kind: "sequence-not-monotonic",
          detail: `expected sequence ${prior.sequence + 1}`,
        });
      }
      if (record.priorEventId !== prior.eventId || record.priorEventDigest !== auditRecordDigest(prior)) {
        failures.push({
          sequence: record.sequence,
          kind: "chain-broken",
          detail: "the event does not chain to the prior record's id + digest",
        });
      }
    }
    prior = record;
  }
  return { ok: failures.length === 0, checkedEvents: trail.records.length, failures };
}

/* ------------------------------------------------------------------ */
/* The ACTION + AUDIT controlled entry points                           */
/* ------------------------------------------------------------------ */

/** The governed ACTION entry: validate, freeze, delegate, post-validate. */
export function recordThroughActionPort(
  recorder: ActionRecorder,
  input: RecordActionInput,
  gate: DeterministicCheckGateVerdict | null,
): LaneOutcome<ProblemAction> {
  const frozen = deepFreeze(input);
  const outcome = recorder.record(frozen, gate);
  if (!outcome.ok) {
    return outcome;
  }
  const validation = validateProblemAction(outcome.value);
  if (!validation.ok) {
    return laneRefused(
      "action",
      "contract-mismatch",
      `the recorded action violates the contract: ${validation.failures
        .map((failure) => `${failure.path} (${failure.detail})`)
        .join("; ")}`,
    );
  }
  return outcome;
}

/** The governed AUDIT-TRAIL append entry: validate, build, seal. */
export function appendThroughAuditPort(
  ledger: AuditLedger,
  trail: AuditTrail | null,
  entry: AuditAppendInput,
): LaneOutcome<AuditTrail> {
  const frozen = deepFreeze(entry);
  return ledger.append(trail, frozen);
}
