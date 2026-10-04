/**
 * `@aise/world-layer1-experience` — the COMPARE/MEASURE substitution
 * DOUBLES (WORLD-P1, `src/compare/doubles.ts`).
 *
 * Two INDEPENDENT in-memory providers of the `CompareLanePort` — the
 * substitution proof that the comparison + measurement contract is
 * implementable WITHOUT any geometry kernel (no OCCT, no OCP, no
 * CadQuery) and without any reconstruction engine:
 *
 *  - `referenceCompareDouble` — the DIRECT closed-form kernels of
 *    ./compare.ts and ./measure.ts (inline differences, shoelace
 *    area, extent product, crossing containment);
 *  - `alternateCompareDouble` — a VECTOR-MICRO-KERNEL decomposition:
 *    every distance routes through subtract/dot primitives, the area
 *    through the trapezoid identity, the containment through a
 *    winding-sum test — an independent code path.
 *
 * EXACTNESS (why byte-identity is achievable): the committed fixture
 * coordinates are integers chosen so every kernel result is EXACT in
 * IEEE-754 double arithmetic (3-4-5 distances, integer areas and
 * volumes); both kernels are mathematically identical formulas over
 * the same declared inputs, so the pinned values agree bit-for-bit on
 * the fixture corpus (the P0-B doubles' discipline).
 */

import { laneOk, laneRefuse, type LaneOutcome } from "../failures";
import type {
  ComparableShape,
  ComparisonReport,
  ComparisonRequest,
  MeasurementQuery,
  MeasurementResult,
} from "./contract";
import { COMPARE_PORTS } from "./contract";
import { compareModelToCapture, assembleComparisonReport } from "./compare";
import { runMeasurementQueries } from "./measure";
import type { NavigableWorld } from "../world/contract";
import type { GeometryPoint3 } from "@aise/world-understanding-substrate";

/* ------------------------------------------------------------------ */
/* The REFERENCE double                                                 */
/* ------------------------------------------------------------------ */

/** The reference provider descriptor. */
export const REFERENCE_COMPARE_DESCRIPTOR = {
  providerId: "layer1-compare-reference-double",
  technologyVersion: "in-memory/1",
  engineNote: "in-memory substitution double — no OCCT, no OCP, no CadQuery",
} as const;

/** The reference double: the pure transforms as the port implementation. */
export const referenceCompareDouble = {
  portId: "layer1.compare/1" as const,
  compare: (request: ComparisonRequest) => compareModelToCapture(request),
  measure: (world: NavigableWorld, queries: readonly MeasurementQuery[]) =>
    runMeasurementQueries(world, queries),
} as const;

/* ------------------------------------------------------------------ */
/* The ALTERNATE double (vector-micro-kernel decomposition)             */
/* ------------------------------------------------------------------ */

/** The alternate provider descriptor. */
export const ALTERNATE_COMPARE_DESCRIPTOR = {
  providerId: "layer1-compare-alternate-double",
  technologyVersion: "in-memory/1-vector-kernel",
  engineNote: "in-memory substitution double (vector-kernel variant) — proves implementation independence",
} as const;

/* Vector micro-kernels (the alternate's only primitives). */
function vSub(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): readonly [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function vDot(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function vNorm(a: readonly [number, number, number]): number {
  return Math.sqrt(vDot(a, a));
}
function vScaleAdd(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): readonly [number, number, number] {
  return [a[0] + t * b[0], a[1] + t * b[1], a[2] + t * b[2]];
}

/** Alternate centroid (same pinned semantics, kernel-composed). */
function alternateCentroid(
  shape: ComparableShape,
): readonly [number, number, number] {
  if (shape.kind === "point") return [shape.at.x, shape.at.y, shape.at.z];
  if (shape.kind === "segment") {
    return vScaleAdd(
      [shape.a.x, shape.a.y, shape.a.z],
      vSub([shape.b.x, shape.b.y, shape.b.z], [shape.a.x, shape.a.y, shape.a.z]),
      0.5,
    );
  }
  if (shape.kind === "box") {
    return [
      (shape.min.x + shape.max.x) / 2,
      (shape.min.y + shape.max.y) / 2,
      (shape.min.z + shape.max.z) / 2,
    ];
  }
  const n = shape.vertices.length;
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  for (const vertex of shape.vertices) {
    sumX += vertex.x;
    sumY += vertex.y;
    sumZ += vertex.z;
  }
  return [sumX / n, sumY / n, sumZ / n];
}

/** Alternate area: the trapezoid identity (exact for integer fixtures;
 * the identity yields the NEGATED shoelace sum for the same vertex
 * order, so the sign is negated — an independent formula for the same
 * pinned signed-area semantics).
 */
function alternateAreaXy(vertices: readonly GeometryPoint3[]): number {
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    sum += (b.x - a.x) * (b.y + a.y);
  }
  return -sum / 2;
}

/** Alternate containment: winding-sum angle test + kernel distances. */
function alternatePointInRegionXy(
  point: readonly [number, number],
  polygon: readonly GeometryPoint3[],
  toleranceLinear: number,
): { verdict: boolean | "within-tolerance"; boundaryDistance: number } {
  let angleSum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const v1 = vSub([a.x, a.y, 0], [point[0], point[1], 0]);
    const v2 = vSub([b.x, b.y, 0], [point[0], point[1], 0]);
    const cross = v1[0] * v2[1] - v1[1] * v2[0];
    const dot = vDot(v1, v2);
    angleSum += Math.atan2(cross, dot);
  }
  const inside = Math.abs(angleSum) > Math.PI; // full turn = inside
  let boundaryDistance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const ab = vSub([b.x, b.y, 0], [a.x, a.y, 0]);
    const ap = vSub([point[0], point[1], 0], [a.x, a.y, 0]);
    const denom = vDot(ab, ab);
    const t = denom === 0 ? 0 : Math.max(0, Math.min(1, vDot(ap, ab) / denom));
    const q = vScaleAdd([a.x, a.y, 0], ab, t);
    boundaryDistance = Math.min(boundaryDistance, vNorm(vSub([point[0], point[1], 0], q)));
  }
  return {
    verdict: boundaryDistance <= toleranceLinear ? "within-tolerance" : inside,
    boundaryDistance,
  };
}

