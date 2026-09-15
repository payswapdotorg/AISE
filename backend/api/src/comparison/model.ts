/**
 * AISE-032 — Reality-vs-design comparison domain model.
 *
 * Contract (spec/work-orders.md §032: "Owner ZAI. Compare captured
 * authoritative reality with imported design references, producing
 * evidence-linked discrepancies and uncertainty-aware status. CRITICAL.";
 * spec/requirements.md R9 — "AISE shall compare BOQ scope/quantities to
 * observed/modelled reality without silently altering either source.
 * Acceptance: discrepancies are explicit, evidence-linked and
 * uncertainty-aware."; R8 — "mappings to reality/drawings and revision
 * comparisons"; R6 family anchors the Reality Graph as the
 * captured-authoritative side; spec/domain-model.md "Integration
 * semantics" — "`ExternalReference` identifies the external system, record
 * identity, revision/version, timestamps and source-of-record role";
 * "Versioning" — "Model, evidence, BOQ revisions, connector checkpoints
 * and intervention states are append-only/versioned. Reprocessing creates
 * derived versions; it never erases prior source evidence or historical
 * observations."):
 *
 * THIS MODULE IS A DERIVED-PROJECTION AUTHORITY, NEVER A SECOND AUTHORITY:
 *
 *  - The REALITY side is the Reality Graph (AISE-016 authority). It is
 *    consumed through an injected READ-ONLY resolver returning one pinned
 *    `GraphVersion` (type-only import below — no runtime import of reality
 *    internals, no write path). The comparison NEVER mutates the version,
 *    the store, or any prior observation; the resolver interface exposes
 *    exactly one READ method (see service.ts).
 *  - The DESIGN side is an imported design reference submitted at this
 *    module's boundary: an explicit document carrying ExternalReference
 *    semantics (`DesignSourceRef`: external system class/instance, record
 *    identity, revision, retrieval timestamp — the source-of-record role)
 *    plus design items whose reality mapping is EXPLICIT (`targetNodeId`,
 *    R8) or honestly absent (unmapped). The incumbent system of record
 *    stays authoritative for design content; identities are carried
 *    VERBATIM, never re-keyed or re-validated against a second vocabulary
 *    (the AISE-037 system-class registry is deliberately NOT imported —
 *    this module journals `systemClass` as an opaque string).
 *  - A `ComparisonRecord` is a DERIVED projection: deterministic
 *    computation over (pinned reality version, design reference,
 *    tolerances, coverage annotations) + the injected clock. The same
 *    inputs yield BYTE-IDENTICAL records (pinned by `inputDigest`, a
 *    sha-256 over the canonical JSON of both source documents plus the
 *    comparison parameters). Neither source is ever altered; recomputing
 *    against newer inputs produces a NEW append-only record, never an
 *    update.
 *  - DISTINCT FROM AISE-033 (changedetection): that module is the
 *    reality-vs-REALITY change vocabulary. This module is the
 *    reality-vs-DESIGN comparison — a distinct authority with its own
 *    vocabulary. changedetection is a CONVENTION REFERENCE ONLY: no
 *    runtime import, no shared codes; conventions mirrored deliberately
 *    (deterministic identity matching, honest-unresolved omissions,
 *    strictly-greater tolerance boundaries, last-wins duplicate keys on
 *    the authoritative snapshot side).
 *
 * EPISTEMIC DISCIPLINE (the loud parts, enforced here, not by convention):
 *
 *  - UNKNOWN, NOT_OBSERVED and OCCLUDED are FIRST-CLASS statuses — never
 *    collapsed into match/differ, never silently treated as absence
 *    (worker rules; R9 acceptance). An object in the design whose mapped
 *    target is absent from captured reality is `not_observed_in_reality`
 *    (a positive claim about captured reality, not absence-of-claim); a
 *    live reality node with no design counterpart is
 *    `unplanned_in_reality`; an unmapped design item is `unknown` +
 *    `unmapped_design_item` (no mapping ⇒ no comparison is even possible);
 *    an unobservable target is `occluded_in_reality`.
 *  - MEASUREMENT UNCERTAINTY PARTICIPATES IN THE VERDICT: a numeric
 *    deviation within the declared tolerance is `within_tolerance`, never
 *    `differs`; a deviation STRICTLY GREATER than the tolerance is
 *    `deviation_beyond_tolerance` (equal is within — the AISE-033
 *    convention); a NONZERO deviation with NO applicable tolerance is
 *    `unknown` (`numeric_comparison_without_tolerance`) — asserting
 *    match/differ without knowing the uncertainty budget would be an
 *    overclaim. Exact numeric equality (deviation 0) is `matches`.
 *  - CONFIDENCE IS NOT MEASUREMENT UNCERTAINTY: the design side carries NO
 *    confidence field at all (it is an intent document, substantiated by
 *    its source-of-record identity); the reality side's epistemic statuses
 *    (OBSERVED/CONFIRMED/INFERRED/PROPOSED) are carried VERBATIM on rows
 *    as provenance context and never converted into verdicts. PROPOSED
 *    reality content is NOT compared to verdicts — proposals are not
 *    observed/modelled reality (lock: intervention proposals stay
 *    proposals): such rows are `unknown` with a typed omission code
 *    (`proposed_reality_node` / `proposed_reality_property`).
 *  - UNIT DISCIPLINE: numeric design values REQUIRE a typed unit
 *    (`invalid_design_property` otherwise — mirroring the reality model's
 *    `numeric_property_without_unit`). This module owns NO unit-conversion
 *    authority: numerics with different unit strings are `unknown` +
 *    `incompatible_units` (a silent mm↔m conversion would be a second
 *    measurement-interpretation authority).
 *  - EVIDENCE-LINKED DISCREPANCIES (fail-closed): every row asserting a
 *    reality-side discrepancy (`differs`, `deviation_beyond_tolerance`)
 *    MUST carry at least one reality-side evidence id collected from the
 *    compared property's provenance records (node-level provenance as
 *    fallback — measurement/observation provenance from the reality side)
 *    plus the design-side source-of-record identity. A discrepancy without
 *    substantiating references is a typed refusal
 *    (`discrepancy_without_evidence`) — the comparison record is never
 *    emitted with an unsubstantiated discrepancy row.
 *  - COVERAGE ANNOTATIONS (the OCCLUDED/UNKNOWN input seam): the request
 *    may carry EXPLICIT, evidence-backed per-target capture-coverage
 *    claims (`CoverageAnnotation`), because the pinned GraphVersion alone
 *    cannot express occlusion or capture-status-unknown (that knowledge
 *    lives on the capture/assurance side). Annotations are typed
 *    (`UNKNOWN | NOT_OBSERVED | OCCLUDED`), REQUIRE non-empty 64-hex
 *    evidence ids, are membership-verified against the Evidence authority,
 *    and are carried VERBATIM into the derived rows — never converted into
 *    match/differ, never silently dropped. An annotation contradicting the
 *    authoritative version (NOT_OBSERVED/OCCLUDED for a node the version
 *    carries) is a typed refusal (`coverage_contradicts_reality`): the
 *    graph is authoritative on what captured reality contains.
 *  - APPEND-ONLY: comparison records are write-once. There is no update or
 *    delete path; re-running a comparison against newer inputs is a NEW
 *    record (new caller-supplied comparisonId; `comparison_exists` on id
 *    reuse). Each record carries exactly one audit event pinning the
 *    sha-256 content digest of the full record content.
 *
 * DETERMINISM: content-derived entry ids (`ent-<16 hex>` over
 * comparisonId + item + aspect + key + node), canonical entry ordering
 * (design-anchored rows sorted by designItemId, within an item object →
 * geometry → property-key; unplanned rows last, sorted by nodeId),
 * injected clock only, canonical JSON everywhere. The same inputs plus the
 * same clock produce byte-identical records in fresh stores.
 *
 * This module owns the frozen vocabularies, record types, the typed error
 * registry, boundary input parsers (shape/vocabulary → typed codes), the
 * canonical content/input digests, the pure deterministic comparison
 * matrix builder and the stored-record parser. Policy lives in
 * `service.ts`; persistence in `store.ts`; transport in `router.ts`.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
// READ-ONLY TYPE imports from the owning authority (erased at runtime —
// no value, store or write function ever crosses this boundary):
import type { GraphVersion, RealityNode } from "../reality/model";

/* ------------------------------------------------------------------ */
/* Vocabularies (frozen: `as const` types + Object.freeze runtime)      */
/* ------------------------------------------------------------------ */

