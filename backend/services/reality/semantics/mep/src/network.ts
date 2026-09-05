/**
 * The deterministic MEP pipe network reconstruction (AISE-026).
 *
 * CRITICAL acceptance (work order): pipe centerline, diameter and
 * connectivity representation with topology/evidence correctness,
 * validated on a controlled fixture benchmark.
 *
 * Pipeline (pure, deterministic, fail-closed):
 * 1. **canonicalize** — points validated (finite, unit) and sorted
 *    (the input's emission order never matters);
 * 2. **cluster** — grid-hash proximity clustering over the
 *    canonical order (deterministic union-find);
 * 3. **fit** — per cluster: PCA axis (power iteration, fixed
 *    start/iterations), centerline = extreme projections onto the
 *    fitted axis, diameter = 2·RMS radial distance;
 * 4. **classify (honest gates)** — a cluster becomes a pipe only
 *    if it has enough points AND is slender (length ≥
 *    `SLENDERNESS_MIN`·diameter); everything else is listed
 *    `unassigned` with its reason — never coerced into
 *    plausible-looking pipes;
 * 5. **connectivity** — junctions where one pipe's ENDPOINT lies
 *    within `joinTolerance` of another pipe's CENTERLINE segment
 *    (T-branches and end-to-end couplings, both honest); the
 *    diameter relation is recorded verbatim (compatible vs
 *    mismatch — never silently averaged);
 * 6. **identity/evidence** — every pipe's identity is
 *    content-derived (SHA-256 of its canonical content, the
 *    AISE-011 lineage discipline); the network digest anchors the
 *    whole ordered representation; the provenance record pins the
 *    content-hashed input point-set and the source epistemic
 *    state (passthrough — reconstruction output is INFERRED-grade
 *    unless the source says otherwise, never upgraded).
 *
 * Authority: the pipe network is DERIVED representation on the
 * reality side (the AISE-010 extraction discipline) — it is not a
 * canonical model object layer (no canonical object-class
 * vocabulary changes; model ingestion of MEP networks is a later
 * work item's decision, never implicit here).
 */
import { compareGeomPoints, type GeomPoint } from "@aise/backend-geometry";
import {
  canonicalJsonString,
  sha256Hex,
  modelProvenance,
  type EpistemicState,
  type ModelProvenance,
  type ModelUnit,
  type Quantity,
} from "@aise/engineering-model";
import { MepError } from "./errors.js";
import { clusterPoints, type PointCluster } from "./cluster.js";
import { distanceToSegment, fitCylinder, type CylinderFit } from "./fit.js";

/** The frozen length-unit vocabulary accepted for point coordinates. */
const LENGTH_UNITS: readonly string[] = Object.freeze([
  "meter",
  "millimeter",
  "centimeter",
  "inch",
  "foot",
]);

/** Default proximity clustering radius (in the input unit). */
export const DEFAULT_CLUSTER_RADIUS = 0.1;

/** Default endpoint-to-centerline junction tolerance (in the input unit). */
export const DEFAULT_JOIN_TOLERANCE = 0.08;

/** Minimum cluster size for a pipe candidate. */
export const DEFAULT_MIN_PIPE_POINTS = 12;

/** A pipe must be at least this many diameters long (the slenderness gate). */
export const SLENDERNESS_MIN = 3;

/** Diameter relation tolerance: |dA−dB| ≤ this fraction of the larger. */
export const DIAMETER_RELATION_FRACTION = 0.25;

/** The reconstruction request. */
export interface MepInput {
  readonly points: readonly GeomPoint[];
  /** Unit of the point coordinates (explicit — never implicit). */
  readonly unit: string;
  /** Epistemic state of the point source (reconstruction clouds are INFERRED). Default INFERRED. */
  readonly sourceEpistemic?: EpistemicState;
  /** Isotropic per-point 1σ, in `unit` (optional, recorded in provenance). */
  readonly perPointStandardUncertainty?: number;
  /** Proximity clustering radius (default 0.1 in the input unit). */
  readonly clusterRadius?: number;
  /** Junction tolerance (default 0.08 in the input unit). */
  readonly joinTolerance?: number;
  /** Minimum cluster size for a pipe candidate (default 12). */
  readonly minPipePoints?: number;
}

