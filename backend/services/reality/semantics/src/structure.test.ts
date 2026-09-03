/**
 * Structured geometry tests (AISE-010, stage 3).
 *
 * Frame conventions (pinned, documented, tested): wall U horizontal
 * and V up; horizontal frames pure functions of the normal;
 * rectangle corners in canonical order; first-order uncertainty
 * (√2·σ extents, RSS area); degeneracy fails closed.
 */
import { describe, expect, it } from "vitest";
import {
  buildHorizontalFrame,
  buildWallFrame,
  rectangleInFrame,
  squareUnitOf,
  type PlaneFrame,
} from "./structure.js";
import { toSemanticsError } from "./errors.js";
import { planeGrid } from "./testing.js";
import type { GeomPoint } from "@aise/backend-geometry";

const UP = { x: 0, y: 0, z: 1 };
const UNIT = "meter" as const;

function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function norm(a: { x: number; y: number; z: number }): number {
  return Math.sqrt(dot(a, a));
}

describe("squareUnitOf", () => {
  it("maps every length unit to its square counterpart", () => {
    expect(squareUnitOf("meter")).toBe("square_meter");
    expect(squareUnitOf("millimeter")).toBe("square_millimeter");
    expect(squareUnitOf("centimeter")).toBe("square_centimeter");
    expect(squareUnitOf("inch")).toBe("square_inch");
    expect(squareUnitOf("foot")).toBe("square_foot");
  });
});

describe("buildWallFrame", () => {
  const planePoint: GeomPoint = { x: 2, y: 0, z: 1.3 };
  const normal = { x: 0, y: 1, z: 0 };

  it("U is in-plane horizontal, V is in-plane vertical pointing up", () => {
    const frame = buildWallFrame(planePoint, normal, UP);
    expect(Math.abs(dot(frame.axisU, UP))).toBeLessThan(1e-12);
    expect(Math.abs(dot(frame.axisU, normal))).toBeLessThan(1e-12);
    expect(dot(frame.axisV, UP)).toBeGreaterThan(0.999);
    expect(Math.abs(dot(frame.axisV, normal))).toBeLessThan(1e-12);
  });

  it("both axes are unit length and the frame is right-handed with the normal", () => {
    const frame = buildWallFrame(planePoint, normal, UP);
    expect(norm(frame.axisU)).toBeCloseTo(1, 12);
    expect(norm(frame.axisV)).toBeCloseTo(1, 12);
    // normal × U = ±V (construction); V = normal × U with the up-flip.
    const cross = {
      x: normal.y * frame.axisU.z - normal.z * frame.axisU.y,
      y: normal.z * frame.axisU.x - normal.x * frame.axisU.z,
      z: normal.x * frame.axisU.y - normal.y * frame.axisU.x,
    };
    expect(dot(cross, frame.axisV)).toBeCloseTo(1, 9);
  });

  it("works for all four cardinal wall normals (up stays up)", () => {
    for (const wallNormal of [
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
    ]) {
      const frame = buildWallFrame(planePoint, wallNormal, UP);
      expect(dot(frame.axisV, UP)).toBeGreaterThan(0.999);
      expect(Math.abs(dot(frame.axisU, UP))).toBeLessThan(1e-12);
    }
  });

  it("fails closed for a plane normal parallel to up (that plane is horizontal)", () => {
    const error = capture(() => buildWallFrame(planePoint, UP, UP));
    expect(error?.code).toBe("DEGENERATE_GEOMETRY");
    expect(String(error?.details.horizontalNorm)).toContain("0");
  });
});

describe("buildHorizontalFrame", () => {
  it("builds an orthonormal in-plane frame for an exact up normal", () => {
    const frame = buildHorizontalFrame({ x: 1, y: 2, z: 0 }, UP);
    expect(Math.abs(dot(frame.axisU, frame.normal))).toBeLessThan(1e-12);
    expect(Math.abs(dot(frame.axisV, frame.normal))).toBeLessThan(1e-12);
    expect(Math.abs(dot(frame.axisU, frame.axisV))).toBeLessThan(1e-12);
    expect(norm(frame.axisU)).toBeCloseTo(1, 12);
    expect(norm(frame.axisV)).toBeCloseTo(1, 12);
  });

  it("is a pure function of the normal (deterministic frames)", () => {
    const a = buildHorizontalFrame({ x: 0, y: 0, z: 5 }, UP);
    const b = buildHorizontalFrame({ x: 9, y: 9, z: 9 }, UP);
    expect(a.axisU).toEqual(b.axisU);
    expect(a.axisV).toEqual(b.axisV);
  });

  it("handles a tilted (but classifiable) horizontal normal", () => {
    const tilted = { x: 0.087, y: 0, z: 0.996 }; // ~5° tilt
    const frame = buildHorizontalFrame({ x: 0, y: 0, z: 2 }, tilted);
    expect(Math.abs(dot(frame.axisU, tilted))).toBeLessThan(1e-9);
    expect(Math.abs(dot(frame.axisV, tilted))).toBeLessThan(1e-9);
  });
});

