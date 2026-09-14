/**
 * AISE-023 — QA/verification v2: the module MODEL.
 *
 * AUTHORITY (spec/architecture-lock.md "Authority" item 4): the Verification
 * Engine is the ONLY formal deterministic verification authority. It REPORTS
 * findings; it never mutates, repairs or "auto-corrects" anything it inspects
 * (finding, not fixing — acting on a finding is a governed human/assurance
 * decision). It never re-derives another authority's verdict either:
 * readiness outcomes are CROSS-REFERENCED from the AISE-022 assurance report
 * (the single readiness authority), never recomputed here.
 *
 * STABLE FINDING CODES — THE FROZEN REGISTRY (the CRITICAL contract of this
 * work item; the union is defined exactly once, in `FINDING_CODES`, and is
 * documented here — adding a code is a governed, versioned change):
 *
 *   Model discipline (typed units / provenance / epistemics on properties):
 *    - MISSING_UNIT (error): a numeric property without a typed unit. The
 *      AISE-016 engine rejects this at write time; the verifier re-checks
 *      migrated, hand-built or foreign-system graphs (lock item 9).
 *    - UNCERTAIN_NUMERIC_WITHOUT_SIGMA (warning): a numeric property claiming
 *      OBSERVED or CONFIRMED (a measurement) with no declared 1σ. Absent σ is
 *      UNKNOWN, never 0 (AISE-022 frozen rule). INFERRED/PROPOSED numerics
 *      are estimates/proposals — σ is optional there (estimates are not
 *      measurements, but they are also not claimed as them).
 *    - EPISTEMIC_DOWNGRADE_SUSPECT (warning): a property is CONFIRMED while
 *      its SUPPORTS/DERIVED_FROM evidence is INVALIDATED. AISE-016 refuses
 *      SILENT downgrades at write time; evidence invalidation after the fact
 *      still leaves the claim suspect. The verifier only flags it — the
 *      downgrade itself stays an explicit, provenance-carrying, auditable act.
 *    - UNPROVENANCED_PROPERTY (error): a property with no provenance records,
 *      or with a record naming no source (evidenceId, sourceArtifactId and
 *      derivationNote all absent). Lock: "Every consequential assertion
 *      carries provenance."
 *
 *   Topology:
 *    - DANGLING_RELATIONSHIP (error): a relationship endpoint that is not in
 *      the snapshot's node set. Subject = the endpoints that DO resolve.
 *    - ORPHAN_NODE (error): a node with no contains-path to a project-kind
 *      root (fail-closed: with zero project nodes every non-project node is
 *      an orphan; a project node is a root by definition; contains cycles
 *      that reach no root leave their members orphaned).
 *    - DUPLICATE_NODE_KIND_IN_SPACE (warning): ≥2 element/opening nodes
 *      directly contained by one space sharing kind AND label (label = the
 *      string value of the "label" property; absent/non-string → treated as
 *      no label). A double-modeling suspect.
 *
 *   Semantic:
 *    - SEMANTIC_KIND_MISMATCH (warning): node.kind disagrees with the node's
 *      semantic.kind property under `SEMANTIC_KIND_TO_NODE_KIND` (the
 *      documented AISE-015 → AISE-016 projection convention). "unclassified"
 *      and out-of-vocabulary values impose no constraint — an honest UNKNOWN
 *      is never treated as disagreement (lock: UNKNOWN is not absence).
 *    - OPENING_WITHOUT_HOST (error): an opening-kind node with no opens-into
 *      relationship to a wall-classified host. A host whose classification is
 *      unknown (no semantic.kind property, or "unclassified") still qualifies
 *      — UNKNOWN never implies absence.
 *
 *   Evidence (PROPERTY provenance — the work-order scope; node/relationship
 *   provenance quality is AISE-016's typed-rejection domain at write time):
 *    - INVALIDATED_EVIDENCE_LINKED (error): property provenance cites an
 *      invalidated evidence record — EXCEPT the CONFIRMED + SUPPORTS/
 *      DERIVED_FROM case, which is reported exactly once as
 *      EPISTEMIC_DOWNGRADE_SUSPECT instead (exactly-once discipline: one
 *      invalidated citation never yields two findings).
 *    - MISSING_EVIDENCE_RECORD (error): a provenance evidenceId that is not
 *      in the evidence fact set — this closes the loop AISE-016 deliberately
 *      left open (that engine only form-validates ids; existence is the
 *      verifier's cross-reference duty).
 *
 *   Readiness (cross-reference of the AISE-022 report; OPTIONAL input):
 *    - READINESS_NOT_READY (error): overall NOT_READY or INSUFFICIENT_DATA,
 *      citing the failing dimension ids (outcome ≠ satisfied). Graph-global:
 *      subjectNodeIds is empty; the message cites dimension ids — the
 *      assurance report's own vocabulary.
 *    - CRITICAL_DIMENSION_UNKNOWN (error): a critical dimension with outcome
 *      insufficient_data — unknown is never ready, INDEPENDENT of the
 *      aggregate (defense in depth: this also catches hand-built or corrupt
 *      reports whose overall level claims READY).
 *
 * SEVERITY REGISTRY: errors are deterministic violations of frozen
 * invariants; warnings are suspects needing a governed decision; "info" is
 * reserved for purely advisory observations — no current check emits info
 * (the severity union is frozen for forward compatibility).
 *
 * DETERMINISM: no clock, no randomness, no I/O; every message is built from
 * canonical (id-sorted) data, so the same input always yields byte-identical
 * findings (the runner canonicalizes input order — see runner.ts).
 */

