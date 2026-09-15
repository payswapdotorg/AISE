/**
 * AISE-041 — Workflow migration and switching-friction profiler: the MODEL.
 *
 * Contract (spec/work-orders.md §041: "Owner ZAI. Inventory incumbent
 * workflows, systems of record, resources, user roles, manual re-entry,
 * approvals, irreversibility, training burden, latency, rollback and
 * contractual constraints. Score integration readiness and switching
 * friction, identify candidate AISE replacement steps, record
 * semantic-equivalence evidence and migration state. Verify progressive/
 * reversible migration, no false replacement claims and friction metrics
 * tied to pilot outcomes. CRITICAL where equivalence changes engineering
 * outcomes."; spec/requirements.md R20 — "AISE shall inventory incumbent
 * workflows and represent migration friction, dependencies, equivalence
 * evidence, candidate replacements, rollout state and rollback paths.
 * Acceptance: migration candidates can be evaluated and moved
 * incrementally; no incumbent step is declared replaced without semantic
 * equivalence and operational acceptance."; spec/architecture-lock.md
 * "Incumbent integration and adoption" — "Workflow migration is
 * progressive, reversible and evidence-backed. An incumbent step is not
 * considered replaced without semantic equivalence, operational acceptance
 * and rollback capability."; spec/domain-model.md Integration/adoption
 * family — IncumbentWorkflow, WorkflowStep, MigrationCandidate,
 * SemanticEquivalenceRecord, MigrationState, RollbackPlan,
 * IntegrationReadinessAssessment; "Migration never changes an external
 * source of record implicitly." "MigrationState is progressive and
 * reversible. RollbackPlan must remain available until operational
 * acceptance."):
 *
 * THE PROFILER IS INVENTORY + SCORING, NEVER MIGRATION ITSELF (the loud
 * parts first, enforced here structurally, not by convention):
 *
 *  - This module RECORDS incumbent workflows and their steps as typed,
 *    inspectable INVENTORY (every attribute class named by the work order
 *    is a typed field), SCORES integration readiness and switching
 *    friction from the DECLARED attributes with explicit frozen weights,
 *    and TRACKS migration candidates through a guarded state machine. It
 *    NEVER executes a migration, NEVER writes to an incumbent system and
 *    NEVER changes an external source of record — there is no connector,
 *    no sync and no write path out of this module at all (the integrations
 *    authority owns connectors; this module only READS its registry
 *    through an injected one-method resolver).
 *  - INCUMBENT SYSTEMS KEEP THEIR AUTHORITY: a WorkflowStep references
 *    incumbent systems of record BY ID (`ExternalSystemRef`: the shared
 *    system-class vocabulary + an OPAQUE instance id + an OPTIONAL
 *    adapterId id-reference into the integrations adapter registry). The
 *    step record never embeds incumbent record CONTENT as AISE truth —
 *    workflow steps are inventory records, not copies of the incumbent's
 *    data. The ONLY sibling VALUE import is `SYSTEM_CLASSES` (+ the
 *    descriptor validator) from the integrations model — the single
 *    system-class/descriptor-validation authority; redefining either here
 *    would create a second vocabulary (forbidden).
 *  - NO FALSE REPLACEMENT CLAIMS (the CRITICAL acceptance): the migration
 *    state machine advances one step at a time (proposed → evaluating →
 *    piloted → replaced; no skipping, ever) and `replaced` is reachable
 *    ONLY when BOTH a SemanticEquivalenceRecord (how equivalence was
 *    established, its evidence ids, its LIMITS — a non-empty honest limits
 *    statement is REQUIRED) AND an operational acceptance record exist,
 *    AND an ACTIVE rollback plan exists (the architecture lock's
 *    "rollback capability" requirement for replacement). Each missing
 *    prerequisite is a DISTINCT typed refusal naming what is missing.
 *  - PROGRESSIVE AND REVERSIBLE: every advanced candidate retains an
 *    active RollbackPlan (entering `evaluating` already requires one, so
 *    the invariant holds from the first advancement); retiring a plan
 *    before operational acceptance is a typed refusal
 *    (`rollback_plan_still_required`); the rollback transition itself is a
 *    RECORDED state transition with full provenance (actor, clock
 *    timestamp, the rollback plan id used) landing in the append-only
 *    terminal state `rolled_back` (re-proposal is a NEW candidate record —
 *    history is never rewritten).
 *  - FRICTION METRICS TIED TO PILOT OUTCOMES: entering `piloted` REQUIRES
 *    non-empty pilot-outcome evidence ids (`pilot_evidence_required`) —
 *    friction claims are only ever advanced against named pilot evidence;
 *    every score is computed from the declared attributes with EXPLICIT,
 *    code-defined frozen weights, inspectable down to its contributing
 *    attributes (per-component derivation strings substitute the actual
 *    numbers); an attribute that is UNKNOWN contributes an UNKNOWN
 *    component — never zero, never silently defaulted — and any aggregate
 *    over an unknown component is NOT COMPUTED (null) with the unknown
 *    component names carried as the honest uncertainty marker. A number
 *    would fabricate certainty; this module refuses to.
 *  - APPEND-ONLY: workflow/candidate/equivalence/acceptance/rollback-plan
 *    records are never rewritten — mutations APPEND typed audit events
 *    (provenance: actor + injected-clock timestamp + evidence ids + the
 *    sha-256 content digest of the record AFTER the mutation); prior
 *    events and their digests never change; assessments are write-once
 *    derived records (id reuse is a typed refusal). Steps are appended,
 *    never removed. The stored-record parser re-verifies every read
 *    (event numbering, per-event-type provenance shape, and that the LAST
 *    event's digest pins the persisted content — a rewritten or truncated
 *    history is corruption, never a silent misparse).
 *  - ACTORS AND TENANTS ARE OPAQUE PROVENANCE (the AISE-036/037
 *    discipline): every mutation records an `actor` (an opaque principal
 *    label journaled verbatim) and workflows carry an opaque
 *    `organizationId`. This module does NOT authenticate principals and
 *    does NOT interpret tenant ids — request-level authentication belongs
 *    to deployment surfaces; the identity authority owns authorization
 *    policy. Actors are PROVENANCE, never authorization claims.
 *  - DETERMINISM: content-derived digests (sha-256 over canonical JSON),
 *    injected clock only, canonical orderings everywhere (steps'
 *    reference lists sorted, roles deduped+sorted, adapter view sorted by
 *    adapterId, ranked steps totally ordered by opportunity DESC then
 *    stepId ASC). No wall clock, no randomness, no network. The same
 *    inputs plus the same clock produce byte-identical records in fresh
 *    stores.
 *
 * SCORING MODEL (frozen, code-defined like assurance profiles — changing
 * any weight or severity is a governed change; every number inspectable):
 *
 *  - Integration READINESS per step (higher = readier for an AISE
 *    replacement boundary), weights summing to 1:
 *      connectorCoverage 0.50 — fraction of the step's systems-of-record
 *        refs that resolve to REGISTERED adapters (refs without an
 *        adapterId, or whose adapterId does not resolve, are uncovered; a
 *        step with ZERO systems of record carries coverage 1 by
 *        convention — no connector barrier; a ref whose resolved adapter
 *        declares a DIFFERENT system class than the ref is a typed
 *        `adapter_class_mismatch` refusal at assessment time, never a
 *        silent mis-score);
 *      manualReEntry 0.30 — none 0 / light 0.5 / heavy 1 (incumbent
 *        re-entry pain is exactly what an integrated replacement removes);
 *      rollback 0.20 — unavailable 0 / partial 0.5 / available 1
 *        (rollback headroom enables low-risk pilot switching).
 *  - Switching FRICTION per step (higher = harder to switch), weights
 *    summing to 1:
 *      approvals 0.20 — strictness severity (none 0 / routine 0.3 /
 *        gated 0.7 / regulatory 1) × gate factor min(1, gateCount/3)
 *        (saturating at 3 gates);
 *      irreversibility 0.30 — reversible 0 / partially_reversible 0.5 /
 *        irreversible 1;
 *      trainingBurden 0.25 — low 0.15 / moderate 0.5 / high 1;
 *      latency 0.15 — relaxed 0 / batched 0.3 / interactive 0.65 /
 *        real_time 1;
 *      contractualConstraints 0.10 — none 0 / standard_exit 0.3 /
 *        restricted_exit 0.7 / locked_in 1.
 *  - Workflow-level aggregates: each component is the arithmetic MEAN of
 *    the per-step components (derivation lists every step value); a
 *    component is UNKNOWN iff any contributing step attribute is UNKNOWN;
 *    the composite is null iff any component is unknown. Resources and
 *    user roles are INVENTORY dimensions (distinct-count rollups) and
 *    deliberately feed NO numeric score — no hidden weighting of role
 *    counts (documented non-contribution).
 *  - Replacement-opportunity ranking (the "identify candidate AISE
 *    replacement steps" feed): opportunity = readiness − friction per
 *    step (null while either composite is unknown); steps are ranked
 *    opportunity DESC (nulls LAST), then stepId ASC — a stable total
 *    order. The ranking IDENTIFIES candidates; proposing one is a human
 *    decision recorded as a MigrationCandidate.
 *
 * This module owns the frozen vocabularies, record types, the typed error
 * registry, boundary input parsers (shape/vocabulary → typed codes), the
 * canonical content/input digests, the pure deterministic scoring engine,
 * the migration state-machine tables and the stored-record parsers.
 * Policy lives in `service.ts`; persistence in `store.ts`; transport in
 * `router.ts`.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
// The single system-class vocabulary + descriptor-validation authority,
// imported BY VALUE so this module never defines a second one:
import {
  SYSTEM_CLASSES,
  validateAdapterDescriptor,
  type AdapterDescriptor,
  type SystemClass,
} from "../integrations/model";

/* ------------------------------------------------------------------ */
/* Vocabularies (frozen: `as const` types + Object.freeze runtime)      */
/* ------------------------------------------------------------------ */

/**
 * The explicit wire marker for an attribute whose value is NOT known.
 * UNKNOWN is FIRST-CLASS: it contributes an UNKNOWN score component
 * (never zero, never a silent default) and forces null composites.
 */
export const UNKNOWN_MARKER = "UNKNOWN";
export type UnknownMarker = typeof UNKNOWN_MARKER;

/** Inventory resource kinds (adoption-owned vocabulary). */
export const RESOURCE_KINDS = Object.freeze([
  "person",
  "team",
  "equipment",
  "material",
  "software",
  "facility",
] as const);
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** Manual re-entry level of an incumbent step (feeds readiness). */
export const MANUAL_REENTRY_LEVELS = Object.freeze(["none", "light", "heavy"] as const);
export type ManualReentryLevel = (typeof MANUAL_REENTRY_LEVELS)[number];

/** Approval strictness classes (feed friction). */
export const APPROVAL_STRICTNESSES = Object.freeze([
  "none",
  "routine",
  "gated",
  "regulatory",
] as const);
export type ApprovalStrictness = (typeof APPROVAL_STRICTNESSES)[number];

/** Irreversibility levels (feed friction). */
export const IRREVERSIBILITY_LEVELS = Object.freeze([
  "reversible",
  "partially_reversible",
  "irreversible",
] as const);
export type IrreversibilityLevel = (typeof IRREVERSIBILITY_LEVELS)[number];

/** Training-burden levels for the involved roles (feed friction). */
export const TRAINING_BURDEN_LEVELS = Object.freeze(["low", "moderate", "high"] as const);
export type TrainingBurdenLevel = (typeof TRAINING_BURDEN_LEVELS)[number];

/** Latency tolerance classes of the step (feed friction). */
export const LATENCY_CLASSES = Object.freeze([
  "relaxed",
  "batched",
  "interactive",
  "real_time",
] as const);
export type LatencyClass = (typeof LATENCY_CLASSES)[number];

/** Rollback availability of the incumbent step (feeds readiness). */
export const ROLLBACK_AVAILABILITIES = Object.freeze([
  "unavailable",
  "partial",
  "available",
] as const);
export type RollbackAvailability = (typeof ROLLBACK_AVAILABILITIES)[number];

/** Contractual constraint levels on the step's systems (feed friction). */
export const CONTRACTUAL_LEVELS = Object.freeze([
  "none",
  "standard_exit",
  "restricted_exit",
  "locked_in",
] as const);
export type ContractualLevel = (typeof CONTRACTUAL_LEVELS)[number];

/**
 * THE migration state vocabulary (domain model: "MigrationState is
 * progressive and reversible"). `rolled_back` is TERMINAL — re-proposal
 * is a NEW candidate record (append-only discipline).
 */
export const MIGRATION_STATES = Object.freeze([
  "proposed",
  "evaluating",
  "piloted",
  "replaced",
  "rolled_back",
] as const);
export type MigrationState = (typeof MIGRATION_STATES)[number];

/**
 * THE adjacent-advance table: each state's ONE successor (progressive —
 * advancing skips NO states, ever). `replaced` and `rolled_back` have no
 * successor (terminal for advancement; `replaced` may still roll back).
 */
export const ADVANCE_SUCCESSORS: Readonly<Record<MigrationState, MigrationState | null>> =
  Object.freeze({
    proposed: "evaluating",
    evaluating: "piloted",
    piloted: "replaced",
    replaced: null,
    rolled_back: null,
  });

/** The states from which the recorded rollback transition is permitted. */
export const ROLLBACK_ALLOWED_FROM: readonly MigrationState[] = Object.freeze([
  "evaluating",
  "piloted",
  "replaced",
]);

/** May `from` advance to `to`? (adjacent advance only — no skips) */
export function canAdvance(from: MigrationState, to: MigrationState): boolean {
  return ADVANCE_SUCCESSORS[from] === to;
}

/** The per-transition evidence/prerequisite requirements (documented, frozen). */
export interface AdvanceRequirements {
  readonly requiresEquivalenceRecord: boolean;
  readonly requiresAcceptanceRecord: boolean;
  readonly requiresActiveRollbackPlan: boolean;
  readonly requiresEvaluationEvidence: boolean;
  readonly requiresPilotEvidence: boolean;
}

/**
 * THE advance-requirements table, keyed by FROM state (each state has at
 * most one successor). `evaluating` demands the reversibility
 * precondition (an active rollback plan — so EVERY advanced candidate
 * retains one) plus evaluation evidence; `piloted` demands the plan plus
 * PILOT-OUTCOME evidence (friction metrics are only advanced against
 * named pilot evidence); `replaced` demands the equivalence record, the
 * acceptance record AND an active rollback plan (the architecture lock's
 * replacement triple).
 */
