/**
 * WORLD-P1 tests — the COMPARE + MEASURE family (`src/compare/`).
 *
 * Proves the model-vs-capture comparison and the in-world measurement
 * contracts work WITHOUT any geometry kernel (no OCCT, no OCP, no
 * CadQuery — the P0-B vocabulary is DELEGATED to, the kernels are
 * closed-form and exact): tolerance-DECLARED verdicts (a tolerance-less
 * request refuses), the near-boundary discipline (within-tolerance
 * instead of a silent boolean), measurements bound to evidence as
 * INFERRED candidates, and the fail-closed drills.
 */

import { describe, expect, test } from "bun:test";
import {
  compareModelToCapture,
  shapeCentroidOf,
} from "./compare";
import {
  runMeasurementQueries,
  polygonAreaXy,
  boxVolume,
  pointDistance,
  pointInRegionXy,
} from "./measure";
import type { ComparisonRequest, MeasurementQuery } from "./contract";
import {
  DIFFERENCE_CLASSIFICATIONS,
  isDifferenceClassification,
  MEASUREMENT_QUERY_KINDS,
  isMeasurementQueryKind,
} from "./contract";
import {
  FIXTURE_COMPARISON_REQUEST,
  FIXTURE_MEASUREMENT_QUERIES,
  FIXTURE_TOLERANCE,
  FIXTURE_UNITS,
  FIXTURE_WIDE_TOLERANCE,
  FIXTURE_WIDE_TOLERANCE_CONTAINMENT_QUERY,
  FIXTURE_WORLD,
} from "../fixtures";

/* ------------------------------------------------------------------ */
/* COMPARE — the committed fixture                                      */
/* ------------------------------------------------------------------ */