import type { EvidenceFact, ReadinessReport } from "../assurance";
import type { NodeKind, PropertyRecord, RealityNode, Relationship } from "../reality/model";

/* ------------------------------------------------------------------ */
/* Finding model                                                        */
/* ------------------------------------------------------------------ */

export type FindingSeverity = "error" | "warning" | "info";

/**
 * The frozen finding-code registry, in documented (family) order: model →
 * topology → semantic → evidence → readiness. Frozen at RUNTIME too
 * (`Object.freeze`). The string union `FindingCode` is derived from THIS
 * array and exists nowhere else.
 */
export const FINDING_CODES = Object.freeze([
  // model discipline
  "MISSING_UNIT",
  "UNCERTAIN_NUMERIC_WITHOUT_SIGMA",
  "EPISTEMIC_DOWNGRADE_SUSPECT",
  "UNPROVENANCED_PROPERTY",
  // topology
  "DANGLING_RELATIONSHIP",
  "ORPHAN_NODE",
  "DUPLICATE_NODE_KIND_IN_SPACE",
  // semantic
  "SEMANTIC_KIND_MISMATCH",
  "OPENING_WITHOUT_HOST",
  // evidence
  "INVALIDATED_EVIDENCE_LINKED",
  "MISSING_EVIDENCE_RECORD",
  // readiness (cross-reference of the AISE-022 report)
  "READINESS_NOT_READY",
  "CRITICAL_DIMENSION_UNKNOWN",
] as const satisfies readonly string[]);

export type FindingCode = (typeof FINDING_CODES)[number];

/**
 * The documented severity table (tested verbatim). Exactly the four
 * warnings carry "warning" — everything else is "error"; no code currently
 * maps to "info" (reserved).
 */
export const SEVERITY_BY_CODE: Readonly<Record<FindingCode, FindingSeverity>> = Object.freeze({
  MISSING_UNIT: "error",
  UNCERTAIN_NUMERIC_WITHOUT_SIGMA: "warning",
  EPISTEMIC_DOWNGRADE_SUSPECT: "warning",
  UNPROVENANCED_PROPERTY: "error",
  DANGLING_RELATIONSHIP: "error",
  ORPHAN_NODE: "error",
  DUPLICATE_NODE_KIND_IN_SPACE: "warning",
  SEMANTIC_KIND_MISMATCH: "warning",
  OPENING_WITHOUT_HOST: "error",
  INVALIDATED_EVIDENCE_LINKED: "error",
  MISSING_EVIDENCE_RECORD: "error",
  READINESS_NOT_READY: "error",
  CRITICAL_DIMENSION_UNKNOWN: "error",
} satisfies Record<FindingCode, FindingSeverity>);

