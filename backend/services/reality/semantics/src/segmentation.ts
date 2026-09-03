/**
 * Deterministic planar segmentation (AISE-010, stage 1).
 *
 * Segments a reconstructed point cloud into planar clusters — the
 * substrate for architectural object extraction — using a
 * deterministic sequential plane-RANSAC built on the AISE-009
 * primitives:
 *
 * 1. **Candidate hypotheses are LOCAL and seeded.** Each candidate
 *    plane is defined by a triple of spatially coherent points: a
 *    center point drawn from the canonically ordered remaining set
 *    by a fixed-seed xorshift32 RNG, plus the two extreme
 *    k-nearest neighbors (k-nearest with canonical-index
 *    tie-breaks). Local triples almost always lie on one physical
 *    surface, so hypothesis quality does not depend on sampling
 *    luck; the seed is recorded in provenance.
 *
 * 2. **Scoring is strided and deterministic.** Candidates are
 *    scored by inlier count over a canonical-order stride subset
 *    (bounded size, pure function of the input length); the best
 *    candidate (ties → lowest candidate index) is then fully
 *    classified against ALL remaining points.
 *
 * 3. **Refinement uses the AISE-009 TLS plane fit.** The winning
 *    candidate's inliers are refit by `fitPlane` (total least
 *    squares), inliers are reclassified against the refit plane,
 *    and the loop repeats (bounded rounds) until the inlier set is
 *    stable. The final `PlaneFitResult` — with residual statistics,
 *    propagated uncertainty, and full `aise.geometry` provenance —
 *    is embedded in the cluster, so the lineage chain
 *    object → fit → cluster → cloud is complete.
 *
 * 4. **Extraction is sequential and honest.** Accepted clusters
 *    are removed from the remaining set; the loop ends when no
 *    candidate reaches `minClusterPoints` or a cap is hit. Points
 *    that never join a cluster are reported as residual points
 *    (count + content hash) — never silently dropped.
 *
 * Determinism: the input cloud is canonicalized (lexicographic
 * order) before ANY computation; every selection (RNG draws,
 * k-nearest tie-breaks, candidate tie-breaks) is a pure function of
 * the canonical order; the AISE-009 fit is deterministic. The same
 * point SET in any input order yields bit-identical clusters
 * (pinned by permutation-invariance tests).
 *
 * Fail-closed: non-finite coordinates, unknown units, invalid
 * options, oversized inputs (`BOUNDS_EXCEEDED`), oversized
 * clusters, and geometry-fit failures (`PLANE_FIT_FAILED`, cause
 * preserved).
 */
import { SemanticsError, wrapGeometryFailure } from "./errors.js";
import { extractionProvenance, pointSetInputRef, type ExtractionProvenance } from "./provenance.js";
import { assertSourceEpistemicState, EXTRACTION_EPISTEMIC_STATE } from "./epistemic.js";
import {
  assertLengthUnit,
  assertPositiveInteger,
  assertPositiveNumber,
} from "./validate.js";
import {
  canonicalizePointSet,
  DeterministicRng,
  canonicalContentHash,
  fitPlane,
  vec3Cross,
  vec3Norm,
  vec3Sub,
  type GeomPoint,
  type LengthUnit,
  type PlaneFitResult,
  type Vec3,
} from "@aise/backend-geometry";
import type { EpistemicState } from "@aise/shared-contracts";

/** Method label for the sequential plane segmentation. */
export const SEGMENTATION_METHOD = "segment/plane-ransac-seq-v1";

/** Fixed seed for candidate sampling (recorded in provenance). */
export const SEGMENTATION_SEED = 0x5eed0a1e;

/** Default inlier band half-width, in the input unit. */
export const DEFAULT_INLIER_DISTANCE = 0.03;

/** Default minimum points for an accepted planar cluster. */
export const DEFAULT_MIN_CLUSTER_POINTS = 100;

/** Default cap on extracted segments per cloud. */
export const DEFAULT_MAX_SEGMENTS = 64;

/** Default cap on total segmentation input points. */
export const DEFAULT_MAX_SEGMENTATION_POINTS = 50000;

/** Default cap on points in one accepted cluster (fit input bound). */
export const DEFAULT_MAX_SEGMENT_POINTS = 10000;

/** Default cap on candidate hypotheses per extraction round. */
export const DEFAULT_MAX_PLANE_CANDIDATES = 256;