describe("compare — the committed fixture", () => {
  test("the fixture comparison: one deviation-detected (5 m), one within-tolerance (0 m)", () => {
    const outcome = compareModelToCapture(FIXTURE_COMPARISON_REQUEST);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const report = outcome.value;
      expect(report.verdicts).toHaveLength(2);
      expect(report.verdicts[0]!.classification).toBe("deviation-detected");
      expect(report.verdicts[0]!.deviationMetres).toBe(5); // EXACT (integer centroid distance)
      expect(report.verdicts[0]!.withinTolerance).toBe(false);
      expect(report.verdicts[1]!.classification).toBe("within-tolerance");
      expect(report.verdicts[1]!.deviationMetres).toBe(0);
      expect(report.verdicts[1]!.withinTolerance).toBe(true);
      expect(report.reportId).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test("the unpaired classifications: missing-in-capture from the model side", () => {
    const outcome = compareModelToCapture(FIXTURE_COMPARISON_REQUEST);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const counts = new Map(
        outcome.value.classificationCounts.map((c) => [c.classification, c.count]),
      );
      expect(counts.get("missing-in-capture")).toBe(1);
      expect(counts.get("missing-in-model")).toBe(0);
      expect(counts.get("deviation-detected")).toBe(1);
      expect(counts.get("within-tolerance")).toBe(1);
      expect(counts.get("unverifiable")).toBe(0);
      // the closed-vocabulary order is pinned
      expect(outcome.value.classificationCounts.map((c) => c.classification)).toEqual([
        ...DIFFERENCE_CLASSIFICATIONS,
      ]);
    }
  });

  test("the declared tolerance is carried VERBATIM into every verdict (law 2)", () => {
    const outcome = compareModelToCapture(FIXTURE_COMPARISON_REQUEST);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      for (const verdict of outcome.value.verdicts) {
        expect(verdict.appliedTolerance).toEqual(FIXTURE_TOLERANCE);
      }
      expect(outcome.value.appliedTolerance).toEqual(FIXTURE_TOLERANCE);
    }
  });

  test("the near-boundary flag: a deviation within the DECLARED band of the boundary", () => {
    // deviation 5, tolerance 4.5, band 0.5 → |5 - 4.5| = 0.5 <= 0.5 → nearBoundary
    const request: ComparisonRequest = {
      ...FIXTURE_COMPARISON_REQUEST,
      tolerance: { linear: 4.5, angular: 1e-9 },
      nearBoundaryBand: 0.5,
    };
    const outcome = compareModelToCapture(request);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.verdicts[0]!.deviationMetres).toBe(5);
      expect(outcome.value.verdicts[0]!.withinTolerance).toBe(false);
      expect(outcome.value.verdicts[0]!.nearBoundary).toBe(true);
      // the zero-deviation verdict is NOT near the boundary (|0-4.5| = 4.5 > 0.5)
      expect(outcome.value.verdicts[1]!.nearBoundary).toBe(false);
    }
  });

  test("a comparison WITHOUT a declared near-boundary band refuses (the band is a declaration)", () => {
    const request: ComparisonRequest = {
      ...FIXTURE_COMPARISON_REQUEST,
      nearBoundaryBand: 0,
    };
    const outcome = compareModelToCapture(request);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("operation-semantic-failure");
      expect(outcome.failure.detail).toContain("near-boundary-band-must-be-declared");
    }
  });

  test("determinism: the same request yields the byte-identical report id", () => {
    const a = compareModelToCapture(FIXTURE_COMPARISON_REQUEST);
    const b = compareModelToCapture(FIXTURE_COMPARISON_REQUEST);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/* ------------------------------------------------------------------ */
/* COMPARE — fail-closed drills                                         */
/* ------------------------------------------------------------------ */

describe("compare — fail-closed drills", () => {
  test("a comparison WITHOUT a declared tolerance refuses (tolerance-must-be-declared)", () => {
    const request: ComparisonRequest = {
      ...FIXTURE_COMPARISON_REQUEST,
      tolerance: { linear: 0, angular: 0 },
    };
    const outcome = compareModelToCapture(request);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("operation-semantic-failure");
      expect(outcome.failure.detail).toContain("tolerance-must-be-declared");
    }
  });

  test("a comparison with an EMPTY units declaration refuses", () => {
    const request: ComparisonRequest = {
      ...FIXTURE_COMPARISON_REQUEST,
      units: { linear: "", angular: "rad" },
    };
    const outcome = compareModelToCapture(request);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("units-must-be-declared");
    }
  });

  test("a malformed shape (2-vertex polygon) refuses", () => {
    const request: ComparisonRequest = {
      ...FIXTURE_COMPARISON_REQUEST,
      pairs: [
        {
          ...FIXTURE_COMPARISON_REQUEST.pairs[0]!,
          modelShape: {
            kind: "polygon",
            name: null,
            vertices: [
              { x: 0, y: 0, z: 0 },
              { x: 1, y: 0, z: 0 },
            ],
          },
        },
      ],
    };
    const outcome = compareModelToCapture(request);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toContain("malformed shape");
    }
  });

  test("a model element paired twice refuses (ambiguous pairing)", () => {
    const request: ComparisonRequest = {
      ...FIXTURE_COMPARISON_REQUEST,
      pairs: [
        FIXTURE_COMPARISON_REQUEST.pairs[0]!,
        { ...FIXTURE_COMPARISON_REQUEST.pairs[0]!, captureElementId: "another-capture" },
      ],
    };
    const outcome = compareModelToCapture(request);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("paired twice");
    }
  });

  test("a non-finite shape coordinate refuses", () => {
    const request: ComparisonRequest = {
      ...FIXTURE_COMPARISON_REQUEST,
      pairs: [
        {
          ...FIXTURE_COMPARISON_REQUEST.pairs[0]!,
          modelShape: {
            kind: "point",
            name: null,
            at: { x: Number.NaN, y: 0, z: 0 },
          },
        },
      ],
    };
    const outcome = compareModelToCapture(request);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
    }
  });
});

/* ------------------------------------------------------------------ */
/* MEASURE — the committed fixture                                      */
/* ------------------------------------------------------------------ */

