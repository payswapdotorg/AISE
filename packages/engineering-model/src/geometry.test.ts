/**
 * Structured geometry and asset-reference validation tests.
 */
import { describe, expect, it } from "vitest";
import { EngineeringModelError } from "./errors.js";
import { geometryAssetRef, structuredPlanarGeometry } from "./geometry.js";
import { HASH_A, planarGeometry } from "./testing.js";

describe("structuredPlanarGeometry", () => {
  it("accepts a valid planar rectangle", () => {
    expect(() => structuredPlanarGeometry(planarGeometry() as never)).not.toThrow();
  });

  it("accepts elevation/sill/head quantities when present", () => {
    const geometry = planarGeometry({
      elevation: { value: 0, unit: "meter", uncertainty: { kind: "standard", u: 0.01 } },
      sillHeight: { value: 0.9, unit: "meter" },
      headHeight: { value: 2.1, unit: "meter" },
    });
    expect(() => structuredPlanarGeometry(geometry as never)).not.toThrow();
  });

  it("rejects the v1 shape union's other members (runtime guard)", () => {
    expect(() =>
      structuredPlanarGeometry(planarGeometry({ shape: "cylinder" }) as never),
    ).toThrow(EngineeringModelError);
  });

  it("rejects non-unit frame vectors", () => {
    expect(() =>
      structuredPlanarGeometry(
        planarGeometry({
          frame: {
            planePoint: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 0, z: 2 },
            axisU: { x: 1, y: 0, z: 0 },
            axisV: { x: 0, y: 1, z: 0 },
          },
        }) as never,
      ),
    ).toThrow(EngineeringModelError);
  });

  it("rejects non-orthogonal frames", () => {
    expect(() =>
      structuredPlanarGeometry(
        planarGeometry({
          frame: {
            planePoint: { x: 0, y: 0, z: 0 },
            normal: { x: 0, y: 0, z: 1 },
            axisU: { x: 1, y: 0, z: 0.5 },
            axisV: { x: 0, y: 1, z: 0 },
          },
        }) as never,
      ),
    ).toThrow(EngineeringModelError);
  });

  it("rejects empty rectangle bounds", () => {
    expect(() =>
      structuredPlanarGeometry(planarGeometry({ rectangle: { uMin: 2, uMax: 2, vMin: 0, vMax: 1 } }) as never),
    ).toThrow(EngineeringModelError);
    expect(() =>
      structuredPlanarGeometry(planarGeometry({ rectangle: { uMin: 2, uMax: 1, vMin: 0, vMax: 1 } }) as never),
    ).toThrow(EngineeringModelError);
  });

  it("rejects rectangles whose center is off the plane", () => {
    expect(() =>
      structuredPlanarGeometry(
        planarGeometry({ rectangle: { center: { x: 2, y: 1, z: 0.5 } } }) as never,
      ),
    ).toThrow(EngineeringModelError);
  });

  it("requires exactly four corners (canonical order contract)", () => {
    expect(() =>
      structuredPlanarGeometry(planarGeometry({ rectangle: { corners: [] } }) as never),
    ).toThrow(EngineeringModelError);
  });

  it("requires length units on width/height and area units on area", () => {
    expect(() =>
      structuredPlanarGeometry(
        planarGeometry({ width: { value: 4, unit: "square_meter" } }) as never,
      ),
    ).toThrow(EngineeringModelError);
    expect(() =>
      structuredPlanarGeometry(planarGeometry({ area: { value: 10, unit: "meter" } }) as never),
    ).toThrow(EngineeringModelError);
  });

  it("validates the dimension quantities themselves", () => {
    expect(() =>
      structuredPlanarGeometry(
        planarGeometry({ width: { value: Number.NaN, unit: "meter" } }) as never,
      ),
    ).toThrow(EngineeringModelError);
  });

  it("validates quality metrics (counts, non-negative, max ≥ rms)", () => {
    expect(() =>
      structuredPlanarGeometry(planarGeometry({ quality: { pointCount: 0, residualRms: 0, residualMaxAbs: 0 } }) as never),
    ).toThrow(EngineeringModelError);
    expect(() =>
      structuredPlanarGeometry(
        planarGeometry({ quality: { pointCount: 10, residualRms: 0.02, residualMaxAbs: 0.01 } }) as never,
      ),
    ).toThrow(EngineeringModelError);
    expect(() =>
      structuredPlanarGeometry(
        planarGeometry({ quality: { pointCount: 10, residualRms: -1, residualMaxAbs: 0.01 } }) as never,
      ),
    ).toThrow(EngineeringModelError);
  });
});

describe("geometryAssetRef", () => {
  it("accepts a content-pinned point-cloud reference", () => {
    expect(() =>
      geometryAssetRef({ kind: "point-cloud", contentHash: HASH_A, pointCount: 24000, epistemic: "INFERRED" }),
    ).not.toThrow();
  });

  it("rejects unknown kinds, malformed hashes, bad counts, bad epistemic", () => {
    expect(() =>
      geometryAssetRef({ kind: "mesh" as never, contentHash: HASH_A, pointCount: 1, epistemic: "INFERRED" }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      geometryAssetRef({ kind: "point-cloud", contentHash: "XYZ", pointCount: 1, epistemic: "INFERRED" }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      geometryAssetRef({ kind: "point-cloud", contentHash: HASH_A, pointCount: 0, epistemic: "INFERRED" }),
    ).toThrow(EngineeringModelError);
    expect(() =>
      geometryAssetRef({ kind: "point-cloud", contentHash: HASH_A, pointCount: 1, epistemic: "MAYBE" as never }),
    ).toThrow(EngineeringModelError);
  });
});