/** One fitted pipe (centerline, diameter, length — with fit facts). */
export interface MepPipe {
  /** Content-derived identity: `mep-pipe-<hex16>`. */
  readonly pipeId: string;
  /** Canonical content hash of the pipe's representation. */
  readonly contentHash: string;
  /** Ordered centerline endpoints (lexicographically smaller first). */
  readonly centerline: {
    readonly start: { readonly x: number; readonly y: number; readonly z: number };
    readonly end: { readonly x: number; readonly y: number; readonly z: number };
  };
  /** Fitted axis (canonical sign). */
  readonly axis: { readonly x: number; readonly y: number; readonly z: number };
  /** Fitted diameter (2·RMS radial; estimate). */
  readonly diameter: Quantity;
  /** Centerline length (estimate). */
  readonly length: Quantity;
  /** Epistemic state (passthrough of the source state — never upgraded). */
  readonly epistemic: EpistemicState;
  /** Fit-quality facts, verbatim. */
  readonly residuals: { readonly rms: number; readonly max: number };
  readonly pointCount: number;
  readonly provenance: ModelProvenance;
}

/** How two joined pipes' diameters relate (recorded, never averaged). */
export type DiameterRelation = "compatible" | "mismatch";

/** One connectivity junction between two pipes. */
export interface MepJunction {
  /** The pipe whose ENDPOINT connects. */
  readonly pipeId: string;
  /** 0 = start endpoint, 1 = end endpoint. */
  readonly endpointIndex: 0 | 1;
  /** The pipe whose CENTERLINE is connected to. */
  readonly nearPipeId: string;
  /** The connection point on the near pipe's centerline. */
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  /** Endpoint-to-centerline distance (in the input unit). */
  readonly distance: number;
  /** "branch": only one endpoint involved; "coupled": both pipes' endpoints. */
  readonly kind: "branch" | "coupled";
  readonly diameterRelation: DiameterRelation;
}

/** One honestly-refused cluster. */
export interface UnassignedCluster {
  readonly pointCount: number;
  readonly contentHash: string;
  readonly reason: "insufficient-points" | "non-slender-cluster";
}

/** The reconstructed pipe network (immutable derived representation). */
export interface MepPipeNetwork {
  readonly kind: "mep-pipe-network";
  readonly unit: string;
  /** Canonical content hash of the whole ordered representation. */
  readonly digest: string;
  /** Content hash of the canonicalized input point-set. */
  readonly inputContentHash: string;
  readonly sourceEpistemic: EpistemicState;
  readonly pipes: readonly MepPipe[];
  /** Canonical order: (pipe pair, endpoint index). */
  readonly junctions: readonly MepJunction[];
  readonly unassigned: readonly UnassignedCluster[];
  readonly limitations: readonly string[];
  readonly counts: {
    readonly inputPoints: number;
    readonly pipes: number;
    readonly junctions: number;
    readonly unassigned: number;
    readonly coupled: number;
    readonly branches: number;
  };
}

/** The explicit v1 limitations (embedded in every network + README). */
export const MEP_LIMITATIONS: readonly string[] = Object.freeze([
  "v1 pipe classification is slenderness-based (length >= 3 diameters): elongated non-pipe clusters can pass the gate and are honestly flagged by their residuals; eigenvalue-isotropy and robust cylinder discrimination are later refinements.",
  "the diameter is the 2x RMS radial estimate of a SHELL-sampled cylinder; volume-sampled clouds would underestimate it (the estimator and its assumption are documented, never hidden).",
  "axis alignment is fitted, not snapped: centerlines carry the estimator's honest direction (PCA principal axis, deterministic power iteration); world-axis snapping would fabricate alignment the input does not prove.",
  "connectivity is endpoint-to-centerline proximity within the declared tolerance: junction positions are the closest centerline points; fitting geometry (elbows, tees, couplings) is NOT invented — kind records only 'branch' vs 'coupled'.",
  "diameter mismatches at junctions are recorded verbatim (compatible vs mismatch) — never averaged, never silently reconciled.",
  "the network is derived reality-side representation, not a canonical model object layer: no canonical object-class changes; ingestion decisions belong to later work items.",
  "quantities are estimates (epistemic passthrough of the source state, typically INFERRED); uncertainties are standard-error estimates that are ABSENT for noise-free inputs (absent means not stated, never zero).",
]);

