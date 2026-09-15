/**
 * AISE-028 — Intervention quantities/cost impacts domain model.
 *
 * Contract (spec/work-orders.md §028: "Owner ZAI. Calculate quantities and
 * BOQ impacts of proposed steps from deterministic geometry/state deltas.
 * Verify units, uncertainty and source mapping. CRITICAL.";
 * spec/requirements.md R11 — "layer N is a deterministic proposed state;
 * proposed state cannot overwrite observed reality; quantities/cost impacts
 * are traceable"; R8 — "BOQ hierarchy/cost views with source traceability";
 * R9 — "compare BOQ scope/quantities to observed/modelled reality without
 * silently altering either source"; spec/domain-model.md "Intervention
 * semantics" — "The same state ID feeds 3D, 2D, BOQ and report projections";
 * "Versioning" — append-only, derived reprocessing never erases prior
 * evidence):
 *
 * IMPACTS ARE DERIVED PROJECTIONS, NEVER AUTHORITATIVE (the module's
 * defining constraint):
 *
 *  - An `ImpactRecord` is a deterministic function of (scenario, state
 *    index, state id, baseline version, BOQ import + mapping revision,
 *    caller-supplied rates). Recomputing over the same inputs yields a
 *    byte-identical report (the report digest pins it; a stored record that
 *    disagrees with a fresh recomputation is a typed
 *    `impact_record_divergence` refusal, never a silently stale answer).
 *    The AUTHORITATIVE sources — intervention scenarios/states (AISE-026)
 *    and BOQ imports/mappings (AISE-011/014/017) — are consumed through
 *    injected READ-ONLY resolvers (see service.ts) and are NEVER mutated:
 *    there is no code path from this module into intervention or BOQ
 *    writes (the sibling imports below are TYPE-only and erased).
 *  - PROPOSED-LITERAL: every quantity and cost figure describes a PROPOSED
 *    state delta, never observed reality. Every `ImpactLine` and
 *    `CostImpact` carries the LITERAL type `"PROPOSED"`; a request that
 *    claims `OBSERVED` (or any other status) is a typed
 *    `invalid_epistemic_status` boundary rejection, and the stored-record
 *    parser re-rejects any non-PROPOSED status found on disk — garbage is
 *    never silently re-read as a different epistemic class.
 *  - UNITS ARE TYPED, NEVER BARE: every quantity carries a REQUIRED unit
 *    string (the property's own unit, carried verbatim). Unit relations
 *    against BOQ item units are ASSESSED lexically only (`same`,
 *    `different`, `unknown`) — this module NEVER converts units and never
 *    treats different unit spellings as equivalent; a numeric delta across
 *    different units is a typed omission (`unit_mismatch_not_computed`),
 *    not a guessed conversion.
 *  - UNCERTAINTY PROPAGATION (first-order, the AISE-013 discipline):
 *    measurement/tolerance 1σ stated on an underlying property assertion
 *    propagates into the derived quantity (σ_Δ = sqrt(σ_to² + σ_from²) for
 *    independent deltas). NO stated σ means uncertainty `null` = "not
 *    stated" — NEVER zero, and an unknown σ on either side dominates to
 *    `null` (never a false-precision number). Cost uncertainty is
 *    |rate|·σ_quantity for priced lines.
 *  - SOURCE MAPPING (R8/R9/R11 traceability): every quantity/cost line
 *    traces to (a) the STEP delta that produced it (`stepId`/`stepIndex`,
 *    reconstructed deterministically from the step payloads) and (b) the
 *    BOQ item mappings it maps to (`boqMappings`, carried verbatim with
 *    source cell refs). Deltas with NO BOQ mapping are reported honestly
 *    as lines with an empty `boqMappings` list — never dropped.
 *  - HONEST OMISSIONS: geometry that cannot yield a quantity (only a
 *    reference is available — missing boundary; or a non-projectable kind
 *    such as mesh/point-cloud refs) is a TYPED omission code on the line,
 *    never a silent zero. Every line carries exactly one of
 *    {quantity, omissionCode}.
 *
 * Determinism: content-derived ids (`impactId` = sha-256 over the canonical
 * request identity; `line-`/`cost-` ids derive from content), canonical JSON
 * everywhere, injected clock only, no randomness, no I/O in this file.
 *
 * This module owns the frozen vocabularies, record types, the typed error
 * registry, boundary input parsers, the canonical digest helpers and the
 * stored-record parser. Policy lives in `service.ts`; persistence in
 * `store.ts`; transport in `router.ts`.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import { propagateUncertainty } from "../geometry/uncertainty";
// READ-ONLY TYPE imports from the owning authorities (erased at runtime —
// no value, store or write function ever crosses this boundary):
import type { InterventionScenario } from "../intervention/model";
import type { BoqImport, BoqDocument } from "../boq/model";
import type { BoqMapping } from "../boq/mapping/model";

/* ------------------------------------------------------------------ */
/* Vocabularies (frozen: `as const` types + Object.freeze runtime)      */
/* ------------------------------------------------------------------ */

/**
 * The one representable epistemic status of an impact figure: it describes
 * a PROPOSED state delta (R11). OBSERVED/INFERRED/CONFIRMED impact figures
 * are unrepresentable by construction — observed reality stays with the
 * Reality Graph authority.
 */
export const IMPACT_EPISTEMIC_STATUSES = Object.freeze(["PROPOSED"] as const);
export type ImpactEpistemicStatus = (typeof IMPACT_EPISTEMIC_STATUSES)[number];

/** What kind of state delta produced one impact line. */
export const IMPACT_LINE_KINDS = Object.freeze([
  /** A property of a baseline-carried node changed (added/changed/removed key). */
  "property_delta",
  /** A scenario-authored element was added (per-property lines). */
  "element_added",
  /** A baseline-carried element is proposed for removal (per-property lines). */
  "element_removed",
  /** A node's geometry reference was added, swapped or removed. */
  "geometry_delta",
] as const);
export type ImpactLineKind = (typeof IMPACT_LINE_KINDS)[number];

/**
 * Typed omission codes — the HONEST UNKNOWN registry. A line carries one of
 * these exactly when it carries NO quantity; a silent zero is never
 * representable. Cost-side omissions live in `IMPACT_COST_OMISSION_CODES`.
 */
export const IMPACT_OMISSION_CODES = Object.freeze([
  /** The changed property's values are categorical/text — recorded verbatim, no quantity by nature. */
  "non_quantifiable_property",
  /** Numeric delta across DIFFERENT units — both recorded verbatim; no conversion is invented. */
  "unit_mismatch_not_computed",
  /** A projectable geometry kind (plane/polygon), but only a REFERENCE is available — no boundary data to quantify. */
  "geometry_ref_unresolved",
  /** The geometry kind is not projectable to a quantity by this module (mesh-ref/point-cloud-ref). */
  "non_projectable_geometry_kind",
  /** An added/removed element carries no properties and no geometry — the delta exists but yields nothing quantifiable. */
  "element_without_quantifiable_content",
] as const);
export type ImpactOmissionCode = (typeof IMPACT_OMISSION_CODES)[number];

