/**
 * Golden geometric fixtures for architectural object extraction
 * (AISE-010, HIGH_ASSURANCE benchmark set).
 *
 * Synthetic room scenes with GROUND TRUTH and ACCEPTANCE
 * TOLERANCES, generated deterministically:
 *
 * - **Exact room** — a 4.0 × 3.0 × 2.7 m room (floor, ceiling,
 *   four walls) sampled on a 0.05 m grid; the south wall carries a
 *   0.9 × 2.1 m door (floor-contacting), the east wall a
 *   1.2 × 1.2 m window (sill 0.9 m). No noise.
 * - **Noisy room** — the same room with seeded Gaussian noise
 *   (σ = 0.01 m) via Box–Muller from the AISE-009 deterministic
 *   RNG: reproducible, recorded in the fixture description.
 * - **Outlier room** — the exact room with every 20th point
 *   displaced by a fixed 0.5 m offset (5% deterministic outliers).
 *
 * Ground truth covers object counts, dimensions, elevations, room
 * height, door/window geometry, and residual accounting. Golden
 * tests pin the extraction against the acceptance rules; numerical
 * regression tests freeze the extracted values (deterministic
 * bit-identity per runtime).
 *
 * Generation is a pure function of the parameters — no ambient
 * randomness (seeded RNG only), no clock, no order dependence
 * beyond the (irrelevant) point emission order (extraction
 * canonicalizes input).
 */
import { DeterministicRng, type GeomPoint } from "@aise/backend-geometry";

/** The seed for fixture noise synthesis (recorded, reproducible). */
export const ROOM_NOISE_SEED = 0x10ca1a0;

/** Room geometry ground truth (meters). */
export interface RoomGroundTruth {
  /** Interior floor dimensions. */
  readonly width: number;
  readonly depth: number;
  readonly floorToCeilingHeight: number;
  readonly door: {
    /** Door width. */
    readonly width: number;
    /** Door height (floor to head). */
    readonly height: number;
    /** Door position along the wall (u coordinate of the gap start). */
    readonly uStart: number;
  };
  readonly window: {
    readonly width: number;
    readonly height: number;
    /** Sill height above the floor. */
    readonly sill: number;
    /** Window position along the wall (u coordinate of the gap start). */
    readonly uStart: number;
  };
  readonly objectCounts: {
    readonly floors: number;
    readonly ceilings: number;
    readonly walls: number;
    readonly doors: number;
    readonly windows: number;
  };
}

/** The golden room ground truth. */
export const roomGroundTruth: RoomGroundTruth = {
  width: 4,
  depth: 3,
  floorToCeilingHeight: 2.7,
  door: { width: 0.9, height: 2.1, uStart: 1.5 },
  window: { width: 1.2, height: 1.2, sill: 0.9, uStart: 0.9 },
  objectCounts: { floors: 1, ceilings: 1, walls: 4, doors: 1, windows: 1 },
};

/** Point sampling step (meters). */
const STEP = 0.05;

/**
 * Generates the golden room point cloud. Deterministic. Openings
 * are OPEN regions: the door spans u ∈ (uStart, uStart+width) ×
 * z ∈ [0, height) (floor-contacting — no wall points inside, none
 * at the threshold); the window spans u ∈ (uStart, uStart+width) ×
 * z ∈ (sill, sill+height).
 */