/**
 * Reconstructs one pipe network from a capture point cloud.
 *
 * Fail-closed: empty input, invalid unit/options, or non-finite
 * coordinates throw `MepError` BEFORE any output; the produced
 * network always passes the built-in validator.
 */
export function reconstructPipeNetwork(input: MepInput): MepPipeNetwork {
  const unit = assertLengthUnit(input.unit);
  const sourceEpistemic = input.sourceEpistemic ?? "INFERRED";
  const clusterRadius = input.clusterRadius ?? DEFAULT_CLUSTER_RADIUS;
  const joinTolerance = input.joinTolerance ?? DEFAULT_JOIN_TOLERANCE;
  const minPipePoints = input.minPipePoints ?? DEFAULT_MIN_PIPE_POINTS;
  assertPositive(clusterRadius, "clusterRadius");
  assertPositive(joinTolerance, "joinTolerance");
  if (!Number.isInteger(minPipePoints) || minPipePoints < 2) {
    throw new MepError("OPTION_INVALID", `minPipePoints must be an integer >= 2: ${String(minPipePoints)}`, {
      details: { minPipePoints: String(minPipePoints) },
    });
  }
  if (input.perPointStandardUncertainty !== undefined) {
    const sigma = input.perPointStandardUncertainty;
    if (!Number.isFinite(sigma) || sigma < 0) {
      throw new MepError("VALIDATION_FAILED", `perPointStandardUncertainty must be finite >= 0: ${String(sigma)}`, {
        details: { perPointStandardUncertainty: String(sigma) },
      });
    }
  }
  if (input.points.length === 0) {
    throw new MepError("EMPTY_INPUT", "the point cloud is empty; no reconstruction is possible", {
      details: { points: 0 },
    });
  }

  // 1. Canonicalize: validate + sort (emission order never matters).
  const canonical: GeomPoint[] = [];
  for (const point of input.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      throw new MepError("NON_FINITE_INPUT", "point coordinates must be finite", {
        details: { point: `${point.x},${point.y},${point.z}` },
      });
    }
    canonical.push({ x: point.x, y: point.y, z: point.z });
  }
  canonical.sort(compareGeomPoints);
  const inputContentHash = sha256Hex(canonicalJsonString(canonical));

  // 2+3+4. Cluster, fit, classify (honest gates).
  const pipes: MepPipe[] = [];
  const unassigned: UnassignedCluster[] = [];
  for (const cluster of clusterPoints(canonical, clusterRadius)) {
    const candidate: CylinderFit | UnassignedCluster =
      cluster.points.length < minPipePoints
        ? unassignedOf(cluster, "insufficient-points")
        : fitCylinder(cluster.points);
    if ("reason" in candidate) {
      unassigned.push(candidate);
      continue;
    }
    const fit = candidate;
    if (fit.length < SLENDERNESS_MIN * fit.diameter) {
      unassigned.push({
        pointCount: fit.pointCount,
        contentHash: clusterHash(cluster),
        reason: "non-slender-cluster",
      });
      continue;
    }
    pipes.push(pipeOf(fit, unit, sourceEpistemic, input.perPointStandardUncertainty, inputContentHash, canonical.length));
  }

  // 5. Connectivity (canonical pair order, honest relations).
  const junctions = junctionsOf(pipes, joinTolerance);

  const network: Omit<MepPipeNetwork, "digest"> = {
    kind: "mep-pipe-network",
    unit,
    inputContentHash,
    sourceEpistemic,
    pipes: Object.freeze(pipes),
    junctions: Object.freeze(junctions),
    unassigned: Object.freeze(unassigned),
    limitations: MEP_LIMITATIONS,
    counts: {
      inputPoints: canonical.length,
      pipes: pipes.length,
      junctions: junctions.length,
      unassigned: unassigned.length,
      coupled: junctions.filter((junction) => junction.kind === "coupled").length,
      branches: junctions.filter((junction) => junction.kind === "branch").length,
    },
  };
  const digest = networkDigest(network);
  return { ...network, digest };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function assertLengthUnit(unit: string): string {
  if (!LENGTH_UNITS.includes(unit)) {
    throw new MepError("VALIDATION_FAILED", `unit must be one of ${LENGTH_UNITS.join(", ")}: ${unit}`, {
      details: { unit },
    });
  }
  return unit;
}

function assertPositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new MepError("OPTION_INVALID", `${field} must be finite > 0: ${String(value)}`, {
      details: { field, value: String(value) },
    });
  }
}

function unassignedOf(cluster: PointCluster, reason: UnassignedCluster["reason"]): UnassignedCluster {
  return { pointCount: cluster.points.length, contentHash: clusterHash(cluster), reason };
}

function clusterHash(cluster: PointCluster): string {
  return sha256Hex(canonicalJsonString(cluster.points as unknown[]));
}

function pipeOf(
  fit: CylinderFit,
  unit: string,
  sourceEpistemic: EpistemicState,
  perPointSigma: number | undefined,
  inputContentHash: string,
  inputPointCount: number,
): MepPipe {
  // Uncertainties: standard-error estimates; ABSENT for noise-free
  // inputs (absent means not stated, never zero).
  const diameterError = standardError(fit);
  const diameterUncertainty = diameterError > 1e-12 ? diameterError : undefined;
  const lengthUncertainty =
    perPointSigma !== undefined && perPointSigma > 0 && fit.pointCount > 0
      ? (2 * perPointSigma) / Math.sqrt(fit.pointCount)
      : undefined;
  const pipe: Omit<MepPipe, "pipeId" | "contentHash"> = {
    centerline: { start: fit.start, end: fit.end },
    axis: fit.axis,
    diameter: {
      value: canonicalNumber(fit.diameter),
      unit: unit as ModelUnit,
      ...(diameterUncertainty !== undefined ? { uncertainty: { kind: "standard", u: diameterUncertainty } } : {}),
    },
    length: {
      value: canonicalNumber(fit.length),
      unit: unit as ModelUnit,
      ...(lengthUncertainty !== undefined ? { uncertainty: { kind: "standard", u: lengthUncertainty } } : {}),
    },
    epistemic: sourceEpistemic,
    residuals: fit.residuals,
    pointCount: fit.pointCount,
    provenance: modelProvenance("mep/pipe-fit-v1", { inputContentHash, pointCount: fit.pointCount }, [
      { kind: "point-set", contentHash: inputContentHash, pointCount: inputPointCount, epistemic: sourceEpistemic },
    ]),
  };
  const contentHash = sha256Hex(
    canonicalJsonString([
      pipe.centerline.start,
      pipe.centerline.end,
      pipe.diameter.value,
      pipe.pointCount,
    ]),
  );
  return {
    ...pipe,
    contentHash,
    pipeId: `mep-pipe-${contentHash.slice(0, 16)}`,
  };
}

/** 2·std(r)/√N — the standard error of the RMS-radius diameter estimate. */
function standardError(fit: CylinderFit): number {
  // std of the radial distances is not carried by the fit; the RMS
  // and max bound it. Honest v1: use the RMS as the scale (for
  // shell-sampled clusters this approximates the radius spread;
  // documented in the limitations).
  if (fit.pointCount < 2) {
    return 0;
  }
  return (2 * fit.residuals.rms) / Math.sqrt(fit.pointCount);
}

