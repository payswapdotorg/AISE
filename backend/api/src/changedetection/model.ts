/**
 * AISE-033 — Historical change detection: the module MODEL.
 *
 * AUTHORITY: this package is a REPORTING library, not a modeling authority.
 * It compares two Reality-Graph version snapshots and REPORTS changes with
 * stable codes and measured values; it never mutates, repairs or re-derives
 * another authority's verdict (finding, not fixing — acting on a report is a
 * governed downstream decision). It is consumed by AISE-032 (design
 * comparison), 035 (dogfood) and 039 as a PURE LIBRARY: no router/server
 * wiring lives in this package, and it writes nothing anywhere.
 *
 * INPUT CONTRACT: the two snapshots are GraphVersion-COMPATIBLE structural
 * slices (`VersionSnapshotSlice`). A full `GraphVersion` from
 * reality/versioning satisfies the shape STRUCTURALLY (extra fields such as
 * changeLog/relationships/observations are ignored, never validated): the
 * comparator reads nodeId / kind / properties / geometry only. Geometry is
 * resolved through CALLER-SUPPLIED per-version tables
 * (`Map<geometryRef, Plane>`); per the WorldSculpt integration strategy
 * (AISE-032/033), change detection consumes STABILIZED Reality Graph
 * outputs, never raw meshes.
 *
 * IDENTITY DISCIPLINE (the CRITICAL contract of this work item):
 *  - Nodes are matched across versions by `nodeId` FIRST and ONLY — the
 *    stable identity assigned by the graph's owning authority.
 *  - A nodeId present in both versions whose `kind` CHANGED is flagged
 *    AMBIGUOUS_IDENTITY (matchKind "ambiguous"): same id, different kind —
 *    reported explicitly, never silently treated as the same object. The
 *    pair ALSO receives a KIND_CHANGED finding (the semantic change record,
 *    old → new verbatim) and its other diffs are still computed — ambiguity
 *    is flagged, nothing is suppressed.
 *  - Nodes present in only one version are ADDED / REMOVED.
 *  - THERE IS NO FUZZY MATCHING. Content-similarity matching is deliberately
 *    absent: deterministic identity only, ambiguity explicit. Two
 *    similar-content nodes with different nodeIds are one ADDED plus one
 *    REMOVED — never a match (the anti-fuzzy discrimination).
 *
 * CHANGE FINDING CODES — THE FROZEN REGISTRY (the union is defined exactly
 * once, in `CHANGE_FINDING_CODES`, documented here; adding a code is a
 * governed, versioned change):
 *
 *   Identity:
 *    - AMBIGUOUS_IDENTITY: same nodeId in both versions but different kind
 *      (fromKind/toKind verbatim). The pair is reported as matchKind
 *      "ambiguous".
 *
 *   Geometry (plane comparison via the caller's geometry tables):
 *    - GEOMETRY_MOVED: resolved plane pair whose normal deviation AND/OR
 *      offset shift exceeds the named tolerances. Carries the measured
 *      `deltaD` (signed, meters, to − from, each plane normalized by its own
 *      |n|), `angleRad` (acute dihedral, orientation-independent — the
 *      geometry module's convention), and BOTH planes verbatim.
 *    - GEOMETRY_UNRESOLVED: the comparison cannot be resolved (missing
 *      geometry on either side, non-plane geometry kind, ref absent from the
 *      table, degenerate/non-finite plane) — an HONEST UNKNOWN, never an
 *      implicit "unchanged". Reason is a closed vocabulary
 *      (`GEOMETRY_UNRESOLVED_REASONS`).
 *
 *   Semantics:
 *    - KIND_CHANGED: node kind changed (old → new recorded verbatim).
 *    - PROPERTY_ADDED / PROPERTY_REMOVED / PROPERTY_CHANGED: property-set
 *      diffs with values VERBATIM (value, unit, epistemicStatus of the
 *      affected side(s); no interpretation).
 *    - SEMANTIC_INCONSISTENCY (info-level): the node's `semantic.kind`
 *      property disagrees with the node's kind. Only values IN the node-kind
 *      vocabulary impose a constraint: "unclassified" and out-of-vocabulary
 *      values (e.g. the AISE-015 element vocabulary: wall/floor/door/…,
 *      whose projection to node kinds is owned by the verification authority,
 *      AISE-023's SEMANTIC_KIND_TO_NODE_KIND — NOT re-derived here, no
 *      second canonical mapping) are honest unknowns and never disagreement.
 *      Evaluated per side (from, then to) of every identity-matched pair.
 *
 *   Condition:
 *    - CONDITION_CHANGED: a property under the documented condition
 *      vocabulary (keys starting with "condition.", e.g. condition.cracking,
 *      condition.damp) whose VALUE changed — old → new verbatim plus the
 *      epistemic statuses of both. EXACTLY ONE finding per changed property
 *      key: a value-changed condition property yields CONDITION_CHANGED and
 *      NOT an additional PROPERTY_CHANGED. A condition property that was
 *      ADDED or REMOVED (absent on one side) yields the generic
 *      PROPERTY_ADDED / PROPERTY_REMOVED instead — absence of an assessment
 *      is not "none" (UNKNOWN is not absence), so a condition CHANGE is only
 *      asserted when both sides carry a value.
 *
 * DETERMINISM: `compareVersions` is pure — no clock, no randomness, no I/O.
 * Output ordering is canonical: matches / added / removed sorted by nodeId
 * (code-unit order), findings within a match in the fixed family order
 * AMBIGUOUS_IDENTITY → KIND_CHANGED → GEOMETRY_MOVED / GEOMETRY_UNRESOLVED
 * → SEMANTIC_INCONSISTENCY (from before to) → property findings sorted by
 * key. The same snapshots plus the same geometry tables yield byte-identical
 * reports. Input array order never leaks (duplicate nodeIds/property keys
 * within one snapshot resolve LAST-WINS, matching the versioning engine's
 * upsert-replace reading — itself documented and tested).
 *
 * VERSION-ORDER SENSITIVITY (by design): A→B and B→A are inverse reports —
 * matched node set equal, added/removed swapped, Δd sign flipped, old/new
 * values swapped. The report is directional; consumers must not treat it as
 * symmetric.
 */