describe("measure — the committed fixture", () => {
  test("the five query kinds compute EXACT values on the integer fixture geometry", () => {
    const outcome = runMeasurementQueries(FIXTURE_WORLD, FIXTURE_MEASUREMENT_QUERIES);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const [point, line, area, volume, containment] = outcome.value;
      expect(point!.kind).toBe("point");
      expect(point!.position).toEqual([0, 0, 2]);
      expect(line!.kind).toBe("line");
      expect(line!.value).toBe(10); // EXACT: 3-4-5 family integer distance
      expect(line!.unit).toBe("m");
      expect(area!.kind).toBe("area");
      expect(area!.value).toBe(16); // EXACT: 4×4 shoelace
      expect(area!.unit).toBe("m2");
      expect(volume!.kind).toBe("volume");
      expect(volume!.value).toBe(60); // EXACT: 3×4×5
      expect(volume!.unit).toBe("m3");
      expect(containment!.kind).toBe("point-in-region");
      expect(containment!.containmentVerdict).toBe(true); // boundary distance 1 > tolerance 0.05
      expect(containment!.nearBoundary).toBe(false);
    }
  });

  test("every measurement is an INFERRED candidate bound to the measured elements' evidence", () => {
    const outcome = runMeasurementQueries(FIXTURE_WORLD, FIXTURE_MEASUREMENT_QUERIES);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      for (const result of outcome.value) {
        expect(result.epistemicStatus).toBe("INFERRED");
        expect(result.method).toBe("world.measurement");
        expect(result.appliedTolerance).toEqual(FIXTURE_TOLERANCE);
        expect(result.evidenceContentIds.length).toBeGreaterThan(0);
      }
      // the line measurement binds BOTH elements' evidence
      const line = outcome.value[1]!;
      expect(line.evidenceContentIds).toHaveLength(2);
    }
  });

  test("the near-boundary containment verdict: within-tolerance instead of a silent boolean", () => {
    // boundary distance 1 with tolerance 2 → "within-tolerance" (the P0-B discipline)
    const outcome = runMeasurementQueries(FIXTURE_WORLD, [
      FIXTURE_WIDE_TOLERANCE_CONTAINMENT_QUERY,
    ]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const result = outcome.value[0]!;
      expect(result.containmentVerdict).toBe("within-tolerance");
      expect(result.nearBoundary).toBe(true);
      expect(result.value).toBe(1); // the boundary distance carried as evidence
      expect(result.appliedTolerance).toEqual(FIXTURE_WIDE_TOLERANCE);
    }
  });

  test("an OUTSIDE point answers false (or within-tolerance near the edge) — never fabricated", () => {
    const containQuery = FIXTURE_MEASUREMENT_QUERIES[4]!;
    if (containQuery.kind !== "point-in-region") {
      throw new Error("fixture shape: [4] must be the containment query");
    }
    const query: MeasurementQuery = {
      queryId: "query-contain-outside",
      kind: "point-in-region",
      pointElementId: containQuery.pointElementId,
      regionElementId: containQuery.regionElementId,
      declaredPoint: { kind: "point", name: null, at: { x: 20, y: 20, z: 0 } },
      declaredRegionPolygon: containQuery.declaredRegionPolygon,
      tolerance: FIXTURE_TOLERANCE,
      units: FIXTURE_UNITS,
    };
    const outcome = runMeasurementQueries(FIXTURE_WORLD, [query]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value[0]!.containmentVerdict).toBe(false);
      expect(outcome.value[0]!.value).toBeGreaterThan(0); // the honest signed margin evidence
    }
  });
});

/* ------------------------------------------------------------------ */
/* MEASURE — fail-closed drills                                         */
/* ------------------------------------------------------------------ */

describe("measure — fail-closed drills", () => {
  const lineQuery = FIXTURE_MEASUREMENT_QUERIES[1]!;
  if (lineQuery.kind !== "line") throw new Error("fixture shape: [1] must be the line query");
  const areaQuery = FIXTURE_MEASUREMENT_QUERIES[2]!;
  if (areaQuery.kind !== "area") throw new Error("fixture shape: [2] must be the area query");
  const volumeQuery = FIXTURE_MEASUREMENT_QUERIES[3]!;
  if (volumeQuery.kind !== "volume") throw new Error("fixture shape: [3] must be the volume query");

  test("a measurement WITHOUT a declared tolerance refuses (the P0-B law, delegated)", () => {
    const query: MeasurementQuery = {
      queryId: "query-no-tolerance",
      kind: "line",
      fromElementId: lineQuery.fromElementId,
      toElementId: lineQuery.toElementId,
      tolerance: { linear: 0, angular: 0 },
      units: FIXTURE_UNITS,
    };
    const outcome = runMeasurementQueries(FIXTURE_WORLD, [query]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("operation-semantic-failure");
      expect(outcome.failure.detail).toContain("tolerance-must-be-declared");
    }
  });

  test("a measurement referencing an UNKNOWN element refuses", () => {
    const query: MeasurementQuery = {
      queryId: "query-unknown-element",
      kind: "point",
      elementId: "no-such-element",
      tolerance: FIXTURE_TOLERANCE,
      units: FIXTURE_UNITS,
    };
    const outcome = runMeasurementQueries(FIXTURE_WORLD, [query]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toContain("unknown element");
    }
  });

  test("duplicate query ids refuse (idempotent query identity)", () => {
    const outcome = runMeasurementQueries(FIXTURE_WORLD, [
      FIXTURE_MEASUREMENT_QUERIES[0]!,
      FIXTURE_MEASUREMENT_QUERIES[0]!,
    ]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("duplicate query id");
    }
  });

  test("an area query without a polygon shape refuses", () => {
    const query: MeasurementQuery = {
      queryId: "query-area-bad",
      kind: "area",
      elementId: areaQuery.elementId,
      declaredPolygon: { kind: "point", name: null, at: { x: 0, y: 0, z: 0 } },
      tolerance: FIXTURE_TOLERANCE,
      units: FIXTURE_UNITS,
    };
    const outcome = runMeasurementQueries(FIXTURE_WORLD, [query]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("polygon");
    }
  });

  test("a volume query with an inverted box refuses (malformed geometry never computes)", () => {
    const query: MeasurementQuery = {
      queryId: "query-volume-inverted",
      kind: "volume",
      elementId: volumeQuery.elementId,
      declaredBox: {
        kind: "box",
        name: null,
        min: { x: 5, y: 0, z: 0 },
        max: { x: 1, y: 4, z: 5 },
      },
      tolerance: FIXTURE_TOLERANCE,
      units: FIXTURE_UNITS,
    };
    const outcome = runMeasurementQueries(FIXTURE_WORLD, [query]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
    }
  });
});

