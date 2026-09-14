/**
 * Engineering Case service — the policy engine (AISE-025).
 *
 * Contract (spec/work-orders.md §025; R10 — facts and inferences remain
 * distinct; architecture-lock "Truth and uncertainty"):
 *
 *  - The service owns ALL case policy over the dumb store: epistemic
 *    separation (observations are facts, hypotheses are interpretations —
 *    enforced at the type level in model.ts and re-checked here on the
 *    semantic level), evidence traceability (observations require evidence;
 *    hypothesis/missing-evidence references must RESOLVE or the mutation is
 *    a typed refusal), lifecycle governance (resolution requires an
 *    APPROVED review; a resolved case is immutable) and waiver discipline
 *    (never silent).
 *  - APPEND-ONLY HISTORY: every mutation appends one `CaseEvent` carrying
 *    the sha256 digest of the full changed record content (see
 *    `caseContentDigest`). The file is rewritten, but prior events and
 *    their digests are never recomputed or changed. Observations are
 *    immutable once recorded: there is no update/delete — a correction is a
 *    NEW observation (which may contradict), linked through a hypothesis's
 *    `contradictingObservationIds`.
 *  - `collectEvidence` marks the missing-evidence record collected and
 *    appends the event — it does NOT auto-create an observation: the human
 *    or agent must still record WHAT was observed (an observation without
 *    evidence is a typed rejection; an observation without a human/agent
 *    act behind it would fabricate a fact).
 *  - Determinism: the service owns NO wall clock and NO randomness — the
 *    clock is injected, and record ids are content-derived (sha256 over
 *    caseId + sequence + canonical payload), so the same operation sequence
 *    plus the same clock produces byte-identical files in fresh stores.
 *  - Single-writer discipline: read-modify-write per call; one service
 *    instance per data dir (documented store assumption).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import {
  CaseError,
  caseContentDigest,
  validateCaseId,
  type AddHypothesisInput,
  type AddMissingEvidenceInput,
  type AddObservationInput,
  type CaseEvent,
  type CaseEventType,
  type CaseLinks,
  type CaseSummary,
  type CreateCaseInput,
  type EngineeringCase,
  type Hypothesis,
  type MissingEvidence,
  type Observation,
  type ReviewRecord,
  type SubmitReviewInput,
} from "./model";
import type { CaseStore } from "./store";

export interface CaseServiceDeps {
  readonly store: CaseStore;
  /** Sole source of every timestamp (determinism pin). */
  readonly clock: () => string;
}

/** Deterministic content-derived id: `prefix-<16 hex of caseId+seq+payload>`. */
function deriveId(
  prefix: string,
  caseId: string,
  sequence: number,
  payload: unknown,
): string {
  return `${prefix}-${sha256Hex(`${caseId}:${sequence}:${canonicalJsonStringify(payload)}`).slice(0, 16)}`;
}

export class CaseService {
  private readonly store: CaseStore;
  private readonly clock: () => string;

  constructor(deps: CaseServiceDeps) {
    this.store = deps.store;
    this.clock = deps.clock;
  }

  /* ------------------------------------------------------------ */
  /* Internal helpers                                              */
  /* ------------------------------------------------------------ */

  private async require(caseId: string): Promise<EngineeringCase> {
    validateCaseId(caseId);
    const record = await this.store.get(caseId);
    if (record === null) {
      throw new CaseError("case_not_found", `case ${caseId} does not exist`);
    }
    return record;
  }

  /** A resolved (or closed) case is immutable — further mutations refuse. */
  private requireMutable(record: EngineeringCase): void {
    if (record.status === "resolved" || record.status === "closed") {
      throw new CaseError(
        "already_resolved",
        `case ${record.caseId} is ${record.status} — the record is immutable; open a new case instead`,
      );
    }
  }

  /**
   * Commit one mutation: the incoming record already carries the change and
   * the new `updatedAt`; this appends the audit event (with the digest of
   * the changed content) and persists. Prior events are carried over
   * UNCHANGED (append-only discipline).
   */
  private async append(
    record: EngineeringCase,
    eventType: CaseEventType,
    occurredAt: string,
  ): Promise<EngineeringCase> {
    const eventId = `evt-${String(record.history.length + 1).padStart(6, "0")}`;
    const event: CaseEvent = {
      eventId,
      eventType,
      occurredAt,
      recordDigest: caseContentDigest(record),
    };
    const committed: EngineeringCase = { ...record, history: [...record.history, event] };
    await this.store.put(committed);
    return committed;
  }

  /* ------------------------------------------------------------ */
  /* Lifecycle                                                     */
  /* ------------------------------------------------------------ */