describe("rectangleInFrame", () => {
  function wallContext(): { frame: PlaneFrame; points: GeomPoint[] } {
    const planePoint: GeomPoint = { x: 2, y: 0, z: 1.3 };
    const frame = buildWallFrame(planePoint, { x: 0, y: 1, z: 0 }, UP);
    const points = planeGrid(planePoint, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 21, 27, 0.1);
    return { frame, points };
  }

  it("computes extents, center, and corners in canonical order", () => {
    const { frame, points } = wallContext();
    const rect = rectangleInFrame(points, frame, UNIT);
    // u spans −2..0 (x 4..2 along axisU=−x… frame-local), v spans −1.3..+1.3.
    expect(rect.rectangle.uMax - rect.rectangle.uMin).toBeCloseTo(2, 6);
    expect(rect.rectangle.vMax - rect.rectangle.vMin).toBeCloseTo(2.6, 6);
    expect(rect.width.value).toBeCloseTo(2, 6);
    expect(rect.height.value).toBeCloseTo(2.6, 6);
    expect(rect.width.unit).toBe("meter");
    expect(rect.height.unit).toBe("meter");
    expect(rect.area.value).toBeCloseTo(2 * 2.6, 6);
    expect(rect.area.unit).toBe("square_meter");
    const corners = rect.rectangle.corners;
    expect(corners.length).toBe(4);
    // Corner 0 is (uMin, vMin); corner 2 is the opposite corner.
    const c0 = corners[0] as GeomPoint;
    const c2 = corners[2] as GeomPoint;
    expect(Math.hypot(c0.x - c2.x, c0.y - c2.y, c0.z - c2.z)).toBeCloseTo(
      Math.hypot(rect.width.value, rect.height.value),
      6,
    );
    // All corners lie on the wall plane (y = 0 within float tolerance).
    for (const corner of corners) {
      expect(Math.abs(corner.y)).toBeLessThan(1e-9);
    }
    // Center is the midpoint of the diagonal.
    const center = rect.rectangle.center;
    expect(center.x).toBeCloseTo((c0.x + c2.x) / 2, 9);
    expect(center.z).toBeCloseTo((c0.z + c2.z) / 2, 9);
  });

  it("carries √2·σ extent uncertainty and the RSS area uncertainty when σ is stated", () => {
    const { frame, points } = wallContext();
    const sigma = 0.01;
    const rect = rectangleInFrame(points, frame, UNIT, sigma);
    expect(rect.width.uncertainty?.kind).toBe("standard");
    expect(rect.width.uncertainty?.kind === "standard" && rect.width.uncertainty.u).toBeCloseTo(
      Math.SQRT2 * sigma,
      12,
    );
    expect(rect.height.uncertainty?.kind === "standard" && rect.height.uncertainty.u).toBeCloseTo(
      Math.SQRT2 * sigma,
      12,
    );
    const areaSigma =
      rect.area.uncertainty?.kind === "standard" ? rect.area.uncertainty.u : Number.NaN;
    const expected =
      rect.area.value *
      Math.sqrt(
        ((Math.SQRT2 * sigma) / rect.width.value) ** 2 +
        ((Math.SQRT2 * sigma) / rect.height.value) ** 2,
      );
    expect(areaSigma).toBeCloseTo(expected, 12);
  });

  it("omits uncertainty entirely when σ is not stated (never zero, never fabricated)", () => {
    const { frame, points } = wallContext();
    const rect = rectangleInFrame(points, frame, UNIT);
    expect(rect.width.uncertainty).toBeUndefined();
    expect(rect.height.uncertainty).toBeUndefined();
    expect(rect.area.uncertainty).toBeUndefined();
  });

  it("rejects zero points (INSUFFICIENT_POINTS)", () => {
    const { frame } = wallContext();
    const error = capture(() => rectangleInFrame([], frame, UNIT));
    expect(error?.code).toBe("INSUFFICIENT_POINTS");
  });

  it("rejects a collapsed rectangle (DEGENERATE_GEOMETRY)", () => {
    const frame = buildWallFrame({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, UP);
    // Collinear points along V only: zero width.
    const points = planeGrid({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 1, 20, 0.1);
    const error = capture(() => rectangleInFrame(points, frame, UNIT));
    expect(error?.code).toBe("DEGENERATE_GEOMETRY");
  });

  it("rejects non-finite extents (NON_FINITE_INPUT)", () => {
    const frame = buildWallFrame({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, UP);
    const points: GeomPoint[] = [
      { x: 0, y: 0, z: 0 },
      { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
    ];
    const error = capture(() => rectangleInFrame(points, frame, UNIT));
    expect(error?.code).toBe("NON_FINITE_INPUT");
  });

  it("is a pure function of the point SET (order-independent)", () => {
    const { frame, points } = wallContext();
    const reversed = [...points].reverse();
    expect(JSON.stringify(rectangleInFrame(points, frame, UNIT))).toBe(
      JSON.stringify(rectangleInFrame(reversed, frame, UNIT)),
    );
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