/* ------------------------------------------------------------------ */
/* The kernel vocabulary checks                                         */
/* ------------------------------------------------------------------ */

describe("compare family — vocabularies + kernels", () => {
  test("the difference-classification vocabulary is closed", () => {
    expect(DIFFERENCE_CLASSIFICATIONS).toEqual([
      "missing-in-capture",
      "missing-in-model",
      "deviation-detected",
      "within-tolerance",
      "unverifiable",
    ]);
    for (const classification of DIFFERENCE_CLASSIFICATIONS) {
      expect(isDifferenceClassification(classification)).toBe(true);
    }
    expect(isDifferenceClassification("missing")).toBe(false);
  });

  test("the measurement query-kind vocabulary is closed (point/line/area/volume/containment)", () => {
    expect(MEASUREMENT_QUERY_KINDS).toEqual([
      "point",
      "line",
      "area",
      "volume",
      "point-in-region",
    ]);
    for (const kind of MEASUREMENT_QUERY_KINDS) {
      expect(isMeasurementQueryKind(kind)).toBe(true);
    }
    expect(isMeasurementQueryKind("angle")).toBe(false);
  });

  test("the centroid proxy kernel is exact for every shape kind (integer fixtures)", () => {
    expect(
      shapeCentroidOf({ kind: "point", name: null, at: { x: 3, y: 4, z: 5 } }),
    ).toEqual([3, 4, 5]);
    expect(
      shapeCentroidOf({
        kind: "segment",
        name: null,
        a: { x: 0, y: 0, z: 0 },
        b: { x: 10, y: 0, z: 0 },
      }),
    ).toEqual([5, 0, 0]);
    expect(
      shapeCentroidOf({
        kind: "box",
        name: null,
        min: { x: 0, y: 0, z: 0 },
        max: { x: 4, y: 4, z: 4 },
      }),
    ).toEqual([2, 2, 2]);
    expect(
      shapeCentroidOf({
        kind: "polygon",
        name: null,
        vertices: [
          { x: 0, y: 0, z: 0 },
          { x: 4, y: 0, z: 0 },
          { x: 4, y: 4, z: 0 },
          { x: 0, y: 4, z: 0 },
        ],
      }),
    ).toEqual([2, 2, 0]);
  });

  test("the standalone kernels are exact on the P0-B-style integer corpus", () => {
    expect(polygonAreaXy([
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 4, z: 0 },
      { x: 0, y: 4, z: 0 },
    ])).toBe(16);
    expect(boxVolume({ x: 0, y: 0, z: 0 }, { x: 2, y: 3, z: 5 })).toBe(30);
    expect(pointDistance([0, 0, 0], [3, 4, 0])).toBe(5);
    // containment: inside far from the boundary → true; near → within-tolerance
    const inside = pointInRegionXy(
      [2, 2],
      [
        { x: 0, y: 0, z: 0 },
        { x: 8, y: 0, z: 0 },
        { x: 8, y: 8, z: 0 },
        { x: 0, y: 8, z: 0 },
      ],
      0.05,
    );
    expect(inside.verdict).toBe(true);
    expect(inside.signedDistance).toBe(2);
    const nearEdge = pointInRegionXy(
      [0, 2],
      [
        { x: 0, y: 0, z: 0 },
        { x: 8, y: 0, z: 0 },
        { x: 8, y: 8, z: 0 },
        { x: 0, y: 8, z: 0 },
      ],
      0.05,
    );
    expect(nearEdge.verdict).toBe("within-tolerance");
  });
});
