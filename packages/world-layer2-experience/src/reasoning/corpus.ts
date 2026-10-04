/**
 * WORLD-P2 — the REASONING family corpus (`src/reasoning/`).
 *
 * The committed, deterministic fixtures of the BOUNDED-REASONING and
 * DETERMINISTIC-CHECKS stages: the fixture reasoning requests (the
 * engineer's questions over the pinned case scope) and the fixture
 * attached-check sets (engine-owned checks citing a DECLARED deterministic
 * engine snapshot digest + advisory checks citing the reasoning result).
 *
 * The engine snapshot digest is a DECLARED fixture input (a 64-hex digest
 * of the committed engine-snapshot bytes): the deterministic solution
 * engine and verification seams stay the ONLY engineering authorities, and
 * the WORLD-P4 wiring binds these ids to real engine snapshots. Nothing
 * here fabricates an engine verdict — the fixture only exercises the
 * GATE's classification and roll-up laws.
 */

import { textDigestOf } from "../seam";
import type {
  AttachedCheck,
  BoundedReasoningRequest,
} from "./contract";
import {
  BOUNDED_REASONING_REQUEST_KIND,
  BOUNDED_REASONING_REQUEST_SCHEMA_VERSION,
} from "./contract";
import {
  FIXTURE_ACTOR_ENGINEER,
  FIXTURE_PROBLEM_ID,
  PROBLEM_FIXTURE_RECORDED_AT,
} from "../problem/corpus";

/* ------------------------------------------------------------------ */
/* The fixture reasoning requests                                       */
/* ------------------------------------------------------------------ */

/** The declared prompt-template identities (provenance law #4). */
export const FIXTURE_PROMPT_TEMPLATE_ID = "layer2.bounded-question/1" as const;
export const FIXTURE_PROMPT_TEMPLATE_VERSION = "1.0.0" as const;

/** The fixture request ids (stable, content-derived). */
export const FIXTURE_REASONING_REQUEST_ID = textDigestOf(
  "AISE-WORLD-P2-fixture-reasoning-request-propose-next-action",
);
export const FIXTURE_INSUFFICIENT_REQUEST_ID = textDigestOf(
  "AISE-WORLD-P2-fixture-reasoning-request-insufficient",
);

/**
 * The scenario-B reasoning request: the engineer asks the bounded agent
 * for the next action over the READY case scope. `contextId` and
 * `reportId` are filled by the lane runner from the assembled fixtures
 * (they pin the retrieval scope); the corpus carries the request builder.
 */
export function fixtureReasoningRequest(
  contextId: string,
  reportId: string,
): BoundedReasoningRequest {
  return {
    kind: BOUNDED_REASONING_REQUEST_KIND,
    schemaVersion: BOUNDED_REASONING_REQUEST_SCHEMA_VERSION,
    requestId: FIXTURE_REASONING_REQUEST_ID,
    problemId: FIXTURE_PROBLEM_ID,
    contextId,
    reportId,
    question: "propose_next_action",
    questionText:
      "Given the evidence envelope and the measured basis of the lintel-bearing crack above " +
      "Opening-001, what is the next governed engineering step? Ground every statement in the " +
      "case evidence and refuse if the basis is insufficient.",
    askedBy: FIXTURE_ACTOR_ENGINEER,
    askedAt: PROBLEM_FIXTURE_RECORDED_AT,
    promptTemplateId: FIXTURE_PROMPT_TEMPLATE_ID,
    promptTemplateVersion: FIXTURE_PROMPT_TEMPLATE_VERSION,
  };
}

/** A request whose pinned scope does not match the supplied scope (refused). */
export function scopeMismatchRequest(
  contextId: string,
  reportId: string,
): BoundedReasoningRequest {
  return {
    ...fixtureReasoningRequest(contextId, reportId),
    requestId: textDigestOf("AISE-WORLD-P2-fixture-reasoning-request-scope-mismatch"),
    contextId: textDigestOf("AISE-WORLD-P2-fixture-context-not-the-pinned-one"),
  };
}

/* ------------------------------------------------------------------ */
/* The fixture deterministic-check attachments                          */
/* ------------------------------------------------------------------ */

