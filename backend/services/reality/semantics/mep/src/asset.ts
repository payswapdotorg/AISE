/**
 * MEP asset reconstruction: valves and equipment (AISE-027).
 *
 * CRITICAL acceptance (work order): valves/equipment and the
 * connectivity graph, with asset/topology fixtures, uncertainty and
 * evidence linkage.
 *
 * Honest v1 discipline:
 * - an ASSET CANDIDATE is a compact (non-slender) cluster with at
 *   least `minPipePoints` points — the squat clusters the pipe
 *   classifier honestly refuses are exactly the blobs that can be
 *   valves or equipment, never coerced pipes;
 * - a candidate becomes a network asset ONLY with connection
 *   evidence: at least one pipe ENDPOINT within `assetTolerance` of
 *   the candidate's scanned surface (the surface-gap metric, the
 *   AISE-026 gap-connected discipline — the physical joint itself
 *   is not scanned). A compact cluster with no connection evidence
 *   is honestly left `unassigned` (`unconnected-cluster`), never
 *   claimed as an asset;
 * - the ROLE is geometric, evidence-pinned, never semantic:
 *   - **valve** — inline-continuation evidence: two connections
 *     from DISTINCT pipes whose fitted axes are colinear
 *     (|cos| ≥ `COLINEAR_COS_MIN`) with their endpoints on
 *     OPPOSITE sides of the candidate centroid (the run continues
 *     THROUGH the asset — the classic gap-connected inline body);
 *   - **equipment** — terminal evidence: pipe ends that do not
 *     continue through (single connections, or ends arriving from
 *     non-colinear directions / the same side);
 *   manufacturer-class identification is NOT claimed and belongs
 *   to later work items (recorded in the limitations);
 * - identities are content-derived (`mep-asset-<hex16>`, the
 *   AISE-011 lineage discipline); provenance pins the
 *   content-hashed input point-set and the source epistemic state
 *   (passthrough — never upgraded);
 * - uncertainty: the size is the sphere-equivalent 2·mean-radial
 *   estimate with a standard-error uncertainty; the position
 *   uncertainty is the isotropic per-axis centroid standard error
 *   (`perPointStandardUncertainty/√N`); both ABSENT for noise-free
 *   inputs (absent means not stated, never zero).
 *
 * Pure geometry — no environment, no clock, no randomness.
 */
import type { GeomPoint } from "@aise/backend-geometry";
import {
  canonicalJsonString,
  sha256Hex,
  modelProvenance,
  type EpistemicState,
  type ModelProvenance,
  type Quantity,
  type StandardUncertainty,
} from "@aise/engineering-model";
import type { PointCluster } from "./cluster.js";
import type { MepPipe, UnassignedCluster } from "./network.js";
import { canonicalNumber, clusterHash, quantityOf } from "./internal.js";

/** Default pipe-endpoint-to-asset-surface tolerance (in the input unit). */
export const DEFAULT_ASSET_TOLERANCE = 0.35;

/** The colinear-continuation gate: |cos| between the two axes (cos 30°). */
export const COLINEAR_COS_MIN = 0.866;

/** The reconstructed asset role (geometric, evidence-pinned). */
export type AssetRole = "valve" | "equipment";

/** The evidence basis behind the role. */
export type AssetRoleBasis = "inline-continuation" | "terminal";

/** One asset candidate's compact-blob statistics (pure geometry). */
export interface AssetBlobStats {
  /** Mean of the cluster points (the asset position estimate). */
  readonly centroid: { readonly x: number; readonly y: number; readonly z: number };
  /** Mean radial distance from the centroid (the sphere-equivalent radius). */
  readonly meanRadius: number;
  /** Radial scatter around the mean radius, verbatim (anisotropy facts). */
  readonly residuals: { readonly rms: number; readonly max: number };
  readonly pointCount: number;
}

/** One raw pipe-endpoint connection to a candidate (pre-identity). */
export interface RawAssetConnection {
  readonly pipeId: string;
  /** 0 = start endpoint, 1 = end endpoint (the pipe's canonical order). */
  readonly endpointIndex: 0 | 1;
  /** Surface gap: the pipe endpoint to the NEAREST candidate cluster point. */
  readonly surfaceGap: number;
  /** The nearest candidate cluster point (the scanned surface). */
  readonly surfacePoint: { readonly x: number; readonly y: number; readonly z: number };
}

/** One asset↔pipe connection in the reconstructed topology. */
export interface MepAssetConnection {
  readonly assetId: string;
  readonly pipeId: string;
  /** 0 = start endpoint, 1 = end endpoint (the pipe's canonical order). */
  readonly endpointIndex: 0 | 1;
  /** Surface gap (in the input unit). */
  readonly surfaceGap: number;
  /** The nearest asset cluster point (the scanned surface). */
  readonly surfacePoint: { readonly x: number; readonly y: number; readonly z: number };
}

