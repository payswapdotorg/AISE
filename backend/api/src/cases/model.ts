/**
 * AISE-025 — Engineering Case domain model.
 *
 * Contract (spec/work-orders.md §025: "Create case/issue/observation/
 * hypothesis/missing-evidence/review domain and APIs. Verify factual/
 * inferred/proposed separation and evidence traceability.";
 * spec/requirements.md R10 — "AISE shall convert a site issue into a
 * structured case with observations, evidence, measurements, hypotheses,
 * missing evidence, rules and review state. Acceptance: case facts and
 * inferences remain distinct."; spec/architecture-lock.md "Truth and
 * uncertainty" — OBSERVED/INFERRED/CONFIRMED/PROPOSED remain distinct,
 * confidence never substitutes for measurement uncertainty):
 *
 * EPISTEMIC SEPARATION IS THE DESIGN:
 *  - An `Observation` is ALWAYS an observed fact: `epistemicStatus` is the
 *    LITERAL type `"OBSERVED"` — carrying INFERRED/PROPOSED on an
 *    observation is a COMPILE ERROR, and the boundary parser rejects any
 *    other value at runtime (`invalid_epistemic_status`). An inference
 *    belongs to `Hypothesis`, never here.
 *  - A `Hypothesis` is ALWAYS an interpretation: `epistemicStatus` is
 *    `"INFERRED" | "PROPOSED"` — `OBSERVED` is impossible at the type level
 *    and rejected at the boundary. Facts and inferences therefore live in
 *    SEPARATE arrays on the case record (`observations` vs `hypotheses`)
 *    and are never merged.
 *  - `Hypothesis.confidence` is ADVISORY BELIEF METADATA for triage only —
 *    NEVER measurement uncertainty and never a measurement field. The
 *    serialized hypothesis carries no sigma/uncertainty keys; numerics with
 *    uncertainty belong to the Reality Graph's typed-unit properties.
 *  - Evidence traceability: an Observation REQUIRES a non-empty
 *    `evidenceIds` list (`observation_without_evidence` otherwise); ids are
 *    preserved VERBATIM. `measurementRefs` reference measurement records by
 *    id — this module never parses or reinterprets measurement values.
 *  - Observations are IMMUTABLE once recorded: no update/delete exists —
 *    the case history is append-only, and a CORRECTION is a NEW observation
 *    that may contradict, linked through a hypothesis's
 *    `contradictingObservationIds`.
 *  - Resolution is governed: resolving REQUIRES a review record
 *    (`review_required_for_resolution`) whose decision is `approved`
 *    (`review_not_approved` — R12 approval gate); after resolution the
 *    record is immutable (`already_resolved`).
 *  - The review PINS what was reviewed: `evidenceStateDigest` is the sha256
 *    of the case content at review time (content BEFORE the review record
 *    itself is attached — the reviewer saw exactly that state).
 *  - A waiver is never silent: `waiveEvidence` requires a note
 *    (`waiver_note_required`); the note is recorded on the record.
 *
 * This module owns the frozen vocabularies, record types, the typed error
 * registry, boundary input parsers (shape/vocabulary → typed codes) and the
 * canonical content digest. Semantic invariants (reference resolution,
 * lifecycle, waivers) live in `service.ts`; persistence in `store.ts`.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";

/* ------------------------------------------------------------------ */
/* Vocabularies (frozen: `as const` types + Object.freeze runtime)      */
/* ------------------------------------------------------------------ */

export const CASE_STATUSES = Object.freeze(["open", "under_review", "resolved", "closed"] as const);
export type CaseStatus = (typeof CASE_STATUSES)[number];

/**
 * A hypothesis is never an observed fact — the vocabulary EXCLUDES
 * "OBSERVED" (and "CONFIRMED": confirmation is a review/governance act,
 * recorded on the ReviewRecord, not a hypothesis property).
 */
