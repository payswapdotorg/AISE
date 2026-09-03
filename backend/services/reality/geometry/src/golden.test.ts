/**
 * Golden fixture tests (AISE-009) — the CRITICAL assurance
 * benchmark: exact synthetic shapes with ground truth and
 * acceptance tolerances. Per the work order:
 * plane, cylinder, parallel lines, orthogonal lines, parallel
 * planes, orthogonal planes, known-distance point pairs.
 */
import { describe, expect, it } from "vitest";
import {
  CYLINDER_EXACT_ACCEPTANCE,
  CYLINDER_NOISY_ACCEPTANCE,
  CYLINDER_OUTLIER_ACCEPTANCE,
  PLANE_EXACT_ACCEPTANCE,
  angleFixtures,
  cylinderGroundTruth,
  cylinderWithOutliers,
  exactCylinderPoints,
  exactPlanePoints,
  knownDistancePairs,
  noisyCylinderPoints,
  noisyPlanePoints,
  planeGroundTruth,
  pointLineDistanceFixtures,
  pointPlaneDistanceFixtures,
} from "./fixtures/golden.js";
import { fitPlane } from "./fitting/plane.js";
import { fitCylinder, fitCylinderRobust } from "./fitting/cylinder.js";
import { defineLine, definePlane, definePoint } from "./query/entities.js";
import {
  angleLineToLine,
  angleLineToPlane,
  anglePlaneToPlane,
} from "./query/angle.js";
import {
  distancePointToLine,
  distancePointToPlane,
  distancePointToPoint,
  signedDistancePointToPlane,
} from "./query/distance.js";

const UNIT = "meter" as const;

describe("golden fixture: plane", () => {
  it("exact fixture: normal, offset, and residuals within acceptance", () => {
    const result = fitPlane({ points: exactPlanePoints(), unit: UNIT });
    const truth = planeGroundTruth();
    const dot =
      result.plane.normal.x * truth.normal.x +
      result.plane.normal.y * truth.normal.y +
      result.plane.normal.z * truth.normal.z;
    expect(Math.abs(Math.abs(dot) - 1)).toBeLessThanOrEqual(PLANE_EXACT_ACCEPTANCE.absoluteTolerance);
    const sign = dot >= 0 ? 1 : -1;
    expect(
      Math.abs(sign * result.offsetFromOrigin.value - truth.offset),
    ).toBeLessThanOrEqual(PLANE_EXACT_ACCEPTANCE.absoluteTolerance);
    expect(result.residualStats.rms).toBeLessThanOrEqual(PLANE_EXACT_ACCEPTANCE.absoluteTolerance);
    expect(result.residualStats.maxAbs).toBeLessThanOrEqual(PLANE_EXACT_ACCEPTANCE.absoluteTolerance);
  });

  it("noisy fixture: within the noisy acceptance bound (0.01)", () => {
    const result = fitPlane({ points: noisyPlanePoints(), unit: UNIT });
    const truth = planeGroundTruth();
    const dot =
      result.plane.normal.x * truth.normal.x +
      result.plane.normal.y * truth.normal.y +
      result.plane.normal.z * truth.normal.z;
    // Angle between fitted and true normal within ~ the noise level.
    expect(Math.acos(Math.min(Math.abs(dot), 1))).toBeLessThan(0.002);
    expect(Math.abs(result.residualStats.rms - 0.01 / Math.sqrt(3))).toBeLessThan(0.01);
  });
});

