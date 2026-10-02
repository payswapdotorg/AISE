/**
 * WORLD-P0-A tests — the Cesium geospatial port contract against the
 * in-memory double: WGS84 site context, the site↔geodetic bridge
 * round-trip property (substitution law 2: declared tolerance), the
 * anchoring-contract vocabulary mapping, and tileset bookkeeping.
 */

import { describe, expect, test } from "bun:test";
import type { AnchoringHypothesis } from "@aise/anchoring-contract";
import { InMemoryGeospatialDouble } from "./double";
import type { GeodeticPosition, SiteGeoreference } from "./contract";

function makeHypothesis(overrides: Partial<AnchoringHypothesis> = {}): AnchoringHypothesis {
  return {
    evidenceContentId: "a".repeat(64),
    representation: "plan-homography",
    transform: {
      frameFrom: "plan-raster-px",
      frameTo: "still-px",
      matrix: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    inlierCount: 120,
    matchCount: 150,
    inlierRatio: 0.8,
    residualRmsPx: 1.2,
    uncertainty: {
      floorRmsM: 0.02,
      budget95M: 0.0392,
      basis: "spike-v2.1-declaration",
    },
    confidence: 0.9,
    epistemicLabel: "INFERRED",
    crossValidation: [],
    ...overrides,
  };
}

const SITE_FRAME = { origin: [0, 0, 0] as const, northHeading: 0, units: "metre" as const };

function makeGeoreference(): SiteGeoreference {
  return {
    anchor: { latitudeDeg: 5.6037, longitudeDeg: -0.1870, heightM: 75 },
    accuracyMetres: 0.3,
    derivedFrom: [makeHypothesis()],
  };
}

describe("site context establishment", () => {
  test("a valid georeference establishes an opaque site context", () => {
    const geo = new InMemoryGeospatialDouble();
    const res = geo.establishSiteContext(makeGeoreference(), SITE_FRAME);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.handleKind).toBe("site-context");
  });

  test("out-of-range anchors are refused (fail-closed)", () => {
    const geo = new InMemoryGeospatialDouble();
    const bad: SiteGeoreference = {
      anchor: { latitudeDeg: 95, longitudeDeg: 0, heightM: 0 },
      accuracyMetres: 1,
      derivedFrom: [],
    };
    const res = geo.establishSiteContext(bad, SITE_FRAME);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe("request_invalid");
  });

  test("a negative accuracy is refused", () => {
    const geo = new InMemoryGeospatialDouble();
    const bad: SiteGeoreference = { ...makeGeoreference(), accuracyMetres: -1 };
    const res = geo.establishSiteContext(bad, SITE_FRAME);
    expect(res.ok).toBe(false);
  });
});

describe("site ↔ geodetic bridge (substitution law 2: declared tolerance)", () => {
  test("round-trip site → geodetic → site recovers the point within declared tolerance", () => {
    const geo = new InMemoryGeospatialDouble();
    const ctx = geo.establishSiteContext(makeGeoreference(), SITE_FRAME);
    if (!ctx.ok) throw new Error("establish failed");
    const tol = geo.capabilities.declaredToleranceMetres;
    for (const point of [
      [0, 0, 0],
      [12.5, -8.25, 3.75],
      [-40, 60, -2],
      [140, 90, 15],
    ] as const) {
      const geo0 = geo.siteToGeodetic(ctx.value, point);
      expect(geo0.ok).toBe(true);
      if (!geo0.ok) continue;
      const back = geo.geodeticToSite(ctx.value, geo0.value);
      expect(back.ok).toBe(true);
      if (!back.ok) continue;
      const drift = Math.hypot(
        back.value[0] - point[0],
        back.value[1] - point[1],
        back.value[2] - point[2],
      );
      expect(drift).toBeLessThan(tol);
    }
  });

  test("the anchor itself round-trips to the site origin exactly", () => {
    const geo = new InMemoryGeospatialDouble();
    const gr = makeGeoreference();
    const ctx = geo.establishSiteContext(gr, SITE_FRAME);
    if (!ctx.ok) throw new Error("establish failed");
    const back = geo.geodeticToSite(ctx.value, gr.anchor);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(Math.abs(back.value[0])).toBeLessThan(1e-6);
      expect(Math.abs(back.value[1])).toBeLessThan(1e-6);
      expect(Math.abs(back.value[2])).toBeLessThan(1e-6);
    }
  });

  test("operations on unknown handles are refused", () => {
    const geo = new InMemoryGeospatialDouble();
    const res = geo.siteToGeodetic({ handleKind: "site-context", token: "nope" }, [0, 0, 0]);
    expect(res.ok).toBe(false);
  });
});

