/**
 * AISE-026 — Intervention state model (the proposal domain).
 *
 * Contract (spec/work-orders.md §026: "Model proposed intervention
 * scenarios, ordered steps and immutable state transitions from an
 * authoritative baseline. Verify reproducibility and proposal isolation.
 * CRITICAL."; spec/requirements.md R11 — "layer N is a deterministic
 * proposed state; proposed state cannot overwrite observed reality;
 * quantities/cost impacts are traceable."; spec/architecture-lock.md
 * "Authority" #6 — "Intervention states are proposals until supported by
 * post-execution evidence"; "Intervention" — "Proposed intervention states
 * cannot mutate authoritative existing reality. Every intervention state
 * is reproducible from scenario inputs and transformations."):
 *
 * PROPOSAL ISOLATION IS THE DESIGN — enforced STRUCTURALLY, at the TYPE
 * level, not by convention:
 *
 *  - Every node and property inside an `InterventionState` carries the
 *    LITERAL type `"PROPOSED"` (`ProposedNode` / `ProposedProperty`).
 *    Representing `OBSERVED`, `INFERRED` or `CONFIRMED` inside an
 *    intervention state is a COMPILE ERROR, and the stored-record parser
 *    re-rejects any non-PROPOSED status found on disk
 *    (`invalid_epistemic_status`) — garbage is never silently re-read.
 *    A proposal is not an observation; the ENTIRE derived layer is
 *    proposed, whatever epistemic status the baseline content carried in
 *    the Reality Graph (the baseline itself is untouched — see
 *    projection.ts and service.ts).
 *  - A `RealityNode` (whose `epistemicStatus` is the shared
 *    `EpistemicStatus` union) is NOT assignable to `ProposedNode`: the
 *    reality authority's records cannot be smuggled into a proposal layer
 *    without an explicit, visible projection (projection.ts performs that
 *    projection by COPYING baseline content and overwriting statuses to
 *    PROPOSED — the reality version's own bytes are never touched).
 *  - This module has NO code path into reality-store writes: it never
 *    imports the reality store (import tripwire test), and the service
 *    resolves baselines ONLY through an injected READ-ONLY
 *    `BaselineResolver` (or an in-process caller-supplied snapshot). The
 *    Reality Graph stays the only canonical engineering-model authority
 *    (lock "Authority" #1); intervention states are DERIVED PROPOSALS
 *    referencing it — never a second canonical model.
 *  - NO SECOND VOCABULARY: node kinds, geometry refs, unit declarations
 *    and provenance records are the Reality Graph's types, imported
 *    READ-ONLY (type-only imports). Step payloads carry `kind` VERBATIM
 *    (compile-time typed via `NodeKind`, runtime verbatim) — vocabulary
 *    enforcement is the reality authority's write-time duty (AISE-016),
 *    not this proposal layer's; a duplicate kind vocabulary here would be
 *    a second canonical model.
 *
 * Baseline pinning and determinism:
 *
 *  - A scenario PINS `baselineVersionId` at creation. Every materialized
 *    state carries that pin; states are reproducible from
 *    {scenarioId, baselineVersionId, ordered steps} alone (lock
 *    "Intervention" — reproducibility).
 *  - `stateId` is the sha256 over the canonical JSON of
 *    {scenarioId, baselineVersionId, stateIndex, appliedStepIds,
 *    materialized content} — the step SEQUENCE is hashed in order, so
 *    reordered steps yield different state ids (order sensitivity), while
 *    the same baseline + same steps always yield the same id. The
 *    clock-stamped `materializedAt` is DELIBERATELY EXCLUDED from the
 *    derivation: a state's IDENTITY is its content, not the moment it was
 *    materialized.
 *  - States are immutable snapshots: once appended to the scenario record
 *    they are never rewritten (append-only discipline; the store rewrites
 *    the FILE but never prior states).
 *
 * Governance (R12 — human engineering approval):
 *
 *  - The approval ACT lives in the Engineering Case domain (AISE-025
 *    reviews). This module only RECORDS an `ApprovalReference`
 *    {caseId, reviewDecision, reviewedAt} VERBATIM and NEVER interprets it
 *    (the review-decision vocabulary belongs to the Case domain; importing
 *    it here would re-derive another authority's semantics). The status
 *    machine requires the PRESENCE of a recorded reference before
 *    `approved` (`approval_reference_required`) — judging whether the
 *    referenced review actually approved is the Case/review authority's
 *    job, never this module's.
 *  - Scenario statuses: draft → under_review → approved | rejected;
 *    `superseded` is reachable from draft/under_review and terminal.
 *    approved/rejected/superseded are TERMINAL: no further steps,
 *    references or transitions (`scenario_terminal`,
 *    `invalid_status_transition`).
 *
 * Provenance discipline (same as reality nodes):
 *
 *  - Every step REQUIRES provenance — a non-empty `evidenceIds` list
 *    (64-hex Evidence-Graph content addresses) and/or a non-empty
 *    `derivationNote` (`missing_provenance` otherwise). Values and typed
 *    units are carried VERBATIM; numeric values require a typed unit
 *    (`numeric_value_without_unit`), non-numeric values carry none.
 *
 * This module owns the frozen vocabularies, record types, the typed error
 * registry, boundary input parsers (shape/vocabulary → typed codes), the
 * state-id derivation and the stored-record parser. The deterministic
 * projection engine lives in `projection.ts`; policy in `service.ts`;
 * persistence in `store.ts`; transport in `router.ts`.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type {
  GeometryRef,
  GraphVersion,
  NodeKind,
  ProvenanceRecord,
  Relationship,
  UnitDeclaration,
} from "../reality/model";

/* ------------------------------------------------------------------ */
/* Vocabularies (frozen: `as const` types + Object.freeze runtime)      */
/* ------------------------------------------------------------------ */

/** Ordered step kinds (work order §026 vocabulary). */
export const STEP_KINDS = Object.freeze([
  "property_change",
  "element_addition",
  "element_modification",
  "proposed_removal",
  "note",
] as const);
export type StepKind = (typeof STEP_KINDS)[number];

/**
 * Scenario lifecycle statuses. Approval is an ACT in the Case domain
 * (AISE-025 reviews); this module only RECORDS the reference and refuses
 * `approved` without one. `superseded` replaces (never deletes) a scenario.
 */
