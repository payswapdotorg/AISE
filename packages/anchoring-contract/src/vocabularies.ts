/**
 * ANCHOR-002 — the closed vocabularies of the shared anchoring contract.
 *
 * Every vocabulary below is CLOSED and VERSIONED (carried by
 * `ANCHORING_CONTRACT_VERSION`): adding a value is a minor contract bump;
 * removing or renaming one is a major bump. A provider that answers with a
 * value outside the vocabulary is refused by the guard (law 1 — no provider
 * type crosses the canonical contract; the refusal names the value).
 *
 * Sources (frozen):
 *  - `docs/productization-evidence/ANCHOR-001/PORT.md` §2/§3 (the spike's
 *    wire vocabularies, lifted verbatim);
 *  - `docs/anchoring-contract-work-orders-2026-09-30.md` §ANCHOR-002
 *    "Required work" (the NEW whole-request outcome vocabulary
 *    `anchored | partial | refused`, closed and versioned; the per-still
 *    reason codes of the typed PARTIAL outcome);
 *  - `packages/shared-contracts/src/evidence.ts` `EVIDENCE_METHODS` (the
 *    still-evidence methods this contract admits today are the spike-exercised
 *    subset of that house vocabulary).
 */

/** The only plan-context kind exercised (closed; PORT.md §2). */
export const PLAN_CONTEXT_KINDS = ["plan-raster"] as const;
export type PlanContextKind = (typeof PLAN_CONTEXT_KINDS)[number];

/** The only anchoring representation exercised (closed; PORT.md §2). */
export const ANCHORING_REPRESENTATIONS = ["plan-homography"] as const;
export type AnchoringRepresentation = (typeof ANCHORING_REPRESENTATIONS)[number];

/**
 * The closed still-evidence acquisition-method vocabulary (the
 * spike-exercised member of the house `EVIDENCE_METHODS` vocabulary).
 */
export const ANCHORING_EVIDENCE_METHODS = ["STILL_IMAGERY"] as const;
export type AnchoringEvidenceMethod = (typeof ANCHORING_EVIDENCE_METHODS)[number];

/**
 * The closed whole-request outcome vocabulary — the ANCHOR-002 widening of
 * the spike's `anchored | refused` with the typed PARTIAL outcome designed
 * in at the contract layer (PORT.md §7's first open question, resolved):
 *
 *  - `anchored`: every requested still carries an anchoring hypothesis;
 *  - `partial`:  the anchored stills carry their hypotheses AND the refused
 *                stills carry their typed per-still reason codes;
 *  - `refused`:  the whole request failed closed — ZERO hypotheses (the
 *                spike's whole-request discipline, kept verbatim).
 */
export const ANCHORING_OUTCOMES = ["anchored", "partial", "refused"] as const;
export type AnchoringOutcome = (typeof ANCHORING_OUTCOMES)[number];

/**
 * The closed whole-request refusal vocabulary — carried verbatim from the
 * spike (PORT.md §3), versioned by this contract.
 */
export const ANCHORING_REASON_CODES = [
  "input-contract-violation",
  "plan-context-missing",
  "plan-context-unsupported",
  "representation-unsupported",
  "evidence-method-unsupported",
  "evidence-bytes-mismatch",
  "insufficient-stills",
  "insufficient-features",
  "registration-unreliable",
] as const;
export type AnchoringReasonCode = (typeof ANCHORING_REASON_CODES)[number];

/**
 * The closed PER-STILL refusal vocabulary of the typed PARTIAL outcome: the
 * whole-request codes that can NAME one still. A refused still carries
 * exactly one of these (never a whole-request-only code such as
 * `insufficient-stills` — that refusal cannot name a still).
 */
export const ANCHORING_PER_STILL_REASON_CODES = [
  "evidence-method-unsupported",
  "evidence-bytes-mismatch",
  "insufficient-features",
  "registration-unreliable",
] as const;
export type AnchoringPerStillReasonCode =
  (typeof ANCHORING_PER_STILL_REASON_CODES)[number];

/** Anchoring hypotheses are always INFERRED candidates (PORT.md §3/§4). */
export const HYPOTHESIS_EPISTEMIC_LABELS = ["INFERRED"] as const;
export type HypothesisEpistemicLabel = (typeof HYPOTHESIS_EPISTEMIC_LABELS)[number];

/**
 * The declared CONTRACT-LAYER gate order — the order in which the port's
 * gates refuse (the work order's own sequence, law 3: fail closed BEFORE
 * anchoring). The provider's internal gate order remains its own policy
 * (PORT.md §4 mirrors the engine's `apply.ts` discipline); what the CONTRACT
 * pins is that these five gates run BEFORE any hypothesis can exist, and
 * that a refusal from an earlier gate wins.
 */
export const ANCHORING_GATE_STAGES = [
  "input-sanity",
  "content-id-re-verification",
  "evidence-method-support",
  "plan-context-support",
  "parameters",
] as const;
export type AnchoringGateStage = (typeof ANCHORING_GATE_STAGES)[number];

/** The closed guard-violation vocabulary (typed, tested invariant failures). */
export const ANCHORING_GUARD_VIOLATION_CODES = [
  "unknown-field",
  "missing-field",
  "type-mismatch",
  "vocabulary-violation",
  "value-out-of-range",
  "refusal-discipline",
  "partial-accounting",
  "identity-echo",
  "matrix-normalization",
  "budget-ordering",
] as const;
export type AnchoringGuardViolationCode =
  (typeof ANCHORING_GUARD_VIOLATION_CODES)[number];

/** The closed supervised-runner failure vocabulary (typed, bounded). */
export const ANCHORING_RUNNER_FAILURE_KINDS = [
  "spawn-failed",
  "timeout",
  "nonzero-exit",
  "invalid-json",
  "guard-refused",
  "input-digest-mismatch",
] as const;
export type AnchoringRunnerFailureKind =
  (typeof ANCHORING_RUNNER_FAILURE_KINDS)[number];
