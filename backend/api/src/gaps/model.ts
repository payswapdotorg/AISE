/**
 * AISE-018 — Adaptive evidence-gap engine: the module MODEL.
 *
 * Contract (spec/work-orders.md §018: "Owner ZAI. Compute evidence gaps and
 * rank next observations by task impact, expected uncertainty reduction,
 * operator effort and recoverability. Verify deliberate perturbations
 * change recommendations and no hidden evidence is fabricated.
 * CRITICAL."; spec/requirements.md R3 — "AISE shall detect evidence gaps
 * after reconstruction and propose the next best evidence action based on
 * task impact, uncertainty reduction and operator effort. Acceptance:
 * missing evidence creates actionable requests; accepted alternatives
 * retain method/uncertainty semantics; no automatic readiness downgrade is
 * permitted."; spec/architecture-lock.md "Adaptive evidence" — "Next-action
 * recommendations must be grounded in explicit evidence gaps. Additional
 * acquisition cannot fabricate or overwrite evidence. Readiness must be
 * recomputable from evidence/model state"; spec/architecture.md: "an
 * `EvidenceGapEngine` identifies missing/ambiguous/weak facts and ranks
 * candidate next observations by expected information gain, task impact
 * and operator effort"):
 *
 * THIS MODULE IS A DERIVED GAP-ANALYSIS AUTHORITY, NEVER A SECOND
 * READINESS AUTHORITY:
 *
 *  - Readiness is the assurance module's (AISE-022) authority. The gap
 *    engine CONSUMES that authority's output: the service injects the
 *    REAL `evaluateReadiness` evaluator (the wiring point passes the
 *    authority's own function; this module imports only its TYPES) and
 *    carries the resulting `ReadinessReport` VERBATIM into the derived
 *    record as consumed context. The engine NEVER re-computes a
 *    dimension outcome, NEVER emits a readiness verdict of its own and
 *    NEVER mutates a `ReadinessReport` — "no automatic readiness
 *    downgrade is permitted" is enforced structurally: there is no write
 *    path from this module into the readiness authority, and the analysis
 *    record is clearly NOT a ReadinessAssessment.
 *  - THE SUBJECTS are the pinned Reality Graph version (AISE-016
 *    authority, consumed through an injected READ-ONLY resolver returning
 *    one pinned `GraphVersion`) plus the request's observation-status
 *    annotations — the ONLY seam through which expected-but-absent
 *    subjects, OCCLUDED and capture-UNKNOWN enter (the pinned
 *    GraphVersion alone cannot express them; mirrors the AISE-032
 *    coverage-annotation seam). The evidence graph state (AISE-008
 *    authority) is consumed through an injected READ-ONLY resolver
 *    exposing exactly ONE read method. The readiness and reality
 *    authorities' own records are never mutated.
 *  - A `GapAnalysisRecord` is a DERIVED projection: a deterministic
 *    function of (assurance profile, evidence graph state, reality
 *    version) plus the request seams and the injected clock. The same
 *    inputs yield BYTE-IDENTICAL records (pinned by `inputDigest`, a
 *    sha-256 over the canonical JSON of every analysis input). Evidence
 *    gaps are DERIVED, never authoritative: recomputing against newer
 *    inputs produces a NEW append-only record, never an update.
 *  - THE ONLY sibling VALUE import is `EPISTEMIC_RANK` from the reality
 *    model — the single epistemic order authority. Redefining the rank
 *    here would create a SECOND epistemic order (forbidden); importing it
 *    keeps CONFIRMED > OBSERVED > INFERRED > PROPOSED authoritative in
 *    exactly one place (the same argument the assurance module makes).
 *
 * EPISTEMIC DISCIPLINE (the loud parts, enforced here, not by convention):
 *
 *  - `UNKNOWN`, `NOT_OBSERVED` and `OCCLUDED` are FIRST-CLASS gap states —
 *    never collapsed into each other, never silently treated as absence
 *    (worker rules; AGENTS.md). Gap `state` is the subject's EVIDENTIARY
 *    observation status (valid linked evidence / the capture-side claim),
 *    NEVER the node's epistemicStatus: epistemic statuses ride VERBATIM
 *    on the property facts and are never converted into gap states.
 *  - CONFIDENCE IS NOT MEASUREMENT UNCERTAINTY: the ONLY uncertainty the
 *    engine reasons over is the 1σ measurement uncertainty of the
 *    underlying property facts (the assurance authority's σ semantics —
 *    absent σ is UNKNOWN, never 0). Epistemic-status remediation
 *    (confirmations/assertions) scores an expected-uncertainty-reduction
 *    of exactly 0 with the derivation saying so — an epistemic upgrade is
 *    not a measurement-uncertainty change, and the score model refuses to
 *    pretend otherwise.
 *  - NO FABRICATED EVIDENCE: the engine cannot invent evidence or
 *    observations. A gap names what is MISSING and the candidate action
 *    that could acquire it — nothing more. Every evidence id the analysis
 *    touches is membership-verified against the real evidence graph
 *    (typed refusal `unknown_evidence_ref` naming the id); every evidence
 *    id named by the pinned reality version's provenance must resolve in
 *    the evidence graph (typed refusal `dangling_evidence_ref` naming the
 *    ids — the engine never guesses a method or validity for evidence it
 *    cannot see). Candidates acquire evidence; they never claim it
 *    already exists.
 *  - SUBSTITUTION IS EXPLICIT (R3: "accepted alternatives retain
 *    method/uncertainty semantics"): substitution candidates arise ONLY
 *    from the readiness authority's own device-remediation hints, carry
 *    the substituted method's OWN method/uncertainty semantics (own
 *    effort, own corroboration model), and state explicitly that they do
 *    NOT satisfy the original method's requirement — acceptance of an
 *    alternative is a governed substitution decision, never a silent
 *    requirement rewrite.
 *  - PERTURBATION SENSITIVITY (the acceptance gate): every scoring input
 *    class is a named, inspectable derivation over the analysis inputs,
 *    so a deliberate perturbation (a coverage change, an uncertainty
 *    change, an effort change, a task-impact change, a recoverability
 *    change, a device-capability change) flows through the named
 *    components into the composite and changes the ranked
 *    recommendations. A perturbation-insensitive engine is a delivery
 *    failure (tested in service.test.ts).
 *
 * RANKING (explicit, multi-criteria, deterministic):
 *
 *  - Every candidate carries FOUR named score components —
 *    `taskImpact`, `expectedUncertaintyReduction`, `operatorEffort`,
 *    `recoverability` — each an inspectable number in [0,1] with its
 *    derivation stated in `score.derivation` (named sub-factors and the
 *    formula, substituted with the actual numbers).
 *  - The composite (frozen weights, code-defined like an assurance
 *    profile — changing them is a governed change):
 *      composite = 0.35·taskImpact + 0.35·expectedUncertaintyReduction
 *                − 0.20·operatorEffort  − 0.10·recoverability
 *    Effort is a COST (subtracted). RECOVERABILITY is a deferral signal:
 *    a highly recoverable observation can be deferred without loss, so
 *    its present value is discounted — acting on low-recoverability
 *    opportunities (an occlusion that may never clear) is what the
 *    ranking rewards. All score numbers are rounded to 6 decimals at the
 *    scoring boundary (part of the scoring contract — deterministic
 *    bytes, deterministic comparisons).
 *  - Canonical ordering: composite DESC, then candidateId ASC
 *    (content-derived ids make the total order stable and
 *    byte-reproducible). Every recommendation NAMES the gaps it
 *    addresses (`addressesGapIds`, non-empty, store-verified).
 *
 * DETERMINISM: content-derived ids (`gap-<16 hex>` / `cand-<16 hex>` over
 * stable identity strings), canonical gap ordering (task-level gaps first
 * by gapClass then propertyKey; subject gaps by subjectNodeId, then
 * propertyKey, then gapClass), candidates in rank order, injected clock
 * only, canonical JSON everywhere. No wall clock, no randomness, no I/O
 * in the pure engine. The same inputs plus the same clock produce
 * byte-identical records in fresh stores.
 *
 * This module owns the frozen vocabularies, record types, the typed error
 * registry, boundary input parsers (shape/vocabulary → typed codes), the
 * canonical content/input digests, the pure deterministic gap-computation
 * + candidate-ranking engine and the stored-record parser. Policy lives
 * in `service.ts`; persistence in `store.ts`; transport in `router.ts`.
 */

import {
  EVIDENCE_METHODS,
  canonicalJsonStringify,
  type EpistemicStatus,
  type EvidenceMethod,
} from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
// The single epistemic order authority, imported BY VALUE so this module
// never defines a second one (the assurance module's own argument):
import { EPISTEMIC_RANK } from "../reality/model";
// READ-ONLY TYPE imports from the owning authorities (erased at runtime):
import type {
  AssuranceProfile,
  DeviceProfile,
  DimensionOutcome,
  EvidenceFact,
  ReadinessGap,
  ReadinessReport,
} from "../assurance/model";
import type { GraphVersion } from "../reality/model";

/* ------------------------------------------------------------------ */
/* Vocabularies (frozen: `as const` types + Object.freeze runtime)      */
/* ------------------------------------------------------------------ */

/**
 * The evidence-gap KIND vocabulary — the shared contract's
 * `EvidenceGapKind` (family `mission`, `EVIDENCE_GAP_KINDS`), reused
 * VERBATIM (no second enum): what KIND of knowledge is deficient.
 */
export const GAP_KINDS = Object.freeze(["MISSING", "WEAK", "AMBIGUOUS"] as const);
export type GapKind = (typeof GAP_KINDS)[number];

/**
 * The gap STATE vocabulary — the subject's EVIDENTIARY observation
 * status. `UNKNOWN`, `NOT_OBSERVED` and `OCCLUDED` are FIRST-CLASS
 * values, never collapsed, never treated as absence; `OBSERVED` marks a
 * subject whose evidentiary support exists but is weak (a WEAK gap can
 * only ever sit on an observed subject).
 */
export const GAP_STATES = Object.freeze([
  "OBSERVED",
  "UNKNOWN",
  "NOT_OBSERVED",
  "OCCLUDED",
] as const);
export type GapState = (typeof GAP_STATES)[number];

/**
 * The gap CLASS registry: every failure mode DISTINCT, aligned with the
 * assurance authority's deficiency codes (which its model header
 * documents as "basis + remediation feed the 018 gap engine"). The
 * mapping class → (kind, state semantics) is FROZEN in `GAP_CLASS_TABLE`.
 */
export const GAP_CLASSES = Object.freeze([
  // task-level: the evidence graph state itself
  "no_evidence_recorded", // nothing at all is recorded — total unknown
  "evidence_count_missing", // the required method was never used
  "evidence_count_shortfall", // some valid evidence, below the minimum
  "no_modeled_subjects", // empty subject universe (no nodes, no annotations)
  // task-level: a profile-required property key is asserted nowhere
  "bounded_property_not_asserted", // uncertainty-bound key absent
  "floor_property_not_asserted", // epistemic-floor key absent
  // subject/property-level refinement of unsatisfied dimensions
  "sigma_not_reported", // numeric assertion without 1σ (UNKNOWN, never 0)
  "sigma_above_bound", // 1σ above the profile bound
  "non_numeric_assertion", // bounded key asserted with a non-numeric value
  "coverage_unsupported", // live node with no linked evidence at all
  "coverage_invalidated_only", // linked evidence exists but ALL invalidated
  "coverage_indeterminate", // live node whose capture status is UNKNOWN
  "epistemic_below_floor", // assertion below the required epistemic floor
  // the annotation seam (expected subjects the snapshot cannot express)
  "subject_not_observed", // annotated target absent, claimed not observed
  "subject_occluded", // annotated target absent, claimed occluded
  "subject_capture_unknown", // annotated target absent, capture status unknown
] as const);
export type GapClass = (typeof GAP_CLASSES)[number];

/**
 * The frozen class → (kind, state) semantics. `task` rows fix the state
 * absolutely; `node`/`property` rows fix the DERIVATION SCOPE of the
 * state (the subject's / the property's own evidentiary observation
 * status — see the engine).
 */
export const GAP_CLASS_TABLE: Readonly<
  Record<GapClass, { readonly kind: GapKind; readonly stateScope: "task" | "node" | "property"; readonly taskState: GapState }>
> = Object.freeze({
  no_evidence_recorded: { kind: "MISSING", stateScope: "task", taskState: "UNKNOWN" },
  evidence_count_missing: { kind: "MISSING", stateScope: "task", taskState: "NOT_OBSERVED" },
  evidence_count_shortfall: { kind: "WEAK", stateScope: "task", taskState: "OBSERVED" },
  no_modeled_subjects: { kind: "MISSING", stateScope: "task", taskState: "UNKNOWN" },
  bounded_property_not_asserted: { kind: "MISSING", stateScope: "task", taskState: "NOT_OBSERVED" },
  floor_property_not_asserted: { kind: "MISSING", stateScope: "task", taskState: "NOT_OBSERVED" },
  sigma_not_reported: { kind: "MISSING", stateScope: "property", taskState: "OBSERVED" },
  sigma_above_bound: { kind: "WEAK", stateScope: "property", taskState: "OBSERVED" },
  non_numeric_assertion: { kind: "AMBIGUOUS", stateScope: "property", taskState: "OBSERVED" },
  coverage_unsupported: { kind: "MISSING", stateScope: "node", taskState: "NOT_OBSERVED" },
  coverage_invalidated_only: { kind: "WEAK", stateScope: "node", taskState: "OBSERVED" },
  coverage_indeterminate: { kind: "AMBIGUOUS", stateScope: "node", taskState: "UNKNOWN" },
  epistemic_below_floor: { kind: "WEAK", stateScope: "property", taskState: "NOT_OBSERVED" },
  subject_not_observed: { kind: "MISSING", stateScope: "node", taskState: "NOT_OBSERVED" },
  subject_occluded: { kind: "MISSING", stateScope: "node", taskState: "OCCLUDED" },
  subject_capture_unknown: { kind: "AMBIGUOUS", stateScope: "node", taskState: "UNKNOWN" },
});

/**
 * The candidate ACTION vocabulary — aligned with the missions planner's
 * operator-action vocabulary (AISE-007 `CaptureStep`: an executable
 * operator action with a method and guidance). Each gap class generates
 * candidates of exactly one action kind (see the engine); every failure
 * mode stays distinct.
 */