export const HYPOTHESIS_EPISTEMIC_STATUSES = Object.freeze(["INFERRED", "PROPOSED"] as const);
export type HypothesisEpistemicStatus = (typeof HYPOTHESIS_EPISTEMIC_STATUSES)[number];

/** Advisory belief levels — NEVER measurement uncertainty (see header). */
export const CONFIDENCE_LEVELS = Object.freeze(["low", "medium", "high"] as const);
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const MISSING_EVIDENCE_KINDS = Object.freeze(["MISSING", "WEAK", "AMBIGUOUS"] as const);
export type MissingEvidenceKind = (typeof MISSING_EVIDENCE_KINDS)[number];

export const MISSING_EVIDENCE_STATUSES = Object.freeze(["open", "collected", "waived"] as const);
export type MissingEvidenceStatus = (typeof MISSING_EVIDENCE_STATUSES)[number];

export const REVIEW_DECISIONS = Object.freeze(["approved", "rejected", "needs_more_evidence"] as const);
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

export const CASE_EVENT_TYPES = Object.freeze([
  "case_created",
  "observation_recorded",
  "hypothesis_recorded",
  "missing_evidence_recorded",
  "missing_evidence_collected",
  "missing_evidence_waived",
  "review_submitted",
  "case_resolved",
] as const);
export type CaseEventType = (typeof CASE_EVENT_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)           */
/* ------------------------------------------------------------------ */

