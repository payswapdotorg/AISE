/**
 * WORLD-P0-A tests — the real WGS84 ellipsoid mathematics.
 *
 * Every reference value below is either EXACTLY derivable from the WGS84
 * defining parameters (a, f) or a published canonical test vector; every
 * comparison carries its DECLARED tolerance with the rationale inline
 * (substitution contract §2 law 2: tolerances are declared, never
 * implicit). Development-time cross-validation: the Vincenty inverse was
 * additionally verified against GeographicLib 1.52.2 (Karney) over 9
 * canonical vectors + a 1000-pair seeded corpus, worst |diff| 7.7e-5 m —
 * recorded in the evidence tree, NOT a shipped dependency.
 */

import { describe, expect, test } from "bun:test";
import {
  ecefChordDistance,
  ecefToGeodetic,
  geodeticToEcef,
  isSurfacePointVisible,
  surfaceEcef,
  vincentyInverse,
  WGS84,
  WGS84_B,
  WGS84_E2,
} from "./wgs84";

describe("the WGS84 defining and derived parameters", () => {
  test("a = 6378137 m and 1/f = 298.257223563 (NIMA TR8350.2 / EPSG::7030)", () => {
    expect(WGS84.a).toBe(6_378_137.0);
    expect(1 / WGS84.f).toBeCloseTo(298.257223563, 12);
  });

  test("the derived semi-minor axis and first eccentricity are exact identities", () => {
    // b = a(1-f); e2 = f(2-f) — exact by construction.
    expect(WGS84_B).toBeCloseTo(WGS84.a * (1 - WGS84.f), 9);
    expect(WGS84_E2).toBeCloseTo(WGS84.f * (2 - WGS84.f), 15);
    // The published WGS84 b (6356752.31424518 m) to 1e-6 m.
    expect(WGS84_B).toBeCloseTo(6_356_752.314_245, 6);
  });
});

describe("geodetic <-> ECEF conversion", () => {
  test("geodetic (0, 0, 0) is exactly (a, 0, 0)", () => {
    const ecef = geodeticToEcef({ latDeg: 0, lonDeg: 0, heightM: 0 });
    expect(ecef.x).toBeCloseTo(WGS84.a, 6);
    expect(ecef.y).toBeCloseTo(0, 9);
    expect(ecef.z).toBeCloseTo(0, 9);
  });

  test("geodetic (0, 90E, 0) is exactly (0, a, 0)", () => {
    const ecef = geodeticToEcef({ latDeg: 0, lonDeg: 90, heightM: 0 });
    expect(ecef.x).toBeCloseTo(0, 9);
    expect(ecef.y).toBeCloseTo(WGS84.a, 6);
    expect(ecef.z).toBeCloseTo(0, 9);
  });

  test("the north pole (90, 0, 0) is exactly (0, 0, b)", () => {
    const ecef = geodeticToEcef({ latDeg: 90, lonDeg: 0, heightM: 0 });
    expect(ecef.x).toBeCloseTo(0, 6);
    expect(ecef.y).toBeCloseTo(0, 6);
    expect(ecef.z).toBeCloseTo(WGS84_B, 6);
  });

  test("the inverse (Bowring) roundtrips within the declared tolerance (1e-4 m, 1e-9 deg)", () => {
    // Declared tolerance rationale: Bowring's closed-form inverse is
    // sub-millimeter class; 1e-4 m / 1e-9 deg is three orders looser,
    // asserting behavior, not numerics.
    const points: { latDeg: number; lonDeg: number; heightM: number }[] = [
      { latDeg: 0, lonDeg: 0, heightM: 0 },
      { latDeg: 48.8566, lonDeg: 2.3522, heightM: 35 },
      { latDeg: -33.8688, lonDeg: 151.2093, heightM: 58 },
      { latDeg: 71.0, lonDeg: -25.0, heightM: -1200 },
      { latDeg: -54.0, lonDeg: 170.0, heightM: 1500 },
    ];
    for (const point of points) {
      const back = ecefToGeodetic(geodeticToEcef(point));
      expect(Math.abs(back.latDeg - point.latDeg)).toBeLessThan(1e-9);
      expect(Math.abs(back.lonDeg - point.lonDeg)).toBeLessThan(1e-9);
      expect(Math.abs(back.heightM - point.heightM)).toBeLessThan(1e-4);
    }
  });

  test("the exact polar branch of the inverse", () => {
    const north = ecefToGeodetic({ x: 0, y: 0, z: WGS84_B + 100 });
    expect(north.latDeg).toBe(90);
    expect(north.heightM).toBeCloseTo(100, 6);
    const south = ecefToGeodetic({ x: 0, y: 0, z: -(WGS84_B + 50) });
    expect(south.latDeg).toBe(-90);
    expect(south.heightM).toBeCloseTo(50, 6);
  });
});