/**
 * The DECLARED engine-snapshot digest — the fixture stands in for the
 * deterministic solution engine's validated snapshot bytes. The gate
 * treats it as an opaque 64-hex provenance pin; it NEVER interprets it
 * (the engines own their verdicts; the gate owns only the
 * classification + roll-up).
 */
export const FIXTURE_ENGINE_SNAPSHOT_DIGEST = textDigestOf(
  "AISE-WORLD-P2-fixture-declared-engine-snapshot-bytes",
);

/**
 * The scenario-B attached checks: two engine-owned checks (from the
 * closed inventory, sourced from the declared engine snapshot) + one
 * advisory check (sourced from the bounded-reasoning result). The
 * `sourceProvenanceDigest` of the advisory check is filled by the lane
 * runner with the actual reasoning result id.
 */
export function fixtureAttachedChecks(
  reasoningResultId: string,
): readonly AttachedCheck[] {
  return [
    {
      checkId: "solution.geometry.dimensions-positive",
      ownership: "engine-owned",
      outcome: "pass",
      detail:
        "Every numeric parameter of the proposed strengthening operation is strictly positive " +
        "(deterministic engine snapshot, declared fixture digest).",
      sourceKind: "deterministic-engine",
      sourceProvenanceDigest: FIXTURE_ENGINE_SNAPSHOT_DIGEST,
    },
    {
      checkId: "solution.units.quantity-units-typed",
      ownership: "engine-owned",
      outcome: "pass",
      detail:
        "Every numeric parameter's unit is in the engine's unit vocabulary and every quantity " +
        "impact carries an explicit unit (deterministic engine snapshot, declared fixture digest).",
      sourceKind: "deterministic-engine",
      sourceProvenanceDigest: FIXTURE_ENGINE_SNAPSHOT_DIGEST,
    },
    {
      checkId: "advisory.substrate-property-consistency",
      ownership: "advisory",
      outcome: "review-needed",
      detail:
        "The BIM-derived LoadBearing candidate contradicts the observed distress pattern; an " +
        "engineer should review the model-vs-field divergence before accepting the proposal " +
        "(advisory only — a bounded-reasoning output, never an engineering verdict).",
      sourceKind: "bounded-reasoning",
      sourceProvenanceDigest: reasoningResultId,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Negative fixtures (fail-closed drills)                               */
/* ------------------------------------------------------------------ */

/** A check claiming engine ownership from OUTSIDE the closed inventory. */
export const FABRICATED_AUTHORITY_CHECK: AttachedCheck = {
  checkId: "advisory.llm-certified-geometry",
  ownership: "engine-owned",
  outcome: "pass",
  detail: "A fabricated check id claiming engine ownership — must be refused.",
  sourceKind: "bounded-reasoning",
  sourceProvenanceDigest: FIXTURE_ENGINE_SNAPSHOT_DIGEST,
};

/** An inventory check claiming engine ownership from an LLM source. */
export const LLM_SOURCED_ENGINE_CHECK: AttachedCheck = {
  checkId: "solution.geometry.dimensions-positive",
  ownership: "engine-owned",
  outcome: "pass",
  detail: "An inventory check produced by a bounded reasoner — must be refused.",
  sourceKind: "bounded-reasoning",
  sourceProvenanceDigest: FIXTURE_ENGINE_SNAPSHOT_DIGEST,
};

/** An engine-produced check mislabeled as advisory. */
export const MISLABELED_ADVISORY_CHECK: AttachedCheck = {
  checkId: "solution.units.quantity-units-typed",
  ownership: "advisory",
  outcome: "pass",
  detail: "An engine-produced check mislabeled advisory — must be refused.",
  sourceKind: "deterministic-engine",
  sourceProvenanceDigest: FIXTURE_ENGINE_SNAPSHOT_DIGEST,
};

/** An advisory check citing an unsupplied reasoning result. */
export const UNRESOLVED_ADVISORY_CHECK: AttachedCheck = {
  checkId: "advisory.some-check",
  ownership: "advisory",
  outcome: "review-needed",
  detail: "An advisory check citing a reasoning result that was never supplied.",
  sourceKind: "bounded-reasoning",
  sourceProvenanceDigest: textDigestOf("AISE-WORLD-P2-fixture-reasoning-result-never-supplied"),
};