/** A single deterministic verification finding. Never a repair instruction. */
export interface Finding {
  /** Stable registry code (see FINDING_CODES). */
  readonly code: FindingCode;
  readonly severity: FindingSeverity;
  /** Node ids the finding is about (sorted; empty for graph-global findings). */
  readonly subjectNodeIds: readonly string[];
  /** Deterministic human-readable text carrying the measured values. */
  readonly message: string;
  /** Optional short pointer at the governed remediation path. */
  readonly remediationHint?: string;
}

/* ------------------------------------------------------------------ */
/* Input snapshot (a projection of an AISE-016 GraphVersion)            */
/* ------------------------------------------------------------------ */

/**
 * 1σ measurement uncertainty for a numeric property, in the property's own
 * unit. Projected by the CALLER from the property's shared-contracts
 * `PropertyAssertion.uncertainty` — exactly the documented AISE-016 →
 * AISE-022 fact-mapping convention (`PropertyRecord` itself deliberately
 * carries no σ; the verifier CONSUMES σ, it never estimates one). Absent =
 * UNKNOWN, never 0.
 */
export interface VerificationUncertainty {
  readonly sigma: number;
  readonly basis?: string;
}

/**
 * A `PropertyRecord` (reality model, imported read-only) extended with the
 * caller-projected σ. A plain reality `PropertyRecord` is structurally a
 * valid `VerificationProperty` (the extension is optional).
 */
export interface VerificationProperty extends PropertyRecord {
  readonly uncertainty?: VerificationUncertainty;
}

/** A reality `RealityNode` whose properties may carry projected σ. */
export interface VerificationNode extends Omit<RealityNode, "properties"> {
  readonly properties: readonly VerificationProperty[];
}

/** The graph slice under verification (nodes + typed relationships). */
export interface VerificationGraphSnapshot {
  readonly nodes: readonly VerificationNode[];
  readonly relationships: readonly Relationship[];
}

/** The ONLY input verification is computed from. */
export interface VerificationInput {
  readonly graphSnapshot: VerificationGraphSnapshot;
  /** Evidence fact set (AISE-008 projection) with invalidation flags. */
  readonly evidenceFacts: readonly EvidenceFact[];
  /** Optional AISE-022 readiness report to cross-reference. */
  readonly assuranceReport?: ReadinessReport;
}

/* ------------------------------------------------------------------ */
/* Report                                                               */
/* ------------------------------------------------------------------ */

/** Counters over the findings; `byCode` always carries every registry key. */
export interface VerificationSummary {
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
  readonly byCode: Readonly<Record<FindingCode, number>>;
}

/** Deterministic, timestamp-free verification report. */
export interface VerificationReport {
  /** Sorted by code, then subjectNodeIds, then message (stable total order). */
  readonly findings: readonly Finding[];
  readonly summary: VerificationSummary;
}

/* ------------------------------------------------------------------ */
/* Documented registries used by the semantic checks                    */
/* ------------------------------------------------------------------ */

/** Property key holding a node's human label (duplicate-detection scope). */
export const LABEL_PROPERTY_KEY = "label";

/** Property key holding the AISE-015 → AISE-016 semantic kind projection. */
export const SEMANTIC_KIND_PROPERTY_KEY = "semantic.kind";

/**
 * The documented semantic-kind → node-kind mapping (SEMANTIC_KIND_MISMATCH
 * compares against THIS table). "unclassified" and out-of-vocabulary values
 * are deliberately absent: they impose no constraint (honest UNKNOWN;
 * semantic vocabulary enforcement is AISE-015's domain, not the verifier's).
 */
export const SEMANTIC_KIND_TO_NODE_KIND: Readonly<Record<string, NodeKind>> = Object.freeze({
  wall: "element",
  floor: "element",
  ceiling: "element",
  opening: "opening",
  door: "opening",
  window: "opening",
});
