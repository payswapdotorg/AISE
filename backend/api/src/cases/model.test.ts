/**
 * AISE-025 — Engineering Case domain model tests.
 *
 * The CRITICAL matrix, model layer: epistemic separation (type-level via
 * @ts-expect-error compile assertions + boundary parser rejections),
 * evidence traceability (an observation without evidence is a typed
 * rejection), the digest discipline (content-only, history-excluded) and
 * the stored-record parser (garbage is typed, never silently misparsed).
 */

import { describe, expect, test } from "bun:test";
import { sha256Hex } from "../lib/hash";
import {
  CASE_ERROR_CODES,
  CASE_EVENT_TYPES,
  CASE_STATUSES,
  CONFIDENCE_LEVELS,
  HYPOTHESIS_EPISTEMIC_STATUSES,
  MISSING_EVIDENCE_KINDS,
  MISSING_EVIDENCE_STATUSES,
  REVIEW_DECISIONS,
  CaseError,
  caseContentDigest,
  type CaseErrorCode,
  parseAddHypothesisInput,
  parseAddMissingEvidenceInput,
  parseAddObservationInput,
  parseCaseRecord,
  parseCreateCaseInput,
  parseSubmitReviewInput,
  parseWaiveNoteInput,
  validateCaseId,
  type EngineeringCase,
  type Hypothesis,
  type Observation,
} from "./model";
import { EV_MOISTURE_READING, EV_WALL_PHOTO, FIXED_NOW } from "./testkit";

/* ------------------------------------------------------------------ */
/* Fixtures                                                             */
/* ------------------------------------------------------------------ */

function observationFixture(): Observation {
  return {
    observationId: "obs-a1b2c3d4e5f60718",
    statement: "Efflorescence on the north wall, 1.2 m above floor level.",
    epistemicStatus: "OBSERVED",
    recordedAt: FIXED_NOW,
    evidenceIds: [EV_WALL_PHOTO, EV_MOISTURE_READING],
    measurementRefs: ["meas-moisture-7"],
  };
}

function hypothesisFixture(): Hypothesis {
  return {
    hypothesisId: "hyp-a1b2c3d4e5f60718",
    statement: "Rainwater penetration through a failed render.",
    epistemicStatus: "INFERRED",
    supportingObservationIds: ["obs-a1b2c3d4e5f60718"],
    contradictingObservationIds: [],
    confidence: "medium",
    recordedAt: FIXED_NOW,
  };
}

function caseFixture(): EngineeringCase {
  return {
    caseId: "case-fixture-1",
    title: "Damp ingress, north elevation",
    status: "open",
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    observations: [observationFixture()],
    hypotheses: [hypothesisFixture()],
    missingEvidence: [
      {
        missingId: "mis-a1b2c3d4e5f60718",
        description: "Roof drainage condition above the affected wall.",
        kind: "MISSING",
        wouldResolve: ["hyp-a1b2c3d4e5f60718"],
        requestedMethod: "drone photo pass",
        status: "open",
      },
    ],
    links: { nodeIds: ["node-wall-north"], evidenceIds: [], captureSessionIds: ["session-42"] },
    history: [
      {
        eventId: "evt-000001",
        eventType: "case_created",
        occurredAt: FIXED_NOW,
        recordDigest: sha256Hex("digest-seed-1"),
      },
    ],
  };
}

function expectCode(fn: () => unknown, code: CaseErrorCode): void {
  try {
    fn();
    expect.unreachable(`expected a typed ${code} rejection`);
  } catch (error) {
    expect(error).toBeInstanceOf(CaseError);
    expect((error as CaseError).code).toBe(code);
  }
}

/* ------------------------------------------------------------------ */
/* Registries                                                           */
/* ------------------------------------------------------------------ */

