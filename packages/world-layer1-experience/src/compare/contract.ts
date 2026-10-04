/**
 * `@aise/world-layer1-experience` — the COMPARE + MEASURE family
 * contract (WORLD-P1, `src/compare/`).
 *
 * MODEL-VS-CAPTURE COMPARISON as typed contracts: aligned pairs,
 * difference classifications and tolerance-DECLARED comparison
 * verdicts DELEGATING to the P0-B exact-geometry vocabulary
 * (`GeometryShapeDeclaration` / `GeometryToleranceDeclaration` /
 * `GeometryUnitDeclaration` / `GEOMETRY_QUANTITY_KINDS` imported
 * VERBATIM — this lane never redefines geometry vocabulary).
 *
 * IN-WORLD MEASUREMENT as typed contracts: point / line / area /
 * volume queries over DECLARED world states with DECLARED tolerances
 * and units — a measurement without a tolerance declaration is
 * refused (the substitution-contract law 2, the P0-B
 * `tolerance-must-be-declared` discipline), and every measurement
 * carries its evidence binding (an INFERRED candidate, never a bare
 * number).
 *
 * THE "WHAT CHANGED?" VOCABULARY lives here too: the difference
 * classifications are the same closed vocabulary the EVIDENCE family's
 * `what changed?` query consumes — one vocabulary, one authority (this
 * file), consumed by both.
 */

import type {
  GeometryQuantityKind,
  GeometryShapeDeclaration,
  GeometryToleranceDeclaration,
  GeometryUnitDeclaration,
} from "@aise/world-understanding-substrate";
import type { SceneElementId } from "@aise/world-reality-substrate";

/* ------------------------------------------------------------------ */
/* Comparable geometry (DELEGATED to the P0-B vocabulary)               */
/* ------------------------------------------------------------------ */

/**
 * The comparable geometry of one world element: the P0-B
 * `GeometryShapeDeclaration` VERBATIM (point / segment / polygon /
 * box, with optional `occt-topology` namespaced labels). This lane
 * DELEGATES to that vocabulary — it never redefines shape kinds.
 */
export type ComparableShape = GeometryShapeDeclaration;

/** Re-export the tolerance/unit declarations verbatim (the law carriers). */
export type { GeometryToleranceDeclaration, GeometryUnitDeclaration };

/* ------------------------------------------------------------------ */
/* COMPARE — difference classifications (the closed "what changed?" set) */
/* ------------------------------------------------------------------ */

/**
 * The closed difference-classification vocabulary — what a
 * model-vs-capture comparison (or a world-vs-world difference) can
 * honestly say about one element. `unverifiable` exists because a
 * claim without declared geometry on either side is NOT a deviation
 * and NOT a match — it is honestly unverifiable (never fabricated).
 */
export const DIFFERENCE_CLASSIFICATIONS = [
  "missing-in-capture",
  "missing-in-model",
  "deviation-detected",
  "within-tolerance",
  "unverifiable",
] as const;
export type DifferenceClassification = (typeof DIFFERENCE_CLASSIFICATIONS)[number];

