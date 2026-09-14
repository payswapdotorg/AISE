/**
 * AISE-015 — architectural semantic object model.
 *
 * EPISTEMIC DISCIPLINE (read this first — architecture-lock "Truth and
 * uncertainty"): every object produced by this module is an INTERPRETATION of
 * reconstructed geometry, never an observation of reality. Extracted
 * semantics therefore carry `epistemicStatus: "INFERRED"` (or `"PROPOSED"`
 * for downstream proposers such as intervention planning) and can NEVER be
 * OBSERVED/CONFIRMED — confirmation requires human observation records that
 * live outside this module (AISE-016/022 territory). The type system enforces
 * the subset relation: `SemanticEpistemicStatus` is structurally `Extract`-ed
 * from the shared-contracts `EpistemicStatus`, so an extracted element cannot
 * even type-check as observed/confirmed.
 *
 * Vocabulary alignment: `SemanticElementKind` values are the lower-case
 * single-word names of the open `RealityObject.kind` vocabulary
 * (@aise/shared-contracts model.ts); `SemanticProperty` mirrors the value
 * domain of `PropertyAssertion` (string | number | boolean) with status
 * pinned to INFERRED. AISE-016 projects these into canonical model objects.
 *
 * UNCERTAINTY discipline (inherited from the AISE-013 geometry library):
 * dimensions carry a physical 1σ or `null` (= unknown), never a fabricated 0
 * and never a "confidence". Classification emits FACTS (basis + measured
 * normal component), not scores — there is no readiness/confidence concept
 * anywhere in this module.
 *
 * All thresholds below are NAMED CONSTANTS with documented units and strict
 * comparison semantics (boundary values are honestly UNCLASSIFIED, never
 * tie-broken by guessing).
 */

import type { EpistemicStatus } from "@aise/shared-contracts";
import type { Plane, Vec3 } from "../geometry";

/** Extractor version stamped on every provenance record (determinism pin). */
export const EXTRACTOR_VERSION = "aise-semantics/1.0";

/** Architectural element kinds (subset of the RealityObject.kind vocabulary). */
export const SEMANTIC_ELEMENT_KINDS = [
  "wall",
  "floor",
  "ceiling",
  "opening",
  "door",
  "window",
] as const;
export type SemanticElementKind = (typeof SEMANTIC_ELEMENT_KINDS)[number];

/**
 * Epistemic status of extracted semantics — a structural subset of the
 * shared-contracts `EpistemicStatus`: interpretations are INFERRED, planned
 * interventions are PROPOSED, and neither is ever OBSERVED/CONFIRMED here.
 */
export type SemanticEpistemicStatus = Extract<EpistemicStatus, "INFERRED" | "PROPOSED">;

/* ------------------------------------------------------------------ */
/* Classification thresholds (documented; STRICT comparisons)          */
/* ------------------------------------------------------------------ */

/**
 * A plane is a WALL candidate only when |normal.z| of its UNIT normal is
 * STRICTLY below this value (near-horizontal normal ⇔ near-vertical plane).
 * At exactly this value the plane is honestly UNCLASSIFIED.
 */
export const WALL_MAX_VERTICALITY = 0.1;

/**
 * A plane is a FLOOR only when its unit normal's z is STRICTLY above this
 * value (normal points up). At exactly this value: UNCLASSIFIED.
 */
export const FLOOR_MIN_Z = 0.9;

/**
 * An opening is classified DOOR when `reachesFloor === true` OR its sill
 * height is STRICTLY below this value (metres). At exactly this value the
 * door band is missed (documented boundary) and the window band decides.
 */
export const DOOR_SILL_MAX_M = 0.3;

/** Lower bound (INCLUSIVE) of the window sill-height band, in metres. */
export const WINDOW_SILL_MIN_M = 0.8;

/** Upper bound (INCLUSIVE) of the window sill-height band, in metres. */
export const WINDOW_SILL_MAX_M = 1.2;

/**
 * Consistency tolerance: an observed opening's centroid must be within this
 * distance (metres) of SOME wall element's plane, otherwise the
 * OPENING_UNANCHORED finding fires. At exactly this distance the opening is
 * considered anchored (strict `>` comparison).
 */
export const OPENING_ANCHOR_TOLERANCE_M = 0.15;

/**
 * Duplicate detection: two same-kind plane elements are duplicates when
 * |unitNormalA · unitNormalB| is at least this value AND their unit-normal
 * offsets differ by less than DUPLICATE_OFFSET_TOLERANCE_M. The absolute
 * value makes the check orientation-independent (an anti-parallel
 * re-detection of the same face is still a duplicate).
 */
export const DUPLICATE_NORMAL_DOT_MIN = 1 - 1e-6;

/** Duplicate detection: unit-normal plane-offset difference below this (m). */
export const DUPLICATE_OFFSET_TOLERANCE_M = 0.01;

/* ------------------------------------------------------------------ */
/* Semantic objects                                                    */
/* ------------------------------------------------------------------ */

/** A plane attached to an element: geometry-library Plane + fit quality. */
export interface ElementPlane extends Plane {
  /** RMS residual of the plane fit (points-to-plane), as reported upstream. */
  readonly rmsResidual: number;
}

/** A derived dimension: value + physical 1σ (null = unknown, never 0-faked). */
export interface ElementDimension {
  readonly value: number;
  readonly uncertainty: number | null;
}

