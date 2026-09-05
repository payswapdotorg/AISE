/**
 * The deterministic MEP asset/topology reconstruction (AISE-027).
 *
 * CRITICAL acceptance (work order): valves/equipment and the
 * connectivity graph, with asset/topology fixtures, uncertainty
 * and evidence linkage.
 *
 * Composition (pure, deterministic, fail-closed):
 * 1. the SAME canonicalization, clustering, fitting and honest
 *    pipe classification as `reconstructPipeNetwork` (AISE-026 —
 *    the shared `internal.ts` core, bit-identical pipe facts);
 * 2. compact (non-slender) clusters with enough points become
 *    ASSET CANDIDATES; each candidate is classified from its
 *    connection evidence (valve / equipment) or honestly refused
 *    (`unconnected-cluster`) — never coerced;
 * 3. the connectivity GRAPH: nodes = pipes + assets, edges =
 *    pipe-junctions (AISE-026 pairwise facts) + asset-connections,
 *    with degrees and connected components over the undirected
 *    edge set (connectivity FACTS only — no flow semantics, no
 *    pathfinding, no transitive reduction);
 * 4. the topology digest anchors the whole ordered representation
 *    (content-derived, recomputed by the built-in validator).
 *
 * Authority: derived reality-side representation with
 * evidence-pinned role labels — not canonical model object
 * classes (the AISE-026 authority discipline, unchanged).
 */
import { sha256Hex, canonicalJsonString, type EpistemicState } from "@aise/engineering-model";
import { MepError } from "./errors.js";
import { clusterPoints, type PointCluster } from "./cluster.js";
import { fitCylinder } from "./fit.js";
import {
  DEFAULT_CLUSTER_RADIUS,
  DEFAULT_JOIN_TOLERANCE,
  DEFAULT_MIN_PIPE_POINTS,
  MEP_LIMITATIONS,
  SLENDERNESS_MIN,
  type MepInput,
  type MepJunction,
  type MepPipe,
  type UnassignedCluster,
} from "./network.js";
import {
  assertLengthUnit,
  assertPositive,
  canonicalizeInput,
  junctionsOf,
  pipeOf,
  unassignedOf,
} from "./internal.js";
import {
  DEFAULT_ASSET_TOLERANCE,
  buildAsset,
  type MepAsset,
  type MepAssetConnection,
} from "./asset.js";

/** The topology reconstruction request (the AISE-026 input + asset options). */
export interface MepTopologyInput extends MepInput {
  /** Pipe-endpoint-to-asset-surface tolerance (default 0.35 in the input unit). */
  readonly assetTolerance?: number;
}

/** One connectivity-graph node (a pipe or an asset). */
export interface MepGraphNode {
  readonly id: string;
  readonly kind: "pipe" | "asset";
  /** Number of incident edges (an asset connected twice to the SAME pipe counts once). */
  readonly degree: number;
  /** Canonical connected-component index (components ordered by their smallest node id). */
  readonly component: number;
}

/** One connectivity-graph edge (a pipe junction or an asset connection). */
export type MepGraphEdge =
  | {
    readonly kind: "pipe-junction";
    /** The lexicographically smaller node id. */
    readonly a: string;
    readonly b: string;
    readonly junction: MepJunction;
  }
  | {
    readonly kind: "asset-connection";
    /** The lexicographically smaller node id (always the asset id). */
    readonly a: string;
    readonly b: string;
    /** All connections between this asset and this pipe. */
    readonly connections: readonly MepAssetConnection[];
  };

/** The connectivity graph (connectivity facts only). */
export interface MepGraph {
  /** Nodes in canonical id order. */
  readonly nodes: readonly MepGraphNode[];
  /** Edges in canonical (a, b) order. */
  readonly edges: readonly MepGraphEdge[];
  readonly counts: {
    readonly nodes: number;
    readonly edges: number;
    readonly components: number;
  };
}

/** The reconstructed MEP asset/topology representation (immutable). */
export interface MepTopology {
  readonly kind: "mep-topology";
  readonly unit: string;
  /** Canonical content hash of the whole ordered representation. */
  readonly digest: string;
  /** Content hash of the canonicalized input point-set. */
  readonly inputContentHash: string;
  readonly sourceEpistemic: EpistemicState;
  /** The pipe sub-representation — IDENTICAL to `reconstructPipeNetwork` output facts. */
  readonly pipes: readonly MepPipe[];
  readonly junctions: readonly MepJunction[];
  /** Assets in canonical cluster order. */
  readonly assets: readonly MepAsset[];
  readonly unassigned: readonly UnassignedCluster[];
  readonly limitations: readonly string[];
  readonly graph: MepGraph;
  readonly counts: {
    readonly inputPoints: number;
    readonly pipes: number;
    readonly junctions: number;
    readonly assets: number;
    readonly valves: number;
    readonly equipment: number;
    readonly assetConnections: number;
    readonly unassigned: number;
  };
}