describe("golden fixture: cylinder", () => {
  it("exact fixture: axis, axis point, radius within acceptance", () => {
    const result = fitCylinder({ points: exactCylinderPoints(), unit: UNIT });
    const truth = cylinderGroundTruth();
    const axisDot =
      result.cylinder.axis.x * truth.axis.x +
      result.cylinder.axis.y * truth.axis.y +
      result.cylinder.axis.z * truth.axis.z;
    expect(Math.acos(Math.min(Math.abs(axisDot), 1))).toBeLessThan(
      CYLINDER_EXACT_ACCEPTANCE.axisAngleTolerance,
    );
    expect(Math.abs(result.cylinder.radius - truth.radius)).toBeLessThanOrEqual(
      CYLINDER_EXACT_ACCEPTANCE.radiusTolerance,
    );
    expect(Math.abs(result.cylinder.axisPoint.x - truth.axisPoint.x)).toBeLessThanOrEqual(
      CYLINDER_EXACT_ACCEPTANCE.centerTolerance,
    );
    expect(Math.abs(result.cylinder.axisPoint.y - truth.axisPoint.y)).toBeLessThanOrEqual(
      CYLINDER_EXACT_ACCEPTANCE.centerTolerance,
    );
    expect(result.residualStats.rms).toBeLessThan(CYLINDER_EXACT_ACCEPTANCE.radiusTolerance);
  });

  it("noisy fixture: within the noisy acceptance bounds", () => {
    const result = fitCylinder({ points: noisyCylinderPoints(), unit: UNIT });
    const truth = cylinderGroundTruth();
    expect(Math.abs(result.cylinder.radius - truth.radius)).toBeLessThanOrEqual(
      CYLINDER_NOISY_ACCEPTANCE.radiusTolerance,
    );
    expect(Math.abs(result.cylinder.axisPoint.x - truth.axisPoint.x)).toBeLessThanOrEqual(
      CYLINDER_NOISY_ACCEPTANCE.centerTolerance,
    );
    expect(Math.abs(result.cylinder.axisPoint.y - truth.axisPoint.y)).toBeLessThanOrEqual(
      CYLINDER_NOISY_ACCEPTANCE.centerTolerance,
    );
    const axisDot =
      result.cylinder.axis.x * truth.axis.x +
      result.cylinder.axis.y * truth.axis.y +
      result.cylinder.axis.z * truth.axis.z;
    expect(Math.acos(Math.min(Math.abs(axisDot), 1))).toBeLessThan(
      CYLINDER_NOISY_ACCEPTANCE.axisAngleTolerance,
    );
  });

  it("outlier fixture: robust fit recovers the cylinder within acceptance", () => {
    const result = fitCylinderRobust({ points: cylinderWithOutliers(), unit: UNIT });
    const truth = cylinderGroundTruth();
    expect(Math.abs(result.cylinder.radius - truth.radius)).toBeLessThanOrEqual(
      CYLINDER_OUTLIER_ACCEPTANCE.radiusTolerance,
    );
    const axisDot =
      result.cylinder.axis.x * truth.axis.x +
      result.cylinder.axis.y * truth.axis.y +
      result.cylinder.axis.z * truth.axis.z;
    expect(Math.acos(Math.min(Math.abs(axisDot), 1))).toBeLessThan(
      CYLINDER_OUTLIER_ACCEPTANCE.axisAngleTolerance,
    );
    expect(Math.abs(result.cylinder.axisPoint.x - truth.axisPoint.x)).toBeLessThanOrEqual(
      CYLINDER_OUTLIER_ACCEPTANCE.centerTolerance,
    );
    expect(Math.abs(result.cylinder.axisPoint.y - truth.axisPoint.y)).toBeLessThanOrEqual(
      CYLINDER_OUTLIER_ACCEPTANCE.centerTolerance,
    );
    // The PLAIN (non-robust) fit must not do better than the robust
    // fit on this fixture — it either misses the radius or fails
    // closed outright (outlier-polluted normals make the axis
    // ambiguous) — either way the robustness is real, not
    // decorative.
    let plainRadiusError: number;
    try {
      const plain = fitCylinder({ points: cylinderWithOutliers(), unit: UNIT });
      plainRadiusError = Math.abs(plain.cylinder.radius - truth.radius);
    } catch {
      plainRadiusError = Number.POSITIVE_INFINITY; // fail closed: no false cylinder emitted
    }
    expect(plainRadiusError).toBeGreaterThan(Math.abs(result.cylinder.radius - truth.radius));
  });
});

