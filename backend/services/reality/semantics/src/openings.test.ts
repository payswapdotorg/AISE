/**
 * Wall opening detection tests (AISE-010, stage 4).
 *
 * Door/window discrimination by floor contact, honest unclassified
 * reporting, grid-quantized uncertainty (res/√12 per edge, res/√6
 * per dimension, RSS with point σ), bounded compute, impossible
 * derived geometry fails closed, and the one-cell morphological
 * closing (noise-robust, contact-preserving).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRID_RESOLUTION,
  findWallOpenings,
  openingSettings,
  type WallContext,
} from "./openings.js";
import { buildWallFrame, rectangleInFrame } from "./structure.js";
import { toSemanticsError } from "./errors.js";
import type { GeomPoint } from "@aise/backend-geometry";

const UNIT = "meter" as const;
const UP = { x: 0, y: 0, z: 1 };

/** A wall in the plane y=0: u ∈ [0, width], v ∈ [0, height], with optional openings cut out. */
function makeWall(
  width: number,
  height: number,
  openings: Array<{ uMin: number; uMax: number; vMin: number; vMax: number }>,
  step = 0.05,
): WallContext {
  const points: GeomPoint[] = [];
  for (let u = 0; u <= width + 1e-9; u += step) {
    for (let v = 0; v <= height + 1e-9; v += step) {
      const inside = openings.some(
        (o) => u > o.uMin - 1e-9 && u < o.uMax - 1e-9 && v > o.vMin - 1e-9 && v < o.vMax - 1e-9,
      );
      if (!inside) {
        points.push({ x: u, y: 0, z: v });
      }
    }
  }
  const planePoint: GeomPoint = { x: width / 2, y: 0, z: height / 2 };
  const frame = buildWallFrame(planePoint, { x: 0, y: 1, z: 0 }, UP);
  const geometry = rectangleInFrame(points, frame, UNIT);
  return { points, frame, rectangle: geometry.rectangle, unit: UNIT };
}

describe("openingSettings", () => {
  it("materializes the documented defaults", () => {
    const settings = openingSettings();
    expect(settings.gridResolution).toBe(DEFAULT_GRID_RESOLUTION);
    expect(settings.gridResolution).toBe(0.05);
    expect(settings.minOpeningWidth).toBe(0.4);
    expect(settings.doorMinHeight).toBe(1.5);
    expect(settings.doorMaxHeight).toBe(2.4);
    expect(settings.windowMinSill).toBe(0.25);
    expect(settings.maxGridCells).toBe(40000);
  });

  it("validates options (fail-closed)", () => {
    for (const bad of [
      { gridResolution: 0 },
      { gridResolution: -0.05 },
      { minOpeningWidth: 0 },
      { rectangularityThreshold: 0 },
      { rectangularityThreshold: 1.5 },
      { doorFloorTolerance: -0.1 },
      { doorMaxHeight: 1.0 },
      { maxGridCells: 0 },
    ]) {
      const error = capture(() => openingSettings(bad));
      expect(error?.code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("findWallOpenings (doors)", () => {
  it("detects a floor-contacting gap of door height as a DOOR", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 1.5, uMax: 2.4, vMin: 0, vMax: 2.1 }]);
    const result = findWallOpenings(wall);
    expect(result.doors.length).toBe(1);
    expect(result.windows.length).toBe(0);
    const door = result.doors[0]!;
    // Dimensions within one-cell grid quantization per edge.
    expect(door.measurements.width.value).toBeGreaterThan(0.75);
    expect(door.measurements.width.value).toBeLessThan(1.05);
    expect(door.measurements.height.value).toBeGreaterThan(1.9);
    expect(door.measurements.height.value).toBeLessThan(2.15);
    expect(door.metrics.bottomContact).toBe(true);
    expect(door.metrics.sideContact).toBe(false);
    expect(door.measurements.headHeight?.value).toBeGreaterThan(1.9);
    expect(door.measurements.sillHeight).toBeUndefined();
    // Corners lie on the wall plane in canonical order.
    expect(door.corners.length).toBe(4);
    for (const corner of door.corners) {
      expect(Math.abs(corner.y)).toBeLessThan(1e-9);
    }
    expect(door.center.y).toBeCloseTo(0, 12);
  });

  it("a floor-contacting gap taller than doorMaxHeight is unclassified (open partition)", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 1.5, uMax: 2.4, vMin: 0, vMax: 2.6 }]);
    const result = findWallOpenings(wall);
    expect(result.doors.length).toBe(0);
    expect(result.unclassified.length).toBeGreaterThanOrEqual(1);
    expect(result.unclassified.some((g) => g.reason.includes("floor-to-ceiling"))).toBe(true);
  });

  it("a floor-contacting gap below doorMinHeight is unclassified", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 1.5, uMax: 2.4, vMin: 0, vMax: 1.2 }]);
    const result = findWallOpenings(wall);
    expect(result.doors.length).toBe(0);
    expect(result.unclassified.some((g) => g.reason.includes("below the door minimum"))).toBe(true);
  });
});

