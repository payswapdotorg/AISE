/**
 * `@aise/world-layer1-experience` — the COMPARE transform
 * (WORLD-P1, `src/compare/compare.ts`).
 *
 * MODEL-VS-CAPTURE comparison as a tolerance-DECLARED typed transform:
 * aligned pairs in, difference classifications + comparison verdicts
 * out, the declared tolerance carried VERBATIM into every verdict.
 *
 * THE P1 DEVIATION PROXY (declared, honest): the deviation between an
 * aligned pair is the EUCLIDEAN DISTANCE between the two declared
 * shapes' CENTROIDS (box centers, points, segment midpoints, polygon
 * vertex means — each exact for the committed fixture coordinates).
 * A richer deviation model (surface-to-surface, distribution-to-plan)
 * is a future port occupant's contribution — it would enter through
 * the SAME typed verdict, with its method recorded in the derivation.
 *
 * THE NEAR-BOUNDARY LAW (P0-B discipline, delegated to): a deviation
 * inside the declared linear tolerance is `within-tolerance`; above it
 * is `deviation-detected`; a deviation within ONE tolerance-width of
 * the boundary itself (|deviation − tolerance.linear| ≤
 * tolerance.linear) additionally flags `nearBoundary: true` — the
 * consumer decides with the band, never the lane silently.
 *
 * NO TOLERANCE, NO COMPARISON: a request without a positive finite
 * declared tolerance is refused (`tolerance-must-be-declared`
 * semantics — the substitution-contract law 2).
 */

import { canonicalDigestOf, isIsoUtcInstant } from "../lane";
import { laneOk, laneRefuse, type LaneOutcome } from "../failures";
import type {
  ComparableShape,
  ComparisonReport,
  ComparisonRequest,
  ComparisonVerdict,
  DifferenceClassification,
} from "./contract";
import { COMPARE_PORTS, DIFFERENCE_CLASSIFICATIONS } from "./contract";

/* ------------------------------------------------------------------ */
/* The centroid proxy (declared, exact for fixture coordinates)          */
/* ------------------------------------------------------------------ */

/** The centroid of a declared shape — the P1 deviation proxy. */
export function shapeCentroidOf(
  shape: ComparableShape,
): readonly [number, number, number] {
  switch (shape.kind) {
    case "point":
      return [shape.at.x, shape.at.y, shape.at.z];
    case "segment":
      return [
        (shape.a.x + shape.b.x) / 2,
        (shape.a.y + shape.b.y) / 2,
        (shape.a.z + shape.b.z) / 2,
      ];
    case "polygon": {
      const n = shape.vertices.length;
      let x = 0;
      let y = 0;
      let z = 0;
      for (const vertex of shape.vertices) {
        x += vertex.x;
        y += vertex.y;
        z += vertex.z;
      }
      return [x / n, y / n, z / n];
    }
    case "box":
      return [
        (shape.min.x + shape.max.x) / 2,
        (shape.min.y + shape.max.y) / 2,
        (shape.min.z + shape.max.z) / 2,
      ];
  }
}

function finiteShape(shape: ComparableShape): boolean {
  const numbers: number[] = [];
  switch (shape.kind) {
    case "point":
      numbers.push(shape.at.x, shape.at.y, shape.at.z);
      break;
    case "segment":
      numbers.push(shape.a.x, shape.a.y, shape.a.z, shape.b.x, shape.b.y, shape.b.z);
      break;
    case "polygon":
      if (shape.vertices.length < 3) return false;
      for (const vertex of shape.vertices) {
        numbers.push(vertex.x, vertex.y, vertex.z);
      }
      break;
    case "box":
      numbers.push(
        shape.min.x,
        shape.min.y,
        shape.min.z,
        shape.max.x,
        shape.max.y,
        shape.max.z,
      );
      if (
        shape.min.x > shape.max.x ||
        shape.min.y > shape.max.y ||
        shape.min.z > shape.max.z
      ) {
        return false;
      }
      break;
  }
  return numbers.every((value) => Number.isFinite(value));
}

/* ------------------------------------------------------------------ */
/* The COMPARE transform                                                */
/* ------------------------------------------------------------------ */

/** The classification order of the counts summary (the closed order). */
function classificationCountsOf(
  verdicts: readonly ComparisonVerdict[],
  request: ComparisonRequest,
): readonly { readonly classification: DifferenceClassification; readonly count: number }[] {
  const counts = new Map<DifferenceClassification, number>();
  for (const classification of DIFFERENCE_CLASSIFICATIONS) {
    counts.set(classification, 0);
  }
  for (const verdict of verdicts) {
    counts.set(verdict.classification, (counts.get(verdict.classification) ?? 0) + 1);
  }
  counts.set("missing-in-capture", request.unpairedModelElementIds.length);
  counts.set("missing-in-model", request.unpairedCaptureElementIds.length);
  return DIFFERENCE_CLASSIFICATIONS.map((classification) => ({
    classification,
    count: counts.get(classification) ?? 0,
  }));
}

/**
 * The report ASSEMBLY (the pinned contract shape): counts, digest and
 * output record — shared by the reference transform and the alternate
 * double (the VERDICT COMPUTATION is the substitutable kernel; the
 * assembly is the contract).
 */
