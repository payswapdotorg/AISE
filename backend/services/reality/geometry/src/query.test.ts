/**
 * Query tests (AISE-009): entity construction, distance and angle
 * conventions, unit discipline, epistemic derivation, uncertainty
 * propagation, provenance.
 */
import { describe, expect, it } from "vitest";
import { defineLine, definePlane, definePoint } from "./query/entities.js";
import {
  distancePointToLine,
  distancePointToPlane,
  distancePointToPoint,
  signedDistancePointToPlane,
} from "./query/distance.js";
import { angleLineToLine, angleLineToPlane, anglePlaneToPlane } from "./query/angle.js";
import { convertMeasurement } from "./uncertainty.js";
import { GeometryError } from "./errors.js";

const METER = { unit: "meter" as const };
const MM = { unit: "millimeter" as const };

describe("entity construction (fail closed)", () => {
  it("constructs validated entities with explicit units", () => {
    const point = definePoint({ x: 1, y: 2, z: 3 }, { ...METER, epistemic: "OBSERVED" });
    expect(point.unit).toBe("meter");
    expect(point.epistemic).toBe("OBSERVED");
    const line = defineLine({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, METER);
    expect(line.direction).toEqual({ x: 1, y: 0, z: 0 });
    const plane = definePlane({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 3 }, METER);
    expect(plane.normal).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("defaults the epistemic declaration to INFERRED (fail-closed default)", () => {
    const point = definePoint({ x: 0, y: 0, z: 0 }, METER);
    expect(point.epistemic).toBe("INFERRED");
  });

  it("rejects non-finite coordinates and zero vectors", () => {
    expect(() => definePoint({ x: Number.NaN, y: 0, z: 0 }, METER)).toThrow(GeometryError);
    expect(() => defineLine({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, METER)).toThrow(GeometryError);
    expect(() => definePlane({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, METER)).toThrow(GeometryError);
    try {
      defineLine({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, METER);
    } catch (error) {
      expect((error as GeometryError).code).toBe("ZERO_VECTOR");
    }
  });

  it("rejects invalid epistemic declarations and non-positive uncertainties", () => {
    expect(() => definePoint({ x: 0, y: 0, z: 0 }, { ...METER, epistemic: "GUESSED" as never })).toThrow(
      GeometryError,
    );
    expect(() =>
      definePoint({ x: 0, y: 0, z: 0 }, { ...METER, standardUncertainty: -1 }),
    ).toThrow(GeometryError);
    expect(() =>
      defineLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { ...METER, directionStandardUncertainty: 0 }),
    ).toThrow(GeometryError);
  });
});

describe("point-to-point distance", () => {
  it("measures known distances with units and provenance", () => {
    const a = definePoint({ x: 0, y: 0, z: 0 }, METER);
    const b = definePoint({ x: 3, y: 4, z: 0 }, METER);
    const measurement = distancePointToPoint(a, b);
    expect(measurement.value).toBeCloseTo(5, 12);
    expect(measurement.unit).toBe("meter");
    expect(measurement.epistemic).toBe("INFERRED");
    expect(measurement.provenance.method).toBe("distance/point-point");
    expect(measurement.provenance.inputs).toHaveLength(2);
  });

  it("fails closed on mismatched units", () => {
    const a = definePoint({ x: 0, y: 0, z: 0 }, METER);
    const b = definePoint({ x: 3, y: 4, z: 0 }, MM);
    expect(() => distancePointToPoint(a, b)).toThrow(GeometryError);
  });

  it("propagates uncertainty only when BOTH points state σ", () => {
    const a = definePoint({ x: 0, y: 0, z: 0 }, { ...METER, standardUncertainty: 0.3 });
    const b = definePoint({ x: 3, y: 4, z: 0 }, { ...METER, standardUncertainty: 0.4 });
    const both = distancePointToPoint(a, b);
    expect(both.uncertainty).toEqual({ kind: "standard", u: 0.5 });

    const c = definePoint({ x: 3, y: 4, z: 0 }, METER);
    const oneMissing = distancePointToPoint(a, c);
    expect(oneMissing.uncertainty).toBeUndefined();
  });

  it("derives the weakest epistemic state", () => {
    const observed = definePoint({ x: 0, y: 0, z: 0 }, { ...METER, epistemic: "OBSERVED" });
    const inferred = definePoint({ x: 3, y: 4, z: 0 }, { ...METER, epistemic: "INFERRED" });
    const proposed = definePoint({ x: 0, y: 0, z: 0 }, { ...METER, epistemic: "PROPOSED" });
    const confirmed = definePoint({ x: 3, y: 4, z: 0 }, { ...METER, epistemic: "CONFIRMED" });
    expect(distancePointToPoint(observed, confirmed).epistemic).toBe("CONFIRMED");
    expect(distancePointToPoint(observed, inferred).epistemic).toBe("INFERRED");
    expect(distancePointToPoint(observed, proposed).epistemic).toBe("PROPOSED");
  });
});

describe("point-to-line distance", () => {
  it("measures the perpendicular distance to the infinite line", () => {
    const point = definePoint({ x: 10, y: 3, z: 4 }, METER);
    const line = defineLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, METER);
    const measurement = distancePointToLine(point, line);
    expect(measurement.value).toBeCloseTo(5, 12);
    expect(measurement.provenance.method).toBe("distance/point-line");
  });

  it("ignores the anchor's position along the line direction", () => {
    const point = definePoint({ x: 0, y: 5, z: 0 }, METER);
    const line = defineLine({ x: 1000, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, METER);
    expect(distancePointToLine(point, line).value).toBeCloseTo(5, 12);
  });

  it("propagates with the along-axis lever arm", () => {
    // Point 100 along +x from the anchor; direction σ 0.001 rad →
    // lever contribution 0.1; point/anchor σ 0.1 each.
    const point = definePoint({ x: 100, y: 0, z: 0 }, { ...METER, standardUncertainty: 0.1 });
    const line = defineLine(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { ...METER, standardUncertainty: 0.1, directionStandardUncertainty: 0.001 },
    );
    const measurement = distancePointToLine(point, line);
    expect(measurement.uncertainty).toEqual({
      kind: "standard",
      u: Math.sqrt(0.1 * 0.1 + 0.1 * 0.1 + 0.1 * 0.1),
    });
  });

  it("fails closed on mismatched units", () => {
    const point = definePoint({ x: 0, y: 1, z: 0 }, METER);
    const line = defineLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, MM);
    expect(() => distancePointToLine(point, line)).toThrow(GeometryError);
  });
});

describe("point-to-plane distance", () => {
  it("returns signed distance positive toward the normal", () => {
    const point = definePoint({ x: 1, y: 2, z: 7 }, METER);
    const plane = definePlane({ x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: 1 }, METER);
    const signed = signedDistancePointToPlane(point, plane);
    expect(signed.value).toBeCloseTo(4, 12);
    expect(signed.provenance.method).toBe("distance/point-plane-signed");
    expect(signed.provenance.parameters).toMatchObject({ sign: "positive-toward-normal" });
  });

  it("returns negative distance behind the normal", () => {
    const point = definePoint({ x: 1, y: 2, z: 1 }, METER);
    const plane = definePlane({ x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: 1 }, METER);
    const signed = signedDistancePointToPlane(point, plane);
    expect(signed.value).toBeCloseTo(-2, 12);
    const unsigned = distancePointToPlane(point, plane);
    expect(unsigned.value).toBeCloseTo(2, 12);
    expect(unsigned.provenance.parameters).toMatchObject({ sign: "unsigned" });
  });

  it("flips sign with the normal orientation (the sign is the caller's convention)", () => {
    const point = definePoint({ x: 0, y: 0, z: 8 }, METER);
    const up = definePlane({ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 1 }, METER);
    const down = definePlane({ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: -1 }, METER);
    expect(signedDistancePointToPlane(point, up).value).toBeCloseTo(6, 12);
    expect(signedDistancePointToPlane(point, down).value).toBeCloseTo(-6, 12);
  });

  it("propagates with the in-plane lever arm", () => {
    // Point at in-plane offset (3,4) from the anchor: lever 5.
    const point = definePoint({ x: 3, y: 4, z: 0 }, { ...METER, standardUncertainty: 0.1 });
    const plane = definePlane(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { ...METER, standardUncertainty: 0.1, normalStandardUncertainty: 0.02 },
    );
    const measurement = signedDistancePointToPlane(point, plane);
    const expected = Math.sqrt(0.1 * 0.1 + 0.1 * 0.1 + (5 * 0.02) ** 2);
    expect(measurement.uncertainty).toEqual({ kind: "standard", u: expected });
  });
});

describe("angle conventions", () => {
  it("line↔line: acute angle for undirected lines (0 for parallel, π/2 for orthogonal)", () => {
    const a = defineLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, METER);
    const parallel = defineLine({ x: 0, y: 5, z: 0 }, { x: 2, y: 0, z: 0 }, METER);
    const opposite = defineLine({ x: 0, y: 5, z: 0 }, { x: -3, y: 0, z: 0 }, METER);
    const orthogonal = defineLine({ x: 10, y: 10, z: 10 }, { x: 0, y: 1, z: 0 }, METER);
    expect(angleLineToLine(a, parallel).value).toBeCloseTo(0, 12);
    expect(angleLineToLine(a, opposite).value).toBeCloseTo(0, 12);
    expect(angleLineToLine(a, orthogonal).value).toBeCloseTo(Math.PI / 2, 12);
  });

  it("line↔line: 45° diagonal", () => {
    const a = defineLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, METER);
    const b = defineLine({ x: 0, y: 0, z: 5 }, { x: 1, y: 1, z: 0 }, METER);
    expect(angleLineToLine(a, b).value).toBeCloseTo(Math.PI / 4, 12);
  });

  it("line↔plane: 0 for in-plane, π/2 for perpendicular, asin for the diagonal case", () => {
    const inPlane = defineLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, METER);
    const plane = definePlane({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, METER);
    const perpendicular = defineLine({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, METER);
    const diagonal = defineLine({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 1 }, METER);
    expect(angleLineToPlane(inPlane, plane).value).toBeCloseTo(0, 12);
    expect(angleLineToPlane(perpendicular, plane).value).toBeCloseTo(Math.PI / 2, 12);
    expect(angleLineToPlane(diagonal, plane).value).toBeCloseTo(Math.PI / 4, 12);
  });

  it("plane↔plane: 0 for parallel (any normal orientation), π/2 for orthogonal", () => {
    const a = definePlane({ x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: 1 }, METER);
    const parallel = definePlane({ x: 1, y: 1, z: -2 }, { x: 0, y: 0, z: 7 }, METER);
    const antiParallel = definePlane({ x: 1, y: 1, z: -2 }, { x: 0, y: 0, z: -5 }, METER);
    const orthogonal = definePlane({ x: 5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, METER);
    expect(anglePlaneToPlane(a, parallel).value).toBeCloseTo(0, 12);
    expect(anglePlaneToPlane(a, antiParallel).value).toBeCloseTo(0, 12);
    expect(anglePlaneToPlane(a, orthogonal).value).toBeCloseTo(Math.PI / 2, 12);
  });

  it("angles carry the radian unit and convert to degrees", () => {
    const a = defineLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, METER);
    const b = defineLine({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, METER);
    const measurement = angleLineToLine(a, b);
    expect(measurement.unit).toBe("radian");
    const degrees = convertMeasurement(measurement, "degree");
    expect(degrees.value).toBeCloseTo(90, 12);
    expect(degrees.unit).toBe("degree");
  });

  it("propagates angle uncertainty when both directions state σ", () => {
    const a = defineLine(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { ...METER, directionStandardUncertainty: 0.03 },
    );
    const b = defineLine(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { ...METER, directionStandardUncertainty: 0.04 },
    );
    const measurement = angleLineToLine(a, b);
    expect(measurement.uncertainty).toEqual({ kind: "standard", u: 0.05 });
  });

  it("fails closed on mismatched units", () => {
    const line = defineLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, METER);
    const plane = definePlane({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, MM);
    expect(() => angleLineToPlane(line, plane)).toThrow(GeometryError);
    const planeM = definePlane({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, METER);
    expect(() => angleLineToPlane(line, planeM)).not.toThrow();
  });

  it("derives the weakest epistemic state like distances", () => {
    const observed = defineLine(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { ...METER, epistemic: "OBSERVED" },
    );
    const inferred = defineLine(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { ...METER, epistemic: "INFERRED" },
    );
    expect(angleLineToLine(observed, inferred).epistemic).toBe("INFERRED");
  });
});
