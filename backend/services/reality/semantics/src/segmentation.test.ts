/**
 * Deterministic planar segmentation tests (AISE-010, stage 1).
 *
 * Extraction correctness (single/parallel/perpendicular planes),
 * honest residuals, bounded compute, fail-closed inputs, permutation
 * invariance and bit-identity, provenance and epistemic records.
 */
import { describe, expect, it } from "vitest";
import type { GeomPoint } from "@aise/backend-geometry";
import {
  DEFAULT_INLIER_DISTANCE,
  SEGMENTATION_METHOD,
  SEGMENTATION_SEED,
  segmentPointCloud,
  segmentationSettings,
} from "./segmentation.js";
import { toSemanticsError } from "./errors.js";
import { planeGrid } from "./testing.js";

const UNIT = "meter" as const;
const UP = { x: 0, y: 0, z: 1 };

/** A small horizontal plane grid (n points at z). */
function horizontalGrid(z: number, uCount = 40, vCount = 40, step = 0.05): GeomPoint[] {
  return planeGrid({ x: 0, y: 0, z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, uCount, vCount, step);
}

describe("segmentationSettings", () => {
  it("materializes defaults from the documented constants", () => {
    const settings = segmentationSettings();
    expect(settings.inlierDistance).toBe(DEFAULT_INLIER_DISTANCE);
    expect(settings.inlierDistance).toBe(0.03);
    expect(settings.minClusterPoints).toBe(100);
    expect(settings.refinementRounds).toBe(3);
  });

  it("validates every option (fail-closed VALIDATION_FAILED)", () => {
    for (const bad of [
      { inlierDistance: 0 },
      { inlierDistance: -0.1 },
      { inlierDistance: Number.NaN },
      { minClusterPoints: 0 },
      { minClusterPoints: 2.5 },
      { maxSegments: -1 },
      { refinementRounds: 0 },
    ]) {
      const error = capture(() => segmentationSettings(bad));
      expect(error?.code).toBe("VALIDATION_FAILED");
    }
  });

  it("rejects minClusterPoints > maxSegmentPoints (unsatisfiable)", () => {
    const error = capture(() => segmentationSettings({ minClusterPoints: 500, maxSegmentPoints: 100 }));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details.minClusterPoints).toBe(500);
  });
});

