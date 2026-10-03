/**
 * WORLD-P0-A — the real WGS84 ellipsoid mathematics of the geospatial
 * context lane (substrate-neutral; CesiumJS stays external and replaceable).
 *
 * This is real geodesy, not a simulation: the WGS84 defining parameters
 * (a, f) and the derived quantities (b, e², e'²), the exact geodetic ↔
 * ECEF conversions (direct series-free closed forms), Bowring's closed-form
 * inverse, Vincenty's inverse geodesic with a DECLARED iteration budget,
 * and the exact tangent-plane horizon test for the convex ellipsoid.
 *
 * Tolerances are DECLARED, never implicit (substitution contract §2 law 2):
 *   - geodetic → ECEF → geodetic roundtrip: 1e-4 m in height, 1e-9 rad in
 *     latitude/longitude (Bowring's method's published accuracy class);
 *   - reference geodesic distances (literature-cited): the tolerance is
 *     stated per test with its rationale;
 *   - the horizon test is exact arithmetic (no tolerance beyond IEEE-754).
 *
 * Determinism: no clock, no network, no host-dependent iteration counts —
 * Vincenty's loop is capped at a declared budget and reports convergence
 * honestly (a non-convergent geodesic is REFUSED by the lane, never
 * approximated silently).
 */

/** The WGS84 defining parameters (NIMA TR8350.2 / EPSG::7030). */
export const WGS84 = {
  /** Semi-major axis (equatorial radius), meters. */
  a: 6_378_137.0,
  /** Flattening. */
  f: 1 / 298.257_223_563,
} as const;

/** Semi-minor axis (polar radius), meters. */
export const WGS84_B = WGS84.a * (1 - WGS84.f);

/** First eccentricity squared. */
export const WGS84_E2 = WGS84.f * (2 - WGS84.f);

/** Second eccentricity squared. */
export const WGS84_EP2 = (WGS84.a * WGS84.a - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);

/** The declared Vincenty iteration budget (convergence is reported). */
export const VINCENTY_MAX_ITERATIONS = 200;

/** A closed-form geodetic point (degrees, meters above the ellipsoid). */
export interface Geodetic {
  readonly latDeg: number;
  readonly lonDeg: number;
  readonly heightM: number;
}

/** An Earth-Centered Earth-Fixed Cartesian point (meters). */
export interface Ecef {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** The prime-vertical radius of curvature at a latitude (radians). */
function primeVerticalRadius(latRad: number): number {
  return WGS84.a / Math.sqrt(1 - WGS84_E2 * Math.sin(latRad) ** 2);
}

/** Geodetic (degrees, height) → ECEF (meters). Exact. */
export function geodeticToEcef(point: Geodetic): Ecef {
  const lat = point.latDeg * DEG;
  const lon = point.lonDeg * DEG;
  const n = primeVerticalRadius(lat);
  const cosLat = Math.cos(lat);
  const sinLat = Math.sin(lat);
  return {
    x: (n + point.heightM) * cosLat * Math.cos(lon),
    y: (n + point.heightM) * cosLat * Math.sin(lon),
    z: (WGS84_B * WGS84_B / (WGS84.a * WGS84.a) * n + point.heightM) * sinLat,
  };
}

/** The ellipsoid-surface ECEF of a geodetic (height 0). */
export function surfaceEcef(latDeg: number, lonDeg: number): Ecef {
  return geodeticToEcef({ latDeg, lonDeg, heightM: 0 });
}

/**
 * ECEF → geodetic via Bowring's closed-form method (1976), with the exact
 * polar branch. Accuracy class: sub-millimeter for |lat| < ~89.9°, exact
 * at the poles by the branch; the declared roundtrip tolerance is
 * 1e-4 m / 1e-9 rad and is asserted by tests.
 */
export function ecefToGeodetic(point: Ecef): Geodetic {
  const p = Math.hypot(point.x, point.y);
  if (p < 1e-9) {
    // The exact polar branch: lon is undefined at the pole; declared 0.
    const latDeg = point.z >= 0 ? 90 : -90;
    const heightM = Math.abs(point.z) - WGS84_B;
    return { latDeg, lonDeg: 0, heightM };
  }
  const theta = Math.atan2(point.z * WGS84.a, p * WGS84_B);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);
  const latRad = Math.atan2(
    point.z + WGS84_EP2 * WGS84_B * sinTheta ** 3,
    p - WGS84_E2 * WGS84.a * cosTheta ** 3,
  );
  const lonRad = Math.atan2(point.y, point.x);
  const n = primeVerticalRadius(latRad);
  const heightM = p / Math.cos(latRad) - n;
  return { latDeg: latRad * RAD, lonDeg: lonRad * RAD, heightM };
}

/** Straight-line (chord) distance between two ECEF points, meters. */
export function ecefChordDistance(left: Ecef, right: Ecef): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