export const CASE_ERROR_CODES = Object.freeze([
  // shape / vocabulary validation (422 at the HTTP boundary)
  "invalid_case",
  "invalid_statement",
  "invalid_observation",
  "invalid_evidence_ref",
  "observation_without_evidence",
  "invalid_epistemic_status",
  "invalid_hypothesis",
  "invalid_confidence",
  "invalid_missing_evidence",
  "invalid_review",
  // semantic invariants (422)
  "unknown_observation_ref",
  "unknown_hypothesis_ref",
  "missing_evidence_not_open",
  "waiver_note_required",
  "review_required_for_resolution",
  "review_not_approved",
  "already_resolved",
  // not-found (404)
  "case_not_found",
  "missing_evidence_not_found",
  // identity / persistence (400 / 422 / 422)
  "invalid_case_id",
  "case_exists",
  "invalid_case_record",
] as const);
export type CaseErrorCode = (typeof CASE_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class CaseError extends Error {
  readonly code: CaseErrorCode;
  readonly detail: string;

  constructor(code: CaseErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "CaseError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Record types                                                         */
/* ------------------------------------------------------------------ */

/**
 * An observed FACT on the case. Always OBSERVED (literal type); requires
 * evidence; immutable once recorded (a correction is a NEW observation,
 * linked via a hypothesis's contradicting list).
 */
export interface Observation {
  readonly observationId: string;
  readonly statement: string;
  readonly epistemicStatus: "OBSERVED";
  readonly recordedAt: string;
  /** REQUIRED non-empty; evidence ids preserved verbatim. */
  readonly evidenceIds: readonly string[];
  /** Optional references to measurement records (ids only, never values). */
  readonly measurementRefs?: readonly string[];
}

/**
 * An interpretation of observations — INFERRED (derived from evidence) or
 * PROPOSED (put forward, awaiting discrimination). `confidence` is advisory
 * belief metadata for triage; it is NEVER measurement uncertainty and must
 * never appear in a measurement/uncertainty field.
 */
export interface Hypothesis {
  readonly hypothesisId: string;
  readonly statement: string;
  readonly epistemicStatus: HypothesisEpistemicStatus;
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly confidence: ConfidenceLevel;
  readonly recordedAt: string;
}

/** An explicit evidence gap that would discriminate hypotheses. */
export interface MissingEvidence {
  readonly missingId: string;
  readonly description: string;
  readonly kind: MissingEvidenceKind;
  /** Hypothesis ids this evidence would discriminate. */
  readonly wouldResolve: readonly string[];
  readonly requestedMethod?: string;
  readonly status: MissingEvidenceStatus;
  /** Present iff status === "waived" — a waiver is never silent. */
  readonly waiverNote?: string;
}

/**
 * A human review decision (R12): identity, decision, note, timestamp and
 * the pinned evidence state (sha256 of case content at review time).
 */
export interface ReviewRecord {
  readonly reviewer: string;
  readonly decision: ReviewDecision;
  readonly note: string;
  readonly reviewedAt: string;
  readonly evidenceStateDigest: string;
}

/** One append-only audit event: pins the full record content digest. */
export interface CaseEvent {
  readonly eventId: string;
  readonly eventType: CaseEventType;
  readonly occurredAt: string;
  /** sha256 of the case content (record minus history) AFTER this mutation. */
  readonly recordDigest: string;
}

/** Caller-declared case-level context links (set at creation, read-only). */
export interface CaseLinks {
  readonly nodeIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly captureSessionIds: readonly string[];
}

/**
 * A structured engineering case. `observations` (facts) and `hypotheses`
 * (inferences) are SEPARATE arrays by construction — never merged.
 * `history` is the append-only audit trail: the file is rewritten on
 * mutation, but prior events (and their digests) never change.
 */
export interface EngineeringCase {
  readonly caseId: string;
  readonly title: string;
  readonly status: CaseStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly observations: readonly Observation[];
  readonly hypotheses: readonly Hypothesis[];
  readonly missingEvidence: readonly MissingEvidence[];
  readonly review?: ReviewRecord;
  readonly links: CaseLinks;
  readonly history: readonly CaseEvent[];
}

/** List projection (never the full record). */
export interface CaseSummary {
  readonly caseId: string;
  readonly title: string;
  readonly status: CaseStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly counts: {
    readonly observations: number;
    readonly hypotheses: number;
    readonly missingEvidence: number;
    readonly openMissingEvidence: number;
  };
}

/* ------------------------------------------------------------------ */
/* Digest                                                               */
/* ------------------------------------------------------------------ */

/**
 * sha256 over the canonical JSON of the case CONTENT (every field except
 * the audit history). Pure: the same content always yields the same digest
 * — this pins what a review reviewed and what each event committed, and
 * keeps two stores running the same operation sequence byte-identical.
 */
export function caseContentDigest(record: EngineeringCase): string {
  const {
    caseId,
    title,
    status,
    createdAt,
    updatedAt,
    observations,
    hypotheses,
    missingEvidence,
    review,
    links,
  } = record;
  return sha256Hex(
    canonicalJsonStringify({
      caseId,
      title,
      status,
      createdAt,
      updatedAt,
      observations,
      hypotheses,
      missingEvidence,
      ...(review === undefined ? {} : { review }),
      links,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Boundary input parsers (shape/vocabulary; semantic checks in service)*/
/* ------------------------------------------------------------------ */

export interface CreateCaseInput {
  readonly caseId: string;
  readonly title: string;
  readonly links: CaseLinks;
}

export interface AddObservationInput {
  readonly statement: string;
  readonly evidenceIds: readonly string[];
  readonly measurementRefs?: readonly string[];
}

export interface AddHypothesisInput {
  readonly statement: string;
  readonly epistemicStatus: HypothesisEpistemicStatus;
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly confidence: ConfidenceLevel;
}

export interface AddMissingEvidenceInput {
  readonly description: string;
  readonly kind: MissingEvidenceKind;
  readonly wouldResolve: readonly string[];
  readonly requestedMethod?: string;
}

export interface SubmitReviewInput {
  readonly reviewer: string;
  readonly decision: ReviewDecision;
  readonly note: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0)
  );
}

function vocabularyMember<T extends string>(
  vocabulary: readonly T[],
  value: unknown,
): value is T {
  return (vocabulary as readonly string[]).includes(value as string);
}

/** caseId shape (mirrors the Reality Graph projectId bounds). */
export function validateCaseId(caseId: string): void {
  if (caseId.length < 1 || caseId.length > 256) {
    throw new CaseError("invalid_case_id", "caseId must be 1..256 characters");
  }
}

function parseCaseLinks(value: unknown): CaseLinks {
  if (value === undefined) {
    return { nodeIds: [], evidenceIds: [], captureSessionIds: [] };
  }
  if (!isRecord(value)) {
    throw new CaseError("invalid_case", "links must be an object");
  }
  const nodeIds = value["nodeIds"];
  if (nodeIds !== undefined && !isStringArray(nodeIds)) {
    throw new CaseError("invalid_case", "links.nodeIds must be an array of non-empty strings");
  }
  const evidenceIds = value["evidenceIds"];
  if (evidenceIds !== undefined && !isStringArray(evidenceIds)) {
    throw new CaseError("invalid_case", "links.evidenceIds must be an array of non-empty strings");
  }
  const captureSessionIds = value["captureSessionIds"];
  if (captureSessionIds !== undefined && !isStringArray(captureSessionIds)) {
    throw new CaseError(
      "invalid_case",
      "links.captureSessionIds must be an array of non-empty strings",
    );
  }
  return {
    nodeIds: nodeIds ?? [],
    evidenceIds: evidenceIds ?? [],
    captureSessionIds: captureSessionIds ?? [],
  };
}

export function parseCreateCaseInput(payload: unknown): CreateCaseInput {
  if (!isRecord(payload)) {
    throw new CaseError("invalid_case", "expected a JSON object");
  }
  const caseId = payload["caseId"];
  if (!isNonEmptyString(caseId)) {
    throw new CaseError("invalid_case_id", "caseId must be a non-empty string");
  }
  validateCaseId(caseId);
  const title = payload["title"];
  if (!isNonEmptyString(title)) {
    throw new CaseError("invalid_case", "title must be a non-empty string");
  }
  return { caseId, title, links: parseCaseLinks(payload["links"]) };
}

export function parseAddObservationInput(payload: unknown): AddObservationInput {
  if (!isRecord(payload)) {
    throw new CaseError("invalid_observation", "expected a JSON object");
  }
  const statement = payload["statement"];
  if (!isNonEmptyString(statement)) {
    throw new CaseError("invalid_statement", "statement must be a non-empty string");
  }
  // Epistemic separation enforced AT THE BOUNDARY: an observation that
  // claims an inference status is a typed rejection, never a silent coercion.
  const claimed = payload["epistemicStatus"];
  if (claimed !== undefined && claimed !== "OBSERVED") {
    throw new CaseError(
      "invalid_epistemic_status",
      "observations are always OBSERVED — record an inference as a hypothesis instead",
    );
  }
  const evidenceIds = payload["evidenceIds"];
  if (evidenceIds === undefined || !Array.isArray(evidenceIds) || evidenceIds.length === 0) {
    throw new CaseError(
      "observation_without_evidence",
      "evidenceIds is required and must be a non-empty array — an observation without evidence is rejected",
    );
  }
  if (!isStringArray(evidenceIds)) {
    throw new CaseError("invalid_evidence_ref", "evidenceIds entries must be non-empty strings");
  }
  const measurementRefs = payload["measurementRefs"];
  if (measurementRefs !== undefined && !isStringArray(measurementRefs)) {
    throw new CaseError(
      "invalid_observation",
      "measurementRefs must be an array of non-empty strings",
    );
  }
  return {
    statement,
    evidenceIds,
    ...(measurementRefs === undefined ? {} : { measurementRefs }),
  };
}

export function parseAddHypothesisInput(payload: unknown): AddHypothesisInput {
  if (!isRecord(payload)) {
    throw new CaseError("invalid_hypothesis", "expected a JSON object");
  }
  const statement = payload["statement"];
  if (!isNonEmptyString(statement)) {
    throw new CaseError("invalid_statement", "statement must be a non-empty string");
  }
  const epistemicStatus = payload["epistemicStatus"];
  if (!vocabularyMember(HYPOTHESIS_EPISTEMIC_STATUSES, epistemicStatus)) {
    throw new CaseError(
      "invalid_epistemic_status",
      "hypothesis epistemicStatus must be INFERRED or PROPOSED — a hypothesis is never an observed fact",
    );
  }
  const confidence = payload["confidence"];
  if (!vocabularyMember(CONFIDENCE_LEVELS, confidence)) {
    throw new CaseError("invalid_confidence", "confidence must be low, medium or high");
  }
  const supportingObservationIds = payload["supportingObservationIds"];
  if (supportingObservationIds === undefined || !isStringArray(supportingObservationIds)) {
    throw new CaseError(
      "invalid_hypothesis",
      "supportingObservationIds must be an array of non-empty strings",
    );
  }
  const contradictingObservationIds = payload["contradictingObservationIds"];
  if (contradictingObservationIds === undefined || !isStringArray(contradictingObservationIds)) {
    throw new CaseError(
      "invalid_hypothesis",
      "contradictingObservationIds must be an array of non-empty strings",
    );
  }
  return {
    statement,
    epistemicStatus,
    supportingObservationIds,
    contradictingObservationIds,
    confidence,
  };
}

export function parseAddMissingEvidenceInput(payload: unknown): AddMissingEvidenceInput {
  if (!isRecord(payload)) {
    throw new CaseError("invalid_missing_evidence", "expected a JSON object");
  }
  const description = payload["description"];
  if (!isNonEmptyString(description)) {
    throw new CaseError("invalid_missing_evidence", "description must be a non-empty string");
  }
  const kind = payload["kind"];
  if (!vocabularyMember(MISSING_EVIDENCE_KINDS, kind)) {
    throw new CaseError("invalid_missing_evidence", "kind must be MISSING, WEAK or AMBIGUOUS");
  }
  const wouldResolve = payload["wouldResolve"];
  if (wouldResolve === undefined || !isStringArray(wouldResolve)) {
    throw new CaseError(
      "invalid_missing_evidence",
      "wouldResolve must be an array of non-empty strings (hypothesis ids)",
    );
  }
  const requestedMethod = payload["requestedMethod"];
  if (requestedMethod !== undefined && !isNonEmptyString(requestedMethod)) {
    throw new CaseError("invalid_missing_evidence", "requestedMethod must be a non-empty string");
  }
  return {
    description,
    kind,
    wouldResolve,
    ...(requestedMethod === undefined ? {} : { requestedMethod }),
  };
}

export function parseSubmitReviewInput(payload: unknown): SubmitReviewInput {
  if (!isRecord(payload)) {
    throw new CaseError("invalid_review", "expected a JSON object");
  }
  const reviewer = payload["reviewer"];
  if (!isNonEmptyString(reviewer)) {
    throw new CaseError("invalid_review", "reviewer must be a non-empty string");
  }
  const decision = payload["decision"];
  if (!vocabularyMember(REVIEW_DECISIONS, decision)) {
    throw new CaseError(
      "invalid_review",
      "decision must be approved, rejected or needs_more_evidence",
    );
  }
  const note = payload["note"];
  if (!isNonEmptyString(note)) {
    throw new CaseError("invalid_review", "note must be a non-empty string");
  }
  return { reviewer, decision, note };
}

/** Waiver note parser — a waiver without a note is a typed rejection. */
export function parseWaiveNoteInput(payload: unknown): string {
  if (!isRecord(payload)) {
    throw new CaseError("waiver_note_required", "expected { note: string }");
  }
  const note = payload["note"];
  if (typeof note !== "string" || note.trim().length === 0) {
    throw new CaseError(
      "waiver_note_required",
      "waiving missing evidence requires a non-empty note — a waiver is never silent",
    );
  }
  return note;
}

/* ------------------------------------------------------------------ */
/* Stored-record parser (store reads; write-time duty is the service's)*/
/* ------------------------------------------------------------------ */

function invalid(detail: string): CaseError {
  return new CaseError("invalid_case_record", detail);
}

function parseObservation(value: unknown): Observation {
  if (!isRecord(value)) throw invalid("observation entry is not an object");
  if (!isNonEmptyString(value["observationId"])) throw invalid("observation.observationId");
  if (!isNonEmptyString(value["statement"])) throw invalid("observation.statement");
  if (value["epistemicStatus"] !== "OBSERVED") {
    throw invalid("observation.epistemicStatus must be OBSERVED");
  }
  if (!isNonEmptyString(value["recordedAt"])) throw invalid("observation.recordedAt");
  const evidenceIds = value["evidenceIds"];
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0 || !isStringArray(evidenceIds)) {
    throw invalid("observation.evidenceIds must be a non-empty string array");
  }
  const measurementRefs = value["measurementRefs"];
  if (measurementRefs !== undefined && !isStringArray(measurementRefs)) {
    throw invalid("observation.measurementRefs");
  }
  return {
    observationId: value["observationId"],
    statement: value["statement"],
    epistemicStatus: "OBSERVED",
    recordedAt: value["recordedAt"],
    evidenceIds,
    ...(measurementRefs === undefined ? {} : { measurementRefs }),
  };
}

function parseHypothesis(value: unknown): Hypothesis {
  if (!isRecord(value)) throw invalid("hypothesis entry is not an object");
  if (!isNonEmptyString(value["hypothesisId"])) throw invalid("hypothesis.hypothesisId");
  if (!isNonEmptyString(value["statement"])) throw invalid("hypothesis.statement");
  const epistemicStatus = value["epistemicStatus"];
  if (!vocabularyMember(HYPOTHESIS_EPISTEMIC_STATUSES, epistemicStatus)) {
    throw invalid("hypothesis.epistemicStatus must be INFERRED or PROPOSED");
  }
  if (!isNonEmptyString(value["recordedAt"])) throw invalid("hypothesis.recordedAt");
  const confidence = value["confidence"];
  if (!vocabularyMember(CONFIDENCE_LEVELS, confidence)) throw invalid("hypothesis.confidence");
  const supportingObservationIds = value["supportingObservationIds"];
  if (!isStringArray(supportingObservationIds)) {
    throw invalid("hypothesis.supportingObservationIds");
  }
  const contradictingObservationIds = value["contradictingObservationIds"];
  if (!isStringArray(contradictingObservationIds)) {
    throw invalid("hypothesis.contradictingObservationIds");
  }
  return {
    hypothesisId: value["hypothesisId"],
    statement: value["statement"],
    epistemicStatus,
    recordedAt: value["recordedAt"],
    confidence,
    supportingObservationIds,
    contradictingObservationIds,
  };
}

function parseMissingEvidence(value: unknown): MissingEvidence {
  if (!isRecord(value)) throw invalid("missing-evidence entry is not an object");
  if (!isNonEmptyString(value["missingId"])) throw invalid("missingEvidence.missingId");
  if (!isNonEmptyString(value["description"])) throw invalid("missingEvidence.description");
  const kind = value["kind"];
  if (!vocabularyMember(MISSING_EVIDENCE_KINDS, kind)) throw invalid("missingEvidence.kind");
  const status = value["status"];
  if (!vocabularyMember(MISSING_EVIDENCE_STATUSES, status)) throw invalid("missingEvidence.status");
  const wouldResolve = value["wouldResolve"];
  if (!isStringArray(wouldResolve)) throw invalid("missingEvidence.wouldResolve");
  const requestedMethod = value["requestedMethod"];
  if (requestedMethod !== undefined && !isNonEmptyString(requestedMethod)) {
    throw invalid("missingEvidence.requestedMethod");
  }
  const waiverNote = value["waiverNote"];
  if (waiverNote !== undefined && !isNonEmptyString(waiverNote)) {
    throw invalid("missingEvidence.waiverNote");
  }
  if (status === "waived" && waiverNote === undefined) {
    throw invalid("a waived missing-evidence entry must carry its waiverNote");
  }
  return {
    missingId: value["missingId"],
    description: value["description"],
    kind,
    status,
    wouldResolve,
    ...(requestedMethod === undefined ? {} : { requestedMethod }),
    ...(waiverNote === undefined ? {} : { waiverNote }),
  };
}

function parseReview(value: unknown): ReviewRecord {
  if (!isRecord(value)) throw invalid("review is not an object");
  if (!isNonEmptyString(value["reviewer"])) throw invalid("review.reviewer");
  const decision = value["decision"];
  if (!vocabularyMember(REVIEW_DECISIONS, decision)) throw invalid("review.decision");
  if (!isNonEmptyString(value["note"])) throw invalid("review.note");
  if (!isNonEmptyString(value["reviewedAt"])) throw invalid("review.reviewedAt");
  if (!isNonEmptyString(value["evidenceStateDigest"])) throw invalid("review.evidenceStateDigest");
  return {
    reviewer: value["reviewer"],
    decision,
    note: value["note"],
    reviewedAt: value["reviewedAt"],
    evidenceStateDigest: value["evidenceStateDigest"],
  };
}

function parseCaseEvent(value: unknown): CaseEvent {
  if (!isRecord(value)) throw invalid("history entry is not an object");
  if (!isNonEmptyString(value["eventId"])) throw invalid("history.eventId");
  const eventType = value["eventType"];
  if (!vocabularyMember(CASE_EVENT_TYPES, eventType)) throw invalid("history.eventType");
  if (!isNonEmptyString(value["occurredAt"])) throw invalid("history.occurredAt");
  if (!isNonEmptyString(value["recordDigest"])) throw invalid("history.recordDigest");
  return {
    eventId: value["eventId"],
    eventType,
    occurredAt: value["occurredAt"],
    recordDigest: value["recordDigest"],
  };
}

/**
 * Structural validation of a persisted case record (store reads; garbage on
 * disk is a typed `invalid_case_record` rejection, never a silent
 * misparse). Deep semantic invariants are the write-time service's duty.
 */
export function parseCaseRecord(value: unknown): EngineeringCase {
  if (!isRecord(value)) throw invalid("case record is not a JSON object");
  if (!isNonEmptyString(value["caseId"])) throw invalid("caseId");
  if (!isNonEmptyString(value["title"])) throw invalid("title");
  const status = value["status"];
  if (!vocabularyMember(CASE_STATUSES, status)) throw invalid("status");
  if (!isNonEmptyString(value["createdAt"])) throw invalid("createdAt");
  if (!isNonEmptyString(value["updatedAt"])) throw invalid("updatedAt");
  const observations = value["observations"];
  if (!Array.isArray(observations)) throw invalid("observations must be an array");
  const hypotheses = value["hypotheses"];
  if (!Array.isArray(hypotheses)) throw invalid("hypotheses must be an array");
  const missingEvidence = value["missingEvidence"];
  if (!Array.isArray(missingEvidence)) throw invalid("missingEvidence must be an array");
  const history = value["history"];
  if (!Array.isArray(history)) throw invalid("history must be an array");
  const review = value["review"];
  if (review !== undefined) parseReview(review);
  return {
    caseId: value["caseId"],
    title: value["title"],
    status,
    createdAt: value["createdAt"],
    updatedAt: value["updatedAt"],
    observations: observations.map(parseObservation),
    hypotheses: hypotheses.map(parseHypothesis),
    missingEvidence: missingEvidence.map(parseMissingEvidence),
    ...(review === undefined ? {} : { review: parseReview(review) }),
    links: parseCaseLinks(value["links"]),
    history: history.map(parseCaseEvent),
  };
}
