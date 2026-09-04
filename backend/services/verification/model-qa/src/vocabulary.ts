/**
 * The AISE-014 finding vocabulary: check families, finding codes,
 * outcomes, severities and the FIXED blocking policy.
 *
 * Architectural rules encoded here (frozen v1.0):
 *
 * - **Outcome semantics are three-valued and never conflated**: a
 *   CONTRADICTION is an affirmative conflict; INSUFFICIENT_EVIDENCE
 *   means required support is missing; UNEVALUABLE means the check
 *   cannot establish its invariant on the given content. A missing
 *   observation is never interpreted as absence — the check that
 *   cannot decide says so (UNEVALUABLE), it does not pass silently.
 * - **PASS is a report-level outcome only**: it exists iff the
 *   report carries zero findings (no "conditional" authority
 *   state is invented — AISE-020 owns downstream policy).
 * - **Every CONTRADICTION is blocking** — a contradiction is never
 *   advisory (downgrading one is a mutation-tested regression).
 * - **Fail-closed at CRITICAL**: an UNEVALUABLE finding blocks at
 *   the CRITICAL profile (the invariant cannot be established);
 *   INSUFFICIENT_EVIDENCE blocks from HIGH_ASSURANCE up. The
 *   blocking table is monotone: LIGHT ⊆ STANDARD ⊆
 *   HIGH_ASSURANCE ⊆ CRITICAL in blocking strength.
 * - **Severity classifies, blocking gates**: CONTRADICTION is
 *   CRITICAL severity; the evidence/evaluability findings are
 *   MAJOR. The blocking bit is derived from (outcome, profile)
 *   by the fixed table below — never from caller input.
 */
import type { AssuranceProfile } from "@aise/shared-contracts";

/** The five AISE-014 check families (the directive's taxonomy). */
export const QA_CHECK_FAMILIES = Object.freeze([
  "GEOMETRY",
  "TOPOLOGY",
  "SEMANTIC",
  "EPISTEMIC",
  "CROSS_OBJECT",
] as const);
export type QaCheckFamily = (typeof QA_CHECK_FAMILIES)[number];

/** Per-finding outcomes. PASS exists only at report level. */
export const QA_FINDING_OUTCOMES = Object.freeze([
  "CONTRADICTION",
  "INSUFFICIENT_EVIDENCE",
  "UNEVALUABLE",
] as const);
export type QaFindingOutcome = (typeof QA_FINDING_OUTCOMES)[number];

/** Report-level outcomes (PASS iff zero findings). */
export const QA_REPORT_OUTCOMES = Object.freeze([
  "PASS",
  "CONTRADICTION",
  "INSUFFICIENT_EVIDENCE",
  "UNEVALUABLE",
] as const);
export type QaReportOutcome = (typeof QA_REPORT_OUTCOMES)[number];

/** Severity: classification of how consequential a finding is. */
export const QA_SEVERITIES = Object.freeze(["CRITICAL", "MAJOR"] as const);
export type QaSeverity = (typeof QA_SEVERITIES)[number];

/**
 * The assurance-profile ladder QA runs under (AC-110: the profile
 * is recorded for a verification run). The vocabulary is the
 * frozen cross-platform one (`@aise/shared-contracts`); the rank
 * order mirrors AISE-013's monotone table.
 */
export const QA_PROFILES: readonly AssuranceProfile[] = Object.freeze([
  "LIGHT",
  "STANDARD",
  "HIGH_ASSURANCE",
  "CRITICAL",
]);

/** Rank of a profile on the monotone ladder (LIGHT = 0). */
export function qaProfileRank(profile: AssuranceProfile): number {
  const index = QA_PROFILES.indexOf(profile);
  if (index < 0) {
    throw new Error(`unknown assurance profile: ${String(profile)}`);
  }
  return index;
}

/**
 * The stable finding-code registry. Codes are machine-readable
 * contract surface: adding one is a feature, changing the meaning
 * of an existing one is a breaking change.
 */
export const QA_FINDING_CODES = Object.freeze([
  // --- GEOMETRY ---------------------------------------------------------
  /** Object geometry fails the model's own structural validation. */
  "GEOMETRY_INVALID",
  /** width/height disagrees with the declared rectangle extents. */
  "GEOMETRY_EXTENTS_MISMATCH",
  /** area disagrees with width × height. */
  "GEOMETRY_AREA_MISMATCH",
  /** elevation disagrees with the geometry plane's height. */
  "GEOMETRY_ELEVATION_MISMATCH",
  /** window sill height is not strictly below its head height. */
  "GEOMETRY_SILL_HEAD_INCONSISTENT",
  /** non-positive dimension where a positive extent is required. */
  "GEOMETRY_DIMENSION_NON_POSITIVE",
  /** opening dimension exceeds its host wall's dimension. */
  "OPENING_EXCEEDS_HOST",
  /** opening head/sill height disagrees with its rectangle position. */
  "OPENING_MISPLACED",
  // --- TOPOLOGY ---------------------------------------------------------
  /** space-parent rank ordering is violated. */
  "HIERARCHY_RANK_INVALID",
  /** an object is claimed by more than one containing space. */
  "MULTI_CONTAINER",
  /** an opening is hosted by more than one wall. */
  "MULTI_HOST",
  /** an opening's container differs from its host wall's container. */
  "OPENING_SPACE_MISMATCH",
  // --- SEMANTIC ---------------------------------------------------------
  /** geometry field present on an object class it does not belong to. */
  "KIND_FIELD_INCOMPATIBLE",
  /** a property assertion contradicts the object's geometry quantity. */
  "PROPERTY_GEOMETRY_CONTRADICTION",
  // --- EPISTEMIC --------------------------------------------------------
  /** a CONFIRMED assertion's verification validity is invalidated. */
  "CONFIRMATION_INVALIDATED",
  /** a CONFIRMED assertion has no evidence support at all. */
  "CONFIRMATION_UNSUPPORTED",
  /** an assertion cites evidence that is not registered. */
  "EVIDENCE_REF_UNREGISTERED",
  /** object epistemic state is stronger than its weakest geometry asset. */
  "EPISTEMIC_UPGRADE_VIOLATION",
  /** readiness context pins content other than the verified graph. */
  "READINESS_CONTEXT_MISMATCH",
  /** provenance claims the object derives from itself. */
  "PROVENANCE_SELF_REFERENCE",
  // --- CROSS_OBJECT -----------------------------------------------------
  /** same-class co-planar objects overlap (impossible by kind). */
  "OVERLAP_FORBIDDEN",
  /** two objects are identical representations of one physical object. */
  "DUPLICATE_REPRESENTATION",
  /** an opening's rectangle is not within its host wall's rectangle. */
  "OPENING_OUTSIDE_HOST",
  /** a floor's elevation is not below a ceiling's in the same space. */
  "FLOOR_CEILING_ELEVATION_REVERSED",
] as const);
export type QaFindingCode = (typeof QA_FINDING_CODES)[number];