export interface VincentyResult {
  /** The ellipsoidal geodesic distance, meters (valid iff converged). */
  readonly distanceM: number;
  /** Did the iteration converge within the declared budget? Honest flag. */
  readonly converged: boolean;
  /** The iterations consumed (bounded by the declared budget). */
  readonly iterations: number;
}

/**
 * Vincenty's inverse formula: the geodesic distance on the WGS84
 * ellipsoid between two surface points (degrees). Deterministic; the
 * iteration is capped at the DECLARED budget and non-convergence is
 * REPORTED (the lane refuses to fabricate a distance for a non-convergent
 * geodesic — honesty law: unsupported is recorded, never computed).
 */
export function vincentyInverse(
  from: Geodetic,
  to: Geodetic,
): VincentyResult {
  const a = WGS84.a;
  const b = WGS84_B;
  const flattening = WGS84.f;
  const l = (to.lonDeg - from.lonDeg) * DEG;
  const u1 = Math.atan((1 - flattening) * Math.tan(from.latDeg * DEG));
  const u2 = Math.atan((1 - flattening) * Math.tan(to.latDeg * DEG));
  const sinU1 = Math.sin(u1);
  const cosU1 = Math.cos(u1);
  const sinU2 = Math.sin(u2);
  const cosU2 = Math.cos(u2);

  let lambda = l;

  for (let iteration = 1; iteration <= VINCENTY_MAX_ITERATIONS; iteration += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    const sinSigma = Math.hypot(
      cosU2 * sinLambda,
      cosU1 * sinU2 - sinU1 * cosU2 * cosLambda,
    );
    if (sinSigma === 0) {
      // Coincident points: the geodesic length is the (zero) chord.
      return { distanceM: 0, converged: true, iterations: iteration };
    }
    const cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    const sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma;
    const cosSquaredAlpha = 1 - sinAlpha * sinAlpha;
    const cos2SigmaM =
      cosSquaredAlpha === 0 ? 0 : cosSigma - 2 * sinU1 * sinU2 / cosSquaredAlpha;
    const c =
      flattening / 16 * cosSquaredAlpha * (4 + flattening * (4 - 3 * cosSquaredAlpha));
    const previousLambda = lambda;
    lambda =
      l +
      (1 - c) * flattening * sinAlpha *
        (sigma +
          c * sinSigma * (cos2SigmaM + c * cosSigma * (2 * cos2SigmaM ** 2 - 1)));
    if (Math.abs(lambda - previousLambda) < 1e-12) {
      const uSquared = cosSquaredAlpha * (a * a - b * b) / (b * b);
      const bigA =
        1 + uSquared / 16_384 * (4096 + uSquared * (-768 + uSquared * (320 - 175 * uSquared)));
      const bigB =
        uSquared / 1024 * (256 + uSquared * (-128 + uSquared * (74 - 47 * uSquared)));
      const deltaSigma =
        bigB * sinSigma *
          (cos2SigmaM + bigB / 4 * (cosSigma * (2 * cos2SigmaM ** 2 - 1) -
            bigB / 6 * cos2SigmaM * (4 * sinSigma ** 2 - 3) * (4 * cos2SigmaM ** 2 - 3)));
      const s = b * bigA * (sigma - deltaSigma);
      return { distanceM: s, converged: true, iterations: iteration };
    }
  }
  return {
    distanceM: Number.NaN,
    converged: false,
    iterations: VINCENTY_MAX_ITERATIONS,
  };
}

/* ------------------------------------------------------------------ */
/* The exact horizon (visibility) test for the convex ellipsoid           */
/* ------------------------------------------------------------------ */

/**
 * The (non-unit) outward normal of the ellipsoid at an ECEF point: the
 * gradient of x²/a² + y²/a² + z²/b² − 1.
 */
export function ellipsoidNormal(point: Ecef): Ecef {
  return {
    x: point.x / (WGS84.a * WGS84.a),
    y: point.y / (WGS84.a * WGS84.a),
    z: point.z / (WGS84_B * WGS84_B),
  };
}

/**
 * Is a surface point VISIBLE from an external camera? EXACT for convex
 * bodies: the camera sees the point iff the camera lies in the closed
 * outward half-space of the ellipsoid's tangent plane at the point —
 * equivalently (C − P) · n̂ ≥ 0 where n̂ is the outward surface normal.
 * A point on the visible hemisphere returns true; a point beyond the
 * horizon (occluded by the ellipsoid itself) returns false.
 */
export function isSurfacePointVisible(camera: Ecef, point: Ecef): boolean {
  const normal = ellipsoidNormal(point);
  const dot =
    (camera.x - point.x) * normal.x +
    (camera.y - point.y) * normal.y +
    (camera.z - point.z) * normal.z;
  return dot >= 0;
}