/** Default k-nearest neighborhood size for local candidate triples. */
export const DEFAULT_NEIGHBORHOOD_SIZE = 24;

/** Default bounded refinement rounds per extraction. */
export const DEFAULT_REFINEMENT_ROUNDS = 3;

/** Bounded stride-subset size for candidate scoring. */
const SCORING_SUBSET_TARGET = 2048;

/** A candidate plane through three canonically indexed points. */
interface CandidatePlane {
  readonly point: GeomPoint;
  readonly normal: Vec3;
}

/** Input for planar segmentation. */
export interface SegmentationInput {
  readonly points: readonly GeomPoint[];
  /** Unit of the point coordinates (explicit — never implicit). */
  readonly unit: LengthUnit;
  /**
   * Epistemic state of the point source as declared by the caller
   * (reconstruction clouds are INFERRED; survey control points may
   * be OBSERVED). The extraction result is INFERRED regardless —
   * this declaration is recorded in provenance.
   */
  readonly sourceEpistemic?: EpistemicState;
  /** Isotropic per-axis 1σ of point positions, in `unit` (optional). */
  readonly perPointStandardUncertainty?: number;
}

/** Options for planar segmentation (all validated, all recorded). */
export interface SegmentationOptions {
  /** Inlier band half-width around a candidate plane (input unit). */
  readonly inlierDistance?: number;
  /** Minimum points for an accepted cluster. */
  readonly minClusterPoints?: number;
  /** Cap on extracted segments. */
  readonly maxSegments?: number;
  /** Cap on total input points (bounded compute). */
  readonly maxSegmentationPoints?: number;
  /** Cap on points in one accepted cluster. */
  readonly maxSegmentPoints?: number;
  /** Cap on candidate hypotheses per extraction round. */
  readonly maxPlaneCandidates?: number;
  /** k-nearest neighborhood size for local candidate triples. */
  readonly neighborhoodSize?: number;
  /** Bounded TLS-refit/reclassify rounds per extraction. */
  readonly refinementRounds?: number;
}

/** Fully materialized segmentation options (provenance record). */
export type SegmentationSettings = Required<SegmentationOptions>;

/** One planar cluster: points, fitted plane, lineage. */
export interface PlanarCluster {
  /** Deterministic content-derived cluster identity (`seg-<hex16>`). */
  readonly clusterId: string;
  /** Extraction order index (deterministic). */
  readonly index: number;
  /** Cluster points in canonical order (the fit's input). */
  readonly points: readonly GeomPoint[];
  /** TLS plane fit over the cluster points (AISE-009 lineage embedded). */
  readonly planeFit: PlaneFitResult;
  /** Canonical content hash of {unit, points, plane} — cluster identity. */
  readonly contentHash: string;
  /** Cluster provenance: method, parameters, cloud input reference. */
  readonly provenance: ExtractionProvenance;
  /** Always INFERRED (segmentation is inference; guarded). */
  readonly epistemicState: EpistemicState;
}

/** Result of segmenting one cloud. */
export interface SegmentationResult {
  readonly kind: "segmentation";
  readonly clusters: readonly PlanarCluster[];
  /** Points that joined no cluster (never silently dropped). */
  readonly residualPointCount: number;
  /** Content hash of the residual points (canonical order). */
  readonly residualPointsContentHash: string;
  readonly provenance: ExtractionProvenance;
  readonly epistemicState: EpistemicState;
  /** The exact settings this run used (reproducibility record). */
  readonly settings: SegmentationSettings;
}