/** Cost-side omission codes (why a mapped, quantified pair produced no cost figure). */
export const IMPACT_COST_OMISSION_CODES = Object.freeze([
  /** The caller supplied no rate for the mapped BOQ entry. */
  "rate_not_supplied",
  /** A rate exists but the delta unit differs from the BOQ item's unit — never priced across units. */
  "unit_mismatch_not_priced",
] as const);
export type ImpactCostOmissionCode = (typeof IMPACT_COST_OMISSION_CODES)[number];

/**
 * Lexical unit relation between a line's quantity unit and a mapped BOQ
 * item's verbatim unit text. `same`/`different` compare the trimmed strings
 * ONLY — this module interprets no unit semantics (mm ≠ m, m2 ≠ m²; unit
 * interpretation is the BOQ Lens normalization authority's domain).
 * `unknown` = the BOQ item has no resolvable unit text; `not_applicable` =
 * the line carries no quantity to relate.
 */
export const IMPACT_UNIT_RELATIONS = Object.freeze([
  "same",
  "different",
  "unknown",
  "not_applicable",
] as const);
export type ImpactUnitRelation = (typeof IMPACT_UNIT_RELATIONS)[number];

/** Append-only impact-record event types (write-once records: one event). */
export const IMPACT_EVENT_TYPES = Object.freeze(["impact_computed"] as const);
export type ImpactEventType = (typeof IMPACT_EVENT_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)           */
/* ------------------------------------------------------------------ */