export const SCENARIO_STATUSES = Object.freeze([
  "draft",
  "under_review",
  "approved",
  "rejected",
  "superseded",
] as const);
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];

/** Terminal statuses — no steps, no references, no transitions out. */
export const TERMINAL_SCENARIO_STATUSES = Object.freeze(
  ["approved", "rejected", "superseded"] as const,
);

/** The governed transition table (single authority; frozen). */
export const SCENARIO_TRANSITIONS: Readonly<Record<ScenarioStatus, readonly ScenarioStatus[]>> =
  Object.freeze({
    draft: Object.freeze(["under_review", "superseded"] as const),
    under_review: Object.freeze(["approved", "rejected", "superseded"] as const),
    approved: Object.freeze([] as const),
    rejected: Object.freeze([] as const),
    superseded: Object.freeze([] as const),
  });

/** Whether a status admits no further mutation (content or status). */
export function isTerminalScenarioStatus(status: ScenarioStatus): boolean {
  return (TERMINAL_SCENARIO_STATUSES as readonly string[]).includes(status);
}

/**
 * How one state node came to be in the layer: carried untouched from the
 * pinned baseline (`baseline`), carried AND touched by a scenario step
 * (`baseline_touched`), or authored by the scenario (`scenario`). This is
 * the traceability hook AISE-028 consumes for quantity/cost deltas.
 */
export const STATE_NODE_ORIGINS = Object.freeze([
  "baseline",
  "baseline_touched",
  "scenario",
] as const);
export type StateNodeOrigin = (typeof STATE_NODE_ORIGINS)[number];

/** Relationship origins inside a state (carried vs scenario-authored). */
export const STATE_RELATIONSHIP_ORIGINS = Object.freeze(["baseline", "scenario"] as const);
export type StateRelationshipOrigin = (typeof STATE_RELATIONSHIP_ORIGINS)[number];

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)           */
/* ------------------------------------------------------------------ */

