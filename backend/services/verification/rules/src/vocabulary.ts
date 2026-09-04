/**
 * The AISE-021 rule vocabulary: kinds, operators, outcomes,
 * result codes, and the FIXED gating policy.
 *
 * Architectural rules encoded here (frozen v1.0):
 *
 * - **Outcome semantics are three-valued and never conflated**
 *   (the work order's mandate): PASS is an affirmative
 *   satisfaction; FAIL is an affirmative violation; UNKNOWN
 *   means the rule cannot be decided on the current evidence.
 *   A missing assertion is never compliance (architecture §2.9:
 *   "say UNKNOWN and request more evidence instead of inventing
 *   missing facts") and an uncertainty band that straddles a
 *   bound is never a lucky PASS (lock §3: critical results are
 *   fail-closed when evidence is missing or ambiguous).
 * - **Report precedence is fixed**: FAIL > UNKNOWN > PASS. The
 *   report is PASS iff every rule result is PASS. A single
 *   indeterminate rule keeps the whole report from claiming
 *   compliance.
 * - **Gating strength is monotone** in the assurance profile
 *   (LIGHT ⊆ STANDARD ⊆ HIGH_ASSURANCE ⊆ CRITICAL): the
 *   epistemic status floor, the uncertainty requirement and the
 *   live-evidence requirement only grow with depth. The tables
 *   below are product architecture — a rule caller never
 *   configures them.
 * - **CRITICAL rule sets must declare a readiness gate** (the
 *   fail-closed composition rule: compliance work cannot bypass
 *   the AISE-013 readiness authority — the pipeline places
 *   ENGINEERING RULES after readiness, not before it).
 * - **A run may not execute a rule set below the set's declared
 *   profile** — running a CRITICAL compliance set under LIGHT
 *   would silently weaken its gates; the boundary refuses.
 */
import type { AssuranceProfile } from "@aise/shared-contracts";
import type { EpistemicState } from "@aise/engineering-model";

/** The rule kinds (machine-evaluable v1). */
export const RULE_KINDS = Object.freeze(["DIMENSION", "SPECIFICATION"] as const);
export type RuleKind = (typeof RULE_KINDS)[number];

/** The dimension comparison operators (EXACT + margin = symmetric tolerance band). */
export const RULE_OPERATORS = Object.freeze([
  "MINIMUM",
  "MAXIMUM",
  "EXACT",
] as const);
export type RuleOperator = (typeof RULE_OPERATORS)[number];

/** Per-rule and report-level outcomes (the work order's tri-state). */
export const RULE_OUTCOMES = Object.freeze(["PASS", "FAIL", "UNKNOWN"] as const);
export type RuleOutcome = (typeof RULE_OUTCOMES)[number];

/**
 * The stable result-code registry. Codes are machine-readable
 * contract surface: adding one is a feature, changing the
 * meaning of an existing one is a breaking change.
 */
export const RULE_RESULT_CODES = Object.freeze([
  /** The measured interval is entirely outside the compliant region. */
  "RULE_NOT_SATISFIED",
  /** The value's uncertainty band straddles the rule bound. */
  "RULE_INDETERMINATE",
  /** The rule's subject property is not asserted at all (absence ≠ compliance). */
  "RULE_SUBJECT_NOT_ASSERTED",
  /** The subject is asserted but carries no quantity (presence-only). */
  "RULE_SUBJECT_NOT_QUANTITATIVE",
  /** The assertion's epistemic status is below the required floor. */
  "RULE_SUBJECT_NOT_ESTABLISHED",
  /** The assertion's value carries no stated uncertainty at a depth that requires it. */
  "RULE_UNCERTAINTY_NOT_STATED",
  /** The assertion has no live evidence support at a depth that requires it. */
  "RULE_NO_EVIDENCE_SUPPORT",
  /** The assertion's unit family differs from the rule bound's family. */
  "RULE_QUANTITY_FAMILY_MISMATCH",
  /** A specification rule's status requirement is not met by the asserted status. */
  "RULE_SPEC_NOT_MET",
  /** The declared readiness gate has no readiness context at all. */
  "RULE_READINESS_MISSING",
  /** The readiness context pins content other than the verified graph/mapping. */
  "RULE_READINESS_STALE",
  /** The readiness verdict is NOT_READY at the gate's profile. */
  "RULE_READINESS_NOT_READY",
] as const);
export type RuleResultCode = (typeof RULE_RESULT_CODES)[number];

/** Which codes are FAIL-class (violation) vs UNKNOWN-class (undecidable). */
export const FAIL_CLASS_CODES: readonly RuleResultCode[] = Object.freeze([
  "RULE_NOT_SATISFIED",
  "RULE_SPEC_NOT_MET",
]);

/**
 * The assurance-profile ladder (AC-110: the profile is recorded
 * for a verification run). The vocabulary is the frozen
 * cross-platform one.
 */
export const RULE_PROFILES: readonly AssuranceProfile[] = Object.freeze([
  "LIGHT",
  "STANDARD",
  "HIGH_ASSURANCE",
  "CRITICAL",
]);

/** Rank of a profile on the monotone ladder (LIGHT = 0). */
export function ruleProfileRank(profile: AssuranceProfile): number {
  const index = RULE_PROFILES.indexOf(profile);
  if (index < 0) {
    throw new Error(`unknown assurance profile: ${String(profile)}`);
  }
  return index;
}

/**
 * The epistemic status floor per profile: the minimum status an
 * assertion must carry for a rule to treat its value as
 * ESTABLISHED. Monotone: the floor only rises. PROPOSED content
 * never establishes a rule subject at any profile (proposals are
 * not spec-compliance evidence — the epistemic discipline).
 */
export const STATUS_FLOOR_BY_PROFILE: Readonly<Record<AssuranceProfile, EpistemicState>> = Object.freeze({
  LIGHT: "INFERRED",
  STANDARD: "INFERRED",
  HIGH_ASSURANCE: "OBSERVED",
  CRITICAL: "CONFIRMED",
});

/** Whether a stated uncertainty is REQUIRED at this profile. */
export function uncertaintyRequired(profile: AssuranceProfile): boolean {
  return ruleProfileRank(profile) >= ruleProfileRank("HIGH_ASSURANCE");
}

/** Whether live evidence support is REQUIRED at this profile. */
export function evidenceSupportRequired(profile: AssuranceProfile): boolean {
  return ruleProfileRank(profile) >= ruleProfileRank("HIGH_ASSURANCE");
}

/**
 * The rule-suite identity (digest-pinned semantics version of
 * the evaluation tables above — bump when the semantics change).
 */
export const RULE_SUITE_VERSION = "rules-v1.0.0";

/** The worst of two outcomes under the fixed precedence (FAIL > UNKNOWN > PASS). */
export function worstOutcome(a: RuleOutcome, b: RuleOutcome): RuleOutcome {
  if (a === "FAIL" || b === "FAIL") {
    return "FAIL";
  }
  if (a === "UNKNOWN" || b === "UNKNOWN") {
    return "UNKNOWN";
  }
  return "PASS";
}

/** Outcome of a FAIL-class code (violation) vs anything else (undecidable). */
export function outcomeOfCode(code: RuleResultCode): RuleOutcome {
  return FAIL_CLASS_CODES.includes(code) ? "FAIL" : "UNKNOWN";
}
