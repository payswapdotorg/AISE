/**
 * Vector / matrix primitives (AISE-013).
 *
 * Immutable data + pure functions only: no mutation of inputs, no clock, no
 * randomness, no I/O. Every function allocates at most its result, in a fixed
 * operation order, so identical input bits produce identical output bits
 * (IEEE 754 double determinism; see module README in index.ts).
 *
 * Conventions (row-major):
 *   - `Vec3` = [x, y, z] tuple.
 *   - `Mat3`/`Mat4` = arrays of ROWS; `Mat4` is homogeneous (points carry
 *     w = 1); the bottom row of a metric transform is [0,0,0,1].
 *   - `mat4Multiply(a, b)` is the matrix product a·b, i.e. applying b FIRST,
 *     then a: applyPoint(multiply(a,b), p) === applyPoint(a, applyPoint(b, p))
 *     (up to float rounding). Rigid-transform composition is exactly this
 *     product restricted to rigid inputs; no separate composition path exists
 *     so there is one canonical order.
 *
 * Numerical notes: norms use sqrt(x²+y²+z²) with plain operations (never
 * Math.hypot) for cross-platform bit-stability of the operation sequence;
 * vectors with components so small that the squared norm underflows
 * (|component| ≲ 1e-154) are treated as zero-length by vecNormalize —
 * subnormal-scale geometry is degenerate for metric purposes and fails typed
 * rather than silently.
 */

import { GeometryError } from "./errors";

/** Immutable 3-vector. */
export type Vec3 = readonly [number, number, number];

/** Immutable row-major 3×3 matrix. */
export type Mat3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

/** Immutable row-major 4×4 homogeneous matrix. */
export type Mat4 = readonly [
  readonly [number, number, number, number],
  readonly [number, number, number, number],
  readonly [number, number, number, number],
  readonly [number, number, number, number],
];

/** Vectors whose squared norm underflows to zero are treated as zero. */
export const ZERO_NORM_TOLERANCE = 0;

/** Construct a Vec3 (mainly for callers holding loose numbers). */
export function vec(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}