  async createCase(input: CreateCaseInput): Promise<EngineeringCase> {
    validateCaseId(input.caseId);
    const existing = await this.store.get(input.caseId);
    if (existing !== null) {
      throw new CaseError("case_exists", `case ${input.caseId} already exists`);
    }
    const now = this.clock();
    const links: CaseLinks = {
      nodeIds: [...input.links.nodeIds],
      evidenceIds: [...input.links.evidenceIds],
      captureSessionIds: [...input.links.captureSessionIds],
    };
    const record: EngineeringCase = {
      caseId: input.caseId,
      title: input.title,
      status: "open",
      createdAt: now,
      updatedAt: now,
      observations: [],
      hypotheses: [],
      missingEvidence: [],
      links,
      history: [],
    };
    return this.append(record, "case_created", now);
  }

  async addObservation(caseId: string, input: AddObservationInput): Promise<Observation> {
    // Defense in depth: the boundary parser enforces the same rule, but a
    // library caller bypassing the parser still cannot record an
    // evidence-less observation.
    if (!Array.isArray(input.evidenceIds) || input.evidenceIds.length === 0) {
      throw new CaseError(
        "observation_without_evidence",
        "evidenceIds must be a non-empty array — an observation without evidence is rejected",
      );
    }
    const record = await this.require(caseId);
    this.requireMutable(record);
    const now = this.clock();
    const observation: Observation = {
      observationId: deriveId("obs", caseId, record.observations.length, {
        statement: input.statement,
        evidenceIds: input.evidenceIds,
        measurementRefs: input.measurementRefs ?? null,
        recordedAt: now,
      }),
      statement: input.statement,
      // Always OBSERVED — the literal type makes anything else unrepresentable.
      epistemicStatus: "OBSERVED",
      recordedAt: now,
      evidenceIds: [...input.evidenceIds],
      ...(input.measurementRefs === undefined ? {} : { measurementRefs: [...input.measurementRefs] }),
    };
    const updated: EngineeringCase = {
      ...record,
      observations: [...record.observations, observation],
      updatedAt: now,
    };
    await this.append(updated, "observation_recorded", now);
    return observation;
  }

