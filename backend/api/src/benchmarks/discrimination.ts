/**
 * AISE-019 — discrimination (mutation) engines.
 *
 * R17 duty: regression gates must PROVABLY detect regressions. These engines
 * are deliberately-broken wrappers used as mutation/discrimination evidence
 * in the test suite. They are MUTATION INSTRUMENTS, never baselines: their
 * provider ids are prefixed `mutation-` and their notes say so. Each
 * demonstrates a distinct failure mode the gates must catch:
 *
 *   - biasedScaleEngine: systematic scale error (all measured linear
 *     dimensions ×factor, volumes ×factor³) — must trip the CRITICAL
 *     flagship scale gate at factor 1.02 while passing generous low-end
 *     gates (class discrimination).
 *   - noisyPlaneEngine: tilted/offset reconstructed planes — must trip the
 *     critical plane_fit_rms and registration_error gates on flagship.
 */

import {
  mat4ApplyPoint,
  mat4RotationAxisAngle,
  vecDot,
  vecScale,
  type Plane,
  type Vec3,
} from "../geometry";
import type {
  GoldenFixture,
  ReconstructionUnderTest,
  ReconstructedScene,
} from "./model";

/* ------------------------------------------------------------------ */
/* Biased scale engine (mutation instrument)                           */
/* ------------------------------------------------------------------ */

export interface BiasedScaleOptions {
  /** Linear scale factor applied to every measured dimension (e.g. 1.02). */
  readonly factor: number;
}

/** Wrap a base engine with a systematic scale error (factor on lengths). */
export function biasedScaleEngine(
  base: ReconstructionUnderTest,
  options: BiasedScaleOptions,
): ReconstructionUnderTest {
  const { factor } = options;
  return {
    providerId: `mutation-biased-scale(${base.providerId})`,
    version: `${base.version}+factor=${factor}`,
    reconstruct(fixture: GoldenFixture): ReconstructedScene {
      const scene = base.reconstruct(fixture);
      return {
        ...scene,
        dimensions: scene.dimensions.map((dimension) => ({
          dimensionId: dimension.dimensionId,
          measuredM: dimension.measuredM * factor,
        })),
        objectVolumes: scene.objectVolumes.map((volume) => ({
          objectId: volume.objectId,
          measuredVolumeM3: volume.measuredVolumeM3 * factor * factor * factor,
        })),
        notes: [
          ...scene.notes,
          `mutation: all measured dimensions x${factor}, volumes x${factor}^3 (deliberate regression instrument)`,
        ],
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Noisy plane engine (mutation instrument)                            */
/* ------------------------------------------------------------------ */

export interface NoisyPlaneOptions {
  /** Tilt applied to every reconstructed plane normal (radians). */
  readonly tiltRad: number;
  /** Additional offset along the (tilted) normal (meters). */
  readonly offsetM: number;
  /** Rotation axis (normalized internally). Default (1,1,1). */
  readonly axis?: Vec3;
}

/** Defaults chosen to trip flagship-critical plane gates without crashing. */
export const DEFAULT_NOISY_PLANE_OPTIONS: NoisyPlaneOptions = {
  tiltRad: (1.5 * Math.PI) / 180,
  offsetM: 0.008,
  axis: [1, 1, 1],
};

/**
 * Wrap a base engine with tilted + offset planes. Every plane normal is
 * rotated about the SAME fixed axis by the SAME angle (so opposing-plane
 * pairs stay exactly parallel and dimension measurement remains possible),
 * then the plane is shifted `offsetM` along its new normal.
 */
export function noisyPlaneEngine(
  base: ReconstructionUnderTest,
  options: NoisyPlaneOptions = DEFAULT_NOISY_PLANE_OPTIONS,
): ReconstructionUnderTest {
  const rotation = mat4RotationAxisAngle(options.axis ?? [1, 1, 1], options.tiltRad);
  return {
    providerId: `mutation-noisy-plane(${base.providerId})`,
    version: `${base.version}+tilt=${options.tiltRad},offset=${options.offsetM}`,
    reconstruct(fixture: GoldenFixture): ReconstructedScene {
      const scene = base.reconstruct(fixture);
      const tiltPlane = (plane: Plane): Plane => {
        const normal: Vec3 = mat4ApplyPoint(rotation, plane.normal);
        // Keep the plane through the original closest-to-origin point,
        // shifted offsetM along the new normal.
        const anchor = vecScale(plane.normal, -plane.d);
        const d = -vecDot(normal, anchor) - options.offsetM;
        return { normal, d };
      };
      return {
        ...scene,
        planes: scene.planes.map((entry) => ({
          surfaceId: entry.surfaceId,
          plane: tiltPlane(entry.plane),
        })),
        notes: [
          ...scene.notes,
          `mutation: reconstructed planes tilted ${options.tiltRad} rad about a fixed axis and offset ${options.offsetM} m (deliberate regression instrument)`,
        ],
      };
    },
  };
}