import type { EpistemicStatus } from "@aise/shared-contracts";
import type { Plane } from "../geometry";

/* ------------------------------------------------------------------ */
/* Constants (frozen, named — the measured-change tolerances)           */
/* ------------------------------------------------------------------ */

/** Report generator identity (stamped verbatim into every report). */
export const CHANGE_DETECTION_ID = "aise-changedetection/1.0";

/**
 * Plane offset tolerance, in meters: |Δd| STRICTLY GREATER than this is a
 * move (equal is within tolerance). 1 cm — registration-scale resolution.
 */
export const PLANE_OFFSET_TOLERANCE_M = 0.01;

/**
 * Plane normal angular tolerance, in radians: dihedral deviation STRICTLY
 * GREATER than this is a move (equal is within tolerance). ~0.57°.
 */
export const PLANE_ANGLE_TOLERANCE_RAD = 0.01;

/** The semantic classification property key (AISE-015 → 016 convention). */
export const SEMANTIC_KIND_PROPERTY_KEY = "semantic.kind";

/**
 * The documented condition vocabulary PREFIX: property keys starting with
 * "condition." (condition.cracking, condition.damp, …) carry condition
 * observations. Note the trailing dot: "conditions.note" is NOT a condition
 * property under this vocabulary.
 */
export const CONDITION_PROPERTY_PREFIX = "condition.";

/* ------------------------------------------------------------------ */
/* Snapshot input model (structural slices of a GraphVersion)           */
/* ------------------------------------------------------------------ */

/** Property assertion as seen by the comparator (PropertyRecord-compatible). */
export interface SnapshotProperty {
  readonly key: string;
  readonly value: string | number | boolean;
  /** Typed unit (required for numerics upstream; carried verbatim here). */
  readonly unit?: string;
  readonly epistemicStatus: EpistemicStatus;
}

