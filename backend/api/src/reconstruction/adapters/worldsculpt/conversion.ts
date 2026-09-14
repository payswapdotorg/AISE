/**
 * Deterministic camera/pose/scale conversion (AISE-012) — AISE conventions →
 * the WorldSculpt engine-native frame (see backend.ts header).
 *
 * PURE FUNCTIONS ONLY: no I/O, no clock, no randomness — identical inputs
 * yield identical outputs bit-for-bit (IEEE-754 arithmetic is deterministic
 * for these fixed operations). These are the exact functions the adapter uses
 * at runtime; unit tests pin hand-computed numeric outputs.
 *
 * Convention mapping (AISE → engine):
 *   AISE camera poses are camera-to-world, right-handed, +X right, +Y DOWN,
 *   +Z forward, with an explicit length unit ("meter" | "millimeter").
 *   The engine frame is +Y UP, −Z forward, meters. The mapping is a 180°
 *   rotation about X applied on the left (R_engine = Rx(180°) · R_aise) plus
 *   a unit scale factor on the translation (mm → m divides by 1000).
 */

import type {
  Matrix3,
  WorldSculptCameraIntrinsics,
  WorldSculptCameraPose,
} from "./backend";

/** Length units AISE camera metadata may carry. */
export type AiseLengthUnit = "meter" | "millimeter";

/** Meters per declared unit (identity for meters, 0.001 for millimeters). */
export function metersPerUnit(unit: AiseLengthUnit): number {
  return unit === "millimeter" ? 0.001 : 1;
}

/** AISE camera intrinsics: pixel-unit pinhole model. */
export interface AiseCameraIntrinsics {
  readonly fxPixels: number;
  readonly fyPixels: number;
  readonly cxPixels: number;
  readonly cyPixels: number;
  readonly widthPixels: number;
  readonly heightPixels: number;
}

/** AISE camera pose: camera-to-world, +X right, +Y down, +Z forward. */
export interface AiseCameraPose {
  readonly position: readonly [number, number, number];
  readonly rotation: Matrix3;
  readonly unit: AiseLengthUnit;
}

/** Rx(180°): maps y-down/+z-forward onto y-up/−z-forward. */
export const CONVENTION_ROTATION_X180: Matrix3 = [
  [1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
];

/**
 * Pixel-unit intrinsics → engine-normalized intrinsics. Focal lengths and
 * principal point are divided by image width (x components) and height (y
 * components); pixel dimensions are carried for reference.
 */
export function convertIntrinsicsToEngine(
  intrinsics: AiseCameraIntrinsics,
): WorldSculptCameraIntrinsics {
  return {
    fx: intrinsics.fxPixels / intrinsics.widthPixels,
    fy: intrinsics.fyPixels / intrinsics.heightPixels,
    cx: intrinsics.cxPixels / intrinsics.widthPixels,
    cy: intrinsics.cyPixels / intrinsics.heightPixels,
    widthPixels: intrinsics.widthPixels,
    heightPixels: intrinsics.heightPixels,
  };
}

/** Row-major 3×3 matrix product. */
export function multiplyMatrix3(a: Matrix3, b: Matrix3): Matrix3 {
  const out: number[][] = [];
  for (let row = 0; row < 3; row += 1) {
    const outRow: number[] = [];
    for (let col = 0; col < 3; col += 1) {
      outRow.push(
        (a[row] as readonly number[])[0]! * (b[0] as readonly number[])[col]! +
          (a[row] as readonly number[])[1]! * (b[1] as readonly number[])[col]! +
          (a[row] as readonly number[])[2]! * (b[2] as readonly number[])[col]!,
      );
    }
    out.push(outRow);
  }
  return out as unknown as Matrix3;
}

/**
 * AISE pose → engine pose: rotation Rx(180°)·R, translation scaled to meters.
 * `frameIndex` binds the converted pose to its input frame.
 */
export function convertPoseToEngineFrame(
  pose: AiseCameraPose,
  frameIndex: number,
): WorldSculptCameraPose {
  const scale = metersPerUnit(pose.unit);
  return {
    frameIndex,
    position: [pose.position[0] * scale, pose.position[1] * scale, pose.position[2] * scale],
    rotation: multiplyMatrix3(CONVENTION_ROTATION_X180, pose.rotation),
  };
}

/** AISE scale constraints the WorldSculpt engine supports (all metric). */
const SUPPORTED_SCALE_CONSTRAINTS: ReadonlySet<string | null> = new Set([
  null,
  "metric",
  "metric-meter",
  "metric-millimeter",
]);

/** Engine scale declaration ("metric-meters"), or null when unsupported. */
export type EngineScaleDeclaration = "metric-meters";

/**
 * Scale-constraint → engine scale declaration. Supported AISE metric
 * constraints (meter or millimeter based) normalize onto the engine's
 * meter-based metric scale — the millimeter → meter conversion happens per
 * pose via the pose's declared unit. Non-metric constraints yield null (the
 * adapter fails INPUT_INCOMPATIBLE: the engine is metric-only).
 */
export function engineScaleDeclaration(scaleConstraint: string | null): EngineScaleDeclaration | null {
  return SUPPORTED_SCALE_CONSTRAINTS.has(scaleConstraint) ? "metric-meters" : null;
}

/** Apply a 4×4 row-major transform to a [x, y, z] point (w = 1, no divide). */
export function applyTransform4x4(
  matrix: readonly number[],
  point: readonly [number, number, number],
): [number, number, number] {
  const m = (row: number, col: number): number => matrix[row * 4 + col] as number;
  return [
    m(0, 0) * point[0] + m(0, 1) * point[1] + m(0, 2) * point[2] + m(0, 3),
    m(1, 0) * point[0] + m(1, 1) * point[1] + m(1, 2) * point[2] + m(1, 3),
    m(2, 0) * point[0] + m(2, 1) * point[1] + m(2, 2) * point[2] + m(2, 3),
  ];
}