export const ADVANCE_REQUIREMENTS: Readonly<Record<MigrationState, AdvanceRequirements>> =
  Object.freeze({
    proposed: {
      requiresEquivalenceRecord: false,
      requiresAcceptanceRecord: false,
      requiresActiveRollbackPlan: true,
      requiresEvaluationEvidence: true,
      requiresPilotEvidence: false,
    },
    evaluating: {
      requiresEquivalenceRecord: false,
      requiresAcceptanceRecord: false,
      requiresActiveRollbackPlan: true,
      requiresEvaluationEvidence: false,
      requiresPilotEvidence: true,
    },
    piloted: {
      requiresEquivalenceRecord: true,
      requiresAcceptanceRecord: true,
      requiresActiveRollbackPlan: true,
      requiresEvaluationEvidence: false,
      requiresPilotEvidence: false,
    },
    replaced: {
      requiresEquivalenceRecord: false,
      requiresAcceptanceRecord: false,
      requiresActiveRollbackPlan: false,
      requiresEvaluationEvidence: false,
      requiresPilotEvidence: false,
    },
    rolled_back: {
      requiresEquivalenceRecord: false,
      requiresAcceptanceRecord: false,
      requiresActiveRollbackPlan: false,
      requiresEvaluationEvidence: false,
      requiresPilotEvidence: false,
    },
  });