/** Geometry reference as seen by the comparator (GeometryRef-compatible). */
export interface SnapshotGeometryRef {
  readonly kind: string;
  readonly ref: string;
}

/** Node as seen by the comparator (RealityNode-compatible structural slice). */
export interface SnapshotNode {
  readonly nodeId: string;
  readonly kind: string;
  readonly properties: readonly SnapshotProperty[];
  readonly geometry?: SnapshotGeometryRef;
}

/**
 * Version snapshot as seen by the comparator (GraphVersion-compatible
 * structural slice — a full GraphVersion is assignable to this type).
 */
export interface VersionSnapshotSlice {
  readonly versionId: string;
  readonly nodes: readonly SnapshotNode[];
}

/** Caller-supplied per-version geometry resolution table: ref → Plane. */
export type GeometryTable = ReadonlyMap<string, Plane>;

/* ------------------------------------------------------------------ */
/* Finding model                                                        */
/* ------------------------------------------------------------------ */

/**
 * The frozen finding-code registry, in documented (family) order: identity →
 * geometry → semantics → condition. Frozen at RUNTIME (`Object.freeze`); the
 * string union `ChangeFindingCode` is derived from THIS array and exists
 * nowhere else.
 */
export const CHANGE_FINDING_CODES = Object.freeze([
  // identity
  "AMBIGUOUS_IDENTITY",
  // geometry
  "GEOMETRY_MOVED",
  "GEOMETRY_UNRESOLVED",
  // semantics
  "KIND_CHANGED",
  "PROPERTY_ADDED",
  "PROPERTY_REMOVED",
  "PROPERTY_CHANGED",
  "SEMANTIC_INCONSISTENCY",
  // condition
  "CONDITION_CHANGED",
] as const);

export type ChangeFindingCode = (typeof CHANGE_FINDING_CODES)[number];

/**
 * The frozen closed vocabulary of GEOMETRY_UNRESOLVED reasons (checked in
 * this priority order by the comparator: missing → kind → ref resolution →
 * degeneracy → finiteness, from-side before to-side within each class).
 */
export const GEOMETRY_UNRESOLVED_REASONS = Object.freeze([
  "missing-geometry-on-from-version",
  "missing-geometry-on-to-version",
  "non-plane-geometry-kind",
  "unresolved-from-ref",
  "unresolved-to-ref",
  "degenerate-plane-normal",
  "non-finite-plane",
] as const);

export type GeometryUnresolvedReason = (typeof GEOMETRY_UNRESOLVED_REASONS)[number];

/** Same nodeId, different kind — the identity-discipline flag. */
export interface AmbiguousIdentityFinding {
  readonly code: "AMBIGUOUS_IDENTITY";
  readonly fromKind: string;
  readonly toKind: string;
}

/** Node kind change, old → new recorded verbatim. */
export interface KindChangedFinding {
  readonly code: "KIND_CHANGED";
  readonly fromKind: string;
  readonly toKind: string;
}

/** Resolved plane pair that moved beyond the named tolerances. */
export interface GeometryMovedFinding {
  readonly code: "GEOMETRY_MOVED";
  /** Signed offset difference (meters): d/|n| of to − d/|n| of from. */
  readonly deltaD: number;
  /** Acute dihedral angle between the two plane normals (radians). */
  readonly angleRad: number;
  /** The from-version geometry reference, verbatim. */
  readonly fromRef: SnapshotGeometryRef;
  /** The to-version geometry reference, verbatim. */
  readonly toRef: SnapshotGeometryRef;
  /** The from-version plane EXACTLY as supplied by the caller's table. */
  readonly fromPlane: Plane;
  /** The to-version plane EXACTLY as supplied by the caller's table. */
  readonly toPlane: Plane;
}

/** Geometry comparison that cannot be resolved — an honest unknown. */
export interface GeometryUnresolvedFinding {
  readonly code: "GEOMETRY_UNRESOLVED";
  readonly reason: GeometryUnresolvedReason;
  /** Present-side geometry references, verbatim (absent side carries none). */
  readonly fromRef?: SnapshotGeometryRef;
  readonly toRef?: SnapshotGeometryRef;
}