/** Validates and materializes segmentation options with defaults. */
export function segmentationSettings(options: SegmentationOptions = {}): SegmentationSettings {
  const inlierDistance = assertPositiveNumber(
    options.inlierDistance ?? DEFAULT_INLIER_DISTANCE,
    "inlierDistance",
  );
  const minClusterPoints = assertPositiveInteger(
    options.minClusterPoints ?? DEFAULT_MIN_CLUSTER_POINTS,
    "minClusterPoints",
  );
  const maxSegments = assertPositiveInteger(options.maxSegments ?? DEFAULT_MAX_SEGMENTS, "maxSegments");
  const maxSegmentationPoints = assertPositiveInteger(
    options.maxSegmentationPoints ?? DEFAULT_MAX_SEGMENTATION_POINTS,
    "maxSegmentationPoints",
  );
  const maxSegmentPoints = assertPositiveInteger(
    options.maxSegmentPoints ?? DEFAULT_MAX_SEGMENT_POINTS,
    "maxSegmentPoints",
  );
  const maxPlaneCandidates = assertPositiveInteger(
    options.maxPlaneCandidates ?? DEFAULT_MAX_PLANE_CANDIDATES,
    "maxPlaneCandidates",
  );
  const neighborhoodSize = assertPositiveInteger(
    options.neighborhoodSize ?? DEFAULT_NEIGHBORHOOD_SIZE,
    "neighborhoodSize",
  );
  const refinementRounds = assertPositiveInteger(
    options.refinementRounds ?? DEFAULT_REFINEMENT_ROUNDS,
    "refinementRounds",
  );
  if (minClusterPoints > maxSegmentPoints) {
    throw new SemanticsError("VALIDATION_FAILED", "minClusterPoints must not exceed maxSegmentPoints", {
      details: { minClusterPoints, maxSegmentPoints },
    });
  }
  return {
    inlierDistance,
    minClusterPoints,
    maxSegments,
    maxSegmentationPoints,
    maxSegmentPoints,
    maxPlaneCandidates,
    neighborhoodSize,
    refinementRounds,
  };
}

/** Plane through three points, or null when the triple is degenerate. */
function planeFromTriple(p0: GeomPoint, p1: GeomPoint, p2: GeomPoint): CandidatePlane | null {
  const u = vec3Sub(p1, p0);
  const v = vec3Sub(p2, p0);
  const normalRaw = vec3Cross(u, v);
  const norm = vec3Norm(normalRaw);
  if (norm < 1e-12) {
    return null;
  }
  return {
    point: p0,
    normal: { x: normalRaw.x / norm, y: normalRaw.y / norm, z: normalRaw.z / norm },
  };
}

/** Signed distance from a point to a candidate plane. */
function signedDistance(plane: CandidatePlane, p: GeomPoint): number {
  const d = vec3Sub(p, plane.point);
  return d.x * plane.normal.x + d.y * plane.normal.y + d.z * plane.normal.z;
}

/**
 * Deterministic k-nearest neighbor indices of `center` within the
 * canonical point list, excluding the center itself, ties broken
 * by canonical index. Uses squared distances (monotone in distance;
 * the sqrt is redundant for selection).
 */
function nearestIndices(points: readonly GeomPoint[], center: number, k: number): number[] {
  const c = points[center] as GeomPoint;
  const best: Array<{ index: number; dist2: number }> = [];
  for (let i = 0; i < points.length; i += 1) {
    if (i === center) {
      continue;
    }
    const p = points[i] as GeomPoint;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const dz = p.z - c.z;
    const dist2 = dx * dx + dy * dy + dz * dz;
    if (best.length < k) {
      best.push({ index: i, dist2 });
      if (best.length === k) {
        best.sort((a, b) => (a.dist2 !== b.dist2 ? a.dist2 - b.dist2 : a.index - b.index));
      }
      continue;
    }
    const worst = best[best.length - 1] as { index: number; dist2: number };
    if (dist2 < worst.dist2 || (dist2 === worst.dist2 && i < worst.index)) {
      best[best.length - 1] = { index: i, dist2 };
      // Re-bubble the replaced element into sorted position (k is small).
      let pos = best.length - 1;
      while (pos > 0) {
        const cur = best[pos] as { index: number; dist2: number };
        const prev = best[pos - 1] as { index: number; dist2: number };
        if (cur.dist2 < prev.dist2 || (cur.dist2 === prev.dist2 && cur.index < prev.index)) {
          best[pos - 1] = cur;
          best[pos] = prev;
          pos -= 1;
        } else {
          break;
        }
      }
    }
  }
  return best.map((entry) => entry.index);
}

/**
 * The canonical stride subset for candidate scoring: indices
 * 0, m, 2m, … of the canonical order with m a pure function of the
 * length (bounded subset, order-free).
 */
function scoringSubsetIndices(length: number): number[] {
  const stride = Math.max(1, Math.ceil(length / SCORING_SUBSET_TARGET));
  const indices: number[] = [];
  for (let i = 0; i < length; i += stride) {
    indices.push(i);
  }
  return indices;
}