export function isDifferenceClassification(
  value: unknown,
): value is DifferenceClassification {
  return (
    typeof value === "string" &&
    (DIFFERENCE_CLASSIFICATIONS as readonly string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* COMPARE — aligned pairs + verdicts                                    */
/* ------------------------------------------------------------------ */

/**
 * One DECLARED alignment pair: which model element is compared with
 * which capture element, and the declared shape of each side (the
 * comparable geometry). Alignment is DECLARED (the app/author declares
 * the pairing — at P1 the lane never invents correspondences; an
 * automatic alignment engine is a future port occupant whose output
 * would still enter through this type, as declared data).
 */
export interface AlignedPair {
  readonly modelElementId: SceneElementId;
  readonly captureElementId: SceneElementId;
  /** The declared comparable shape of the model side. */
  readonly modelShape: ComparableShape;
  /** The declared comparable shape of the capture side. */
  readonly captureShape: ComparableShape;
}

/**
 * One comparison verdict: the classification, the deviation VALUE with
 * its quantity/unit, and the DECLARED tolerance carried VERBATIM (the
 * consumer decides with the tolerance — it is never folded into the
 * value). Near the declared boundary the verdict is
 * `within-tolerance-band` — never a silent boolean (the P0-B
 * near-boundary discipline delegated to).
 */
export interface ComparisonVerdict {
  readonly modelElementId: SceneElementId;
  readonly captureElementId: SceneElementId;
  readonly classification: DifferenceClassification;
  /** The computed deviation (metres, distance between shape proxies). */
  readonly deviationMetres: number;
  /** The declared tolerance, carried VERBATIM from the request. */
  readonly appliedTolerance: GeometryToleranceDeclaration;
  /** True when the deviation sits INSIDE the declared linear tolerance band. */
  readonly withinTolerance: boolean;
  /**
   * True when the deviation sits within the DECLARED near-boundary
   * band of the tolerance boundary (|deviation − tolerance.linear| ≤
   * nearBoundaryBand) — the honesty flag that the verdict is close to
   * the flip; the consumer decides with it, never the lane.
   */
  readonly nearBoundary: boolean;
}

/** The COMPARE request: the pairs, the declared tolerance, the declared
 * near-boundary band, the units.
 */
export interface ComparisonRequest {
  /** The world revision the comparison runs against (declared binding). */
  readonly worldRevision: number;
  readonly pairs: readonly AlignedPair[];
  /** Model elements with NO aligned capture element (classified missing-in-capture). */
  readonly unpairedModelElementIds: readonly SceneElementId[];
  /** Capture elements with NO aligned model element (classified missing-in-model). */
  readonly unpairedCaptureElementIds: readonly SceneElementId[];
  /** REQUIRED — a comparison without a declared tolerance is refused. */
  readonly tolerance: GeometryToleranceDeclaration;
  /**
   * REQUIRED — the DECLARED near-boundary band (metres, positive
   * finite): a deviation within this band of the tolerance BOUNDARY
   * itself (|deviation − tolerance.linear| ≤ nearBoundaryBand) flags
   * `nearBoundary: true`. Declared, never implicit (the law): the
   * consumer states how close to the flip a deviation must sit before
   * the verdict is called near-boundary — the lane never picks the
   * band for them.
   */
  readonly nearBoundaryBand: number;
  /** REQUIRED — the units the deviation value is expressed in. */
  readonly units: GeometryUnitDeclaration;
  readonly declaredAt: string;
}

/** The comparison report: every verdict, the unpaired classifications, the digest. */
export interface ComparisonReport {
  /** Content-derived digest over the canonical report body. */
  readonly reportId: string;
  readonly worldRevision: number;
  readonly verdicts: readonly ComparisonVerdict[];
  readonly unpairedModelElementIds: readonly SceneElementId[];
  readonly unpairedCaptureElementIds: readonly SceneElementId[];
  readonly appliedTolerance: GeometryToleranceDeclaration;
  readonly units: GeometryUnitDeclaration;
  /** The per-classification counts (the machine-readable summary). */
  readonly classificationCounts: readonly {
    readonly classification: DifferenceClassification;
    readonly count: number;
  }[];
}

/* ------------------------------------------------------------------ */
/* MEASURE — the query vocabulary                                        */
/* ------------------------------------------------------------------ */

/**
 * The closed measurement-query-kind vocabulary (the directive's
 * point/line/area/volume queries):
 *
 *  - `point`            — the world position of one element (its
 *                         declared translation) — quantity `distance`
 *                         is NOT used; the position is a coordinate
 *                         record with the declared units;
 *  - `line`             — the point-to-point distance between two
 *                         elements' declared positions (quantity
 *                         `distance`) or one segment's length
 *                         (quantity `length`);
 *  - `area`             — the planar area of one declared polygon
 *                         (quantity `area`);
 *  - `volume`           — the volume of one declared box (quantity
 *                         `volume`);
 *  - `point-in-region`  — the containment predicate of a declared
 *                         point in a declared polygon (the P0-B
 *                         near-boundary verdict: boolean |
 *                         "within-tolerance").
 */
export const MEASUREMENT_QUERY_KINDS = [
  "point",
  "line",
  "area",
  "volume",
  "point-in-region",
] as const;
export type MeasurementQueryKind = (typeof MEASUREMENT_QUERY_KINDS)[number];

export function isMeasurementQueryKind(value: unknown): value is MeasurementQueryKind {
  return (
    typeof value === "string" &&
    (MEASUREMENT_QUERY_KINDS as readonly string[]).includes(value)
  );
}

/** The measurement quantity vocabulary — DELEGATED to P0-B verbatim. */
export type MeasurementQuantity = GeometryQuantityKind;

/**
 * One measurement query over a DECLARED world state. The operands are
 * AISE element ids (the queried world's elements) plus the declared
 * shapes they carry; the tolerance and units are REQUIRED (a query
 * without them is refused — tolerances are declared, never implicit).
 */
export type MeasurementQuery =
  | {
      readonly queryId: string;
      readonly kind: "point";
      readonly elementId: SceneElementId;
      readonly tolerance: GeometryToleranceDeclaration;
      readonly units: GeometryUnitDeclaration;
    }
  | {
      readonly queryId: string;
      readonly kind: "line";
      readonly fromElementId: SceneElementId;
      readonly toElementId: SceneElementId;
      readonly tolerance: GeometryToleranceDeclaration;
      readonly units: GeometryUnitDeclaration;
    }
  | {
      readonly queryId: string;
      readonly kind: "area";
      readonly elementId: SceneElementId;
      readonly declaredPolygon: ComparableShape;
      readonly tolerance: GeometryToleranceDeclaration;
      readonly units: GeometryUnitDeclaration;
    }
  | {
      readonly queryId: string;
      readonly kind: "volume";
      readonly elementId: SceneElementId;
      readonly declaredBox: ComparableShape;
      readonly tolerance: GeometryToleranceDeclaration;
      readonly units: GeometryUnitDeclaration;
    }
  | {
      readonly queryId: string;
      readonly kind: "point-in-region";
      readonly pointElementId: SceneElementId;
      readonly regionElementId: SceneElementId;
      readonly declaredPoint: ComparableShape;
      readonly declaredRegionPolygon: ComparableShape;
      readonly tolerance: GeometryToleranceDeclaration;
      readonly units: GeometryUnitDeclaration;
    };

/**
 * One measurement result: the value with its quantity and unit, the
 * DECLARED tolerance carried VERBATIM, the near-boundary flag, and the
 * EVIDENCE BINDING — the measurement is an INFERRED candidate bound to
 * the measured elements' evidence content ids (never a bare number,
 * never an authoritative measurement).
 */
export interface MeasurementResult {
  readonly queryId: string;
  readonly kind: MeasurementQueryKind;
  readonly quantity: MeasurementQuantity | null;
  readonly value: number | null;
  readonly unit: string | null;
  /** The measured position (point queries) in the declared units. */
  readonly position: readonly [number, number, number] | null;
  /** The containment verdict (point-in-region queries) — P0-B discipline. */
  readonly containmentVerdict: boolean | "within-tolerance" | null;
  readonly appliedTolerance: GeometryToleranceDeclaration;
  readonly units: GeometryUnitDeclaration;
  readonly nearBoundary: boolean;
  /** The evidence binding — the INFERRED candidate's provenance chain. */
  readonly evidenceContentIds: readonly string[];
  readonly epistemicStatus: "INFERRED";
  readonly method: "world.measurement";
}

/* ------------------------------------------------------------------ */
/* The controlled family port                                           */
/* ------------------------------------------------------------------ */

/** The compare/measure family port: the controlled entry point surface. */
export interface CompareLanePort {
  readonly portId: "layer1.compare/1";

  /** COMPARE: the tolerance-declared model-vs-capture comparison. */
  compare(request: ComparisonRequest): import("../failures").LaneOutcome<ComparisonReport>;

  /** MEASURE: run measurement queries over a declared world state. */
  measure(
    world: import("../world/contract").NavigableWorld,
    queries: readonly MeasurementQuery[],
  ): import("../failures").LaneOutcome<readonly MeasurementResult[]>;
}

/** The compare/measure port names used in typed refusals. */
export const COMPARE_PORTS = {
  compare: "layer1.compare.compare",
  measure: "layer1.compare.measure",
} as const;
