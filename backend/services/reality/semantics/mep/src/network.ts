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
 *
 * AISE-027 note: the shared pipeline internals (canonicalization,
 * pipe building, junction derivation, digest) live in `internal.ts`
 * (pure code motion from this module) so the AISE-027 topology
 * reconstruction composes the EXACT same pipe representation.
 */
import type { GeomPoint } from "@aise/backend-geometry";
import {
  type EpistemicState,
  type ModelProvenance,
  type Quantity,
} from "@aise/engineering-model";
import { MepError } from "./errors.js";
import { clusterPoints } from "./cluster.js";
import { fitCylinder } from "./fit.js";
import {
  assertLengthUnit,
  assertPositive,
  canonicalizeInput,
  junctionsOf,
  networkDigest,
  pipeOf,
  unassignedOf,
} from "./internal.js";

export { DIAMETER_RELATION_FRACTION } from "./internal.js";

/** Default proximity clustering radius (in the input unit). */
export const DEFAULT_CLUSTER_RADIUS = 0.1;

/** Default endpoint-to-centerline junction tolerance (in the input unit). */
export const DEFAULT_JOIN_TOLERANCE = 0.08;

/** Minimum cluster size for a pipe candidate. */
export const DEFAULT_MIN_PIPE_POINTS = 12;

/** A pipe must be at least this many diameters long (the slenderness gate). */
export const SLENDERNESS_MIN = 3;

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
  /**
   * Refusal reason. AISE-026 emits the first two; the AISE-027
   * topology reconstruction additionally emits `unconnected-cluster`
   * (a compact cluster with no connection evidence to any pipe is
   * never claimed as a network asset).
   */
  readonly reason: "insufficient-points" | "non-slender-cluster" | "unconnected-cluster";
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
  const { canonical, inputContentHash } = canonicalizeInput(input.points);

  // 2+3+4. Cluster, fit, classify (honest gates).
  const pipes: MepPipe[] = [];
  const unassigned: UnassignedCluster[] = [];
  for (const cluster of clusterPoints(canonical, clusterRadius)) {
    const candidate =
      cluster.points.length < minPipePoints
        ? unassignedOf(cluster, "insufficient-points")
        : fitCylinder(cluster.points);
    if ("reason" in candidate) {
      unassigned.push(candidate);
      continue;
    }
    const fit = candidate;
    if (fit.length < SLENDERNESS_MIN * fit.diameter) {
      unassigned.push(unassignedOf(cluster, "non-slender-cluster"));
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