export function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vecSub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Uniform scaling (scalar multiple). */
export function vecScale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function vecDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Right-handed cross product a × b. */
export function vecCross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Euclidean length, computed as sqrt(dot(v, v)) in fixed order. */
export function vecNorm(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

/**
 * Unit-length copy. Zero-length (or squared-norm-underflowing) input throws
 * `ZERO_LENGTH_VECTOR` — directionless vectors are never silently mapped to
 * an arbitrary axis.
 */
export function vecNormalize(a: Vec3): Vec3 {
  const norm = vecNorm(a);
  if (norm === ZERO_NORM_TOLERANCE) {
    throw new GeometryError(
      "ZERO_LENGTH_VECTOR",
      `cannot normalize zero-length vector [${a[0]}, ${a[1]}, ${a[2]}]`,
    );
  }
  return [a[0] / norm, a[1] / norm, a[2] / norm];
}

/**
 * Deterministic orientation for results that have no inherent sign
 * (eigenvectors, plane normals, line directions): the component with the
 * LARGEST absolute value is made positive; ties are broken by the lowest
 * index. For a z-dominant plane normal this is the documented
 * "normal.z > 0" convention. Idempotent.
 */
export function canonicalAxisSign(a: Vec3): Vec3 {
  const [a0, a1, a2] = a;
  const m0 = Math.abs(a0);
  const m1 = Math.abs(a1);
  const m2 = Math.abs(a2);
  // Largest magnitude wins; ties → lowest index.
  if (m0 >= m1 && m0 >= m2) {
    return a0 < 0 ? [-a0, -a1, -a2] : [a0, a1, a2];
  }
  if (m1 >= m2) {
    return a1 < 0 ? [-a0, -a1, -a2] : [a0, a1, a2];
  }
  return a2 < 0 ? [-a0, -a1, -a2] : [a0, a1, a2];
}

/** Signed-zero canonicalization: -0 becomes +0 (deterministic output bits). */
export function canonicalZero(x: number): number {
  return x === 0 ? 0 : x;
}

export function mat3Identity(): Mat3 {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

export function mat3Multiply(a: Mat3, b: Mat3): Mat3 {
  const [a0, a1, a2] = a;
  const [b0, b1, b2] = b;
  return [
    [
      a0[0] * b0[0] + a0[1] * b1[0] + a0[2] * b2[0],
      a0[0] * b0[1] + a0[1] * b1[1] + a0[2] * b2[1],
      a0[0] * b0[2] + a0[1] * b1[2] + a0[2] * b2[2],
    ],
    [
      a1[0] * b0[0] + a1[1] * b1[0] + a1[2] * b2[0],
      a1[0] * b0[1] + a1[1] * b1[1] + a1[2] * b2[1],
      a1[0] * b0[2] + a1[1] * b1[2] + a1[2] * b2[2],
    ],
    [
      a2[0] * b0[0] + a2[1] * b1[0] + a2[2] * b2[0],
      a2[0] * b0[1] + a2[1] * b1[1] + a2[2] * b2[1],
      a2[0] * b0[2] + a2[1] * b1[2] + a2[2] * b2[2],
    ],
  ];
}

/** Apply a 3×3 matrix to a vector (linear part only). */
export function mat3Apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function mat3Transpose(m: Mat3): Mat3 {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

export function mat3Determinant(m: Mat3): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  );
}

/** Build a Mat3 whose COLUMNS are the given vectors (basis construction). */
export function mat3FromColumns(
  c0: Vec3,
  c1: Vec3,
  c2: Vec3,
): Mat3 {
  return [
    [c0[0], c1[0], c2[0]],
    [c0[1], c1[1], c2[1]],
    [c0[2], c1[2], c2[2]],
  ];
}

/** Column `index` (0–2) of a Mat3. */
export function mat3Column(m: Mat3, index: number): Vec3 {
  if (index === 0) {
    return [m[0][0], m[1][0], m[2][0]];
  }
  if (index === 1) {
    return [m[0][1], m[1][1], m[2][1]];
  }
  return [m[0][2], m[1][2], m[2][2]];
}

export function mat4Identity(): Mat4 {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

/** Homogeneous translation matrix (rotation-free). */
export function mat4Translation(t: Vec3): Mat4 {
  return [
    [1, 0, 0, t[0]],
    [0, 1, 0, t[1]],
    [0, 0, 1, t[2]],
    [0, 0, 0, 1],
  ];
}

/** Rigid transform from a rotation basis and a translation. */
export function mat4FromBasisTranslation(basis: Mat3, translation: Vec3): Mat4 {
  return [
    [basis[0][0], basis[0][1], basis[0][2], translation[0]],
    [basis[1][0], basis[1][1], basis[1][2], translation[1]],
    [basis[2][0], basis[2][1], basis[2][2], translation[2]],
    [0, 0, 0, 1],
  ];
}

/** Matrix product a·b (apply b first, then a). Rigid composition is this. */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const [a0, a1, a2, a3] = a;
  const [b0, b1, b2, b3] = b;
  return [
    [
      a0[0] * b0[0] + a0[1] * b1[0] + a0[2] * b2[0] + a0[3] * b3[0],
      a0[0] * b0[1] + a0[1] * b1[1] + a0[2] * b2[1] + a0[3] * b3[1],
      a0[0] * b0[2] + a0[1] * b1[2] + a0[2] * b2[2] + a0[3] * b3[2],
      a0[0] * b0[3] + a0[1] * b1[3] + a0[2] * b2[3] + a0[3] * b3[3],
    ],
    [
      a1[0] * b0[0] + a1[1] * b1[0] + a1[2] * b2[0] + a1[3] * b3[0],
      a1[0] * b0[1] + a1[1] * b1[1] + a1[2] * b2[1] + a1[3] * b3[1],
      a1[0] * b0[2] + a1[1] * b1[2] + a1[2] * b2[2] + a1[3] * b3[2],
      a1[0] * b0[3] + a1[1] * b1[3] + a1[2] * b2[3] + a1[3] * b3[3],
    ],
    [
      a2[0] * b0[0] + a2[1] * b1[0] + a2[2] * b2[0] + a2[3] * b3[0],
      a2[0] * b0[1] + a2[1] * b1[1] + a2[2] * b2[1] + a2[3] * b3[1],
      a2[0] * b0[2] + a2[1] * b1[2] + a2[2] * b2[2] + a2[3] * b3[2],
      a2[0] * b0[3] + a2[1] * b1[3] + a2[2] * b2[3] + a2[3] * b3[3],
    ],
    [
      a3[0] * b0[0] + a3[1] * b1[0] + a3[2] * b2[0] + a3[3] * b3[0],
      a3[0] * b0[1] + a3[1] * b1[1] + a3[2] * b2[1] + a3[3] * b3[1],
      a3[0] * b0[2] + a3[1] * b1[2] + a3[2] * b2[2] + a3[3] * b3[2],
      a3[0] * b0[3] + a3[1] * b1[3] + a3[2] * b2[3] + a3[3] * b3[3],
    ],
  ];
}

/**
 * Apply an AFFINE Mat4 to a point: p' = M3·p + t. The bottom row is ignored
 * by design (metric transforms are affine; pair with validateMetricTransform
 * which rejects non-affine matrices before engineering use).
 */
export function mat4ApplyPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2] + m[0][3],
    m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2] + m[1][3],
    m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2] + m[2][3],
  ];
}