describe("cases model: registries", () => {
  test("vocabularies are frozen and exact", () => {
    expect(Object.isFrozen(CASE_STATUSES)).toBe(true);
    expect([...CASE_STATUSES]).toEqual(["open", "under_review", "resolved", "closed"]);
    expect(Object.isFrozen(HYPOTHESIS_EPISTEMIC_STATUSES)).toBe(true);
    expect([...HYPOTHESIS_EPISTEMIC_STATUSES]).toEqual(["INFERRED", "PROPOSED"]);
    expect(Object.isFrozen(CONFIDENCE_LEVELS)).toBe(true);
    expect([...CONFIDENCE_LEVELS]).toEqual(["low", "medium", "high"]);
    expect(Object.isFrozen(MISSING_EVIDENCE_KINDS)).toBe(true);
    expect([...MISSING_EVIDENCE_KINDS]).toEqual(["MISSING", "WEAK", "AMBIGUOUS"]);
    expect(Object.isFrozen(MISSING_EVIDENCE_STATUSES)).toBe(true);
    expect([...MISSING_EVIDENCE_STATUSES]).toEqual(["open", "collected", "waived"]);
    expect(Object.isFrozen(REVIEW_DECISIONS)).toBe(true);
    expect([...REVIEW_DECISIONS]).toEqual(["approved", "rejected", "needs_more_evidence"]);
    expect(Object.isFrozen(CASE_EVENT_TYPES)).toBe(true);
    // The hypothesis vocabulary structurally EXCLUDES the fact statuses.
    expect([...HYPOTHESIS_EPISTEMIC_STATUSES]).not.toContain("OBSERVED");
    expect([...HYPOTHESIS_EPISTEMIC_STATUSES]).not.toContain("CONFIRMED");
  });

  test("error code registry is frozen, unique and stable", () => {
    expect(Object.isFrozen(CASE_ERROR_CODES)).toBe(true);
    const codes = [...CASE_ERROR_CODES];
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain("observation_without_evidence");
    expect(codes).toContain("unknown_observation_ref");
    expect(codes).toContain("review_required_for_resolution");
    expect(codes).toContain("already_resolved");
    expect(codes).toContain("waiver_note_required");
  });
});

/* ------------------------------------------------------------------ */
/* Epistemic separation (type-level + boundary)                         */
/* ------------------------------------------------------------------ */