/** One reconstructed network asset (valve or equipment). */
export interface MepAsset {
  /** Content-derived identity: `mep-asset-<hex16>`. */
  readonly assetId: string;
  /** Canonical content hash of the asset's representation. */
  readonly contentHash: string;
  /** Geometric role (evidence-pinned, never semantic identification). */
  readonly role: AssetRole;
  /** The evidence basis for the role. */
  readonly roleBasis: AssetRoleBasis;
  /** Position estimate (the cluster centroid). */
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  /** Isotropic per-axis centroid standard error, in the topology unit; ABSENT for noise-free inputs. */
  readonly positionUncertainty?: StandardUncertainty;
  /** Sphere-equivalent size (2·mean radial; estimate). */
  readonly size: Quantity;
  /** Epistemic state (passthrough of the source state — never upgraded). */
  readonly epistemic: EpistemicState;
  /** Radial scatter facts, verbatim. */
  readonly residuals: { readonly rms: number; readonly max: number };
  readonly pointCount: number;
  /** Connections in canonical (pipeId, endpointIndex) order. */
  readonly connections: readonly MepAssetConnection[];
  readonly provenance: ModelProvenance;
}

/** The classification outcome of one asset candidate. */
export type AssetClassification =
  | { readonly kind: "asset"; readonly asset: MepAsset }
  | { readonly kind: "unassigned"; readonly unassigned: UnassignedCluster };

/**
 * Computes one candidate's compact-blob statistics (centroid, mean
 * radial extent, scatter). Pure arithmetic over the cluster's
 * canonical member order.
 */
export function fitAssetBlob(points: readonly GeomPoint[]): AssetBlobStats {
  if (points.length === 0) {
    throw new Error(`an asset blob needs at least 1 point: ${points.length}`);
  }
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
    z += point.z;
  }
  const centroid = { x: x / points.length, y: y / points.length, z: z / points.length };
  const radials: number[] = [];
  let radialSum = 0;
  for (const point of points) {
    const radial = Math.hypot(point.x - centroid.x, point.y - centroid.y, point.z - centroid.z);
    radials.push(radial);
    radialSum += radial;
  }
  const meanRadius = radialSum / points.length;
  let scatterSquareSum = 0;
  let scatterMax = 0;
  for (const radial of radials) {
    const deviation = radial - meanRadius;
    scatterSquareSum += deviation * deviation;
    scatterMax = Math.max(scatterMax, Math.abs(deviation));
  }
  return {
    centroid,
    meanRadius,
    residuals: { rms: Math.sqrt(scatterSquareSum / points.length), max: scatterMax },
    pointCount: points.length,
  };
}

/**
 * Extracts the raw connections: every pipe ENDPOINT within
 * `assetTolerance` of the candidate's scanned surface (the nearest
 * cluster point — the surface-gap metric).
 *
 * Deterministic: the nearest-point argmin keeps the FIRST minimum
 * in the cluster's canonical member order.
 */
export function extractConnections(
  clusterPointsOfBlob: readonly GeomPoint[],
  pipes: readonly MepPipe[],
  assetTolerance: number,
): RawAssetConnection[] {
  const connections: RawAssetConnection[] = [];
  for (const pipe of pipes) {
    for (const endpointIndex of [0, 1] as const) {
      const endpoint = endpointIndex === 0 ? pipe.centerline.start : pipe.centerline.end;
      let best = Number.POSITIVE_INFINITY;
      let bestPoint: GeomPoint | undefined;
      for (const candidate of clusterPointsOfBlob) {
        const distance = Math.hypot(
          endpoint.x - candidate.x,
          endpoint.y - candidate.y,
          endpoint.z - candidate.z,
        );
        if (distance < best) {
          best = distance;
          bestPoint = candidate;
        }
      }
      if (bestPoint !== undefined && best <= assetTolerance) {
        connections.push({
          pipeId: pipe.pipeId,
          endpointIndex,
          surfaceGap: canonicalNumber(best),
          surfacePoint: { x: bestPoint.x, y: bestPoint.y, z: bestPoint.z },
        });
      }
    }
  }
  connections.sort((a, b) => (a.pipeId < b.pipeId ? -1 : a.pipeId > b.pipeId ? 1 : a.endpointIndex - b.endpointIndex));
  return connections;
}

/**
 * Classifies the role from the connection pattern (evidence-pinned,
 * never semantic):
 *
 * - **valve** — inline-continuation: a pair of connections from
 *   DISTINCT pipes, colinear fitted axes (|cos| ≥
 *   `COLINEAR_COS_MIN`), endpoints on OPPOSITE sides of the
 *   centroid (the run continues THROUGH the candidate);
 * - **equipment** — terminal: connections exist but no
 *   continuation pair;
 * - **null** — no connections at all (the honest refusal case).
 */
