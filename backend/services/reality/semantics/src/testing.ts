/**
 * Shared test fixtures: synthetic planar clusters built through the
 * real AISE-009 `fitPlane`, so classify/structure/openings tests
 * exercise production-shaped `PlanarCluster` records (complete
 * provenance, embedded fit, canonical content hash) instead of
 * hand-mocked shapes.
 */
import { fitPlane, canonicalizePointSet, canonicalContentHash, type GeomPoint, type PlaneFitResult } from "@aise/backend-geometry";
import {
  extractionProvenance,
  pointSetInputRef,
  SEGMENTATION_METHOD,
  SEGMENTATION_SEED,
  type PlanarCluster,
  type ExtractionProvenance,
} from "./index.js";

/** Deterministic point grid on the plane through `origin` spanned by `u` and `v`. */
export function planeGrid(
  origin: GeomPoint,
  u: { x: number; y: number; z: number },
  v: { x: number; y: number; z: number },
  uCount: number,
  vCount: number,
  step = 0.05,
): GeomPoint[] {
  const points: GeomPoint[] = [];
  for (let i = 0; i < uCount; i += 1) {
    for (let j = 0; j < vCount; j += 1) {
      points.push({
        x: origin.x + u.x * i * step + v.x * j * step,
        y: origin.y + u.y * i * step + v.y * j * step,
        z: origin.z + u.z * i * step + v.z * j * step,
      });
    }
  }
  return points;
}

/** Builds a production-shaped PlanarCluster from raw points (deterministic). */
export function makeCluster(points: readonly GeomPoint[], index = 0): PlanarCluster {
  const canonical = canonicalizePointSet(points, { minCount: 3, label: "test cluster" });
  const planeFit: PlaneFitResult = fitPlane({ points: canonical, unit: "meter" });
  const contentHash = canonicalContentHash({
    unit: "meter",
    points: canonical,
    plane: { point: planeFit.plane.point, normal: planeFit.plane.normal },
  });
  const provenance: ExtractionProvenance = extractionProvenance(
    SEGMENTATION_METHOD,
    {
      inlierDistance: 0.03,
      minClusterPoints: 100,
      refinementRounds: 3,
      maxPlaneCandidates: 256,
      neighborhoodSize: 24,
      seed: SEGMENTATION_SEED,
      scoringSubsetSize: 0,
      selectedCandidateIndex: 0,
      extractionIndex: index,
      planeFitMethod: planeFit.provenance.method,
    },
    [pointSetInputRef(canonical, "INFERRED")],
  );
  return {
    clusterId: `seg-${contentHash.slice(0, 16)}`,
    index,
    points: canonical,
    planeFit,
    contentHash,
    provenance,
    epistemicState: "INFERRED",
  };
}