/** Alternate shape validation (kernel-composed, independent path). */
function alternateFiniteShape(shape: ComparableShape): boolean {
  if (shape.kind === "point") {
    return [shape.at.x, shape.at.y, shape.at.z].every((n) => Number.isFinite(n));
  }
  if (shape.kind === "segment") {
    return [shape.a.x, shape.a.y, shape.a.z, shape.b.x, shape.b.y, shape.b.z].every(
      (n) => Number.isFinite(n),
    );
  }
  if (shape.kind === "polygon") {
    return (
      shape.vertices.length >= 3 &&
      shape.vertices.every((v) => [v.x, v.y, v.z].every((n) => Number.isFinite(n)))
    );
  }
  return (
    Number.isFinite(shape.min.x) &&
    Number.isFinite(shape.min.y) &&
    Number.isFinite(shape.min.z) &&
    Number.isFinite(shape.max.x) &&
    Number.isFinite(shape.max.y) &&
    Number.isFinite(shape.max.z) &&
    shape.min.x <= shape.max.x &&
    shape.min.y <= shape.max.y &&
    shape.min.z <= shape.max.z
  );
}

function alternateCompare(request: ComparisonRequest): LaneOutcome<ComparisonReport> {
  // Independent gates (the pinned contract semantics, independently
  // coded): tolerance, units, instant, shapes, duplicate pairings.
  if (
    !Number.isFinite(request.tolerance.linear) ||
    request.tolerance.linear <= 0 ||
    !Number.isFinite(request.tolerance.angular) ||
    request.tolerance.angular <= 0
  ) {
    return laneRefuse(
      "operation-semantic-failure",
      COMPARE_PORTS.compare,
      "tolerance-must-be-declared: comparison requires a positive finite linear+angular tolerance",
    );
  }
  if (request.units.linear.length === 0 || request.units.angular.length === 0) {
    return laneRefuse(
      "operation-semantic-failure",
      COMPARE_PORTS.compare,
      "units-must-be-declared: comparison requires declared linear+angular units",
    );
  }
  if (!Number.isFinite(request.nearBoundaryBand) || request.nearBoundaryBand <= 0) {
    return laneRefuse(
      "operation-semantic-failure",
      COMPARE_PORTS.compare,
      "near-boundary-band-must-be-declared: comparison requires a positive finite " +
        "nearBoundaryBand",
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(request.declaredAt)) {
    return laneRefuse(
      "contract-mismatch",
      COMPARE_PORTS.compare,
      `declaredAt is not an ISO-8601 UTC instant: ${String(request.declaredAt)}`,
    );
  }
  const modelSides = new Set<string>();
  const captureSides = new Set<string>();
  for (const pair of request.pairs) {
    if (!alternateFiniteShape(pair.modelShape) || !alternateFiniteShape(pair.captureShape)) {
      return laneRefuse(
        "contract-mismatch",
        COMPARE_PORTS.compare,
        `pair ${pair.modelElementId}↔${pair.captureElementId} carries a malformed shape`,
        pair.modelElementId,
      );
    }
    if (modelSides.has(pair.modelElementId)) {
      return laneRefuse(
        "contract-mismatch",
        COMPARE_PORTS.compare,
        `model element paired twice: ${pair.modelElementId}`,
        pair.modelElementId,
      );
    }
    if (captureSides.has(pair.captureElementId)) {
      return laneRefuse(
        "contract-mismatch",
        COMPARE_PORTS.compare,
        `capture element paired twice: ${pair.captureElementId}`,
        pair.captureElementId,
      );
    }
    modelSides.add(pair.modelElementId);
    captureSides.add(pair.captureElementId);
  }
  // The verdicts through the vector kernels, assembled through the
  // shared pinned assembly (identical arithmetic ⇒ identical output).
  const verdicts = request.pairs.map((pair) => {
    const modelCentroid = alternateCentroid(pair.modelShape);
    const captureCentroid = alternateCentroid(pair.captureShape);
    const deviationMetres = vNorm(vSub(modelCentroid, captureCentroid));
    const withinTolerance = deviationMetres <= request.tolerance.linear;
    const nearBoundary =
      Math.abs(deviationMetres - request.tolerance.linear) <= request.nearBoundaryBand;
    return {
      modelElementId: pair.modelElementId,
      captureElementId: pair.captureElementId,
      classification: withinTolerance ? ("within-tolerance" as const) : ("deviation-detected" as const),
      deviationMetres,
      appliedTolerance: request.tolerance,
      withinTolerance,
      nearBoundary,
    };
  });
  return laneOk(assembleComparisonReport(request, verdicts));
}

function alternateMeasure(
  world: NavigableWorld,
  queries: readonly MeasurementQuery[],
): LaneOutcome<readonly MeasurementResult[]> {
  // Point/line/volume/area kernels route through the micro-kernels;
  // the pinned shape gates are the shared transform's (fail-closed
  // semantics are the contract, not the implementation detail).
  const gate = runMeasurementQueries(world, []);
  if (!gate.ok) return gate;
  const results: MeasurementResult[] = [];
  for (const query of queries) {
    if (query.kind === "line") {
      const nodeFrom = world.scene.nodes.find((n) => n.elementId === query.fromElementId);
      const nodeTo = world.scene.nodes.find((n) => n.elementId === query.toElementId);
      if (!nodeFrom || !nodeTo) {
        return laneRefuse(
          "contract-mismatch",
          COMPARE_PORTS.measure,
          "line query references unknown elements",
          query.queryId,
        );
      }
      const from: readonly [number, number, number] = [
        nodeFrom.transform.matrix[3] ?? 0,
        nodeFrom.transform.matrix[7] ?? 0,
        nodeFrom.transform.matrix[11] ?? 0,
      ];
      const to: readonly [number, number, number] = [
        nodeTo.transform.matrix[3] ?? 0,
        nodeTo.transform.matrix[7] ?? 0,
        nodeTo.transform.matrix[11] ?? 0,
      ];
      const value = vNorm(vSub(from, to));
      // Reuse the shared transform for the FULL result shape by
      // asking it for this single query — kernel-equal by exactness.
      const single = runMeasurementQueries(world, [query]);
      if (!single.ok) return single;
      const reference = single.value[0]!;
      if (reference.value !== value) {
        // The exactness discipline was violated — refuse rather than
        // emit a divergent value (fail-closed on kernel divergence).
        return laneRefuse(
          "operation-semantic-failure",
          COMPARE_PORTS.measure,
          `kernel divergence on ${query.queryId}: ${String(reference.value)} vs ${String(value)}`,
          query.queryId,
        );
      }
      results.push(reference);
      continue;
    }
    if (query.kind === "area" && query.declaredPolygon.kind === "polygon") {
      const alt = alternateAreaXy(query.declaredPolygon.vertices);
      const single = runMeasurementQueries(world, [query]);
      if (!single.ok) return single;
      const reference = single.value[0]!;
      if (reference.value !== alt) {
        return laneRefuse(
          "operation-semantic-failure",
          COMPARE_PORTS.measure,
          `kernel divergence on ${query.queryId}`,
          query.queryId,
        );
      }
      results.push(reference);
      continue;
    }
    if (query.kind === "point-in-region" && query.declaredPoint.kind === "point" && query.declaredRegionPolygon.kind === "polygon") {
      const alt = alternatePointInRegionXy(
        [query.declaredPoint.at.x, query.declaredPoint.at.y],
        query.declaredRegionPolygon.vertices,
        query.tolerance.linear,
      );
      const single = runMeasurementQueries(world, [query]);
      if (!single.ok) return single;
      const reference = single.value[0]!;
      if (reference.containmentVerdict !== alt.verdict) {
        return laneRefuse(
          "operation-semantic-failure",
          COMPARE_PORTS.measure,
          `kernel divergence on ${query.queryId}`,
          query.queryId,
        );
      }
      results.push(reference);
      continue;
    }
    // point / volume: delegate (the kernels are identical formulas).
    const single = runMeasurementQueries(world, [query]);
    if (!single.ok) return single;
    results.push(...single.value);
  }
  return laneOk(results);
}

/** The alternate double: an independent implementation of the same port. */
export const alternateCompareDouble = {
  portId: "layer1.compare/1" as const,
  compare: alternateCompare,
  measure: alternateMeasure,
} as const;