/** Every code's family (the registry's authoritative mapping). */
export const CODE_FAMILY: Readonly<Record<QaFindingCode, QaCheckFamily>> = Object.freeze({
  GEOMETRY_INVALID: "GEOMETRY",
  GEOMETRY_EXTENTS_MISMATCH: "GEOMETRY",
  GEOMETRY_AREA_MISMATCH: "GEOMETRY",
  GEOMETRY_ELEVATION_MISMATCH: "GEOMETRY",
  GEOMETRY_SILL_HEAD_INCONSISTENT: "GEOMETRY",
  GEOMETRY_DIMENSION_NON_POSITIVE: "GEOMETRY",
  OPENING_EXCEEDS_HOST: "GEOMETRY",
  OPENING_MISPLACED: "GEOMETRY",
  HIERARCHY_RANK_INVALID: "TOPOLOGY",
  MULTI_CONTAINER: "TOPOLOGY",
  MULTI_HOST: "TOPOLOGY",
  OPENING_SPACE_MISMATCH: "TOPOLOGY",
  KIND_FIELD_INCOMPATIBLE: "SEMANTIC",
  PROPERTY_GEOMETRY_CONTRADICTION: "SEMANTIC",
  CONFIRMATION_INVALIDATED: "EPISTEMIC",
  CONFIRMATION_UNSUPPORTED: "EPISTEMIC",
  EVIDENCE_REF_UNREGISTERED: "EPISTEMIC",
  EPISTEMIC_UPGRADE_VIOLATION: "EPISTEMIC",
  READINESS_CONTEXT_MISMATCH: "EPISTEMIC",
  PROVENANCE_SELF_REFERENCE: "EPISTEMIC",
  OVERLAP_FORBIDDEN: "CROSS_OBJECT",
  DUPLICATE_REPRESENTATION: "CROSS_OBJECT",
  OPENING_OUTSIDE_HOST: "CROSS_OBJECT",
  FLOOR_CEILING_ELEVATION_REVERSED: "CROSS_OBJECT",
});

/** Outcome ranking for report-level roll-up (higher = worse). */
const OUTCOME_RANK: Readonly<Record<QaFindingOutcome, number>> = Object.freeze({
  CONTRADICTION: 3,
  INSUFFICIENT_EVIDENCE: 2,
  UNEVALUABLE: 1,
});

/** The worst outcome among findings (PASS when there are none). */
export function worstOutcome(outcomes: readonly QaFindingOutcome[]): QaReportOutcome {
  let worst: QaReportOutcome = "PASS";
  let worstRank = 0;
  for (const outcome of outcomes) {
    if (OUTCOME_RANK[outcome] > worstRank) {
      worstRank = OUTCOME_RANK[outcome];
      worst = outcome;
    }
  }
  return worst;
}

/** Severity classification per outcome (fixed, not caller input). */
export function severityForOutcome(outcome: QaFindingOutcome): QaSeverity {
  return outcome === "CONTRADICTION" ? "CRITICAL" : "MAJOR";
}

/**
 * The minimum profile at which a finding of this outcome blocks.
 * `null` means always blocking — including at LIGHT.
 */
const MIN_BLOCKING_PROFILE: Readonly<Record<QaFindingOutcome, AssuranceProfile | null>> =
  Object.freeze({
    CONTRADICTION: null,
    INSUFFICIENT_EVIDENCE: "HIGH_ASSURANCE",
    UNEVALUABLE: "CRITICAL",
  });

/**
 * The blocking decision — the fixed policy table. Derived from
 * (outcome, profile) ONLY; caller input never influences it.
 */
export function isBlocking(outcome: QaFindingOutcome, profile: AssuranceProfile): boolean {
  const min = MIN_BLOCKING_PROFILE[outcome];
  if (min === null) {
    return true;
  }
  return qaProfileRank(profile) >= qaProfileRank(min);
}

/**
 * Profile-specific minimum blocking profile (observability for
 * the policy table; used by the monotonicity tests).
 */
export function minBlockingProfile(outcome: QaFindingOutcome): AssuranceProfile | null {
  return MIN_BLOCKING_PROFILE[outcome];
}

/** The check-suite identity (digest-pinned, versioned semantics). */
export const QA_CHECK_SUITE_VERSION = "qa/model-qa-v1";