export function roomPoints(options: { noiseSigma?: number; outlierEvery?: number } = {}): GeomPoint[] {
  const truth = roomGroundTruth;
  const noiseSigma = options.noiseSigma ?? 0;
  const outlierEvery = options.outlierEvery ?? 0;
  const rng = noiseSigma > 0 ? new DeterministicRng(ROOM_NOISE_SEED) : null;
  const outlierOffset = { x: 0.37, y: -0.21, z: 0.11 };

  const points: GeomPoint[] = [];
  let counter = 0;
  const emit = (x: number, y: number, z: number): void => {
    let px = x;
    let py = y;
    let pz = z;
    if (rng !== null) {
      px += gaussian(rng) * noiseSigma;
      py += gaussian(rng) * noiseSigma;
      pz += gaussian(rng) * noiseSigma;
    }
    if (outlierEvery > 0 && counter % outlierEvery === 0) {
      px += outlierOffset.x;
      py += outlierOffset.y;
      pz += outlierOffset.z;
    }
    counter += 1;
    points.push({ x: px, y: py, z: pz });
  };

  // Floor (z = 0) and ceiling (z = H): grids over [0, W] × [0, D].
  for (let x = 0; x <= truth.width + 1e-9; x += STEP) {
    for (let y = 0; y <= truth.depth + 1e-9; y += STEP) {
      emit(x, y, 0);
      emit(x, y, truth.floorToCeilingHeight);
    }
  }

  // South wall (y = 0) with the door; North wall (y = D).
  for (let x = 0; x <= truth.width + 1e-9; x += STEP) {
    for (let z = 0; z <= truth.floorToCeilingHeight + 1e-9; z += STEP) {
      const inDoor =
        x > truth.door.uStart &&
        x < truth.door.uStart + truth.door.width &&
        z >= 0 &&
        z < truth.door.height;
      if (!inDoor) {
        emit(x, 0, z);
      }
      emit(x, truth.depth, z);
    }
  }

  // East wall (x = W) with the window; West wall (x = 0).
  for (let y = 0; y <= truth.depth + 1e-9; y += STEP) {
    for (let z = 0; z <= truth.floorToCeilingHeight + 1e-9; z += STEP) {
      const inWindow =
        y > truth.window.uStart &&
        y < truth.window.uStart + truth.window.width &&
        z > truth.window.sill &&
        z < truth.window.sill + truth.window.height;
      if (!inWindow) {
        emit(truth.width, y, z);
      }
      emit(0, y, z);
    }
  }

  return points;
}

/** Exact golden room (no noise, no outliers). */
export function exactRoomPoints(): GeomPoint[] {
  return roomPoints();
}

/** Noisy golden room (seeded Gaussian noise, σ = 0.01 m). */
export function noisyRoomPoints(): GeomPoint[] {
  return roomPoints({ noiseSigma: 0.01 });
}

/** Outlier golden room (every 20th point displaced 0.5 m — 5% outliers). */
export function outlierRoomPoints(): GeomPoint[] {
  return roomPoints({ outlierEvery: 20 });
}

/**
 * Acceptance rules for the golden room extractions. The grid
 * resolution (0.05 m) bounds opening-edge quantization to one cell;
 * noise σ = 0.01 m keeps plane fits and classification stable.
 */
export interface RoomAcceptance {
  /** Dimension tolerance (meters). */
  readonly dimensionTolerance: number;
  /** Elevation/room-height tolerance (meters). */
  readonly elevationTolerance: number;
}

/** Acceptance for the exact room (grid quantization only). */
export const EXACT_ROOM_ACCEPTANCE: RoomAcceptance = {
  dimensionTolerance: 0.11,
  elevationTolerance: 1e-6,
};

/** Acceptance for the noisy room (grid quantization + σ = 0.01). */
export const NOISY_ROOM_ACCEPTANCE: RoomAcceptance = {
  dimensionTolerance: 0.15,
  elevationTolerance: 0.05,
};

/**
 * Acceptance for the outlier room. Elevation tolerance 1e-4: every
 * 20th point is displaced 0.11 in z; displaced wall points near the
 * ceiling land inside the ceiling inlier band (|2.71 − 2.7| ≤ 0.03)
 * and shift the TLS fit by ~1.3e-5 — honest outlier contamination
 * of the plane fit, measured, not hidden.
 */
export const OUTLIER_ROOM_ACCEPTANCE: RoomAcceptance = {
  dimensionTolerance: 0.11,
  elevationTolerance: 1e-4,
};

/** Deterministic standard-normal draw (Box–Muller, cached pair). */
function gaussian(rng: DeterministicRng): number {
  if (gaussianCache !== null) {
    const value = gaussianCache;
    gaussianCache = null;
    return value;
  }
  let u1 = rng.nextUnit();
  const u2 = rng.nextUnit();
  if (u1 < 1e-12) {
    u1 = 1e-12;
  }
  const radius = Math.sqrt(-2 * Math.log(u1));
  const angle = 2 * Math.PI * u2;
  gaussianCache = radius * Math.sin(angle);
  return radius * Math.cos(angle);
}

let gaussianCache: number | null = null;