  async addHypothesis(caseId: string, input: AddHypothesisInput): Promise<Hypothesis> {
    const record = await this.require(caseId);
    this.requireMutable(record);
    // Reference resolution: a hypothesis naming an unknown observation is a
    // typed refusal — traceability never degrades to a dangling pointer.
    const known = new Set(record.observations.map((observation) => observation.observationId));
    const referenced = [...input.supportingObservationIds, ...input.contradictingObservationIds];
    const unknown = referenced.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new CaseError(
        "unknown_observation_ref",
        `hypothesis references unknown observation ids: ${unknown.join(", ")}`,
      );
    }
    const now = this.clock();
    const hypothesis: Hypothesis = {
      hypothesisId: deriveId("hyp", caseId, record.hypotheses.length, {
        statement: input.statement,
        epistemicStatus: input.epistemicStatus,
        supportingObservationIds: input.supportingObservationIds,
        contradictingObservationIds: input.contradictingObservationIds,
        confidence: input.confidence,
        recordedAt: now,
      }),
      statement: input.statement,
      epistemicStatus: input.epistemicStatus,
      supportingObservationIds: [...input.supportingObservationIds],
      contradictingObservationIds: [...input.contradictingObservationIds],
      confidence: input.confidence,
      recordedAt: now,
    };
    const updated: EngineeringCase = {
      ...record,
      hypotheses: [...record.hypotheses, hypothesis],
      updatedAt: now,
    };
    await this.append(updated, "hypothesis_recorded", now);
    return hypothesis;
  }

  async addMissingEvidence(
    caseId: string,
    input: AddMissingEvidenceInput,
  ): Promise<MissingEvidence> {
    const record = await this.require(caseId);
    this.requireMutable(record);
    // wouldResolve must resolve to known hypotheses (same traceability rule).
    const known = new Set(record.hypotheses.map((hypothesis) => hypothesis.hypothesisId));
    const unknown = input.wouldResolve.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new CaseError(
        "unknown_hypothesis_ref",
        `missing evidence would resolve unknown hypothesis ids: ${unknown.join(", ")}`,
      );
    }
    const now = this.clock();
    const missing: MissingEvidence = {
      missingId: deriveId("mis", caseId, record.missingEvidence.length, {
        description: input.description,
        kind: input.kind,
        wouldResolve: input.wouldResolve,
        requestedMethod: input.requestedMethod ?? null,
        recordedAt: now,
      }),
      description: input.description,
      kind: input.kind,
      wouldResolve: [...input.wouldResolve],
      ...(input.requestedMethod === undefined ? {} : { requestedMethod: input.requestedMethod }),
      status: "open",
    };
    const updated: EngineeringCase = {
      ...record,
      missingEvidence: [...record.missingEvidence, missing],
      updatedAt: now,
    };
    await this.append(updated, "missing_evidence_recorded", now);
    return missing;
  }

  /**
   * Mark one missing-evidence record collected. Does NOT auto-create an
   * observation: the human/agent must still record WHAT was observed (via
   * addObservation, with evidence) — evidence collection is an acquisition
   * fact, not an engineering observation.
   */
  async collectEvidence(caseId: string, missingId: string): Promise<MissingEvidence> {
    const record = await this.require(caseId);
    this.requireMutable(record);
    const existing = record.missingEvidence.find((entry) => entry.missingId === missingId);
    if (existing === undefined) {
      throw new CaseError(
        "missing_evidence_not_found",
        `missing evidence ${missingId} does not exist on case ${caseId}`,
      );
    }
    if (existing.status !== "open") {
      throw new CaseError(
        "missing_evidence_not_open",
        `missing evidence ${missingId} is ${existing.status} — only open evidence can be collected`,
      );
    }
    const now = this.clock();
    const collected: MissingEvidence = { ...existing, status: "collected" };
    const index = record.missingEvidence.indexOf(existing);
    const missingEvidence = [...record.missingEvidence];
    missingEvidence[index] = collected;
    const updated: EngineeringCase = {
      ...record,
      missingEvidence,
      updatedAt: now,
    };
    await this.append(updated, "missing_evidence_collected", now);
    return collected;
  }

  /** Waive one missing-evidence record — REQUIRES a note (never silent). */
  async waiveEvidence(caseId: string, missingId: string, note: string): Promise<MissingEvidence> {
    if (typeof note !== "string" || note.trim().length === 0) {
      throw new CaseError(
        "waiver_note_required",
        "waiving missing evidence requires a non-empty note — a waiver is never silent",
      );
    }
    const record = await this.require(caseId);
    this.requireMutable(record);
    const existing = record.missingEvidence.find((entry) => entry.missingId === missingId);
    if (existing === undefined) {
      throw new CaseError(
        "missing_evidence_not_found",
        `missing evidence ${missingId} does not exist on case ${caseId}`,
      );
    }
    if (existing.status !== "open") {
      throw new CaseError(
        "missing_evidence_not_open",
        `missing evidence ${missingId} is ${existing.status} — only open evidence can be waived`,
      );
    }
    const now = this.clock();
    const waived: MissingEvidence = { ...existing, status: "waived", waiverNote: note };
    const index = record.missingEvidence.indexOf(existing);
    const missingEvidence = [...record.missingEvidence];
    missingEvidence[index] = waived;
    const updated: EngineeringCase = {
      ...record,
      missingEvidence,
      updatedAt: now,
    };
    await this.append(updated, "missing_evidence_waived", now);
    return waived;
  }

  /**
   * Submit a human review (R12). The review PINS the case content it
   * reviewed: `evidenceStateDigest` is the content digest BEFORE the review
   * record is attached. Resubmission replaces the current review (the
   * history keeps every submission's event + digest); the case moves to
   * `under_review`.
   */
  async submitReview(caseId: string, input: SubmitReviewInput): Promise<ReviewRecord> {
    const record = await this.require(caseId);
    this.requireMutable(record);
    const now = this.clock();
    const review: ReviewRecord = {
      reviewer: input.reviewer,
      decision: input.decision,
      note: input.note,
      reviewedAt: now,
      evidenceStateDigest: caseContentDigest(record),
    };
    const updated: EngineeringCase = {
      ...record,
      review,
      status: "under_review",
      updatedAt: now,
    };
    await this.append(updated, "review_submitted", now);
    return review;
  }

  /**
   * Resolve the case. Governed transition: REQUIRES a review record
   * (`review_required_for_resolution`) whose decision is `approved`
   * (`review_not_approved` — the R12 approval gate: an authorized human
   * approved exactly the pinned evidence state). After resolution the
   * record is immutable (`already_resolved`).
   */
  async resolveCase(caseId: string): Promise<EngineeringCase> {
    const record = await this.require(caseId);
    if (record.status === "resolved" || record.status === "closed") {
      throw new CaseError(
        "already_resolved",
        `case ${caseId} is already ${record.status} — the record is immutable`,
      );
    }
    if (record.review === undefined) {
      throw new CaseError(
        "review_required_for_resolution",
        `case ${caseId} cannot be resolved without a review record`,
      );
    }
    if (record.review.decision !== "approved") {
      throw new CaseError(
        "review_not_approved",
        `case ${caseId} review decision is ${record.review.decision} — only an approved review permits resolution`,
      );
    }
    const now = this.clock();
    const updated: EngineeringCase = { ...record, status: "resolved", updatedAt: now };
    return this.append(updated, "case_resolved", now);
  }

  /* ------------------------------------------------------------ */
  /* Reads                                                         */
  /* ------------------------------------------------------------ */

  async getCase(caseId: string): Promise<EngineeringCase | null> {
    validateCaseId(caseId);
    return this.store.get(caseId);
  }

  async listCases(): Promise<CaseSummary[]> {
    const records = await this.store.list();
    return records.map((record) => ({
      caseId: record.caseId,
      title: record.title,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      counts: {
        observations: record.observations.length,
        hypotheses: record.hypotheses.length,
        missingEvidence: record.missingEvidence.length,
        openMissingEvidence: record.missingEvidence.filter((entry) => entry.status === "open")
          .length,
      },
    }));
  }
}