/** Property present only in the to-version (value verbatim). */
export interface PropertyAddedFinding {
  readonly code: "PROPERTY_ADDED";
  readonly key: string;
  readonly toValue: string | number | boolean;
  readonly toUnit?: string;
  readonly toEpistemicStatus: EpistemicStatus;
}

/** Property present only in the from-version (value verbatim). */
export interface PropertyRemovedFinding {
  readonly code: "PROPERTY_REMOVED";
  readonly key: string;
  readonly fromValue: string | number | boolean;
  readonly fromUnit?: string;
  readonly fromEpistemicStatus: EpistemicStatus;
}

/** Property record that changed (value, unit and/or epistemic status). */
export interface PropertyChangedFinding {
  readonly code: "PROPERTY_CHANGED";
  readonly key: string;
  readonly fromValue: string | number | boolean;
  readonly fromUnit?: string;
  readonly fromEpistemicStatus: EpistemicStatus;
  readonly toValue: string | number | boolean;
  readonly toUnit?: string;
  readonly toEpistemicStatus: EpistemicStatus;
}

/** Condition-vocabulary property whose VALUE changed (both sides verbatim). */
export interface ConditionChangedFinding {
  readonly code: "CONDITION_CHANGED";
  readonly key: string;
  readonly fromValue: string | number | boolean;
  readonly fromUnit?: string;
  readonly fromEpistemicStatus: EpistemicStatus;
  readonly toValue: string | number | boolean;
  readonly toUnit?: string;
  readonly toEpistemicStatus: EpistemicStatus;
}

/** `semantic.kind` (node-kind-vocabulary value) disagreeing with node kind. */
export interface SemanticInconsistencyFinding {
  readonly code: "SEMANTIC_INCONSISTENCY";
  /** Which version's node carries the disagreement. */
  readonly side: "from" | "to";
  readonly nodeKind: string;
  readonly semanticKind: string;
}

export type ChangeFinding =
  | AmbiguousIdentityFinding
  | KindChangedFinding
  | GeometryMovedFinding
  | GeometryUnresolvedFinding
  | PropertyAddedFinding
  | PropertyRemovedFinding
  | PropertyChangedFinding
  | ConditionChangedFinding
  | SemanticInconsistencyFinding;

/* ------------------------------------------------------------------ */
/* Report model                                                         */
/* ------------------------------------------------------------------ */

export type MatchKind = "matched" | "ambiguous";

/** One nodeId pair present in both versions (matched or ambiguous). */
export interface NodeMatch {
  readonly nodeId: string;
  readonly matchKind: MatchKind;
  readonly changes: readonly ChangeFinding[];
}

/** An added or removed node (identity is the story; kind recorded verbatim). */
export interface NodeSide {
  readonly nodeId: string;
  readonly kind: string;
}

/**
 * Report statistics — ALWAYS consistent with the findings above:
 *  - matched / ambiguous: counts of NodeMatch by matchKind (their sum is
 *    matches.length);
 *  - added / removed: array lengths;
 *  - geometryMoved: count of GEOMETRY_MOVED findings;
 *  - conditionChanged: count of CONDITION_CHANGED findings;
 *  - propertyChanged: count of PROPERTY_ADDED + PROPERTY_REMOVED +
 *    PROPERTY_CHANGED findings (the property-set family; CONDITION_CHANGED
 *    is counted separately — every property-key diff yields EXACTLY ONE
 *    finding from the four, so the two counters never overlap).
 */
export interface ChangeStats {
  readonly matched: number;
  readonly ambiguous: number;
  readonly added: number;
  readonly removed: number;
  readonly geometryMoved: number;
  readonly conditionChanged: number;
  readonly propertyChanged: number;
}

/** The directional change report between two version snapshots. */
export interface ChangeReport {
  readonly fromVersionId: string;
  readonly toVersionId: string;
  readonly generatedBy: typeof CHANGE_DETECTION_ID;
  readonly matches: readonly NodeMatch[];
  readonly added: readonly NodeSide[];
  readonly removed: readonly NodeSide[];
  readonly stats: ChangeStats;
}