export const CANDIDATE_ACTION_KINDS = Object.freeze([
  // acquire additional VALID evidence items of a required method
  "capture_evidence",
  // acquire a numeric measurement of a property with 1σ ≤ target
  "measure_property",
  // acquire an assertion of a missing property key (any value type)
  "assert_property",
  // acquire the first valid evidence for a node (coverage)
  "observe_node",
  // human-confirm an existing assertion (epistemic floor)
  "confirm_property",
  // determine whether a subject was captured (UNKNOWN annotations)
  "verify_capture_status",
  // re-observe a subject once its occlusion clears
  "resolve_occlusion",
] as const);
export type CandidateActionKind = (typeof CANDIDATE_ACTION_KINDS)[number];

/**
 * The observation-status annotation vocabulary (the request-side seam
 * through which OCCLUDED/UNKNOWN/NOT_OBSERVED for expected-but-absent
 * subjects — and capture-UNKNOWN for live subjects — enter the analysis).
 */
export const OBSERVATION_STATUS_ANNOTATION_STATUSES = Object.freeze([
  "UNKNOWN",
  "NOT_OBSERVED",
  "OCCLUDED",
] as const);
export type ObservationStatus = (typeof OBSERVATION_STATUS_ANNOTATION_STATUSES)[number];

/** The single audit event type of an analysis record's append-only history. */
export const GAP_ANALYSIS_EVENT_TYPES = Object.freeze(["gap_analysis_recorded"] as const);
export type GapAnalysisEventType = (typeof GAP_ANALYSIS_EVENT_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Frozen scoring tables (code-defined, like assurance profiles:        */
/* changing any value is a governed change — see the module header)     */
/* ------------------------------------------------------------------ */

/**
 * THE composite weights (documented, frozen): impact and expected
 * uncertainty reduction dominate; effort is a cost; recoverability is a
 * deferral discount (see the module header for the formula).
 */
export const SCORE_WEIGHTS = Object.freeze({
  taskImpact: 0.35,
  expectedUncertaintyReduction: 0.35,
  operatorEffort: 0.2,
  recoverability: 0.1,
} as const);

/**
 * Criticality factors: a gap blocking a CRITICAL assurance dimension has
 * full task impact; a non-critical (notes) dimension carries half.
 */
export const CRITICALITY_FACTORS = Object.freeze({ critical: 1, nonCritical: 0.5 } as const);

/** Dimension weight default when a custom profile omits the advisory weight. */
export const DEFAULT_DIMENSION_WEIGHT = 0.5;

/** Focus factor for subjects NOT listed when a non-empty task focus exists. */
export const UNFOCUSED_SUBJECT_FACTOR = 0.25;

/** Focus factor for every subject when NO task focus is provided. */
export const NO_FOCUS_FACTOR = 1;

/** Expected-uncertainty-reduction assigned to resolving a fully UNKNOWN σ. */
export const UNKNOWN_SIGMA_RESOLUTION_VALUE = 1;

/** Expected-uncertainty-reduction of actions that change no measurement σ. */
export const NON_MEASUREMENT_REDUCTION_VALUE = 0;

/** Base effort of a capture-status verification (checking the record). */
export const VERIFY_CAPTURE_STATUS_EFFORT = 0.1;

/**
 * THE frozen default operator-effort table per evidence method (the
 * effort model of THIS module: one operator action of the method, 0 =
 * free, 1 = maximal; derived from the house method vocabulary — the
 * always-available operator methods sit mid-table, device-dependent
 * capture methods are cheap when the device has them, the specialist
 * instrument is the most expensive). Overridable per analysis via the
 * request's `effortContext` (site constraints, permits, access).
 */
export const DEFAULT_METHOD_EFFORT: Readonly<Record<EvidenceMethod, number>> = Object.freeze({
  DEPTH_SENSING: 0.2,
  VISUAL_RECONSTRUCTION: 0.3,
  CALIBRATED_REFERENCE: 0.3,
  MANUAL_MEASUREMENT: 0.5,
  SPECIALIST_INSTRUMENT: 0.8,
  VIDEO_FOOTAGE: 0.25,
  STILL_IMAGERY: 0.15,
  INSTRUMENT_READING: 0.4,
  HUMAN_ANSWER: 0.2,
  DOCUMENT_REGION: 0.35,
} as const);

/**
 * THE frozen recoverability prior per gap state (the estimated chance the
 * information remains acquirable later if deferred): a live observed
 * subject is highly re-observable; a never-observed subject is presumed
 * acquirable; an OCCLUDED subject's window depends on the occlusion
 * clearing (at risk); a capture-UNKNOWN subject's prospects are unknown —
 * mid-low, NEVER collapsed to 0 or 1. A TOMBSTONED subject (removed in
 * the pinned version) is unrecoverable by definition.
 */
export const RECOVERABILITY_BY_STATE: Readonly<Record<GapState, number>> = Object.freeze({
  OBSERVED: 0.9,
  UNKNOWN: 0.4,
  NOT_OBSERVED: 0.6,
  OCCLUDED: 0.2,
} as const);
export const TOMBSTONED_RECOVERABILITY = 0;

/**
 * THE frozen default method preferences per action kind (which evidence
 * method the proposed operator action uses by default). Chosen from the
 * planner's device-independent always-usable methods; overridable per
 * analysis via the request's `methodPreferences`.
 */
export const DEFAULT_METHOD_PREFERENCES: Readonly<
  Record<Exclude<CandidateActionKind, "capture_evidence">, EvidenceMethod>
> = Object.freeze({
  measure_property: "MANUAL_MEASUREMENT",
  assert_property: "HUMAN_ANSWER",
  observe_node: "STILL_IMAGERY",
  confirm_property: "HUMAN_ANSWER",
  verify_capture_status: "HUMAN_ANSWER",
  resolve_occlusion: "STILL_IMAGERY",
} as const);

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)           */
/* ------------------------------------------------------------------ */

export const GAP_ANALYSIS_ERROR_CODES = Object.freeze([
  // shape / vocabulary validation (422 at the HTTP boundary)
  "invalid_analysis",
  "invalid_profile_ref",
  "invalid_annotation",
  "annotation_without_evidence",
  "invalid_evidence_ref",
  "invalid_uncertainty",
  "invalid_focus",
  "invalid_effort_context",
  "invalid_method_preference",
  "invalid_device_profile",
  // semantic invariants (422)
  "unknown_profile",
  "unknown_reality_version",
  "annotation_contradicts_reality",
  "unknown_evidence_ref",
  "dangling_evidence_ref",
  "unknown_uncertainty_target",
  "uncertainty_without_measurement",
  "uncertainty_unit_mismatch",
  "unknown_focus_subject",
  "invalid_evaluation_input",
  "invalid_reality_state",
  "invalid_evidence_state",
  "dimension_refinement_failed",
  "analysis_exists",
  // not-found (404)
  "analysis_not_found",
  // identity / path addressing (400)
  "invalid_analysis_id",
  "invalid_project_id",
  "invalid_version_id",
  // persistence guard (422)
  "invalid_analysis_record",
] as const);
export type GapAnalysisErrorCode = (typeof GAP_ANALYSIS_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class GapAnalysisError extends Error {
  readonly code: GapAnalysisErrorCode;
  readonly detail: string;

  constructor(code: GapAnalysisErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "GapAnalysisError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Request seams (the analysis boundary input)                          */
/* ------------------------------------------------------------------ */

/**
 * One explicit, evidence-backed claim about how an expected subject was
 * (or was not) observed. This is the ONLY seam through which
 * OCCLUDED/NOT_OBSERVED subjects absent from the pinned version — and
 * capture-UNKNOWN for live subjects — enter the analysis; this module
 * never fabricates them.
 */
export interface ObservationStatusAnnotation {
  readonly targetNodeId: string;
  readonly observationStatus: ObservationStatus;
  /** REQUIRED non-empty: evidence substantiating the coverage claim. */
  readonly evidenceIds: readonly string[];
}

/**
 * One explicit measurement-uncertainty statement (1σ) for a numeric
 * property of a live node — the ONLY seam through which σ enters (the
 * reality `PropertyRecord` carries no σ; the assurance authority consumes
 * it, never estimates it). An ABSENT σ is UNKNOWN, never 0.
 */
export interface UncertaintyAnnotation {
  readonly nodeId: string;
  readonly propertyKey: string;
  /** 1σ in the property's own unit, finite, >= 0. */
  readonly sigma: number;
  /** REQUIRED: must equal the pinned property's declared unit (no unit-conversion authority here). */
  readonly unit: string;
  /** How this σ was obtained (provenance note; carried for audit). */
  readonly basis?: string;
}

/** One task-focus entry: the task's declared impact weight for a subject. */
export interface TaskFocusEntry {
  readonly subjectNodeId: string;
  /** Impact weight in [0,1]. */
  readonly impactWeight: number;
}

/** The resolved operator-effort model (defaults overridden by the request context). */
export interface EffortModel {
  /** Effective effort per method in [0,1] (0 = free, 1 = maximal). */
  readonly byMethod: Readonly<Record<EvidenceMethod, number>>;
}

/** The resolved method preferences for the proposed operator actions. */
export interface MethodPreferences {
  readonly measureProperty: EvidenceMethod;
  readonly assertProperty: EvidenceMethod;
  readonly observeNode: EvidenceMethod;
  readonly confirmProperty: EvidenceMethod;
  readonly verifyCaptureStatus: EvidenceMethod;
  readonly resolveOcclusion: EvidenceMethod;
}

/** The pinned task this analysis serves. */
export interface GapTaskRef {
  readonly projectId: string;
  readonly versionId: string;
  /** The governing assurance profile (the readiness authority's document id). */
  readonly profileId: string;
}

/** The full run-analysis boundary input (normalized, canonically ordered). */
export interface RunGapAnalysisInput {
  readonly analysisId: string;
  readonly taskRef: GapTaskRef;
  readonly annotations: readonly ObservationStatusAnnotation[];
  readonly uncertaintyAnnotations: readonly UncertaintyAnnotation[];
  readonly taskFocus: readonly TaskFocusEntry[];
  readonly effortContext: Readonly<Record<string, number>>;
  readonly methodPreferences: Readonly<Partial<MethodPreferences>>;
  readonly deviceCapabilityFacts: Readonly<Record<string, string>> | null;
}

/* ------------------------------------------------------------------ */
/* The normalized analysis state (assembled by the service)             */
/* ------------------------------------------------------------------ */

/** One property of a gap subject, with σ merged from the annotations. */
export interface SubjectProperty {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly unit?: string;
  /** VERBATIM epistemic status (context — never converted into a gap state). */
  readonly epistemicStatus: EpistemicStatus;
  /** 1σ in the property's unit; ABSENT = UNKNOWN (never 0). */
  readonly uncertainty?: { readonly sigma: number; readonly basis?: string };
  /** Valid evidence ids supporting this property (from its own provenance). */
  readonly supportingEvidenceIds: readonly string[];
  /** Withdrawn (invalidated) evidence ids among its provenance references. */
  readonly invalidatedEvidenceIds: readonly string[];
}

/** How the subject sits in the pinned reality version. */
export type SubjectPresence = "live" | "tombstoned" | "absent";

/** The normalized subject universe entry (live nodes + annotated targets). */
export interface GapSubject {
  readonly nodeId: string;
  readonly presence: SubjectPresence;
  /** The capture-side claim (annotation) governing this subject, when present. */
  readonly annotation?: {
    readonly observationStatus: ObservationStatus;
    readonly evidenceIds: readonly string[];
  };
  readonly properties: readonly SubjectProperty[];
  /** Valid evidence ids linked to the subject (all authoritative edge sources, unioned). */
  readonly validEvidenceIds: readonly string[];
  /** Withdrawn (invalidated) evidence ids linked to the subject. */
  readonly invalidatedEvidenceIds: readonly string[];
  /** Resolved focus factor in [0,1] (see the focus rules in the module header). */
  readonly focusWeight: number;
  /** True iff the subject is EXPLICITLY listed by a non-empty task focus. */
  readonly taskFocused: boolean;
}

/** The fully assembled state the pure engine computes over. */
export interface GapAnalysisState {
  readonly analysisId: string;
  readonly profile: AssuranceProfile;
  /** The readiness authority's output, consumed VERBATIM (never re-computed). */
  readonly report: ReadinessReport;
  readonly subjects: readonly GapSubject[];
  /** The evidence graph facts, sorted by evidence id (deterministic fold). */
  readonly evidenceFacts: readonly EvidenceFact[];
  readonly effortModel: EffortModel;
  readonly methodPreferences: MethodPreferences;
}

/* ------------------------------------------------------------------ */
/* Derived rows: gaps and ranked candidates                             */
/* ------------------------------------------------------------------ */

/** One derived evidence gap (a fact about what is NOT known — not absence). */
export interface EvidenceGapEntry {
  /** Content-derived stable id: `gap-<16 hex>`. */
  readonly gapId: string;
  readonly kind: GapKind;
  readonly state: GapState;
  readonly gapClass: GapClass;
  /** What is missing/weak/ambiguous and why it matters (deterministic text). */
  readonly description: string;
  /** The gap's subject node; null for task-level gaps. */
  readonly subjectNodeId: string | null;
  /** The gap's property key; null for node/task-level gaps. */
  readonly propertyKey: string | null;
  /** The assurance dimensions this gap blocks (dimension ids, sorted). */
  readonly dimensionIds: readonly string[];
  /** True when ANY blocked dimension is critical. */
  readonly critical: boolean;
  /** Evidence ids substantiating the gap claim (annotation-backed rows only). */
  readonly evidenceIds: readonly string[];
  /** True when the subject is explicitly named by the task focus. */
  readonly addressesTaskFocus: boolean;
}

/** Explicit substitution semantics on a substitution candidate (R3). */
export interface SubstitutionSemantics {
  /** The requirement's own method (whose count this does NOT satisfy). */
  readonly originalMethod: EvidenceMethod;
  /** The substituted method — retains ITS OWN method/uncertainty semantics. */
  readonly substitutedMethod: EvidenceMethod;
  /** The readiness authority's plausibility level for the substitution. */
  readonly plausibility: string;
  /** Deterministic note: acceptance is a governed substitution decision. */
  readonly semanticsNote: string;
}

/** Every score component's derivation, stated with the actual numbers. */
export interface ScoreDerivation {
  readonly taskImpact: string;
  readonly expectedUncertaintyReduction: string;
  readonly operatorEffort: string;
  readonly recoverability: string;
  readonly composite: string;
}

/** The four named, inspectable score components plus the composite. */
export interface CandidateScore {
  readonly taskImpact: number;
  readonly expectedUncertaintyReduction: number;
  readonly operatorEffort: number;
  readonly recoverability: number;
  readonly compositeValue: number;
  readonly derivation: ScoreDerivation;
}

/** One ranked next-observation recommendation. */
export interface RankedCandidate {
  /** Content-derived stable id: `cand-<16 hex>`. */
  readonly candidateId: string;
  readonly actionKind: CandidateActionKind;
  /** The evidence method the proposed operator action uses. */
  readonly method: EvidenceMethod;
  /** The action's subject node; null for task-level actions. */
  readonly subjectNodeId: string | null;
  /** The action's property key; null for node/task-level actions. */
  readonly propertyKey: string | null;
  /** Present iff actionKind === "capture_evidence". */
  readonly additionalCount?: number;
  /** Present iff actionKind === "measure_property" with a known bound. */
  readonly targetSigma?: number;
  /** Present iff actionKind === "measure_property" (the bound's unit). */
  readonly targetUnit?: string;
  /** Present for confirm/assert candidates carrying a floor requirement. */
  readonly requiredEpistemicStatus?: "OBSERVED" | "CONFIRMED";
  /** THE gaps this recommendation addresses (named, non-empty). */
  readonly addressesGapIds: readonly string[];
  /** Present ONLY on substitution candidates (explicit semantics). */
  readonly substitution?: SubstitutionSemantics;
  readonly score: CandidateScore;
  /** Operator guidance (mission-step feedable, deterministic text). */
  readonly instructions: string;
}

/** Row statistics — ALWAYS consistent with the rows above. */
export interface GapAnalysisStats {
  readonly totalGaps: number;
  readonly missingGaps: number;
  readonly weakGaps: number;
  readonly ambiguousGaps: number;
  readonly observedStateGaps: number;
  readonly unknownStateGaps: number;
  readonly notObservedStateGaps: number;
  readonly occludedStateGaps: number;
  readonly tombstonedSubjectGaps: number;
  readonly totalCandidates: number;
  readonly substitutionCandidates: number;
  /** The top-ranked candidate (rank order is the canonical order). */
  readonly topCandidateId: string | null;
  /** Distinct evidence ids referenced by the analysis rows (all verified). */
  readonly evidenceReferenced: number;
}

/** One append-only audit event: pins the full record content digest. */
export interface GapAnalysisEvent {
  readonly eventId: string;
  readonly eventType: GapAnalysisEventType;
  readonly occurredAt: string;
  /** sha-256 of the analysis content (record minus history) at commit. */
  readonly recordDigest: string;
}

/**
 * The DERIVED gap-analysis record. Append-only, write-once: re-running
 * against newer inputs is a NEW record. `inputDigest` pins EVERY analysis
 * input byte-exactly; `readinessReport` is the readiness authority's
 * output carried VERBATIM as consumed context — this record is NOT a
 * ReadinessAssessment and never downgrades one.
 */
export interface GapAnalysisRecord {
  readonly analysisId: string;
  readonly taskRef: GapTaskRef;
  readonly annotations: readonly ObservationStatusAnnotation[];
  readonly uncertaintyAnnotations: readonly UncertaintyAnnotation[];
  readonly taskFocus: readonly TaskFocusEntry[];
  readonly effortModel: EffortModel;
  readonly methodPreferences: MethodPreferences;
  readonly deviceCapabilityFacts: Readonly<Record<string, string>> | null;
  /** The readiness authority's output, consumed verbatim (context, never mutated). */
  readonly readinessReport: ReadinessReport;
  readonly gaps: readonly EvidenceGapEntry[];
  readonly candidates: readonly RankedCandidate[];
  readonly stats: GapAnalysisStats;
  readonly inputDigest: string;
  readonly computedAt: string;
  readonly history: readonly GapAnalysisEvent[];
}

/** List projection (never the full record). */
export interface GapAnalysisSummary {
  readonly analysisId: string;
  readonly projectId: string;
  readonly versionId: string;
  readonly profileId: string;
  readonly taskKind: string;
  /** The readiness authority's own verdict for the analyzed state (consumed context). */
  readonly readinessLevel: string;
  readonly totalGaps: number;
  readonly totalCandidates: number;
  readonly topCandidateId: string | null;
  readonly computedAt: string;
}

/** Pure list projection of one analysis record. */
export function summarizeGapAnalysis(record: GapAnalysisRecord): GapAnalysisSummary {
  return {
    analysisId: record.analysisId,
    projectId: record.taskRef.projectId,
    versionId: record.taskRef.versionId,
    profileId: record.taskRef.profileId,
    taskKind: record.readinessReport.taskKind,
    readinessLevel: record.readinessReport.readiness,
    totalGaps: record.stats.totalGaps,
    totalCandidates: record.stats.totalCandidates,
    topCandidateId: record.stats.topCandidateId,
    computedAt: record.computedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Digests                                                             */
/* ------------------------------------------------------------------ */

/**
 * sha-256 over the canonical JSON of the analysis CONTENT (every field
 * except the audit history). Pure: the same content always yields the
 * same digest — this pins what each event committed.
 */
export function gapAnalysisContentDigest(record: GapAnalysisRecord): string {
  const {
    analysisId,
    taskRef,
    annotations,
    uncertaintyAnnotations,
    taskFocus,
    effortModel,
    methodPreferences,
    deviceCapabilityFacts,
    readinessReport,
    gaps,
    candidates,
    stats,
    inputDigest,
    computedAt,
  } = record;
  return sha256Hex(
    canonicalJsonStringify({
      analysisId,
      taskRef,
      annotations,
      uncertaintyAnnotations,
      taskFocus,
      effortModel,
      methodPreferences,
      deviceCapabilityFacts,
      readinessReport,
      gaps,
      candidates,
      stats,
      inputDigest,
      computedAt,
    }),
  );
}

/**
 * sha-256 over the canonical JSON of EVERY analysis input (the resolved
 * assurance profile, the pinned reality version, the evidence graph
 * facts, the request seams and the resolved effort/preferences models) —
 * the byte-exact pin of what was analyzed. The same inputs always yield
 * the same digest; any perturbation of any input class changes it.
 */
export function gapAnalysisInputDigest(input: {
  readonly profile: AssuranceProfile;
  readonly realityVersion: GraphVersion;
  readonly evidenceFacts: readonly EvidenceFact[];
  readonly annotations: readonly ObservationStatusAnnotation[];
  readonly uncertaintyAnnotations: readonly UncertaintyAnnotation[];
  readonly taskFocus: readonly TaskFocusEntry[];
  readonly effortModel: EffortModel;
  readonly methodPreferences: MethodPreferences;
  readonly deviceProfile: DeviceProfile | null;
}): string {
  return sha256Hex(
    canonicalJsonStringify({
      profile: input.profile,
      realityVersion: input.realityVersion,
      evidenceFacts: [...input.evidenceFacts].sort(byEvidenceId),
      annotations: input.annotations,
      uncertaintyAnnotations: input.uncertaintyAnnotations,
      taskFocus: input.taskFocus,
      effortModel: input.effortModel,
      methodPreferences: input.methodPreferences,
      deviceProfile: input.deviceProfile,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Shared deterministic helpers                                        */
/* ------------------------------------------------------------------ */

function byEvidenceId(a: EvidenceFact, b: EvidenceFact): number {
  return a.evidenceId < b.evidenceId ? -1 : a.evidenceId > b.evidenceId ? 1 : 0;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Deterministic 6-decimal rounding (the scoring contract, see header). */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Deterministic number rendering for text (no float drift). */
function fmt(value: number): string {
  return String(round6(value));
}

/** Deterministic gap id: `gap-<16 hex>` over the gap's stable identity. */
function gapIdOf(
  analysisId: string,
  gapClass: GapClass,
  subjectNodeId: string | null,
  propertyKey: string | null,
): string {
  return `gap-${sha256Hex(`${analysisId}:${gapClass}:${subjectNodeId ?? "-"}:${propertyKey ?? "-"}`).slice(0, 16)}`;
}

/** Deterministic candidate id: `cand-<16 hex>` over the candidate's stable identity. */
function candidateIdOf(
  analysisId: string,
  actionKind: CandidateActionKind,
  method: EvidenceMethod,
  subjectNodeId: string | null,
  propertyKey: string | null,
): string {
  return `cand-${sha256Hex(`${analysisId}:${actionKind}:${method}:${subjectNodeId ?? "-"}:${propertyKey ?? "-"}`).slice(0, 16)}`;
}

/* ------------------------------------------------------------------ */
/* The pure deterministic gap-computation + ranking engine              */
/* ------------------------------------------------------------------ */

/** The pure engine's output rows before record assembly. */
export interface ComputedGaps {
  readonly gaps: readonly EvidenceGapEntry[];
  readonly candidates: readonly RankedCandidate[];
  readonly stats: GapAnalysisStats;
}

/** Index the report's unsatisfied dimensions (deterministic profile order). */
interface DimensionContext {
  readonly dimensionId: string;
  readonly critical: boolean;
  readonly weight: number;
  readonly outcome: DimensionOutcome;
  /** The assurance authority's own gap for this dimension (remediation + device hint). */
  readonly readinessGap: ReadinessGap | undefined;
}

function unsatisfiedDimensionsOf(state: GapAnalysisState): DimensionContext[] {
  const gapsByDimension = new Map<string, ReadinessGap>();
  for (const gap of state.report.gaps) {
    gapsByDimension.set(gap.dimensionId, gap);
  }
  const contexts: DimensionContext[] = [];
  for (const dimension of state.profile.dimensions) {
    const outcome = state.report.dimensions.find(
      (candidate) => candidate.dimensionId === dimension.dimensionId,
    );
    if (outcome === undefined || outcome.outcome === "satisfied") {
      continue;
    }
    contexts.push({
      dimensionId: dimension.dimensionId,
      critical: dimension.critical,
      weight: dimension.weight ?? DEFAULT_DIMENSION_WEIGHT,
      outcome,
      readinessGap: gapsByDimension.get(dimension.dimensionId),
    });
  }
  return contexts;
}

/**
 * The subject's EVIDENTIARY observation status (see the module header):
 * the capture-side claim GOVERNS when present — a live subject's UNKNOWN
 * annotation is a first-class indeterminacy claim, never silently
 * resolved by inference from the evidence links, never dropped (a live
 * subject's NOT_OBSERVED/OCCLUDED annotation is refused by the service:
 * the graph is authoritative on what captured reality contains).
 */
function subjectStateOf(subject: GapSubject): GapState {
  if (subject.presence !== "live" && subject.annotation !== undefined) {
    return subject.annotation.observationStatus;
  }
  if (subject.presence === "live" && subject.annotation?.observationStatus === "UNKNOWN") {
    return "UNKNOWN";
  }
  if (subject.validEvidenceIds.length > 0 || subject.invalidatedEvidenceIds.length > 0) {
    // OBSERVED covers both live support and observed-then-withdrawn
    // support (invalidated-only): the observation HAPPENED — invalidated
    // evidence is withdrawn support, not absence of observation.
    return "OBSERVED";
  }
  return "NOT_OBSERVED";
}

/** A property's own evidentiary observation status. */
function propertyStateOf(subject: GapSubject, propertyKey: string): GapState {
  const property = subject.properties.find((candidate) => candidate.key === propertyKey);
  if (property === undefined) {
    return "NOT_OBSERVED";
  }
  return property.supportingEvidenceIds.length > 0 ? "OBSERVED" : "NOT_OBSERVED";
}

/** The property's σ when known; undefined = UNKNOWN (never 0). */
function sigmaOf(subject: GapSubject, propertyKey: string): number | undefined {
  return subject.properties.find((candidate) => candidate.key === propertyKey)?.uncertainty?.sigma;
}

/* .................................................................. */
/* Scoring (every component named, inspectable, derived)               */
/* .................................................................. */

interface ScoreInput {
  readonly actionKind: CandidateActionKind;
  readonly method: EvidenceMethod;
  readonly subject: GapSubject | null;
  readonly gapState: GapState;
  readonly context: { readonly critical: boolean; readonly weight: number } | null;
  readonly reduction: { readonly value: number; readonly derivation: string };
  readonly additionalCount: number;
  readonly substitution: SubstitutionSemantics | null;
}

function scoreCandidate(state: GapAnalysisState, input: ScoreInput): CandidateScore {
  const focusWeight = input.subject?.focusWeight ?? NO_FOCUS_FACTOR;
  const criticality =
    input.context === null || input.context.critical
      ? CRITICALITY_FACTORS.critical
      : CRITICALITY_FACTORS.nonCritical;
  const criticalityLabel =
    input.context === null
      ? "subject-expected"
      : input.context.critical
        ? "critical"
        : "non-critical";
  const dimensionWeight = input.context === null ? DEFAULT_DIMENSION_WEIGHT : input.context.weight;
  const taskImpact = round6(criticality * dimensionWeight * focusWeight);

  const baseEffort = state.effortModel.byMethod[input.method];
  const actionCount = Math.max(1, input.additionalCount);
  const effort =
    input.actionKind === "verify_capture_status"
      ? VERIFY_CAPTURE_STATUS_EFFORT
      : round6(Math.min(1, baseEffort * actionCount));
  const effortSource =
    input.actionKind === "verify_capture_status"
      ? `fixed verification effort ${VERIFY_CAPTURE_STATUS_EFFORT} (no acquisition)`
      : `base ${baseEffort} (${input.method}${state.effortModel.byMethod[input.method] !== DEFAULT_METHOD_EFFORT[input.method] ? ", effort-context override" : ", default table"}${input.substitution !== null ? ", substituted method" : ""}) × ${actionCount} action(s)`;

  const recoverability =
    input.subject !== null && input.subject.presence === "tombstoned"
      ? TOMBSTONED_RECOVERABILITY
      : RECOVERABILITY_BY_STATE[input.gapState];
  const recoverabilityLabel =
    input.subject !== null && input.subject.presence === "tombstoned"
      ? "tombstoned subject — unrecoverable by definition"
      : `state ${input.gapState} prior ${RECOVERABILITY_BY_STATE[input.gapState]}`;

  const composite = round6(
    SCORE_WEIGHTS.taskImpact * taskImpact +
      SCORE_WEIGHTS.expectedUncertaintyReduction * input.reduction.value -
      SCORE_WEIGHTS.operatorEffort * effort -
      SCORE_WEIGHTS.recoverability * recoverability,
  );

  return {
    taskImpact,
    expectedUncertaintyReduction: input.reduction.value,
    operatorEffort: effort,
    recoverability,
    compositeValue: composite,
    derivation: {
      taskImpact: `criticality ${criticality} (${criticalityLabel}) × dimension weight ${dimensionWeight} × focus ${focusWeight} = ${fmt(taskImpact)}`,
      expectedUncertaintyReduction: input.reduction.derivation,
      operatorEffort: `${effortSource} = ${fmt(effort)}`,
      recoverability: `${recoverabilityLabel} = ${fmt(recoverability)}`,
      composite: `${SCORE_WEIGHTS.taskImpact}·${fmt(taskImpact)} + ${SCORE_WEIGHTS.expectedUncertaintyReduction}·${fmt(input.reduction.value)} − ${SCORE_WEIGHTS.operatorEffort}·${fmt(effort)} − ${SCORE_WEIGHTS.recoverability}·${fmt(recoverability)} = ${fmt(composite)}`,
    },
  };
}

/* .................................................................. */
/* Candidate construction                                               */
/* .................................................................. */

function buildCandidate(
  state: GapAnalysisState,
  input: {
    readonly actionKind: CandidateActionKind;
    readonly method: EvidenceMethod;
    readonly subject: GapSubject | null;
    readonly propertyKey: string | null;
    readonly gapState: GapState;
    readonly context: { readonly critical: boolean; readonly weight: number } | null;
    readonly reduction: { readonly value: number; readonly derivation: string };
    readonly additionalCount?: number;
    readonly targetSigma?: number;
    readonly targetUnit?: string;
    readonly requiredEpistemicStatus?: "OBSERVED" | "CONFIRMED";
    readonly addressesGapIds: readonly string[];
    readonly substitution?: SubstitutionSemantics;
    readonly instructions: string;
  },
): RankedCandidate {
  const score = scoreCandidate(state, {
    actionKind: input.actionKind,
    method: input.method,
    subject: input.subject,
    gapState: input.gapState,
    context: input.context,
    reduction: input.reduction,
    additionalCount: input.additionalCount ?? 1,
    substitution: input.substitution ?? null,
  });
  return {
    candidateId: candidateIdOf(
      state.analysisId,
      input.actionKind,
      input.method,
      input.subject?.nodeId ?? null,
      input.propertyKey,
    ),
    actionKind: input.actionKind,
    method: input.method,
    subjectNodeId: input.subject?.nodeId ?? null,
    propertyKey: input.propertyKey,
    ...(input.additionalCount === undefined ? {} : { additionalCount: input.additionalCount }),
    ...(input.targetSigma === undefined ? {} : { targetSigma: input.targetSigma }),
    ...(input.targetUnit === undefined ? {} : { targetUnit: input.targetUnit }),
    ...(input.requiredEpistemicStatus === undefined
      ? {}
      : { requiredEpistemicStatus: input.requiredEpistemicStatus }),
    addressesGapIds: [...input.addressesGapIds].sort(compareStrings),
    ...(input.substitution === undefined ? {} : { substitution: input.substitution }),
    score,
    instructions: input.instructions,
  };
}

/** A gap under construction with its blocked-dimension bookkeeping. */
interface GapAccumulator {
  readonly gapClass: GapClass;
  readonly subject: GapSubject | null;
  readonly propertyKey: string | null;
  description: string;
  evidenceIds: readonly string[];
  readonly dimensionIds: Set<string>;
  critical: boolean;
}

function finalizeGap(state: GapAnalysisState, acc: GapAccumulator): EvidenceGapEntry {
  const table = GAP_CLASS_TABLE[acc.gapClass];
  const gapState =
    table.stateScope === "task"
      ? table.taskState
      : table.stateScope === "node"
        ? subjectStateOf(acc.subject as GapSubject)
        : propertyStateOf(acc.subject as GapSubject, acc.propertyKey as string);
  const subjectNodeId = acc.subject?.nodeId ?? null;
  return {
    gapId: gapIdOf(state.analysisId, acc.gapClass, subjectNodeId, acc.propertyKey),
    kind: table.kind,
    state: gapState,
    gapClass: acc.gapClass,
    description: acc.description,
    subjectNodeId,
    propertyKey: acc.propertyKey,
    dimensionIds: [...acc.dimensionIds].sort(compareStrings),
    critical: acc.critical,
    evidenceIds: [...acc.evidenceIds],
    addressesTaskFocus: acc.subject?.taskFocused ?? false,
  };
}

/* .................................................................. */
/* Requirement lookups (deterministic over the resolved profile)        */
/* .................................................................. */

/** The method of the evidence_sufficiency requirement governing these dimensions. */
function sufficiencyMethodOf(
  state: GapAnalysisState,
  dimensionIds: readonly string[],
): EvidenceMethod | null {
  for (const dimension of state.profile.dimensions) {
    if (
      dimensionIds.includes(dimension.dimensionId) &&
      dimension.requirement.kind === "evidence_sufficiency"
    ) {
      return dimension.requirement.method;
    }
  }
  return null;
}

/** The strictest uncertainty bound over these dimensions for a property key. */
function uncertaintyBoundOf(
  state: GapAnalysisState,
  dimensionIds: readonly string[],
  propertyKey: string,
): { readonly maxSigma: number; readonly unit: string } | undefined {
  let strictest: { maxSigma: number; unit: string } | undefined;
  for (const dimension of state.profile.dimensions) {
    if (!dimensionIds.includes(dimension.dimensionId)) {
      continue;
    }
    if (
      dimension.requirement.kind !== "uncertainty_bound" ||
      dimension.requirement.propertyKey !== propertyKey
    ) {
      continue;
    }
    if (strictest === undefined || dimension.requirement.maxSigma < strictest.maxSigma) {
      strictest = { maxSigma: dimension.requirement.maxSigma, unit: dimension.requirement.unit };
    }
  }
  return strictest;
}

/** The floor status of the epistemic_floor requirement governing these dimensions. */
function epistemicFloorOf(
  state: GapAnalysisState,
  dimensionIds: readonly string[],
): "OBSERVED" | "CONFIRMED" | undefined {
  let highest: "OBSERVED" | "CONFIRMED" | undefined;
  for (const dimension of state.profile.dimensions) {
    if (!dimensionIds.includes(dimension.dimensionId)) {
      continue;
    }
    if (dimension.requirement.kind !== "epistemic_floor") {
      continue;
    }
    if (highest === undefined || dimension.requirement.minEpistemicStatus === "CONFIRMED") {
      highest = dimension.requirement.minEpistemicStatus;
    }
  }
  return highest;
}

/* .................................................................. */
/* The engine                                                           */
/* .................................................................. */

/**
 * Compute the evidence gaps and the ranked next-observation candidates.
 * PURE and DETERMINISTIC: no clock, no randomness, no I/O — the same
 * state always yields byte-identical rows.
 *
 * Discipline (see the module header): the report GOVERNS which gaps
 * exist (each unsatisfied dimension is refined into subject-level failure
 * modes; satisfied dimensions produce NO gaps — the bar is met); the
 * annotation seam contributes the first-class capture-status gaps the
 * snapshot cannot express; every candidate names the gaps it addresses;
 * the ranking is the canonical order (composite DESC, candidateId ASC).
 */
export function computeGapAnalysis(state: GapAnalysisState): ComputedGaps {
  const accs = new Map<string, GapAccumulator>();
  const candidates: RankedCandidate[] = [];
  const evidenceReferenced = new Set<string>();

  const gapKey = (
    gapClass: GapClass,
    subject: GapSubject | null,
    propertyKey: string | null,
  ): string => `${gapClass}:${subject?.nodeId ?? "-"}:${propertyKey ?? "-"}`;

  /** Add (or merge into) one gap accumulator. */
  const addGap = (
    gapClass: GapClass,
    subject: GapSubject | null,
    propertyKey: string | null,
    description: string,
    dimension: DimensionContext | null,
    evidenceIds: readonly string[] = [],
  ): void => {
    const key = gapKey(gapClass, subject, propertyKey);
    const existing = accs.get(key);
    if (existing === undefined) {
      const dimensionIds = new Set<string>();
      let critical = false;
      if (dimension !== null) {
        dimensionIds.add(dimension.dimensionId);
        critical = dimension.critical;
      }
      accs.set(key, {
        gapClass,
        subject,
        propertyKey,
        description,
        evidenceIds,
        dimensionIds,
        critical,
      });
    } else {
      if (dimension !== null) {
        existing.dimensionIds.add(dimension.dimensionId);
        existing.critical = existing.critical || dimension.critical;
      }
      const merged = [...existing.evidenceIds];
      for (const evidenceId of evidenceIds) {
        if (!merged.includes(evidenceId)) {
          merged.push(evidenceId);
        }
      }
      existing.evidenceIds = merged;
    }
  };

  const liveSubjects = state.subjects.filter((subject) => subject.presence === "live");
  const contexts = unsatisfiedDimensionsOf(state);

  /* ---- 1. Refine each unsatisfied dimension into subject-level gaps -- */

  for (const context of contexts) {
    const requirement = state.profile.dimensions.find(
      (dimension) => dimension.dimensionId === context.dimensionId,
    )?.requirement;
    if (requirement === undefined) {
      // Unreachable through the real evaluator (the report's dimensions
      // come from the same profile); kept fail-closed rather than guessing.
      throw new GapAnalysisError(
        "dimension_refinement_failed",
        `dimension ${context.dimensionId} has no requirement in the resolved profile — cannot refine`,
      );
    }
    const gapsBefore = accs.size;

    switch (requirement.kind) {
      case "evidence_sufficiency": {
        const basis = context.outcome.basis as Extract<
          DimensionOutcome["basis"],
          { kind: "evidence_sufficiency" }
        >;
        const evidenceTotal = state.evidenceFacts.length;
        const gapClass: GapClass =
          evidenceTotal === 0
            ? "no_evidence_recorded"
            : basis.validCount === 0
              ? "evidence_count_missing"
              : "evidence_count_shortfall";
        addGap(
          gapClass,
          null,
          null,
          evidenceTotal === 0
            ? `no evidence is recorded at all for the analyzed state — the ${requirement.method} requirement (${basis.requiredCount} valid items) is entirely unsatisfied and nothing is known about any capture`
            : basis.validCount === 0
              ? `no valid ${requirement.method} evidence exists (${basis.invalidCount} invalidated item(s) not counted) — the method was never used successfully for this task`
              : `valid ${requirement.method} evidence ${basis.validCount} of required ${basis.requiredCount} — corroboration is below the assurance bar`,
          context,
        );
        break;
      }

      case "uncertainty_bound": {
        let asserted = false;
        for (const subject of liveSubjects) {
          for (const property of subject.properties) {
            if (property.key !== requirement.propertyKey) {
              continue;
            }
            asserted = true;
            if (typeof property.value !== "number") {
              addGap(
                "non_numeric_assertion",
                subject,
                property.key,
                `"${property.key}" on node "${subject.nodeId}" is asserted with a non-numeric value — the 1σ ≤ ${requirement.maxSigma} ${requirement.unit} bound is not applicable to it`,
                context,
              );
              continue;
            }
            const sigma = property.uncertainty?.sigma;
            if (sigma === undefined) {
              addGap(
                "sigma_not_reported",
                subject,
                property.key,
                `"${property.key}" on node "${subject.nodeId}" is asserted numerically but reports NO 1σ — the measurement quality is UNKNOWN (never assumed 0)`,
                context,
              );
              continue;
            }
            if (sigma > requirement.maxSigma) {
              addGap(
                "sigma_above_bound",
                subject,
                property.key,
                `"${property.key}" on node "${subject.nodeId}" carries 1σ ${sigma} ${property.unit ?? "(no unit)"} — above the required ${requirement.maxSigma} ${requirement.unit} bound`,
                context,
              );
            }
          }
        }
        if (!asserted) {
          addGap(
            "bounded_property_not_asserted",
            null,
            requirement.propertyKey,
            `"${requirement.propertyKey}" is asserted by NO node in the pinned version — the 1σ ≤ ${requirement.maxSigma} ${requirement.unit} requirement has no measurand at all`,
            context,
          );
        }
        break;
      }

      case "coverage": {
        if (liveSubjects.length === 0 && state.subjects.length === 0) {
          addGap(
            "no_modeled_subjects",
            null,
            null,
            "the pinned version models no nodes and no annotation declares an expected subject — coverage has no measurand and no next observation can be proposed until capture/reconstruction produces subjects",
            context,
          );
          break;
        }
        // With zero live nodes but annotated expected subjects, the
        // annotation seam below is the coverage refinement (the expected
        // subjects ARE the coverage failure) — no additional row here.
        for (const subject of liveSubjects) {
          if (subject.annotation?.observationStatus === "UNKNOWN") {
            addGap(
              "coverage_indeterminate",
              subject,
              null,
              `capture-side coverage status is UNKNOWN for node "${subject.nodeId}" (${subject.validEvidenceIds.length} valid evidence link(s) currently known) — whether it was captured is indeterminate, never guessed`,
              context,
              subject.annotation.evidenceIds,
            );
            continue;
          }
          if (subject.validEvidenceIds.length === 0) {
            if (subject.invalidatedEvidenceIds.length > 0) {
              addGap(
                "coverage_invalidated_only",
                subject,
                null,
                `node "${subject.nodeId}" is linked ONLY to withdrawn (invalidated) evidence (${subject.invalidatedEvidenceIds.length} item(s)) — the observation happened but its support is gone`,
                context,
              );
            } else {
              addGap(
                "coverage_unsupported",
                subject,
                null,
                `node "${subject.nodeId}" carries NO linked evidence of any kind — nothing evidentiary supports it in the pinned version`,
                context,
              );
            }
          }
        }
        break;
      }

      case "epistemic_floor": {
        const floorRank = EPISTEMIC_RANK[requirement.minEpistemicStatus];
        const assertedKeys = new Set<string>();
        for (const subject of liveSubjects) {
          for (const property of subject.properties) {
            if (!requirement.propertyKeys.includes(property.key)) {
              continue;
            }
            assertedKeys.add(property.key);
            if (EPISTEMIC_RANK[property.epistemicStatus] < floorRank) {
              addGap(
                "epistemic_below_floor",
                subject,
                property.key,
                `"${property.key}" on node "${subject.nodeId}" is asserted at ${property.epistemicStatus} — below the required ≥ ${requirement.minEpistemicStatus} floor`,
                context,
              );
            }
          }
        }
        for (const propertyKey of requirement.propertyKeys) {
          if (!assertedKeys.has(propertyKey)) {
            addGap(
              "floor_property_not_asserted",
              null,
              propertyKey,
              `"${propertyKey}" is asserted by NO node in the pinned version — the ≥ ${requirement.minEpistemicStatus} floor has no assertion to govern`,
              context,
            );
          }
        }
        break;
      }
    }

    // The refinement consistency guard: an unsatisfied dimension that
    // produced no gap would mean this engine's subject-level view
    // diverged from the readiness authority — refuse rather than emit a
    // silently incomplete analysis. (The zero-live-subjects coverage case
    // is refined by the annotation seam instead — see above.)
    if (accs.size === gapsBefore && !(requirement.kind === "coverage" && liveSubjects.length === 0)) {
      throw new GapAnalysisError(
        "dimension_refinement_failed",
        `dimension ${context.dimensionId} is ${context.outcome.outcome} but no subject-level gap refines it — the engine's refinement diverged from the readiness authority`,
      );
    }
  }

  /* ---- 2. The annotation seam: first-class capture-status gaps ------- */

  for (const subject of state.subjects) {
    if (subject.annotation === undefined || subject.presence === "live") {
      continue; // live subjects' annotations were consumed above (UNKNOWN governs)
    }
    const annotation = subject.annotation;
    const tombstoneNote =
      subject.presence === "tombstoned"
        ? " — the subject is TOMBSTONED in the pinned version, so the requested observation may be permanently impossible; the gap stands until the task accepts residual limitations"
        : "";
    const gapClass: GapClass =
      annotation.observationStatus === "NOT_OBSERVED"
        ? "subject_not_observed"
        : annotation.observationStatus === "OCCLUDED"
          ? "subject_occluded"
          : "subject_capture_unknown";
    addGap(
      gapClass,
      subject,
      null,
      annotation.observationStatus === "NOT_OBSERVED"
        ? `the task expects subject "${subject.nodeId}" but it was NOT observed in the pinned version${tombstoneNote}`
        : annotation.observationStatus === "OCCLUDED"
          ? `the task expects subject "${subject.nodeId}" but it was OCCLUDED during capture${tombstoneNote}`
          : `the task expects subject "${subject.nodeId}" and its capture status is UNKNOWN — whether it was observed at all is indeterminate${tombstoneNote}`,
      null,
      annotation.evidenceIds,
    );
    for (const evidenceId of annotation.evidenceIds) {
      evidenceReferenced.add(evidenceId);
    }
  }

  const gaps = [...accs.values()].map((acc) => finalizeGap(state, acc));

  /* ---- 3. Candidates: one generation per gap (named gaps) ------------ */

  /**
   * The governing context for scoring a gap that blocks several
   * dimensions: the STRONGEST blocker (max criticality × weight; ties go
   * to the first in profile order) — deterministic and documented.
   */
  const contextOf = (
    dimensionIds: readonly string[],
  ): { readonly critical: boolean; readonly weight: number } | null => {
    let best: { critical: boolean; weight: number; product: number } | null = null;
    for (const dimension of state.profile.dimensions) {
      if (!dimensionIds.includes(dimension.dimensionId)) {
        continue;
      }
      const weight = dimension.weight ?? DEFAULT_DIMENSION_WEIGHT;
      const product = (dimension.critical ? CRITICALITY_FACTORS.critical : CRITICALITY_FACTORS.nonCritical) * weight;
      if (best === null || product > best.product) {
        best = { critical: dimension.critical, weight, product };
      }
    }
    return best === null ? null : { critical: best.critical, weight: best.weight };
  };

  for (const gap of gaps) {
    // Tombstoned subjects: no candidate can honestly propose observing a
    // removed subject — the gap stands, actionable as escalation input.
    const subject =
      gap.subjectNodeId === null
        ? null
        : (state.subjects.find((candidate) => candidate.nodeId === gap.subjectNodeId) ?? null);
    if (subject !== null && subject.presence === "tombstoned") {
      continue;
    }
    const context = contextOf(gap.dimensionIds);
    const address = [gap.gapId];

    switch (gap.gapClass) {
      case "no_evidence_recorded":
      case "evidence_count_missing":
      case "evidence_count_shortfall": {
        const governingContext = contexts.find((candidate) =>
          gap.dimensionIds.includes(candidate.dimensionId),
        );
        const method = sufficiencyMethodOf(state, gap.dimensionIds);
        if (method === null || governingContext === undefined) {
          break;
        }
        const basis = governingContext.outcome.basis as Extract<
          DimensionOutcome["basis"],
          { kind: "evidence_sufficiency" }
        >;
        const validCount = basis.validCount;
        const additionalCount = Math.max(1, basis.requiredCount - validCount);
        const reduction = corroborationReduction(validCount, additionalCount);
        candidates.push(
          buildCandidate(state, {
            actionKind: "capture_evidence",
            method,
            subject: null,
            propertyKey: null,
            gapState: gap.state,
            context,
            reduction: {
              value: reduction,
              derivation: `independent-corroboration model 1−√(n/(n+a)) with n=${validCount} valid ${method} items, a=${additionalCount} more = ${fmt(reduction)}`,
            },
            additionalCount,
            addressesGapIds: address,
            instructions:
              `Acquire ${additionalCount} more valid ${method} evidence item${additionalCount === 1 ? "" : "s"} ` +
              `(${validCount} valid of ${basis.requiredCount} required) and register them in the evidence graph.`,
          }),
        );
        // Substitution candidates (R3): ONLY from the readiness authority's
        // own device-remediation hint, ONLY for plausibly usable methods,
        // ALWAYS carrying the substituted method's own semantics.
        const deviceHint = governingContext.readinessGap?.deviceHint;
        if (deviceHint !== undefined) {
          for (const alternative of deviceHint.alternativeMethods) {
            if (alternative.plausibility !== "available" && alternative.plausibility !== "degraded") {
              continue;
            }
            const substituteValid = state.evidenceFacts.filter(
              (fact) => fact.method === alternative.method && !fact.invalidated,
            ).length;
            const substituteReduction = corroborationReduction(substituteValid, 1);
            const semantics: SubstitutionSemantics = {
              originalMethod: deviceHint.requiredMethod,
              substitutedMethod: alternative.method,
              plausibility: alternative.plausibility,
              semanticsNote:
                `SUBSTITUTION: ${alternative.method} retains ITS OWN method/uncertainty semantics — it does NOT satisfy the ` +
                `${deviceHint.requiredMethod} requirement; accepting it is a governed substitution decision with the weaker method's own uncertainty, never a silent requirement rewrite`,
            };
            candidates.push(
              buildCandidate(state, {
                actionKind: "capture_evidence",
                method: alternative.method,
                subject: null,
                propertyKey: null,
                gapState: gap.state,
                context,
                reduction: {
                  value: substituteReduction,
                  derivation: `substituted method's OWN corroboration model 1−√(n/(n+a)) with n=${substituteValid} valid ${alternative.method} items, a=1 = ${fmt(substituteReduction)} (own semantics — not the ${deviceHint.requiredMethod} count)`,
                },
                additionalCount: 1,
                addressesGapIds: address,
                substitution: semantics,
                instructions:
                  `Capture one ${alternative.method} evidence item as a SUBSTITUTION for the ${deviceHint.requiredMethod} requirement ` +
                  `(${alternative.plausibility} on this device per the readiness authority's hint). ${semantics.semanticsNote}.`,
              }),
            );
          }
        }
        break;
      }

      case "sigma_not_reported":
      case "sigma_above_bound":
      case "non_numeric_assertion": {
        const bound = uncertaintyBoundOf(state, gap.dimensionIds, gap.propertyKey ?? "");
        const method = state.methodPreferences.measureProperty;
        const currentSigma = subject === null ? undefined : sigmaOf(subject, gap.propertyKey ?? "");
        let reduction: { value: number; derivation: string };
        if (currentSigma === undefined || currentSigma <= 0) {
          reduction = {
            value: UNKNOWN_SIGMA_RESOLUTION_VALUE,
            derivation:
              currentSigma === undefined
                ? `current 1σ is UNKNOWN (never assumed 0) — acquiring a bounded measurement resolves the unknown: ${UNKNOWN_SIGMA_RESOLUTION_VALUE}`
                : `current 1σ is ${currentSigma} — the fractional model is not applicable and the bounded re-measurement resolves the quality claim: ${UNKNOWN_SIGMA_RESOLUTION_VALUE}`,
          };
        } else {
          const fractional = round6(
            Math.max(0, (currentSigma - (bound?.maxSigma ?? 0)) / currentSigma),
          );
          reduction = {
            value: fractional,
            derivation: `fractional 1σ reduction (${currentSigma} − ${bound?.maxSigma ?? 0})/${currentSigma} = ${fmt(fractional)}`,
          };
        }
        candidates.push(
          buildCandidate(state, {
            actionKind: "measure_property",
            method,
            subject,
            propertyKey: gap.propertyKey,
            gapState: gap.state,
            context,
            reduction,
            targetSigma: bound?.maxSigma,
            targetUnit: bound?.unit,
            addressesGapIds: address,
            instructions:
              `Acquire a numeric measurement of ${gap.propertyKey} on node ${gap.subjectNodeId} with 1σ ≤ ${bound?.maxSigma ?? "(bound unknown)"} ${bound?.unit ?? ""} ` +
              `using ${method}${currentSigma === undefined ? " (current 1σ UNKNOWN — never assumed 0)" : ` (current 1σ ${currentSigma})`}; record the measurement uncertainty and its basis.`,
          }),
        );
        break;
      }

      case "bounded_property_not_asserted": {
        const bound = uncertaintyBoundOf(state, gap.dimensionIds, gap.propertyKey ?? "");
        const method = state.methodPreferences.measureProperty;
        // ONLY explicitly task-focused subjects get candidates: proposing a
        // subject the task did not name would fabricate task knowledge.
        const focusedSubjects = state.subjects.filter(
          (candidate) => candidate.taskFocused && candidate.presence !== "tombstoned",
        );
        for (const focused of focusedSubjects) {
          candidates.push(
            buildCandidate(state, {
              actionKind: "measure_property",
              method,
              subject: focused,
              propertyKey: gap.propertyKey,
              gapState: "NOT_OBSERVED",
              context,
              reduction: {
                value: UNKNOWN_SIGMA_RESOLUTION_VALUE,
                derivation: `"${gap.propertyKey}" is asserted nowhere — the first assertion resolves the total unknown: ${UNKNOWN_SIGMA_RESOLUTION_VALUE}`,
              },
              targetSigma: bound?.maxSigma,
              targetUnit: bound?.unit,
              addressesGapIds: address,
              instructions:
                `Assert and measure ${gap.propertyKey} on the task-focused node ${focused.nodeId} with 1σ ≤ ${bound?.maxSigma ?? "(bound unknown)"} ${bound?.unit ?? ""} ` +
                `using ${method}; the engine cannot pick the subject itself — this candidate exists because the task focus names the node.`,
            }),
          );
        }
        // With no task focus, the gap stands WITHOUT a candidate (documented
        // honestly — the engine never fabricates subject knowledge).
        break;
      }

      case "floor_property_not_asserted": {
        const method = state.methodPreferences.assertProperty;
        const required = epistemicFloorOf(state, gap.dimensionIds) ?? "OBSERVED";
        const focusedSubjects = state.subjects.filter(
          (candidate) => candidate.taskFocused && candidate.presence !== "tombstoned",
        );
        for (const focused of focusedSubjects) {
          candidates.push(
            buildCandidate(state, {
              actionKind: "assert_property",
              method,
              subject: focused,
              propertyKey: gap.propertyKey,
              gapState: "NOT_OBSERVED",
              context,
              reduction: {
                value: NON_MEASUREMENT_REDUCTION_VALUE,
                derivation: `asserting a categorical property changes no measurement 1σ — expected uncertainty reduction is ${NON_MEASUREMENT_REDUCTION_VALUE} by semantics (confidence is not measurement uncertainty)`,
              },
              requiredEpistemicStatus: required,
              addressesGapIds: address,
              instructions:
                `Acquire an assertion of "${gap.propertyKey}" on the task-focused node ${focused.nodeId} ` +
                `(≥ ${required}) via ${method}; the engine cannot pick the subject itself — this candidate exists because the task focus names the node.`,
            }),
          );
        }
        break;
      }

      case "coverage_unsupported":
      case "coverage_invalidated_only": {
        const method = state.methodPreferences.observeNode;
        candidates.push(
          buildCandidate(state, {
            actionKind: "observe_node",
            method,
            subject,
            propertyKey: null,
            gapState: gap.state,
            context,
            reduction: {
              value: UNKNOWN_SIGMA_RESOLUTION_VALUE,
              derivation:
                gap.gapClass === "coverage_invalidated_only"
                  ? `the node's only support is withdrawn — a fresh valid observation restores full evidentiary support: ${UNKNOWN_SIGMA_RESOLUTION_VALUE}`
                  : `no valid evidence supports this node — acquiring any valid evidence resolves the unsupported state: ${UNKNOWN_SIGMA_RESOLUTION_VALUE}`,
            },
            addressesGapIds: address,
            instructions:
              `Capture evidence of node ${gap.subjectNodeId} using ${method} and link it to the node so it carries valid evidentiary support` +
              (gap.gapClass === "coverage_invalidated_only"
                ? " (the node's existing links are all invalidated — a fresh observation is needed, invalidation is never undone silently)"
                : "") +
              ".",
          }),
        );
        break;
      }

      case "coverage_indeterminate": {
        const method = state.methodPreferences.verifyCaptureStatus;
        candidates.push(
          buildCandidate(state, {
            actionKind: "verify_capture_status",
            method,
            subject,
            propertyKey: null,
            gapState: gap.state,
            context,
            reduction: {
              value: NON_MEASUREMENT_REDUCTION_VALUE,
              derivation: `capture-status verification acquires no measurement — expected uncertainty reduction is ${NON_MEASUREMENT_REDUCTION_VALUE} by semantics`,
            },
            addressesGapIds: address,
            instructions:
              `Determine whether node ${gap.subjectNodeId} was actually captured (its annotation claims UNKNOWN) — ` +
              `inspect the capture session record via ${method}; an indeterminate status is never guessed and never collapsed.`,
          }),
        );
        break;
      }

      case "epistemic_below_floor": {
        const method = state.methodPreferences.confirmProperty;
        const required = epistemicFloorOf(state, gap.dimensionIds) ?? "OBSERVED";
        candidates.push(
          buildCandidate(state, {
            actionKind: "confirm_property",
            method,
            subject,
            propertyKey: gap.propertyKey,
            gapState: gap.state,
            context,
            reduction: {
              value: NON_MEASUREMENT_REDUCTION_VALUE,
              derivation: `epistemic confirmation upgrades the assertion's status, not its measurement 1σ — expected uncertainty reduction is ${NON_MEASUREMENT_REDUCTION_VALUE} by semantics (confidence is not measurement uncertainty)`,
            },
            requiredEpistemicStatus: required,
            addressesGapIds: address,
            instructions:
              `Have a human confirm "${gap.propertyKey}" on node ${gap.subjectNodeId} to ≥ ${required} via ${method} ` +
              `(currently asserted at a weaker status); the confirmation is recorded as a new provenance-carrying assertion — never a silent status rewrite.`,
          }),
        );
        break;
      }

      case "subject_not_observed": {
        const method = state.methodPreferences.observeNode;
        candidates.push(
          buildCandidate(state, {
            actionKind: "observe_node",
            method,
            subject,
            propertyKey: null,
            gapState: gap.state,
            context,
            reduction: {
              value: UNKNOWN_SIGMA_RESOLUTION_VALUE,
              derivation: `the expected subject was never observed — the first observation resolves the total unknown: ${UNKNOWN_SIGMA_RESOLUTION_VALUE}`,
            },
            addressesGapIds: address,
            instructions:
              `Observe the expected subject "${gap.subjectNodeId}" (claimed NOT observed, evidence-backed) using ${method} and register the result in the evidence graph.`,
          }),
        );
        break;
      }

      case "subject_occluded": {
        const method = state.methodPreferences.resolveOcclusion;
        candidates.push(
          buildCandidate(state, {
            actionKind: "resolve_occlusion",
            method,
            subject,
            propertyKey: null,
            gapState: gap.state,
            context,
            reduction: {
              value: UNKNOWN_SIGMA_RESOLUTION_VALUE,
              derivation: `the occluded subject's first observation resolves the total unknown: ${UNKNOWN_SIGMA_RESOLUTION_VALUE}`,
            },
            addressesGapIds: address,
            instructions:
              `Re-observe the occluded subject "${gap.subjectNodeId}" once the occlusion clears (or from an angle that clears it) using ${method}; ` +
              `the occlusion claim is evidence-backed — removal is an operator decision, never assumed.`,
          }),
        );
        break;
      }

      case "subject_capture_unknown": {
        const method = state.methodPreferences.verifyCaptureStatus;
        candidates.push(
          buildCandidate(state, {
            actionKind: "verify_capture_status",
            method,
            subject,
            propertyKey: null,
            gapState: gap.state,
            context,
            reduction: {
              value: NON_MEASUREMENT_REDUCTION_VALUE,
              derivation: `capture-status verification acquires no measurement — expected uncertainty reduction is ${NON_MEASUREMENT_REDUCTION_VALUE} by semantics`,
            },
            addressesGapIds: address,
            instructions:
              `Determine whether the expected subject "${gap.subjectNodeId}" was captured at all (its annotation claims UNKNOWN) via ${method}; ` +
              `UNKNOWN is never collapsed to observed or absent.`,
          }),
        );
        break;
      }

      case "no_modeled_subjects": {
        // No candidate: there is no subject to observe and no honest action
        // this engine can propose — the gap stands as escalation input.
        break;
      }
    }
  }

  /* ---- 4. Canonical ordering and stats ------------------------------- */

  const orderedGaps = gaps.sort((a, b) => {
    // Task-level gaps first (by class, then propertyKey); then subject gaps
    // by subjectNodeId, propertyKey, class — a stable total order that does
    // NOT depend on insertion order.
    if (a.subjectNodeId === null && b.subjectNodeId !== null) return -1;
    if (a.subjectNodeId !== null && b.subjectNodeId === null) return 1;
    if (a.subjectNodeId === null && b.subjectNodeId === null) {
      const byClass = compareStrings(a.gapClass, b.gapClass);
      if (byClass !== 0) return byClass;
      return compareStrings(a.propertyKey ?? "", b.propertyKey ?? "");
    }
    const bySubject = compareStrings(a.subjectNodeId ?? "", b.subjectNodeId ?? "");
    if (bySubject !== 0) return bySubject;
    const byProperty = compareStrings(a.propertyKey ?? "", b.propertyKey ?? "");
    if (byProperty !== 0) return byProperty;
    return compareStrings(a.gapClass, b.gapClass);
  });

  const orderedCandidates = [...candidates].sort((a, b) => {
    // THE canonical ranking: composite DESC, then candidateId ASC.
    if (a.score.compositeValue !== b.score.compositeValue) {
      return b.score.compositeValue - a.score.compositeValue;
    }
    return compareStrings(a.candidateId, b.candidateId);
  });

  for (const gap of orderedGaps) {
    for (const evidenceId of gap.evidenceIds) {
      evidenceReferenced.add(evidenceId);
    }
  }

  const stats: GapAnalysisStats = {
    totalGaps: orderedGaps.length,
    missingGaps: orderedGaps.filter((gap) => gap.kind === "MISSING").length,
    weakGaps: orderedGaps.filter((gap) => gap.kind === "WEAK").length,
    ambiguousGaps: orderedGaps.filter((gap) => gap.kind === "AMBIGUOUS").length,
    observedStateGaps: orderedGaps.filter((gap) => gap.state === "OBSERVED").length,
    unknownStateGaps: orderedGaps.filter((gap) => gap.state === "UNKNOWN").length,
    notObservedStateGaps: orderedGaps.filter((gap) => gap.state === "NOT_OBSERVED").length,
    occludedStateGaps: orderedGaps.filter((gap) => gap.state === "OCCLUDED").length,
    tombstonedSubjectGaps: orderedGaps.filter(
      (gap) =>
        gap.subjectNodeId !== null &&
        state.subjects.find((candidate) => candidate.nodeId === gap.subjectNodeId)?.presence ===
          "tombstoned",
    ).length,
    totalCandidates: orderedCandidates.length,
    substitutionCandidates: orderedCandidates.filter(
      (candidate) => candidate.substitution !== undefined,
    ).length,
    topCandidateId: orderedCandidates[0]?.candidateId ?? null,
    evidenceReferenced: evidenceReferenced.size,
  };

  return { gaps: orderedGaps, candidates: orderedCandidates, stats };
}

/**
 * Expected uncertainty reduction under the independent-corroboration
 * model (stated, not hidden): n independent observations of the same
 * quantity reduce the combined estimate's 1σ as 1/√n, so acquiring
 * `additional` more observations reduces it by 1 − √(n/(n+additional)).
 */
function corroborationReduction(validCount: number, additional: number): number {
  if (additional <= 0) {
    return 0;
  }
  return round6(1 - Math.sqrt(validCount / (validCount + additional)));
}

/* ------------------------------------------------------------------ */
/* Boundary input parsers (shape/vocabulary; semantic checks in service)*/
/* ------------------------------------------------------------------ */

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTENT_ID = /^[0-9a-f]{64}$/;
const VERSION_ID = /^v\d{3,}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isContentId(value: unknown): value is string {
  return typeof value === "string" && CONTENT_ID.test(value);
}

function isVersionId(value: unknown): value is string {
  return typeof value === "string" && VERSION_ID.test(value);
}

function isEvidenceMethod(value: unknown): value is EvidenceMethod {
  return typeof value === "string" && (EVIDENCE_METHODS as readonly string[]).includes(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** analysisId shape (caller-stable opaque identity, 1..256 chars). */
export function validateAnalysisId(analysisId: string): void {
  if (typeof analysisId !== "string" || analysisId.length < 1 || analysisId.length > 256) {
    throw new GapAnalysisError("invalid_analysis_id", "analysisId must be 1..256 characters");
  }
}

/** projectId shape (mirrors the Reality Graph authority's bounds). */
export function validateProjectRefId(projectId: string): void {
  if (typeof projectId !== "string" || projectId.length < 1 || projectId.length > 256) {
    throw new GapAnalysisError("invalid_project_id", "projectId must be 1..256 characters");
  }
}

/** versionId shape (`vNNN`, the Reality Graph authority's convention). */
export function validateVersionRefId(versionId: string): void {
  if (typeof versionId !== "string" || !VERSION_ID.test(versionId)) {
    throw new GapAnalysisError(
      "invalid_version_id",
      "versionId must be a well-formed reality version id (v001, v002, …)",
    );
  }
}

function isObservationStatus(value: unknown): value is ObservationStatus {
  return (
    typeof value === "string" &&
    (OBSERVATION_STATUS_ANNOTATION_STATUSES as readonly string[]).includes(value)
  );
}

function parseAnnotation(value: unknown): ObservationStatusAnnotation {
  if (!isRecord(value)) {
    throw new GapAnalysisError("invalid_annotation", "annotations entries must be objects");
  }
  const targetNodeId = value["targetNodeId"];
  if (!boundedString(targetNodeId, 256)) {
    throw new GapAnalysisError(
      "invalid_annotation",
      "annotation targetNodeId must be 1..256 characters",
    );
  }
  const observationStatus = value["observationStatus"];
  if (!isObservationStatus(observationStatus)) {
    throw new GapAnalysisError(
      "invalid_annotation",
      `annotation observationStatus must be one of ${OBSERVATION_STATUS_ANNOTATION_STATUSES.join("|")}`,
    );
  }
  const evidenceIds = value["evidenceIds"];
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
    throw new GapAnalysisError(
      "annotation_without_evidence",
      `annotation for ${targetNodeId} requires a NON-EMPTY evidenceIds array — an unsubstantiated coverage claim is rejected`,
    );
  }
  if (!evidenceIds.every((entry) => isContentId(entry))) {
    throw new GapAnalysisError(
      "invalid_evidence_ref",
      "every annotation evidenceId must be a 64-hex Evidence-Graph content address",
    );
  }
  return { targetNodeId, observationStatus, evidenceIds };
}

function parseAnnotations(value: unknown): ObservationStatusAnnotation[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new GapAnalysisError("invalid_annotation", "annotations must be an array");
  }
  const annotations = value.map(parseAnnotation);
  const seen = new Set<string>();
  for (const annotation of annotations) {
    if (seen.has(annotation.targetNodeId)) {
      throw new GapAnalysisError(
        "invalid_annotation",
        `duplicate annotation for target ${annotation.targetNodeId}`,
      );
    }
    seen.add(annotation.targetNodeId);
  }
  // Canonical order (deterministic bytes regardless of request order).
  return annotations.sort((a, b) => compareStrings(a.targetNodeId, b.targetNodeId));
}

function parseUncertaintyAnnotation(value: unknown): UncertaintyAnnotation {
  if (!isRecord(value)) {
    throw new GapAnalysisError(
      "invalid_uncertainty",
      "uncertaintyAnnotations entries must be objects",
    );
  }
  const nodeId = value["nodeId"];
  if (!boundedString(nodeId, 256)) {
    throw new GapAnalysisError(
      "invalid_uncertainty",
      "uncertainty annotation nodeId must be 1..256 characters",
    );
  }
  const propertyKey = value["propertyKey"];
  if (!boundedString(propertyKey, 256)) {
    throw new GapAnalysisError(
      "invalid_uncertainty",
      "uncertainty annotation propertyKey must be 1..256 characters",
    );
  }
  const sigma = value["sigma"];
  if (!isFiniteNumber(sigma) || sigma < 0) {
    throw new GapAnalysisError(
      "invalid_uncertainty",
      `uncertainty annotation sigma for (${nodeId}, ${propertyKey}) must be a finite number >= 0 — a 1σ in the property's own unit`,
    );
  }
  const unit = value["unit"];
  if (!boundedString(unit, 64)) {
    throw new GapAnalysisError(
      "invalid_uncertainty",
      "uncertainty annotation unit is REQUIRED (<=64 chars) — a unitless σ cannot be honestly compared",
    );
  }
  const basis = value["basis"];
  if (basis !== undefined && !boundedString(basis, 512)) {
    throw new GapAnalysisError(
      "invalid_uncertainty",
      "uncertainty annotation basis must be 1..512 characters",
    );
  }
  return { nodeId, propertyKey, sigma, unit, ...(basis === undefined ? {} : { basis }) };
}

function parseUncertaintyAnnotations(value: unknown): UncertaintyAnnotation[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new GapAnalysisError("invalid_uncertainty", "uncertaintyAnnotations must be an array");
  }
  const annotations = value.map(parseUncertaintyAnnotation);
  const seen = new Set<string>();
  for (const annotation of annotations) {
    const key = `${annotation.nodeId}:${annotation.propertyKey}`;
    if (seen.has(key)) {
      throw new GapAnalysisError(
        "invalid_uncertainty",
        `duplicate uncertainty annotation for (${annotation.nodeId}, ${annotation.propertyKey})`,
      );
    }
    seen.add(key);
  }
  return annotations.sort(
    (a, b) =>
      compareStrings(a.nodeId, b.nodeId) !== 0
        ? compareStrings(a.nodeId, b.nodeId)
        : compareStrings(a.propertyKey, b.propertyKey),
  );
}

function parseTaskFocus(value: unknown): TaskFocusEntry[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new GapAnalysisError("invalid_focus", "taskFocus must be an array");
  }
  const entries: TaskFocusEntry[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) {
      throw new GapAnalysisError("invalid_focus", "taskFocus entries must be objects");
    }
    const subjectNodeId = entry["subjectNodeId"];
    if (!boundedString(subjectNodeId, 256)) {
      throw new GapAnalysisError("invalid_focus", "taskFocus subjectNodeId must be 1..256 characters");
    }
    const impactWeight = entry["impactWeight"];
    if (!isFiniteNumber(impactWeight) || impactWeight < 0 || impactWeight > 1) {
      throw new GapAnalysisError(
        "invalid_focus",
        `taskFocus impactWeight for ${subjectNodeId} must be a finite number in [0,1]`,
      );
    }
    if (seen.has(subjectNodeId)) {
      throw new GapAnalysisError(
        "invalid_focus",
        `duplicate taskFocus entry for subject ${subjectNodeId}`,
      );
    }
    seen.add(subjectNodeId);
    entries.push({ subjectNodeId, impactWeight });
  }
  return entries.sort((a, b) => compareStrings(a.subjectNodeId, b.subjectNodeId));
}

function parseEffortContext(value: unknown): Readonly<Record<string, number>> {
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    throw new GapAnalysisError("invalid_effort_context", "effortContext must be an object");
  }
  const byMethod = value["byMethod"];
  if (byMethod === undefined || byMethod === null) {
    return {};
  }
  if (!isRecord(byMethod)) {
    throw new GapAnalysisError("invalid_effort_context", "effortContext.byMethod must be an object");
  }
  const overrides: Record<string, number> = {};
  for (const method of Object.keys(byMethod)) {
    if (!isEvidenceMethod(method)) {
      throw new GapAnalysisError(
        "invalid_effort_context",
        `effortContext.byMethod key "${method}" is not a known evidence method (${EVIDENCE_METHODS.join("|")})`,
      );
    }
    const effort = byMethod[method];
    if (!isFiniteNumber(effort) || effort < 0 || effort > 1) {
      throw new GapAnalysisError(
        "invalid_effort_context",
        `effortContext.byMethod["${method}"] must be a finite number in [0,1]`,
      );
    }
    overrides[method] = effort;
  }
  return overrides;
}

function parseMethodPreferences(value: unknown): Readonly<Partial<MethodPreferences>> {
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    throw new GapAnalysisError("invalid_method_preference", "methodPreferences must be an object");
  }
  const keys = [
    "measureProperty",
    "assertProperty",
    "observeNode",
    "confirmProperty",
    "verifyCaptureStatus",
    "resolveOcclusion",
  ] as const;
  const preferences: Partial<MethodPreferences> = {};
  for (const key of Object.keys(value)) {
    if (!(keys as readonly string[]).includes(key)) {
      throw new GapAnalysisError(
        "invalid_method_preference",
        `methodPreferences key "${key}" is not one of ${keys.join("|")}`,
      );
    }
    const method = value[key];
    if (!isEvidenceMethod(method)) {
      throw new GapAnalysisError(
        "invalid_method_preference",
        `methodPreferences.${key} must be one of ${EVIDENCE_METHODS.join("|")}`,
      );
    }
    (preferences as Record<string, EvidenceMethod>)[key] = method;
  }
  return preferences;
}

function parseDeviceCapabilityFacts(value: unknown): Readonly<Record<string, string>> | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new GapAnalysisError("invalid_device_profile", "deviceCapabilityFacts must be an object");
  }
  // The flat string-fact map (the assurance DeviceProfile's capabilityFacts
  // projection); unknown keys are data and are carried verbatim.
  const facts: Record<string, string> = {};
  for (const key of Object.keys(value)) {
    if (!isNonEmptyString(key) || key.length > 256) {
      throw new GapAnalysisError(
        "invalid_device_profile",
        "capability fact keys must be 1..256 characters",
      );
    }
    const fact = value[key];
    if (typeof fact !== "string") {
      throw new GapAnalysisError(
        "invalid_device_profile",
        `deviceCapabilityFacts["${key}"] must be a string fact`,
      );
    }
    facts[key] = fact;
  }
  return facts;
}

/**
 * Parse and normalize the run-analysis boundary input. Shape and
 * vocabulary only (typed codes); deep semantic invariants — profile
 * resolution, reality version resolution, annotation/reality coherence,
 * evidence membership, uncertainty-target resolution, focus-subject
 * resolution — are the service's duty.
 */
export function parseRunGapAnalysisInput(payload: unknown): RunGapAnalysisInput {
  if (!isRecord(payload)) {
    throw new GapAnalysisError("invalid_analysis", "expected a JSON object");
  }
  const analysisId = payload["analysisId"];
  if (!isNonEmptyString(analysisId)) {
    throw new GapAnalysisError("invalid_analysis_id", "analysisId must be a non-empty string");
  }
  validateAnalysisId(analysisId);

  const taskRefValue = payload["taskRef"];
  if (!isRecord(taskRefValue)) {
    throw new GapAnalysisError("invalid_analysis", "taskRef must be an object");
  }
  const projectId = taskRefValue["projectId"];
  if (!isNonEmptyString(projectId)) {
    throw new GapAnalysisError("invalid_project_id", "taskRef.projectId must be a non-empty string");
  }
  validateProjectRefId(projectId);
  const versionId = taskRefValue["versionId"];
  if (!isNonEmptyString(versionId)) {
    throw new GapAnalysisError("invalid_version_id", "taskRef.versionId must be a non-empty string");
  }
  validateVersionRefId(versionId);
  const profileId = taskRefValue["profileId"];
  if (!boundedString(profileId, 256)) {
    throw new GapAnalysisError(
      "invalid_profile_ref",
      "taskRef.profileId must be 1..256 characters (the governing assurance profile's id)",
    );
  }

  return {
    analysisId,
    taskRef: { projectId, versionId, profileId },
    annotations: parseAnnotations(payload["annotations"]),
    uncertaintyAnnotations: parseUncertaintyAnnotations(payload["uncertaintyAnnotations"]),
    taskFocus: parseTaskFocus(payload["taskFocus"]),
    effortContext: parseEffortContext(payload["effortContext"]),
    methodPreferences: parseMethodPreferences(payload["methodPreferences"]),
    deviceCapabilityFacts: parseDeviceCapabilityFacts(payload["deviceCapabilityFacts"]),
  };
}

/** Resolve the effective effort model (defaults overridden by the request context). */
export function resolveEffortModel(effortContext: Readonly<Record<string, number>>): EffortModel {
  const byMethod = { ...DEFAULT_METHOD_EFFORT } as Record<EvidenceMethod, number>;
  for (const method of Object.keys(effortContext)) {
    if (isEvidenceMethod(method)) {
      byMethod[method] = effortContext[method] as number;
    }
  }
  return { byMethod: Object.freeze(byMethod) };
}

/** Resolve the effective method preferences (defaults overridden by the request). */
export function resolveMethodPreferences(
  preferences: Readonly<Partial<MethodPreferences>>,
): MethodPreferences {
  return {
    measureProperty: preferences.measureProperty ?? DEFAULT_METHOD_PREFERENCES.measure_property,
    assertProperty: preferences.assertProperty ?? DEFAULT_METHOD_PREFERENCES.assert_property,
    observeNode: preferences.observeNode ?? DEFAULT_METHOD_PREFERENCES.observe_node,
    confirmProperty: preferences.confirmProperty ?? DEFAULT_METHOD_PREFERENCES.confirm_property,
    verifyCaptureStatus:
      preferences.verifyCaptureStatus ?? DEFAULT_METHOD_PREFERENCES.verify_capture_status,
    resolveOcclusion: preferences.resolveOcclusion ?? DEFAULT_METHOD_PREFERENCES.resolve_occlusion,
  };
}

/* ------------------------------------------------------------------ */
/* Stored-record parser (store reads; write-time duty is the service's)*/
/* ------------------------------------------------------------------ */

function invalidRecord(detail: string): GapAnalysisError {
  return new GapAnalysisError("invalid_analysis_record", detail);
}

function parseStoredEvidenceIds(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => isContentId(entry))) {
    throw invalidRecord(`${where} must be an array of 64-hex evidence content ids`);
  }
  return value;
}

function parseStoredAnnotation(value: unknown): ObservationStatusAnnotation {
  if (!isRecord(value)) throw invalidRecord("annotation is not an object");
  if (!boundedString(value["targetNodeId"], 256)) throw invalidRecord("annotation.targetNodeId");
  const observationStatus = value["observationStatus"];
  if (!isObservationStatus(observationStatus)) throw invalidRecord("annotation.observationStatus");
  const evidenceIds = value["evidenceIds"];
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
    throw invalidRecord("annotation.evidenceIds must be a non-empty array");
  }
  return {
    targetNodeId: value["targetNodeId"] as string,
    observationStatus,
    evidenceIds: parseStoredEvidenceIds(evidenceIds, "annotation.evidenceIds"),
  };
}

function parseStoredUncertainty(value: unknown): UncertaintyAnnotation {
  if (!isRecord(value)) throw invalidRecord("uncertainty annotation is not an object");
  if (!boundedString(value["nodeId"], 256)) throw invalidRecord("uncertainty.nodeId");
  if (!boundedString(value["propertyKey"], 256)) throw invalidRecord("uncertainty.propertyKey");
  const sigma = value["sigma"];
  if (!isFiniteNumber(sigma) || sigma < 0) throw invalidRecord("uncertainty.sigma");
  if (!boundedString(value["unit"], 64)) throw invalidRecord("uncertainty.unit");
  const basis = value["basis"];
  if (basis !== undefined && !boundedString(basis, 512)) throw invalidRecord("uncertainty.basis");
  return {
    nodeId: value["nodeId"] as string,
    propertyKey: value["propertyKey"] as string,
    sigma,
    unit: value["unit"] as string,
    ...(basis === undefined ? {} : { basis }),
  };
}

function parseStoredFocus(value: unknown): TaskFocusEntry {
  if (!isRecord(value)) throw invalidRecord("taskFocus entry is not an object");
  if (!boundedString(value["subjectNodeId"], 256)) throw invalidRecord("taskFocus.subjectNodeId");
  const impactWeight = value["impactWeight"];
  if (!isFiniteNumber(impactWeight) || impactWeight < 0 || impactWeight > 1) {
    throw invalidRecord("taskFocus.impactWeight");
  }
  return { subjectNodeId: value["subjectNodeId"] as string, impactWeight };
}

function parseStoredEffortModel(value: unknown): EffortModel {
  if (!isRecord(value) || !isRecord(value["byMethod"])) {
    throw invalidRecord("effortModel.byMethod must be an object");
  }
  const byMethod = value["byMethod"] as Record<string, unknown>;
  const resolved: Record<string, number> = {};
  for (const method of Object.keys(byMethod)) {
    if (!isEvidenceMethod(method)) throw invalidRecord(`effortModel.byMethod key "${method}"`);
    const effort = byMethod[method];
    if (!isFiniteNumber(effort) || effort < 0 || effort > 1) {
      throw invalidRecord(`effortModel.byMethod["${method}"]`);
    }
    resolved[method] = effort;
  }
  for (const method of EVIDENCE_METHODS) {
    if (resolved[method] === undefined) {
      throw invalidRecord(`effortModel.byMethod is missing "${method}"`);
    }
  }
  return { byMethod: Object.freeze(resolved) as Readonly<Record<EvidenceMethod, number>> };
}

function parseStoredMethodPreferences(value: unknown): MethodPreferences {
  if (!isRecord(value)) throw invalidRecord("methodPreferences is not an object");
  const read = (key: string): EvidenceMethod => {
    const method = value[key];
    if (!isEvidenceMethod(method)) throw invalidRecord(`methodPreferences.${key}`);
    return method;
  };
  return {
    measureProperty: read("measureProperty"),
    assertProperty: read("assertProperty"),
    observeNode: read("observeNode"),
    confirmProperty: read("confirmProperty"),
    verifyCaptureStatus: read("verifyCaptureStatus"),
    resolveOcclusion: read("resolveOcclusion"),
  };
}

function parseStoredGap(value: unknown): EvidenceGapEntry {
  if (!isRecord(value)) throw invalidRecord("gap is not an object");
  if (!boundedString(value["gapId"], 64) || !(value["gapId"] as string).startsWith("gap-")) {
    throw invalidRecord("gap.gapId");
  }
  const kind = value["kind"];
  if (typeof kind !== "string" || !(GAP_KINDS as readonly string[]).includes(kind)) {
    throw invalidRecord("gap.kind must be in the frozen gap-kind vocabulary");
  }
  const state = value["state"];
  if (typeof state !== "string" || !(GAP_STATES as readonly string[]).includes(state)) {
    throw invalidRecord("gap.state must be in the frozen gap-state vocabulary");
  }
  const gapClass = value["gapClass"];
  if (typeof gapClass !== "string" || !(GAP_CLASSES as readonly string[]).includes(gapClass)) {
    throw invalidRecord("gap.gapClass must be in the frozen gap-class registry");
  }
  if (GAP_CLASS_TABLE[gapClass as GapClass].kind !== kind) {
    throw invalidRecord(`gap.kind "${kind}" contradicts the frozen class table for ${gapClass}`);
  }
  const description = value["description"];
  if (typeof description !== "string" || description.length === 0 || description.length > 4096) {
    throw invalidRecord("gap.description");
  }
  const subjectNodeId = value["subjectNodeId"];
  if (subjectNodeId !== null && subjectNodeId !== undefined && !boundedString(subjectNodeId, 256)) {
    throw invalidRecord("gap.subjectNodeId");
  }
  const propertyKey = value["propertyKey"];
  if (propertyKey !== null && propertyKey !== undefined && !boundedString(propertyKey, 256)) {
    throw invalidRecord("gap.propertyKey");
  }
  const dimensionIds = value["dimensionIds"];
  if (!Array.isArray(dimensionIds) || !dimensionIds.every((entry) => boundedString(entry, 256))) {
    throw invalidRecord("gap.dimensionIds");
  }
  if (typeof value["critical"] !== "boolean") throw invalidRecord("gap.critical");
  const evidenceIds = parseStoredEvidenceIds(value["evidenceIds"], "gap.evidenceIds");
  if (typeof value["addressesTaskFocus"] !== "boolean") {
    throw invalidRecord("gap.addressesTaskFocus");
  }
  return {
    gapId: value["gapId"] as string,
    kind: kind as GapKind,
    state: state as GapState,
    gapClass: gapClass as GapClass,
    description,
    subjectNodeId: subjectNodeId ?? null,
    propertyKey: propertyKey ?? null,
    dimensionIds,
    critical: value["critical"] as boolean,
    evidenceIds,
    addressesTaskFocus: value["addressesTaskFocus"] as boolean,
  };
}

function parseStoredScore(value: unknown): CandidateScore {
  if (!isRecord(value)) throw invalidRecord("score is not an object");
  const components = [
    "taskImpact",
    "expectedUncertaintyReduction",
    "operatorEffort",
    "recoverability",
    "compositeValue",
  ] as const;
  for (const component of components) {
    const number = value[component];
    if (!isFiniteNumber(number) || number < -1 || number > 1) {
      throw invalidRecord(`score.${component} must be a finite number in [-1,1]`);
    }
  }
  const derivation = value["derivation"];
  if (!isRecord(derivation)) throw invalidRecord("score.derivation");
  for (const field of [
    "taskImpact",
    "expectedUncertaintyReduction",
    "operatorEffort",
    "recoverability",
    "composite",
  ] as const) {
    const text = derivation[field];
    if (typeof text !== "string" || text.length === 0 || text.length > 2048) {
      throw invalidRecord(`score.derivation.${field}`);
    }
  }
  return {
    taskImpact: value["taskImpact"] as number,
    expectedUncertaintyReduction: value["expectedUncertaintyReduction"] as number,
    operatorEffort: value["operatorEffort"] as number,
    recoverability: value["recoverability"] as number,
    compositeValue: value["compositeValue"] as number,
    derivation: {
      taskImpact: derivation["taskImpact"] as string,
      expectedUncertaintyReduction: derivation["expectedUncertaintyReduction"] as string,
      operatorEffort: derivation["operatorEffort"] as string,
      recoverability: derivation["recoverability"] as string,
      composite: derivation["composite"] as string,
    },
  };
}

function parseStoredCandidate(value: unknown): RankedCandidate {
  if (!isRecord(value)) throw invalidRecord("candidate is not an object");
  if (
    !boundedString(value["candidateId"], 64) ||
    !(value["candidateId"] as string).startsWith("cand-")
  ) {
    throw invalidRecord("candidate.candidateId");
  }
  const actionKind = value["actionKind"];
  if (
    typeof actionKind !== "string" ||
    !(CANDIDATE_ACTION_KINDS as readonly string[]).includes(actionKind)
  ) {
    throw invalidRecord("candidate.actionKind must be in the frozen action vocabulary");
  }
  if (!isEvidenceMethod(value["method"])) throw invalidRecord("candidate.method");
  const subjectNodeId = value["subjectNodeId"];
  if (subjectNodeId !== null && subjectNodeId !== undefined && !boundedString(subjectNodeId, 256)) {
    throw invalidRecord("candidate.subjectNodeId");
  }
  const propertyKey = value["propertyKey"];
  if (propertyKey !== null && propertyKey !== undefined && !boundedString(propertyKey, 256)) {
    throw invalidRecord("candidate.propertyKey");
  }
  const additionalCount = value["additionalCount"];
  if (
    additionalCount !== undefined &&
    (!Number.isInteger(additionalCount) || (additionalCount as number) < 1)
  ) {
    throw invalidRecord("candidate.additionalCount must be an integer >= 1");
  }
  const targetSigma = value["targetSigma"];
  if (targetSigma !== undefined && (!isFiniteNumber(targetSigma) || (targetSigma as number) < 0)) {
    throw invalidRecord("candidate.targetSigma");
  }
  const targetUnit = value["targetUnit"];
  if (targetUnit !== undefined && !boundedString(targetUnit, 64)) {
    throw invalidRecord("candidate.targetUnit");
  }
  const requiredEpistemicStatus = value["requiredEpistemicStatus"];
  if (
    requiredEpistemicStatus !== undefined &&
    requiredEpistemicStatus !== "OBSERVED" &&
    requiredEpistemicStatus !== "CONFIRMED"
  ) {
    throw invalidRecord("candidate.requiredEpistemicStatus");
  }
  const addressesGapIds = value["addressesGapIds"];
  if (
    !Array.isArray(addressesGapIds) ||
    addressesGapIds.length === 0 ||
    !addressesGapIds.every(
      (entry) => typeof entry === "string" && (entry as string).startsWith("gap-"),
    )
  ) {
    throw invalidRecord(
      "candidate.addressesGapIds must be a NON-EMPTY array of gap ids (every recommendation names its gaps)",
    );
  }
  const substitution = value["substitution"];
  let substitutionSemantics: SubstitutionSemantics | undefined;
  if (substitution !== undefined && substitution !== null) {
    if (!isRecord(substitution)) throw invalidRecord("candidate.substitution");
    if (!isEvidenceMethod(substitution["originalMethod"])) {
      throw invalidRecord("candidate.substitution.originalMethod");
    }
    if (!isEvidenceMethod(substitution["substitutedMethod"])) {
      throw invalidRecord("candidate.substitution.substitutedMethod");
    }
    if (!boundedString(substitution["plausibility"], 32)) {
      throw invalidRecord("candidate.substitution.plausibility");
    }
    if (!boundedString(substitution["semanticsNote"], 2048)) {
      throw invalidRecord("candidate.substitution.semanticsNote");
    }
    substitutionSemantics = {
      originalMethod: substitution["originalMethod"],
      substitutedMethod: substitution["substitutedMethod"],
      plausibility: substitution["plausibility"],
      semanticsNote: substitution["semanticsNote"],
    };
  }
  const score = parseStoredScore(value["score"]);
  const instructions = value["instructions"];
  if (typeof instructions !== "string" || instructions.length === 0 || instructions.length > 4096) {
    throw invalidRecord("candidate.instructions");
  }
  return {
    candidateId: value["candidateId"] as string,
    actionKind: actionKind as CandidateActionKind,
    method: value["method"] as EvidenceMethod,
    subjectNodeId: subjectNodeId ?? null,
    propertyKey: propertyKey ?? null,
    ...(additionalCount === undefined ? {} : { additionalCount: additionalCount as number }),
    ...(targetSigma === undefined ? {} : { targetSigma: targetSigma as number }),
    ...(targetUnit === undefined ? {} : { targetUnit: targetUnit as string }),
    ...(requiredEpistemicStatus === undefined
      ? {}
      : { requiredEpistemicStatus: requiredEpistemicStatus as "OBSERVED" | "CONFIRMED" }),
    addressesGapIds,
    ...(substitutionSemantics === undefined ? {} : { substitution: substitutionSemantics }),
    score,
    instructions,
  };
}

function parseStoredStats(
  value: unknown,
  gaps: readonly EvidenceGapEntry[],
  candidates: readonly RankedCandidate[],
): GapAnalysisStats {
  if (!isRecord(value)) throw invalidRecord("stats is not an object");
  const fields: readonly [string, number | string | null][] = [
    ["totalGaps", gaps.length],
    ["missingGaps", gaps.filter((gap) => gap.kind === "MISSING").length],
    ["weakGaps", gaps.filter((gap) => gap.kind === "WEAK").length],
    ["ambiguousGaps", gaps.filter((gap) => gap.kind === "AMBIGUOUS").length],
    ["observedStateGaps", gaps.filter((gap) => gap.state === "OBSERVED").length],
    ["unknownStateGaps", gaps.filter((gap) => gap.state === "UNKNOWN").length],
    ["notObservedStateGaps", gaps.filter((gap) => gap.state === "NOT_OBSERVED").length],
    ["occludedStateGaps", gaps.filter((gap) => gap.state === "OCCLUDED").length],
    ["totalCandidates", candidates.length],
    [
      "substitutionCandidates",
      candidates.filter((candidate) => candidate.substitution !== undefined).length,
    ],
    ["topCandidateId", candidates[0]?.candidateId ?? null],
  ];
  for (const [field, expectedValue] of fields) {
    if (value[field] !== expectedValue) {
      throw invalidRecord(
        `stats.${field} must be ${JSON.stringify(expectedValue)} — persisted statistics are ALWAYS consistent with the persisted rows`,
      );
    }
  }
  const tombstonedSubjectGaps = value["tombstonedSubjectGaps"];
  if (
    typeof tombstonedSubjectGaps !== "number" ||
    !Number.isInteger(tombstonedSubjectGaps) ||
    tombstonedSubjectGaps < 0 ||
    tombstonedSubjectGaps > gaps.length
  ) {
    throw invalidRecord("stats.tombstonedSubjectGaps must be an integer in [0, totalGaps]");
  }
  const evidenceReferenced = value["evidenceReferenced"];
  if (
    typeof evidenceReferenced !== "number" ||
    !Number.isInteger(evidenceReferenced) ||
    evidenceReferenced < 0
  ) {
    throw invalidRecord("stats.evidenceReferenced must be a non-negative integer");
  }
  return {
    totalGaps: gaps.length,
    missingGaps: gaps.filter((gap) => gap.kind === "MISSING").length,
    weakGaps: gaps.filter((gap) => gap.kind === "WEAK").length,
    ambiguousGaps: gaps.filter((gap) => gap.kind === "AMBIGUOUS").length,
    observedStateGaps: gaps.filter((gap) => gap.state === "OBSERVED").length,
    unknownStateGaps: gaps.filter((gap) => gap.state === "UNKNOWN").length,
    notObservedStateGaps: gaps.filter((gap) => gap.state === "NOT_OBSERVED").length,
    occludedStateGaps: gaps.filter((gap) => gap.state === "OCCLUDED").length,
    tombstonedSubjectGaps,
    totalCandidates: candidates.length,
    substitutionCandidates: candidates.filter(
      (candidate) => candidate.substitution !== undefined,
    ).length,
    topCandidateId: candidates[0]?.candidateId ?? null,
    evidenceReferenced,
  };
}

function parseStoredEvent(value: unknown): GapAnalysisEvent {
  if (!isRecord(value)) throw invalidRecord("history entry is not an object");
  if (!boundedString(value["eventId"], 64)) throw invalidRecord("history.eventId");
  if (value["eventType"] !== "gap_analysis_recorded") throw invalidRecord("history.eventType");
  if (typeof value["occurredAt"] !== "string" || !ISO_UTC.test(value["occurredAt"])) {
    throw invalidRecord("history.occurredAt");
  }
  if (!isContentId(value["recordDigest"])) {
    throw invalidRecord("history.recordDigest must be a 64-hex digest");
  }
  return {
    eventId: value["eventId"] as string,
    eventType: "gap_analysis_recorded",
    occurredAt: value["occurredAt"] as string,
    recordDigest: value["recordDigest"] as string,
  };
}

/**
 * Structural validation of a persisted analysis record (store reads;
 * garbage on disk is a typed `invalid_analysis_record` rejection, never a
 * silent misparse). The stats-vs-rows coherence, the gap-reference
 * resolution and the event-digest coherence are re-verified on EVERY read
 * (an inconsistent record is corruption).
 */
export function parseGapAnalysisRecord(value: unknown): GapAnalysisRecord {
  if (!isRecord(value)) throw invalidRecord("analysis record is not a JSON object");
  const analysisId = value["analysisId"];
  if (!isNonEmptyString(analysisId)) throw invalidRecord("analysisId");
  try {
    validateAnalysisId(analysisId);
  } catch (error) {
    if (error instanceof GapAnalysisError) {
      throw invalidRecord(`analysisId: ${error.detail}`);
    }
    throw error;
  }

  const taskRefValue = value["taskRef"];
  if (!isRecord(taskRefValue)) throw invalidRecord("taskRef");
  if (!boundedString(taskRefValue["projectId"], 256)) throw invalidRecord("taskRef.projectId");
  if (!isVersionId(taskRefValue["versionId"])) throw invalidRecord("taskRef.versionId");
  if (!boundedString(taskRefValue["profileId"], 256)) throw invalidRecord("taskRef.profileId");
  const taskRef: GapTaskRef = {
    projectId: taskRefValue["projectId"] as string,
    versionId: taskRefValue["versionId"] as string,
    profileId: taskRefValue["profileId"] as string,
  };

  const annotationsValue = value["annotations"];
  if (!Array.isArray(annotationsValue)) throw invalidRecord("annotations must be an array");
  const annotations = annotationsValue.map(parseStoredAnnotation);

  const uncertaintyValue = value["uncertaintyAnnotations"];
  if (!Array.isArray(uncertaintyValue)) {
    throw invalidRecord("uncertaintyAnnotations must be an array");
  }
  const uncertaintyAnnotations = uncertaintyValue.map(parseStoredUncertainty);

  const focusValue = value["taskFocus"];
  if (!Array.isArray(focusValue)) throw invalidRecord("taskFocus must be an array");
  const taskFocus = focusValue.map(parseStoredFocus);

  const effortModel = parseStoredEffortModel(value["effortModel"]);
  const methodPreferences = parseStoredMethodPreferences(value["methodPreferences"]);

  const deviceCapabilityFactsValue = value["deviceCapabilityFacts"];
  let deviceCapabilityFacts: Readonly<Record<string, string>> | null = null;
  if (deviceCapabilityFactsValue !== null && deviceCapabilityFactsValue !== undefined) {
    if (!isRecord(deviceCapabilityFactsValue)) {
      throw invalidRecord("deviceCapabilityFacts");
    }
    const facts: Record<string, string> = {};
    for (const key of Object.keys(deviceCapabilityFactsValue)) {
      const fact = deviceCapabilityFactsValue[key];
      if (typeof fact !== "string") throw invalidRecord(`deviceCapabilityFacts["${key}"]`);
      facts[key] = fact;
    }
    deviceCapabilityFacts = facts;
  }

  const readinessReport = value["readinessReport"];
  if (!isRecord(readinessReport)) {
    throw invalidRecord(
      "readinessReport must be present — the readiness authority's consumed output is carried verbatim",
    );
  }

  const gapsValue = value["gaps"];
  if (!Array.isArray(gapsValue)) throw invalidRecord("gaps must be an array");
  const gaps = gapsValue.map(parseStoredGap);

  const candidatesValue = value["candidates"];
  if (!Array.isArray(candidatesValue)) throw invalidRecord("candidates must be an array");
  const candidates = candidatesValue.map(parseStoredCandidate);

  // Every recommendation names its gaps: references must resolve.
  const gapIds = new Set(gaps.map((gap) => gap.gapId));
  for (const candidate of candidates) {
    for (const gapId of candidate.addressesGapIds) {
      if (!gapIds.has(gapId)) {
        throw invalidRecord(
          `candidate ${candidate.candidateId} addresses gap ${gapId} which does not exist in this record`,
        );
      }
    }
  }

  const stats = parseStoredStats(value["stats"], gaps, candidates);

  const inputDigest = value["inputDigest"];
  if (!isContentId(inputDigest)) throw invalidRecord("inputDigest must be a 64-hex digest");
  if (typeof value["computedAt"] !== "string" || !ISO_UTC.test(value["computedAt"])) {
    throw invalidRecord("computedAt");
  }

  const historyValue = value["history"];
  if (!Array.isArray(historyValue) || historyValue.length === 0) {
    throw invalidRecord("history must be a NON-EMPTY array (creation event is never absent)");
  }
  const history = historyValue.map(parseStoredEvent);

  const record: GapAnalysisRecord = {
    analysisId,
    taskRef,
    annotations,
    uncertaintyAnnotations,
    taskFocus,
    effortModel,
    methodPreferences,
    deviceCapabilityFacts,
    readinessReport: readinessReport as unknown as ReadinessReport,
    gaps,
    candidates,
    stats,
    inputDigest,
    computedAt: value["computedAt"] as string,
    history,
  };
  // Coherence: the LAST event's digest must pin the persisted content —
  // a rewritten or truncated history is corruption, never a silent read.
  const lastEvent = history[history.length - 1] as GapAnalysisEvent;
  if (lastEvent.recordDigest !== gapAnalysisContentDigest(record)) {
    throw invalidRecord(
      "the last history event's recordDigest does not pin the persisted content — history is never rewritten",
    );
  }
  return record;
}