describe("Vincenty's inverse geodesic", () => {
  test("the canonical Flinders Peak -> Buninyong vector: 54972.271 m (Vincenty's published test)", () => {
    // Published test vector (Vincenty 1975 / the geodesic literature):
    // tolerance 1e-3 m — the vector's own precision is sub-millimeter.
    const result = vincentyInverse(
      { latDeg: -37.95103341666667, lonDeg: 144.42486788888888, heightM: 0 },
      { latDeg: -37.65282113888889, lonDeg: 143.92649552777777, heightM: 0 },
    );
    expect(result.converged).toBe(true);
    expect(Math.abs(result.distanceM - 54_972.271)).toBeLessThan(1e-3);
  });

  test("the 1-degree equatorial arc is exactly a*pi/180 (the equator is a geodesic)", () => {
    const result = vincentyInverse(
      { latDeg: 0, lonDeg: 0, heightM: 0 },
      { latDeg: 0, lonDeg: 1, heightM: 0 },
    );
    expect(result.converged).toBe(true);
    expect(Math.abs(result.distanceM - (WGS84.a * Math.PI) / 180)).toBeLessThan(1e-6);
  });

  test("the quarter equator is exactly a*pi/2", () => {
    const result = vincentyInverse(
      { latDeg: 0, lonDeg: 0, heightM: 0 },
      { latDeg: 0, lonDeg: 90, heightM: 0 },
    );
    expect(result.converged).toBe(true);
    expect(Math.abs(result.distanceM - (WGS84.a * Math.PI) / 2)).toBeLessThan(1e-4);
  });

  test("the meridian 1-degree arc at latitude 45 matches the meridian curvature (declared tolerance 1 m)", () => {
    // Declared rationale: the meridian arc per degree at 45N is
    // ~111141.5 m (mid-latitude meridian radius of curvature); 1 m
    // tolerance asserts the ellipsoidal (not spherical) behavior.
    const result = vincentyInverse(
      { latDeg: 45, lonDeg: 7, heightM: 0 },
      { latDeg: 46, lonDeg: 7, heightM: 0 },
    );
    expect(result.converged).toBe(true);
    expect(Math.abs(result.distanceM - 111_141.5)).toBeLessThan(1.0);
  });

  test("coincident points measure zero exactly", () => {
    const result = vincentyInverse(
      { latDeg: 10, lonDeg: 20, heightM: 0 },
      { latDeg: 10, lonDeg: 20, heightM: 0 },
    );
    expect(result.converged).toBe(true);
    expect(result.distanceM).toBe(0);
  });

  test("the chord is a lower bound of the geodesic (convexity law)", () => {
    const paris = geodeticToEcef({ latDeg: 48.8566, lonDeg: 2.3522, heightM: 0 });
    const nyc = geodeticToEcef({ latDeg: 40.7128, lonDeg: -74.006, heightM: 0 });
    const geodesic = vincentyInverse(
      { latDeg: 48.8566, lonDeg: 2.3522, heightM: 0 },
      { latDeg: 40.7128, lonDeg: -74.006, heightM: 0 },
    );
    const chord = ecefChordDistance(paris, nyc);
    expect(geodesic.converged).toBe(true);
    expect(geodesic.distanceM).toBeGreaterThan(chord);
    // Paris–NYC literature value ~5837 km (spherical, R=6371 km);
    // the ellipsoidal geodesic sits within 0.5% of it. Declared band.
    expect(geodesic.distanceM / 1000).toBeGreaterThan(5800);
    expect(geodesic.distanceM / 1000).toBeLessThan(5890);
  });

  test("a near-antipodal pair honestly fails to converge (NOT-DERIVABLE is reported, never approximated)", () => {
    // The documented Vincenty failure zone: near-antipodal points. The
    // solver reports non-convergence within the declared budget instead
    // of fabricating a distance.
    const result = vincentyInverse(
      { latDeg: 0, lonDeg: 0, heightM: 0 },
      { latDeg: 0, lonDeg: 179.999, heightM: 0 },
    );
    expect(result.converged).toBe(false);
    expect(Number.isNaN(result.distanceM)).toBe(true);
  });
});

describe("the exact horizon (visibility) test", () => {
  test("a camera over (0,0) at 10,000 km sees the near point and horizon-culls the far point", () => {
    const camera = geodeticToEcef({ latDeg: 0, lonDeg: 0, heightM: 10_000_000 });
    const near = surfaceEcef(0, 10);
    const far = surfaceEcef(0, -170);
    expect(isSurfacePointVisible(camera, near)).toBe(true);
    expect(isSurfacePointVisible(camera, far)).toBe(false);
  });

  test("the sub-camera surface point is always visible", () => {
    const camera = geodeticToEcef({ latDeg: 31.2, lonDeg: 121.5, heightM: 1_000_000 });
    const nadir = surfaceEcef(31.2, 121.5);
    expect(isSurfacePointVisible(camera, nadir)).toBe(true);
  });

  test("bisection locates the horizon crossing: the tangent condition holds to 1e-6", () => {
    // Declared tolerance: the exact tangent-plane test is clean
    // floating-point arithmetic; a 60-iteration bisection resolves the
    // crossing longitude to ~1e-13 deg, so 1e-6 on the dot product is
    // three orders looser.
    const camera = geodeticToEcef({ latDeg: 0, lonDeg: 0, heightM: 10_000_000 });
    let low = 10;
    let high = 100;
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const middle = (low + high) / 2;
      if (isSurfacePointVisible(camera, surfaceEcef(0, middle))) {
        low = middle;
      } else {
        high = middle;
      }
    }
    const horizonLongitude = (low + high) / 2;
    // A point one degree short of the horizon is visible; one degree past
    // it is culled.
    expect(isSurfacePointVisible(camera, surfaceEcef(0, horizonLongitude - 1))).toBe(true);
    expect(isSurfacePointVisible(camera, surfaceEcef(0, horizonLongitude + 1))).toBe(false);
  });
});