/**
 * The reality-vs-design status vocabulary. `unknown`,
 * `not_observed_in_reality` and `occluded_in_reality` are FIRST-CLASS —
 * the uncertainty family is never collapsed into the verdict family and
 * never silently treated as absence.
 */
export const COMPARISON_STATUSES = Object.freeze([
  // verdict family (both sides carry comparable, non-proposed assertions)
  "matches",
  "within_tolerance",
  "differs",
  "deviation_beyond_tolerance",
  // uncertainty family (first-class; not absence)
  "unknown",
  "not_observed_in_reality",
  "occluded_in_reality",
  // coverage family (honest coverage of reality-vs-design scope)
  "unplanned_in_reality",
] as const);
export type ComparisonStatus = (typeof COMPARISON_STATUSES)[number];

/**
 * The typed omission registry: WHY a row's comparison was omitted (every
 * failure mode DISTINCT). Omission codes accompany `unknown` /
 * `occluded_in_reality` rows and are never silently defaulted.
 */
export const COMPARISON_OMISSION_CODES = Object.freeze([
  // the design item declares no reality mapping — no comparison possible
  "unmapped_design_item",
  // the capture-side coverage annotation claims UNKNOWN for the target
  "coverage_unknown",
  // the capture-side coverage annotation claims the target was OCCLUDED
  "occluded_target",
  // the pinned reality node is a PROPOSAL, not observed/modelled reality
  "proposed_reality_node",
  // the pinned reality property is a PROPOSAL, not observed/modelled reality
  "proposed_reality_property",
  // numeric sides carry different unit strings; no conversion authority here
  "incompatible_units",
  // the two values' types cannot be compared (string vs number, …)
  "incomparable_value_types",
  // nonzero numeric deviation with no applicable tolerance — honest unknown
  "numeric_comparison_without_tolerance",
  // both sides reference geometry; this module owns no geometry-resolution
  // authority (AISE-013/033 territory) — the comparison is honestly omitted
  "geometry_not_comparable",
] as const);
export type ComparisonOmissionCode = (typeof COMPARISON_OMISSION_CODES)[number];

/**
 * The frozen capture-coverage annotation vocabulary (the request-side seam
 * through which OCCLUDED/UNKNOWN/NOT_OBSERVED enter the comparison — the
 * pinned GraphVersion alone cannot express them).
 */
export const COVERAGE_OBSERVATION_STATUSES = Object.freeze([
  "UNKNOWN",
  "NOT_OBSERVED",
  "OCCLUDED",
] as const);
export type CoverageObservationStatus = (typeof COVERAGE_OBSERVATION_STATUSES)[number];

/** The single audit event type of a comparison record's append-only history. */
export const COMPARISON_EVENT_TYPES = Object.freeze(["comparison_recorded"] as const);
export type ComparisonEventType = (typeof COMPARISON_EVENT_TYPES)[number];

/** The aspects of a design item that can yield comparison rows. */
export const COMPARISON_ASPECTS = Object.freeze(["object", "geometry", "property"] as const);
export type ComparisonAspect = (typeof COMPARISON_ASPECTS)[number];

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)           */
/* ------------------------------------------------------------------ */

export const COMPARISON_ERROR_CODES = Object.freeze([
  // shape / vocabulary validation (422 at the HTTP boundary)
  "invalid_comparison",
  "invalid_design_reference",
  "invalid_design_item",
  "invalid_design_property",
  "invalid_source_of_record",
  "invalid_tolerance",
  "invalid_coverage",
  "invalid_timestamp",
  "invalid_evidence_ref",
  // semantic invariants (422)
  "comparison_without_items",
  "duplicate_design_item",
  "unknown_reality_version",
  "coverage_without_evidence",
  "unknown_coverage_target",
  "unknown_evidence_ref",
  "coverage_contradicts_reality",
  "discrepancy_without_evidence",
  "comparison_exists",
  // not-found (404)
  "comparison_not_found",
  // identity / path addressing (400)
  "invalid_comparison_id",
  "invalid_project_id",
  "invalid_version_id",
  // persistence guard (422)
  "invalid_comparison_record",
] as const);
export type ComparisonErrorCode = (typeof COMPARISON_ERROR_CODES)[number];

/** Typed rejection carrying a stable code (never a bare string error). */
export class ComparisonError extends Error {
  readonly code: ComparisonErrorCode;
  readonly detail: string;