/** Geometry carried by a semantic element (all fields optional/honest). */
export interface ElementGeometry {
  /** Plane normalized to a UNIT normal (library convention), when known. */
  readonly plane?: ElementPlane;
  /** Observed boundary polygon (openings), verbatim vertex order. */
  readonly boundaryPolygon?: readonly Vec3[];
  /** e.g. floor-to-ceiling separation when a parallel counterpart exists. */
  readonly height?: ElementDimension;
  /** e.g. separation to the nearest parallel wall, when one exists. */
  readonly width?: ElementDimension;
}

/**
 * An extracted property. Status is pinned to INFERRED — CONFIRMED requires
 * human observation records that this module never fabricates.
 */
export interface SemanticProperty {
  readonly key: string;
  readonly value: string | number | boolean;
  readonly epistemicStatus: "INFERRED";
  readonly note?: string;
}

/** Provenance of an extracted element: exactly the consumed source artifacts. */
export interface SemanticProvenance {
  readonly sourceArtifactIds: readonly string[];
  readonly extractorVersion: string;
}

/**
 * A structured architectural semantic object. LOUD NOTE: `epistemicStatus`
 * is INFERRED for everything this module extracts — these are interpretations
 * of reconstructed geometry, not observations of the building.
 */
export interface SemanticElement {
  readonly elementId: string;
  readonly kind: SemanticElementKind;
  readonly geometry: ElementGeometry;
  readonly epistemicStatus: SemanticEpistemicStatus;
  readonly provenance: SemanticProvenance;
  readonly properties: readonly SemanticProperty[];
}

/* ------------------------------------------------------------------ */
/* Extraction input (callers build this from reconstruction artifacts) */
/* ------------------------------------------------------------------ */

/**
 * A plane observed in a reconstruction artifact. `plane` follows the geometry
 * library convention (unit normal preferred; non-unit input is normalized by
 * the extractor — scaling (n, d) by a common factor is the same plane).
 */
export interface ObservedPlane {
  readonly plane: Plane;
  /** RMS residual of the plane fit, as reported by the producer. */
  readonly rmsResidual: number;
  /** Number of points that produced the fit (a recorded fact, not used to
   *  fabricate σ — see the module header of extract.ts). */
  readonly pointCount: number;
  /** Optional observation timestamp, passed through as a fact. */
  readonly observedAt?: string;
  /** Id of the reconstruction artifact this plane came from. */
  readonly sourceArtifactId: string;
  /**
   * Optional explicit 1σ of the plane OFFSET (metres). Omitted or null =
   * unknown — dimension uncertainties then stay null (never guessed). This
   * is the caller's way to let extracted dimensions carry real uncertainty.
   */
  readonly offsetSigma?: number | null;
}

/**
 * Door/window supporting facts. Without facts (or with facts outside both
 * bands) an opening honestly stays kind "opening" — never guessed.
 */
export interface OpeningFacts {
  /** Sill height above the floor, in metres (if measured/observed). */
  readonly sillHeight?: number;
  /** Whether the opening reaches the floor. */
  readonly reachesFloor?: boolean;
}

/** An opening observed in a reconstruction artifact (bounding polygon). */
export interface ObservedOpening {
  readonly boundingPolygon: readonly Vec3[];
  readonly sourceArtifactId: string;
  readonly facts?: OpeningFacts;
}

/**
 * The extractor input: observed planes and openings. AISE-016 builds this
 * from reconstruction CandidateArtifacts; this module never reads stores.
 */
export interface GeometryObservationInput {
  readonly planes: readonly ObservedPlane[];
  readonly openings?: readonly ObservedOpening[];
}

/* ------------------------------------------------------------------ */
/* Extraction result                                                   */
/* ------------------------------------------------------------------ */

/** An honest unknown: something the extractor refused to guess. */
export interface UnclassifiedEntry {
  /** Human-readable, deterministic description of the observation. */
  readonly description: string;
  /** Why no semantic kind was assigned (names thresholds and values). */
  readonly reason: string;
}

export interface SemanticsStats {
  readonly walls: number;
  readonly floors: number;
  readonly ceilings: number;
  /** Elements still at the coarse "opening" kind (door/window unknown). */
  readonly openings: number;
  readonly doors: number;
  readonly windows: number;
  /** Unclassified ENTRIES: planes with no band + openings stuck at "opening". */
  readonly unclassified: number;
}

export interface SemanticsResult {
  readonly elements: readonly SemanticElement[];
  readonly unclassified: readonly UnclassifiedEntry[];
  readonly stats: SemanticsStats;
}

/* ------------------------------------------------------------------ */
/* Consistency findings (finding, not fixing — no auto-repair here)    */
/* ------------------------------------------------------------------ */

export const SEMANTIC_FINDING_CODES = [
  "OPENING_UNANCHORED",
  "DUPLICATE_ELEMENT",
  "WALL_NORMAL_NOT_HORIZONTAL",
  "FLOOR_NORMAL_NOT_UPWARD",
  "CEILING_NORMAL_NOT_DOWNWARD",
] as const;
export type SemanticFindingCode = (typeof SEMANTIC_FINDING_CODES)[number];

/**
 * A consistency finding: stable code + the measured value that triggered it
 * (null when the quantity is undefined, e.g. no wall to measure against).
 * Findings never mutate or delete elements — reporting is this module's
 * whole authority; repair is a governed human/assurance decision.
 */
export interface SemanticFinding {
  readonly code: SemanticFindingCode;
  /** Element the finding is about (null for raw-observation findings). */
  readonly elementId: string | null;
  /** Other elements implicated (e.g. the duplicate pair partner). */
  readonly relatedElementIds?: readonly string[];
  readonly measuredValue: number | null;
  readonly detail: string;
}

export interface ConsistencyReport {
  readonly findings: readonly SemanticFinding[];
}