export const IMPACT_ERROR_CODES = Object.freeze([
  // boundary shape / vocabulary validation (422 at the HTTP boundary)
  "invalid_impact",
  "invalid_epistemic_status",
  "invalid_rate_input",
  "invalid_state_index",
  // semantic invariants (422)
  "unknown_scenario_ref",
  "state_not_found",
  "mapping_not_available",
  "scenario_projection_invalid",
  "impact_record_divergence",
  // persisted-record guard (422)
  "invalid_impact_record",
  // not-found (404)
  "impact_not_found",
  // identity / addressing (400)
  "invalid_impact_id",
  "invalid_scenario_ref",
  "invalid_import_ref",
] as const);
export type ImpactErrorCode = (typeof IMPACT_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class ImpactError extends Error {
  readonly code: ImpactErrorCode;
  readonly detail: string;

  constructor(code: ImpactErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ImpactError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Read-only input projections (MY types — the resolvers' contract)     */
/* ------------------------------------------------------------------ */

/**
 * A property assertion as seen by the impact domain: key/value/unit
 * VERBATIM plus an optional stated 1σ. The production adapter projects the
 * intervention authority's `ProposedProperty` (which carries no
 * uncertainty) — so real-world impact quantities honestly report
 * `uncertainty: null` ("not stated") until the property model carries σ;
 * the propagation machinery is exercised through resolver implementations
 * that DO state σ (see testkit + service tests).
 */
export interface ImpactPropertyInput {
  readonly key: string;
  readonly value: string | number | boolean;
  /** REQUIRED for numeric values; absent for non-numeric (verbatim). */
  readonly unit?: string;
  /** Stated 1σ of the underlying property assertion; ABSENT = not stated. */
  readonly uncertainty?: number;
}

/** A geometry reference, verbatim (kind + stable ref id). */
export interface ImpactGeometryRefInput {
  readonly kind: string;
  readonly ref: string;
}

/**
 * The projected change payload of one step — one discriminated member per
 * step kind, carrying exactly what quantity attribution needs. Values and
 * units are carried VERBATIM from the intervention authority's records.
 */
export type ImpactStepChange =
  | { readonly kind: "property_change"; readonly property: ImpactPropertyInput }
  | {
      readonly kind: "element_addition";
      readonly node: {
        readonly kind: string;
        readonly properties: readonly ImpactPropertyInput[];
        readonly geometry?: ImpactGeometryRefInput;
      };
      readonly parentNodeId?: string;
    }
  | {
      readonly kind: "element_modification";
      readonly geometry?: ImpactGeometryRefInput;
      readonly properties?: readonly ImpactPropertyInput[];
    }
  | { readonly kind: "proposed_removal"; readonly reason: string }
  | { readonly kind: "note"; readonly text: string };

/** One ordered step of the scenario, projected read-only. */
export interface ImpactStepInput {
  readonly stepId: string;
  readonly stepIndex: number;
  /** Step kind, verbatim (property_change|element_addition|element_modification|proposed_removal|note). */
  readonly kind: string;
  readonly targetNodeId: string;
  readonly change: ImpactStepChange;
}

/** One node of a materialized state layer, projected read-only. */
export interface ImpactStateNodeInput {
  readonly nodeId: string;
  /** Node origin in the layer, verbatim (baseline|baseline_touched|scenario). */
  readonly origin: string;
  /** Steps that touched this node (empty for untouched baseline content). */
  readonly appliedStepIds: readonly string[];
  /** Node kind, verbatim. */
  readonly kind: string;
  readonly properties: readonly ImpactPropertyInput[];
  readonly geometry?: ImpactGeometryRefInput;
}

/** A PROPOSED tombstone of a materialized state layer, projected read-only. */
export interface ImpactTombstoneInput {
  readonly nodeId: string;
  /** Verbatim from the removal step's reason. */
  readonly reason: string;
  readonly proposedByStepId: string;
  readonly severedRelationshipIds: readonly string[];
}

/** One materialized state layer, projected read-only. */
export interface ImpactStateInput {
  readonly stateId: string;
  readonly stateIndex: number;
  readonly baselineVersionId: string;
  readonly appliedStepIds: readonly string[];
  readonly nodes: readonly ImpactStateNodeInput[];
  readonly proposedTombstones: readonly ImpactTombstoneInput[];
}

/**
 * The impact domain's READ-ONLY projection of an intervention scenario: the
 * governance spine plus the materialized layer content the quantity
 * computation diffs. Produced by the resolver implementations (the
 * production adapter projects the AISE-026 authority's `InterventionScenario`).
 */
export interface ImpactScenarioInput {
  readonly scenarioId: string;
  readonly projectId: string;
  readonly title: string;
  /** Scenario status, verbatim (draft|under_review|approved|rejected|superseded). */
  readonly status: string;
  readonly baselineVersionId: string;
  readonly steps: readonly ImpactStepInput[];
  /** States 0..N in layer order (state 0 = the pure baseline overlay). */
  readonly states: readonly ImpactStateInput[];
}

/**
 * One BOQ item's mapping outcome as seen by the impact domain: the verbatim
 * BOQ-side anchor (source text + cell refs — R8 source traceability), the
 * committed reality-graph targets, the verbatim mapping status/confidence/
 * method, and the verbatim unit cell text resolved from the BOQ source
 * (null when the source carries none or the cell is unresolvable — an
 * honest unknown, never a guessed unit).
 */
export interface ImpactBoqItemInput {
  readonly entryId: string;
  readonly sectionTitle: string | null;
  readonly rowNumber: number;
  /** VERBATIM description text (source spelling/whitespace untouched). */
  readonly originalText: string;
  readonly descriptionCellRef: string | null;
  readonly unitCellRef: string | null;
  /** VERBATIM unit cell text from the BOQ source; null when unresolvable. */
  readonly unitText: string | null;
  /** Mapping status, verbatim (mapped|ambiguous|unmapped). */
  readonly status: string;
  /** Mapping confidence, verbatim (high|medium|low|uncertain). */
  readonly confidence: string;
  /** Mapping method, verbatim. */
  readonly method: string;
  /** Committed reality-graph node ids (empty for ambiguous/unmapped entries). */
  readonly targets: readonly string[];
}

/** The impact domain's READ-ONLY projection of one BOQ mapping revision. */
export interface ImpactBoqMappingInput {
  readonly importId: string;
  readonly mappingId: string;
  readonly version: number;
  readonly entries: readonly ImpactBoqItemInput[];
}

/* ------------------------------------------------------------------ */
/* Report types (the derived projection — never authoritative)          */
/* ------------------------------------------------------------------ */

/**
 * A quantity figure: a SIGNED delta value with its REQUIRED typed unit and
 * its propagated 1σ. `uncertainty: null` means "not stated" — never zero;
 * a stated 0 is an explicit "measured exactly" assertion by the source.
 */
export interface ImpactQuantity {
  readonly value: number;
  readonly unit: string;
  readonly uncertainty: number | null;
}

/** Why/how the line exists: the verbatim delta content it was derived from. */
export interface ImpactBasis {
  readonly propertyKey?: string;
  /** The pre-delta value (absent when the property/geometry did not exist before). */
  readonly fromValue?: string | number | boolean;
  readonly fromUnit?: string;
  /** The post-delta value (absent when the property/geometry is gone after). */
  readonly toValue?: string | number | boolean;
  readonly toUnit?: string;
  readonly geometryFrom?: ImpactGeometryRefInput;
  readonly geometryTo?: ImpactGeometryRefInput;
}

/** One BOQ item mapping traced by a line (verbatim source anchors). */
export interface ImpactBoqMappingRef {
  readonly importId: string;
  readonly entryId: string;
  readonly rowNumber: number;
  readonly sectionTitle: string | null;
  /** VERBATIM BOQ description text. */
  readonly originalText: string;
  readonly descriptionCellRef: string | null;
  readonly unitCellRef: string | null;
  /** VERBATIM unit cell text; null when unresolvable. */
  readonly unitText: string | null;
  readonly status: string;
  readonly confidence: string;
  readonly method: string;
  /** Lexical relation to the line quantity's unit (never a conversion). */
  readonly unitRelation: ImpactUnitRelation;
}

/**
 * One quantity/cost impact line — the atomic traceability unit: the step
 * delta that produced it (a), the node it applies to, the verbatim basis,
 * exactly one of {quantity, omissionCode}, and the BOQ item mappings it
 * maps to (b) — possibly NONE (unmapped deltas are reported, never dropped).
 */
export interface ImpactLine {
  /** Content-derived stable id (`line-<16 hex>`). */
  readonly lineId: string;
  readonly kind: ImpactLineKind;
  /** Trace (a): the step whose delta produced this line. */
  readonly stepId: string;
  readonly stepIndex: number;
  readonly targetNodeId: string;
  /** Node origin in the target layer, verbatim. */
  readonly origin: string;
  readonly basis: ImpactBasis;
  readonly quantity: ImpactQuantity | null;
  readonly omissionCode: ImpactOmissionCode | null;
  readonly epistemicStatus: "PROPOSED";
  /** Trace (b): the BOQ item mappings for this line's node; [] = unmapped. */
  readonly boqMappings: readonly ImpactBoqMappingRef[];
  /** Present on element_removed lines: relationships severed by the removal. */
  readonly severedRelationshipIds?: readonly string[];
}

/** A caller-supplied rate for one BOQ mapping entry (recorded verbatim). */
export interface ImpactRate {
  readonly entryId: string;
  /** Rate amount per BOQ item unit; finite, >= 0. */
  readonly amount: number;
  /** Currency identifier, verbatim (never interpreted here). */
  readonly currency: string;
}

/**
 * One cost impact figure: a quantified line × a same-unit mapped BOQ entry
 * × a caller-supplied rate. Amount = quantity × rate (signed — a removed
 * scope is a credit). Costs are NEVER invented: no rate, no cost figure.
 */
export interface CostImpact {
  /** Content-derived stable id (`cost-<16 hex>`). */
  readonly costId: string;
  /** Trace to the quantity line (and through it to the step delta). */
  readonly lineId: string;
  /** Trace to the BOQ mapping entry. */
  readonly entryId: string;
  readonly quantity: {
    readonly value: number;
    readonly unit: string;
  };
  readonly rate: {
    readonly amount: number;
    readonly currency: string;
  };
  /** quantity.value × rate.amount (signed). */
  readonly amount: number;
  /** |rate.amount| × σ_quantity; null = not stated (never zero-by-default). */
  readonly uncertainty: number | null;
  readonly epistemicStatus: "PROPOSED";
}

/** A mapped, quantified pair that produced NO cost figure, with the typed reason. */
export interface ImpactUnpricedPair {
  readonly lineId: string;
  readonly entryId: string;
  readonly code: ImpactCostOmissionCode;
}

/** Deterministic counters over one report (pure derivation of the lines). */
export interface ImpactSummary {
  readonly lineCount: number;
  readonly quantityLineCount: number;
  readonly omissionLineCount: number;
  readonly mappedLineCount: number;
  readonly unmappedLineCount: number;
  readonly boqMappingRefCount: number;
  readonly costImpactCount: number;
  readonly unpricedPairCount: number;
  readonly unpricedByReason: {
    readonly rate_not_supplied: number;
    readonly unit_mismatch_not_priced: number;
  };
  /** Omission-code histogram (only codes that occur are present). */
  readonly omissionsByCode: Readonly<Record<string, number>>;
}

/**
 * The derived quantities/cost impact projection of one scenario state
 * layer against its layer-0 baseline overlay, mapped onto one BOQ mapping
 * revision. Deterministic: the same resolvers' outputs plus the same rates
 * yield a byte-identical report (pinned by `impactReportDigest`).
 */
export interface ImpactReport {
  readonly scenarioId: string;
  readonly projectId: string;
  readonly scenarioStatus: string;
  readonly title: string;
  /** The materialized layer this report describes (layer N). */
  readonly stateId: string;
  readonly stateIndex: number;
  readonly baselineVersionId: string;
  /** Steps 1..stateIndex in application order (the diff window's full spine). */
  readonly appliedStepIds: readonly string[];
  readonly importId: string;
  readonly mappingId: string;
  readonly mappingVersion: number;
  readonly epistemicStatus: "PROPOSED";
  readonly lines: readonly ImpactLine[];
  readonly costImpacts: readonly CostImpact[];
  readonly unpricedPairs: readonly ImpactUnpricedPair[];
  /** Caller-supplied rates, verbatim, sorted by entryId (cost provenance). */
  readonly rates: readonly ImpactRate[];
  readonly summary: ImpactSummary;
}

/** One append-only audit event: pins the full report content digest. */
export interface ImpactEvent {
  readonly eventId: string;
  readonly eventType: ImpactEventType;
  readonly occurredAt: string;
  /** sha256 of the canonical report AFTER the computation this event pins. */
  readonly reportDigest: string;
}

/**
 * The persisted write-once record of one impact computation. `impactId` is
 * the content id of the resolved request identity — the same inputs always
 * derive the same id, and a DIFFERENT mapping revision or rate set derives
 * a NEW record (append-only: prior records are never rewritten or erased).
 */
export interface ImpactRecord {
  readonly impactId: string;
  /** The resolved request identity the report is a function of. */
  readonly request: {
    readonly scenarioId: string;
    readonly stateId: string;
    readonly stateIndex: number;
    readonly baselineVersionId: string;
    readonly importId: string;
    readonly mappingId: string;
    readonly mappingVersion: number;
  };
  readonly report: ImpactReport;
  /** sha256 over the canonical report — the determinism pin. */
  readonly reportDigest: string;
  /** Injected clock — when the record was written. */
  readonly recordedAt: string;
  readonly history: readonly ImpactEvent[];
}

/** List projection (never the full record). */
export interface ImpactSummaryRecord {
  readonly impactId: string;
  readonly scenarioId: string;
  readonly stateId: string;
  readonly stateIndex: number;
  readonly importId: string;
  readonly mappingVersion: number;
  readonly lineCount: number;
  readonly costImpactCount: number;
  readonly recordedAt: string;
}

/** Pure list projection of one impact record. */
export function summarizeImpact(record: ImpactRecord): ImpactSummaryRecord {
  return {
    impactId: record.impactId,
    scenarioId: record.request.scenarioId,
    stateId: record.request.stateId,
    stateIndex: record.request.stateIndex,
    importId: record.request.importId,
    mappingVersion: record.request.mappingVersion,
    lineCount: record.report.lines.length,
    costImpactCount: record.report.costImpacts.length,
    recordedAt: record.recordedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Digests and content-derived ids                                     */
/* ------------------------------------------------------------------ */

/** sha256 over the canonical JSON of the report (the determinism pin). */
export function impactReportDigest(report: ImpactReport): string {
  return sha256Hex(canonicalJsonStringify(report));
}

/**
 * Deterministic impact id: sha-256 over the canonical JSON of the resolved
 * request identity. Pure — the same (scenario, state, baseline, BOQ mapping
 * revision, rates) always derives the same id; any input change (a new
 * mapping version, different rates, a different state layer) derives a NEW
 * record (append-only growth, prior evidence preserved).
 */
export function deriveImpactId(identity: {
  readonly scenarioId: string;
  readonly stateId: string;
  readonly stateIndex: number;
  readonly baselineVersionId: string;
  readonly importId: string;
  readonly mappingId: string;
  readonly mappingVersion: number;
  readonly rates: readonly ImpactRate[];
}): string {
  return sha256Hex(
    canonicalJsonStringify({
      kind: "aise-impact/v1",
      scenarioId: identity.scenarioId,
      stateId: identity.stateId,
      stateIndex: identity.stateIndex,
      baselineVersionId: identity.baselineVersionId,
      importId: identity.importId,
      mappingId: identity.mappingId,
      mappingVersion: identity.mappingVersion,
      rates: identity.rates,
    }),
  );
}

/** Deterministic line id: `line-<16 hex>` over the report-scoped line identity. */
export function deriveLineId(
  impactId: string,
  targetNodeId: string,
  kind: ImpactLineKind,
  discriminator: string,
): string {
  return `line-${sha256Hex(`${impactId}:${targetNodeId}:${kind}:${discriminator}`).slice(0, 16)}`;
}

/** Deterministic cost id: `cost-<16 hex>` over the (line, entry) pair. */
export function deriveCostId(lineId: string, entryId: string): string {
  return `cost-${sha256Hex(`${lineId}:${entryId}`).slice(0, 16)}`;
}

/* ------------------------------------------------------------------ */
/* Uncertainty propagation (first-order; the AISE-013 discipline)       */
/* ------------------------------------------------------------------ */

/**
 * σ for a two-sided property delta (to − from, independent inputs):
 * σ_Δ = sqrt(σ_to² + σ_from²) through the geometry module's single
 * auditable propagation point. ABSENT σ on either side means "not stated"
 * and dominates to null — never a false-precision number.
 */
export function propagateDeltaUncertainty(
  toValue: number,
  fromValue: number,
  toSigma: number | undefined,
  fromSigma: number | undefined,
): { readonly value: number; readonly uncertainty: number | null } {
  return propagateUncertainty(toValue - fromValue, [1, -1], [
    toSigma ?? null,
    fromSigma ?? null,
  ]);
}

/**
 * σ for a single-sided quantity (an added or removed element's property):
 * σ = the property's own stated 1σ, null when not stated.
 */
export function propagateSingleUncertainty(
  value: number,
  sigma: number | undefined,
): { readonly value: number; readonly uncertainty: number | null } {
  return propagateUncertainty(value, [1], [sigma ?? null]);
}

/**
 * σ for a cost figure: |rate| · σ_quantity (the rate is a caller-supplied
 * exact figure; the quantity's uncertainty dominates). Null stays null.
 */
export function propagateCostUncertainty(
  amount: number,
  rate: number,
  quantitySigma: number | null,
): number | null {
  return propagateUncertainty(amount, [rate], [quantitySigma]).uncertainty;
}

/* ------------------------------------------------------------------ */
/* Boundary input parsers (shape/vocabulary; semantic checks in service)*/
/* ------------------------------------------------------------------ */

export interface ComputeImpactInput {
  readonly scenarioId: string;
  /** Layer index (0-based) or `"latest"`. */
  readonly stateIndex: number | "latest";
  readonly importId: string;
  /** Caller-supplied rates, sorted by entryId (canonical order). */
  readonly rates?: readonly ImpactRate[];
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTENT_ID = /^[0-9a-f]{64}$/;
const CURRENCY_MAX = 16;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isIso(value: unknown): value is string {
  return typeof value === "string" && ISO_UTC.test(value);
}

function isContentId(value: unknown): value is string {
  return typeof value === "string" && CONTENT_ID.test(value);
}

/** impactId shape (content id: 64 lowercase hex). */
export function validateImpactId(impactId: string): void {
  if (typeof impactId !== "string" || !CONTENT_ID.test(impactId)) {
    throw new ImpactError(
      "invalid_impact_id",
      "impactId must be a 64-hex content id (the sha-256 of the resolved request identity)",
    );
  }
}

/** scenarioId shape (mirrors the Intervention authority's bounds). */
export function validateScenarioRefId(scenarioId: string): void {
  if (typeof scenarioId !== "string" || scenarioId.length < 1 || scenarioId.length > 256) {
    throw new ImpactError("invalid_scenario_ref", "scenarioId must be 1..256 characters");
  }
}

/** importId shape (BOQ import content id: 64 lowercase hex). */
export function validateImportRefId(importId: string): void {
  if (typeof importId !== "string" || !CONTENT_ID.test(importId)) {
    throw new ImpactError(
      "invalid_import_ref",
      "importId must be a 64-hex BOQ import content id",
    );
  }
}

/** Parse/validate the caller-supplied rate map into the canonical sorted array. */
function parseRates(value: unknown): ImpactRate[] {
  if (!isRecord(value)) {
    throw new ImpactError(
      "invalid_rate_input",
      "rates must be an object keyed by BOQ mapping entry id",
    );
  }
  const rates: ImpactRate[] = [];
  for (const [entryId, rate] of Object.entries(value)) {
    if (!isNonEmptyString(entryId) || entryId.length > 256) {
      throw new ImpactError(
        "invalid_rate_input",
        "rate keys must be non-empty BOQ mapping entry ids (1..256 characters)",
      );
    }
    if (!isRecord(rate)) {
      throw new ImpactError(
        "invalid_rate_input",
        `rate for entry '${entryId}' must be an object { amount, currency }`,
      );
    }
    const amount = rate["amount"];
    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      throw new ImpactError(
        "invalid_rate_input",
        `rate for entry '${entryId}' needs a finite amount >= 0 (credits come from signed quantities, never negative rates)`,
      );
    }
    const currency = rate["currency"];
    if (typeof currency !== "string" || currency.length < 1 || currency.length > CURRENCY_MAX) {
      throw new ImpactError(
        "invalid_rate_input",
        `rate for entry '${entryId}' needs a currency identifier of 1..${String(CURRENCY_MAX)} characters (carried verbatim, never interpreted)`,
      );
    }
    rates.push({ entryId, amount, currency });
  }
  rates.sort((a, b) => (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0));
  return rates;
}

/**
 * Parse/validate a compute-impact request body from UNKNOWN wire JSON.
 * Deterministic typed rejections (never silent defaults): the epistemic
 * discipline is enforced AT THE BOUNDARY — a claimed epistemic status other
 * than PROPOSED is a typed rejection, because impact figures describe
 * proposed state deltas, never observed reality.
 */
export function parseComputeImpactInput(payload: unknown): ComputeImpactInput {
  if (!isRecord(payload)) {
    throw new ImpactError("invalid_impact", "expected a JSON object");
  }
  const scenarioId = payload["scenarioId"];
  if (!isNonEmptyString(scenarioId)) {
    throw new ImpactError("invalid_impact", "scenarioId must be a non-empty string");
  }
  validateScenarioRefId(scenarioId);
  const stateIndex = payload["stateIndex"];
  if (stateIndex === undefined) {
    throw new ImpactError(
      "invalid_impact",
      "stateIndex is required (a 0-based layer index or the literal \"latest\") — no silent default",
    );
  }
  if (stateIndex !== "latest") {
    if (typeof stateIndex !== "number" || !Number.isInteger(stateIndex) || stateIndex < 0) {
      throw new ImpactError(
        "invalid_state_index",
        `stateIndex must be a non-negative integer or "latest" (got ${String(stateIndex)})`,
      );
    }
  }
  const importId = payload["importId"];
  if (!isNonEmptyString(importId)) {
    throw new ImpactError("invalid_impact", "importId must be a non-empty string");
  }
  validateImportRefId(importId);
  // PROPOSED-LITERAL, enforced at the boundary: a claimed OBSERVED (or any
  // other) impact status is a typed rejection, never a silent coercion.
  const claimed = payload["epistemicStatus"];
  if (claimed !== undefined && claimed !== "PROPOSED") {
    throw new ImpactError(
      "invalid_epistemic_status",
      "impact figures are always PROPOSED — they describe proposed state deltas, never observed reality",
    );
  }
  const rates = payload["rates"] === undefined ? undefined : parseRates(payload["rates"]);
  return {
    scenarioId,
    stateIndex,
    importId,
    ...(rates === undefined ? {} : { rates }),
  };
}

/* ------------------------------------------------------------------ */
/* Stored-record parser (store reads; write-time duty is the service's)*/
/* ------------------------------------------------------------------ */

function invalidRecord(detail: string): ImpactError {
  return new ImpactError("invalid_impact_record", detail);
}

function parseStoredQuantity(value: unknown, where: string): ImpactQuantity {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const quantityValue = value["value"];
  if (typeof quantityValue !== "number" || !Number.isFinite(quantityValue)) {
    throw invalidRecord(`${where}.value must be a finite number`);
  }
  const unit = value["unit"];
  if (typeof unit !== "string" || unit.length < 1) {
    throw invalidRecord(`${where}.unit must be a non-empty string (units are typed, never bare)`);
  }
  const uncertainty = value["uncertainty"];
  if (uncertainty !== null && (typeof uncertainty !== "number" || !Number.isFinite(uncertainty) || uncertainty < 0)) {
    throw invalidRecord(
      `${where}.uncertainty must be null (not stated) or a finite 1σ >= 0 — never an implicit zero`,
    );
  }
  return { value: quantityValue, unit, uncertainty };
}

function parseStoredGeometryRef(value: unknown, where: string): ImpactGeometryRefInput {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  if (!isNonEmptyString(value["kind"])) throw invalidRecord(`${where}.kind`);
  if (!isNonEmptyString(value["ref"])) throw invalidRecord(`${where}.ref`);
  return { kind: value["kind"], ref: value["ref"] };
}

/** The line-identity discriminator (shared by the compute + re-read paths). */
export function lineDiscriminator(basis: ImpactBasis): string {
  return (
    basis.propertyKey ??
    (basis.geometryFrom !== undefined || basis.geometryTo !== undefined ? "geometry" : "content")
  );
}

function parseStoredBasis(value: unknown, where: string): ImpactBasis {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const propertyKey = value["propertyKey"];
  if (propertyKey !== undefined && !isNonEmptyString(propertyKey)) {
    throw invalidRecord(`${where}.propertyKey`);
  }
  for (const side of ["From", "To"] as const) {
    const propertyValue = value[`${side}Value`];
    if (
      propertyValue !== undefined &&
      typeof propertyValue !== "string" &&
      typeof propertyValue !== "number" &&
      typeof propertyValue !== "boolean"
    ) {
      throw invalidRecord(`${where}.${side}Value`);
    }
    const unit = value[`${side}Unit`];
    if (unit !== undefined && !isNonEmptyString(unit)) {
      throw invalidRecord(`${where}.${side}Unit`);
    }
    const geometry = value[`geometry${side}`];
    if (geometry !== undefined) {
      parseStoredGeometryRef(geometry, `${where}.geometry${side}`);
    }
  }
  return value as unknown as ImpactBasis;
}

/** Read one string field (typed rejection when absent/empty). */
function requireString(value: Record<string, unknown>, key: string, where: string): string {
  const field = value[key];
  if (!isNonEmptyString(field)) {
    throw invalidRecord(`${where}.${key} must be a non-empty string`);
  }
  return field;
}

/** Read one string field or null (typed rejection for other shapes). */
function requireStringOrNull(
  value: Record<string, unknown>,
  key: string,
  where: string,
): string | null {
  const field = value[key];
  if (field === null) {
    return null;
  }
  if (!isNonEmptyString(field)) {
    throw invalidRecord(`${where}.${key} must be a non-empty string or null`);
  }
  return field;
}

function parseStoredMappingRef(value: unknown, where: string): ImpactBoqMappingRef {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  if (!isNonEmptyString(value["entryId"])) throw invalidRecord(`${where}.entryId`);
  if (!isNonEmptyString(value["importId"])) throw invalidRecord(`${where}.importId`);
  if (typeof value["rowNumber"] !== "number" || !Number.isInteger(value["rowNumber"])) {
    throw invalidRecord(`${where}.rowNumber`);
  }
  if (!(value["sectionTitle"] === null || typeof value["sectionTitle"] === "string")) {
    throw invalidRecord(`${where}.sectionTitle`);
  }
  if (typeof value["originalText"] !== "string") throw invalidRecord(`${where}.originalText`);
  if (
    !(value["descriptionCellRef"] === null || typeof value["descriptionCellRef"] === "string")
  ) {
    throw invalidRecord(`${where}.descriptionCellRef`);
  }
  if (!(value["unitCellRef"] === null || typeof value["unitCellRef"] === "string")) {
    throw invalidRecord(`${where}.unitCellRef`);
  }
  if (!(value["unitText"] === null || typeof value["unitText"] === "string")) {
    throw invalidRecord(`${where}.unitText`);
  }
  for (const field of ["status", "confidence", "method"] as const) {
    if (!isNonEmptyString(value[field])) throw invalidRecord(`${where}.${field}`);
  }
  const unitRelation = value["unitRelation"];
  if (
    typeof unitRelation !== "string" ||
    !(IMPACT_UNIT_RELATIONS as readonly string[]).includes(unitRelation)
  ) {
    throw invalidRecord(`${where}.unitRelation must be one of ${IMPACT_UNIT_RELATIONS.join("|")}`);
  }
  return {
    importId: requireString(value, "importId", where),
    entryId: requireString(value, "entryId", where),
    rowNumber: value["rowNumber"] as number,
    sectionTitle: requireStringOrNull(value, "sectionTitle", where),
    originalText: requireString(value, "originalText", where),
    descriptionCellRef: requireStringOrNull(value, "descriptionCellRef", where),
    unitCellRef: requireStringOrNull(value, "unitCellRef", where),
    unitText: requireStringOrNull(value, "unitText", where),
    status: requireString(value, "status", where),
    confidence: requireString(value, "confidence", where),
    method: requireString(value, "method", where),
    unitRelation: unitRelation as ImpactUnitRelation,
  };
}

function parseStoredLine(value: unknown, record: { impactId: string }): ImpactLine {
  if (!isRecord(value)) throw invalidRecord("line entry is not an object");
  if (!isNonEmptyString(value["lineId"])) throw invalidRecord("line.lineId");
  const kind = value["kind"];
  if (typeof kind !== "string" || !(IMPACT_LINE_KINDS as readonly string[]).includes(kind)) {
    throw invalidRecord(`line ${value["lineId"]} kind must be one of ${IMPACT_LINE_KINDS.join("|")}`);
  }
  if (!isNonEmptyString(value["stepId"])) throw invalidRecord(`line ${value["lineId"]} stepId`);
  if (
    typeof value["stepIndex"] !== "number" ||
    !Number.isInteger(value["stepIndex"]) ||
    value["stepIndex"] < 1
  ) {
    throw invalidRecord(`line ${value["lineId"]} stepIndex must be a positive integer`);
  }
  if (!isNonEmptyString(value["targetNodeId"])) throw invalidRecord(`line ${value["lineId"]} targetNodeId`);
  if (!isNonEmptyString(value["origin"])) throw invalidRecord(`line ${value["lineId"]} origin`);
  const basis = parseStoredBasis(value["basis"], `line ${value["lineId"]} basis`);
  // THE PROPOSED-LITERAL DISCIPLINE, re-checked on every read: an impact
  // line that claims anything but PROPOSED is corruption — never silently
  // re-read as a different epistemic class.
  if (value["epistemicStatus"] !== "PROPOSED") {
    throw invalidRecord(
      `line ${value["lineId"]} epistemicStatus must be PROPOSED (impact figures describe proposed state deltas)`,
    );
  }
  const quantity = value["quantity"] === null ? null : parseStoredQuantity(value["quantity"], `line ${value["lineId"]} quantity`);
  const omissionCode = value["omissionCode"];
  if (quantity === null) {
    if (
      typeof omissionCode !== "string" ||
      !(IMPACT_OMISSION_CODES as readonly string[]).includes(omissionCode)
    ) {
      throw invalidRecord(
        `line ${value["lineId"]} carries no quantity and therefore requires a typed omission code (${IMPACT_OMISSION_CODES.join("|")}) — a silent zero is never representable`,
      );
    }
  } else if (omissionCode !== null) {
    throw invalidRecord(
      `line ${value["lineId"]} carries both a quantity and an omissionCode — exactly one is required`,
    );
  }
  const boqMappings = value["boqMappings"];
  if (!Array.isArray(boqMappings)) {
    throw invalidRecord(`line ${value["lineId"]} boqMappings must be an array (empty = honestly unmapped)`);
  }
  const severed = value["severedRelationshipIds"];
  if (severed !== undefined && !Array.isArray(severed)) {
    throw invalidRecord(`line ${value["lineId"]} severedRelationshipIds`);
  }
  const line: ImpactLine = {
    lineId: value["lineId"],
    kind: kind as ImpactLineKind,
    stepId: value["stepId"],
    stepIndex: value["stepIndex"],
    targetNodeId: value["targetNodeId"],
    origin: value["origin"],
    basis,
    quantity,
    omissionCode: quantity === null ? (omissionCode as ImpactOmissionCode) : null,
    epistemicStatus: "PROPOSED",
    boqMappings: boqMappings.map((entry, index) =>
      parseStoredMappingRef(entry, `line ${value["lineId"]} mapping ${String(index)}`),
    ),
    ...(severed === undefined ? {} : { severedRelationshipIds: severed as readonly string[] }),
  };
  // Structural coherence: the line id must be the content-derived id of its
  // own position in this record (garbage on disk is a typed rejection).
  if (
    line.lineId !==
    deriveLineId(record.impactId, line.targetNodeId, line.kind, lineDiscriminator(basis))
  ) {
    throw invalidRecord(
      `line ${value["lineId"]} id does not match its content-derived identity — the record is corrupt`,
    );
  }
  return line;
}

function parseStoredCost(value: unknown): CostImpact {
  if (!isRecord(value)) throw invalidRecord("cost entry is not an object");
  if (!isNonEmptyString(value["costId"])) throw invalidRecord("cost.costId");
  if (!isNonEmptyString(value["lineId"])) throw invalidRecord("cost.lineId");
  if (!isNonEmptyString(value["entryId"])) throw invalidRecord("cost.entryId");
  if (value["epistemicStatus"] !== "PROPOSED") {
    throw invalidRecord("cost.epistemicStatus must be PROPOSED");
  }
  const quantity = value["quantity"];
  if (!isRecord(quantity)) throw invalidRecord("cost.quantity");
  if (typeof quantity["value"] !== "number" || !Number.isFinite(quantity["value"])) {
    throw invalidRecord("cost.quantity.value");
  }
  if (typeof quantity["unit"] !== "string" || quantity["unit"].length < 1) {
    throw invalidRecord("cost.quantity.unit");
  }
  const rate = value["rate"];
  if (!isRecord(rate)) throw invalidRecord("cost.rate");
  if (typeof rate["amount"] !== "number" || !Number.isFinite(rate["amount"]) || rate["amount"] < 0) {
    throw invalidRecord("cost.rate.amount");
  }
  if (typeof rate["currency"] !== "string" || rate["currency"].length < 1) {
    throw invalidRecord("cost.rate.currency");
  }
  const amount = value["amount"];
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    throw invalidRecord("cost.amount must be the signed quantity × rate product");
  }
  const uncertainty = value["uncertainty"];
  if (
    uncertainty !== null &&
    (typeof uncertainty !== "number" || !Number.isFinite(uncertainty) || uncertainty < 0)
  ) {
    throw invalidRecord("cost.uncertainty must be null (not stated) or a finite 1σ >= 0");
  }
  return value as unknown as CostImpact;
}

function parseStoredRate(value: unknown): ImpactRate {
  if (!isRecord(value)) throw invalidRecord("rates entry is not an object");
  if (!isNonEmptyString(value["entryId"])) throw invalidRecord("rates.entryId");
  if (typeof value["amount"] !== "number" || !Number.isFinite(value["amount"]) || value["amount"] < 0) {
    throw invalidRecord("rates.amount");
  }
  if (typeof value["currency"] !== "string" || value["currency"].length < 1) {
    throw invalidRecord("rates.currency");
  }
  return value as unknown as ImpactRate;
}

function parseStoredEvent(value: unknown): ImpactEvent {
  if (!isRecord(value)) throw invalidRecord("history entry is not an object");
  if (!isNonEmptyString(value["eventId"])) throw invalidRecord("history.eventId");
  if (value["eventType"] !== "impact_computed") throw invalidRecord("history.eventType");
  if (!isIso(value["occurredAt"])) throw invalidRecord("history.occurredAt");
  if (!isContentId(value["reportDigest"])) {
    throw invalidRecord("history.reportDigest must be a 64-hex digest");
  }
  return {
    eventId: value["eventId"],
    eventType: "impact_computed",
    occurredAt: value["occurredAt"],
    reportDigest: value["reportDigest"],
  };
}

/**
 * Structural validation of a persisted impact record (store reads; garbage
 * on disk is a typed `invalid_impact_record` rejection, never a silent
 * misparse). Verifies: the PROPOSED-literal discipline on every line and
 * cost figure, the quantity-XOR-omission invariant, the vocabularies, the
 * request/report coherence pins, the content-derived line ids, the rate
 * ordering and — decisively — the report digest (a tampered report body
 * never re-reads as valid).
 */
export function parseImpactRecord(value: unknown): ImpactRecord {
  if (!isRecord(value)) throw invalidRecord("impact record is not a JSON object");
  const impactId = requireString(value, "impactId", "record");
  validateImpactId(impactId);
  const request = value["request"];
  if (!isRecord(request)) throw invalidRecord("request is not an object");
  const requestScenarioId = requireString(request, "scenarioId", "request");
  const requestStateId = requireString(request, "stateId", "request");
  const requestBaselineVersionId = requireString(request, "baselineVersionId", "request");
  const requestImportId = requireString(request, "importId", "request");
  const requestMappingId = requireString(request, "mappingId", "request");
  if (
    typeof request["stateIndex"] !== "number" ||
    !Number.isInteger(request["stateIndex"]) ||
    request["stateIndex"] < 0
  ) {
    throw invalidRecord("request.stateIndex must be a non-negative integer");
  }
  if (typeof request["mappingVersion"] !== "number" || !Number.isInteger(request["mappingVersion"]) || request["mappingVersion"] < 1) {
    throw invalidRecord("request.mappingVersion must be a positive integer");
  }
  if (!isIso(value["recordedAt"])) throw invalidRecord("recordedAt");
  if (!isContentId(value["reportDigest"])) {
    throw invalidRecord("reportDigest must be a 64-hex digest");
  }

  const report = value["report"];
  if (!isRecord(report)) throw invalidRecord("report is not an object");
  if (report["epistemicStatus"] !== "PROPOSED") {
    throw invalidRecord("report.epistemicStatus must be PROPOSED");
  }
  const reportScenarioId = requireString(report, "scenarioId", "report");
  const reportProjectId = requireString(report, "projectId", "report");
  const reportScenarioStatus = requireString(report, "scenarioStatus", "report");
  const reportTitle = requireString(report, "title", "report");
  const reportStateId = requireString(report, "stateId", "report");
  const reportBaselineVersionId = requireString(report, "baselineVersionId", "report");
  const reportImportId = requireString(report, "importId", "report");
  const reportMappingId = requireString(report, "mappingId", "report");
  if (
    typeof report["stateIndex"] !== "number" ||
    !Number.isInteger(report["stateIndex"]) ||
    report["stateIndex"] < 0
  ) {
    throw invalidRecord("report.stateIndex");
  }
  if (typeof report["mappingVersion"] !== "number" || !Number.isInteger(report["mappingVersion"]) || report["mappingVersion"] < 1) {
    throw invalidRecord("report.mappingVersion");
  }
  if (!Array.isArray(report["appliedStepIds"])) throw invalidRecord("report.appliedStepIds");
  const lines = report["lines"];
  if (!Array.isArray(lines)) throw invalidRecord("report.lines");
  const costImpacts = report["costImpacts"];
  if (!Array.isArray(costImpacts)) throw invalidRecord("report.costImpacts");
  const unpricedPairs = report["unpricedPairs"];
  if (!Array.isArray(unpricedPairs)) throw invalidRecord("report.unpricedPairs");
  const rates = report["rates"];
  if (rates !== undefined && !Array.isArray(rates)) throw invalidRecord("report.rates");
  if (!isRecord(report["summary"])) throw invalidRecord("report.summary");

  const parsedLines = lines.map((entry) => parseStoredLine(entry, { impactId }));
  const lineIds = new Set(parsedLines.map((line) => line.lineId));
  if (lineIds.size !== parsedLines.length) {
    throw invalidRecord("report.lines contains duplicate line ids");
  }
  const parsedCosts = costImpacts.map(parseStoredCost);
  for (const cost of parsedCosts) {
    if (!lineIds.has(cost.lineId)) {
      throw invalidRecord(`cost ${cost.costId} traces to unknown line ${cost.lineId}`);
    }
  }
  const parsedUnpriced: ImpactUnpricedPair[] = [];
  for (const entry of unpricedPairs) {
    if (
      !isRecord(entry) ||
      !isNonEmptyString(entry["lineId"]) ||
      !isNonEmptyString(entry["entryId"])
    ) {
      throw invalidRecord("unpricedPairs entry is malformed");
    }
    const code = entry["code"];
    if (typeof code !== "string" || !(IMPACT_COST_OMISSION_CODES as readonly string[]).includes(code)) {
      throw invalidRecord(`unpricedPairs code must be one of ${IMPACT_COST_OMISSION_CODES.join("|")}`);
    }
    if (!lineIds.has(entry["lineId"])) {
      throw invalidRecord(`unpriced pair traces to unknown line ${entry["lineId"]}`);
    }
    parsedUnpriced.push(entry as unknown as ImpactUnpricedPair);
  }
  const parsedRates = rates === undefined ? [] : (rates as unknown[]).map(parseStoredRate);
  for (let index = 1; index < parsedRates.length; index += 1) {
    const previous = parsedRates[index - 1]!;
    const current = parsedRates[index]!;
    if (previous.entryId >= current.entryId) {
      throw invalidRecord("report.rates must be sorted by entryId (canonical order)");
    }
  }

  const parsedReport: ImpactReport = {
    scenarioId: reportScenarioId,
    projectId: reportProjectId,
    scenarioStatus: reportScenarioStatus,
    title: reportTitle,
    stateId: reportStateId,
    stateIndex: report["stateIndex"] as number,
    baselineVersionId: reportBaselineVersionId,
    appliedStepIds: report["appliedStepIds"] as readonly string[],
    importId: reportImportId,
    mappingId: reportMappingId,
    mappingVersion: report["mappingVersion"] as number,
    epistemicStatus: "PROPOSED",
    lines: parsedLines,
    costImpacts: parsedCosts,
    unpricedPairs: parsedUnpriced,
    rates: parsedRates,
    summary: report["summary"] as unknown as ImpactSummary,
  };

  // Coherence pins: the request must describe EXACTLY the report it wraps
  // (garbage on disk is a typed rejection, never a silently misread record).
  const req: ImpactRecord["request"] = {
    scenarioId: requestScenarioId,
    stateId: requestStateId,
    stateIndex: request["stateIndex"] as number,
    baselineVersionId: requestBaselineVersionId,
    importId: requestImportId,
    mappingId: requestMappingId,
    mappingVersion: request["mappingVersion"] as number,
  };
  if (
    req.scenarioId !== parsedReport.scenarioId ||
    req.stateId !== parsedReport.stateId ||
    req.stateIndex !== parsedReport.stateIndex ||
    req.baselineVersionId !== parsedReport.baselineVersionId ||
    req.importId !== parsedReport.importId ||
    req.mappingId !== parsedReport.mappingId ||
    req.mappingVersion !== parsedReport.mappingVersion
  ) {
    throw invalidRecord("request must pin exactly the report it wraps");
  }
  // THE DETERMINISM PIN: the stored digest must equal the sha-256 of the
  // canonical report — a tampered report body never re-reads as valid.
  const recomputed = impactReportDigest(parsedReport);
  if (recomputed !== value["reportDigest"]) {
    throw invalidRecord(
      "reportDigest does not match the canonical report content — the record was tampered with or corrupted",
    );
  }

  const history = value["history"];
  if (!Array.isArray(history) || history.length === 0) {
    throw invalidRecord("history must be a non-empty array (write-once records pin one event)");
  }
  const parsedHistory = history.map(parseStoredEvent);
  const first = parsedHistory[0]!;
  if (first.eventId !== "evt-000001" || first.reportDigest !== recomputed) {
    throw invalidRecord("history[0] must be the creation event pinning this report digest");
  }
  for (let index = 1; index < parsedHistory.length; index += 1) {
    const event = parsedHistory[index]!;
    if (event.eventId !== `evt-${String(index + 1).padStart(6, "0")}`) {
      throw invalidRecord("history event ids must be positional and gap-free");
    }
    if (event.reportDigest !== recomputed) {
      throw invalidRecord(
        "every event must pin the same report digest — impact records are write-once",
      );
    }
  }

  return {
    impactId,
    request: req,
    report: parsedReport,
    reportDigest: recomputed,
    recordedAt: value["recordedAt"] as string,
    history: parsedHistory,
  };
}

/* ------------------------------------------------------------------ */
/* Read-only authority projections (production adapters' targets)       */
/* ------------------------------------------------------------------ */

/**
 * Project the intervention authority's scenario record into the impact
 * domain's read-only input: governance spine, step payloads and every
 * materialized layer's node/tombstone content, values VERBATIM. The
 * intervention `ProposedProperty` model carries NO measurement uncertainty,
 * so the projection honestly states none (absent σ) — impact quantities
 * derived from it report `uncertainty: null` ("not stated"), never a
 * fabricated precision.
 */
export function projectImpactScenarioInput(scenario: InterventionScenario): ImpactScenarioInput {
  return {
    scenarioId: scenario.scenarioId,
    projectId: scenario.projectId,
    title: scenario.title,
    status: scenario.status,
    baselineVersionId: scenario.baselineVersionId,
    steps: scenario.steps.map((step) => ({
      stepId: step.stepId,
      stepIndex: step.stepIndex,
      kind: step.kind,
      targetNodeId: step.targetNodeId,
      change: step.change as unknown as ImpactStepChange,
    })),
    states: scenario.states.map((state) => ({
      stateId: state.stateId,
      stateIndex: state.stateIndex,
      baselineVersionId: state.baselineVersionId,
      appliedStepIds: [...state.appliedStepIds],
      nodes: state.nodes.map((entry) => ({
        nodeId: entry.nodeId,
        origin: entry.origin,
        appliedStepIds: [...entry.appliedStepIds],
        kind: entry.node.kind,
        properties: entry.node.properties.map((property) => ({
          key: property.key,
          value: property.value,
          ...(property.unit === undefined ? {} : { unit: property.unit }),
        })),
        ...(entry.node.geometry === undefined
          ? {}
          : { geometry: entry.node.geometry as unknown as ImpactGeometryRefInput }),
      })),
      proposedTombstones: state.proposedTombstones.map((stone) => ({
        nodeId: stone.nodeId,
        reason: stone.reason,
        proposedByStepId: stone.proposedByStepId,
        severedRelationshipIds: [...stone.severedRelationshipIds],
      })),
    })),
  };
}

/** Parse "B4" -> 4; null for anything malformed (defensive, pure). */
function rowOfCellRef(cellRef: string): number | null {
  const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(cellRef);
  if (match === null) {
    return null;
  }
  return Number.parseInt(match[2] ?? "0", 10);
}

/**
 * Resolve the VERBATIM unit cell text for one mapping entry's unit cell
 * ref ("Sheet!B4") from the parsed BOQ document. Null when the document is
 * absent (unsupported format), the sheet/cell does not resolve, or the ref
 * is malformed — an honest unknown, never a guessed unit.
 */
export function resolveUnitText(
  document: BoqDocument | undefined,
  unitCellRef: string | null,
): string | null {
  if (unitCellRef === null || document === undefined) {
    return null;
  }
  const bang = unitCellRef.indexOf("!");
  if (bang <= 0 || bang === unitCellRef.length - 1) {
    return null;
  }
  const sheetName = unitCellRef.slice(0, bang);
  const cellRef = unitCellRef.slice(bang + 1);
  const rowNumber = rowOfCellRef(cellRef);
  if (rowNumber === null) {
    return null;
  }
  const sheet = document.sheets.find((candidate) => candidate.name === sheetName);
  if (sheet === undefined) {
    return null;
  }
  const row = sheet.rows.find((candidate) => candidate.rowNumber === rowNumber);
  if (row === undefined) {
    return null;
  }
  const cell = row.cells.find((candidate) => candidate.ref === cellRef);
  if (cell === undefined) {
    return null;
  }
  return cell.raw;
}

/**
 * Project a stored BOQ mapping (plus its import's parsed document) into the
 * impact domain's read-only input. All BOQ-side anchors are carried
 * VERBATIM (R8 source traceability); the unit text is resolved from the
 * source cells through `resolveUnitText` (null = honest unknown).
 */
export function projectImpactBoqMappingInput(
  mapping: BoqMapping,
  imported: BoqImport | null,
): ImpactBoqMappingInput {
  return {
    importId: mapping.importId,
    mappingId: mapping.mappingId,
    version: mapping.version,
    entries: mapping.entries.map((entry) => ({
      entryId: entry.entryId,
      sectionTitle: entry.boqItem.sectionTitle,
      rowNumber: entry.boqItem.rowNumber,
      originalText: entry.boqItem.originalText,
      descriptionCellRef: entry.boqItem.descriptionCellRef,
      unitCellRef: entry.boqItem.unitCellRef,
      unitText: resolveUnitText(
        imported?.parse.document,
        entry.boqItem.unitCellRef,
      ),
      status: entry.status,
      confidence: entry.confidence,
      method: entry.method,
      targets: entry.targets.map((target) => target.nodeId),
    })),
  };
}