describe("golden fixture: known-distance point pairs", () => {
  for (const pair of knownDistancePairs()) {
    it(`pair ${pair.id}: |measured − truth| ≤ tolerance`, () => {
      const a = definePoint(pair.a, { unit: UNIT });
      const b = definePoint(pair.b, { unit: UNIT });
      const measurement = distancePointToPoint(a, b);
      expect(Math.abs(measurement.value - pair.distance)).toBeLessThanOrEqual(
        pair.absoluteTolerance,
      );
    });
  }

  it("the fixture set includes the required magnitude sweep (1e-3, 1, 5, 1e6 offsets)", () => {
    const ids = knownDistancePairs().map((pair) => pair.id);
    expect(ids).toContain("small-magnitude");
    expect(ids).toContain("large-offset-3-4-5");
    expect(ids).toContain("pythagorean-3-4-5");
  });
});

describe("golden fixture: parallel/orthogonal lines and planes", () => {
  for (const fixture of angleFixtures()) {
    it(`angle fixture ${fixture.id}`, () => {
      if (fixture.kind === "line-line") {
        const a = defineLine(fixture.first.point, fixture.first.vector, { unit: UNIT });
        const b = defineLine(fixture.second.point, fixture.second.vector, { unit: UNIT });
        const measurement = angleLineToLine(a, b);
        expect(Math.abs(measurement.value - fixture.expectedAngle)).toBeLessThanOrEqual(
          fixture.absoluteTolerance,
        );
      } else if (fixture.kind === "line-plane") {
        const line = defineLine(fixture.first.point, fixture.first.vector, { unit: UNIT });
        const plane = definePlane(fixture.second.point, fixture.second.vector, { unit: UNIT });
        const measurement = angleLineToPlane(line, plane);
        expect(Math.abs(measurement.value - fixture.expectedAngle)).toBeLessThanOrEqual(
          fixture.absoluteTolerance,
        );
      } else {
        const a = definePlane(fixture.first.point, fixture.first.vector, { unit: UNIT });
        const b = definePlane(fixture.second.point, fixture.second.vector, { unit: UNIT });
        const measurement = anglePlaneToPlane(a, b);
        expect(Math.abs(measurement.value - fixture.expectedAngle)).toBeLessThanOrEqual(
          fixture.absoluteTolerance,
        );
      }
    });
  }

  it("the fixture set includes the required named cases", () => {
    const ids = angleFixtures().map((fixture) => fixture.id);
    expect(ids).toContain("parallel-lines");
    expect(ids).toContain("orthogonal-lines");
    expect(ids).toContain("parallel-planes");
    expect(ids).toContain("orthogonal-planes");
  });
});

describe("golden fixture: point-to-plane and point-to-line distances", () => {
  for (const fixture of pointPlaneDistanceFixtures()) {
    it(`point-plane ${fixture.id}`, () => {
      const point = definePoint(fixture.point, { unit: UNIT });
      const plane = definePlane(fixture.planePoint, fixture.planeNormal, { unit: UNIT });
      const signed = signedDistancePointToPlane(point, plane);
      const unsigned = distancePointToPlane(point, plane);
      expect(Math.abs(signed.value - fixture.expectedSignedDistance)).toBeLessThanOrEqual(
        fixture.absoluteTolerance,
      );
      expect(Math.abs(unsigned.value - Math.abs(fixture.expectedSignedDistance))).toBeLessThanOrEqual(
        fixture.absoluteTolerance,
      );
    });
  }

  for (const fixture of pointLineDistanceFixtures()) {
    it(`point-line ${fixture.id}`, () => {
      const point = definePoint(fixture.point, { unit: UNIT });
      const line = defineLine(fixture.linePoint, fixture.lineDirection, { unit: UNIT });
      const measurement = distancePointToLine(point, line);
      expect(Math.abs(measurement.value - fixture.expectedDistance)).toBeLessThanOrEqual(
        fixture.absoluteTolerance,
      );
    });
  }
});
