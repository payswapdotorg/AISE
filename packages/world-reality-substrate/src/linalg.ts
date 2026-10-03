/**
 * WORLD-P0-A — substrate-neutral linear algebra for the scene-runtime lane.
 *
 * These are AISE's OWN scene-composition math primitives (column-vector
 * convention, right-handed frames, meters, radians) — deliberately NOT any
 * substrate's convention (Babylon.js is row-major left-handed by default,
 * glTF is right-handed with a +Y glTF-convention; the LANE CONTRACT
 * declares this package's convention and the real substrate adapter would
 * be responsible for converting at its boundary, never by leaking its own
 * convention into canonical types).
 *
 * Pure, deterministic, total: no allocation-order or host-dependent
 * behavior; every function is a mathematical function.
 */

/**
 * A 4x4 matrix in ROW-MAJOR storage with the COLUMN-VECTOR convention:
 * m[row * 4 + col]; a point transforms as p' = M·p; the composite
 * (A·B) applies B first; world = parent · local.
 */
export type Mat4 = readonly number[];

/** A 3-vector. */
export type Vec3 = readonly [number, number, number];

/** A unit-or-not quaternion in x, y, z, w order (Hamilton product). */
export type Quat = readonly [number, number, number, number];

/** The identity matrix. */
export const MAT4_IDENTITY: Mat4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

export function mat4Multiply(left: Mat4, right: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += (left[row * 4 + k] ?? 0) * (right[k * 4 + col] ?? 0);
      }
      out[row * 4 + col] = sum;
    }
  }
  return out;
}

/**
 * Compose a local transform (T*R*S, column-vector) - scale, then rotate,
 * then translate. The quaternion-to-matrix rows follow the STANDARD
 * convention:
 *
 *     R00 = 1-(yy+zz)   R01 = xy-wz      R02 = xz+wy
 *     R10 = xy+wz        R11 = 1-(xx+zz)  R12 = yz-wx
 *     R20 = xz-wy        R21 = yz+wx      R22 = 1-(xx+yy)
 *
 * (with xx = qx*2qx etc.). Verified against the canonical rotations:
 * quaternion (0,0,sin45,cos45) maps +X to +Y (a +90-degree turn about Z).
 */
export function composeTransform(transform: {
  readonly translation?: Vec3;
  readonly rotation?: Quat;
  readonly scale?: Vec3;
}): Mat4 {
  const [tx, ty, tz] = transform.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = transform.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = transform.scale ?? [1, 1, 1];
  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy - wz) * sy, (xz + wy) * sz, tx,
    (xy + wz) * sx, (1 - (xx + zz)) * sy, (yz - wx) * sz, ty,
    (xz - wy) * sx, (yz + wx) * sy, (1 - (xx + yy)) * sz, tz,
    0, 0, 0, 1,
  ];
}

export function transformPoint(matrix: Mat4, point: Vec3): Vec3 {
  const [x, y, z] = point;
  const w =
    (matrix[12] ?? 0) * x + (matrix[13] ?? 0) * y + (matrix[14] ?? 0) * z + (matrix[15] ?? 1);
  const invW = w === 0 ? 0 : 1 / w;
  return [
    ((matrix[0] ?? 0) * x + (matrix[1] ?? 0) * y + (matrix[2] ?? 0) * z + (matrix[3] ?? 0)) * invW,
    ((matrix[4] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[6] ?? 0) * z + (matrix[7] ?? 0)) * invW,
    ((matrix[8] ?? 0) * x + (matrix[9] ?? 0) * y + (matrix[10] ?? 0) * z + (matrix[11] ?? 0)) * invW,
  ];
}

/** A canonical row-major digest of a matrix (stable, for determinism tests). */
export function mat4CanonicalJson(matrix: Mat4): string {
  return JSON.stringify({ m: [...matrix].map((value) => Math.round(value * 1e9) / 1e9) });
}

/* ------------------------------------------------------------------ */
/* Ray / AABB intersection (the picking capability's real math)           */
/* ------------------------------------------------------------------ */

export interface Aabb {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface RayHit {
  readonly hit: boolean;
  /** Ray parameter of entry (nan when missed — declared, not hidden). */
  readonly tNear: number;
  readonly tFar: number;
}

/**
 * Slab-method ray/AABB intersection. Deterministic: the declared tie rule
 * is "tNear <= tFar and tFar >= 0" (a ray starting inside the box hits at
 * tNear < 0; reported as a hit with negative tNear, honestly).
 */
export function rayIntersectAabb(
  origin: Vec3,
  direction: Vec3,
  box: Aabb,
): RayHit {
  let tNear = -Infinity;
  let tFar = Infinity;
  for (let axis = 0; axis < 3; axis += 1) {
    const o = origin[axis] ?? 0;
    const d = direction[axis] ?? 0;
    const lo = box.min[axis] ?? 0;
    const hi = box.max[axis] ?? 0;
    if (d === 0) {
      if (o < lo || o > hi) {
        return { hit: false, tNear: Number.NaN, tFar: Number.NaN };
      }
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tNear = Math.max(tNear, t1);
    tFar = Math.min(tFar, t2);
  }
  const hit = tNear <= tFar && tFar >= 0;
  return { hit, tNear: hit ? tNear : Number.NaN, tFar: hit ? tFar : Number.NaN };
}

/** An axis-aligned bounding box around transformed points (computed). */
export function aabbOfPoints(points: readonly Vec3[]): Aabb {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = point[axis] ?? 0;
      const currentMin = min[axis] ?? Infinity;
      const currentMax = max[axis] ?? -Infinity;
      if (value < currentMin) {
        min[axis] = value;
      }
      if (value > currentMax) {
        max[axis] = value;
      }
    }
  }
  return { min, max };
}