/** Elementary rotation about the +X axis (right-handed). */
export function mat4RotationX(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [1, 0, 0, 0],
    [0, c, -s, 0],
    [0, s, c, 0],
    [0, 0, 0, 1],
  ];
}

/** Elementary rotation about the +Y axis (right-handed). */
export function mat4RotationY(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [c, 0, s, 0],
    [0, 1, 0, 0],
    [-s, 0, c, 0],
    [0, 0, 0, 1],
  ];
}

/** Elementary rotation about the +Z axis (right-handed). */
export function mat4RotationZ(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [c, -s, 0, 0],
    [s, c, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

/**
 * Rodrigues rotation about an arbitrary axis (normalized internally;
 * zero-length axis throws `ZERO_LENGTH_VECTOR`). R v =
 * v·cosθ + (k×v)·sinθ + k·(k·v)·(1−cosθ).
 */
export function mat4RotationAxisAngle(axis: Vec3, angle: number): Mat4 {
  const k = vecNormalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  const [x, y, z] = k;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y, 0],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x, 0],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c, 0],
    [0, 0, 0, 1],
  ];
}

/**
 * lookAt-style camera basis (right-handed, gluLookAt convention):
 * forward f = normalize(target − eye); right r = normalize(f × up);
 * trueUp u = r × f. Returns the camera-to-world rotation whose COLUMNS are
 * (right, up, BACK = −f) — the camera looks along −Z in camera coordinates
 * and right × up = back holds. Typed failures: target − eye of zero length,
 * or `up` parallel to the forward direction (degenerate cross), both throw
 * `ZERO_LENGTH_VECTOR` naming the cause.
 */
export function lookAtBasis(eye: Vec3, target: Vec3, up: Vec3): Mat3 {
  const forward = vecNormalize(vecSub(target, eye));
  const rightRaw = vecCross(forward, up);
  const rightNorm = vecNorm(rightRaw);
  if (rightNorm === ZERO_NORM_TOLERANCE) {
    throw new GeometryError(
      "ZERO_LENGTH_VECTOR",
      "lookAt basis is degenerate: up vector is parallel to the forward direction",
    );
  }
  const right: Vec3 = [
    rightRaw[0] / rightNorm,
    rightRaw[1] / rightNorm,
    rightRaw[2] / rightNorm,
  ];
  const trueUp = vecCross(right, forward);
  const back: Vec3 = [-forward[0], -forward[1], -forward[2]];
  return mat3FromColumns(right, trueUp, back);
}