/** The explicit AISE-027 v1 topology limitations (embedded in every topology + README). */
export const MEP_TOPOLOGY_LIMITATIONS: readonly string[] = Object.freeze([
  ...MEP_LIMITATIONS,
  "asset role classification is geometric, never semantic: 'valve' requires inline-continuation evidence (two colinear pipe ends on opposite sides of a compact cluster — the run continues through it); 'equipment' means terminal (pipe ends that do not continue through); manufacturer-class identification is NOT claimed and belongs to later work items.",
  "assets are detected as compact clusters that INTERRUPT pipe runs (gap-connected surface evidence, the fixture discipline); a bulge on a continuously-scoped run is inseparable by v1 proximity clustering and surfaces as the run's own honest cluster refusal, never as a fabricated asset.",
  "asset size is the sphere-equivalent 2x mean-radial estimate of the scanned shell; anisotropy is carried by the residuals verbatim, never averaged away; the size standard error (2·rms/√N) is that estimator's standard error — for anisotropic exact shells the scatter is shape-driven, which the residuals expose.",
  "asset position uncertainty is the isotropic per-axis centroid standard error (perPointStandardUncertainty / sqrt(N)), ABSENT for noise-free inputs (absent means not stated, never zero).",
  "the connectivity graph records connectivity FACTS only: junction/connection edges with degrees and connected components over the undirected edge set; flow direction, pathfinding semantics and transitive reduction are not invented.",
  "graph node degree counts EDGES (an asset connected twice to the same pipe counts once); component indices are canonical (components ordered by their smallest node id).",
  "the topology is derived reality-side representation with role labels pinned to geometric evidence — not canonical model object classes; ingestion/classification decisions belong to later work items.",
]);

/**
 * Reconstructs one MEP asset/topology representation from a capture
 * point cloud.
 *
 * Fail-closed: empty input, invalid unit/options, or non-finite
 * coordinates throw `MepError` BEFORE any output; the produced
 * topology always passes the built-in validator (the runtime
 * self-check).
 */
export function reconstructMepTopology(input: MepTopologyInput): MepTopology {
  const unit = assertLengthUnit(input.unit);
  const sourceEpistemic = input.sourceEpistemic ?? "INFERRED";
  const clusterRadius = input.clusterRadius ?? DEFAULT_CLUSTER_RADIUS;
  const joinTolerance = input.joinTolerance ?? DEFAULT_JOIN_TOLERANCE;
  const minPipePoints = input.minPipePoints ?? DEFAULT_MIN_PIPE_POINTS;
  const assetTolerance = input.assetTolerance ?? DEFAULT_ASSET_TOLERANCE;
  assertPositive(clusterRadius, "clusterRadius");
  assertPositive(joinTolerance, "joinTolerance");
  assertPositive(assetTolerance, "assetTolerance");
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

  // 1. Canonicalize (emission order never matters).
  const { canonical, inputContentHash } = canonicalizeInput(input.points);

  // 2. Cluster, fit, classify (the AISE-026 honest pipe gates,
  //    IDENTICAL composition; squat clusters become asset candidates).
  const pipes: MepPipe[] = [];
  const candidates: PointCluster[] = [];
  const insufficient: UnassignedCluster[] = [];
  for (const cluster of clusterPoints(canonical, clusterRadius)) {
    if (cluster.points.length < minPipePoints) {
      insufficient.push(unassignedOf(cluster, "insufficient-points"));
      continue;
    }
    const fit = fitCylinder(cluster.points);
    if (fit.length >= SLENDERNESS_MIN * fit.diameter) {
      pipes.push(pipeOf(fit, unit, sourceEpistemic, input.perPointStandardUncertainty, inputContentHash, canonical.length));
      continue;
    }
    candidates.push(cluster);
  }

  // 3. Junctions — the AISE-026 pairwise connectivity facts (identical).
  const junctions = junctionsOf(pipes, joinTolerance);

  // 4. Assets: classify every compact candidate from connection evidence.
  const assets: MepAsset[] = [];
  const unconnected: UnassignedCluster[] = [];
  for (const cluster of candidates) {
    const classification = buildAsset(cluster, pipes, {
      unit,
      sourceEpistemic,
      perPointSigma: input.perPointStandardUncertainty,
      assetTolerance,
      inputContentHash,
      inputPointCount: canonical.length,
    });
    if (classification.kind === "asset") {
      assets.push(classification.asset);
    } else {
      unconnected.push(classification.unassigned);
    }
  }

  // 5. The connectivity graph.
  const graph = buildGraph(pipes, junctions, assets);

  const topology: Omit<MepTopology, "digest"> = {
    kind: "mep-topology",
    unit,
    inputContentHash,
    sourceEpistemic,
    pipes: Object.freeze(pipes),
    junctions: Object.freeze(junctions),
    assets: Object.freeze(assets),
    unassigned: Object.freeze([...insufficient, ...unconnected]),
    limitations: MEP_TOPOLOGY_LIMITATIONS,
    graph,
    counts: {
      inputPoints: canonical.length,
      pipes: pipes.length,
      junctions: junctions.length,
      assets: assets.length,
      valves: assets.filter((asset) => asset.role === "valve").length,
      equipment: assets.filter((asset) => asset.role === "equipment").length,
      assetConnections: assets.reduce((total, asset) => total + asset.connections.length, 0),
      unassigned: insufficient.length + unconnected.length,
    },
  };
  const digest = topologyDigest(topology);
  return { ...topology, digest };
}