describe("georeference resolution (anchoring-contract vocabulary)", () => {
  test("all-inlier hypotheses produce outcome 'anchored' (anchoring vocabulary reused)", () => {
    const geo = new InMemoryGeospatialDouble();
    const candidate: GeodeticPosition = { latitudeDeg: 5.6037, longitudeDeg: -0.187, heightM: 75 };
    const res = geo.resolveGeoreference([makeHypothesis()], candidate);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.outcome).toBe("anchored");
      expect(res.value.georeference).not.toBeNull();
      expect(res.value.reason).toBeNull();
    }
  });

  test("a zero-inlier hypothesis degrades to 'partial' with a reason", () => {
    const geo = new InMemoryGeospatialDouble();
    const candidate: GeodeticPosition = { latitudeDeg: 5.6037, longitudeDeg: -0.187, heightM: 75 };
    const res = geo.resolveGeoreference(
      [makeHypothesis(), makeHypothesis({ inlierCount: 0 })],
      candidate,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.outcome).toBe("partial");
      expect(res.value.reason).toContain("insufficient-inliers");
    }
  });

  test("no hypotheses is 'refused' — never an invented georeference", () => {
    const geo = new InMemoryGeospatialDouble();
    const candidate: GeodeticPosition = { latitudeDeg: 0, longitudeDeg: 0, heightM: 0 };
    const res = geo.resolveGeoreference([], candidate);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.outcome).toBe("refused");
      expect(res.value.georeference).toBeNull();
    }
  });

  test("derivedFrom carries the hypotheses verbatim (no redefinition of anchoring types)", () => {
    const geo = new InMemoryGeospatialDouble();
    const h = makeHypothesis();
    const candidate: GeodeticPosition = { latitudeDeg: 5.6037, longitudeDeg: -0.187, heightM: 75 };
    const res = geo.resolveGeoreference([h], candidate);
    if (!res.ok) throw new Error("resolve failed");
    expect(res.value.georeference?.derivedFrom[0]?.inlierCount).toBe(120);
    expect(res.value.georeference?.derivedFrom[0]?.representation).toBe("plan-homography");
  });
});

describe("tileset delivery (bookkeeping + capacity honesty)", () => {
  test("register + release round-trips; duplicates are refused", () => {
    const geo = new InMemoryGeospatialDouble();
    const ctx = geo.establishSiteContext(makeGeoreference(), SITE_FRAME);
    if (!ctx.ok) throw new Error("establish failed");
    const ref = {
      tilesetId: "tiles-site-photogrammetry",
      contentType: "3d-tiles/1.1" as const,
      declaredByteSize: 1024,
    };
    const reg = geo.registerTileset(ctx.value, ref);
    expect(reg.ok).toBe(true);
    const dup = geo.registerTileset(ctx.value, ref);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.failure.code).toBe("request_invalid");
    if (reg.ok) {
      const rel = geo.releaseTileset(ctx.value, reg.value);
      expect(rel.ok).toBe(true);
    }
  });

  test("terrain is declared BLOCKED, and the declared tolerance is finite/positive", () => {
    const geo = new InMemoryGeospatialDouble();
    expect(geo.capabilities.supportsTerrain).toBe(false);
    const terrain = geo.capabilities.blocked.find((b) => b.capability === "terrain-streaming");
    expect(terrain).toBeDefined();
    expect(terrain?.reason).toContain("WORLD-P1");
    expect(geo.capabilities.declaredToleranceMetres).toBeGreaterThan(0);
    expect(Number.isFinite(geo.capabilities.declaredToleranceMetres)).toBe(true);
  });
});