describe("segmentPointCloud (input gates)", () => {
  it("rejects unknown units", () => {
    const error = capture(() =>
      segmentPointCloud({ points: horizontalGrid(0), unit: "furlong" as never }),
    );
    expect(error?.code).toBe("VALIDATION_FAILED");
  });

  it("rejects an invalid source epistemic state", () => {
    const error = capture(() =>
      segmentPointCloud({ points: horizontalGrid(0), unit: UNIT, sourceEpistemic: "GUESSED" as never }),
    );
    expect(error?.code).toBe("VALIDATION_FAILED");
  });

  it("rejects invalid per-point uncertainty", () => {
    for (const bad of [0, -0.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      const error = capture(() =>
        segmentPointCloud({ points: horizontalGrid(0), unit: UNIT, perPointStandardUncertainty: bad }),
      );
      expect(error?.code).toBe("VALIDATION_FAILED");
    }
  });

  it("rejects non-array points", () => {
    const error = capture(() =>
      segmentPointCloud({ points: "nope" as never, unit: UNIT }),
    );
    expect(error?.code).toBe("VALIDATION_FAILED");
  });

  it("rejects fewer points than minClusterPoints (INSUFFICIENT_POINTS)", () => {
    const error = capture(() =>
      segmentPointCloud({ points: horizontalGrid(0, 5, 5), unit: UNIT }, { minClusterPoints: 100 }),
    );
    expect(error?.code).toBe("INSUFFICIENT_POINTS");
    expect(error?.details.required).toBe(100);
    expect(error?.details.actual).toBe(25);
  });

  it("rejects input above the bounded-compute cap (BOUNDS_EXCEEDED)", () => {
    const error = capture(() =>
      segmentPointCloud(
        { points: horizontalGrid(0, 200, 200), unit: UNIT },
        { maxSegmentationPoints: 10000, minClusterPoints: 100 },
      ),
    );
    expect(error?.code).toBe("BOUNDS_EXCEEDED");
    expect(error?.details.cap).toBe(10000);
    expect((error?.details.actual as number) > 10000).toBe(true);
  });

  it("wraps non-finite points as PLANE_FIT_FAILED with preserved cause (fail-closed boundary)", () => {
    const points: GeomPoint[] = horizontalGrid(0);
    points[3] = { x: Number.NaN, y: 0, z: 0 };
    const error = capture(() => segmentPointCloud({ points, unit: UNIT }));
    expect(error?.code).toBe("PLANE_FIT_FAILED");
    const cause = error?.details.cause as Record<string, string>;
    expect(cause.service).toBe("aise.geometry");
    expect(cause.code).toBe("NON_FINITE_INPUT");
  });
});

describe("segmentPointCloud (extraction)", () => {
  it("extracts a single plane as one cluster with embedded AISE-009 lineage", () => {
    const result = segmentPointCloud({ points: horizontalGrid(0), unit: UNIT });
    expect(result.kind).toBe("segmentation");
    expect(result.clusters.length).toBe(1);
    const cluster = result.clusters[0]!;
    expect(cluster.points.length).toBe(1600);
    expect(cluster.planeFit.kind).toBe("plane-fit");
    expect(cluster.planeFit.plane.normal.z).toBeCloseTo(1, 6);
    expect(Math.abs(cluster.planeFit.offsetFromOrigin.value)).toBeCloseTo(0, 6);
    expect(cluster.planeFit.residualStats.rms).toBeCloseTo(0, 6);
    expect(cluster.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cluster.clusterId).toMatch(/^seg-[0-9a-f]{16}$/);
    expect(cluster.epistemicState).toBe("INFERRED");
  });

  it("extracts two parallel planes as two clusters (both surfaces found)", () => {
    const points = [...horizontalGrid(0), ...horizontalGrid(2.7)];
    const result = segmentPointCloud({ points, unit: UNIT });
    expect(result.clusters.length).toBe(2);
    const elevations = result.clusters
      .map((c) => c.planeFit.plane.point.z)
      .sort((a, b) => a - b);
    expect(elevations[0]).toBeCloseTo(0, 3);
    expect(elevations[1]).toBeCloseTo(2.7, 3);
  });

  it("extracts perpendicular planes (floor + wall) as two clusters", () => {
    const floor = horizontalGrid(0);
    const wall = planeGrid({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, UP, 40, 40);
    const result = segmentPointCloud({ points: [...floor, ...wall], unit: UNIT });
    expect(result.clusters.length).toBe(2);
    const normals = result.clusters.map((c) => Math.abs(c.planeFit.plane.normal.z)).sort();
    expect(normals[0]).toBeCloseTo(0, 3);
    expect(normals[1]).toBeCloseTo(1, 3);
  });

  it("respects maxSegments (bounded segments)", () => {
    const points = [
      ...horizontalGrid(0),
      ...horizontalGrid(2.7),
      ...horizontalGrid(5.4),
    ];
    const result = segmentPointCloud({ points, unit: UNIT }, { maxSegments: 2 });
    expect(result.clusters.length).toBeLessThanOrEqual(2);
  });

  it("reports residual points honestly (never silently dropped)", () => {
    // A scattered blob of points that join no plane.
    const noise: GeomPoint[] = [];
    for (let i = 0; i < 150; i += 1) {
      noise.push({ x: (i % 7) * 0.3, y: ((i * 3) % 11) * 0.25, z: 5 + ((i * 5) % 13) * 0.4 });
    }
    const result = segmentPointCloud({ points: [...horizontalGrid(0), ...noise], unit: UNIT });
    expect(result.clusters.length).toBeGreaterThanOrEqual(1);
    expect(result.residualPointCount).toBeGreaterThan(0);
    expect(result.residualPointsContentHash).toMatch(/^[0-9a-f]{64}$/);
    // The residual count and the cluster points account for the whole input.
    const accounted = result.clusters.reduce((n, c) => n + c.points.length, 0) + result.residualPointCount;
    expect(accounted).toBe(horizontalGrid(0).length + noise.length);
  });

  it("rejects a cluster above the maxSegmentPoints cap (BOUNDS_EXCEEDED)", () => {
    const error = capture(() =>
      segmentPointCloud(
        { points: horizontalGrid(0, 120, 120), unit: UNIT },
        { maxSegmentPoints: 5000, minClusterPoints: 100 },
      ),
    );
    expect(error?.code).toBe("BOUNDS_EXCEEDED");
    expect(error?.details.cap).toBe(5000);
  });
});

describe("segmentPointCloud (provenance and epistemic records)", () => {
  it("records method, seed, and materialized settings in the result provenance", () => {
    const result = segmentPointCloud({ points: horizontalGrid(0), unit: UNIT });
    const provenance = result.provenance;
    expect(provenance.serviceId).toBe("aise.semantics");
    expect(provenance.method).toBe(SEGMENTATION_METHOD);
    expect(provenance.methodVersion).toBe("1.0.0");
    expect(provenance.parameters.seed).toBe(SEGMENTATION_SEED);
    expect(provenance.parameters.inputPointCount).toBe(1600);
    expect(provenance.parameters.residualPointCount).toBe(0);
    expect(provenance.inputs.length).toBe(1);
    expect(provenance.inputs[0]?.kind).toBe("point-set");
  });

  it("records the declared source epistemic state in the input reference", () => {
    const result = segmentPointCloud({ points: horizontalGrid(0), unit: UNIT, sourceEpistemic: "PROPOSED" });
    expect(result.provenance.inputs[0]?.epistemic).toBe("PROPOSED");
    // The extraction result itself is still INFERRED (recognition is inference).
    expect(result.epistemicState).toBe("INFERRED");
  });

  it("returns the exact settings used (reproducibility record)", () => {
    const result = segmentPointCloud(
      { points: horizontalGrid(0), unit: UNIT },
      { inlierDistance: 0.05, minClusterPoints: 50 },
    );
    expect(result.settings.inlierDistance).toBe(0.05);
    expect(result.settings.minClusterPoints).toBe(50);
  });
});

describe("segmentPointCloud (determinism)", () => {
  it("bit-identical results across re-runs", () => {
    const a = segmentPointCloud({ points: horizontalGrid(0), unit: UNIT });
    const b = segmentPointCloud({ points: horizontalGrid(0), unit: UNIT });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("permutation invariance: input order never changes the output", () => {
    const points = [...horizontalGrid(0), ...horizontalGrid(2.5)];
    const shuffled = shuffleDeterministic(points);
    const a = segmentPointCloud({ points, unit: UNIT });
    const b = segmentPointCloud({ points: shuffled, unit: UNIT });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

/** Deterministic Fisher–Yates style shuffle (pure test utility). */
function shuffleDeterministic<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = (i * 7919) % (i + 1);
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }
  return copy;
}

/** Captures a SemanticsError from a throwing callback. */
function capture(fn: () => unknown): ReturnType<typeof toSemanticsError> {
  try {
    fn();
  } catch (error) {
    const semantics = toSemanticsError(error);
    expect(semantics, "expected a SemanticsError").not.toBeNull();
    return semantics;
  }
  throw new Error("expected the call to throw");
}

void UP;