/** The topology digest over the whole ordered representation (content-derived). */
export function topologyDigest(topology: Omit<MepTopology, "digest">): string {
  return sha256Hex(
    canonicalJsonString({
      kind: topology.kind,
      unit: topology.unit,
      inputContentHash: topology.inputContentHash,
      sourceEpistemic: topology.sourceEpistemic,
      pipes: topology.pipes.map((pipe) => pipe.contentHash),
      junctions: topology.junctions.map((junction) => [
        junction.pipeId,
        junction.endpointIndex,
        junction.nearPipeId,
        junction.kind,
        junction.diameterRelation,
      ]),
      assets: topology.assets.map((asset) => [
        asset.contentHash,
        asset.role,
        asset.roleBasis,
        asset.connections.map((connection) => [connection.pipeId, connection.endpointIndex, connection.surfaceGap]),
      ]),
      unassigned: topology.unassigned.map((entry) => [entry.contentHash, entry.reason]),
      graph: {
        nodes: topology.graph.nodes.map((node) => [node.id, node.kind, node.degree, node.component]),
        edges: topology.graph.edges.map((edge) => [edge.kind, edge.a, edge.b]),
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// graph construction
// ---------------------------------------------------------------------------

/** Builds the connectivity graph: nodes, edges, degrees, components. */
export function buildGraph(
  pipes: readonly MepPipe[],
  junctions: readonly MepJunction[],
  assets: readonly MepAsset[],
): MepGraph {
  // Nodes: pipes + assets, canonical id order.
  const nodes: { id: string; kind: "pipe" | "asset" }[] = [
    ...pipes.map((pipe) => ({ id: pipe.pipeId, kind: "pipe" as const })),
    ...assets.map((asset) => ({ id: asset.assetId, kind: "asset" as const })),
  ];
  nodes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Edges: pipe junctions + asset connections, canonical (a, b) order.
  const edges: MepGraphEdge[] = [];
  for (const junction of junctions) {
    const [a, b] = [junction.pipeId, junction.nearPipeId].sort();
    edges.push({ kind: "pipe-junction", a: a!, b: b!, junction });
  }
  const byAssetPair = new Map<string, MepAssetConnection[]>();
  for (const asset of assets) {
    for (const connection of asset.connections) {
      const key = `${connection.assetId}\u0000${connection.pipeId}`;
      const bucket = byAssetPair.get(key);
      if (bucket === undefined) {
        byAssetPair.set(key, [connection]);
      } else {
        bucket.push(connection);
      }
    }
  }
  for (const [key, connections] of [...byAssetPair.entries()].sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))) {
    const [assetId, pipeId] = key.split("\u0000");
    const [a, b] = [assetId!, pipeId!].sort();
    edges.push({ kind: "asset-connection", a: a!, b: b!, connections });
  }
  edges.sort((x, y) => (x.a < y.a ? -1 : x.a > y.a ? 1 : x.b < y.b ? -1 : x.b > y.b ? 1 : 0));

  // Degrees: incidence counts.
  const degree = new Map<string, number>();
  for (const node of nodes) {
    degree.set(node.id, 0);
  }
  for (const edge of edges) {
    degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1);
    degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1);
  }

  // Components: union-find over the undirected edge set; component
  // indices canonical (ordered by the smallest member node id).
  const parent = new Map<string, string>(nodes.map((node) => [node.id, node.id] as const));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root) as string;
    }
    let current = id;
    while (parent.get(current) !== root) {
      const next = parent.get(current) as string;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) {
      return;
    }
    // Deterministic: the lexicographically smaller root wins.
    if (ra < rb) {
      parent.set(rb, ra);
    } else {
      parent.set(ra, rb);
    }
  };
  for (const edge of edges) {
    union(edge.a, edge.b);
  }
  const members = new Map<string, string[]>();
  for (const node of nodes) {
    const root = find(node.id);
    const bucket = members.get(root);
    if (bucket === undefined) {
      members.set(root, [node.id]);
    } else {
      bucket.push(node.id);
    }
  }
  const componentRoots = [...members.keys()].sort((a, b) => {
    const minA = [...(members.get(a) ?? [])].sort()[0] ?? a;
    const minB = [...(members.get(b) ?? [])].sort()[0] ?? b;
    return minA < minB ? -1 : minA > minB ? 1 : a < b ? -1 : 1;
  });
  const componentOf = new Map<string, number>();
  componentRoots.forEach((root, index) => {
    for (const id of members.get(root) ?? []) {
      componentOf.set(id, index);
    }
  });

  return {
    nodes: Object.freeze(
      nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        degree: degree.get(node.id) ?? 0,
        component: componentOf.get(node.id) ?? 0,
      })),
    ),
    edges: Object.freeze(edges),
    counts: {
      nodes: nodes.length,
      edges: edges.length,
      components: componentRoots.length,
    },
  };
}