/** The audit event vocabulary (append-only record histories). */
export const ADOPTION_EVENT_TYPES = Object.freeze([
  "workflow_recorded",
  "workflow_step_appended",
  "assessment_recorded",
  "candidate_proposed",
  "candidate_advanced",
  "candidate_rolled_back",
  "equivalence_recorded",
  "acceptance_recorded",
  "rollback_plan_recorded",
  "rollback_plan_retired",
] as const);
export type AdoptionEventType = (typeof ADOPTION_EVENT_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Frozen scoring tables (code-defined: changing any value is a         */
/* governed change — see the module header)                             */
/* ------------------------------------------------------------------ */

/** THE readiness weights (documented in the module header; sum = 1). */
export const READINESS_WEIGHTS = Object.freeze({
  connectorCoverage: 0.5,
  manualReEntry: 0.3,
  rollback: 0.2,
} as const);

/** THE friction weights (documented in the module header; sum = 1). */
export const FRICTION_WEIGHTS = Object.freeze({
  approvals: 0.2,
  irreversibility: 0.3,
  trainingBurden: 0.25,
  latency: 0.15,
  contractualConstraints: 0.1,
} as const);

/** Approval strictness → friction severity. */
export const APPROVAL_STRICTNESS_SEVERITY: Readonly<Record<ApprovalStrictness, number>> =
  Object.freeze({ none: 0, routine: 0.3, gated: 0.7, regulatory: 1 } as const);

/** Approval gate-count saturation (factor = min(1, gateCount / N)). */
export const APPROVAL_GATE_SATURATION = 3;

/** Irreversibility → friction severity. */
export const IRREVERSIBILITY_SEVERITY: Readonly<Record<IrreversibilityLevel, number>> =
  Object.freeze({ reversible: 0, partially_reversible: 0.5, irreversible: 1 } as const);

/** Training burden → friction severity. */
export const TRAINING_BURDEN_SEVERITY: Readonly<Record<TrainingBurdenLevel, number>> =
  Object.freeze({ low: 0.15, moderate: 0.5, high: 1 } as const);

/** Latency class → friction severity. */
export const LATENCY_SEVERITY: Readonly<Record<LatencyClass, number>> = Object.freeze({
  relaxed: 0,
  batched: 0.3,
  interactive: 0.65,
  real_time: 1,
} as const);

/** Contractual level → friction severity. */
export const CONTRACTUAL_SEVERITY: Readonly<Record<ContractualLevel, number>> = Object.freeze({
  none: 0,
  standard_exit: 0.3,
  restricted_exit: 0.7,
  locked_in: 1,
} as const);

/** Manual re-entry level → readiness contribution. */
export const MANUAL_REENTRY_READINESS: Readonly<Record<ManualReentryLevel, number>> =
  Object.freeze({ none: 0, light: 0.5, heavy: 1 } as const);

/** Rollback availability → readiness contribution. */
export const ROLLBACK_READINESS: Readonly<Record<RollbackAvailability, number>> = Object.freeze({
  unavailable: 0,
  partial: 0.5,
  available: 1,
} as const);

/** Connector coverage of a step with ZERO known systems of record. */
export const EMPTY_SOR_COVERAGE = 1;

/** Score numbers are rounded to 6 decimals at the scoring boundary. */
function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Deterministic number rendering for derivation text (no float drift). */
function fmt(value: number): string {
  return String(round6(value));
}

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)           */
/* ------------------------------------------------------------------ */

export const ADOPTION_ERROR_CODES = Object.freeze([
  // shape / vocabulary validation (422 at the HTTP boundary)
  "invalid_workflow",
  "invalid_step",
  "invalid_candidate",
  "invalid_assessment",
  "invalid_system_ref",
  "invalid_resource_ref",
  "invalid_roles",
  "invalid_actor",
  "invalid_evidence_ref",
  "invalid_equivalence",
  "invalid_acceptance",
  "invalid_rollback_plan",
  "invalid_advance",
  "invalid_rollback",
  "invalid_retire",
  "unknown_migration_state",
  // semantic invariants (422)
  "workflow_exists",
  "candidate_exists",
  "assessment_exists",
  "step_exists",
  "unknown_workflow",
  "unknown_step",
  "unknown_rollback_plan",
  "workflow_without_steps",
  "adapter_class_mismatch",
  // the migration state machine (422) — the no-false-claims matrix
  "transition_out_of_sequence",
  "transition_from_terminal",
  "equivalence_record_required",
  "acceptance_record_required",
  "rollback_plan_required",
  "evaluation_evidence_required",
  "pilot_evidence_required",
  "equivalence_already_recorded",
  "acceptance_already_recorded",
  "equivalence_state_conflict",
  "acceptance_state_conflict",
  "rollback_plan_state_conflict",
  "rollback_plan_inactive",
  "rollback_plan_still_required",
  // not-found (404)
  "workflow_not_found",
  "candidate_not_found",
  "assessment_not_found",
  "rollback_plan_not_found",
  // identity / path addressing (400)
  "invalid_workflow_id",
  "invalid_candidate_id",
  "invalid_assessment_id",
  "invalid_plan_id",
  // persistence guard (422)
  "invalid_workflow_record",
  "invalid_candidate_record",
  "invalid_assessment_record",
] as const);
export type AdoptionErrorCode = (typeof ADOPTION_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class AdoptionError extends Error {
  readonly code: AdoptionErrorCode;
  readonly detail: string;

  constructor(code: AdoptionErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "AdoptionError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Inventory record types (the typed attribute vocabulary of §041)      */
/* ------------------------------------------------------------------ */

/**
 * One incumbent system-of-record reference: the SHARED system-class
 * vocabulary (the integrations authority's frozen registry — imported by
 * value, never redefined here), an OPAQUE instance id journaled verbatim
 * (never re-keyed, never interpreted), and an OPTIONAL adapterId — an
 * ID-REFERENCE into the integrations adapter registry. This record NEVER
 * embeds incumbent record content: BY ID ONLY (the incumbent authority is
 * never duplicated).
 */
export interface ExternalSystemRef {
  readonly systemClass: SystemClass;
  readonly systemInstanceId: string;
  readonly adapterId?: string;
}

/** One inventoried resource of a step (adoption-owned vocabulary). */
export interface ResourceRef {
  readonly resourceId: string;
  readonly resourceKind: ResourceKind;
  readonly description?: string;
}

/**
 * The approval profile of a step: how many approval gates it passes and
 * the strictness of the strictest gate. Coherence: gateCount 0 ⟺
 * strictness "none" (enforced at parse).
 */
export interface ApprovalProfile {
  readonly gateCount: number;
  readonly strictness: ApprovalStrictness;
}

/** An explicitly-unknown-or-known attribute value (the wire union). */
export type MaybeUnknown<T> = T | UnknownMarker;

/**
 * One incumbent workflow step — a typed INVENTORY record (never a copy
 * of incumbent data). Every §041 attribute class is a REQUIRED field:
 * each is either a known value or the EXPLICIT "UNKNOWN" marker —
 * absence is refused at the boundary (no silent defaults).
 */
export interface WorkflowStep {
  readonly stepId: string;
  readonly name: string;
  readonly description?: string;
  /** Systems of record the step reads/writes — BY-ID references. */
  readonly systemsOfRecord: MaybeUnknown<readonly ExternalSystemRef[]>;
  /** Resources consumed/used by the step (pure inventory; no score feed). */
  readonly resources: MaybeUnknown<readonly ResourceRef[]>;
  /**
   * User-role labels involved in the step (pure inventory; no score
   * feed). Opaque incumbent-side labels journaled verbatim — the
   * identity authority owns AISE-side roles/permissions; these labels
   * never claim identity-authority semantics.
   */
  readonly userRoles: MaybeUnknown<readonly string[]>;
  readonly manualReEntry: MaybeUnknown<ManualReentryLevel>;
  readonly approvals: MaybeUnknown<ApprovalProfile>;
  readonly irreversibility: MaybeUnknown<IrreversibilityLevel>;
  readonly trainingBurden: MaybeUnknown<TrainingBurdenLevel>;
  readonly latency: MaybeUnknown<LatencyClass>;
  readonly rollback: MaybeUnknown<RollbackAvailability>;
  readonly contractualConstraints: MaybeUnknown<ContractualLevel>;
}

/** The incumbent-workflow inventory record (append-only history). */
export interface IncumbentWorkflow {
  readonly workflowId: string;
  /** Opaque tenant label, journaled verbatim (server-authoritative). */
  readonly organizationId: string;
  readonly name: string;
  readonly description?: string;
  readonly steps: readonly WorkflowStep[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly history: readonly AdoptionEvent[];
}

/* ------------------------------------------------------------------ */
/* Migration candidate lifecycle records                                */
/* ------------------------------------------------------------------ */

/**
 * The semantic-equivalence record (domain model: "captures how
 * equivalence was established"). `limits` is a REQUIRED non-empty honest
 * statement of the equivalence claim's LIMITS — an equivalence claim
 * without declared limits is refused at the boundary.
 */
export interface SemanticEquivalenceRecord {
  /** How equivalence between the AISE replacement and the incumbent step was established. */
  readonly establishedHow: string;
  /** NON-EMPTY evidence-id references substantiating the claim. */
  readonly evidenceIds: readonly string[];
  /** REQUIRED honest limits of the equivalence claim. */
  readonly limits: string;
  readonly establishedBy: string;
  readonly establishedAt: string;
}

/** The operational acceptance record (the second `replaced` prerequisite). */
export interface OperationalAcceptanceRecord {
  readonly acceptedBy: string;
  /** NON-EMPTY evidence-id references of the operational acceptance. */
  readonly evidenceIds: readonly string[];
  readonly note: string;
  readonly acceptedAt: string;
}

export const ROLLBACK_PLAN_STATES = Object.freeze(["active", "retired"] as const);
export type RollbackPlanState = (typeof ROLLBACK_PLAN_STATES)[number];

/**
 * One rollback plan (domain model: "RollbackPlan must remain available
 * until operational acceptance"). `restorationSteps` is a NON-EMPTY
 * ordered procedure; retiring a plan is allowed only after operational
 * acceptance (the service refuses earlier with
 * `rollback_plan_still_required`). Retired plans REMAIN in the record —
 * retiring is never deletion.
 */
export interface RollbackPlan {
  readonly planId: string;
  readonly description: string;
  readonly restorationSteps: readonly string[];
  readonly owner: string;
  readonly state: RollbackPlanState;
  readonly recordedBy: string;
  readonly recordedAt: string;
  readonly retiredAt?: string;
  readonly retiredBy?: string;
}

/** The migration candidate record — the governed replacement proposal. */
export interface MigrationCandidate {
  readonly candidateId: string;
  readonly workflowId: string;
  readonly stepId: string;
  /** The proposed AISE-side replacement boundary (what AISE would own). */
  readonly aiseReplacementBoundary: string;
  readonly rationale: string;
  readonly state: MigrationState;
  readonly recordedBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Present once an equivalence record has been attached. */
  readonly equivalence?: SemanticEquivalenceRecord;
  /** Present once an operational acceptance record has been attached. */
  readonly acceptance?: OperationalAcceptanceRecord;
  readonly rollbackPlans: readonly RollbackPlan[];
  /** Evaluation evidence ids (set when the candidate entered `evaluating`). */
  readonly evaluationEvidenceIds?: readonly string[];
  /** Pilot-outcome evidence ids (set when the candidate entered `piloted`). */
  readonly pilotOutcomeEvidenceIds?: readonly string[];
  readonly history: readonly AdoptionEvent[];
}

/* ------------------------------------------------------------------ */
/* Audit events (append-only, provenance-bearing)                       */
/* ------------------------------------------------------------------ */

/**
 * One append-only audit event. Provenance: the actor (opaque principal
 * label), the injected-clock timestamp, the sha-256 content digest of
 * the record AFTER this mutation, and — where the event is a state
 * transition — the transition itself, the rollback plan used and the
 * evidence ids the transition was advanced against.
 */
export interface AdoptionEvent {
  readonly eventId: string;
  readonly eventType: AdoptionEventType;
  readonly occurredAt: string;
  readonly actor: string;
  /** sha-256 of the record content (minus history) at commit. */
  readonly recordDigest: string;
  /** Present iff eventType is a state transition (advance/rollback). */
  readonly transition?: { readonly from: MigrationState; readonly to: MigrationState };
  /** Present iff the event names the rollback plan it used/retired. */
  readonly rollbackPlanId?: string;
  /** Present iff the transition was advanced against named evidence. */
  readonly evidenceIds?: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Scoring types                                                        */
/* ------------------------------------------------------------------ */

/** A KNOWN score component: value in [0,1] + its inspectable derivation. */
export interface KnownScoreComponent {
  readonly kind: "known";
  readonly value: number;
  readonly derivation: string;
}

/** An UNKNOWN score component: never zero, never silently defaulted. */
export interface UnknownScoreComponent {
  readonly kind: "unknown";
  readonly derivation: string;
}

export type ScoreComponent = KnownScoreComponent | UnknownScoreComponent;

/**
 * One score's full breakdown: every named component (inspectable, with
 * its derivation), the frozen weights echoed, the composite (NULL while
 * any component is unknown — the honest uncertainty marker) and the
 * sorted names of the unknown components.
 */
export interface ScoreBreakdown {
  readonly components: Readonly<Record<string, ScoreComponent>>;
  readonly weights: Readonly<Record<string, number>>;
  readonly composite: number | null;
  readonly compositeDerivation: string;
  readonly unknownComponents: readonly string[];
}

/** Per-step profiler output (both scores + the unknown-attribute marker). */
export interface StepAssessment {
  readonly stepId: string;
  readonly readiness: ScoreBreakdown;
  readonly friction: ScoreBreakdown;
  /** readiness − friction when both composites are known; else null. */
  readonly opportunity: number | null;
  readonly opportunityDerivation: string;
  /** The step's UNKNOWN attributes that feed the scores (sorted). */
  readonly unknownAttributes: readonly string[];
}

/** One ranked replacement-opportunity row (rank 1 = most attractive). */
export interface RankedStep {
  readonly rank: number;
  readonly stepId: string;
  readonly opportunity: number | null;
  readonly readinessComposite: number | null;
  readonly frictionComposite: number | null;
  readonly unknownAttributes: readonly string[];
}

/** Workflow-level inventory rollups (always consistent with the rows). */
export interface AdoptionInventoryStats {
  readonly totalSteps: number;
  readonly distinctSystemInstances: number;
  readonly distinctAdapterReferences: number;
  readonly distinctResources: number;
  readonly distinctRoles: number;
  readonly stepsWithUnknownAttributes: number;
  readonly unknownAttributeOccurrences: number;
}

/**
 * One resolved adapter-view entry: the descriptor the registry resolved
 * for a referenced adapterId, or null when the id does not resolve
 * (uncovered). Consumed registry context, carried VERBATIM in the
 * assessment record for auditability — the registry itself is never
 * mutated.
 */
export interface AdapterViewEntry {
  readonly adapterId: string;
  readonly descriptor: AdapterDescriptor | null;
}

/** The pure engine's assembled input state. */
export interface AdoptionAssessmentState {
  readonly assessmentId: string;
  readonly workflow: IncumbentWorkflow;
  /** Sorted by adapterId; one entry per DISTINCT referenced adapterId. */
  readonly adapterView: readonly AdapterViewEntry[];
}

/** The pure engine's output rows before record assembly. */
export interface ComputedAssessment {
  readonly steps: readonly StepAssessment[];
  readonly readiness: ScoreBreakdown;
  readonly friction: ScoreBreakdown;
  readonly inventory: AdoptionInventoryStats;
  readonly rankedSteps: readonly RankedStep[];
}

/**
 * THE derived profiler record (domain model: IntegrationReadinessAssessment):
 * a deterministic function of (workflow inventory, resolved adapter view)
 * plus the injected clock. Write-once, append-only; re-running against
 * newer inputs is a NEW record under a NEW id.
 */
export interface IntegrationReadinessAssessment {
  readonly assessmentId: string;
  readonly workflowId: string;
  /** sha-256 of the assessed workflow's content (minus its history). */
  readonly workflowDigest: string;
  /** The consumed registry view (context, never mutated). */
  readonly adapterView: readonly AdapterViewEntry[];
  readonly steps: readonly StepAssessment[];
  readonly readiness: ScoreBreakdown;
  readonly friction: ScoreBreakdown;
  readonly inventory: AdoptionInventoryStats;
  readonly rankedSteps: readonly RankedStep[];
  /** sha-256 over the canonical JSON of every assessment input. */
  readonly inputDigest: string;
  readonly computedAt: string;
  readonly history: readonly AdoptionEvent[];
}

/* ------------------------------------------------------------------ */
/* Summaries (list projections — never the full records)                */
/* ------------------------------------------------------------------ */

export interface WorkflowSummary {
  readonly workflowId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly stepCount: number;
  readonly distinctSystemInstances: number;
  readonly distinctRoles: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AssessmentSummary {
  readonly assessmentId: string;
  readonly workflowId: string;
  readonly readinessComposite: number | null;
  readonly frictionComposite: number | null;
  readonly unknownAttributesPresent: boolean;
  readonly topOpportunityStepId: string | null;
  readonly computedAt: string;
}

export interface CandidateSummary {
  readonly candidateId: string;
  readonly workflowId: string;
  readonly stepId: string;
  readonly state: MigrationState;
  readonly hasEquivalence: boolean;
  readonly hasAcceptance: boolean;
  readonly activeRollbackPlans: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Pure list projection of one workflow record. */
export function summarizeWorkflow(record: IncumbentWorkflow): WorkflowSummary {
  return {
    workflowId: record.workflowId,
    organizationId: record.organizationId,
    name: record.name,
    stepCount: record.steps.length,
    distinctSystemInstances: distinctSystemInstancesOf(record.steps),
    distinctRoles: distinctRolesOf(record.steps),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Pure list projection of one assessment record. */
export function summarizeAssessment(record: IntegrationReadinessAssessment): AssessmentSummary {
  return {
    assessmentId: record.assessmentId,
    workflowId: record.workflowId,
    readinessComposite: record.readiness.composite,
    frictionComposite: record.friction.composite,
    unknownAttributesPresent: record.steps.some((step) => step.unknownAttributes.length > 0),
    topOpportunityStepId: record.rankedSteps[0]?.stepId ?? null,
    computedAt: record.computedAt,
  };
}

/** Pure list projection of one candidate record. */
export function summarizeCandidate(record: MigrationCandidate): CandidateSummary {
  return {
    candidateId: record.candidateId,
    workflowId: record.workflowId,
    stepId: record.stepId,
    state: record.state,
    hasEquivalence: record.equivalence !== undefined,
    hasAcceptance: record.acceptance !== undefined,
    activeRollbackPlans: record.rollbackPlans.filter((plan) => plan.state === "active").length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Digests                                                              */
/* ------------------------------------------------------------------ */

/**
 * sha-256 over the canonical JSON of the workflow CONTENT (every field
 * except the audit history) — pins what each event committed.
 */
export function workflowContentDigest(record: IncumbentWorkflow): string {
  const { workflowId, organizationId, name, description, steps, createdAt, updatedAt } = record;
  return sha256Hex(
    canonicalJsonStringify({
      workflowId,
      organizationId,
      ...(description === undefined ? {} : { description }),
      name,
      steps,
      createdAt,
      updatedAt,
    }),
  );
}

/** sha-256 over the canonical JSON of the candidate CONTENT (minus history). */
export function candidateContentDigest(record: MigrationCandidate): string {
  const {
    candidateId,
    workflowId,
    stepId,
    aiseReplacementBoundary,
    rationale,
    state,
    recordedBy,
    createdAt,
    updatedAt,
    equivalence,
    acceptance,
    rollbackPlans,
    evaluationEvidenceIds,
    pilotOutcomeEvidenceIds,
  } = record;
  return sha256Hex(
    canonicalJsonStringify({
      candidateId,
      workflowId,
      stepId,
      aiseReplacementBoundary,
      rationale,
      state,
      recordedBy,
      createdAt,
      updatedAt,
      ...(equivalence === undefined ? {} : { equivalence }),
      ...(acceptance === undefined ? {} : { acceptance }),
      rollbackPlans,
      ...(evaluationEvidenceIds === undefined ? {} : { evaluationEvidenceIds }),
      ...(pilotOutcomeEvidenceIds === undefined ? {} : { pilotOutcomeEvidenceIds }),
    }),
  );
}

/** sha-256 over the canonical JSON of the assessment CONTENT (minus history). */
export function assessmentContentDigest(record: IntegrationReadinessAssessment): string {
  const {
    assessmentId,
    workflowId,
    workflowDigest,
    adapterView,
    steps,
    readiness,
    friction,
    inventory,
    rankedSteps,
    inputDigest,
    computedAt,
  } = record;
  return sha256Hex(
    canonicalJsonStringify({
      assessmentId,
      workflowId,
      workflowDigest,
      adapterView,
      steps,
      readiness,
      friction,
      inventory,
      rankedSteps,
      inputDigest,
      computedAt,
    }),
  );
}

/**
 * sha-256 over the canonical JSON of EVERY assessment input (the full
 * workflow record — history included, as the append-only audit trail is
 * part of the pinned input — plus the resolved adapter view). The same
 * inputs always yield the same digest; any perturbation changes it.
 */
export function assessmentInputDigest(input: {
  readonly workflow: IncumbentWorkflow;
  readonly adapterView: readonly AdapterViewEntry[];
}): string {
  return sha256Hex(
    canonicalJsonStringify({
      workflow: input.workflow,
      adapterView: [...input.adapterView].sort((a, b) =>
        a.adapterId < b.adapterId ? -1 : a.adapterId > b.adapterId ? 1 : 0,
      ),
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Shared deterministic helpers                                         */
/* ------------------------------------------------------------------ */

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTENT_ID = /^[0-9a-f]{64}$/;
const EVENT_ID = /^evt-\d{6}$/;

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

function isUnknownMarker(value: unknown): value is UnknownMarker {
  return value === UNKNOWN_MARKER;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Parse + validate one evidence-id array (64-hex content addresses, deduped, sorted). */
function parseEvidenceIds(value: unknown, code: AdoptionErrorCode, where: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AdoptionError(code, `${where} requires a NON-EMPTY evidenceIds array`);
  }
  if (!value.every((entry) => isContentId(entry))) {
    throw new AdoptionError(
      "invalid_evidence_ref",
      `every evidenceId in ${where} must be a 64-hex content address`,
    );
  }
  const ids = [...(value as string[])];
  if (new Set(ids).size !== ids.length) {
    throw new AdoptionError(code, `${where} carries duplicate evidenceIds`);
  }
  return ids.sort(compareStrings);
}

/* ------------------------------------------------------------------ */
/* Boundary id validators                                               */
/* ------------------------------------------------------------------ */

/** workflowId shape (caller-stable opaque identity, 1..256 chars). */
export function validateWorkflowId(workflowId: string): void {
  if (typeof workflowId !== "string" || workflowId.length < 1 || workflowId.length > 256) {
    throw new AdoptionError("invalid_workflow_id", "workflowId must be 1..256 characters");
  }
}

/** candidateId shape (caller-stable opaque identity, 1..256 chars). */
export function validateCandidateId(candidateId: string): void {
  if (typeof candidateId !== "string" || candidateId.length < 1 || candidateId.length > 256) {
    throw new AdoptionError("invalid_candidate_id", "candidateId must be 1..256 characters");
  }
}

/** assessmentId shape (caller-stable opaque identity, 1..256 chars). */
export function validateAssessmentId(assessmentId: string): void {
  if (typeof assessmentId !== "string" || assessmentId.length < 1 || assessmentId.length > 256) {
    throw new AdoptionError("invalid_assessment_id", "assessmentId must be 1..256 characters");
  }
}

/** planId shape (caller-stable opaque identity, 1..256 chars). */
export function validatePlanId(planId: string): void {
  if (typeof planId !== "string" || planId.length < 1 || planId.length > 256) {
    throw new AdoptionError("invalid_plan_id", "planId must be 1..256 characters");
  }
}

/** actor shape (opaque principal label, 1..256 chars, journaled verbatim). */
function requireActor(value: unknown): string {
  if (!boundedString(value, 256)) {
    throw new AdoptionError("invalid_actor", "actor must be a non-empty string of 1..256 characters");
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Boundary input parsers (wire → typed inputs)                         */
/* ------------------------------------------------------------------ */

/** Parse + canonicalize one ExternalSystemRef (BY-ID only, never content). */
function parseSystemRef(value: unknown): ExternalSystemRef {
  if (!isRecord(value)) {
    throw new AdoptionError("invalid_system_ref", "systemsOfRecord entries must be objects");
  }
  const systemClass = value["systemClass"];
  if (
    typeof systemClass !== "string" ||
    !(SYSTEM_CLASSES as readonly string[]).includes(systemClass)
  ) {
    throw new AdoptionError(
      "invalid_system_ref",
      `systemClass must be one of the integrations vocabulary: ${SYSTEM_CLASSES.join(", ")}`,
    );
  }
  const systemInstanceId = value["systemInstanceId"];
  if (!boundedString(systemInstanceId, 256)) {
    throw new AdoptionError(
      "invalid_system_ref",
      "systemInstanceId must be a non-empty string of 1..256 characters (opaque, journaled verbatim)",
    );
  }
  const adapterId = value["adapterId"];
  if (adapterId !== undefined && !boundedString(adapterId, 256)) {
    throw new AdoptionError("invalid_system_ref", "adapterId must be 1..256 characters");
  }
  return {
    systemClass: systemClass as SystemClass,
    systemInstanceId,
    ...(adapterId === undefined ? {} : { adapterId }),
  };
}

/** Parse + canonicalize one ResourceRef. */
function parseResourceRef(value: unknown): ResourceRef {
  if (!isRecord(value)) {
    throw new AdoptionError("invalid_resource_ref", "resources entries must be objects");
  }
  const resourceId = value["resourceId"];
  if (!boundedString(resourceId, 256)) {
    throw new AdoptionError("invalid_resource_ref", "resourceId must be 1..256 characters");
  }
  const resourceKind = value["resourceKind"];
  if (
    typeof resourceKind !== "string" ||
    !(RESOURCE_KINDS as readonly string[]).includes(resourceKind)
  ) {
    throw new AdoptionError(
      "invalid_resource_ref",
      `resourceKind must be one of: ${RESOURCE_KINDS.join(", ")}`,
    );
  }
  const description = value["description"];
  if (description !== undefined && !boundedString(description, 2000)) {
    throw new AdoptionError("invalid_resource_ref", "description must be 1..2000 characters");
  }
  return {
    resourceId,
    resourceKind: resourceKind as ResourceKind,
    ...(description === undefined ? {} : { description }),
  };
}

/**
 * THE step parser: every attribute is REQUIRED and must be a known value
 * or the EXPLICIT "UNKNOWN" marker — absence is a typed refusal (no
 * silent defaults). Reference lists are canonicalized (sorted) so the
 * same inventory yields the same bytes regardless of request order.
 */
export function parseWorkflowStep(value: unknown): WorkflowStep {
  if (!isRecord(value)) {
    throw new AdoptionError("invalid_step", "step must be an object");
  }
  const stepId = value["stepId"];
  if (!boundedString(stepId, 256)) {
    throw new AdoptionError("invalid_step", "stepId must be 1..256 characters");
  }
  const name = value["name"];
  if (!boundedString(name, 256)) {
    throw new AdoptionError("invalid_step", "name must be 1..256 characters");
  }
  const description = value["description"];
  if (description !== undefined && !boundedString(description, 2000)) {
    throw new AdoptionError("invalid_step", "description must be 1..2000 characters");
  }

  const requireAttribute = (key: string): unknown => {
    const attribute = value[key];
    if (attribute === undefined || attribute === null) {
      throw new AdoptionError(
        "invalid_step",
        `attribute "${key}" is required — declare a known value or the explicit "UNKNOWN" marker`,
      );
    }
    return attribute;
  };

  // systemsOfRecord: known array of refs, or the UNKNOWN marker.
  const systemsOfRecordValue = requireAttribute("systemsOfRecord");
  let systemsOfRecord: MaybeUnknown<readonly ExternalSystemRef[]>;
  if (isUnknownMarker(systemsOfRecordValue)) {
    systemsOfRecord = UNKNOWN_MARKER;
  } else {
    if (!Array.isArray(systemsOfRecordValue)) {
      throw new AdoptionError(
        "invalid_system_ref",
        'systemsOfRecord must be an array of refs or the string "UNKNOWN"',
      );
    }
    const refs = systemsOfRecordValue.map(parseSystemRef);
    const seen = new Set<string>();
    for (const ref of refs) {
      const key = `${ref.systemClass}:${ref.systemInstanceId}`;
      if (seen.has(key)) {
        throw new AdoptionError(
          "invalid_system_ref",
          `duplicate systemsOfRecord ref ${key} — one record per system instance per step`,
        );
      }
      seen.add(key);
    }
    systemsOfRecord = refs.sort((a, b) =>
      `${a.systemInstanceId}:${a.systemClass}` < `${b.systemInstanceId}:${b.systemClass}`
        ? -1
        : `${a.systemInstanceId}:${a.systemClass}` > `${b.systemInstanceId}:${b.systemClass}`
          ? 1
          : 0,
    );
  }

  // resources: known array of refs, or the UNKNOWN marker.
  const resourcesValue = requireAttribute("resources");
  let resources: MaybeUnknown<readonly ResourceRef[]>;
  if (isUnknownMarker(resourcesValue)) {
    resources = UNKNOWN_MARKER;
  } else {
    if (!Array.isArray(resourcesValue)) {
      throw new AdoptionError(
        "invalid_resource_ref",
        'resources must be an array of refs or the string "UNKNOWN"',
      );
    }
    const refs = resourcesValue.map(parseResourceRef);
    const seen = new Set<string>();
    for (const ref of refs) {
      if (seen.has(ref.resourceId)) {
        throw new AdoptionError(
          "invalid_resource_ref",
          `duplicate resources ref ${ref.resourceId}`,
        );
      }
      seen.add(ref.resourceId);
    }
    resources = refs.sort((a, b) =>
      `${a.resourceId}:${a.resourceKind}` < `${b.resourceId}:${b.resourceKind}`
        ? -1
        : `${a.resourceId}:${a.resourceKind}` > `${b.resourceId}:${b.resourceKind}`
          ? 1
          : 0,
    );
  }

  // userRoles: known array of opaque labels, or the UNKNOWN marker.
  const rolesValue = requireAttribute("userRoles");
  let userRoles: MaybeUnknown<readonly string[]>;
  if (isUnknownMarker(rolesValue)) {
    userRoles = UNKNOWN_MARKER;
  } else {
    if (!Array.isArray(rolesValue)) {
      throw new AdoptionError(
        "invalid_roles",
        'userRoles must be an array of role labels or the string "UNKNOWN"',
      );
    }
    if (!rolesValue.every((entry) => boundedString(entry, 256))) {
      throw new AdoptionError("invalid_roles", "every userRole must be 1..256 characters");
    }
    const roles = [...(rolesValue as string[])];
    if (new Set(roles).size !== roles.length) {
      throw new AdoptionError("invalid_roles", "userRoles carries duplicate labels");
    }
    userRoles = roles.sort(compareStrings);
  }

  // manualReEntry level.
  const manualReEntryValue = requireAttribute("manualReEntry");
  let manualReEntry: MaybeUnknown<ManualReentryLevel>;
  if (isUnknownMarker(manualReEntryValue)) {
    manualReEntry = UNKNOWN_MARKER;
  } else {
    if (
      typeof manualReEntryValue !== "string" ||
      !(MANUAL_REENTRY_LEVELS as readonly string[]).includes(manualReEntryValue)
    ) {
      throw new AdoptionError(
        "invalid_step",
        `manualReEntry must be one of ${MANUAL_REENTRY_LEVELS.join("|")} or "UNKNOWN"`,
      );
    }
    manualReEntry = manualReEntryValue as ManualReentryLevel;
  }

  // approvals profile (gateCount ⟺ strictness coherence).
  const approvalsValue = requireAttribute("approvals");
  let approvals: MaybeUnknown<ApprovalProfile>;
  if (isUnknownMarker(approvalsValue)) {
    approvals = UNKNOWN_MARKER;
  } else {
    if (!isRecord(approvalsValue)) {
      throw new AdoptionError(
        "invalid_step",
        'approvals must be { gateCount, strictness } or the string "UNKNOWN"',
      );
    }
    const gateCount = approvalsValue["gateCount"];
    if (
      typeof gateCount !== "number" ||
      !Number.isInteger(gateCount) ||
      gateCount < 0 ||
      gateCount > 100
    ) {
      throw new AdoptionError("invalid_step", "approvals.gateCount must be an integer in [0, 100]");
    }
    const strictness = approvalsValue["strictness"];
    if (
      typeof strictness !== "string" ||
      !(APPROVAL_STRICTNESSES as readonly string[]).includes(strictness)
    ) {
      throw new AdoptionError(
        "invalid_step",
        `approvals.strictness must be one of ${APPROVAL_STRICTNESSES.join("|")}`,
      );
    }
    if ((gateCount === 0) !== (strictness === "none")) {
      throw new AdoptionError(
        "invalid_step",
        `approvals coherence: gateCount 0 ⟺ strictness "none" (got gateCount ${gateCount}, strictness ${strictness})`,
      );
    }
    approvals = { gateCount, strictness: strictness as ApprovalStrictness };
  }

  // irreversibility level.
  const irreversibilityValue = requireAttribute("irreversibility");
  let irreversibility: MaybeUnknown<IrreversibilityLevel>;
  if (isUnknownMarker(irreversibilityValue)) {
    irreversibility = UNKNOWN_MARKER;
  } else {
    if (
      typeof irreversibilityValue !== "string" ||
      !(IRREVERSIBILITY_LEVELS as readonly string[]).includes(irreversibilityValue)
    ) {
      throw new AdoptionError(
        "invalid_step",
        `irreversibility must be one of ${IRREVERSIBILITY_LEVELS.join("|")} or "UNKNOWN"`,
      );
    }
    irreversibility = irreversibilityValue as IrreversibilityLevel;
  }

  // trainingBurden level.
  const trainingBurdenValue = requireAttribute("trainingBurden");
  let trainingBurden: MaybeUnknown<TrainingBurdenLevel>;
  if (isUnknownMarker(trainingBurdenValue)) {
    trainingBurden = UNKNOWN_MARKER;
  } else {
    if (
      typeof trainingBurdenValue !== "string" ||
      !(TRAINING_BURDEN_LEVELS as readonly string[]).includes(trainingBurdenValue)
    ) {
      throw new AdoptionError(
        "invalid_step",
        `trainingBurden must be one of ${TRAINING_BURDEN_LEVELS.join("|")} or "UNKNOWN"`,
      );
    }
    trainingBurden = trainingBurdenValue as TrainingBurdenLevel;
  }

  // latency class.
  const latencyValue = requireAttribute("latency");
  let latency: MaybeUnknown<LatencyClass>;
  if (isUnknownMarker(latencyValue)) {
    latency = UNKNOWN_MARKER;
  } else {
    if (
      typeof latencyValue !== "string" ||
      !(LATENCY_CLASSES as readonly string[]).includes(latencyValue)
    ) {
      throw new AdoptionError(
        "invalid_step",
        `latency must be one of ${LATENCY_CLASSES.join("|")} or "UNKNOWN"`,
      );
    }
    latency = latencyValue as LatencyClass;
  }

  // rollback availability.
  const rollbackValue = requireAttribute("rollback");
  let rollback: MaybeUnknown<RollbackAvailability>;
  if (isUnknownMarker(rollbackValue)) {
    rollback = UNKNOWN_MARKER;
  } else {
    if (
      typeof rollbackValue !== "string" ||
      !(ROLLBACK_AVAILABILITIES as readonly string[]).includes(rollbackValue)
    ) {
      throw new AdoptionError(
        "invalid_step",
        `rollback must be one of ${ROLLBACK_AVAILABILITIES.join("|")} or "UNKNOWN"`,
      );
    }
    rollback = rollbackValue as RollbackAvailability;
  }

  // contractualConstraints level.
  const contractualValue = requireAttribute("contractualConstraints");
  let contractualConstraints: MaybeUnknown<ContractualLevel>;
  if (isUnknownMarker(contractualValue)) {
    contractualConstraints = UNKNOWN_MARKER;
  } else {
    if (
      typeof contractualValue !== "string" ||
      !(CONTRACTUAL_LEVELS as readonly string[]).includes(contractualValue)
    ) {
      throw new AdoptionError(
        "invalid_step",
        `contractualConstraints must be one of ${CONTRACTUAL_LEVELS.join("|")} or "UNKNOWN"`,
      );
    }
    contractualConstraints = contractualValue as ContractualLevel;
  }

  return {
    stepId,
    name,
    ...(description === undefined ? {} : { description }),
    systemsOfRecord,
    resources,
    userRoles,
    manualReEntry,
    approvals,
    irreversibility,
    trainingBurden,
    latency,
    rollback,
    contractualConstraints,
  };
}

/** The create-workflow boundary input. */
export interface CreateWorkflowInput {
  readonly workflowId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description?: string;
  readonly steps: readonly WorkflowStep[];
  readonly actor: string;
}

export function parseCreateWorkflowInput(payload: unknown): CreateWorkflowInput {
  if (!isRecord(payload)) {
    throw new AdoptionError("invalid_workflow", "workflow payload must be an object");
  }
  const workflowId = payload["workflowId"];
  if (!boundedString(workflowId, 256)) {
    throw new AdoptionError("invalid_workflow", "workflowId must be 1..256 characters");
  }
  const organizationId = payload["organizationId"];
  if (!boundedString(organizationId, 256)) {
    throw new AdoptionError(
      "invalid_workflow",
      "organizationId must be 1..256 characters (opaque, journaled verbatim)",
    );
  }
  const name = payload["name"];
  if (!boundedString(name, 256)) {
    throw new AdoptionError("invalid_workflow", "name must be 1..256 characters");
  }
  const description = payload["description"];
  if (description !== undefined && !boundedString(description, 2000)) {
    throw new AdoptionError("invalid_workflow", "description must be 1..2000 characters");
  }
  const stepsValue = payload["steps"];
  if (!Array.isArray(stepsValue)) {
    throw new AdoptionError("invalid_workflow", "steps must be an array (possibly empty)");
  }
  const steps = stepsValue.map(parseWorkflowStep);
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.stepId)) {
      throw new AdoptionError(
        "invalid_workflow",
        `duplicate stepId "${step.stepId}" — step ids are unique within a workflow`,
      );
    }
    seen.add(step.stepId);
  }
  const actor = requireActor(payload["actor"]);
  return {
    workflowId,
    organizationId,
    name,
    ...(description === undefined ? {} : { description }),
    steps,
    actor,
  };
}

/** The append-step boundary input (steps are appended, never removed). */
export interface AppendStepInput {
  readonly step: WorkflowStep;
  readonly actor: string;
}

export function parseAppendStepInput(payload: unknown): AppendStepInput {
  if (!isRecord(payload)) {
    throw new AdoptionError("invalid_step", "append-step payload must be an object");
  }
  const step = parseWorkflowStep(payload["step"]);
  const actor = requireActor(payload["actor"]);
  return { step, actor };
}

/** The run-assessment boundary input. */
export interface RunAssessmentInput {
  readonly assessmentId: string;
  readonly actor: string;
}

export function parseRunAssessmentInput(payload: unknown): RunAssessmentInput {
  if (!isRecord(payload)) {
    throw new AdoptionError("invalid_assessment", "assessment payload must be an object");
  }
  const assessmentId = payload["assessmentId"];
  if (!boundedString(assessmentId, 256)) {
    throw new AdoptionError("invalid_assessment", "assessmentId must be 1..256 characters");
  }
  const actor = requireActor(payload["actor"]);
  return { assessmentId, actor };
}

/** The create-candidate boundary input. */
export interface CreateCandidateInput {
  readonly candidateId: string;
  readonly workflowId: string;
  readonly stepId: string;
  readonly aiseReplacementBoundary: string;
  readonly rationale: string;
  readonly actor: string;
}

export function parseCreateCandidateInput(payload: unknown): CreateCandidateInput {
  if (!isRecord(payload)) {
    throw new AdoptionError("invalid_candidate", "candidate payload must be an object");
  }
  const candidateId = payload["candidateId"];
  if (!boundedString(candidateId, 256)) {
    throw new AdoptionError("invalid_candidate", "candidateId must be 1..256 characters");
  }
  const workflowId = payload["workflowId"];
  if (!boundedString(workflowId, 256)) {
    throw new AdoptionError("invalid_candidate", "workflowId must be 1..256 characters");
  }
  const stepId = payload["stepId"];
  if (!boundedString(stepId, 256)) {
    throw new AdoptionError("invalid_candidate", "stepId must be 1..256 characters");
  }
  const aiseReplacementBoundary = payload["aiseReplacementBoundary"];
  if (!boundedString(aiseReplacementBoundary, 2000)) {
    throw new AdoptionError(
      "invalid_candidate",
      "aiseReplacementBoundary must be 1..2000 characters — the proposed AISE-side boundary",
    );
  }
  const rationale = payload["rationale"];
  if (!boundedString(rationale, 2000)) {
    throw new AdoptionError("invalid_candidate", "rationale must be 1..2000 characters");
  }
  const actor = requireActor(payload["actor"]);
  return { candidateId, workflowId, stepId, aiseReplacementBoundary, rationale, actor };
}

/** The record-equivalence boundary input. */
export interface RecordEquivalenceInput {
  readonly establishedHow: string;
  readonly evidenceIds: readonly string[];
  readonly limits: string;
  readonly actor: string;
}

export function parseRecordEquivalenceInput(payload: unknown): RecordEquivalenceInput {
  if (!isRecord(payload)) {
    throw new AdoptionError("invalid_equivalence", "equivalence payload must be an object");
  }
  const establishedHow = payload["establishedHow"];
  if (!boundedString(establishedHow, 2000)) {
    throw new AdoptionError(
      "invalid_equivalence",
      "establishedHow must be 1..2000 characters — how equivalence was established",
    );
  }
  const evidenceIds = parseEvidenceIds(
    payload["evidenceIds"],
    "invalid_equivalence",
    "equivalence record",
  );
  const limits = payload["limits"];
  if (!boundedString(limits, 2000)) {
    throw new AdoptionError(
      "invalid_equivalence",
      "limits must be 1..2000 characters — an equivalence claim without declared limits is refused",
    );
  }
  const actor = requireActor(payload["actor"]);
  return { establishedHow, evidenceIds, limits, actor };
}

/** The record-acceptance boundary input. */
export interface RecordAcceptanceInput {
  readonly evidenceIds: readonly string[];
  readonly note: string;
  readonly actor: string;
}

export function parseRecordAcceptanceInput(payload: unknown): RecordAcceptanceInput {
  if (!isRecord(payload)) {
    throw new AdoptionError("invalid_acceptance", "acceptance payload must be an object");
  }
  const evidenceIds = parseEvidenceIds(
    payload["evidenceIds"],
    "invalid_acceptance",
    "acceptance record",
  );
  const note = payload["note"];
  if (!boundedString(note, 2000)) {
    throw new AdoptionError("invalid_acceptance", "note must be 1..2000 characters");
  }
  const actor = requireActor(payload["actor"]);
  return { evidenceIds, note, actor };
}

/** The record-rollback-plan boundary input. */
export interface RecordRollbackPlanInput {
  readonly planId: string;
  readonly description: string;
  readonly restorationSteps: readonly string[];
  readonly owner: string;
  readonly actor: string;
}

export function parseRecordRollbackPlanInput(payload: unknown): RecordRollbackPlanInput {
  if (!isRecord(payload)) {
    throw new AdoptionError("invalid_rollback_plan", "rollback-plan payload must be an object");
  }
  const planId = payload["planId"];
  if (!boundedString(planId, 256)) {
    throw new AdoptionError("invalid_rollback_plan", "planId must be 1..256 characters");
  }
  const description = payload["description"];
  if (!boundedString(description, 2000)) {
    throw new AdoptionError("invalid_rollback_plan", "description must be 1..2000 characters");
  }
  const restorationStepsValue = payload["restorationSteps"];
  if (
    !Array.isArray(restorationStepsValue) ||
    restorationStepsValue.length === 0 ||
    !restorationStepsValue.every((entry) => boundedString(entry, 2000))
  ) {
    throw new AdoptionError(
      "invalid_rollback_plan",
      "restorationSteps must be a NON-EMPTY array of 1..2000-character steps",
    );
  }
  const owner = payload["owner"];
  if (!boundedString(owner, 256)) {
    throw new AdoptionError("invalid_rollback_plan", "owner must be 1..256 characters");
  }
  const actor = requireActor(payload["actor"]);
  return {
    planId,
    description,
    restorationSteps: [...(restorationStepsValue as string[])],
    owner,
    actor,
  };
}

/** The advance-candidate boundary input (the governed transition). */
export interface AdvanceCandidateInput {
  readonly to: MigrationState;
  readonly evidenceIds: readonly string[];
  readonly actor: string;
}

export function parseAdvanceCandidateInput(payload: unknown): AdvanceCandidateInput {
  if (!isRecord(payload)) {
    throw new AdoptionError("invalid_advance", "advance payload must be an object");
  }
  const to = payload["to"];
  if (typeof to !== "string" || !(MIGRATION_STATES as readonly string[]).includes(to)) {
    throw new AdoptionError(
      "unknown_migration_state",
      `to must be one of ${MIGRATION_STATES.join("|")}`,
    );
  }
  const evidenceValue = payload["evidenceIds"];
  let evidenceIds: string[] = [];
  if (evidenceValue !== undefined && evidenceValue !== null) {
    if (!Array.isArray(evidenceValue)) {
      throw new AdoptionError("invalid_advance", "evidenceIds must be an array");
    }
    evidenceIds = parseEvidenceIds(evidenceValue, "invalid_advance", "advance request");
  }
  const actor = requireActor(payload["actor"]);
  return { to: to as MigrationState, evidenceIds, actor };
}

/** The rollback-candidate boundary input (the recorded reverse transition). */
export interface RollbackCandidateInput {
  readonly actor: string;
  readonly note?: string;
  readonly planId?: string;
}

export function parseRollbackCandidateInput(payload: unknown): RollbackCandidateInput {
  if (!isRecord(payload)) {
    throw new AdoptionError("invalid_rollback", "rollback payload must be an object");
  }
  const note = payload["note"];
  if (note !== undefined && note !== null && !boundedString(note, 2000)) {
    throw new AdoptionError("invalid_rollback", "note must be 1..2000 characters");
  }
  const planId = payload["planId"];
  if (planId !== undefined && planId !== null && !boundedString(planId, 256)) {
    throw new AdoptionError("invalid_rollback", "planId must be 1..256 characters");
  }
  const actor = requireActor(payload["actor"]);
  return {
    actor,
    ...(note === undefined || note === null ? {} : { note }),
    ...(planId === undefined || planId === null ? {} : { planId }),
  };
}

/** The retire-rollback-plan boundary input. */
export interface RetireRollbackPlanInput {
  readonly actor: string;
}

export function parseRetireRollbackPlanInput(payload: unknown): RetireRollbackPlanInput {
  if (!isRecord(payload)) {
    throw new AdoptionError("invalid_retire", "retire payload must be an object");
  }
  const actor = requireActor(payload["actor"]);
  return { actor };
}

/* ------------------------------------------------------------------ */
/* The pure deterministic scoring engine                                */
/* ------------------------------------------------------------------ */

function distinctSystemInstancesOf(steps: readonly WorkflowStep[]): number {
  const ids = new Set<string>();
  for (const step of steps) {
    if (step.systemsOfRecord === UNKNOWN_MARKER) {
      continue;
    }
    for (const ref of step.systemsOfRecord) {
      ids.add(ref.systemInstanceId);
    }
  }
  return ids.size;
}

function distinctAdapterReferencesOf(steps: readonly WorkflowStep[]): number {
  const ids = new Set<string>();
  for (const step of steps) {
    if (step.systemsOfRecord === UNKNOWN_MARKER) {
      continue;
    }
    for (const ref of step.systemsOfRecord) {
      if (ref.adapterId !== undefined) {
        ids.add(ref.adapterId);
      }
    }
  }
  return ids.size;
}

function distinctResourcesOf(steps: readonly WorkflowStep[]): number {
  const ids = new Set<string>();
  for (const step of steps) {
    if (step.resources === UNKNOWN_MARKER) {
      continue;
    }
    for (const ref of step.resources) {
      ids.add(ref.resourceId);
    }
  }
  return ids.size;
}

function distinctRolesOf(steps: readonly WorkflowStep[]): number {
  const labels = new Set<string>();
  for (const step of steps) {
    if (step.userRoles === UNKNOWN_MARKER) {
      continue;
    }
    for (const role of step.userRoles) {
      labels.add(role);
    }
  }
  return labels.size;
}

/** The score-relevant attribute keys of a step (UNKNOWN over these feeds the scores). */
const SCORE_RELEVANT_ATTRIBUTES: readonly (keyof WorkflowStep)[] = [
  "systemsOfRecord",
  "manualReEntry",
  "rollback",
  "approvals",
  "irreversibility",
  "trainingBurden",
  "latency",
  "contractualConstraints",
];

/** All ten §041 inventory attributes (unknown-attribute counting covers these). */
const INVENTORY_ATTRIBUTES: readonly (keyof WorkflowStep)[] = [
  ...SCORE_RELEVANT_ATTRIBUTES,
  "resources",
  "userRoles",
];

/** The step's UNKNOWN score-relevant attribute keys, sorted. */
function unknownScoreAttributesOf(step: WorkflowStep): string[] {
  return SCORE_RELEVANT_ATTRIBUTES.filter(
    (key) => (step[key] as unknown) === UNKNOWN_MARKER,
  ).sort(compareStrings) as string[];
}

/** The step's UNKNOWN inventory attribute keys (all ten), sorted. */
function unknownInventoryAttributesOf(step: WorkflowStep): string[] {
  return INVENTORY_ATTRIBUTES.filter(
    (key) => (step[key] as unknown) === UNKNOWN_MARKER,
  ).sort(compareStrings) as string[];
}

interface ComponentAccumulator {
  readonly name: string;
  readonly weight: number;
  values: number[];
  unknownSteps: string[];
  derivationTemplate: string;
}

/**
 * Assemble one workflow-level ScoreBreakdown from the per-step rows:
 * each component is the arithmetic MEAN of the per-step known values (in
 * step order — the derivation lists every step value); a component is
 * UNKNOWN iff ANY contributing step attribute is UNKNOWN (the unknown
 * step ids are named); the composite is null while any component is
 * unknown (the honest uncertainty marker).
 */
function aggregateComponents(
  scoreName: string,
  componentNames: readonly string[],
  weights: Readonly<Record<string, number>>,
  steps: readonly StepAssessment[],
): ScoreBreakdown {
  const components: Record<string, ScoreComponent> = {};
  const unknownComponents: string[] = [];
  for (const name of componentNames) {
    const values: number[] = [];
    const unknownSteps: string[] = [];
    for (const step of steps) {
      const component = step.readiness.components[name] ?? step.friction.components[name];
      if (component === undefined) {
        continue;
      }
      if (component.kind === "known") {
        values.push(component.value);
      } else {
        unknownSteps.push(step.stepId);
      }
    }
    if (unknownSteps.length > 0) {
      unknownComponents.push(name);
      components[name] = {
        kind: "unknown",
        derivation:
          `attribute is UNKNOWN on ${unknownSteps.length} of the workflow's step(s) ` +
          `(${unknownSteps.sort(compareStrings).join(", ")}) — never defaulted to zero`,
      };
    } else {
      const total = values.reduce((sum, value) => sum + value, 0);
      const mean = round6(values.length === 0 ? 0 : total / values.length);
      components[name] = {
        kind: "known",
        value: mean,
        derivation: `mean over ${values.length} step(s) [${values.map(fmt).join(", ")}] = ${fmt(mean)}`,
      };
    }
  }
  unknownComponents.sort(compareStrings);
  let composite: number | null = null;
  let compositeDerivation: string;
  if (unknownComponents.length > 0) {
    compositeDerivation =
      `NOT COMPUTED — unknown components: ${unknownComponents.join(", ")} ` +
      `(an aggregate ${scoreName} number would fabricate certainty; complete the inventory and re-assess)`;
  } else {
    composite = round6(
      componentNames.reduce(
        (sum, name) => sum + (weights[name] ?? 0) * (components[name] as KnownScoreComponent).value,
        0,
      ),
    );
    compositeDerivation = `${componentNames
      .map((name) => `${weights[name] ?? 0}·${fmt((components[name] as KnownScoreComponent).value)}`)
      .join(" + ")} = ${fmt(composite)}`;
  }
  return {
    components,
    weights: Object.fromEntries(componentNames.map((name) => [name, weights[name] as number])),
    composite,
    compositeDerivation,
    unknownComponents,
  };
}

/**
 * THE pure deterministic scoring engine: per-step readiness + friction,
 * workflow-level aggregates, inventory rollups and the replacement-
 * opportunity ranking. Pure over (workflow steps, adapter view): the
 * same inputs always yield byte-identical outputs.
 */
export function computeAdoptionAssessment(state: AdoptionAssessmentState): ComputedAssessment {
  const adapterBy = new Map(state.adapterView.map((entry) => [entry.adapterId, entry.descriptor]));
  const steps: StepAssessment[] = state.workflow.steps.map((step) => {
    /* readiness ------------------------------------------------------ */
    const readinessAccs: ComponentAccumulator[] = [];

    // connectorCoverage
    if (step.systemsOfRecord === UNKNOWN_MARKER) {
      readinessAccs.push({
        name: "connectorCoverage",
        weight: READINESS_WEIGHTS.connectorCoverage,
        values: [],
        unknownSteps: [step.stepId],
        derivationTemplate: "",
      });
    } else if (step.systemsOfRecord.length === 0) {
      readinessAccs.push({
        name: "connectorCoverage",
        weight: READINESS_WEIGHTS.connectorCoverage,
        values: [EMPTY_SOR_COVERAGE],
        unknownSteps: [],
        derivationTemplate: `no external systems of record — no connector barrier (coverage ${EMPTY_SOR_COVERAGE} by convention)`,
      });
    } else {
      const covered: string[] = [];
      const uncovered: string[] = [];
      for (const ref of step.systemsOfRecord) {
        if (ref.adapterId !== undefined && adapterBy.get(ref.adapterId) != null) {
          covered.push(`${ref.systemInstanceId}→${ref.adapterId}`);
        } else if (ref.adapterId !== undefined) {
          uncovered.push(`${ref.systemInstanceId}→${ref.adapterId} (adapterId not registered)`);
        } else {
          uncovered.push(`${ref.systemInstanceId} (no adapterId)`);
        }
      }
      readinessAccs.push({
        name: "connectorCoverage",
        weight: READINESS_WEIGHTS.connectorCoverage,
        values: [round6(covered.length / step.systemsOfRecord.length)],
        unknownSteps: [],
        derivationTemplate: `covered ${covered.length}/${step.systemsOfRecord.length} refs [${covered.join(", ")}]; uncovered: ${uncovered.join(", ")}`,
      });
    }

    // manualReEntry
    readinessAccs.push({
      name: "manualReEntry",
      weight: READINESS_WEIGHTS.manualReEntry,
      values:
        step.manualReEntry === UNKNOWN_MARKER
          ? []
          : [MANUAL_REENTRY_READINESS[step.manualReEntry]],
      unknownSteps: step.manualReEntry === UNKNOWN_MARKER ? [step.stepId] : [],
      derivationTemplate: "",
    });

    // rollback
    readinessAccs.push({
      name: "rollback",
      weight: READINESS_WEIGHTS.rollback,
      values: step.rollback === UNKNOWN_MARKER ? [] : [ROLLBACK_READINESS[step.rollback]],
      unknownSteps: step.rollback === UNKNOWN_MARKER ? [step.stepId] : [],
      derivationTemplate: "",
    });

    /* friction ------------------------------------------------------- */
    const frictionAccs: ComponentAccumulator[] = [];

    // approvals
    if (step.approvals === UNKNOWN_MARKER) {
      frictionAccs.push({
        name: "approvals",
        weight: FRICTION_WEIGHTS.approvals,
        values: [],
        unknownSteps: [step.stepId],
        derivationTemplate: "",
      });
    } else {
      const severity = APPROVAL_STRICTNESS_SEVERITY[step.approvals.strictness];
      const gateFactor = Math.min(1, step.approvals.gateCount / APPROVAL_GATE_SATURATION);
      const value = round6(severity * gateFactor);
      frictionAccs.push({
        name: "approvals",
        weight: FRICTION_WEIGHTS.approvals,
        values: [value],
        unknownSteps: [],
        derivationTemplate: `strictness ${step.approvals.strictness} (severity ${severity}) × gate factor min(1, ${step.approvals.gateCount}/${APPROVAL_GATE_SATURATION}) = ${fmt(value)}`,
      });
    }

    // irreversibility / trainingBurden / latency / contractualConstraints
    frictionAccs.push({
      name: "irreversibility",
      weight: FRICTION_WEIGHTS.irreversibility,
      values:
        step.irreversibility === UNKNOWN_MARKER
          ? []
          : [IRREVERSIBILITY_SEVERITY[step.irreversibility]],
      unknownSteps: step.irreversibility === UNKNOWN_MARKER ? [step.stepId] : [],
      derivationTemplate: "",
    });
    frictionAccs.push({
      name: "trainingBurden",
      weight: FRICTION_WEIGHTS.trainingBurden,
      values:
        step.trainingBurden === UNKNOWN_MARKER
          ? []
          : [TRAINING_BURDEN_SEVERITY[step.trainingBurden]],
      unknownSteps: step.trainingBurden === UNKNOWN_MARKER ? [step.stepId] : [],
      derivationTemplate: "",
    });
    frictionAccs.push({
      name: "latency",
      weight: FRICTION_WEIGHTS.latency,
      values: step.latency === UNKNOWN_MARKER ? [] : [LATENCY_SEVERITY[step.latency]],
      unknownSteps: step.latency === UNKNOWN_MARKER ? [step.stepId] : [],
      derivationTemplate: "",
    });
    frictionAccs.push({
      name: "contractualConstraints",
      weight: FRICTION_WEIGHTS.contractualConstraints,
      values:
        step.contractualConstraints === UNKNOWN_MARKER
          ? []
          : [CONTRACTUAL_SEVERITY[step.contractualConstraints]],
      unknownSteps: step.contractualConstraints === UNKNOWN_MARKER ? [step.stepId] : [],
      derivationTemplate: "",
    });

    /* per-step breakdowns -------------------------------------------- */
    const readiness = perStepBreakdown("readiness", step, readinessAccs);
    const friction = perStepBreakdown("friction", step, frictionAccs);
    const unknownAttributes = unknownScoreAttributesOf(step);
    let opportunity: number | null = null;
    let opportunityDerivation: string;
    if (readiness.composite !== null && friction.composite !== null) {
      opportunity = round6(readiness.composite - friction.composite);
      opportunityDerivation = `readiness ${fmt(readiness.composite)} − friction ${fmt(friction.composite)} = ${fmt(opportunity)}`;
    } else {
      opportunityDerivation =
        "not computed — the step carries UNKNOWN score attributes; complete the inventory before ranking";
    }
    return {
      stepId: step.stepId,
      readiness,
      friction,
      opportunity,
      opportunityDerivation,
      unknownAttributes,
    };
  });

  /* workflow-level aggregates ---------------------------------------- */
  const readiness = aggregateComponents("readiness", READINESS_COMPONENT_NAMES, READINESS_WEIGHTS, steps);
  const friction = aggregateComponents("friction", FRICTION_COMPONENT_NAMES, FRICTION_WEIGHTS, steps);

  /* inventory rollups ------------------------------------------------ */
  const allSteps = state.workflow.steps;
  const inventory: AdoptionInventoryStats = {
    totalSteps: allSteps.length,
    distinctSystemInstances: distinctSystemInstancesOf(allSteps),
    distinctAdapterReferences: distinctAdapterReferencesOf(allSteps),
    distinctResources: distinctResourcesOf(allSteps),
    distinctRoles: distinctRolesOf(allSteps),
    stepsWithUnknownAttributes: allSteps.filter(
      (step) => unknownInventoryAttributesOf(step).length > 0,
    ).length,
    unknownAttributeOccurrences: allSteps.reduce(
      (sum, step) => sum + unknownInventoryAttributesOf(step).length,
      0,
    ),
  };

  /* the replacement-opportunity ranking ------------------------------ */
  const ranked = [...steps]
    .sort((a, b) => {
      // opportunity DESC with nulls LAST, then stepId ASC (stable total order).
      if (a.opportunity === null && b.opportunity === null) {
        return compareStrings(a.stepId, b.stepId);
      }
      if (a.opportunity === null) {
        return 1;
      }
      if (b.opportunity === null) {
        return -1;
      }
      if (a.opportunity !== b.opportunity) {
        return b.opportunity - a.opportunity;
      }
      return compareStrings(a.stepId, b.stepId);
    })
    .map((step, index) => ({
      rank: index + 1,
      stepId: step.stepId,
      opportunity: step.opportunity,
      readinessComposite: step.readiness.composite,
      frictionComposite: step.friction.composite,
      unknownAttributes: [...step.unknownAttributes],
    }));

  return { steps, readiness, friction, inventory, rankedSteps: ranked };
}

/** Assemble ONE step's ScoreBreakdown (single-value components). */
function perStepBreakdown(
  scoreName: string,
  step: WorkflowStep,
  accumulators: readonly ComponentAccumulator[],
): ScoreBreakdown {
  const components: Record<string, ScoreComponent> = {};
  const unknownComponents: string[] = [];
  const knownValues: { name: string; weight: number; value: number }[] = [];
  for (const acc of accumulators) {
    if (acc.unknownSteps.length > 0) {
      unknownComponents.push(acc.name);
      components[acc.name] = {
        kind: "unknown",
        derivation: `attribute is UNKNOWN on step ${step.stepId} — never defaulted to zero`,
      };
    } else {
      const value = acc.values[0] ?? 0;
      components[acc.name] = {
        kind: "known",
        value,
        derivation:
          acc.derivationTemplate !== ""
            ? acc.derivationTemplate
            : defaultLevelDerivation(acc.name, step),
      };
      knownValues.push({ name: acc.name, weight: acc.weight, value });
    }
  }
  unknownComponents.sort(compareStrings);
  let composite: number | null = null;
  let compositeDerivation: string;
  if (unknownComponents.length > 0) {
    compositeDerivation =
      `NOT COMPUTED — unknown components: ${unknownComponents.join(", ")} ` +
      `(an aggregate ${scoreName} number would fabricate certainty; declare the UNKNOWN attributes and re-assess)`;
  } else {
    composite = round6(
      knownValues.reduce((sum, entry) => sum + entry.weight * entry.value, 0),
    );
    compositeDerivation = `${knownValues
      .map((entry) => `${entry.weight}·${fmt(entry.value)}`)
      .join(" + ")} = ${fmt(composite)}`;
  }
  return {
    components,
    weights: Object.fromEntries(accumulators.map((acc) => [acc.name, acc.weight])),
    composite,
    compositeDerivation,
    unknownComponents,
  };
}

/** Deterministic level derivation text for the table-driven components. */
function defaultLevelDerivation(name: string, step: WorkflowStep): string {
  switch (name) {
    case "manualReEntry":
      return `level ${step.manualReEntry} → readiness contribution ${fmt(MANUAL_REENTRY_READINESS[step.manualReEntry as ManualReentryLevel])} (incumbent re-entry pain is what an integrated replacement removes)`;
    case "rollback":
      return `level ${step.rollback} → readiness contribution ${fmt(ROLLBACK_READINESS[step.rollback as RollbackAvailability])} (rollback headroom enables low-risk pilot switching)`;
    case "irreversibility":
      return `level ${step.irreversibility} → severity ${fmt(IRREVERSIBILITY_SEVERITY[step.irreversibility as IrreversibilityLevel])}`;
    case "trainingBurden":
      return `level ${step.trainingBurden} → severity ${fmt(TRAINING_BURDEN_SEVERITY[step.trainingBurden as TrainingBurdenLevel])}`;
    case "latency":
      return `class ${step.latency} → severity ${fmt(LATENCY_SEVERITY[step.latency as LatencyClass])}`;
    case "contractualConstraints":
      return `level ${step.contractualConstraints} → severity ${fmt(CONTRACTUAL_SEVERITY[step.contractualConstraints as ContractualLevel])}`;
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ */
/* Stored-record parsers (store reads; garbage is a typed rejection)    */
/* ------------------------------------------------------------------ */

function invalidRecord(code: AdoptionErrorCode, detail: string): AdoptionError {
  return new AdoptionError(code, detail);
}

/** Parse one stored audit event with per-event-type provenance shape checks. */
function parseStoredEvent(
  value: unknown,
  recordKind: "workflow" | "candidate" | "assessment",
): AdoptionEvent {
  const code: AdoptionErrorCode =
    recordKind === "workflow"
      ? "invalid_workflow_record"
      : recordKind === "candidate"
        ? "invalid_candidate_record"
        : "invalid_assessment_record";
  if (!isRecord(value)) throw invalidRecord(code, "history entry is not an object");
  const eventId = value["eventId"];
  if (typeof eventId !== "string" || !EVENT_ID.test(eventId)) {
    throw invalidRecord(code, "history.eventId must be evt-NNNNNN");
  }
  const eventType = value["eventType"];
  if (
    typeof eventType !== "string" ||
    !(ADOPTION_EVENT_TYPES as readonly string[]).includes(eventType)
  ) {
    throw invalidRecord(code, "history.eventType is not in the adoption event vocabulary");
  }
  if (typeof value["occurredAt"] !== "string" || !ISO_UTC.test(value["occurredAt"])) {
    throw invalidRecord(code, "history.occurredAt must be an ISO-UTC timestamp");
  }
  if (!boundedString(value["actor"], 256)) {
    throw invalidRecord(code, "history.actor must be 1..256 characters (provenance)");
  }
  if (!isContentId(value["recordDigest"])) {
    throw invalidRecord(code, "history.recordDigest must be a 64-hex digest");
  }
  const event: AdoptionEvent = {
    eventId,
    eventType: eventType as AdoptionEventType,
    occurredAt: value["occurredAt"] as string,
    actor: value["actor"] as string,
    recordDigest: value["recordDigest"] as string,
  };
  const withExtras: {
    eventId: string;
    eventType: AdoptionEventType;
    occurredAt: string;
    actor: string;
    recordDigest: string;
    transition?: { from: MigrationState; to: MigrationState };
    rollbackPlanId?: string;
    evidenceIds?: readonly string[];
  } = { ...event };

  // transition shape: required on advance/rollback events, forbidden else.
  const transitionValue = value["transition"];
  const isTransitionEvent =
    eventType === "candidate_advanced" || eventType === "candidate_rolled_back";
  if (isTransitionEvent) {
    if (!isRecord(transitionValue)) {
      throw invalidRecord(code, `${eventType} events must carry a { from, to } transition`);
    }
    const from = transitionValue["from"];
    const to = transitionValue["to"];
    if (
      typeof from !== "string" ||
      typeof to !== "string" ||
      !(MIGRATION_STATES as readonly string[]).includes(from) ||
      !(MIGRATION_STATES as readonly string[]).includes(to)
    ) {
      throw invalidRecord(code, "event.transition states must be migration-state vocabulary members");
    }
    withExtras.transition = { from: from as MigrationState, to: to as MigrationState };
  } else if (transitionValue !== undefined) {
    throw invalidRecord(code, `only transition events carry a transition (got ${eventType})`);
  }

  // rollbackPlanId shape: required on plan-naming events, forbidden else.
  const rollbackPlanId = value["rollbackPlanId"];
  const namesPlan =
    eventType === "candidate_rolled_back" ||
    eventType === "rollback_plan_retired" ||
    eventType === "rollback_plan_recorded";
  if (namesPlan) {
    if (!boundedString(rollbackPlanId, 256)) {
      throw invalidRecord(code, `${eventType} events must name the rollback plan id`);
    }
    withExtras.rollbackPlanId = rollbackPlanId;
  } else if (rollbackPlanId !== undefined) {
    throw invalidRecord(code, `only rollback/retire events name a plan (got ${eventType})`);
  }

  // evidenceIds shape: required on evidence-bearing advance events, forbidden else.
  const evidenceIds = value["evidenceIds"];
  if (eventType === "candidate_advanced") {
    const to = withExtras.transition?.to;
    if (to === "evaluating" || to === "piloted") {
      if (!Array.isArray(evidenceIds) || evidenceIds.length === 0 || !evidenceIds.every((entry) => isContentId(entry))) {
        throw invalidRecord(
          code,
          `candidate_advanced → ${to ?? "?"} events must carry NON-EMPTY 64-hex evidenceIds`,
        );
      }
      withExtras.evidenceIds = [...(evidenceIds as string[])];
    } else if (evidenceIds !== undefined) {
      throw invalidRecord(
        code,
        "candidate_advanced → replaced events carry no evidenceIds (the equivalence and acceptance records are the prerequisites)",
      );
    }
  } else if (evidenceIds !== undefined) {
    throw invalidRecord(code, `only candidate_advanced events carry evidenceIds (got ${eventType})`);
  }
  return withExtras;
}

/** Verify the event-numbering + last-digest coherence of one record history. */
function verifyHistory(
  history: readonly AdoptionEvent[],
  digestOf: () => string,
  code: AdoptionErrorCode,
): void {
  for (let index = 0; index < history.length; index += 1) {
    const expected = `evt-${String(index + 1).padStart(6, "0")}`;
    if (history[index]?.eventId !== expected) {
      throw invalidRecord(
        code,
        `history event numbering must be sequential (position ${index + 1} expected ${expected})`,
      );
    }
  }
  const lastEvent = history[history.length - 1];
  if (lastEvent === undefined || lastEvent.recordDigest !== digestOf()) {
    throw invalidRecord(
      code,
      "the last history event's recordDigest does not pin the persisted content — history is never rewritten",
    );
  }
}

/** Parse one stored workflow record (store reads validate everything). */
export function parseIncumbentWorkflow(value: unknown): IncumbentWorkflow {
  if (!isRecord(value)) throw invalidRecord("invalid_workflow_record", "record is not an object");
  const workflowId = value["workflowId"];
  if (!isNonEmptyString(workflowId)) throw invalidRecord("invalid_workflow_record", "workflowId");
  try {
    validateWorkflowId(workflowId);
  } catch (error) {
    if (error instanceof AdoptionError) {
      throw invalidRecord("invalid_workflow_record", `workflowId: ${error.detail}`);
    }
    throw error;
  }
  if (!boundedString(value["organizationId"], 256)) {
    throw invalidRecord("invalid_workflow_record", "organizationId");
  }
  if (!boundedString(value["name"], 256)) {
    throw invalidRecord("invalid_workflow_record", "name");
  }
  const description = value["description"];
  if (description !== undefined && !boundedString(description, 2000)) {
    throw invalidRecord("invalid_workflow_record", "description");
  }
  const stepsValue = value["steps"];
  if (!Array.isArray(stepsValue)) {
    throw invalidRecord("invalid_workflow_record", "steps must be an array");
  }
  const steps = stepsValue.map(parseWorkflowStep);
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.stepId)) {
      throw invalidRecord(
        "invalid_workflow_record",
        `duplicate stepId "${step.stepId}" — step ids are unique within a workflow`,
      );
    }
    seen.add(step.stepId);
  }
  if (typeof value["createdAt"] !== "string" || !ISO_UTC.test(value["createdAt"])) {
    throw invalidRecord("invalid_workflow_record", "createdAt");
  }
  if (typeof value["updatedAt"] !== "string" || !ISO_UTC.test(value["updatedAt"])) {
    throw invalidRecord("invalid_workflow_record", "updatedAt");
  }
  const historyValue = value["history"];
  if (!Array.isArray(historyValue) || historyValue.length === 0) {
    throw invalidRecord(
      "invalid_workflow_record",
      "history must be a NON-EMPTY array (creation event is never absent)",
    );
  }
  const history = historyValue.map((entry) => parseStoredEvent(entry, "workflow"));
  for (const event of history) {
    if (event.eventType !== "workflow_recorded" && event.eventType !== "workflow_step_appended") {
      throw invalidRecord(
        "invalid_workflow_record",
        `workflow histories carry only workflow events (got ${event.eventType})`,
      );
    }
  }
  const record: IncumbentWorkflow = {
    workflowId,
    organizationId: value["organizationId"] as string,
    name: value["name"] as string,
    ...(description === undefined ? {} : { description }),
    steps,
    createdAt: value["createdAt"] as string,
    updatedAt: value["updatedAt"] as string,
    history,
  };
  verifyHistory(
    record.history,
    () => workflowContentDigest(record),
    "invalid_workflow_record",
  );
  return record;
}

/** Parse one stored equivalence record. */
function parseStoredEquivalence(value: unknown): SemanticEquivalenceRecord {
  if (!isRecord(value)) {
    throw invalidRecord("invalid_candidate_record", "equivalence is not an object");
  }
  if (!boundedString(value["establishedHow"], 2000)) {
    throw invalidRecord("invalid_candidate_record", "equivalence.establishedHow");
  }
  const evidenceIds = parseEvidenceIds(
    value["evidenceIds"],
    "invalid_candidate_record",
    "equivalence record",
  );
  if (!boundedString(value["limits"], 2000)) {
    throw invalidRecord(
      "invalid_candidate_record",
      "equivalence.limits must be 1..2000 characters (honest limits are mandatory)",
    );
  }
  if (!boundedString(value["establishedBy"], 256)) {
    throw invalidRecord("invalid_candidate_record", "equivalence.establishedBy");
  }
  if (typeof value["establishedAt"] !== "string" || !ISO_UTC.test(value["establishedAt"])) {
    throw invalidRecord("invalid_candidate_record", "equivalence.establishedAt");
  }
  return {
    establishedHow: value["establishedHow"] as string,
    evidenceIds,
    limits: value["limits"] as string,
    establishedBy: value["establishedBy"] as string,
    establishedAt: value["establishedAt"] as string,
  };
}

/** Parse one stored acceptance record. */
function parseStoredAcceptance(value: unknown): OperationalAcceptanceRecord {
  if (!isRecord(value)) {
    throw invalidRecord("invalid_candidate_record", "acceptance is not an object");
  }
  if (!boundedString(value["acceptedBy"], 256)) {
    throw invalidRecord("invalid_candidate_record", "acceptance.acceptedBy");
  }
  const evidenceIds = parseEvidenceIds(
    value["evidenceIds"],
    "invalid_candidate_record",
    "acceptance record",
  );
  if (!boundedString(value["note"], 2000)) {
    throw invalidRecord("invalid_candidate_record", "acceptance.note");
  }
  if (typeof value["acceptedAt"] !== "string" || !ISO_UTC.test(value["acceptedAt"])) {
    throw invalidRecord("invalid_candidate_record", "acceptance.acceptedAt");
  }
  return {
    acceptedBy: value["acceptedBy"] as string,
    evidenceIds,
    note: value["note"] as string,
    acceptedAt: value["acceptedAt"] as string,
  };
}

/** Parse one stored rollback plan. */
function parseStoredRollbackPlan(value: unknown): RollbackPlan {
  if (!isRecord(value)) {
    throw invalidRecord("invalid_candidate_record", "rollback plan is not an object");
  }
  if (!boundedString(value["planId"], 256)) {
    throw invalidRecord("invalid_candidate_record", "rollback plan planId");
  }
  if (!boundedString(value["description"], 2000)) {
    throw invalidRecord("invalid_candidate_record", "rollback plan description");
  }
  const restorationSteps = value["restorationSteps"];
  if (
    !Array.isArray(restorationSteps) ||
    restorationSteps.length === 0 ||
    !restorationSteps.every((entry) => boundedString(entry, 2000))
  ) {
    throw invalidRecord(
      "invalid_candidate_record",
      "rollback plan restorationSteps must be a NON-EMPTY array of steps",
    );
  }
  if (!boundedString(value["owner"], 256)) {
    throw invalidRecord("invalid_candidate_record", "rollback plan owner");
  }
  const state = value["state"];
  if (typeof state !== "string" || !(ROLLBACK_PLAN_STATES as readonly string[]).includes(state)) {
    throw invalidRecord("invalid_candidate_record", "rollback plan state");
  }
  if (!boundedString(value["recordedBy"], 256)) {
    throw invalidRecord("invalid_candidate_record", "rollback plan recordedBy");
  }
  if (typeof value["recordedAt"] !== "string" || !ISO_UTC.test(value["recordedAt"])) {
    throw invalidRecord("invalid_candidate_record", "rollback plan recordedAt");
  }
  const retiredAt = value["retiredAt"];
  const retiredBy = value["retiredBy"];
  if (state === "retired") {
    if (typeof retiredAt !== "string" || !ISO_UTC.test(retiredAt)) {
      throw invalidRecord("invalid_candidate_record", "retired rollback plan retiredAt");
    }
    if (!boundedString(retiredBy, 256)) {
      throw invalidRecord("invalid_candidate_record", "retired rollback plan retiredBy");
    }
  } else if (retiredAt !== undefined || retiredBy !== undefined) {
    throw invalidRecord(
      "invalid_candidate_record",
      "active rollback plans carry no retirement fields",
    );
  }
  return {
    planId: value["planId"] as string,
    description: value["description"] as string,
    restorationSteps: [...(restorationSteps as string[])],
    owner: value["owner"] as string,
    state: state as RollbackPlanState,
    recordedBy: value["recordedBy"] as string,
    recordedAt: value["recordedAt"] as string,
    ...(retiredAt === undefined ? {} : { retiredAt }),
    ...(retiredBy === undefined ? {} : { retiredBy }),
  };
}

/** Parse one stored migration-candidate record. */
export function parseMigrationCandidate(value: unknown): MigrationCandidate {
  if (!isRecord(value)) throw invalidRecord("invalid_candidate_record", "record is not an object");
  const candidateId = value["candidateId"];
  if (!isNonEmptyString(candidateId)) throw invalidRecord("invalid_candidate_record", "candidateId");
  try {
    validateCandidateId(candidateId);
  } catch (error) {
    if (error instanceof AdoptionError) {
      throw invalidRecord("invalid_candidate_record", `candidateId: ${error.detail}`);
    }
    throw error;
  }
  if (!boundedString(value["workflowId"], 256)) {
    throw invalidRecord("invalid_candidate_record", "workflowId");
  }
  if (!boundedString(value["stepId"], 256)) {
    throw invalidRecord("invalid_candidate_record", "stepId");
  }
  if (!boundedString(value["aiseReplacementBoundary"], 2000)) {
    throw invalidRecord("invalid_candidate_record", "aiseReplacementBoundary");
  }
  if (!boundedString(value["rationale"], 2000)) {
    throw invalidRecord("invalid_candidate_record", "rationale");
  }
  const state = value["state"];
  if (typeof state !== "string" || !(MIGRATION_STATES as readonly string[]).includes(state)) {
    throw invalidRecord("invalid_candidate_record", "state");
  }
  if (!boundedString(value["recordedBy"], 256)) {
    throw invalidRecord("invalid_candidate_record", "recordedBy");
  }
  if (typeof value["createdAt"] !== "string" || !ISO_UTC.test(value["createdAt"])) {
    throw invalidRecord("invalid_candidate_record", "createdAt");
  }
  if (typeof value["updatedAt"] !== "string" || !ISO_UTC.test(value["updatedAt"])) {
    throw invalidRecord("invalid_candidate_record", "updatedAt");
  }
  const equivalenceValue = value["equivalence"];
  const equivalence =
    equivalenceValue === undefined ? undefined : parseStoredEquivalence(equivalenceValue);
  const acceptanceValue = value["acceptance"];
  const acceptance =
    acceptanceValue === undefined ? undefined : parseStoredAcceptance(acceptanceValue);
  const plansValue = value["rollbackPlans"];
  if (!Array.isArray(plansValue)) {
    throw invalidRecord("invalid_candidate_record", "rollbackPlans must be an array");
  }
  const rollbackPlans = plansValue.map(parseStoredRollbackPlan);
  const planIds = new Set<string>();
  for (const plan of rollbackPlans) {
    if (planIds.has(plan.planId)) {
      throw invalidRecord(
        "invalid_candidate_record",
        `duplicate rollback plan id "${plan.planId}"`,
      );
    }
    planIds.add(plan.planId);
  }
  const evaluationEvidenceIds = value["evaluationEvidenceIds"];
  if (evaluationEvidenceIds !== undefined) {
    if (
      !Array.isArray(evaluationEvidenceIds) ||
      !evaluationEvidenceIds.every((entry) => isContentId(entry))
    ) {
      throw invalidRecord("invalid_candidate_record", "evaluationEvidenceIds");
    }
  }
  const pilotOutcomeEvidenceIds = value["pilotOutcomeEvidenceIds"];
  if (pilotOutcomeEvidenceIds !== undefined) {
    if (
      !Array.isArray(pilotOutcomeEvidenceIds) ||
      !pilotOutcomeEvidenceIds.every((entry) => isContentId(entry))
    ) {
      throw invalidRecord("invalid_candidate_record", "pilotOutcomeEvidenceIds");
    }
  }
  const historyValue = value["history"];
  if (!Array.isArray(historyValue) || historyValue.length === 0) {
    throw invalidRecord(
      "invalid_candidate_record",
      "history must be a NON-EMPTY array (proposal event is never absent)",
    );
  }
  const history = historyValue.map((entry) => parseStoredEvent(entry, "candidate"));
  for (const event of history) {
    if (event.eventType === "workflow_recorded" || event.eventType === "workflow_step_appended" || event.eventType === "assessment_recorded") {
      throw invalidRecord(
        "invalid_candidate_record",
        `candidate histories carry only candidate events (got ${event.eventType})`,
      );
    }
  }
  const record: MigrationCandidate = {
    candidateId,
    workflowId: value["workflowId"] as string,
    stepId: value["stepId"] as string,
    aiseReplacementBoundary: value["aiseReplacementBoundary"] as string,
    rationale: value["rationale"] as string,
    state: state as MigrationState,
    recordedBy: value["recordedBy"] as string,
    createdAt: value["createdAt"] as string,
    updatedAt: value["updatedAt"] as string,
    ...(equivalence === undefined ? {} : { equivalence }),
    ...(acceptance === undefined ? {} : { acceptance }),
    rollbackPlans,
    ...(evaluationEvidenceIds === undefined
      ? {}
      : { evaluationEvidenceIds: [...(evaluationEvidenceIds as string[])] }),
    ...(pilotOutcomeEvidenceIds === undefined
      ? {}
      : { pilotOutcomeEvidenceIds: [...(pilotOutcomeEvidenceIds as string[])] }),
    history,
  };
  verifyHistory(
    record.history,
    () => candidateContentDigest(record),
    "invalid_candidate_record",
  );
  return record;
}

/** Parse one stored adapter-view entry (consumed registry context). */
function parseStoredAdapterViewEntry(value: unknown): AdapterViewEntry {
  if (!isRecord(value)) {
    throw invalidRecord("invalid_assessment_record", "adapterView entries must be objects");
  }
  const adapterId = value["adapterId"];
  if (!boundedString(adapterId, 256)) {
    throw invalidRecord("invalid_assessment_record", "adapterView.adapterId");
  }
  const descriptorValue = value["descriptor"];
  let descriptor: AdapterDescriptor | null = null;
  if (descriptorValue !== null && descriptorValue !== undefined) {
    // The integrations authority's OWN validator — never a second one here.
    const validation = validateAdapterDescriptor(descriptorValue);
    if (!validation.ok) {
      throw invalidRecord(
        "invalid_assessment_record",
        `adapterView descriptor for ${adapterId} is invalid: ${validation.issues.join("; ")}`,
      );
    }
    descriptor = validation.descriptor;
  }
  return { adapterId, descriptor };
}

/** Parse one stored score component (known or unknown — never conflated). */
function parseStoredComponent(value: unknown, where: string): ScoreComponent {
  if (!isRecord(value)) {
    throw invalidRecord("invalid_assessment_record", `${where} is not an object`);
  }
  const kind = value["kind"];
  if (kind === "unknown") {
    if (!boundedString(value["derivation"], 2000)) {
      throw invalidRecord("invalid_assessment_record", `${where}.derivation`);
    }
    if (value["value"] !== undefined) {
      throw invalidRecord(
        "invalid_assessment_record",
        `${where} is UNKNOWN and must carry NO value — never a silently defaulted number`,
      );
    }
    return { kind: "unknown", derivation: value["derivation"] as string };
  }
  if (kind === "known") {
    const componentValue = value["value"];
    if (
      typeof componentValue !== "number" ||
      !Number.isFinite(componentValue) ||
      componentValue < 0 ||
      componentValue > 1
    ) {
      throw invalidRecord("invalid_assessment_record", `${where}.value must be a finite [0,1] number`);
    }
    if (!boundedString(value["derivation"], 2000)) {
      throw invalidRecord("invalid_assessment_record", `${where}.derivation`);
    }
    return { kind: "known", value: componentValue, derivation: value["derivation"] as string };
  }
  throw invalidRecord("invalid_assessment_record", `${where}.kind must be "known" or "unknown"`);
}

/** Parse one stored score breakdown. */
function parseStoredBreakdown(
  value: unknown,
  where: string,
  expectedComponents: readonly string[],
  weights: Readonly<Record<string, number>>,
): ScoreBreakdown {
  if (!isRecord(value)) {
    throw invalidRecord("invalid_assessment_record", `${where} is not an object`);
  }
  const componentsValue = value["components"];
  if (!isRecord(componentsValue)) {
    throw invalidRecord("invalid_assessment_record", `${where}.components must be an object`);
  }
  const componentKeys = Object.keys(componentsValue).sort(compareStrings);
  const expectedSorted = [...expectedComponents].sort(compareStrings);
  if (componentKeys.join(",") !== expectedSorted.join(",")) {
    throw invalidRecord(
      "invalid_assessment_record",
      `${where}.components must be exactly ${expectedSorted.join(", ")} (got ${componentKeys.join(", ")})`,
    );
  }
  const components: Record<string, ScoreComponent> = {};
  for (const key of expectedSorted) {
    components[key] = parseStoredComponent(componentsValue[key], `${where}.components.${key}`);
  }
  const weightsValue = value["weights"];
  if (!isRecord(weightsValue)) {
    throw invalidRecord("invalid_assessment_record", `${where}.weights must be an object`);
  }
  for (const key of expectedSorted) {
    if (weightsValue[key] !== (weights[key] as number | undefined)) {
      throw invalidRecord(
        "invalid_assessment_record",
        `${where}.weights.${key} must equal the frozen weight ${weights[key] as number} — weights are never editable`,
      );
    }
  }
  const unknownComponentsValue = value["unknownComponents"];
  if (!Array.isArray(unknownComponentsValue)) {
    throw invalidRecord("invalid_assessment_record", `${where}.unknownComponents must be an array`);
  }
  const unknownComponents = [...(unknownComponentsValue as unknown[])].map((entry) => String(entry));
  const expectedUnknown = expectedSorted.filter(
    (key) => components[key]?.kind === "unknown",
  );
  if (unknownComponents.join(",") !== expectedUnknown.join(",")) {
    throw invalidRecord(
      "invalid_assessment_record",
      `${where}.unknownComponents must list exactly the unknown components (${expectedUnknown.join(", ")})`,
    );
  }
  const composite = value["composite"];
  const anyUnknown = expectedUnknown.length > 0;
  if (anyUnknown) {
    if (composite !== null) {
      throw invalidRecord(
        "invalid_assessment_record",
        `${where}.composite must be null while components are UNKNOWN — a number would fabricate certainty`,
      );
    }
  } else if (typeof composite !== "number" || !Number.isFinite(composite)) {
    throw invalidRecord("invalid_assessment_record", `${where}.composite must be a finite number`);
  }
  if (!boundedString(value["compositeDerivation"], 2000)) {
    throw invalidRecord("invalid_assessment_record", `${where}.compositeDerivation`);
  }
  return {
    components,
    weights: Object.fromEntries(expectedSorted.map((key) => [key, weights[key] as number])),
    composite: anyUnknown ? null : (composite as number),
    compositeDerivation: value["compositeDerivation"] as string,
    unknownComponents,
  };
}

const READINESS_COMPONENT_NAMES = Object.keys(READINESS_WEIGHTS);
const FRICTION_COMPONENT_NAMES = Object.keys(FRICTION_WEIGHTS);

/** Parse one stored per-step assessment row. */
function parseStoredStepAssessment(value: unknown): StepAssessment {
  if (!isRecord(value)) {
    throw invalidRecord("invalid_assessment_record", "steps entries must be objects");
  }
  if (!boundedString(value["stepId"], 256)) {
    throw invalidRecord("invalid_assessment_record", "steps.stepId");
  }
  const readiness = parseStoredBreakdown(
    value["readiness"],
    `steps.${value["stepId"]}.readiness`,
    READINESS_COMPONENT_NAMES,
    READINESS_WEIGHTS,
  );
  const friction = parseStoredBreakdown(
    value["friction"],
    `steps.${value["stepId"]}.friction`,
    FRICTION_COMPONENT_NAMES,
    FRICTION_WEIGHTS,
  );
  const opportunity = value["opportunity"];
  if (
    (readiness.composite === null || friction.composite === null)
      ? opportunity !== null
      : typeof opportunity !== "number" || !Number.isFinite(opportunity)
  ) {
    throw invalidRecord(
      "invalid_assessment_record",
      "steps.opportunity must be readiness − friction when both composites are known, else null",
    );
  }
  if (!boundedString(value["opportunityDerivation"], 2000)) {
    throw invalidRecord("invalid_assessment_record", "steps.opportunityDerivation");
  }
  const unknownAttributes = value["unknownAttributes"];
  if (
    !Array.isArray(unknownAttributes) ||
    !unknownAttributes.every((entry) => typeof entry === "string")
  ) {
    throw invalidRecord("invalid_assessment_record", "steps.unknownAttributes must be a string array");
  }
  return {
    stepId: value["stepId"] as string,
    readiness,
    friction,
    opportunity: opportunity === null ? null : (opportunity as number),
    opportunityDerivation: value["opportunityDerivation"] as string,
    unknownAttributes: [...(unknownAttributes as string[])],
  };
}

/** Parse one stored ranked-step row. */
function parseStoredRankedStep(value: unknown): RankedStep {
  if (!isRecord(value)) {
    throw invalidRecord("invalid_assessment_record", "rankedSteps entries must be objects");
  }
  const rank = value["rank"];
  if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 1) {
    throw invalidRecord("invalid_assessment_record", "rankedSteps.rank must be a positive integer");
  }
  if (!boundedString(value["stepId"], 256)) {
    throw invalidRecord("invalid_assessment_record", "rankedSteps.stepId");
  }
  for (const field of ["opportunity", "readinessComposite", "frictionComposite"]) {
    const entry = value[field];
    if (entry !== null && (typeof entry !== "number" || !Number.isFinite(entry))) {
      throw invalidRecord("invalid_assessment_record", `rankedSteps.${field}`);
    }
  }
  const unknownAttributes = value["unknownAttributes"];
  if (
    !Array.isArray(unknownAttributes) ||
    !unknownAttributes.every((entry) => typeof entry === "string")
  ) {
    throw invalidRecord("invalid_assessment_record", "rankedSteps.unknownAttributes");
  }
  return {
    rank,
    stepId: value["stepId"] as string,
    opportunity: value["opportunity"] === null ? null : (value["opportunity"] as number),
    readinessComposite:
      value["readinessComposite"] === null ? null : (value["readinessComposite"] as number),
    frictionComposite:
      value["frictionComposite"] === null ? null : (value["frictionComposite"] as number),
    unknownAttributes: [...(unknownAttributes as string[])],
  };
}

/** Parse one stored assessment record (full coherence re-verification). */
export function parseIntegrationReadinessAssessment(
  value: unknown,
): IntegrationReadinessAssessment {
  if (!isRecord(value)) throw invalidRecord("invalid_assessment_record", "record is not an object");
  const assessmentId = value["assessmentId"];
  if (!isNonEmptyString(assessmentId)) {
    throw invalidRecord("invalid_assessment_record", "assessmentId");
  }
  try {
    validateAssessmentId(assessmentId);
  } catch (error) {
    if (error instanceof AdoptionError) {
      throw invalidRecord("invalid_assessment_record", `assessmentId: ${error.detail}`);
    }
    throw error;
  }
  if (!boundedString(value["workflowId"], 256)) {
    throw invalidRecord("invalid_assessment_record", "workflowId");
  }
  if (!isContentId(value["workflowDigest"])) {
    throw invalidRecord("invalid_assessment_record", "workflowDigest must be a 64-hex digest");
  }
  const adapterViewValue = value["adapterView"];
  if (!Array.isArray(adapterViewValue)) {
    throw invalidRecord("invalid_assessment_record", "adapterView must be an array");
  }
  const adapterView = adapterViewValue.map(parseStoredAdapterViewEntry);
  const adapterIds = adapterView.map((entry) => entry.adapterId);
  if (new Set(adapterIds).size !== adapterIds.length) {
    throw invalidRecord("invalid_assessment_record", "adapterView carries duplicate adapter ids");
  }
  const stepsValue = value["steps"];
  if (!Array.isArray(stepsValue) || stepsValue.length === 0) {
    throw invalidRecord("invalid_assessment_record", "steps must be a NON-EMPTY array");
  }
  const steps = stepsValue.map(parseStoredStepAssessment);
  const stepIds = new Set(steps.map((step) => step.stepId));
  if (stepIds.size !== steps.length) {
    throw invalidRecord("invalid_assessment_record", "steps carries duplicate step ids");
  }
  const readiness = parseStoredBreakdown(
    value["readiness"],
    "readiness",
    READINESS_COMPONENT_NAMES,
    READINESS_WEIGHTS,
  );
  const friction = parseStoredBreakdown(
    value["friction"],
    "friction",
    FRICTION_COMPONENT_NAMES,
    FRICTION_WEIGHTS,
  );
  const inventory = parseStoredInventory(value["inventory"], steps.length);
  const rankedStepsValue = value["rankedSteps"];
  if (!Array.isArray(rankedStepsValue)) {
    throw invalidRecord("invalid_assessment_record", "rankedSteps must be an array");
  }
  const rankedSteps = rankedStepsValue.map(parseStoredRankedStep);
  if (rankedSteps.length !== steps.length) {
    throw invalidRecord(
      "invalid_assessment_record",
      "rankedSteps must rank exactly the assessed steps",
    );
  }
  // Every ranked step must reference an assessed step, with consistent numbers.
  for (const ranked of rankedSteps) {
    if (!stepIds.has(ranked.stepId)) {
      throw invalidRecord(
        "invalid_assessment_record",
        `ranked step ${ranked.stepId} is not an assessed step`,
      );
    }
    const step = steps.find((entry) => entry.stepId === ranked.stepId);
    if (
      step !== undefined &&
      (ranked.readinessComposite !== step.readiness.composite ||
        ranked.frictionComposite !== step.friction.composite ||
        ranked.opportunity !== step.opportunity ||
        ranked.unknownAttributes.join(",") !== step.unknownAttributes.join(","))
    ) {
      throw invalidRecord(
        "invalid_assessment_record",
        `ranked step ${ranked.stepId} carries numbers inconsistent with its step assessment`,
      );
    }
  }
  // The ranking order must be the canonical total order (opportunity DESC,
  // nulls LAST, then stepId ASC) and ranks must be 1..N.
  const canonical = [...steps]
    .sort((a, b) => {
      if (a.opportunity === null && b.opportunity === null) {
        return compareStrings(a.stepId, b.stepId);
      }
      if (a.opportunity === null) {
        return 1;
      }
      if (b.opportunity === null) {
        return -1;
      }
      if (a.opportunity !== b.opportunity) {
        return b.opportunity - a.opportunity;
      }
      return compareStrings(a.stepId, b.stepId);
    })
    .map((step) => step.stepId);
  if (rankedSteps.map((ranked) => ranked.stepId).join(",") !== canonical.join(",")) {
    throw invalidRecord(
      "invalid_assessment_record",
      "rankedSteps must follow the canonical order (opportunity DESC, nulls last, stepId ASC)",
    );
  }
  if (rankedSteps.some((ranked, index) => ranked.rank !== index + 1)) {
    throw invalidRecord("invalid_assessment_record", "rankedSteps ranks must be 1..N in order");
  }
  if (!isContentId(value["inputDigest"])) {
    throw invalidRecord("invalid_assessment_record", "inputDigest must be a 64-hex digest");
  }
  if (typeof value["computedAt"] !== "string" || !ISO_UTC.test(value["computedAt"])) {
    throw invalidRecord("invalid_assessment_record", "computedAt");
  }
  const historyValue = value["history"];
  if (!Array.isArray(historyValue) || historyValue.length === 0) {
    throw invalidRecord(
      "invalid_assessment_record",
      "history must be a NON-EMPTY array (creation event is never absent)",
    );
  }
  const history = historyValue.map((entry) => parseStoredEvent(entry, "assessment"));
  for (const event of history) {
    if (event.eventType !== "assessment_recorded") {
      throw invalidRecord(
        "invalid_assessment_record",
        `assessment histories carry only assessment events (got ${event.eventType})`,
      );
    }
  }
  const record: IntegrationReadinessAssessment = {
    assessmentId,
    workflowId: value["workflowId"] as string,
    workflowDigest: value["workflowDigest"] as string,
    adapterView,
    steps,
    readiness,
    friction,
    inventory,
    rankedSteps,
    inputDigest: value["inputDigest"] as string,
    computedAt: value["computedAt"] as string,
    history,
  };
  verifyHistory(
    record.history,
    () => assessmentContentDigest(record),
    "invalid_assessment_record",
  );
  return record;
}

/** Parse + coherence-check the stored inventory rollups. */
function parseStoredInventory(value: unknown, totalSteps: number): AdoptionInventoryStats {
  if (!isRecord(value)) {
    throw invalidRecord("invalid_assessment_record", "inventory is not an object");
  }
  const fields: readonly [string, number][] = [
    ["totalSteps", totalSteps],
  ];
  for (const [field, expectedValue] of fields) {
    if (value[field] !== expectedValue) {
      throw invalidRecord(
        "invalid_assessment_record",
        `inventory.${field} must be ${expectedValue} — persisted statistics are ALWAYS consistent with the persisted rows`,
      );
    }
  }
  const integerFields: readonly [string, number][] = [
    ["distinctSystemInstances", 0],
    ["distinctAdapterReferences", 0],
    ["distinctResources", 0],
    ["distinctRoles", 0],
    ["stepsWithUnknownAttributes", 0],
    ["unknownAttributeOccurrences", 0],
  ];
  const inventory: Record<string, number> = { totalSteps };
  for (const [field, min] of integerFields) {
    const entry = value[field];
    if (
      typeof entry !== "number" ||
      !Number.isInteger(entry) ||
      entry < min ||
      entry > (field === "stepsWithUnknownAttributes" ? totalSteps : Number.MAX_SAFE_INTEGER)
    ) {
      throw invalidRecord(
        "invalid_assessment_record",
        `inventory.${field} must be a sane non-negative integer`,
      );
    }
    inventory[field] = entry;
  }
  const stepsWithUnknown = value["stepsWithUnknownAttributes"] as number;
  const unknownOccurrences = value["unknownAttributeOccurrences"] as number;
  if (stepsWithUnknown > 0 && unknownOccurrences < stepsWithUnknown) {
    throw invalidRecord(
      "invalid_assessment_record",
      "inventory coherence: each step with unknown attributes contributes at least one occurrence",
    );
  }
  return {
    totalSteps,
    distinctSystemInstances: value["distinctSystemInstances"] as number,
    distinctAdapterReferences: value["distinctAdapterReferences"] as number,
    distinctResources: value["distinctResources"] as number,
    distinctRoles: value["distinctRoles"] as number,
    stepsWithUnknownAttributes: stepsWithUnknown,
    unknownAttributeOccurrences: unknownOccurrences,
  };
}