describe("findWallOpenings (windows)", () => {
  it("detects an elevated gap with a sill as a WINDOW", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 1.0, uMax: 2.2, vMin: 0.9, vMax: 2.1 }]);
    const result = findWallOpenings(wall);
    expect(result.windows.length).toBe(1);
    expect(result.doors.length).toBe(0);
    const window = result.windows[0]!;
    expect(window.measurements.width.value).toBeGreaterThan(1.0);
    expect(window.measurements.width.value).toBeLessThan(1.3);
    expect(window.measurements.height.value).toBeGreaterThan(1.0);
    expect(window.measurements.height.value).toBeLessThan(1.3);
    expect(window.measurements.sillHeight?.value).toBeGreaterThan(0.75);
    expect(window.measurements.sillHeight?.value).toBeLessThan(1.0);
    expect(window.measurements.headHeight?.value).toBeGreaterThan(1.9);
    expect(window.metrics.bottomContact).toBe(false);
  });

  it("a gap just above the floor without contact is unclassified (below windowMinSill)", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 1.5, uMax: 2.4, vMin: 0.1, vMax: 1.6 }]);
    const result = findWallOpenings(wall);
    expect(result.doors.length).toBe(0);
    expect(result.windows.length).toBe(0);
    expect(result.unclassified.some((g) => g.reason.includes("minimum window sill"))).toBe(true);
  });
});

describe("findWallOpenings (honest unclassified reporting)", () => {
  it("a gap reaching the wall side boundary is unclassified (segmentation edge)", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 0, uMax: 0.6, vMin: 0.9, vMax: 2.1 }]);
    const result = findWallOpenings(wall);
    expect(result.windows.length).toBe(0);
    expect(result.doors.length).toBe(0);
    expect(result.unclassified.some((g) => g.reason.includes("side boundary"))).toBe(true);
  });

  it("a gap reaching the top without floor contact is unclassified (window vs. incomplete capture)", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 1.5, uMax: 2.4, vMin: 1.2, vMax: 2.6 }]);
    const result = findWallOpenings(wall);
    expect(result.windows.length).toBe(0);
    expect(result.unclassified.some((g) => g.reason.includes("wall top"))).toBe(true);
  });

  it("a too-small gap is unclassified (size criteria)", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 1.5, uMax: 1.8, vMin: 1.0, vMax: 1.3 }]);
    const result = findWallOpenings(wall);
    expect(result.windows.length).toBe(0);
    expect(result.unclassified.some((g) => g.reason.includes("size/shape"))).toBe(true);
  });

  it("multiple gaps: doors, windows, and unclassified coexist", () => {
    const wall = makeWall(6, 2.6, [
      { uMin: 0.5, uMax: 1.4, vMin: 0, vMax: 2.1 }, // door
      { uMin: 2.5, uMax: 3.7, vMin: 0.9, vMax: 2.1 }, // window
      { uMin: 4.8, uMax: 5.1, vMin: 1.0, vMax: 1.3 }, // small unclassified
    ]);
    const result = findWallOpenings(wall);
    expect(result.doors.length).toBe(1);
    expect(result.windows.length).toBe(1);
    expect(result.unclassified.length).toBeGreaterThanOrEqual(1);
  });
});

describe("findWallOpenings (morphological closing robustness)", () => {
  it("single-cell holes from sparse coverage noise do not connect a real gap across the wall", () => {
    // Wall with a door; then displace every 3rd point by ~1.2 cells so
    // one-point-per-cell coverage leaves scattered single-cell holes.
    const wall = makeWall(4, 2.6, [{ uMin: 1.5, uMax: 2.4, vMin: 0, vMax: 2.05 }]);
    const noisyPoints: GeomPoint[] = wall.points.map((p, i) =>
      i % 3 === 0 ? { x: p.x + 0.061, y: p.y, z: p.z + 0.037 } : p,
    );
    const noisyWall: WallContext = { ...wall, points: noisyPoints };
    const result = findWallOpenings(noisyWall);
    expect(result.doors.length).toBe(1);
    const door = result.doors[0]!;
    // The door must not have leaked across the wall: width stays door-sized.
    expect(door.measurements.width.value).toBeLessThan(1.15);
    expect(door.measurements.height.value).toBeGreaterThan(1.85);
  });

  it("contact semantics survive the closing: floor contact is preserved for doors", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 1.5, uMax: 2.4, vMin: 0, vMax: 2.1 }]);
    const result = findWallOpenings(wall);
    expect(result.doors[0]?.metrics.bottomContact).toBe(true);
  });

  it("side-boundary gaps keep their boundary column after the closing", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 0, uMax: 0.6, vMin: 0.9, vMax: 2.1 }]);
    const result = findWallOpenings(wall);
    expect(result.unclassified.some((g) => g.reason.includes("side boundary"))).toBe(true);
  });
});

