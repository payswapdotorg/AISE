/**
 * Scene-level cluster classification tests (AISE-010, stage 2).
 *
 * Floor/ceiling by elevation ordering, walls by tilt, honest
 * unclassifiable reporting, and fail-closed impossible architecture.
 */
import { describe, expect, it } from "vitest";
import { classifyClusters, classificationSettings, type ClassifiedCluster } from "./classify.js";
import { toSemanticsError } from "./errors.js";
import { makeCluster, planeGrid } from "./testing.js";

const UP = { x: 0, y: 0, z: 1 };

/** A horizontal cluster at elevation z (40×40 grid, 0.05 step). */
function horizontalAt(z: number): ReturnType<typeof makeCluster> {
  return makeCluster(
    planeGrid({ x: 0, y: 0, z }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 40, 40),
  );
}

/** A vertical cluster (wall) along the X axis at y. */
function verticalAt(y: number): ReturnType<typeof makeCluster> {
  return makeCluster(
    planeGrid({ x: 0, y, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 40, 40),
  );
}

/** A slanted cluster (45° ramp). */
function slanted(): ReturnType<typeof makeCluster> {
  return makeCluster(
    planeGrid({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 1 }, 40, 40),
  );
}

describe("classificationSettings", () => {
  it("materializes the documented defaults", () => {
    const settings = classificationSettings();
    expect(settings.tiltToleranceDeg).toBe(10);
    expect(settings.minFloorCeilingSeparation).toBe(1.5);
    expect(settings.minWallExtent).toBe(0.25);
    expect(settings.minHorizontalExtent).toBe(0.5);
  });

  it("validates options (fail-closed)", () => {
    for (const bad of [
      { tiltToleranceDeg: 0 },
      { tiltToleranceDeg: 45 },
      { tiltToleranceDeg: 90 },
      { minFloorCeilingSeparation: -1 },
      { minWallExtent: 0 },
    ]) {
      const error = capture(() => classificationSettings(bad));
      expect(error?.code).toBe("VALIDATION_FAILED");
    }
  });

  it("tilt tolerance stays strictly below 45° (horizontal and vertical must remain distinguishable)", () => {
    expect(() => classificationSettings({ tiltToleranceDeg: 44.999 })).not.toThrow();
    const rejected = capture(() => classificationSettings({ tiltToleranceDeg: 45 }));
    expect(rejected?.code).toBe("VALIDATION_FAILED");
  });
});

describe("classifyClusters (floor/ceiling)", () => {
  it("the lowest horizontal is the FLOOR, the highest is the CEILING", () => {
    const result = classifyClusters([horizontalAt(0), horizontalAt(2.7)], UP);
    const floor = result.find((c) => c.role === "FLOOR");
    const ceiling = result.find((c) => c.role === "CEILING");
    expect(floor).toBeDefined();
    expect(ceiling).toBeDefined();
    expect(floor?.elevation).toBeCloseTo(0, 3);
    expect(ceiling?.elevation).toBeCloseTo(2.7, 3);
    expect(floor?.orientation).toBe("HORIZONTAL");
    expect(ceiling?.orientation).toBe("HORIZONTAL");
  });

  it("intermediate horizontals are reported UNCLASSIFIED with a reason (furniture honesty)", () => {
    const result = classifyClusters([horizontalAt(0), horizontalAt(0.75), horizontalAt(2.7)], UP);
    const middle = result.find((c) => Math.abs(c.elevation - 0.75) < 0.01);
    expect(middle?.role).toBe("UNCLASSIFIED");
    expect(middle?.reason).toContain("intermediate-elevation");
    expect(result.filter((c) => c.role === "FLOOR").length).toBe(1);
    expect(result.filter((c) => c.role === "CEILING").length).toBe(1);
  });

  it("a single horizontal plane is UNCLASSIFIED — floor vs. ceiling is indistinguishable", () => {
    const result = classifyClusters([horizontalAt(1.2)], UP);
    const only = result[0] as ClassifiedCluster;
    expect(only.role).toBe("UNCLASSIFIED");
    expect(only.reason).toContain("single horizontal plane");
  });

  it("rejects impossible architecture: floor–ceiling separation below the minimum", () => {
    const error = capture(() => classifyClusters([horizontalAt(0), horizontalAt(1.0)], UP));
    expect(error?.code).toBe("GEOMETRY_CONTRADICTION");
    expect(String(error?.details.separation)).toContain("1");
    expect(error?.details.minimum).toBe("1.5");
  });

  it("accepts a separation exactly at the minimum (boundary is possible)", () => {
    expect(() => classifyClusters([horizontalAt(0), horizontalAt(1.5)], UP)).not.toThrow();
  });

  it("honors a configured smaller minimum separation", () => {
    const result = classifyClusters([horizontalAt(0), horizontalAt(1.0)], UP, {
      minFloorCeilingSeparation: 0.9,
    });
    expect(result.find((c) => c.role === "FLOOR")).toBeDefined();
    expect(result.find((c) => c.role === "CEILING")).toBeDefined();
  });
});

describe("classifyClusters (walls and slants)", () => {
  it("vertical clusters become wall candidates", () => {
    const result = classifyClusters([verticalAt(0), verticalAt(3)], UP);
    expect(result.every((c) => c.role === "WALL")).toBe(true);
    expect(result.every((c) => c.orientation === "VERTICAL")).toBe(true);
  });

  it("slanted clusters are UNCLASSIFIED with the tilt reason", () => {
    const result = classifyClusters([slanted()], UP);
    const entry = result[0] as ClassifiedCluster;
    expect(entry.orientation).toBe("SLANTED");
    expect(entry.role).toBe("UNCLASSIFIED");
    expect(entry.reason).toContain("tilt");
  });

  it("walls within the tilt tolerance of vertical still classify as walls", () => {
    // 8° tilt from vertical: normal ≈ (0, sin(8°), cos(8°)).
    const tilt = (8 * Math.PI) / 180;
    const tilted = makeCluster(
      planeGrid({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: Math.sin(tilt), z: Math.cos(tilt) }, 40, 40),
    );
    const result = classifyClusters([tilted], UP);
    expect(result[0]?.role).toBe("WALL");
  });

  it("an empty cluster list yields an empty classification (no fabricated roles)", () => {
    expect(classifyClusters([], UP)).toEqual([]);
  });
});

describe("classifyClusters (determinism)", () => {
  it("the classification is a pure function of the cluster set", () => {
    const clusters = [horizontalAt(0), horizontalAt(2.7), verticalAt(0), slanted()];
    const a = classifyClusters(clusters, UP);
    const b = classifyClusters([...clusters].reverse(), UP);
    // Same role per cluster content regardless of input order.
    const byHash = (list: ClassifiedCluster[]) =>
      list.map((c) => `${c.cluster.clusterId}:${c.role}`).sort();
    expect(byHash(a)).toEqual(byHash(b));
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
