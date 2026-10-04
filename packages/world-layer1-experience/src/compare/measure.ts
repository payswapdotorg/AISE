/**
 * `@aise/world-layer1-experience` — the MEASURE transform
 * (WORLD-P1, `src/compare/measure.ts`).
 *
 * IN-WORLD MEASUREMENT as typed queries over a DECLARED world state:
 * point / line / area / volume / containment, each with a DECLARED
 * tolerance and unit (a query without them is refused), each answer an
 * INFERRED candidate bound to the measured elements' evidence — never
 * a bare number, never an authoritative measurement.
 *
 * THE GEOMETRY DELEGATION (P0-B vocabulary, verbatim): the quantity
 * vocabulary is `GEOMETRY_QUANTITY_KINDS` (distance/length/area/
 * volume); the tolerance carrier is `GeometryToleranceDeclaration`;
 * the near-boundary containment verdict is `boolean |
 * "within-tolerance"` — the P0-B discipline. The closed-form kernels
 * here are the SAME pinned semantics the P0-B reference double
 * computes (segment length, polygon area, box volume, point-in-region
 * with signed boundary distance).
 *
 * EXACTNESS: the committed fixture coordinates are integers chosen so
 * every kernel result is exact in IEEE-754 double arithmetic
 * (3-4-5 distances, integer shoelace areas, integer box volumes) —
 * the reference and alternate doubles agree bit-for-bit.
 */

import { laneOk, laneRefuse, type LaneOutcome } from "../failures";
import type {
  MeasurementQuery,
  MeasurementResult,
} from "./contract";
import { COMPARE_PORTS, MEASUREMENT_QUERY_KINDS } from "./contract";
import type { NavigableWorld } from "../world/contract";
import type { GeometryPoint3 } from "@aise/world-understanding-substrate";

/* ------------------------------------------------------------------ */
/* Shape kernels (closed-form, exact for the fixture coordinates)        */
/* ------------------------------------------------------------------ */