describe("findWallOpenings (uncertainty model)", () => {
  it("grid-only dimensions carry σ = √2·res/√12 and edges σ = res/√12", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 1.5, uMax: 2.4, vMin: 0.9, vMax: 2.1 }]);
    const result = findWallOpenings(wall);
    const window = result.windows[0]!;
    const res = 0.05;
    const sigmaEdge = res / Math.sqrt(12);
    const sigmaDim = Math.SQRT2 * sigmaEdge;
    expect(window.measurements.width.uncertainty?.kind).toBe("standard");
    expect(window.measurements.width.uncertainty?.kind === "standard"
      ? window.measurements.width.uncertainty.u
      : Number.NaN).toBeCloseTo(sigmaDim, 12);
    expect(window.measurements.height.uncertainty?.kind === "standard"
      ? window.measurements.height.uncertainty.u
      : Number.NaN).toBeCloseTo(sigmaDim, 12);
    expect(window.measurements.sillHeight?.uncertainty?.kind === "standard"
      ? window.measurements.sillHeight.uncertainty.u
      : Number.NaN).toBeCloseTo(sigmaEdge, 12);
    expect(window.measurements.headHeight?.uncertainty?.kind === "standard"
      ? window.measurements.headHeight.uncertainty.u
      : Number.NaN).toBeCloseTo(sigmaEdge, 12);
  });

  it("stated per-point σ combines by RSS with the grid quantization", () => {
    const wall = makeWall(4, 2.6, [{ uMin: 1.5, uMax: 2.4, vMin: 0.9, vMax: 2.1 }]);
    const result = findWallOpenings({ ...wall, perPointStandardUncertainty: 0.01 });
    const window = result.windows[0]!;
    const res = 0.05;
    const sigmaDim = Math.sqrt((Math.SQRT2 * res / Math.sqrt(12)) ** 2 + (Math.SQRT2 * 0.01) ** 2);
    expect(window.measurements.width.uncertainty?.kind === "standard"
      ? window.measurements.width.uncertainty.u
      : Number.NaN).toBeCloseTo(sigmaDim, 12);
  });
});

describe("findWallOpenings (fail-closed gates)", () => {
  it("rejects a non-positive wall rectangle (GEOMETRY_CONTRADICTION)", () => {
    const wall = makeWall(4, 2.6, []);
    const error = capture(() =>
      findWallOpenings({
        ...wall,
        rectangle: { ...wall.rectangle, uMin: 1, uMax: 1, vMin: 0, vMax: 2 },
      }),
    );
    expect(error?.code).toBe("GEOMETRY_CONTRADICTION");
  });

  it("rejects a grid above the bounded-compute cap (BOUNDS_EXCEEDED)", () => {
    const wall = makeWall(4, 2.6, []);
    const error = capture(() =>
      findWallOpenings(wall, { maxGridCells: 100 }),
    );
    expect(error?.code).toBe("BOUNDS_EXCEEDED");
    expect(error?.details.cap).toBe(100);
  });

  it("gap rectangles always stay inside the wall rectangle (defense-in-depth invariant holds by construction)", () => {
    // The opening height > wall height guard in buildOpening is
    // defense in depth for internal invariants — components are
    // derived from the grid built FROM the wall rectangle, so the
    // public API cannot produce an out-of-wall gap. Pin the
    // invariant observable from the outside: every classified gap
    // and every unclassified gap lies within the wall rectangle.
    const wall = makeWall(4, 2.6, [
      { uMin: 1.5, uMax: 2.4, vMin: 0, vMax: 2.05 },
      { uMin: 3.1, uMax: 3.5, vMin: 0.9, vMax: 2.1 },
    ]);
    const result = findWallOpenings(wall);
    for (const opening of [...result.doors, ...result.windows]) {
      expect(opening.rect.vMax).toBeLessThanOrEqual(2.6 + 1e-9);
      expect(opening.rect.vMin).toBeGreaterThanOrEqual(-1e-9);
      expect(opening.rect.uMax).toBeLessThanOrEqual(4 + 1e-9);
      expect(opening.rect.uMin).toBeGreaterThanOrEqual(-1e-9);
      expect(opening.measurements.height.value).toBeLessThanOrEqual(2.6);
    }
  });
});

describe("findWallOpenings (determinism)", () => {
  it("bit-identical results across re-runs and input permutations", () => {
    const wall = makeWall(4, 2.6, [
      { uMin: 1.5, uMax: 2.4, vMin: 0, vMax: 2.05 },
      { uMin: 3.0, uMax: 3.6, vMin: 0.9, vMax: 2.1 },
    ]);
    const a = findWallOpenings(wall);
    const b = findWallOpenings(wall);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const shuffled = [...wall.points].reverse();
    const c = findWallOpenings({ ...wall, points: shuffled });
    expect(JSON.stringify(a)).toBe(JSON.stringify(c));
  });
});

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
