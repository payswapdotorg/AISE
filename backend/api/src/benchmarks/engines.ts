/**
 * AISE-019 — engines under test (deterministic, in-repo).
 *
 * HONESTY: a WorldSculpt-branded engine is deliberately NOT shipped — this
 * sandbox has no real inference (no GPU/weights/endpoint; see AISE-012). The
 * seam (`ReconstructionUnderTest`, model.ts) accepts ANY conforming engine;
 * production wiring adapts the async AISE-012 WorldSculpt adapter onto this
 * sync seam in a later item. Two deterministic engines ship here:
 *
 *   - idealGeometryEngine: recomputes from NOISELESS ground truth. Sanity
 *     anchor — MUST pass all gates on all fixtures (verified in tests). It
 *     reads fixture.groundTruth BY DESIGN (it is not an honest capture
 *     processor; it anchors the harness end-to-end).
 *   - planeFitEngine: the realistic measured baseline — fits planes from the
 *     NOISED observations via the geometry library's fitPlane and measures
 *     dimensions/volumes from those fits. It consumes ONLY the ground-truth-
 *     blind capture view (captureViewOf) — verified by a test that scrambles
 *     ground truth and observes identical output.
 */

import {
  dimensionBetweenParallelPlanes,
  distancePointPlane,
  fitPlane,
  isGeometryError,
  type Plane,
  type Vec3,
} from "../geometry";
import {
  captureViewOf,
  BOX_FACE_KEYS,
  boxFaceSurfaceIds,
} from "./fixtures";
import type {
  EngineCaptureView,
  GoldenFixture,
  ReconstructionUnderTest,
  ReconstructedDimension,
  ReconstructedObjectVolume,
  ReconstructedPlane,
  ReconstructedScene,
} from "./model";

/* ------------------------------------------------------------------ */
/* Ideal geometry engine (sanity anchor)                               */
/* ------------------------------------------------------------------ */

export const IDEAL_GEOMETRY_ENGINE: ReconstructionUnderTest = {
  providerId: "ideal-geometry",
  version: "1.0.0",
  reconstruct(fixture: GoldenFixture): ReconstructedScene {
    const planes: ReconstructedPlane[] = fixture.groundTruth.surfaces.map(
      (surface) => ({ surfaceId: surface.surfaceId, plane: surface.plane }),
    );
    const dimensions: ReconstructedDimension[] = fixture.groundTruth.dimensions.map(
      (dimension) => ({ dimensionId: dimension.dimensionId, measuredM: dimension.valueM }),
    );
    const objectVolumes: ReconstructedObjectVolume[] =
      fixture.groundTruth.objectVolumes.map((volume) => ({
        objectId: volume.objectId,
        measuredVolumeM3: volume.volumeM3,
      }));
    return {
      planes,
      dimensions,
      objectVolumes,
      notes: [
        "ideal-geometry: recomputed from noiseless ground truth (sanity anchor; not a capture processor)",
      ],
    };
  },
};

/* ------------------------------------------------------------------ */
/* Plane-fit engine (realistic measured baseline)                      */
/* ------------------------------------------------------------------ */

interface PlanePairMeasurement {
  readonly valueM: number;
  readonly method: "parallel-planes" | "mean-point-to-plane";
}

/**
 * Measure the separation of two reconstructed planes. Preferred path: the
 * geometry library's dimensionBetweenParallelPlanes (typed, strict). Fallback
 * (sub-tolerance normal disagreement — expected for noisy fits): the mean
 * signed point-to-plane distance of surface B's observed points to plane A,
 * via distancePointPlane. Both paths are geometry-library measurements.
 * Exported for tests (pins BOTH paths deterministically).
 */
export function measurePlanePair(
  request: { readonly dimensionId: string; readonly surfaceA: string; readonly surfaceB: string },
  planeOf: (surfaceId: string) => Plane,
  pointsOf: (surfaceId: string) => readonly Vec3[],
  notes: string[],
): PlanePairMeasurement {
  const planeA = planeOf(request.surfaceA);
  try {
    return { valueM: dimensionBetweenParallelPlanes(planeA, planeOf(request.surfaceB)).value, method: "parallel-planes" };
  } catch (error) {
    if (!(isGeometryError(error) && error.code === "NON_PARALLEL_PLANES")) {
      throw error;
    }
    const pointsB = pointsOf(request.surfaceB);
    let signedSum = 0;
    for (const point of pointsB) {
      signedSum += distancePointPlane(point, null, planeA).value;
    }
    notes.push(
      `dimension ${request.dimensionId}: fitted planes not parallel within tolerance; measured via mean point-to-plane fallback`,
    );
    return { valueM: Math.abs(signedSum / pointsB.length), method: "mean-point-to-plane" };
  }
}

export const PLANE_FIT_ENGINE: ReconstructionUnderTest = {
  providerId: "plane-fit",
  version: "1.0.0",
  reconstruct(fixture: GoldenFixture): ReconstructedScene {
    const view: EngineCaptureView = captureViewOf(fixture);
    const notes: string[] = [];

    const planes: ReconstructedPlane[] = view.observations.map((observation) => ({
      surfaceId: observation.surfaceId,
      plane: fitPlane(observation.points).plane,
    }));
    const planeOf = (surfaceId: string): Plane => {
      const found = planes.find((candidate) => candidate.surfaceId === surfaceId);
      if (!found) {
        throw new Error(`plane-fit: no fitted plane for surface ${surfaceId}`);
      }
      return found.plane;
    };
    const pointsOf = (surfaceId: string): readonly Vec3[] => {
      const found = view.observations.find((o) => o.surfaceId === surfaceId);
      if (!found) {
        throw new Error(`plane-fit: no observation for surface ${surfaceId}`);
      }
      return found.points;
    };

    const dimensions: ReconstructedDimension[] = view.measurementRequests.map((request) => {
      const measurement = measurePlanePair(request, planeOf, pointsOf, notes);
      return { dimensionId: request.dimensionId, measuredM: measurement.valueM };
    });

    const objectVolumes: ReconstructedObjectVolume[] = view.objects.map((object) => {
      let volume = 1;
      for (let axis = 0; axis < 3; axis += 1) {
        const faceA = object.faceSurfaceIds[axis * 2] as string;
        const faceB = object.faceSurfaceIds[axis * 2 + 1] as string;
        const measurement = measurePlanePair(
          { dimensionId: `${object.objectId}::${BOX_FACE_KEYS[axis * 2]}..${BOX_FACE_KEYS[axis * 2 + 1]}`, surfaceA: faceA, surfaceB: faceB },
          planeOf,
          pointsOf,
          notes,
        );
        volume *= measurement.valueM;
      }
      return { objectId: object.objectId, measuredVolumeM3: volume };
    });

    return { planes, dimensions, objectVolumes, notes };
  },
};

export { boxFaceSurfaceIds };