export function assembleComparisonReport(
  request: ComparisonRequest,
  verdicts: readonly ComparisonVerdict[],
): ComparisonReport {
  const classificationCounts = classificationCountsOf(verdicts, request);
  const body = {
    worldRevision: request.worldRevision,
    verdicts,
    unpairedModelElementIds: [...request.unpairedModelElementIds],
    unpairedCaptureElementIds: [...request.unpairedCaptureElementIds],
    appliedTolerance: request.tolerance,
    units: request.units,
  };
  const reportId = canonicalDigestOf(body);
  return {
    reportId,
    worldRevision: request.worldRevision,
    verdicts,
    unpairedModelElementIds: [...request.unpairedModelElementIds],
    unpairedCaptureElementIds: [...request.unpairedCaptureElementIds],
    appliedTolerance: request.tolerance,
    units: request.units,
    classificationCounts,
  };
}

/**
 * COMPARE: the tolerance-declared model-vs-capture comparison.
 * Fail-closed on malformed shapes, non-declared tolerances, duplicate
 * pairings; every verdict carries the tolerance VERBATIM.
 */
export function compareModelToCapture(
  request: ComparisonRequest,
): LaneOutcome<ComparisonReport> {
  const port = COMPARE_PORTS.compare;

  // Gate 1: the tolerance is DECLARED and positive finite (law 2).
  if (
    !Number.isFinite(request.tolerance.linear) ||
    request.tolerance.linear <= 0 ||
    !Number.isFinite(request.tolerance.angular) ||
    request.tolerance.angular <= 0
  ) {
    return laneRefuse(
      "operation-semantic-failure",
      port,
      "tolerance-must-be-declared: comparison requires a positive finite linear+angular tolerance",
    );
  }
  // Gate 1b: the near-boundary band is DECLARED and positive finite
  // (the band is a declaration, never an implicit default — law 2).
  if (!Number.isFinite(request.nearBoundaryBand) || request.nearBoundaryBand <= 0) {
    return laneRefuse(
      "operation-semantic-failure",
      port,
      "near-boundary-band-must-be-declared: comparison requires a positive finite " +
        "nearBoundaryBand (how close to the tolerance boundary a deviation must sit " +
        "before the verdict is flagged near-boundary)",
    );
  }
  // Gate 2: the units are declared.
  if (
    typeof request.units.linear !== "string" ||
    request.units.linear.length === 0 ||
    typeof request.units.angular !== "string" ||
    request.units.angular.length === 0
  ) {
    return laneRefuse(
      "operation-semantic-failure",
      port,
      "units-must-be-declared: comparison requires declared linear+angular units",
    );
  }
  // Gate 3: the declared instant.
  if (!isIsoUtcInstant(request.declaredAt)) {
    return laneRefuse(
      "contract-mismatch",
      port,
      `declaredAt is not an ISO-8601 UTC instant: ${String(request.declaredAt)}`,
    );
  }

  // Gate 4: every pair's shapes are well-formed finite geometry.
  for (const pair of request.pairs) {
    if (!finiteShape(pair.modelShape) || !finiteShape(pair.captureShape)) {
      return laneRefuse(
        "contract-mismatch",
        port,
        `pair ${pair.modelElementId}↔${pair.captureElementId} carries a malformed shape ` +
          "(non-finite coordinates, <3 polygon vertices, or inverted box)",
        pair.modelElementId,
      );
    }
  }

  // Gate 5: no duplicate pairings (one model element pairs at most one
  // capture element and vice versa — a double pairing is ambiguous).
  const modelSides = new Set<string>();
  const captureSides = new Set<string>();
  for (const pair of request.pairs) {
    if (modelSides.has(pair.modelElementId)) {
      return laneRefuse(
        "contract-mismatch",
        port,
        `model element paired twice: ${pair.modelElementId}`,
        pair.modelElementId,
      );
    }
    if (captureSides.has(pair.captureElementId)) {
      return laneRefuse(
        "contract-mismatch",
        port,
        `capture element paired twice: ${pair.captureElementId}`,
        pair.captureElementId,
      );
    }
    modelSides.add(pair.modelElementId);
    captureSides.add(pair.captureElementId);
  }

  // The verdicts (the centroid-proxy deviation + the declared band).
  const verdicts: ComparisonVerdict[] = request.pairs.map((pair) => {
    const modelCentroid = shapeCentroidOf(pair.modelShape);
    const captureCentroid = shapeCentroidOf(pair.captureShape);
    const dx = modelCentroid[0] - captureCentroid[0];
    const dy = modelCentroid[1] - captureCentroid[1];
    const dz = modelCentroid[2] - captureCentroid[2];
    const deviationMetres = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const withinTolerance = deviationMetres <= request.tolerance.linear;
    const nearBoundary =
      Math.abs(deviationMetres - request.tolerance.linear) <= request.nearBoundaryBand;
    return {
      modelElementId: pair.modelElementId,
      captureElementId: pair.captureElementId,
      classification: (withinTolerance ? "within-tolerance" : "deviation-detected") as
        | "within-tolerance"
        | "deviation-detected",
      deviationMetres,
      appliedTolerance: request.tolerance,
      withinTolerance,
      nearBoundary,
    };
  });

  return laneOk(assembleComparisonReport(request, verdicts));
}