  constructor(code: ComparisonErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "ComparisonError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Design-reference input model (ExternalReference semantics)           */
/* ------------------------------------------------------------------ */

/**
 * The source-of-record identity of the imported design reference — the
 * `ExternalReference` contract (domain model: "identifies the external
 * system, record identity, revision/version, timestamps and
 * source-of-record role"). Every field is a VERBATIM incumbent identity:
 * never re-keyed, never merged, never interpreted here (the incumbent
 * system of record remains authoritative for design content).
 */
export interface DesignSourceRef {
  /** External system class, verbatim (aligned with the AISE-037 registry; deliberately NOT re-validated here). */
  readonly systemClass: string;
  /** External system instance id, verbatim (e.g. "arch-cad-prod-01"). */
  readonly systemInstanceId: string;
  /** VERBATIM incumbent record id (e.g. "IFC-MODEL-0042"). */
  readonly sourceRecordId: string;
  /** Design revision/version identifier, verbatim (e.g. "C3"). */
  readonly revision: string;
  /** When the reference was retrieved from the incumbent system (ISO-8601 UTC). */
  readonly retrievedAt: string;
}

/** One design-side property assertion (BOQ scope/quantities, attributes). */
export interface DesignProperty {
  readonly key: string;
  readonly value: string | number | boolean;
  /** REQUIRED for numeric values (typed unit); absent for non-numeric. */
  readonly unit?: string;
}

/** A design-side geometry reference, VERBATIM (never parsed or resolved here). */
export interface DesignGeometryRef {
  readonly kind: string;
  readonly ref: string;
}

/**
 * One design item: the design document's object/position/quantity record.
 * `targetNodeId` is the EXPLICIT mapping to a Reality Graph node (R8);
 * its absence is honest (unmapped — no fuzzy matching, ever).
 */
export interface DesignItem {
  readonly designItemId: string;
  readonly label?: string;
  readonly targetNodeId?: string;
  readonly properties: readonly DesignProperty[];
  readonly geometry?: DesignGeometryRef;
  /** Verbatim cell/page/sheet traceability within the source record (R8). */
  readonly sourceDetail?: string;
}

/** The imported design reference document: source identity + items. */
export interface DesignReference {
  readonly title?: string;
  readonly sourceOfRecord: DesignSourceRef;
  /** Non-empty (parser-enforced): a design reference carries comparable scope. */
  readonly items: readonly DesignItem[];
}

/* ------------------------------------------------------------------ */
/* Comparison parameters                                               */
/* ------------------------------------------------------------------ */

/**
 * Measurement-uncertainty tolerances (absolute, in the compared
 * property's unit): per-key overrides plus an optional default. A numeric
 * deviation STRICTLY GREATER than the applicable tolerance is beyond it;
 * equal or smaller is within. Absent tolerance ⇒ a nonzero deviation is
 * an honest `unknown`, never a verdict.
 */
export interface ComparisonTolerances {
  readonly byKey: Readonly<Record<string, number>>;
  readonly default: number | null;
}

/** The canonical empty tolerance set: no byKey entries, no default. */
export const NO_TOLERANCES: ComparisonTolerances = Object.freeze({
  byKey: Object.freeze({}) as Readonly<Record<string, number>>,
  default: null,
});

/**
 * One explicit, evidence-backed capture-coverage claim for a design
 * item's mapped target: what the capture side knows about HOW that target
 * was (or was not) observed. This is the ONLY seam through which OCCLUDED
 * and capture-UNKNOWN enter the comparison — the pinned GraphVersion
 * alone cannot express them, and this module never fabricates them.
 */
export interface CoverageAnnotation {
  readonly targetNodeId: string;
  readonly observationStatus: CoverageObservationStatus;
  /** REQUIRED non-empty: evidence substantiating the coverage claim. */
  readonly evidenceIds: readonly string[];
}

/** The pinned Reality Graph version this comparison runs against. */
export interface RealityRef {
  readonly projectId: string;
  readonly versionId: string;
}

/** The full run-comparison boundary input (normalized form). */
export interface RunComparisonInput {
  readonly comparisonId: string;
  readonly realityRef: RealityRef;
  readonly designReference: DesignReference;
  readonly tolerances: ComparisonTolerances;
  readonly coverage: readonly CoverageAnnotation[];
}

/* ------------------------------------------------------------------ */
/* Comparison rows                                                      */
/* ------------------------------------------------------------------ */

/** One side's value snapshot, carried VERBATIM (never interpreted). */
export interface PropertyValueSnapshot {
  readonly value: string | number | boolean;
  readonly unit?: string;
  /** Reality side only: epistemic status VERBATIM (context, never a verdict). */
  readonly epistemicStatus?: string;
}

/** Both sides' geometry references, carried VERBATIM (never resolved here). */
export interface GeometryRefPair {
  readonly design: DesignGeometryRef;
  readonly reality: { readonly kind: string; readonly ref: string };
}

/**
 * One comparison row. `entryId` is content-derived and stable; the row is
 * fully self-describing for downstream traceability (R8: "user can trace
 * any material claim to source cells/pages/records"): design-anchored rows
 * carry the design-side source-of-record identity verbatim.
 */
export interface ComparisonEntry {
  readonly entryId: string;
  /** Design item that produced this row; null for `unplanned_in_reality` rows. */
  readonly designItemId: string | null;
  /** The mapped target node id (design's mapping); the nodeId on unplanned rows. */
  readonly targetNodeId: string | null;
  readonly aspect: ComparisonAspect;
  /** Present iff aspect === "property". */
  readonly propertyKey: string | null;
  readonly status: ComparisonStatus;
  /** Present iff the comparison was honestly omitted (typed reason). */
  readonly omissionCode?: ComparisonOmissionCode;
  readonly designValue?: PropertyValueSnapshot;
  readonly realityValue?: PropertyValueSnapshot;
  /** Signed numeric deviation (reality − design); numeric comparisons only. */
  readonly deviation?: number;
  /** The tolerance that produced the verdict; applied-tolerance rows only. */
  readonly tolerance?: number;
  /** Reality-side substantiating evidence ids (provenance-derived, ordered, deduped). */
  readonly realityEvidenceIds: readonly string[];
  /** Coverage-annotation evidence ids merged into this row's substantiation. */
  readonly coverageEvidenceIds: readonly string[];
  /** Design-side source-of-record identity (design-anchored rows only; verbatim). */
  readonly designSourceRef: DesignSourceRef | null;
  readonly sourceDetail?: string;
  /** Reality node context, carried VERBATIM (unplanned rows only). */
  readonly realityNode?: { readonly kind: string; readonly epistemicStatus: string };
  readonly geometryRefs?: GeometryRefPair;
  readonly note?: string;
}

/** Row statistics — ALWAYS consistent with the entries above. */
export interface ComparisonStats {
  readonly totalEntries: number;
  readonly matches: number;
  readonly withinTolerance: number;
  readonly differs: number;
  readonly deviationBeyondTolerance: number;
  readonly unknown: number;
  readonly notObservedInReality: number;
  readonly occludedInReality: number;
  readonly unplannedInReality: number;
  /** The discrepancy family: differs + deviationBeyondTolerance. */
  readonly discrepancies: number;
}

/** One append-only audit event: pins the full record content digest. */
export interface ComparisonEvent {
  readonly eventId: string;
  readonly eventType: ComparisonEventType;
  readonly occurredAt: string;
  /** sha-256 of the comparison content (record minus history) at commit. */
  readonly recordDigest: string;
}

/**
 * The DERIVED comparison record. Append-only, write-once: re-running
 * against newer inputs is a NEW record. `inputDigest` pins BOTH sources
 * byte-exactly (sha-256 over the canonical JSON of the resolved reality
 * version + design reference + tolerances + coverage); `realityRef` names
 * the pinned version by identity only.
 */
export interface ComparisonRecord {
  readonly comparisonId: string;
  readonly realityRef: RealityRef;
  readonly designReference: DesignReference;
  readonly tolerances: ComparisonTolerances;
  readonly coverage: readonly CoverageAnnotation[];
  readonly entries: readonly ComparisonEntry[];
  readonly stats: ComparisonStats;
  readonly inputDigest: string;
  readonly computedAt: string;
  readonly history: readonly ComparisonEvent[];
}

/** List projection (never the full record). */
export interface ComparisonSummary {
  readonly comparisonId: string;
  readonly projectId: string;
  readonly versionId: string;
  readonly designSystemClass: string;
  readonly designSourceRecordId: string;
  readonly designRevision: string;
  readonly totalEntries: number;
  readonly discrepancies: number;
  readonly computedAt: string;
}

/** Pure list projection of one comparison record. */
export function summarizeComparison(record: ComparisonRecord): ComparisonSummary {
  return {
    comparisonId: record.comparisonId,
    projectId: record.realityRef.projectId,
    versionId: record.realityRef.versionId,
    designSystemClass: record.designReference.sourceOfRecord.systemClass,
    designSourceRecordId: record.designReference.sourceOfRecord.sourceRecordId,
    designRevision: record.designReference.sourceOfRecord.revision,
    totalEntries: record.stats.totalEntries,
    discrepancies: record.stats.discrepancies,
    computedAt: record.computedAt,
  };
}

/* ------------------------------------------------------------------ */
/* Digests                                                             */
/* ------------------------------------------------------------------ */

/**
 * sha-256 over the canonical JSON of the comparison CONTENT (every field
 * except the audit history). Pure: the same content always yields the
 * same digest — this pins what each event committed and keeps two stores
 * running the same operation sequence byte-identical.
 */
export function comparisonContentDigest(record: ComparisonRecord): string {
  const {
    comparisonId,
    realityRef,
    designReference,
    tolerances,
    coverage,
    entries,
    stats,
    inputDigest,
    computedAt,
  } = record;
  return sha256Hex(
    canonicalJsonStringify({
      comparisonId,
      realityRef,
      designReference,
      tolerances,
      coverage,
      entries,
      stats,
      inputDigest,
      computedAt,
    }),
  );
}

/**
 * sha-256 over the canonical JSON of BOTH source documents plus the
 * comparison parameters — the byte-exact pin of what was compared. The
 * same (reality version, design reference, tolerances, coverage) always
 * yields the same digest; any change to either source changes it.
 */
export function comparisonInputDigest(input: {
  readonly realityVersion: GraphVersion;
  readonly designReference: DesignReference;
  readonly tolerances: ComparisonTolerances;
  readonly coverage: readonly CoverageAnnotation[];
}): string {
  return sha256Hex(
    canonicalJsonStringify({
      realityVersion: input.realityVersion,
      designReference: input.designReference,
      tolerances: input.tolerances,
      coverage: input.coverage,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* The pure deterministic comparison matrix builder                    */
/* ------------------------------------------------------------------ */

/**
 * Structural reading of one reality node's property list: duplicate keys
 * resolve LAST-WINS (the AISE-033 documented convention for authoritative
 * snapshot slices — matches the versioning engine's upsert-replace
 * reading). The DESIGN side refuses duplicates at its own boundary
 * instead (caller-authored input, fail-closed there).
 */
function propertyMapOf(node: RealityNode): Map<string, RealityNode["properties"][number]> {
  const byKey = new Map<string, RealityNode["properties"][number]>();
  for (const property of node.properties) {
    byKey.set(property.key, property);
  }
  return byKey;
}

/**
 * Collect the reality-side evidence ids substantiating a row: the
 * compared property's provenance records first (in record order), then
 * the node's own provenance as fallback — measurement/observation
 * provenance from the reality side. Deduplicated, order-preserving
 * (deterministic bytes).
 */
function realityEvidenceIdsOf(
  node: RealityNode,
  property?: RealityNode["properties"][number],
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (evidenceId: string | undefined): void => {
    if (evidenceId !== undefined && !seen.has(evidenceId)) {
      seen.add(evidenceId);
      ids.push(evidenceId);
    }
  };
  if (property !== undefined) {
    for (const record of property.provenance) {
      push(record.evidenceId);
    }
  }
  for (const record of node.provenance) {
    push(record.evidenceId);
  }
  return ids;
}

/** Deterministic row id: `ent-<16 hex>` over comparisonId + row identity. */
function entryIdOf(
  comparisonId: string,
  designItemId: string | null,
  aspect: ComparisonAspect,
  propertyKey: string | null,
  nodeId: string | null,
): string {
  return `ent-${sha256Hex(
    `${comparisonId}:${designItemId ?? "-"}:${aspect}:${propertyKey ?? "-"}:${nodeId ?? "-"}`,
  ).slice(0, 16)}`;
}

function snapshotOfProperty(
  property: RealityNode["properties"][number],
): PropertyValueSnapshot {
  return {
    value: property.value,
    ...(property.unit === undefined ? {} : { unit: property.unit }),
    epistemicStatus: property.epistemicStatus,
  };
}

function snapshotOfDesign(property: DesignProperty): PropertyValueSnapshot {
  return {
    value: property.value,
    ...(property.unit === undefined ? {} : { unit: property.unit }),
  };
}

interface MatrixInput {
  readonly comparisonId: string;
  readonly realityVersion: GraphVersion;
  readonly designReference: DesignReference;
  readonly tolerances: ComparisonTolerances;
  readonly coverage: readonly CoverageAnnotation[];
}

/**
 * Build the reality-vs-design comparison matrix. PURE and DETERMINISTIC:
 * no clock, no randomness, no I/O — the same inputs always yield
 * byte-identical entries (canonical order: design-anchored rows sorted by
 * designItemId, within an item object → geometry → properties sorted by
 * key; unplanned rows last, sorted by nodeId).
 *
 * Typed refusals thrown here (deterministic, documented):
 *   - `coverage_contradicts_reality`  an annotation asserts NOT_OBSERVED
 *                                      or OCCLUDED for a node the pinned
 *                                      version carries — the graph is
 *                                      authoritative on captured reality;
 *   - `discrepancy_without_evidence`  a differs/deviation row has NO
 *                                      reality-side evidence id — an
 *                                      unsubstantiated discrepancy is
 *                                      never an emitted row.
 */
export function compareRealityToDesign(input: MatrixInput): readonly ComparisonEntry[] {
  const { comparisonId, realityVersion, designReference, tolerances, coverage } = input;

  const liveNodes = new Map(realityVersion.nodes.map((node) => [node.nodeId, node]));
  const tombstones = new Map(realityVersion.tombstones.map((stone) => [stone.nodeId, stone]));
  const annotations = new Map(coverage.map((annotation) => [annotation.targetNodeId, annotation]));
  const mappedTargets = new Set(
    designReference.items
      .map((item) => item.targetNodeId)
      .filter((target): target is string => target !== undefined),
  );

  const entries: ComparisonEntry[] = [];

  const items = [...designReference.items].sort((a, b) =>
    a.designItemId < b.designItemId ? -1 : a.designItemId > b.designItemId ? 1 : 0,
  );

  for (const item of items) {
    const sourceRef = designReference.sourceOfRecord;
    const base = {
      designItemId: item.designItemId,
      designSourceRef: sourceRef,
      ...(item.sourceDetail === undefined ? {} : { sourceDetail: item.sourceDetail }),
    };

    /* Unmapped design item — no mapping, no comparison possible. */
    if (item.targetNodeId === undefined) {
      entries.push({
        entryId: entryIdOf(comparisonId, item.designItemId, "object", null, null),
        ...base,
        targetNodeId: null,
        aspect: "object",
        propertyKey: null,
        status: "unknown",
        omissionCode: "unmapped_design_item",
        realityEvidenceIds: [],
        coverageEvidenceIds: [],
        note: "design item declares no targetNodeId mapping — no fuzzy matching exists; map it explicitly (R8) to compare",
      });
      continue;
    }

    const targetNodeId = item.targetNodeId;
    const node = liveNodes.get(targetNodeId);
    const annotation = annotations.get(targetNodeId);

    /* Target absent from captured reality (never present, or tombstoned). */
    if (node === undefined) {
      const tombstone = tombstones.get(targetNodeId);
      const status: ComparisonStatus =
        annotation === undefined || annotation.observationStatus === "NOT_OBSERVED"
          ? "not_observed_in_reality"
          : annotation.observationStatus === "OCCLUDED"
            ? "occluded_in_reality"
            : "unknown";
      const omissionCode =
        annotation === undefined
          ? undefined
          : annotation.observationStatus === "OCCLUDED"
            ? ("occluded_target" as const)
            : annotation.observationStatus === "UNKNOWN"
              ? ("coverage_unknown" as const)
              : undefined;
      entries.push({
        entryId: entryIdOf(comparisonId, item.designItemId, "object", null, targetNodeId),
        ...base,
        targetNodeId,
        aspect: "object",
        propertyKey: null,
        status,
        ...(omissionCode === undefined ? {} : { omissionCode }),
        realityEvidenceIds: [],
        coverageEvidenceIds: annotation === undefined ? [] : [...annotation.evidenceIds],
        note:
          tombstone === undefined
            ? "mapped target is absent from the pinned reality version"
            : `mapped target is tombstoned in ${realityVersion.versionId}: ${tombstone.reason}`,
      });
      continue;
    }

    /* Target present: an annotation asserting non-observation contradicts
     * the authoritative version — fail closed, never silently resolved. */
    if (
      annotation !== undefined &&
      (annotation.observationStatus === "NOT_OBSERVED" || annotation.observationStatus === "OCCLUDED")
    ) {
      throw new ComparisonError(
        "coverage_contradicts_reality",
        `coverage annotation claims ${annotation.observationStatus} for target ${targetNodeId} ` +
          `but reality version ${realityVersion.versionId} carries the node — ` +
          `the Reality Graph is authoritative for what captured reality contains`,
      );
    }

    /* Target present + capture status UNKNOWN: every verdict would rest on
     * observations the capture side cannot confirm — one honest row. */
    if (annotation !== undefined && annotation.observationStatus === "UNKNOWN") {
      entries.push({
        entryId: entryIdOf(comparisonId, item.designItemId, "object", null, targetNodeId),
        ...base,
        targetNodeId,
        aspect: "object",
        propertyKey: null,
        status: "unknown",
        omissionCode: "coverage_unknown",
        realityEvidenceIds: realityEvidenceIdsOf(node),
        coverageEvidenceIds: [...annotation.evidenceIds],
        note: "capture-side coverage status is UNKNOWN for this target — verdicts are omitted, never guessed",
      });
      continue;
    }

    /* Target present, node itself a PROPOSAL: proposals are not
     * observed/modelled reality — one honest row, no verdicts. */
    if (node.epistemicStatus === "PROPOSED") {
      entries.push({
        entryId: entryIdOf(comparisonId, item.designItemId, "object", null, targetNodeId),
        ...base,
        targetNodeId,
        aspect: "object",
        propertyKey: null,
        status: "unknown",
        omissionCode: "proposed_reality_node",
        realityEvidenceIds: realityEvidenceIdsOf(node),
        coverageEvidenceIds: [],
        realityValue: {
          value: node.epistemicStatus,
          epistemicStatus: node.epistemicStatus,
        },
        note: "the pinned reality node is a PROPOSED intervention state — proposals are never compared as observed/modelled reality",
      });
      continue;
    }

    const nodeEvidenceIds = realityEvidenceIdsOf(node);

    /* Geometry row (design asserts geometry): never resolved here — this
     * module owns no geometry-resolution authority (AISE-013/033). */
    if (item.geometry !== undefined) {
      const nodeGeometry = node.geometry;
      entries.push({
        entryId: entryIdOf(comparisonId, item.designItemId, "geometry", null, targetNodeId),
        ...base,
        targetNodeId,
        aspect: "geometry",
        propertyKey: null,
        status: nodeGeometry === undefined ? "not_observed_in_reality" : "unknown",
        ...(nodeGeometry === undefined
          ? {}
          : { omissionCode: "geometry_not_comparable" as const }),
        realityEvidenceIds: nodeEvidenceIds,
        coverageEvidenceIds: [],
        ...(nodeGeometry === undefined
          ? {}
          : {
              geometryRefs: {
                design: item.geometry,
                reality: { kind: nodeGeometry.kind, ref: nodeGeometry.ref },
              },
            }),
        note:
          nodeGeometry === undefined
            ? "the design asserts geometry but the pinned reality node carries no geometry reference"
            : "both sides reference geometry; this module owns no geometry-resolution authority — the comparison is honestly omitted",
      });
    }

    const properties = [...item.properties].sort((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    );
    const realityProperties = propertyMapOf(node);

    for (const designProperty of properties) {
      const realityProperty = realityProperties.get(designProperty.key);
      const rowBase = {
        entryId: entryIdOf(
          comparisonId,
          item.designItemId,
          "property",
          designProperty.key,
          targetNodeId,
        ),
        ...base,
        targetNodeId,
        aspect: "property" as const,
        propertyKey: designProperty.key,
        designValue: snapshotOfDesign(designProperty),
        coverageEvidenceIds: [] as readonly string[],
      };

      /* Design property not observed on the pinned node. */
      if (realityProperty === undefined) {
        entries.push({
          ...rowBase,
          status: "not_observed_in_reality",
          realityEvidenceIds: nodeEvidenceIds,
          note: "the pinned reality node carries no assertion for this property key",
        });
        continue;
      }

      const realityValue = snapshotOfProperty(realityProperty);
      const evidenceIds = realityEvidenceIdsOf(node, realityProperty);

      /* Reality property is a PROPOSAL — not observed/modelled reality. */
      if (realityProperty.epistemicStatus === "PROPOSED") {
        entries.push({
          ...rowBase,
          status: "unknown",
          omissionCode: "proposed_reality_property",
          realityValue,
          realityEvidenceIds: evidenceIds,
          note: "the pinned reality property is a PROPOSED assertion — never compared as observed/modelled reality",
        });
        continue;
      }

      /* Type mismatch (or non-finite) — incomparable, honestly unknown. */
      const designType = typeof designProperty.value;
      const realityType = typeof realityProperty.value;
      const typesComparable =
        designType === realityType &&
        (designType !== "number" ||
          (Number.isFinite(designProperty.value) && Number.isFinite(realityProperty.value)));
      if (!typesComparable) {
        entries.push({
          ...rowBase,
          status: "unknown",
          omissionCode: "incomparable_value_types",
          realityValue,
          realityEvidenceIds: evidenceIds,
          note: `design value type ${designType} vs reality value type ${realityType} — no coercion ever happens here`,
        });
        continue;
      }

      /* Numeric comparison (uncertainty-aware). */
      if (designType === "number" && realityType === "number") {
        const designValue = designProperty.value as number;
        const realityNum = realityProperty.value as number;
        const designUnit = designProperty.unit;
        const realityUnit = realityProperty.unit;
        if (designUnit !== realityUnit) {
          entries.push({
            ...rowBase,
            status: "unknown",
            omissionCode: "incompatible_units",
            realityValue,
            realityEvidenceIds: evidenceIds,
            note: `design unit "${designUnit ?? "(none)"}" vs reality unit "${realityUnit ?? "(none)"}" — this module owns no unit-conversion authority`,
          });
          continue;
        }
        const deviation = realityNum - designValue;
        if (deviation === 0) {
          entries.push({
            ...rowBase,
            status: "matches",
            realityValue,
            deviation,
            realityEvidenceIds: evidenceIds,
          });
          continue;
        }
        const tolerance =
          tolerances.byKey[designProperty.key] !== undefined
            ? tolerances.byKey[designProperty.key]
            : tolerances.default;
        if (tolerance === undefined || tolerance === null) {
          entries.push({
            ...rowBase,
            status: "unknown",
            omissionCode: "numeric_comparison_without_tolerance",
            realityValue,
            deviation,
            realityEvidenceIds: evidenceIds,
            note: "nonzero deviation with no applicable tolerance — asserting match/differ without the uncertainty budget would be an overclaim",
          });
          continue;
        }
        if (Math.abs(deviation) <= tolerance) {
          entries.push({
            ...rowBase,
            status: "within_tolerance",
            realityValue,
            deviation,
            tolerance,
            realityEvidenceIds: evidenceIds,
          });
          continue;
        }
        /* Deviation beyond tolerance: a DISCREPANCY — substantiation is
         * MANDATORY (fail-closed; never an unsubstantiated emitted row). */
        if (evidenceIds.length === 0) {
          throw new ComparisonError(
            "discrepancy_without_evidence",
            `property "${designProperty.key}" on node ${targetNodeId} deviates ` +
              `${deviation > 0 ? "+" : ""}${deviation} beyond tolerance ${tolerance} but the reality-side ` +
              `provenance carries NO evidence id — an unsubstantiated discrepancy is never an emitted row`,
          );
        }
        entries.push({
          ...rowBase,
          status: "deviation_beyond_tolerance",
          realityValue,
          deviation,
          tolerance,
          realityEvidenceIds: evidenceIds,
        });
        continue;
      }

      /* Non-numeric comparison: exact equality or a substantiated differ. */
      if (designProperty.value === realityProperty.value) {
        entries.push({
          ...rowBase,
          status: "matches",
          realityValue,
          realityEvidenceIds: evidenceIds,
        });
        continue;
      }
      if (evidenceIds.length === 0) {
        throw new ComparisonError(
          "discrepancy_without_evidence",
          `property "${designProperty.key}" on node ${targetNodeId} differs ` +
            `(${JSON.stringify(designProperty.value)} vs ${JSON.stringify(realityProperty.value)}) ` +
            `but the reality-side provenance carries NO evidence id — an unsubstantiated discrepancy is never an emitted row`,
        );
      }
      entries.push({
        ...rowBase,
        status: "differs",
        realityValue,
        realityEvidenceIds: evidenceIds,
      });
    }

    /* Item with no comparable assertions at all: object-level
     * correspondence only — honest, never inflated to a value verdict. */
    if (item.properties.length === 0 && item.geometry === undefined) {
      entries.push({
        entryId: entryIdOf(comparisonId, item.designItemId, "object", null, targetNodeId),
        ...base,
        targetNodeId,
        aspect: "object",
        propertyKey: null,
        status: "matches",
        realityEvidenceIds: nodeEvidenceIds,
        coverageEvidenceIds: [],
        realityNode: { kind: node.kind, epistemicStatus: node.epistemicStatus },
        note: "object-level correspondence only; the design item carries no comparable assertions",
      });
    }
  }

  /* Honest coverage: live reality nodes no design item maps to. */
  const unplanned = [...liveNodes.values()]
    .filter((node) => !mappedTargets.has(node.nodeId))
    .sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
  for (const node of unplanned) {
    entries.push({
      entryId: entryIdOf(comparisonId, null, "object", null, node.nodeId),
      designItemId: null,
      targetNodeId: node.nodeId,
      aspect: "object",
      propertyKey: null,
      status: "unplanned_in_reality",
      realityEvidenceIds: realityEvidenceIdsOf(node),
      coverageEvidenceIds: [],
      designSourceRef: null,
      realityNode: { kind: node.kind, epistemicStatus: node.epistemicStatus },
      note: "live reality node with no design counterpart in the compared reference",
    });
  }

  return entries;
}

/** Row statistics, derived — ALWAYS consistent with the entries. */
export function comparisonStatsOf(entries: readonly ComparisonEntry[]): ComparisonStats {
  let matches = 0;
  let withinTolerance = 0;
  let differs = 0;
  let deviationBeyondTolerance = 0;
  let unknown = 0;
  let notObservedInReality = 0;
  let occludedInReality = 0;
  let unplannedInReality = 0;
  for (const entry of entries) {
    switch (entry.status) {
      case "matches":
        matches += 1;
        break;
      case "within_tolerance":
        withinTolerance += 1;
        break;
      case "differs":
        differs += 1;
        break;
      case "deviation_beyond_tolerance":
        deviationBeyondTolerance += 1;
        break;
      case "unknown":
        unknown += 1;
        break;
      case "not_observed_in_reality":
        notObservedInReality += 1;
        break;
      case "occluded_in_reality":
        occludedInReality += 1;
        break;
      case "unplanned_in_reality":
        unplannedInReality += 1;
        break;
    }
  }
  return {
    totalEntries: entries.length,
    matches,
    withinTolerance,
    differs,
    deviationBeyondTolerance,
    unknown,
    notObservedInReality,
    occludedInReality,
    unplannedInReality,
    discrepancies: differs + deviationBeyondTolerance,
  };
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

function isIso(value: unknown): value is string {
  return typeof value === "string" && ISO_UTC.test(value);
}

function isContentId(value: unknown): value is string {
  return typeof value === "string" && CONTENT_ID.test(value);
}

function isVersionId(value: unknown): value is string {
  return typeof value === "string" && VERSION_ID.test(value);
}

function isPropertyValue(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

/** comparisonId shape (caller-stable opaque identity, 1..256 chars). */
export function validateComparisonId(comparisonId: string): void {
  if (typeof comparisonId !== "string" || comparisonId.length < 1 || comparisonId.length > 256) {
    throw new ComparisonError("invalid_comparison_id", "comparisonId must be 1..256 characters");
  }
}

/** projectId shape (mirrors the Reality Graph authority's bounds). */
export function validateProjectRefId(projectId: string): void {
  if (typeof projectId !== "string" || projectId.length < 1 || projectId.length > 256) {
    throw new ComparisonError("invalid_project_id", "projectId must be 1..256 characters");
  }
}

/** versionId shape (`vNNN`, the Reality Graph authority's convention). */
export function validateVersionRefId(versionId: string): void {
  if (typeof versionId !== "string" || !VERSION_ID.test(versionId)) {
    throw new ComparisonError(
      "invalid_version_id",
      "versionId must be a well-formed reality version id (v001, v002, …)",
    );
  }
}

function parseSourceOfRecord(value: unknown): DesignSourceRef {
  if (!isRecord(value)) {
    throw new ComparisonError("invalid_source_of_record", "sourceOfRecord must be an object");
  }
  const systemClass = value["systemClass"];
  if (!boundedString(systemClass, 64)) {
    throw new ComparisonError(
      "invalid_source_of_record",
      "systemClass must be a non-empty string (<=64 chars), carried VERBATIM — the incumbent system class is never re-validated here",
    );
  }
  const systemInstanceId = value["systemInstanceId"];
  if (!boundedString(systemInstanceId, 256)) {
    throw new ComparisonError(
      "invalid_source_of_record",
      "systemInstanceId must be 1..256 characters",
    );
  }
  const sourceRecordId = value["sourceRecordId"];
  if (!boundedString(sourceRecordId, 256)) {
    throw new ComparisonError(
      "invalid_source_of_record",
      "sourceRecordId must be 1..256 characters (VERBATIM incumbent record identity — never re-keyed)",
    );
  }
  const revision = value["revision"];
  if (!boundedString(revision, 128)) {
    throw new ComparisonError("invalid_source_of_record", "revision must be 1..128 characters");
  }
  const retrievedAt = value["retrievedAt"];
  if (!isIso(retrievedAt)) {
    throw new ComparisonError(
      "invalid_timestamp",
      "retrievedAt must be an ISO-8601 UTC timestamp (milliseconds, e.g. 2026-03-02T09:00:00.000Z)",
    );
  }
  return { systemClass, systemInstanceId, sourceRecordId, revision, retrievedAt };
}

function parseDesignProperty(value: unknown): DesignProperty {
  if (!isRecord(value)) {
    throw new ComparisonError("invalid_design_property", "design property must be an object");
  }
  const key = value["key"];
  if (!boundedString(key, 256)) {
    throw new ComparisonError("invalid_design_property", "property key must be 1..256 characters");
  }
  const propertyValue = value["value"];
  if (!isPropertyValue(propertyValue)) {
    throw new ComparisonError(
      "invalid_design_property",
      "property value must be a finite number, string or boolean",
    );
  }
  const unit = value["unit"];
  if (typeof propertyValue === "number") {
    if (typeof unit !== "string" || unit.length < 1 || unit.length > 64) {
      throw new ComparisonError(
        "invalid_design_property",
        `numeric design value for key "${key}" REQUIRES a typed unit (<=64 chars) — a unitless design quantity cannot be uncertainty-compared`,
      );
    }
  } else if (unit !== undefined) {
    throw new ComparisonError(
      "invalid_design_property",
      `unit is only applicable to numeric design values (key "${key}")`,
    );
  }
  return {
    key,
    value: propertyValue,
    ...(unit === undefined ? {} : { unit }),
  };
}

function parseDesignGeometry(value: unknown): DesignGeometryRef {
  if (!isRecord(value)) {
    throw new ComparisonError("invalid_design_item", "design geometry must be an object");
  }
  const kind = value["kind"];
  if (!boundedString(kind, 64)) {
    throw new ComparisonError("invalid_design_item", "geometry kind must be 1..64 characters (verbatim)");
  }
  const ref = value["ref"];
  if (!boundedString(ref, 256)) {
    throw new ComparisonError("invalid_design_item", "geometry ref must be 1..256 characters (verbatim)");
  }
  return { kind, ref };
}

function parseDesignItem(value: unknown): DesignItem {
  if (!isRecord(value)) {
    throw new ComparisonError("invalid_design_item", "design item must be an object");
  }
  const designItemId = value["designItemId"];
  if (!boundedString(designItemId, 256)) {
    throw new ComparisonError("invalid_design_item", "designItemId must be 1..256 characters");
  }
  const label = value["label"];
  if (label !== undefined && !boundedString(label, 512)) {
    throw new ComparisonError("invalid_design_item", "label must be 1..512 characters");
  }
  const targetNodeId = value["targetNodeId"];
  if (targetNodeId !== undefined && !boundedString(targetNodeId, 256)) {
    throw new ComparisonError("invalid_design_item", "targetNodeId must be 1..256 characters");
  }
  const properties = value["properties"];
  if (properties === undefined) {
    throw new ComparisonError(
      "invalid_design_item",
      `design item ${designItemId} must carry a properties array (possibly empty — object-level comparison)`,
    );
  }
  if (!Array.isArray(properties)) {
    throw new ComparisonError("invalid_design_item", "properties must be an array");
  }
  const parsedProperties = properties.map(parseDesignProperty);
  const seenKeys = new Set<string>();
  for (const property of parsedProperties) {
    if (seenKeys.has(property.key)) {
      throw new ComparisonError(
        "invalid_design_item",
        `duplicate property key "${property.key}" on design item ${designItemId} — the caller-authored design reference is fail-closed at this boundary (the authoritative reality side resolves duplicate keys last-wins instead)`,
      );
    }
    seenKeys.add(property.key);
  }
  const geometry = value["geometry"];
  if (geometry !== undefined && !isRecord(geometry)) {
    throw new ComparisonError("invalid_design_item", "geometry must be an object");
  }
  const sourceDetail = value["sourceDetail"];
  if (sourceDetail !== undefined && !boundedString(sourceDetail, 256)) {
    throw new ComparisonError("invalid_design_item", "sourceDetail must be 1..256 characters");
  }
  return {
    designItemId,
    ...(label === undefined ? {} : { label }),
    ...(targetNodeId === undefined ? {} : { targetNodeId }),
    properties: parsedProperties,
    ...(geometry === undefined ? {} : { geometry: parseDesignGeometry(geometry) }),
    ...(sourceDetail === undefined ? {} : { sourceDetail }),
  };
}

function parseDesignReference(value: unknown): DesignReference {
  if (!isRecord(value)) {
    throw new ComparisonError("invalid_design_reference", "designReference must be an object");
  }
  const title = value["title"];
  if (title !== undefined && !boundedString(title, 256)) {
    throw new ComparisonError("invalid_design_reference", "title must be 1..256 characters");
  }
  const sourceOfRecord = parseSourceOfRecord(value["sourceOfRecord"]);
  const items = value["items"];
  if (!Array.isArray(items) || items.length === 0) {
    throw new ComparisonError(
      "comparison_without_items",
      "designReference.items must be a NON-EMPTY array — a design reference with no items carries no scope to compare",
    );
  }
  const parsedItems = items.map(parseDesignItem);
  const seenIds = new Set<string>();
  for (const item of parsedItems) {
    if (seenIds.has(item.designItemId)) {
      throw new ComparisonError(
        "duplicate_design_item",
        `duplicate designItemId "${item.designItemId}" — design item identity must be unique within the reference`,
      );
    }
    seenIds.add(item.designItemId);
  }
  return {
    ...(title === undefined ? {} : { title }),
    sourceOfRecord,
    items: parsedItems,
  };
}

function parseTolerances(value: unknown): ComparisonTolerances {
  if (value === undefined || value === null) {
    return { byKey: {}, default: null };
  }
  if (!isRecord(value)) {
    throw new ComparisonError("invalid_tolerance", "tolerances must be an object");
  }
  const byKeyValue = value["byKey"];
  let byKey: Record<string, number> = {};
  if (byKeyValue !== undefined && byKeyValue !== null) {
    if (!isRecord(byKeyValue)) {
      throw new ComparisonError("invalid_tolerance", "tolerances.byKey must be an object");
    }
    byKey = {};
    for (const key of Object.keys(byKeyValue)) {
      if (key.length < 1 || key.length > 256) {
        throw new ComparisonError("invalid_tolerance", "byKey keys must be 1..256 characters");
      }
      const toleranceValue = byKeyValue[key];
      if (
        typeof toleranceValue !== "number" ||
        !Number.isFinite(toleranceValue) ||
        toleranceValue < 0
      ) {
        throw new ComparisonError(
          "invalid_tolerance",
          `tolerance for key "${key}" must be a finite number >= 0 (absolute, in the property's unit)`,
        );
      }
      byKey[key] = toleranceValue;
    }
  }
  const defaultValue = value["default"];
  if (defaultValue !== undefined && defaultValue !== null) {
    if (typeof defaultValue !== "number" || !Number.isFinite(defaultValue) || defaultValue < 0) {
      throw new ComparisonError(
        "invalid_tolerance",
        "tolerances.default must be a finite number >= 0 (absolute, in the property's unit)",
      );
    }
    return { byKey, default: defaultValue };
  }
  return { byKey, default: null };
}

function isCoverageObservationStatus(value: unknown): value is CoverageObservationStatus {
  return (
    typeof value === "string" &&
    (COVERAGE_OBSERVATION_STATUSES as readonly string[]).includes(value)
  );
}

function parseCoverageAnnotation(value: unknown): CoverageAnnotation {
  if (!isRecord(value)) {
    throw new ComparisonError("invalid_coverage", "coverage entries must be objects");
  }
  const targetNodeId = value["targetNodeId"];
  if (!boundedString(targetNodeId, 256)) {
    throw new ComparisonError("invalid_coverage", "coverage targetNodeId must be 1..256 characters");
  }
  const observationStatus = value["observationStatus"];
  if (!isCoverageObservationStatus(observationStatus)) {
    throw new ComparisonError(
      "invalid_coverage",
      `observationStatus must be one of ${COVERAGE_OBSERVATION_STATUSES.join("|")}`,
    );
  }
  const evidenceIds = value["evidenceIds"];
  if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
    throw new ComparisonError(
      "coverage_without_evidence",
      `coverage annotation for ${targetNodeId} requires a NON-EMPTY evidenceIds array — an unsubstantiated coverage claim is rejected`,
    );
  }
  if (!evidenceIds.every((entry) => isContentId(entry))) {
    throw new ComparisonError(
      "invalid_evidence_ref",
      "every coverage evidenceId must be a 64-hex Evidence-Graph content address",
    );
  }
  return { targetNodeId, observationStatus, evidenceIds };
}

function parseCoverage(value: unknown): CoverageAnnotation[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ComparisonError("invalid_coverage", "coverage must be an array");
  }
  const annotations = value.map(parseCoverageAnnotation);
  const seenTargets = new Set<string>();
  for (const annotation of annotations) {
    if (seenTargets.has(annotation.targetNodeId)) {
      throw new ComparisonError(
        "invalid_coverage",
        `duplicate coverage annotation for target ${annotation.targetNodeId}`,
      );
    }
    seenTargets.add(annotation.targetNodeId);
  }
  return annotations;
}

/**
 * Parse and normalize the run-comparison boundary input. Shape and
 * vocabulary only (typed codes); deep semantic invariants — reality
 * resolution, coverage target mapping, evidence membership, the
 * fail-closed substantiation check — are the service's duty.
 */
export function parseRunComparisonInput(payload: unknown): RunComparisonInput {
  if (!isRecord(payload)) {
    throw new ComparisonError("invalid_comparison", "expected a JSON object");
  }
  const comparisonId = payload["comparisonId"];
  if (!isNonEmptyString(comparisonId)) {
    throw new ComparisonError("invalid_comparison_id", "comparisonId must be a non-empty string");
  }
  validateComparisonId(comparisonId);

  const realityRefValue = payload["realityRef"];
  if (!isRecord(realityRefValue)) {
    throw new ComparisonError("invalid_comparison", "realityRef must be an object");
  }
  const projectId = realityRefValue["projectId"];
  if (!isNonEmptyString(projectId)) {
    throw new ComparisonError("invalid_project_id", "realityRef.projectId must be a non-empty string");
  }
  validateProjectRefId(projectId);
  const versionId = realityRefValue["versionId"];
  if (!isNonEmptyString(versionId)) {
    throw new ComparisonError("invalid_version_id", "realityRef.versionId must be a non-empty string");
  }
  validateVersionRefId(versionId);

  const designReference = parseDesignReference(payload["designReference"]);
  const tolerances = parseTolerances(payload["tolerances"]);
  const coverage = parseCoverage(payload["coverage"]);

  return {
    comparisonId,
    realityRef: { projectId, versionId },
    designReference,
    tolerances,
    coverage,
  };
}

/* ------------------------------------------------------------------ */
/* Stored-record parser (store reads; write-time duty is the service's)*/
/* ------------------------------------------------------------------ */

function invalidRecord(detail: string): ComparisonError {
  return new ComparisonError("invalid_comparison_record", detail);
}

function parseStoredSnapshot(value: unknown, where: string): PropertyValueSnapshot {
  if (!isRecord(value)) throw invalidRecord(`${where} is not an object`);
  const propertyValue = value["value"];
  if (!isPropertyValue(propertyValue)) throw invalidRecord(`${where}.value`);
  const unit = value["unit"];
  if (unit !== undefined && !boundedString(unit, 64)) throw invalidRecord(`${where}.unit`);
  const epistemicStatus = value["epistemicStatus"];
  if (epistemicStatus !== undefined && !boundedString(epistemicStatus, 64)) {
    throw invalidRecord(`${where}.epistemicStatus`);
  }
  return {
    value: propertyValue,
    ...(unit === undefined ? {} : { unit }),
    ...(epistemicStatus === undefined ? {} : { epistemicStatus }),
  };
}

function parseStoredEvidenceIds(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => isContentId(entry))) {
    throw invalidRecord(`${where} must be an array of 64-hex evidence content ids`);
  }
  return value;
}

/** Stored reads re-validate source-of-record identity as CORRUPTION on failure. */
function storedSourceOfRecord(value: unknown, where: string): DesignSourceRef {
  try {
    return parseSourceOfRecord(value);
  } catch (error) {
    if (error instanceof ComparisonError) {
      throw invalidRecord(`${where}: ${error.code}: ${error.detail}`);
    }
    throw error;
  }
}

/** Stored reads re-validate geometry references as CORRUPTION on failure. */
function storedGeometry(value: unknown, where: string): DesignGeometryRef {
  try {
    return parseDesignGeometry(value);
  } catch (error) {
    if (error instanceof ComparisonError) {
      throw invalidRecord(`${where}: ${error.code}: ${error.detail}`);
    }
    throw error;
  }
}

function parseStoredEntry(value: unknown): ComparisonEntry {
  if (!isRecord(value)) throw invalidRecord("entry is not an object");
  if (!boundedString(value["entryId"], 64)) throw invalidRecord("entry.entryId");
  const designItemId = value["designItemId"];
  if (designItemId !== null && designItemId !== undefined && !boundedString(designItemId, 256)) {
    throw invalidRecord("entry.designItemId");
  }
  const targetNodeId = value["targetNodeId"];
  if (targetNodeId !== null && targetNodeId !== undefined && !boundedString(targetNodeId, 256)) {
    throw invalidRecord("entry.targetNodeId");
  }
  const aspect = value["aspect"];
  if (typeof aspect !== "string" || !(COMPARISON_ASPECTS as readonly string[]).includes(aspect)) {
    throw invalidRecord("entry.aspect");
  }
  const propertyKey = value["propertyKey"];
  if (propertyKey !== null && propertyKey !== undefined && !boundedString(propertyKey, 256)) {
    throw invalidRecord("entry.propertyKey");
  }
  const status = value["status"];
  if (typeof status !== "string" || !(COMPARISON_STATUSES as readonly string[]).includes(status)) {
    throw invalidRecord("entry.status must be in the frozen comparison vocabulary");
  }
  const omissionCode = value["omissionCode"];
  if (
    omissionCode !== undefined &&
    (typeof omissionCode !== "string" ||
      !(COMPARISON_OMISSION_CODES as readonly string[]).includes(omissionCode))
  ) {
    throw invalidRecord("entry.omissionCode must be in the frozen omission registry");
  }
  const designValue =
    value["designValue"] === undefined
      ? undefined
      : parseStoredSnapshot(value["designValue"], "entry.designValue");
  const realityValue =
    value["realityValue"] === undefined
      ? undefined
      : parseStoredSnapshot(value["realityValue"], "entry.realityValue");
  const deviation = value["deviation"];
  if (deviation !== undefined && (typeof deviation !== "number" || !Number.isFinite(deviation))) {
    throw invalidRecord("entry.deviation must be a finite number");
  }
  const tolerance = value["tolerance"];
  if (
    tolerance !== undefined &&
    (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0)
  ) {
    throw invalidRecord("entry.tolerance must be a finite number >= 0");
  }
  const realityEvidenceIds = parseStoredEvidenceIds(
    value["realityEvidenceIds"],
    "entry.realityEvidenceIds",
  );
  const coverageEvidenceIds = parseStoredEvidenceIds(
    value["coverageEvidenceIds"],
    "entry.coverageEvidenceIds",
  );
  const designSourceRef =
    value["designSourceRef"] === undefined || value["designSourceRef"] === null
      ? null
      : storedSourceOfRecord(value["designSourceRef"], "entry.designSourceRef");
  const sourceDetail = value["sourceDetail"];
  if (sourceDetail !== undefined && !boundedString(sourceDetail, 256)) {
    throw invalidRecord("entry.sourceDetail");
  }
  const realityNode = value["realityNode"];
  let realityNodeContext: ComparisonEntry["realityNode"];
  if (realityNode !== undefined && realityNode !== null) {
    if (!isRecord(realityNode)) throw invalidRecord("entry.realityNode");
    if (!boundedString(realityNode["kind"], 64)) throw invalidRecord("entry.realityNode.kind");
    if (!boundedString(realityNode["epistemicStatus"], 64)) {
      throw invalidRecord("entry.realityNode.epistemicStatus");
    }
    realityNodeContext = {
      kind: realityNode["kind"],
      epistemicStatus: realityNode["epistemicStatus"],
    };
  }
  const geometryRefs = value["geometryRefs"];
  let geometryRefPair: GeometryRefPair | undefined;
  if (geometryRefs !== undefined && geometryRefs !== null) {
    if (!isRecord(geometryRefs)) throw invalidRecord("entry.geometryRefs");
    geometryRefPair = {
      design: storedGeometry(geometryRefs["design"], "entry.geometryRefs.design"),
      reality: storedGeometry(geometryRefs["reality"], "entry.geometryRefs.reality"),
    };
  }
  const note = value["note"];
  if (note !== undefined && (typeof note !== "string" || note.length > 2048)) {
    throw invalidRecord("entry.note");
  }
  return {
    entryId: value["entryId"] as string,
    designItemId: designItemId ?? null,
    targetNodeId: targetNodeId ?? null,
    aspect: aspect as ComparisonAspect,
    propertyKey: propertyKey ?? null,
    status: status as ComparisonStatus,
    ...(omissionCode === undefined
      ? {}
      : { omissionCode: omissionCode as ComparisonOmissionCode }),
    ...(designValue === undefined ? {} : { designValue }),
    ...(realityValue === undefined ? {} : { realityValue }),
    ...(deviation === undefined ? {} : { deviation }),
    ...(tolerance === undefined ? {} : { tolerance }),
    realityEvidenceIds,
    coverageEvidenceIds,
    designSourceRef,
    ...(sourceDetail === undefined ? {} : { sourceDetail }),
    ...(realityNodeContext === undefined ? {} : { realityNode: realityNodeContext }),
    ...(geometryRefPair === undefined ? {} : { geometryRefs: geometryRefPair }),
    ...(note === undefined ? {} : { note }),
  };
}

function parseStoredStats(value: unknown, entries: readonly ComparisonEntry[]): ComparisonStats {
  if (!isRecord(value)) throw invalidRecord("stats is not an object");
  const expected = comparisonStatsOf(entries);
  const fields: readonly [keyof ComparisonStats, number][] = [
    ["totalEntries", expected.totalEntries],
    ["matches", expected.matches],
    ["withinTolerance", expected.withinTolerance],
    ["differs", expected.differs],
    ["deviationBeyondTolerance", expected.deviationBeyondTolerance],
    ["unknown", expected.unknown],
    ["notObservedInReality", expected.notObservedInReality],
    ["occludedInReality", expected.occludedInReality],
    ["unplannedInReality", expected.unplannedInReality],
    ["discrepancies", expected.discrepancies],
  ];
  for (const [field, expectedValue] of fields) {
    const actual = value[field];
    if (typeof actual !== "number" || !Number.isInteger(actual) || actual !== expectedValue) {
      throw invalidRecord(
        `stats.${field} must be the integer ${expectedValue} — persisted statistics are ALWAYS consistent with the persisted entries`,
      );
    }
  }
  return expected;
}

function parseStoredEvent(value: unknown): ComparisonEvent {
  if (!isRecord(value)) throw invalidRecord("history entry is not an object");
  if (!boundedString(value["eventId"], 64)) throw invalidRecord("history.eventId");
  if (value["eventType"] !== "comparison_recorded") throw invalidRecord("history.eventType");
  if (!isIso(value["occurredAt"])) throw invalidRecord("history.occurredAt");
  if (!isContentId(value["recordDigest"])) {
    throw invalidRecord("history.recordDigest must be a 64-hex digest");
  }
  return {
    eventId: value["eventId"] as string,
    eventType: "comparison_recorded",
    occurredAt: value["occurredAt"] as string,
    recordDigest: value["recordDigest"] as string,
  };
}

/**
 * Structural validation of a persisted comparison record (store reads;
 * garbage on disk is a typed `invalid_comparison_record` rejection, never
 * a silent misparse). Deep semantic invariants are the write-time
 * service's duty; the stats-vs-entries and event-digest coherence checks
 * are re-verified on EVERY read (an inconsistent record is corruption).
 */
export function parseComparisonRecord(value: unknown): ComparisonRecord {
  if (!isRecord(value)) throw invalidRecord("comparison record is not a JSON object");
  const comparisonId = value["comparisonId"];
  if (!isNonEmptyString(comparisonId)) throw invalidRecord("comparisonId");
  try {
    validateComparisonId(comparisonId);
  } catch (error) {
    if (error instanceof ComparisonError) {
      throw invalidRecord(`comparisonId: ${error.detail}`);
    }
    throw error;
  }

  const realityRefValue = value["realityRef"];
  if (!isRecord(realityRefValue)) throw invalidRecord("realityRef");
  const projectId = realityRefValue["projectId"];
  if (!boundedString(projectId, 256)) throw invalidRecord("realityRef.projectId");
  const versionId = realityRefValue["versionId"];
  if (!isVersionId(versionId)) throw invalidRecord("realityRef.versionId");

  // A persisted record failing sub-validation is CORRUPTION, never a
  // boundary rejection: the sub-parser codes are rethrown as the single
  // typed persisted-record guard with the original detail preserved.
  const wrap = <T>(parse: () => T, what: string): T => {
    try {
      return parse();
    } catch (error) {
      if (error instanceof ComparisonError) {
        throw invalidRecord(`${what} is not validly persisted: ${error.code}: ${error.detail}`);
      }
      throw error;
    }
  };
  const designReference = wrap(() => parseDesignReference(value["designReference"]), "designReference");
  const tolerances = wrap(() => parseTolerances(value["tolerances"]), "tolerances");
  const coverage = wrap(() => parseCoverage(value["coverage"]), "coverage");

  const entriesValue = value["entries"];
  if (!Array.isArray(entriesValue)) throw invalidRecord("entries must be an array");
  const entries = entriesValue.map(parseStoredEntry);

  const stats = parseStoredStats(value["stats"], entries);

  const inputDigest = value["inputDigest"];
  if (!isContentId(inputDigest)) throw invalidRecord("inputDigest must be a 64-hex digest");
  if (!isIso(value["computedAt"])) throw invalidRecord("computedAt");

  const historyValue = value["history"];
  if (!Array.isArray(historyValue) || historyValue.length === 0) {
    throw invalidRecord("history must be a NON-EMPTY array (creation event is never absent)");
  }
  const history = historyValue.map(parseStoredEvent);

  const record: ComparisonRecord = {
    comparisonId,
    realityRef: { projectId, versionId },
    designReference,
    tolerances,
    coverage,
    entries,
    stats,
    inputDigest,
    computedAt: value["computedAt"] as string,
    history,
  };
  // Coherence: the LAST event's digest must pin the persisted content —
  // a rewritten or truncated history is corruption, never a silent read.
  const lastEvent = history[history.length - 1]!;
  if (lastEvent.recordDigest !== comparisonContentDigest(record)) {
    throw invalidRecord(
      "the last history event's recordDigest does not pin the persisted content — history is never rewritten",
    );
  }
  return record;
}