describe("cases model: epistemic separation", () => {
  test("type-level: an Observation cannot carry INFERRED/PROPOSED status", () => {
    const observation = observationFixture();
    // @ts-expect-error — INFERRED on an Observation is a COMPILE ERROR (facts stay facts)
    const asInferred: Observation = { ...observation, epistemicStatus: "INFERRED" };
    // @ts-expect-error — PROPOSED on an Observation is a COMPILE ERROR (facts stay facts)
    const asProposed: Observation = { ...observation, epistemicStatus: "PROPOSED" };
    void asInferred;
    void asProposed;
  });

  test("type-level: a Hypothesis cannot carry OBSERVED status", () => {
    const hypothesis = hypothesisFixture();
    // @ts-expect-error — OBSERVED on a Hypothesis is a COMPILE ERROR (inferences stay inferences)
    const asObserved: Hypothesis = { ...hypothesis, epistemicStatus: "OBSERVED" };
    // @ts-expect-error — CONFIRMED on a Hypothesis is a COMPILE ERROR (confirmation is a review act)
    const asConfirmed: Hypothesis = { ...hypothesis, epistemicStatus: "CONFIRMED" };
    void asObserved;
    void asConfirmed;
  });

  test("boundary: an observation claiming INFERRED is a typed rejection", () => {
    expectCode(
      () =>
        parseAddObservationInput({
          statement: "s",
          evidenceIds: [EV_WALL_PHOTO],
          epistemicStatus: "INFERRED",
        }),
      "invalid_epistemic_status",
    );
    expectCode(
      () =>
        parseAddObservationInput({
          statement: "s",
          evidenceIds: [EV_WALL_PHOTO],
          epistemicStatus: "PROPOSED",
        }),
      "invalid_epistemic_status",
    );
  });

  test("boundary: an explicitly-OBSERVED observation parses (self-declaring fact)", () => {
    const input = parseAddObservationInput({
      statement: "s",
      evidenceIds: [EV_WALL_PHOTO],
      epistemicStatus: "OBSERVED",
    });
    expect(input.statement).toBe("s");
    expect(input.evidenceIds).toEqual([EV_WALL_PHOTO]);
  });

  test("boundary: a hypothesis claiming OBSERVED is a typed rejection", () => {
    expectCode(
      () =>
        parseAddHypothesisInput({
          statement: "s",
          epistemicStatus: "OBSERVED",
          supportingObservationIds: [],
          contradictingObservationIds: [],
          confidence: "low",
        }),
      "invalid_epistemic_status",
    );
    expectCode(
      () =>
        parseAddHypothesisInput({
          statement: "s",
          epistemicStatus: "CONFIRMED",
          supportingObservationIds: [],
          contradictingObservationIds: [],
          confidence: "low",
        }),
      "invalid_epistemic_status",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Evidence traceability (boundary)                                     */
/* ------------------------------------------------------------------ */

describe("cases model: observation evidence traceability", () => {
  test("an observation without evidenceIds is a typed rejection", () => {
    expectCode(() => parseAddObservationInput({ statement: "s" }), "observation_without_evidence");
    expectCode(
      () => parseAddObservationInput({ statement: "s", evidenceIds: [] }),
      "observation_without_evidence",
    );
    expectCode(
      () => parseAddObservationInput({ statement: "s", evidenceIds: "ev-1" }),
      "observation_without_evidence",
    );
  });

  test("malformed evidence entries are typed invalid_evidence_ref", () => {
    expectCode(
      () => parseAddObservationInput({ statement: "s", evidenceIds: [EV_WALL_PHOTO, ""] }),
      "invalid_evidence_ref",
    );
    expectCode(
      () => parseAddObservationInput({ statement: "s", evidenceIds: [EV_WALL_PHOTO, 7] }),
      "invalid_evidence_ref",
    );
  });

  test("empty statement is a typed rejection; measurementRefs shape enforced", () => {
    expectCode(() => parseAddObservationInput({ statement: "", evidenceIds: [EV_WALL_PHOTO] }), "invalid_statement");
    expectCode(
      () =>
        parseAddObservationInput({
          statement: "s",
          evidenceIds: [EV_WALL_PHOTO],
          measurementRefs: ["meas-1", ""],
        }),
      "invalid_observation",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Remaining parsers                                                    */
/* ------------------------------------------------------------------ */

describe("cases model: create/hypothesis/missing-evidence/review parsers", () => {
  test("createCase input: happy path with links, and rejections", () => {
    const input = parseCreateCaseInput({
      caseId: "case-1",
      title: "T",
      links: { nodeIds: ["n1"], evidenceIds: ["e1"], captureSessionIds: ["s1"] },
    });
    expect(input.caseId).toBe("case-1");
    expect(input.links.nodeIds).toEqual(["n1"]);
    expect(parseCreateCaseInput({ caseId: "case-1", title: "T" }).links.nodeIds).toEqual([]);
    expectCode(() => parseCreateCaseInput({ caseId: "case-1" }), "invalid_case");
    expectCode(() => parseCreateCaseInput({ caseId: "case-1", title: "" }), "invalid_case");
    expectCode(
      () => parseCreateCaseInput({ caseId: "case-1", title: "T", links: { nodeIds: "n1" } }),
      "invalid_case",
    );
    expectCode(() => validateCaseId("x".repeat(257)), "invalid_case_id");
    expectCode(() => parseCreateCaseInput({ caseId: "", title: "T" }), "invalid_case_id");
  });

  test("hypothesis input: both inference statuses parse; confidence is validated", () => {
    const base = {
      statement: "s",
      supportingObservationIds: ["obs-1"],
      contradictingObservationIds: ["obs-2"],
    };
    expect(parseAddHypothesisInput({ ...base, epistemicStatus: "INFERRED", confidence: "low" }).epistemicStatus).toBe("INFERRED");
    expect(parseAddHypothesisInput({ ...base, epistemicStatus: "PROPOSED", confidence: "high" }).confidence).toBe("high");
    expectCode(
      () => parseAddHypothesisInput({ ...base, epistemicStatus: "INFERRED", confidence: "certain" }),
      "invalid_confidence",
    );
    expectCode(
      () =>
        parseAddHypothesisInput({
          statement: "s",
          epistemicStatus: "INFERRED",
          confidence: "low",
          supportingObservationIds: "obs-1",
          contradictingObservationIds: [],
        }),
      "invalid_hypothesis",
    );
  });

  test("missing-evidence input: happy path and rejections", () => {
    const input = parseAddMissingEvidenceInput({
      description: "roof drainage unknown",
      kind: "WEAK",
      wouldResolve: ["hyp-1"],
      requestedMethod: "drone photo",
    });
    expect(input.kind).toBe("WEAK");
    expect(input.requestedMethod).toBe("drone photo");
    expectCode(
      () => parseAddMissingEvidenceInput({ description: "d", kind: "GONE", wouldResolve: [] }),
      "invalid_missing_evidence",
    );
    expectCode(
      () => parseAddMissingEvidenceInput({ description: "d", kind: "MISSING", wouldResolve: "hyp-1" }),
      "invalid_missing_evidence",
    );
    expectCode(() => parseAddMissingEvidenceInput({ kind: "MISSING", wouldResolve: [] }), "invalid_missing_evidence");
  });

  test("review input and waiver note rejections", () => {
    expect(parseSubmitReviewInput({ reviewer: "eng-1", decision: "approved", note: "ok" }).decision).toBe("approved");
    expectCode(
      () => parseSubmitReviewInput({ reviewer: "eng-1", decision: "maybe", note: "n" }),
      "invalid_review",
    );
    expectCode(() => parseSubmitReviewInput({ reviewer: "", decision: "approved", note: "n" }), "invalid_review");
    expectCode(() => parseSubmitReviewInput({ reviewer: "eng-1", decision: "approved", note: "" }), "invalid_review");
    expectCode(() => parseWaiveNoteInput({}), "waiver_note_required");
    expectCode(() => parseWaiveNoteInput({ note: "  " }), "waiver_note_required");
  });
});

/* ------------------------------------------------------------------ */
/* Digest discipline                                                    */
/* ------------------------------------------------------------------ */

describe("cases model: content digest", () => {
  test("deterministic over content; changes with content; EXCLUDES history", () => {
    const record = caseFixture();
    expect(caseContentDigest(record)).toBe(caseContentDigest({ ...record }));
    expect(caseContentDigest({ ...record, title: "other" })).not.toBe(caseContentDigest(record));
    // Appending an audit event NEVER changes the content digest — prior
    // digests pinned in history therefore stay valid forever.
    const withEvent = {
      ...record,
      history: [
        ...record.history,
        {
          eventId: "evt-000002",
          eventType: "observation_recorded" as const,
          occurredAt: FIXED_NOW,
          recordDigest: sha256Hex("digest-seed-2"),
        },
      ],
    };
    expect(caseContentDigest(withEvent)).toBe(caseContentDigest(record));
    // The review field participates in the digest (it is content).
    expect(
      caseContentDigest({
        ...record,
        review: {
          reviewer: "eng-1",
          decision: "approved",
          note: "n",
          reviewedAt: FIXED_NOW,
          evidenceStateDigest: sha256Hex("state"),
        },
      }),
    ).not.toBe(caseContentDigest(record));
  });
});

/* ------------------------------------------------------------------ */
/* Stored-record parser                                                 */
/* ------------------------------------------------------------------ */

describe("cases model: stored-record parser", () => {
  test("a full record round-trips through parseCaseRecord", () => {
    const record = caseFixture();
    const parsed = parseCaseRecord(JSON.parse(JSON.stringify(record)));
    expect(parsed).toEqual(record);
    expect(parsed.observations[0]?.epistemicStatus).toBe("OBSERVED");
    expect(parsed.hypotheses[0]?.epistemicStatus).toBe("INFERRED");
  });

  test("garbage and invariant violations on disk are typed rejections", () => {
    expectCode(() => parseCaseRecord({ nope: true }), "invalid_case_record");
    expectCode(() => parseCaseRecord("nope"), "invalid_case_record");
    // An OBSERVED-only invariant violation in a stored observation.
    expectCode(
      () =>
        parseCaseRecord({
          ...JSON.parse(JSON.stringify(caseFixture())),
          observations: [{ ...JSON.parse(JSON.stringify(observationFixture())), epistemicStatus: "INFERRED" }],
        }),
      "invalid_case_record",
    );
    // A waived entry without its note is unrepresentable.
    expectCode(
      () =>
        parseCaseRecord({
          ...JSON.parse(JSON.stringify(caseFixture())),
          missingEvidence: [
            { ...JSON.parse(JSON.stringify(caseFixture())).missingEvidence[0], status: "waived" },
          ],
        }),
      "invalid_case_record",
    );
  });
});