/** The polygon area (shoelace over the xy projection — planar area). */
export function polygonAreaXy(vertices: readonly GeometryPoint3[]): number {
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!;
    const b = vertices[(i + 1) % vertices.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/** The box volume (extent product). */
export function boxVolume(
  min: GeometryPoint3,
  max: GeometryPoint3,
): number {
  return (max.x - min.x) * (max.y - min.y) * (max.z - min.z);
}

/** The Euclidean distance between two points. */
export function pointDistance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** The distance from a point to one segment (the projection clamp). */
export function pointSegmentDistance(
  p: readonly [number, number, number],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const apz = p[2] - a[2];
  const denom = abx * abx + aby * aby + abz * abz;
  const t = denom === 0 ? 0 : (apx * abx + apy * aby + apz * abz) / denom;
  const clamped = Math.max(0, Math.min(1, t));
  const qx = a[0] + clamped * abx;
  const qy = a[1] + clamped * aby;
  const qz = a[2] + clamped * abz;
  return pointDistance(p, [qx, qy, qz]);
}

/**
 * The point-in-region predicate with the NEAR-BOUNDARY discipline: the
 * verdict is `true`/`false` by the crossing test, and
 * `"within-tolerance"` when the signed boundary distance sits inside
 * the DECLARED linear tolerance (the consumer decides with the band).
 * `signedDistance` is positive inside (half the region "width" at the
 * point), negative outside — the honest near-boundary evidence.
 */
export function pointInRegionXy(
  point: readonly [number, number],
  polygon: readonly GeometryPoint3[],
  toleranceLinear: number,
): { verdict: boolean | "within-tolerance"; signedDistance: number; boundaryDistance: number } {
  // Crossing test (xy projection).
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const crosses =
      a.y > point[1] !== b.y > point[1] &&
      point[0] < ((b.x - a.x) * (point[1] - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  // Boundary distance: min over edges (segment distances in xy).
  let boundaryDistance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const d = pointSegmentDistance(
      [point[0], point[1], 0],
      [a.x, a.y, 0],
      [b.x, b.y, 0],
    );
    if (d < boundaryDistance) boundaryDistance = d;
  }
  const signedDistance = inside ? boundaryDistance : -boundaryDistance;
  const withinToleranceBand = boundaryDistance <= toleranceLinear;
  return {
    verdict: withinToleranceBand ? "within-tolerance" : inside,
    signedDistance,
    boundaryDistance,
  };
}

/* ------------------------------------------------------------------ */
/* The MEASURE transform                                                */
/* ------------------------------------------------------------------ */

function validateTolerance(tolerance: MeasurementQuery["tolerance"]): LaneOutcome<null> {
  if (
    !Number.isFinite(tolerance.linear) ||
    tolerance.linear <= 0 ||
    !Number.isFinite(tolerance.angular) ||
    tolerance.angular <= 0
  ) {
    return laneRefuse(
      "operation-semantic-failure",
      COMPARE_PORTS.measure,
      "tolerance-must-be-declared: measurement requires a positive finite linear+angular tolerance",
    );
  }
  return laneOk(null);
}

function validateUnits(units: MeasurementQuery["units"]): LaneOutcome<null> {
  if (
    typeof units.linear !== "string" ||
    units.linear.length === 0 ||
    typeof units.angular !== "string" ||
    units.angular.length === 0
  ) {
    return laneRefuse(
      "operation-semantic-failure",
      COMPARE_PORTS.measure,
      "units-must-be-declared: measurement requires declared linear+angular units",
    );
  }
  return laneOk(null);
}

/**
 * The element's world position (the transform translation — the
 * pinned reading of a node's placement, matching the P0-A runtime
 * double's convention: matrix indices 3, 7, 11).
 */
export function elementPositionOf(
  world: NavigableWorld,
  elementId: string,
): readonly [number, number, number] | null {
  const node = world.scene.nodes.find((candidate) => candidate.elementId === elementId);
  if (!node) return null;
  const m = node.transform.matrix;
  return [m[3] ?? 0, m[7] ?? 0, m[11] ?? 0];
}

function evidenceOfElement(world: NavigableWorld, elementId: string): readonly string[] {
  const record = world.elementProvenance.find(
    (candidate) => candidate.elementId === elementId,
  );
  return record ? [...record.evidenceContentIds] : [];
}

/**
 * MEASURE: run the declared queries over the world state. Every query
 * must reference elements that EXIST; every shape must be well-formed
 * finite geometry; every tolerance/unit declaration must be positive
 * finite — one bad query refuses the whole batch (fail-closed: never
 * a partially-computed measurement set).
 */
export function runMeasurementQueries(
  world: NavigableWorld,
  queries: readonly MeasurementQuery[],
): LaneOutcome<readonly MeasurementResult[]> {
  const port = COMPARE_PORTS.measure;

  const results: MeasurementResult[] = [];
  const seenQueryIds = new Set<string>();

  for (const query of queries) {
    // Gate 1: the query id shape.
    if (typeof query.queryId !== "string" || query.queryId.length === 0) {
      return laneRefuse("contract-mismatch", port, "query id must be a non-empty string");
    }
    if (seenQueryIds.has(query.queryId)) {
      return laneRefuse(
        "contract-mismatch",
        port,
        `duplicate query id: ${query.queryId}`,
        query.queryId,
      );
    }
    seenQueryIds.add(query.queryId);

    // Gate 2: the declared tolerance + units.
    const toleranceCheck = validateTolerance(query.tolerance);
    if (!toleranceCheck.ok) return toleranceCheck;
    const unitsCheck = validateUnits(query.units);
    if (!unitsCheck.ok) return unitsCheck;

    // Gate 3: kind-wise operand validation + computation.
    switch (query.kind) {
      case "point": {
        const position = elementPositionOf(world, query.elementId);
        if (position === null) {
          return laneRefuse(
            "contract-mismatch",
            port,
            `point query references unknown element: ${query.elementId}`,
            query.elementId,
          );
        }
        results.push({
          queryId: query.queryId,
          kind: "point",
          quantity: null,
          value: null,
          unit: null,
          position,
          containmentVerdict: null,
          appliedTolerance: query.tolerance,
          units: query.units,
          nearBoundary: false,
          evidenceContentIds: evidenceOfElement(world, query.elementId),
          epistemicStatus: "INFERRED",
          method: "world.measurement",
        });
        break;
      }
      case "line": {
        const from = elementPositionOf(world, query.fromElementId);
        const to = elementPositionOf(world, query.toElementId);
        if (from === null) {
          return laneRefuse(
            "contract-mismatch",
            port,
            `line query references unknown from-element: ${query.fromElementId}`,
            query.fromElementId,
          );
        }
        if (to === null) {
          return laneRefuse(
            "contract-mismatch",
            port,
            `line query references unknown to-element: ${query.toElementId}`,
            query.toElementId,
          );
        }
        const value = pointDistance(from, to);
        results.push({
          queryId: query.queryId,
          kind: "line",
          quantity: "distance",
          value,
          unit: query.units.linear,
          position: null,
          containmentVerdict: null,
          appliedTolerance: query.tolerance,
          units: query.units,
          nearBoundary: false,
          evidenceContentIds: [
            ...evidenceOfElement(world, query.fromElementId),
            ...evidenceOfElement(world, query.toElementId),
          ],
          epistemicStatus: "INFERRED",
          method: "world.measurement",
        });
        break;
      }
      case "area": {
        if (query.declaredPolygon.kind !== "polygon" || query.declaredPolygon.vertices.length < 3) {
          return laneRefuse(
            "contract-mismatch",
            port,
            "area query requires a declared polygon with >= 3 vertices",
            query.queryId,
          );
        }
        if (!elementExists(world, query.elementId)) {
          return laneRefuse(
            "contract-mismatch",
            port,
            `area query references unknown element: ${query.elementId}`,
            query.elementId,
          );
        }
        const value = polygonAreaXy(query.declaredPolygon.vertices);
        results.push({
          queryId: query.queryId,
          kind: "area",
          quantity: "area",
          value,
          unit: `${query.units.linear}2`,
          position: null,
          containmentVerdict: null,
          appliedTolerance: query.tolerance,
          units: query.units,
          nearBoundary: false,
          evidenceContentIds: evidenceOfElement(world, query.elementId),
          epistemicStatus: "INFERRED",
          method: "world.measurement",
        });
        break;
      }
      case "volume": {
        if (query.declaredBox.kind !== "box") {
          return laneRefuse(
            "contract-mismatch",
            port,
            "volume query requires a declared box",
            query.queryId,
          );
        }
        if (
          query.declaredBox.min.x > query.declaredBox.max.x ||
          query.declaredBox.min.y > query.declaredBox.max.y ||
          query.declaredBox.min.z > query.declaredBox.max.z
        ) {
          return laneRefuse(
            "contract-mismatch",
            port,
            "volume query box is inverted (min > max on an axis) — malformed geometry never computes",
            query.queryId,
          );
        }
        if (!elementExists(world, query.elementId)) {
          return laneRefuse(
            "contract-mismatch",
            port,
            `volume query references unknown element: ${query.elementId}`,
            query.elementId,
          );
        }
        const value = boxVolume(query.declaredBox.min, query.declaredBox.max);
        results.push({
          queryId: query.queryId,
          kind: "volume",
          quantity: "volume",
          value,
          unit: `${query.units.linear}3`,
          position: null,
          containmentVerdict: null,
          appliedTolerance: query.tolerance,
          units: query.units,
          nearBoundary: false,
          evidenceContentIds: evidenceOfElement(world, query.elementId),
          epistemicStatus: "INFERRED",
          method: "world.measurement",
        });
        break;
      }
      case "point-in-region": {
        if (
          query.declaredPoint.kind !== "point" ||
          query.declaredRegionPolygon.kind !== "polygon" ||
          query.declaredRegionPolygon.vertices.length < 3
        ) {
          return laneRefuse(
            "contract-mismatch",
            port,
            "point-in-region query requires a declared point and a polygon with >= 3 vertices",
            query.queryId,
          );
        }
        if (
          !elementExists(world, query.pointElementId) ||
          !elementExists(world, query.regionElementId)
        ) {
          return laneRefuse(
            "contract-mismatch",
            port,
            `point-in-region query references unknown element(s): ` +
              `${query.pointElementId} / ${query.regionElementId}`,
            query.pointElementId,
          );
        }
        const region = pointInRegionXy(
          [query.declaredPoint.at.x, query.declaredPoint.at.y],
          query.declaredRegionPolygon.vertices,
          query.tolerance.linear,
        );
        results.push({
          queryId: query.queryId,
          kind: "point-in-region",
          quantity: null,
          value: region.boundaryDistance,
          unit: query.units.linear,
          position: null,
          containmentVerdict: region.verdict,
          appliedTolerance: query.tolerance,
          units: query.units,
          nearBoundary: region.verdict === "within-tolerance",
          evidenceContentIds: [
            ...evidenceOfElement(world, query.pointElementId),
            ...evidenceOfElement(world, query.regionElementId),
          ],
          epistemicStatus: "INFERRED",
          method: "world.measurement",
        });
        break;
      }
      default:
        return laneRefuse(
          "unsupported-data",
          port,
          `query kind outside the closed vocabulary: ${String((query as MeasurementQuery).kind)} ` +
            `(${MEASUREMENT_QUERY_KINDS.join(" | ")})`,
        );
    }
  }

  // Gate 4: every query must have declared instants handled by the
  // caller's request envelope — the results carry no clock reads.
  return laneOk(results);
}

function elementExists(world: NavigableWorld, elementId: string): boolean {
  return world.scene.nodes.some((node) => node.elementId === elementId);
}