function junctionsOf(pipes: readonly MepPipe[], joinTolerance: number): MepJunction[] {
  // Raw hits: one pipe's endpoint near another pipe's centerline.
  interface Hit {
    readonly pipeIndex: number;
    readonly endpointIndex: 0 | 1;
    readonly nearIndex: number;
    readonly distance: number;
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
  }
  const hits: Hit[] = [];
  for (let a = 0; a < pipes.length; a += 1) {
    const pipe = pipes[a]!;
    for (const endpointIndex of [0, 1] as const) {
      const endpoint = endpointIndex === 0 ? pipe.centerline.start : pipe.centerline.end;
      for (let b = 0; b < pipes.length; b += 1) {
        if (a === b) {
          continue;
        }
        const near = pipes[b]!;
        const { distance, closest } = distanceToSegment(
          endpoint,
          near.centerline.start,
          near.centerline.end,
        );
        if (distance <= joinTolerance) {
          hits.push({ pipeIndex: a, endpointIndex, nearIndex: b, distance, position: closest });
        }
      }
    }
  }
  // Group by unordered pipe pair; one junction per pair (deterministic:
  // the first hit in canonical (pipeIndex, endpointIndex) order wins;
  // kind = coupled when both pipes contribute endpoints).
  const byPair = new Map<string, Hit[]>();
  for (const hit of hits) {
    const key = hit.pipeIndex < hit.nearIndex ? `${hit.pipeIndex}:${hit.nearIndex}` : `${hit.nearIndex}:${hit.pipeIndex}`;
    const bucket = byPair.get(key);
    if (bucket === undefined) {
      byPair.set(key, [hit]);
    } else {
      bucket.push(hit);
    }
  }
  const junctions: MepJunction[] = [];
  const pairOrder = (key: string): [number, number] => {
    const [a, b] = key.split(":").map(Number);
    return [a!, b!];
  };
  for (const [key, pairHits] of [...byPair.entries()].sort((x, y) => {
    const [xa, xb] = pairOrder(x[0] as string);
    const [ya, yb] = pairOrder(y[0] as string);
    return xa - ya || xb - yb;
  })) {
    const [aIndex, bIndex] = key.split(":").map(Number);
    const first = pairHits[0]!;
    const bothEnds = pairHits.some((hit) => hit.pipeIndex !== first.pipeIndex);
    const pipe = pipes[first.pipeIndex]!;
    const near = pipes[first.nearIndex]!;
    junctions.push({
      pipeId: pipe.pipeId,
      endpointIndex: first.endpointIndex,
      nearPipeId: near.pipeId,
      position: first.position,
      distance: canonicalNumber(first.distance),
      kind: bothEnds ? "coupled" : "branch",
      diameterRelation:
        Math.abs(pipe.diameter.value - near.diameter.value) <=
        DIAMETER_RELATION_FRACTION * Math.max(pipe.diameter.value, near.diameter.value)
          ? "compatible"
          : "mismatch",
    });
    void aIndex;
    void bIndex;
  }
  return junctions;
}

function networkDigest(network: Omit<MepPipeNetwork, "digest">): string {
  return sha256Hex(
    canonicalJsonString({
      kind: network.kind,
      unit: network.unit,
      inputContentHash: network.inputContentHash,
      sourceEpistemic: network.sourceEpistemic,
      pipes: network.pipes.map((pipe) => pipe.contentHash),
      junctions: network.junctions.map((junction) => [
        junction.pipeId,
        junction.endpointIndex,
        junction.nearPipeId,
        junction.kind,
        junction.diameterRelation,
      ]),
      unassigned: network.unassigned.map((entry) => entry.contentHash),
    }),
  );
}

/** +0 normalization (byte-stable canonical numbers). */
function canonicalNumber(value: number): number {
  return value === 0 ? 0 : value;
}