/**
 * Indices of points within the inlier band of a candidate plane.
 * `candidateIndices === null` means all points (canonical order).
 */
function inlierIndices(
  points: readonly GeomPoint[],
  plane: CandidatePlane,
  inlierDistance: number,
  candidateIndices: readonly number[] | null,
): number[] {
  const result: number[] = [];
  const n = points.length;
  const indices = candidateIndices ?? Array.from({ length: n }, (_, i) => i);
  for (const i of indices) {
    if (Math.abs(signedDistance(plane, points[i] as GeomPoint)) <= inlierDistance) {
      result.push(i);
    }
  }
  return result;
}

/** Equality of two canonical index lists (refinement stability check). */
function sameIndices(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Segments a point cloud into planar clusters (stage 1 of
 * architectural extraction). Deterministic: the same point SET in
 * any input order yields bit-identical output. Fail-closed on
 * invalid input; honest about residual points.
 */
export function segmentPointCloud(
  input: SegmentationInput,
  options: SegmentationOptions = {},
): SegmentationResult {
  const settings = segmentationSettings(options);
  const unit = assertLengthUnit(input.unit);
  const sourceEpistemic = assertSourceEpistemicState(input.sourceEpistemic ?? "INFERRED");
  if (
    input.perPointStandardUncertainty !== undefined &&
    (!Number.isFinite(input.perPointStandardUncertainty) || input.perPointStandardUncertainty <= 0)
  ) {
    throw new SemanticsError(
      "VALIDATION_FAILED",
      `perPointStandardUncertainty must be a finite number > 0: ${String(input.perPointStandardUncertainty)}`,
      { details: { value: String(input.perPointStandardUncertainty) } },
    );
  }
  if (!Array.isArray(input.points)) {
    throw new SemanticsError("VALIDATION_FAILED", "points must be an array", { details: {} });
  }
  if (input.points.length < settings.minClusterPoints) {
    throw new SemanticsError(
      "INSUFFICIENT_POINTS",
      `segmentation requires at least ${settings.minClusterPoints} points, got ${input.points.length}`,
      { details: { required: settings.minClusterPoints, actual: input.points.length } },
    );
  }
  if (input.points.length > settings.maxSegmentationPoints) {
    throw new SemanticsError(
      "BOUNDS_EXCEEDED",
      `segmentation input exceeds the bounded-compute cap of ${settings.maxSegmentationPoints} points (${input.points.length}) — downsample deterministically`,
      { details: { cap: settings.maxSegmentationPoints, actual: input.points.length } },
    );
  }
  let remaining: GeomPoint[];
  try {
    remaining = canonicalizePointSet(input.points, {
      minCount: settings.minClusterPoints,
      label: "segmentation points",
    });
  } catch (error) {
    throw wrapGeometryFailure("segmentation", error);
  }

  const cloudRef = pointSetInputRef(remaining, sourceEpistemic);
  const clusters: PlanarCluster[] = [];
  const seenClusterHashes = new Set<string>();

  while (remaining.length >= settings.minClusterPoints && clusters.length < settings.maxSegments) {
    const rng = new DeterministicRng(SEGMENTATION_SEED);
    const subset = scoringSubsetIndices(remaining.length);
    let bestScore = -1;
    let bestCandidateIndex = -1;
    let bestPlane: CandidatePlane | null = null;

    for (let c = 0; c < settings.maxPlaneCandidates; c += 1) {
      const center = rng.nextUint32() % remaining.length;
      const neighbors = nearestIndices(remaining, center, settings.neighborhoodSize);
      if (neighbors.length < 2) {
        continue;
      }
      const first = neighbors[0] as number;
      const last = neighbors[neighbors.length - 1] as number;
      if (first === last) {
        continue;
      }
      const plane = planeFromTriple(
        remaining[center] as GeomPoint,
        remaining[first] as GeomPoint,
        remaining[last] as GeomPoint,
      );
      if (plane === null) {
        continue;
      }
      let score = 0;
      for (const i of subset) {
        if (Math.abs(signedDistance(plane, remaining[i] as GeomPoint)) <= settings.inlierDistance) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestCandidateIndex = c;
        bestPlane = plane;
      }
    }

    if (bestPlane === null || bestScore < 1) {
      break;
    }

    // Full classification + bounded TLS refinement against ALL remaining points.
    let currentInliers = inlierIndices(remaining, bestPlane, settings.inlierDistance, null);
    if (currentInliers.length < settings.minClusterPoints) {
      break;
    }
    let planeFit: PlaneFitResult;
    try {
      planeFit = fitPlane({
        points: currentInliers.map((i) => remaining[i] as GeomPoint),
        unit,
        sourceEpistemic,
        perPointStandardUncertainty: input.perPointStandardUncertainty,
      });
    } catch (error) {
      throw wrapGeometryFailure("segmentation refinement", error);
    }
    for (let round = 0; round < settings.refinementRounds; round += 1) {
      const refinedPlane: CandidatePlane = {
        point: planeFit.plane.point,
        normal: planeFit.plane.normal,
      };
      const nextInliers = inlierIndices(remaining, refinedPlane, settings.inlierDistance, null);
      if (sameIndices(nextInliers, currentInliers)) {
        break;
      }
      currentInliers = nextInliers;
      if (currentInliers.length < settings.minClusterPoints) {
        break;
      }
      try {
        planeFit = fitPlane({
          points: currentInliers.map((i) => remaining[i] as GeomPoint),
          unit,
          sourceEpistemic,
          perPointStandardUncertainty: input.perPointStandardUncertainty,
        });
      } catch (error) {
        throw wrapGeometryFailure("segmentation refinement", error);
      }
    }
    if (currentInliers.length < settings.minClusterPoints) {
      break;
    }
    if (currentInliers.length > settings.maxSegmentPoints) {
      throw new SemanticsError(
        "BOUNDS_EXCEEDED",
        `cluster exceeds the bounded fit-input cap of ${settings.maxSegmentPoints} points (${currentInliers.length}) — downsample deterministically`,
        { details: { cap: settings.maxSegmentPoints, actual: currentInliers.length } },
      );
    }

    const clusterPoints = currentInliers.map((i) => remaining[i] as GeomPoint);
    const contentHash = canonicalContentHash({
      unit,
      points: clusterPoints,
      plane: { point: planeFit.plane.point, normal: planeFit.plane.normal },
    });
    if (seenClusterHashes.has(contentHash)) {
      throw new SemanticsError(
        "IDENTITY_COLLISION",
        "two clusters carry identical content — the input is not a faithful set of distinct observations",
        { details: { contentHash } },
      );
    }
    seenClusterHashes.add(contentHash);
    const clusterProvenance = extractionProvenance(
      SEGMENTATION_METHOD,
      {
        inlierDistance: settings.inlierDistance,
        minClusterPoints: settings.minClusterPoints,
        refinementRounds: settings.refinementRounds,
        maxPlaneCandidates: settings.maxPlaneCandidates,
        neighborhoodSize: settings.neighborhoodSize,
        seed: SEGMENTATION_SEED,
        scoringSubsetSize: subset.length,
        selectedCandidateIndex: bestCandidateIndex,
        extractionIndex: clusters.length,
        planeFitMethod: planeFit.provenance.method,
      },
      [cloudRef],
    );
    clusters.push({
      clusterId: `seg-${contentHash.slice(0, 16)}`,
      index: clusters.length,
      points: clusterPoints,
      planeFit,
      contentHash,
      provenance: clusterProvenance,
      epistemicState: EXTRACTION_EPISTEMIC_STATE,
    });

    // Remove the accepted cluster's points (mask over canonical order).
    const remove = new Set<number>(currentInliers);
    remaining = remaining.filter((_, i) => !remove.has(i));
  }

  const resultProvenance = extractionProvenance(
    SEGMENTATION_METHOD,
    {
      inlierDistance: settings.inlierDistance,
      minClusterPoints: settings.minClusterPoints,
      maxSegments: settings.maxSegments,
      maxPlaneCandidates: settings.maxPlaneCandidates,
      neighborhoodSize: settings.neighborhoodSize,
      refinementRounds: settings.refinementRounds,
      seed: SEGMENTATION_SEED,
      extractedSegments: clusters.length,
      residualPointCount: remaining.length,
      inputPointCount: input.points.length,
    },
    [cloudRef],
  );

  return {
    kind: "segmentation",
    clusters,
    residualPointCount: remaining.length,
    residualPointsContentHash: canonicalContentHash(remaining),
    provenance: resultProvenance,
    epistemicState: EXTRACTION_EPISTEMIC_STATE,
    settings,
  };
}