export const INTERVENTION_ERROR_CODES = Object.freeze([
  // shape / vocabulary validation
  "invalid_scenario",
  "invalid_step",
  "invalid_step_payload",
  "invalid_property",
  "numeric_value_without_unit",
  "invalid_epistemic_status",
  "invalid_provenance",
  "invalid_evidence_id",
  "missing_provenance",
  "invalid_id",
  "invalid_timestamp",
  "invalid_approval_reference",
  "invalid_status_transition",
  // semantic invariants
  "unknown_node_ref",
  "duplicate_node_ref",
  "baseline_mismatch",
  "step_sequence_gap",
  "duplicate_step_id",
  "scenario_terminal",
  "approval_reference_required",
  "approval_reference_exists",
  "scenario_exists",
  // not-found
  "scenario_not_found",
  "state_not_found",
  "baseline_not_found",
  // identity / persistence / addressing
  "invalid_scenario_id",
  "invalid_project_id",
  "invalid_version_id",
  "invalid_state_index",
  "invalid_intervention_record",
] as const);
export type InterventionErrorCode = (typeof INTERVENTION_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class InterventionError extends Error {
  readonly code: InterventionErrorCode;
  readonly detail: string;

  constructor(code: InterventionErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "InterventionError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Step payloads (typed values + units VERBATIM; reality's types)      */
/* ------------------------------------------------------------------ */

/**
 * A typed property value proposed by a step. Values and units are carried
 * VERBATIM; numeric values REQUIRE a typed unit, non-numeric values carry
 * none — the same discipline as reality `PropertyRecord` values. The
 * epistemic status is stamped at materialization (always PROPOSED).
 */
export interface StepPropertyPayload {
  readonly key: string;
  readonly value: string | number | boolean;
  /** REQUIRED for numeric values; absent for non-numeric. */
  readonly unit?: string;
}

/** A proposed new element (authoring payload for `element_addition`). */
export interface StepNodePayload {
  /** Carried VERBATIM (compile-time `NodeKind`; vocabulary is reality's). */
  readonly kind: NodeKind;
  readonly properties: readonly StepPropertyPayload[];
  readonly geometry?: GeometryRef;
  readonly units?: UnitDeclaration;
}

/**
 * The change payload of a step — one discriminated member per step kind.
 * `targetNodeId` lives on the step itself (the work order's "target node").
 */
export type StepChange =
  | { readonly kind: "property_change"; readonly property: StepPropertyPayload }
  | {
      readonly kind: "element_addition";
      readonly node: StepNodePayload;
      /** Optional host: materializes a scenario-authored `contains` edge. */
      readonly parentNodeId?: string;
    }
  | {
      readonly kind: "element_modification";
      readonly geometry?: GeometryRef;
      readonly units?: UnitDeclaration;
      readonly properties?: readonly StepPropertyPayload[];
    }
  | { readonly kind: "proposed_removal"; readonly reason: string }
  | { readonly kind: "note"; readonly text: string };

/**
 * Step provenance — REQUIRED on every step (same discipline as reality
 * nodes): a non-empty `evidenceIds` list (64-hex content addresses) and/or
 * a non-empty `derivationNote`. `missing_provenance` otherwise.
 */
export interface StepProvenance {
  readonly evidenceIds: readonly string[];
  readonly derivationNote?: string;
}

/* ------------------------------------------------------------------ */
/* Steps                                                                */
/* ------------------------------------------------------------------ */

/**
 * One ordered, caller-supplied change record. `stepId` and `stepIndex` are
 * assigned by the service (content-derived id, 1-based position); the
 * ORDER is the append order and is hashed into every state id.
 */
export interface InterventionStep {
  readonly stepId: string;
  readonly stepIndex: number;
  readonly kind: StepKind;
  readonly targetNodeId: string;
  readonly change: StepChange;
  /** Free-text rationale (optional, carried verbatim). */
  readonly rationale?: string;
  readonly provenance: StepProvenance;
  /** Injected clock. */
  readonly recordedAt: string;
}

/* ------------------------------------------------------------------ */
/* Proposed layer content (epistemically sealed: PROPOSED only)         */
/* ------------------------------------------------------------------ */

/**
 * A property assertion inside an intervention state. ALWAYS PROPOSED —
 * the literal type makes OBSERVED/INFERRED/CONFIRMED unrepresentable
 * (boundary and stored-record parsers re-check this at runtime).
 */
export interface ProposedProperty {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly unit?: string;
  readonly epistemicStatus: "PROPOSED";
  readonly provenance: readonly ProvenanceRecord[];
}

/**
 * A node inside an intervention state. ALWAYS PROPOSED — a RealityNode
 * (epistemicStatus: EpistemicStatus) is NOT assignable to this type.
 * Deliberately carries NO `acquisitionRef` (acquisition is a reality
 * fact) and NO `interventionRef` (the layer identity lives on the state
 * header: {scenarioId, stateId}).
 */
export interface ProposedNode {
  readonly nodeId: string;
  readonly kind: NodeKind;
  readonly epistemicStatus: "PROPOSED";
  readonly properties: readonly ProposedProperty[];
  readonly geometry?: GeometryRef;
  readonly provenance: readonly ProvenanceRecord[];
  readonly units?: UnitDeclaration;
}

/** One node of a materialized state, with its traceability metadata. */
export interface InterventionStateNode {
  readonly nodeId: string;
  readonly origin: StateNodeOrigin;
  /** Steps that touched this node (empty for untouched baseline content). */
  readonly appliedStepIds: readonly string[];
  readonly node: ProposedNode;
}

/** One relationship of a materialized state (carried or scenario-authored). */
export interface InterventionStateRelationship {
  readonly relationshipId: string;
  readonly origin: StateRelationshipOrigin;
  readonly relationship: Relationship;
}

/**
 * A PROPOSED tombstone: proposed removals never physically delete anything
 * — the baseline node stays verbatim in earlier states and in the reality
 * authority; the layer records the removal intent.
 */
export interface ProposedTombstone {
  readonly nodeId: string;
  /** Verbatim from the step's `reason`. */
  readonly reason: string;
  readonly proposedByStepId: string;
  /** Relationships severed by this removal (ids; the records stay in the
   *  pinned baseline and in earlier states). */
  readonly severedRelationshipIds: readonly string[];
}

/* ------------------------------------------------------------------ */
/* The materialized state (layer N)                                     */
/* ------------------------------------------------------------------ */

/**
 * MATERIALIZED layer N: the deterministic projection of the PINNED
 * baseline GraphVersion plus steps 1..N. Immutable snapshot — `stateId`
 * derives from the canonical JSON of {scenarioId, baselineVersionId,
 * stateIndex, appliedStepIds, materialized content} (see `deriveStateId`);
 * `materializedAt` is the injected clock and is EXCLUDED from the id.
 */
export interface InterventionState {
  readonly stateId: string;
  readonly scenarioId: string;
  /** Layer number: 0 = pure baseline overlay; N = after step N. */
  readonly stateIndex: number;
  /** Always the scenario's PINNED baseline version. */
  readonly baselineVersionId: string;
  /** Steps 1..stateIndex in application order (step ids). */
  readonly appliedStepIds: readonly string[];
  readonly nodes: readonly InterventionStateNode[];
  readonly relationships: readonly InterventionStateRelationship[];
  readonly proposedTombstones: readonly ProposedTombstone[];
  /** Injected clock; excluded from `stateId` (identity is content). */
  readonly materializedAt: string;
}

/** The state content that determines the state id. */
export type StateIdentity = Omit<InterventionState, "stateId" | "materializedAt">;

/**
 * Deterministic state id: sha256 over the canonical JSON of the state
 * identity (scenarioId, pinned baselineVersionId, stateIndex, ordered
 * appliedStepIds, materialized nodes/relationships/tombstones). Pure —
 * same inputs, same id, forever.
 */
export function deriveStateId(identity: StateIdentity): string {
  return sha256Hex(
    canonicalJsonStringify({
      scenarioId: identity.scenarioId,
      baselineVersionId: identity.baselineVersionId,
      stateIndex: identity.stateIndex,
      appliedStepIds: identity.appliedStepIds,
      nodes: identity.nodes,
      relationships: identity.relationships,
      proposedTombstones: identity.proposedTombstones,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* Scenario record                                                      */
/* ------------------------------------------------------------------ */

/**
 * A recorded Case-domain review outcome, VERBATIM — this module is NOT an
 * approval authority and never interprets the decision (the vocabulary
 * belongs to the Engineering Case domain).
 */
export interface ApprovalReference {
  readonly caseId: string;
  readonly reviewDecision: string;
  readonly reviewedAt: string;
}

/** One append-only status transition entry (status + injected clock). */
export interface ScenarioTransition {
  readonly status: ScenarioStatus;
  readonly at: string;
}

/**
 * A proposed intervention scenario. `steps` and `states` are append-only
 * (the history of applied steps is NEVER rewritten); `status` moves only
 * through the governed transition table; `transitions` records every
 * status change (including creation, as the initial `draft` entry).
 */
export interface InterventionScenario {
  readonly scenarioId: string;
  readonly projectId: string;
  readonly title: string;
  /** PINS the authoritative reality GraphVersion this scenario branches from. */
  readonly baselineVersionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: ScenarioStatus;
  readonly steps: readonly InterventionStep[];
  /** states[N] = layer N; states.length === steps.length + 1. */
  readonly states: readonly InterventionState[];
  readonly approvalReference?: ApprovalReference;
  readonly transitions: readonly ScenarioTransition[];
}

/** List projection (never the full record). */
export interface ScenarioSummary {
  readonly scenarioId: string;
  readonly projectId: string;
  readonly title: string;
  readonly status: ScenarioStatus;
  readonly baselineVersionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly stepCount: number;
  readonly stateCount: number;
  readonly latestStateId: string;
}

/** Pure list projection of one scenario record. */
export function summarizeScenario(record: InterventionScenario): ScenarioSummary {
  return {
    scenarioId: record.scenarioId,
    projectId: record.projectId,
    title: record.title,
    status: record.status,
    baselineVersionId: record.baselineVersionId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    stepCount: record.steps.length,
    stateCount: record.states.length,
    latestStateId: record.states[record.states.length - 1]?.stateId ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* Boundary input parsers (shape/vocabulary; semantics in projection/  */
/* service — defense in depth: the engine re-validates)                */
/* ------------------------------------------------------------------ */

export interface CreateScenarioInput {
  readonly scenarioId: string;
  readonly projectId: string;
  readonly title: string;
  readonly baselineVersionId: string;
  /**
   * In-process callers may supply the pinned baseline SNAPSHOT directly;
   * otherwise the service resolves it through the injected READ-ONLY
   * baseline resolver. Never on the wire (the router omits it).
   */
  readonly baseline?: GraphVersion;
}

export interface AddStepInput {
  readonly kind: StepKind;
  readonly targetNodeId: string;
  readonly change: StepChange;
  /** Free-text rationale (optional, carried verbatim). */
  readonly rationale?: string;
  readonly provenance: StepProvenance;
}

export interface ApprovalReferenceInput {
  readonly caseId: string;
  readonly reviewDecision: string;
  readonly reviewedAt: string;
}

export interface StatusTransitionInput {
  readonly status: ScenarioStatus;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTENT_ID = /^[0-9a-f]{64}$/;
const VERSION_ID = /^v\d{3,}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 256;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && ISO_UTC.test(value);
}

function isContentId(value: unknown): value is string {
  return typeof value === "string" && CONTENT_ID.test(value);
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

/** scenarioId shape (caller-stable opaque identity, 1..256 chars). */
export function validateScenarioId(scenarioId: string): void {
  if (typeof scenarioId !== "string" || scenarioId.length < 1 || scenarioId.length > 256) {
    throw new InterventionError("invalid_scenario_id", "scenarioId must be 1..256 characters");
  }
}

/** projectId shape (mirrors the Reality Graph projectId bounds). */
export function validateProjectId(projectId: string): void {
  if (typeof projectId !== "string" || projectId.length < 1 || projectId.length > 256) {
    throw new InterventionError("invalid_project_id", "projectId must be 1..256 characters");
  }
}

/** baselineVersionId shape (reality `vNNN` sequence ids). */
export function validateBaselineVersionId(versionId: string): void {
  if (typeof versionId !== "string" || !VERSION_ID.test(versionId)) {
    throw new InterventionError(
      "invalid_version_id",
      `baselineVersionId "${String(versionId)}" is not a vNNN sequence id`,
    );
  }
}

export function parseCreateScenarioInput(payload: unknown): CreateScenarioInput {
  if (!isRecord(payload)) {
    throw new InterventionError("invalid_scenario", "expected a JSON object");
  }
  const scenarioId = payload["scenarioId"];
  if (!isNonEmptyString(scenarioId)) {
    throw new InterventionError("invalid_scenario_id", "scenarioId must be a non-empty string");
  }
  validateScenarioId(scenarioId);
  const projectId = payload["projectId"];
  if (!isNonEmptyString(projectId)) {
    throw new InterventionError("invalid_project_id", "projectId must be a non-empty string");
  }
  validateProjectId(projectId);
  const title = payload["title"];
  if (!isNonEmptyString(title)) {
    throw new InterventionError("invalid_scenario", "title must be a non-empty string");
  }
  const baselineVersionId = payload["baselineVersionId"];
  if (!isNonEmptyString(baselineVersionId)) {
    throw new InterventionError(
      "invalid_version_id",
      "baselineVersionId must be a non-empty vNNN version id",
    );
  }
  validateBaselineVersionId(baselineVersionId);
  return { scenarioId, projectId, title, baselineVersionId };
}

function parseStepProvenance(value: unknown): StepProvenance {
  if (!isRecord(value)) {
    throw new InterventionError(
      "invalid_provenance",
      "provenance must be { evidenceIds: string[], derivationNote?: string }",
    );
  }
  const evidenceIds = value["evidenceIds"];
  if (evidenceIds !== undefined && !isStringArray(evidenceIds)) {
    throw new InterventionError(
      "invalid_evidence_id",
      "provenance.evidenceIds must be an array of non-empty strings",
    );
  }
  const derivationNote = value["derivationNote"];
  if (derivationNote !== undefined && !isNonEmptyString(derivationNote)) {
    throw new InterventionError(
      "invalid_provenance",
      "provenance.derivationNote must be a non-empty string",
    );
  }
  const ids = evidenceIds ?? [];
  // REQUIRED discipline: evidenceIds non-empty OR derivationNote present.
  if (ids.length === 0 && derivationNote === undefined) {
    throw new InterventionError(
      "missing_provenance",
      "a step requires provenance — a non-empty evidenceIds list and/or a derivationNote",
    );
  }
  return {
    evidenceIds: ids,
    ...(derivationNote === undefined ? {} : { derivationNote }),
  };
}

function parseStepProperty(value: unknown, where: string): StepPropertyPayload {
  if (!isRecord(value)) {
    throw new InterventionError("invalid_property", `${where}: expected an object`);
  }
  const key = value["key"];
  if (!isId(key)) {
    throw new InterventionError("invalid_property", `${where}: missing/invalid key`);
  }
  const propertyValue = value["value"];
  if (
    typeof propertyValue !== "string" &&
    typeof propertyValue !== "boolean" &&
    !(typeof propertyValue === "number" && Number.isFinite(propertyValue))
  ) {
    throw new InterventionError(
      "invalid_property",
      `${where}: value must be a finite number, string or boolean`,
    );
  }
  const unit = value["unit"];
  if (unit !== undefined && (typeof unit !== "string" || unit.length === 0)) {
    throw new InterventionError("invalid_property", `${where}: unit must be a non-empty string`);
  }
  // Same discipline as reality PropertyRecord: numeric values REQUIRE a
  // typed unit; non-numeric values carry none.
  if (typeof propertyValue === "number" && unit === undefined) {
    throw new InterventionError(
      "numeric_value_without_unit",
      `${where}: numeric value ${String(propertyValue)} requires a typed unit`,
    );
  }
  if (typeof propertyValue !== "number" && unit !== undefined) {
    throw new InterventionError("invalid_property", `${where}: non-numeric values carry no unit`);
  }
  return { key, value: propertyValue, ...(unit === undefined ? {} : { unit }) };
}

function parseStepProperties(value: unknown, where: string): readonly StepPropertyPayload[] {
  if (!Array.isArray(value)) {
    throw new InterventionError("invalid_property", `${where}: expected an array`);
  }
  return value.map((entry, index) => parseStepProperty(entry, `${where}[${String(index)}]`));
}

function parseGeometryRef(value: unknown, where: string): GeometryRef {
  // Carried VERBATIM (kind is compile-time typed; the geometry vocabulary
  // is the reality/geometry authorities', not re-validated here).
  if (!isRecord(value)) {
    throw new InterventionError("invalid_step_payload", `${where}: expected an object`);
  }
  const kind = value["kind"];
  const ref = value["ref"];
  if (!isNonEmptyString(kind) || !isNonEmptyString(ref)) {
    throw new InterventionError(
      "invalid_step_payload",
      `${where}: kind and ref must be non-empty strings (carried verbatim)`,
    );
  }
  const sourceArtifactId = value["sourceArtifactId"];
  if (sourceArtifactId !== undefined && !isNonEmptyString(sourceArtifactId)) {
    throw new InterventionError("invalid_step_payload", `${where}: sourceArtifactId must be text`);
  }
  return {
    kind: kind as GeometryRef["kind"],
    ref,
    ...(sourceArtifactId === undefined ? {} : { sourceArtifactId }),
  };
}

function parseUnitDeclaration(value: unknown, where: string): UnitDeclaration {
  if (!isRecord(value)) {
    throw new InterventionError("invalid_step_payload", `${where}: expected an object`);
  }
  const linear = value["linear"];
  const angular = value["angular"];
  if (!isNonEmptyString(linear) || !isNonEmptyString(angular)) {
    throw new InterventionError(
      "invalid_step_payload",
      `${where}: linear and angular must be non-empty unit strings`,
    );
  }
  return { linear, angular };
}

function parseStepNodePayload(value: unknown, where: string): StepNodePayload {
  if (!isRecord(value)) {
    throw new InterventionError("invalid_step_payload", `${where}: expected an object`);
  }
  const kind = value["kind"];
  if (!isNonEmptyString(kind)) {
    throw new InterventionError("invalid_step_payload", `${where}: kind must be a non-empty string`);
  }
  const properties = value["properties"];
  if (properties === undefined || !Array.isArray(properties)) {
    throw new InterventionError("invalid_property", `${where}: properties must be an array`);
  }
  const geometry = value["geometry"];
  if (geometry !== undefined) {
    parseGeometryRef(geometry, `${where}.geometry`);
  }
  const units = value["units"];
  if (units !== undefined) {
    parseUnitDeclaration(units, `${where}.units`);
  }
  return {
    kind: kind as NodeKind,
    properties: parseStepProperties(properties, `${where}.properties`),
    ...(geometry === undefined ? {} : { geometry: parseGeometryRef(geometry, `${where}.geometry`) }),
    ...(units === undefined ? {} : { units: parseUnitDeclaration(units, `${where}.units`) }),
  };
}

export function parseAddStepInput(payload: unknown): AddStepInput {
  if (!isRecord(payload)) {
    throw new InterventionError("invalid_step", "expected a JSON object");
  }
  const targetNodeId = payload["targetNodeId"];
  if (!isId(targetNodeId)) {
    throw new InterventionError("invalid_step", "targetNodeId must be a non-empty string (<=256)");
  }
  const kind = payload["kind"];
  if (!vocabularyMember(STEP_KINDS, kind)) {
    throw new InterventionError("invalid_step", `kind must be one of ${STEP_KINDS.join("|")}`);
  }
  const rationale = payload["rationale"];
  if (rationale !== undefined && !isNonEmptyString(rationale)) {
    throw new InterventionError("invalid_step", "rationale must be a non-empty string");
  }
  const provenance = parseStepProvenance(payload["provenance"]);

  let change: StepChange;
  if (kind === "property_change") {
    const property = payload["property"];
    if (!isRecord(property)) {
      throw new InterventionError("invalid_step_payload", "property_change requires { property }");
    }
    change = { kind, property: parseStepProperty(property, "property") };
  } else if (kind === "element_addition") {
    const node = payload["node"];
    if (!isRecord(node)) {
      throw new InterventionError("invalid_step_payload", "element_addition requires { node }");
    }
    const parentNodeId = payload["parentNodeId"];
    if (parentNodeId !== undefined && !isId(parentNodeId)) {
      throw new InterventionError("invalid_step_payload", "parentNodeId must be a non-empty string");
    }
    change = {
      kind,
      node: parseStepNodePayload(node, "node"),
      ...(parentNodeId === undefined ? {} : { parentNodeId }),
    };
  } else if (kind === "element_modification") {
    const geometry = payload["geometry"];
    if (geometry !== undefined) {
      parseGeometryRef(geometry, "geometry");
    }
    const units = payload["units"];
    if (units !== undefined) {
      parseUnitDeclaration(units, "units");
    }
    const properties = payload["properties"];
    if (properties !== undefined && !Array.isArray(properties)) {
      throw new InterventionError("invalid_property", "properties must be an array");
    }
    if (geometry === undefined && units === undefined && properties === undefined) {
      throw new InterventionError(
        "invalid_step_payload",
        "element_modification requires at least one of geometry, units or properties",
      );
    }
    change = {
      kind,
      ...(geometry === undefined ? {} : { geometry: parseGeometryRef(geometry, "geometry") }),
      ...(units === undefined ? {} : { units: parseUnitDeclaration(units, "units") }),
      ...(properties === undefined
        ? {}
        : { properties: parseStepProperties(properties, "properties") }),
    };
  } else if (kind === "proposed_removal") {
    const reason = payload["reason"];
    if (!isNonEmptyString(reason)) {
      throw new InterventionError(
        "invalid_step_payload",
        "proposed_removal requires a non-empty reason (a removal is never silent)",
      );
    }
    change = { kind, reason };
  } else {
    const text = payload["text"];
    if (!isNonEmptyString(text)) {
      throw new InterventionError("invalid_step_payload", "note requires a non-empty text");
    }
    change = { kind, text };
  }

  return {
    kind,
    targetNodeId,
    change,
    ...(rationale === undefined ? {} : { rationale }),
    provenance,
  };
}

export function parseApprovalReferenceInput(payload: unknown): ApprovalReferenceInput {
  if (!isRecord(payload)) {
    throw new InterventionError("invalid_approval_reference", "expected a JSON object");
  }
  const caseId = payload["caseId"];
  if (!isId(caseId)) {
    throw new InterventionError("invalid_approval_reference", "caseId must be a non-empty string");
  }
  const reviewDecision = payload["reviewDecision"];
  if (!isNonEmptyString(reviewDecision)) {
    throw new InterventionError(
      "invalid_approval_reference",
      "reviewDecision must be a non-empty string (recorded VERBATIM — the vocabulary is the Case domain's)",
    );
  }
  const reviewedAt = payload["reviewedAt"];
  if (!isNonEmptyString(reviewedAt)) {
    throw new InterventionError("invalid_approval_reference", "reviewedAt must be a non-empty string");
  }
  return { caseId, reviewDecision, reviewedAt };
}

export function parseStatusTransitionInput(payload: unknown): StatusTransitionInput {
  if (!isRecord(payload)) {
    throw new InterventionError("invalid_status_transition", "expected { status: string }");
  }
  const status = payload["status"];
  if (!vocabularyMember(SCENARIO_STATUSES, status)) {
    throw new InterventionError(
      "invalid_status_transition",
      `status must be one of ${SCENARIO_STATUSES.join("|")}`,
    );
  }
  return { status };
}

/* ------------------------------------------------------------------ */
/* Stored-record parser (store reads; garbage is a typed rejection,    */
/* never a silent misparse)                                            */
/* ------------------------------------------------------------------ */

function invalidRecord(detail: string): InterventionError {
  return new InterventionError("invalid_intervention_record", detail);
}

/**
 * Run a write-path parser for a STORED record and re-map any typed
 * rejection to `invalid_intervention_record` (store reads never surface
 * write-path codes; garbage on disk is a typed invalid-record error).
 */
function stored<T>(parse: () => T, where: string): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof InterventionError) {
      throw invalidRecord(`${where}: ${error.detail}`);
    }
    throw error;
  }
}

function parseStoredGeometryRef(value: unknown, where: string): GeometryRef {
  return stored(() => parseGeometryRef(value, where), where);
}

function parseStoredUnitDeclaration(value: unknown, where: string): UnitDeclaration {
  return stored(() => parseUnitDeclaration(value, where), where);
}

function parseStoredProvenanceRecord(value: unknown): ProvenanceRecord {
  if (!isRecord(value)) throw invalidRecord("provenance record is not an object");
  const role = value["role"];
  if (!isNonEmptyString(role)) throw invalidRecord("provenance.role");
  const recordedAt = value["recordedAt"];
  if (!isIso(recordedAt)) throw invalidRecord("provenance.recordedAt");
  const evidenceId = value["evidenceId"];
  if (evidenceId !== undefined && !isContentId(evidenceId)) {
    throw invalidRecord("provenance.evidenceId must be a 64-hex content address");
  }
  const sourceArtifactId = value["sourceArtifactId"];
  if (sourceArtifactId !== undefined && !isNonEmptyString(sourceArtifactId)) {
    throw invalidRecord("provenance.sourceArtifactId");
  }
  const derivationNote = value["derivationNote"];
  if (derivationNote !== undefined && !isNonEmptyString(derivationNote)) {
    throw invalidRecord("provenance.derivationNote");
  }
  return {
    role: role as ProvenanceRecord["role"],
    recordedAt,
    ...(evidenceId === undefined ? {} : { evidenceId }),
    ...(sourceArtifactId === undefined ? {} : { sourceArtifactId }),
    ...(derivationNote === undefined ? {} : { derivationNote }),
  };
}

function parseStoredProvenanceList(value: unknown, where: string): readonly ProvenanceRecord[] {
  if (!Array.isArray(value)) throw invalidRecord(`${where} must be an array`);
  return value.map(parseStoredProvenanceRecord);
}

function parseStoredProperty(value: unknown, where: string): ProposedProperty {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const key = value["key"];
  if (!isId(key)) throw invalidRecord(`${where}.key`);
  const propertyValue = value["value"];
  if (
    typeof propertyValue !== "string" &&
    typeof propertyValue !== "boolean" &&
    !(typeof propertyValue === "number" && Number.isFinite(propertyValue))
  ) {
    throw invalidRecord(`${where}.value`);
  }
  const unit = value["unit"];
  if (unit !== undefined && !isNonEmptyString(unit)) throw invalidRecord(`${where}.unit`);
  // THE STRUCTURAL INVARIANT, re-checked on every read: an intervention
  // state can ONLY contain PROPOSED content. Anything else on disk is
  // corruption, never silently re-read as a proposal.
  const epistemicStatus = value["epistemicStatus"];
  if (epistemicStatus !== "PROPOSED") {
    throw new InterventionError(
      "invalid_epistemic_status",
      `${where}: intervention state content must be PROPOSED — found "${String(epistemicStatus)}" ` +
        `on disk (an intervention layer is never observed/confirmed reality)`,
    );
  }
  if (typeof propertyValue === "number" && unit === undefined) {
    throw invalidRecord(`${where}: numeric value without a typed unit`);
  }
  return {
    key,
    value: propertyValue,
    ...(unit === undefined ? {} : { unit }),
    epistemicStatus: "PROPOSED",
    provenance: parseStoredProvenanceList(value["provenance"], `${where}.provenance`),
  };
}

function parseStoredNode(value: unknown, where: string): ProposedNode {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const nodeId = value["nodeId"];
  if (!isId(nodeId)) throw invalidRecord(`${where}.nodeId`);
  const kind = value["kind"];
  if (!isNonEmptyString(kind)) throw invalidRecord(`${where}.kind`);
  const epistemicStatus = value["epistemicStatus"];
  if (epistemicStatus !== "PROPOSED") {
    throw new InterventionError(
      "invalid_epistemic_status",
      `${where}: intervention state nodes must be PROPOSED — found "${String(epistemicStatus)}"`,
    );
  }
  const properties = value["properties"];
  if (!Array.isArray(properties)) throw invalidRecord(`${where}.properties`);
  const geometry = value["geometry"];
  if (geometry !== undefined) {
    parseStoredGeometryRef(geometry, `${where}.geometry`);
  }
  const units = value["units"];
  if (units !== undefined) {
    parseStoredUnitDeclaration(units, `${where}.units`);
  }
  return {
    nodeId,
    kind: kind as NodeKind,
    epistemicStatus: "PROPOSED",
    properties: properties.map((entry, index) =>
      parseStoredProperty(entry, `${where}.properties[${String(index)}]`),
    ),
    ...(geometry === undefined
      ? {}
      : { geometry: parseStoredGeometryRef(geometry, `${where}.geometry`) }),
    ...(units === undefined
      ? {}
      : { units: parseStoredUnitDeclaration(units, `${where}.units`) }),
    provenance: parseStoredProvenanceList(value["provenance"], `${where}.provenance`),
  };
}

function parseStoredStateNode(value: unknown, where: string): InterventionStateNode {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const nodeId = value["nodeId"];
  if (!isId(nodeId)) throw invalidRecord(`${where}.nodeId`);
  const origin = value["origin"];
  if (!vocabularyMember(STATE_NODE_ORIGINS, origin)) {
    throw invalidRecord(`${where}.origin must be baseline | baseline_touched | scenario`);
  }
  const appliedStepIds = value["appliedStepIds"];
  if (!isStringArray(appliedStepIds)) throw invalidRecord(`${where}.appliedStepIds`);
  return {
    nodeId,
    origin,
    appliedStepIds,
    node: parseStoredNode(value["node"], `${where}.node`),
  };
}

function parseStoredRelationship(value: unknown, where: string): Relationship {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const relationshipId = value["relationshipId"];
  if (!isId(relationshipId)) throw invalidRecord(`${where}.relationshipId`);
  const fromNodeId = value["fromNodeId"];
  const toNodeId = value["toNodeId"];
  if (!isId(fromNodeId) || !isId(toNodeId)) throw invalidRecord(`${where}.endpoints`);
  const kind = value["kind"];
  if (!isNonEmptyString(kind)) throw invalidRecord(`${where}.kind`);
  return {
    relationshipId,
    fromNodeId,
    toNodeId,
    kind: kind as Relationship["kind"],
    provenance: parseStoredProvenanceList(value["provenance"], `${where}.provenance`),
  };
}

function parseStoredStateRelationship(
  value: unknown,
  where: string,
): InterventionStateRelationship {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const relationshipId = value["relationshipId"];
  if (!isId(relationshipId)) throw invalidRecord(`${where}.relationshipId`);
  const origin = value["origin"];
  if (!vocabularyMember(STATE_RELATIONSHIP_ORIGINS, origin)) {
    throw invalidRecord(`${where}.origin must be baseline | scenario`);
  }
  return {
    relationshipId,
    origin,
    relationship: parseStoredRelationship(value["relationship"], `${where}.relationship`),
  };
}

function parseStoredTombstone(value: unknown, where: string): ProposedTombstone {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const nodeId = value["nodeId"];
  if (!isId(nodeId)) throw invalidRecord(`${where}.nodeId`);
  const reason = value["reason"];
  if (!isNonEmptyString(reason)) throw invalidRecord(`${where}.reason`);
  const proposedByStepId = value["proposedByStepId"];
  if (!isNonEmptyString(proposedByStepId)) throw invalidRecord(`${where}.proposedByStepId`);
  const severedRelationshipIds = value["severedRelationshipIds"];
  if (!isStringArray(severedRelationshipIds)) {
    throw invalidRecord(`${where}.severedRelationshipIds`);
  }
  return { nodeId, reason, proposedByStepId, severedRelationshipIds };
}

function parseStoredState(value: unknown, where: string): InterventionState {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const stateId = value["stateId"];
  if (!isContentId(stateId)) throw invalidRecord(`${where}.stateId must be a 64-hex content id`);
  const scenarioId = value["scenarioId"];
  if (!isId(scenarioId)) throw invalidRecord(`${where}.scenarioId`);
  const stateIndex = value["stateIndex"];
  if (typeof stateIndex !== "number" || !Number.isInteger(stateIndex) || stateIndex < 0) {
    throw invalidRecord(`${where}.stateIndex must be a non-negative integer`);
  }
  const baselineVersionId = value["baselineVersionId"];
  if (!isNonEmptyString(baselineVersionId)) throw invalidRecord(`${where}.baselineVersionId`);
  const appliedStepIds = value["appliedStepIds"];
  if (!isStringArray(appliedStepIds)) throw invalidRecord(`${where}.appliedStepIds`);
  const nodes = value["nodes"];
  if (!Array.isArray(nodes)) throw invalidRecord(`${where}.nodes`);
  const relationships = value["relationships"];
  if (!Array.isArray(relationships)) throw invalidRecord(`${where}.relationships`);
  const proposedTombstones = value["proposedTombstones"];
  if (!Array.isArray(proposedTombstones)) throw invalidRecord(`${where}.proposedTombstones`);
  const materializedAt = value["materializedAt"];
  if (!isIso(materializedAt)) throw invalidRecord(`${where}.materializedAt`);
  return {
    stateId,
    scenarioId,
    stateIndex,
    baselineVersionId,
    appliedStepIds,
    nodes: nodes.map((entry, index) =>
      parseStoredStateNode(entry, `${where}.nodes[${String(index)}]`),
    ),
    relationships: relationships.map((entry, index) =>
      parseStoredStateRelationship(entry, `${where}.relationships[${String(index)}]`),
    ),
    proposedTombstones: proposedTombstones.map((entry, index) =>
      parseStoredTombstone(entry, `${where}.proposedTombstones[${String(index)}]`),
    ),
    materializedAt,
  };
}

function parseStoredStep(value: unknown, where: string): InterventionStep {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const stepId = value["stepId"];
  if (!isNonEmptyString(stepId)) throw invalidRecord(`${where}.stepId`);
  const stepIndex = value["stepIndex"];
  if (typeof stepIndex !== "number" || !Number.isInteger(stepIndex) || stepIndex < 1) {
    throw invalidRecord(`${where}.stepIndex must be a positive integer`);
  }
  const kind = value["kind"];
  if (!vocabularyMember(STEP_KINDS, kind)) throw invalidRecord(`${where}.kind`);
  const targetNodeId = value["targetNodeId"];
  if (!isId(targetNodeId)) throw invalidRecord(`${where}.targetNodeId`);
  const recordedAt = value["recordedAt"];
  if (!isIso(recordedAt)) throw invalidRecord(`${where}.recordedAt`);
  const rationale = value["rationale"];
  if (rationale !== undefined && !isNonEmptyString(rationale)) {
    throw invalidRecord(`${where}.rationale`);
  }
  // Re-parse the change payload through the SAME boundary path used on
  // write (single validation path — a stored step is re-validated as if
  // it arrived from the wire). The payload must carry its kind's fields.
  const change = value["change"];
  if (!isRecord(change)) throw invalidRecord(`${where}.change`);
  const parsed = stored(
    () =>
      parseAddStepInput({
        kind,
        targetNodeId,
        ...(rationale === undefined ? {} : { rationale }),
        provenance: value["provenance"],
        property: change["property"],
        node: change["node"],
        parentNodeId: change["parentNodeId"],
        geometry: change["geometry"],
        units: change["units"],
        properties: change["properties"],
        reason: change["reason"],
        text: change["text"],
      }),
    where,
  );
  return {
    stepId,
    stepIndex,
    kind,
    targetNodeId,
    change: parsed.change,
    ...(rationale === undefined ? {} : { rationale }),
    provenance: parsed.provenance,
    recordedAt,
  };
}

function parseStoredTransition(value: unknown, where: string): ScenarioTransition {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const status = value["status"];
  if (!vocabularyMember(SCENARIO_STATUSES, status)) throw invalidRecord(`${where}.status`);
  const at = value["at"];
  if (!isIso(at)) throw invalidRecord(`${where}.at`);
  return { status, at };
}

function parseStoredApprovalReference(value: unknown): ApprovalReference {
  if (!isRecord(value)) throw invalidRecord("approvalReference is not an object");
  const caseId = value["caseId"];
  if (!isId(caseId)) throw invalidRecord("approvalReference.caseId");
  const reviewDecision = value["reviewDecision"];
  if (!isNonEmptyString(reviewDecision)) throw invalidRecord("approvalReference.reviewDecision");
  const reviewedAt = value["reviewedAt"];
  if (!isNonEmptyString(reviewedAt)) throw invalidRecord("approvalReference.reviewedAt");
  return { caseId, reviewDecision, reviewedAt };
}

/**
 * Structural validation of a persisted scenario record (store reads;
 * garbage on disk is a typed `invalid_intervention_record` rejection — or
 * `invalid_epistemic_status` when the PROPOSED-only invariant is violated —
 * never a silent misparse). Deep integrity: states[i] is layer i,
 * appliedStepIds zip against step ids, and the pinned baseline version
 * appears on every state.
 */
export function parseInterventionScenarioRecord(value: unknown): InterventionScenario {
  if (!isRecord(value)) throw invalidRecord("scenario record is not a JSON object");
  const scenarioId = value["scenarioId"];
  if (!isId(scenarioId)) throw invalidRecord("scenarioId");
  const projectId = value["projectId"];
  if (!isId(projectId)) throw invalidRecord("projectId");
  const title = value["title"];
  if (!isNonEmptyString(title)) throw invalidRecord("title");
  const baselineVersionId = value["baselineVersionId"];
  if (!isNonEmptyString(baselineVersionId)) throw invalidRecord("baselineVersionId");
  validateBaselineVersionId(baselineVersionId);
  const createdAt = value["createdAt"];
  if (!isIso(createdAt)) throw invalidRecord("createdAt");
  const updatedAt = value["updatedAt"];
  if (!isIso(updatedAt)) throw invalidRecord("updatedAt");
  const status = value["status"];
  if (!vocabularyMember(SCENARIO_STATUSES, status)) throw invalidRecord("status");
  const steps = value["steps"];
  if (!Array.isArray(steps)) throw invalidRecord("steps must be an array");
  const states = value["states"];
  if (!Array.isArray(states)) throw invalidRecord("states must be an array");
  const transitions = value["transitions"];
  if (!Array.isArray(transitions)) throw invalidRecord("transitions must be an array");
  const approvalReference = value["approvalReference"];

  const parsedSteps = steps.map((entry, index) => parseStoredStep(entry, `steps[${String(index)}]`));
  const parsedStates = states.map((entry, index) =>
    parseStoredState(entry, `states[${String(index)}]`),
  );
  const parsedTransitions = transitions.map((entry, index) =>
    parseStoredTransition(entry, `transitions[${String(index)}]`),
  );

  // Append-only integrity: layer N is exactly steps 1..N applied, every
  // state carries the PINNED baseline, and step indices are 1..n with no
  // gaps and no duplicate ids.
  if (parsedStates.length !== parsedSteps.length + 1) {
    throw invalidRecord(
      `states length (${String(parsedStates.length)}) must equal steps length + 1 ` +
        `(${String(parsedSteps.length + 1)})`,
    );
  }
  const seenStepIds = new Set<string>();
  parsedSteps.forEach((step, index) => {
    if (step.stepIndex !== index + 1) {
      throw invalidRecord(`steps[${String(index)}].stepIndex must be ${String(index + 1)}`);
    }
    if (seenStepIds.has(step.stepId)) {
      throw invalidRecord(`duplicate stepId ${step.stepId}`);
    }
    seenStepIds.add(step.stepId);
  });
  parsedStates.forEach((state, index) => {
    if (state.stateIndex !== index) {
      throw invalidRecord(`states[${String(index)}].stateIndex must be ${String(index)}`);
    }
    if (state.scenarioId !== scenarioId) {
      throw invalidRecord(`states[${String(index)}].scenarioId must be ${scenarioId}`);
    }
    if (state.baselineVersionId !== baselineVersionId) {
      throw invalidRecord(
        `states[${String(index)}].baselineVersionId must equal the pinned ${baselineVersionId}`,
      );
    }
    if (state.appliedStepIds.length !== index) {
      throw invalidRecord(
        `states[${String(index)}].appliedStepIds length must be ${String(index)}`,
      );
    }
    state.appliedStepIds.forEach((stepId, stepPosition) => {
      if (parsedSteps[stepPosition]?.stepId !== stepId) {
        throw invalidRecord(
          `states[${String(index)}].appliedStepIds[${String(stepPosition)}] must be ` +
            `${parsedSteps[stepPosition]?.stepId ?? "<missing>"} — found ${stepId}`,
        );
      }
    });
  });

  return {
    scenarioId,
    projectId,
    title,
    baselineVersionId,
    createdAt,
    updatedAt,
    status,
    steps: parsedSteps,
    states: parsedStates,
    ...(approvalReference === undefined
      ? {}
      : { approvalReference: parseStoredApprovalReference(approvalReference) }),
    transitions: parsedTransitions,
  };
}