export function classifyRole(
  connections: readonly RawAssetConnection[],
  centroid: { readonly x: number; readonly y: number; readonly z: number },
  pipes: readonly MepPipe[],
): { readonly role: AssetRole; readonly roleBasis: AssetRoleBasis } | null {
  if (connections.length === 0) {
    return null;
  }
  const pipeById = new Map(pipes.map((pipe) => [pipe.pipeId, pipe] as const));
  for (let i = 0; i < connections.length; i += 1) {
    for (let j = i + 1; j < connections.length; j += 1) {
      const first = connections[i]!;
      const second = connections[j]!;
      if (first.pipeId === second.pipeId) {
        continue;
      }
      const pipeA = pipeById.get(first.pipeId);
      const pipeB = pipeById.get(second.pipeId);
      if (pipeA === undefined || pipeB === undefined) {
        continue;
      }
      const axisCos = Math.abs(
        pipeA.axis.x * pipeB.axis.x + pipeA.axis.y * pipeB.axis.y + pipeA.axis.z * pipeB.axis.z,
      );
      if (axisCos < COLINEAR_COS_MIN) {
        continue;
      }
      const endpointA = first.endpointIndex === 0 ? pipeA.centerline.start : pipeA.centerline.end;
      const endpointB = second.endpointIndex === 0 ? pipeB.centerline.start : pipeB.centerline.end;
      const sideA = {
        x: centroid.x - endpointA.x,
        y: centroid.y - endpointA.y,
        z: centroid.z - endpointA.z,
      };
      const sideB = {
        x: centroid.x - endpointB.x,
        y: centroid.y - endpointB.y,
        z: centroid.z - endpointB.z,
      };
      if (sideA.x * sideB.x + sideA.y * sideB.y + sideA.z * sideB.z >= 0) {
        continue; // same side — not a continuation through the candidate
      }
      return { role: "valve", roleBasis: "inline-continuation" };
    }
  }
  return { role: "equipment", roleBasis: "terminal" };
}

/** The asset content hash over its canonical content (the AISE-011 lineage). */
export function assetContentHashOf(
  position: { readonly x: number; readonly y: number; readonly z: number },
  sizeValue: number,
  role: AssetRole,
  pointCount: number,
): string {
  return sha256Hex(canonicalJsonString([position, sizeValue, role, pointCount]));
}

/**
 * Builds one network asset from a candidate cluster (or the honest
 * `unconnected-cluster` refusal when no connection evidence
 * exists).
 */
export function buildAsset(
  cluster: PointCluster,
  pipes: readonly MepPipe[],
  options: {
    readonly unit: string;
    readonly sourceEpistemic: EpistemicState;
    readonly perPointSigma: number | undefined;
    readonly assetTolerance: number;
    readonly inputContentHash: string;
    readonly inputPointCount: number;
  },
): AssetClassification {
  const stats = fitAssetBlob(cluster.points);
  const connections = extractConnections(cluster.points, pipes, options.assetTolerance);
  const classification = classifyRole(connections, stats.centroid, pipes);
  if (classification === null) {
    return {
      kind: "unassigned",
      unassigned: { pointCount: cluster.points.length, contentHash: clusterHash(cluster), reason: "unconnected-cluster" },
    };
  }
  const sizeUncertainty = stats.pointCount >= 2 && (2 * stats.residuals.rms) / Math.sqrt(stats.pointCount) > 1e-12
    ? (2 * stats.residuals.rms) / Math.sqrt(stats.pointCount)
    : undefined;
  const positionUncertainty =
    options.perPointSigma !== undefined && options.perPointSigma > 0 && stats.pointCount > 0
      ? canonicalNumber(options.perPointSigma / Math.sqrt(stats.pointCount))
      : undefined;
  const assetWithoutIdentity: Omit<MepAsset, "assetId" | "contentHash" | "connections"> = {
    role: classification.role,
    roleBasis: classification.roleBasis,
    position: { x: canonicalNumber(stats.centroid.x), y: canonicalNumber(stats.centroid.y), z: canonicalNumber(stats.centroid.z) },
    ...(positionUncertainty !== undefined ? { positionUncertainty: { kind: "standard" as const, u: positionUncertainty } } : {}),
    size: quantityOf(2 * stats.meanRadius, options.unit, sizeUncertainty),
    epistemic: options.sourceEpistemic,
    residuals: stats.residuals,
    pointCount: stats.pointCount,
    provenance: modelProvenance(
      "mep/asset-v1",
      { inputContentHash: options.inputContentHash, pointCount: stats.pointCount, role: classification.role, roleBasis: classification.roleBasis },
      [
        {
          kind: "point-set",
          contentHash: options.inputContentHash,
          pointCount: options.inputPointCount,
          epistemic: options.sourceEpistemic,
        },
      ],
    ),
  };
  const contentHash = assetContentHashOf(
    assetWithoutIdentity.position,
    assetWithoutIdentity.size.value,
    assetWithoutIdentity.role,
    assetWithoutIdentity.pointCount,
  );
  const assetId = `mep-asset-${contentHash.slice(0, 16)}`;
  const asset: MepAsset = {
    ...assetWithoutIdentity,
    contentHash,
    assetId,
    connections: Object.freeze(
      connections.map((connection) => ({
        assetId,
        pipeId: connection.pipeId,
        endpointIndex: connection.endpointIndex,
        surfaceGap: connection.surfaceGap,
        surfacePoint: connection.surfacePoint,
      })),
    ),
  };
  return { kind: "asset", asset };
}
