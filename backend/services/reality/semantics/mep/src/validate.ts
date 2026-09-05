/**
 * Built-in pipe-network and topology conformance validators
 * (AISE-026 + AISE-027, CRITICAL self-check — the AISE-018/019
 * discipline).
 *
 * `validatePipeNetwork` (AISE-026, unchanged behavior): structural
 * and topological invariants of the pipe network — positive finite
 * diameters/lengths; finite centerlines; junction referential
 * integrity; junction pair uniqueness; counts; unit/epistemic
 * consistency.
 *
 * `validateMepTopology` (AISE-027): the pipe checks above PLUS the
 * asset/topology invariants:
 * - asset identity well-formedness and uniqueness;
 * - role/basis consistency (valve ⇒ inline-continuation with ≥2
 *   connections from distinct pipes; equipment ⇒ terminal);
 * - connection referential integrity (known pipes, valid endpoint
 *   indices, finite gaps, canonical order, no duplicates);
 * - graph node set exactly = pipes ∪ assets (kind matches the id
 *   prefix, canonical id order);
 * - edge referential integrity (a < b, no self-edges, no duplicate
 *   pairs), junction/connection edge bijections;
 * - degree consistency (recomputed incidence counts);
 * - component consistency (recomputed union-find partition);
 * - counts consistency; unit/epistemic consistency;
 * - DIGEST CONTENT-BINDING: the digest is recomputed from the
 *   topology's content and must match — a placeholder or stale
 *   digest fails closed.
 *
 * The runtime validates EVERY produced representation before
 * return (`NETWORK_INVALID` / `TOPOLOGY_INVALID` fail-closed) — the
 * reconstruction never returns output that fails its own validator.
 */
import { MepError } from "./errors.js";
import type { MepPipeNetwork, MepJunction, MepPipe } from "./network.js";
import { pipeContentHashOf } from "./internal.js";
import { assetContentHashOf, type MepAsset, type MepAssetConnection } from "./asset.js";
import { topologyDigest, type MepTopology } from "./topology.js";

/** Validates one reconstructed pipe network; throws on the first violation. */
export function validatePipeNetwork(network: MepPipeNetwork): void {
  const pipeIds = checkPipes(network.pipes, network.unit, network.sourceEpistemic);
  checkJunctions(network.junctions, pipeIds);

  if (network.counts.pipes !== network.pipes.length) {
    throw new MepError("NETWORK_INVALID", "pipe count disagrees with the pipes array", {
      details: { declared: network.counts.pipes, actual: network.pipes.length },
    });
  }
  if (network.counts.junctions !== network.junctions.length) {
    throw new MepError("NETWORK_INVALID", "junction count disagrees with the junctions array", {
      details: { declared: network.counts.junctions, actual: network.junctions.length },
    });
  }
  if (network.counts.unassigned !== network.unassigned.length) {
    throw new MepError("NETWORK_INVALID", "unassigned count disagrees with the array", {
      details: { declared: network.counts.unassigned, actual: network.unassigned.length },
    });
  }
}

/** Validates one reconstructed topology; throws on the first violation. */
export function validateMepTopology(topology: MepTopology): void {
  // The pipe sub-representation carries the AISE-026 invariants.
  const pipeIds = checkPipes(topology.pipes, topology.unit, topology.sourceEpistemic);
  checkJunctions(topology.junctions, pipeIds);

  // Assets: identity, role/basis consistency, connection integrity.
  const assetIds = new Set<string>();
  for (const asset of topology.assets) {
    checkAsset(asset, topology, pipeIds);
    if (assetIds.has(asset.assetId)) {
      throw new MepError("TOPOLOGY_INVALID", `duplicate asset identity: ${asset.assetId}`, {
        details: { assetId: asset.assetId },
      });
    }
    assetIds.add(asset.assetId);
  }

  // Graph: node set, edge set, degrees, components.
  checkGraph(topology, pipeIds, assetIds);

  // Counts.
  const counts = topology.counts;
  const actual = {
    inputPoints: topology.pipes.reduce((total, pipe) => total + pipe.pointCount, 0) +
      topology.assets.reduce((total, asset) => total + asset.pointCount, 0) +
      topology.unassigned.reduce((total, entry) => total + entry.pointCount, 0),
    pipes: topology.pipes.length,
    junctions: topology.junctions.length,
    assets: topology.assets.length,
    valves: topology.assets.filter((asset) => asset.role === "valve").length,
    equipment: topology.assets.filter((asset) => asset.role === "equipment").length,
    assetConnections: topology.assets.reduce((total, asset) => total + asset.connections.length, 0),
    unassigned: topology.unassigned.length,
  };
  for (const key of Object.keys(actual) as (keyof typeof actual)[]) {
    if (counts[key] !== actual[key]) {
      throw new MepError("TOPOLOGY_INVALID", `count ${key} disagrees with the arrays`, {
        details: { field: key, declared: counts[key], actual: actual[key] },
      });
    }
  }
  if (topology.graph.counts.nodes !== topology.graph.nodes.length) {
    throw new MepError("TOPOLOGY_INVALID", "graph node count disagrees with the nodes array", {
      details: { declared: topology.graph.counts.nodes, actual: topology.graph.nodes.length },
    });
  }
  if (topology.graph.counts.edges !== topology.graph.edges.length) {
    throw new MepError("TOPOLOGY_INVALID", "graph edge count disagrees with the edges array", {
      details: { declared: topology.graph.counts.edges, actual: topology.graph.edges.length },
    });
  }

  // Digest content-binding: recomputed digest must match exactly.
  const recomputed = topologyDigest(topology);
  if (recomputed !== topology.digest) {
    throw new MepError("TOPOLOGY_INVALID", "topology digest does not bind the represented content", {
      details: { declared: topology.digest, recomputed },
    });
  }
}

// ---------------------------------------------------------------------------
// shared internals
// ---------------------------------------------------------------------------

/** Pipe invariants; returns the set of pipe ids. */
function checkPipes(pipes: readonly MepPipe[], unit: string, sourceEpistemic: string): Set<string> {
  const pipeIds = new Set<string>();
  for (const pipe of pipes) {
    if (!/^mep-pipe-[0-9a-f]{16}$/.test(pipe.pipeId)) {
      throw new MepError("NETWORK_INVALID", `pipe identity malformed: ${pipe.pipeId}`, {
        details: { pipeId: pipe.pipeId },
      });
    }
    if (pipeIds.has(pipe.pipeId)) {
      throw new MepError("NETWORK_INVALID", `duplicate pipe identity: ${pipe.pipeId}`, {
        details: { pipeId: pipe.pipeId },
      });
    }
    pipeIds.add(pipe.pipeId);
    if (!/^[0-9a-f]{64}$/.test(pipe.contentHash)) {
      throw new MepError("NETWORK_INVALID", `pipe content hash malformed: ${pipe.pipeId}`, {
        details: { pipeId: pipe.pipeId, contentHash: pipe.contentHash },
      });
    }
    // Content binding: the pipe's identity is derived from its content.
    if (pipeContentHashOf(pipe.centerline, pipe.diameter.value, pipe.pointCount) !== pipe.contentHash) {
      throw new MepError("NETWORK_INVALID", `pipe content hash does not bind the pipe content: ${pipe.pipeId}`, {
        details: { pipeId: pipe.pipeId },
      });
    }
    if (pipe.pipeId !== `mep-pipe-${pipe.contentHash.slice(0, 16)}`) {
      throw new MepError("NETWORK_INVALID", `pipe identity does not bind the content hash: ${pipe.pipeId}`, {
        details: { pipeId: pipe.pipeId },
      });
    }
    if (!(pipe.diameter.value > 0) || !Number.isFinite(pipe.diameter.value)) {
      throw new MepError("NETWORK_INVALID", `pipe diameter must be positive finite: ${String(pipe.diameter.value)}`, {
        details: { pipeId: pipe.pipeId, diameter: String(pipe.diameter.value) },
      });
    }
    if (!(pipe.length.value > 0) || !Number.isFinite(pipe.length.value)) {
      throw new MepError("NETWORK_INVALID", `pipe length must be positive finite: ${String(pipe.length.value)}`, {
        details: { pipeId: pipe.pipeId, length: String(pipe.length.value) },
      });
    }
    for (const point of [pipe.centerline.start, pipe.centerline.end]) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
        throw new MepError("NETWORK_INVALID", `pipe centerline carries non-finite coordinates: ${pipe.pipeId}`, {
          details: { pipeId: pipe.pipeId },
        });
      }
    }
    if (pipe.diameter.unit !== unit || pipe.length.unit !== unit) {
      throw new MepError("NETWORK_INVALID", `pipe quantity unit disagrees with the network unit: ${pipe.pipeId}`, {
        details: { pipeId: pipe.pipeId, networkUnit: unit },
      });
    }
    if (pipe.epistemic !== sourceEpistemic) {
      throw new MepError("NETWORK_INVALID", `pipe epistemic state not passthrough: ${pipe.pipeId}`, {
        details: { pipeId: pipe.pipeId, pipe: pipe.epistemic, source: sourceEpistemic },
      });
    }
  }
  return pipeIds;
}

/** Junction invariants (referential integrity, pair uniqueness). */
function checkJunctions(junctions: readonly MepJunction[], pipeIds: ReadonlySet<string>): void {
  const pairs = new Set<string>();
  for (const junction of junctions) {
    if (!pipeIds.has(junction.pipeId)) {
      throw new MepError("NETWORK_INVALID", `junction references an unknown pipe: ${junction.pipeId}`, {
        details: { pipeId: junction.pipeId },
      });
    }
    if (!pipeIds.has(junction.nearPipeId)) {
      throw new MepError("NETWORK_INVALID", `junction references an unknown near pipe: ${junction.nearPipeId}`, {
        details: { nearPipeId: junction.nearPipeId },
      });
    }
    if (junction.pipeId === junction.nearPipeId) {
      throw new MepError("NETWORK_INVALID", `self-junction: ${junction.pipeId}`, {
        details: { pipeId: junction.pipeId },
      });
    }
    if (junction.endpointIndex !== 0 && junction.endpointIndex !== 1) {
      throw new MepError("NETWORK_INVALID", `junction endpoint index must be 0 or 1: ${String(junction.endpointIndex)}`, {
        details: { endpointIndex: String(junction.endpointIndex) },
      });
    }
    if (!Number.isFinite(junction.distance) || junction.distance < 0) {
      throw new MepError("NETWORK_INVALID", `junction distance must be finite >= 0: ${String(junction.distance)}`, {
        details: { distance: String(junction.distance) },
      });
    }
    const pairKey = [junction.pipeId, junction.nearPipeId].sort().join("|");
    if (pairs.has(pairKey)) {
      throw new MepError("NETWORK_INVALID", `duplicate junction pair: ${pairKey}`, {
        details: { pairKey },
      });
    }
    pairs.add(pairKey);
  }
}

/** Asset invariants: identity, role/basis, connections, quantities. */
function checkAsset(asset: MepAsset, topology: MepTopology, pipeIds: ReadonlySet<string>): void {
  if (!/^mep-asset-[0-9a-f]{16}$/.test(asset.assetId)) {
    throw new MepError("TOPOLOGY_INVALID", `asset identity malformed: ${asset.assetId}`, {
      details: { assetId: asset.assetId },
    });
  }
  if (!/^[0-9a-f]{64}$/.test(asset.contentHash)) {
    throw new MepError("TOPOLOGY_INVALID", `asset content hash malformed: ${asset.assetId}`, {
      details: { assetId: asset.assetId, contentHash: asset.contentHash },
    });
  }
  // Content binding: the asset's identity is derived from its content.
  if (assetContentHashOf(asset.position, asset.size.value, asset.role, asset.pointCount) !== asset.contentHash) {
    throw new MepError("TOPOLOGY_INVALID", `asset content hash does not bind the asset content: ${asset.assetId}`, {
      details: { assetId: asset.assetId },
    });
  }
  if (asset.assetId !== `mep-asset-${asset.contentHash.slice(0, 16)}`) {
    throw new MepError("TOPOLOGY_INVALID", `asset identity does not bind the content hash: ${asset.assetId}`, {
      details: { assetId: asset.assetId },
    });
  }
  if (asset.role !== "valve" && asset.role !== "equipment") {
    throw new MepError("TOPOLOGY_INVALID", `asset role must be valve or equipment: ${String(asset.role)}`, {
      details: { assetId: asset.assetId, role: String(asset.role) },
    });
  }
  const basisByRole: Record<MepAsset["role"], MepAsset["roleBasis"]> = {
    valve: "inline-continuation",
    equipment: "terminal",
  };
  if (asset.roleBasis !== basisByRole[asset.role]) {
    throw new MepError("TOPOLOGY_INVALID", `asset role basis disagrees with the role: ${asset.assetId}`, {
      details: { assetId: asset.assetId, role: asset.role, roleBasis: asset.roleBasis },
    });
  }
  if (!Number.isFinite(asset.position.x) || !Number.isFinite(asset.position.y) || !Number.isFinite(asset.position.z)) {
    throw new MepError("TOPOLOGY_INVALID", `asset position carries non-finite coordinates: ${asset.assetId}`, {
      details: { assetId: asset.assetId },
    });
  }
  if (!(asset.size.value > 0) || !Number.isFinite(asset.size.value)) {
    throw new MepError("TOPOLOGY_INVALID", `asset size must be positive finite: ${String(asset.size.value)}`, {
      details: { assetId: asset.assetId, size: String(asset.size.value) },
    });
  }
  if (asset.size.unit !== topology.unit) {
    throw new MepError("TOPOLOGY_INVALID", `asset size unit disagrees with the topology unit: ${asset.assetId}`, {
      details: { assetId: asset.assetId, topologyUnit: topology.unit },
    });
  }
  if (asset.positionUncertainty !== undefined) {
    // Standard uncertainty in the topology unit (unit by construction).
    const uncertainty = asset.positionUncertainty;
    if (uncertainty.kind !== "standard" || !Number.isFinite(uncertainty.u) || uncertainty.u <= 0) {
      throw new MepError("TOPOLOGY_INVALID", `asset position uncertainty must be a positive standard uncertainty: ${asset.assetId}`, {
        details: { assetId: asset.assetId },
      });
    }
  }
  if (asset.epistemic !== topology.sourceEpistemic) {
    throw new MepError("TOPOLOGY_INVALID", `asset epistemic state not passthrough: ${asset.assetId}`, {
      details: { assetId: asset.assetId, asset: asset.epistemic, source: topology.sourceEpistemic },
    });
  }
  if (!Number.isFinite(asset.residuals.rms) || asset.residuals.rms < 0 || !Number.isFinite(asset.residuals.max) || asset.residuals.max < 0) {
    throw new MepError("TOPOLOGY_INVALID", `asset residuals must be finite >= 0: ${asset.assetId}`, {
      details: { assetId: asset.assetId },
    });
  }
  if (!Number.isInteger(asset.pointCount) || asset.pointCount < 1) {
    throw new MepError("TOPOLOGY_INVALID", `asset point count must be a positive integer: ${asset.assetId}`, {
      details: { assetId: asset.assetId, pointCount: String(asset.pointCount) },
    });
  }
  if (asset.connections.length === 0) {
    throw new MepError("TOPOLOGY_INVALID", `an asset must carry at least one connection (evidence linkage): ${asset.assetId}`, {
      details: { assetId: asset.assetId },
    });
  }
  if (asset.role === "valve" && new Set(asset.connections.map((connection) => connection.pipeId)).size < 2) {
    throw new MepError("TOPOLOGY_INVALID", `a valve requires connections from at least 2 distinct pipes (inline-continuation evidence): ${asset.assetId}`, {
      details: { assetId: asset.assetId },
    });
  }
  const seen = new Set<string>();
  let previous: { pipeId: string; endpointIndex: number } | undefined;
  for (const connection of asset.connections) {
    if (connection.assetId !== asset.assetId) {
      throw new MepError("TOPOLOGY_INVALID", `connection references a foreign asset: ${connection.assetId}`, {
        details: { assetId: asset.assetId, connectionAssetId: connection.assetId },
      });
    }
    if (!pipeIds.has(connection.pipeId)) {
      throw new MepError("TOPOLOGY_INVALID", `connection references an unknown pipe: ${connection.pipeId}`, {
        details: { assetId: asset.assetId, pipeId: connection.pipeId },
      });
    }
    if (connection.endpointIndex !== 0 && connection.endpointIndex !== 1) {
      throw new MepError("TOPOLOGY_INVALID", `connection endpoint index must be 0 or 1: ${String(connection.endpointIndex)}`, {
        details: { assetId: asset.assetId, endpointIndex: String(connection.endpointIndex) },
      });
    }
    if (!Number.isFinite(connection.surfaceGap) || connection.surfaceGap < 0) {
      throw new MepError("TOPOLOGY_INVALID", `connection surface gap must be finite >= 0: ${String(connection.surfaceGap)}`, {
        details: { assetId: asset.assetId, surfaceGap: String(connection.surfaceGap) },
      });
    }
    if (
      !Number.isFinite(connection.surfacePoint.x) ||
      !Number.isFinite(connection.surfacePoint.y) ||
      !Number.isFinite(connection.surfacePoint.z)
    ) {
      throw new MepError("TOPOLOGY_INVALID", `connection surface point carries non-finite coordinates: ${asset.assetId}`, {
        details: { assetId: asset.assetId },
      });
    }
    const key = `${connection.pipeId}|${connection.endpointIndex}`;
    if (seen.has(key)) {
      throw new MepError("TOPOLOGY_INVALID", `duplicate connection (pipe, endpoint): ${key}`, {
        details: { assetId: asset.assetId, key },
      });
    }
    seen.add(key);
    if (previous !== undefined) {
      const order = previous.pipeId < connection.pipeId
        ? -1
        : previous.pipeId > connection.pipeId
          ? 1
          : previous.endpointIndex - connection.endpointIndex;
      if (order >= 0) {
        throw new MepError("TOPOLOGY_INVALID", `connections are not in canonical (pipeId, endpointIndex) order: ${asset.assetId}`, {
          details: { assetId: asset.assetId },
        });
      }
    }
    previous = connection;
  }
  if (asset.provenance.inputs.length === 0) {
    throw new MepError("TOPOLOGY_INVALID", `asset provenance must pin input evidence: ${asset.assetId}`, {
      details: { assetId: asset.assetId },
    });
  }
}

/** Graph invariants: node set, edges, degrees, components. */
function checkGraph(topology: MepTopology, pipeIds: ReadonlySet<string>, assetIds: ReadonlySet<string>): void {
  const { nodes, edges } = topology.graph;

  // Node set: exactly pipes + assets, canonical id order.
  const expectedIds = new Set<string>([...pipeIds, ...assetIds]);
  let previousId: string | undefined;
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) {
      throw new MepError("TOPOLOGY_INVALID", `duplicate graph node: ${node.id}`, {
        details: { nodeId: node.id },
      });
    }
    nodeIds.add(node.id);
    if (!expectedIds.has(node.id)) {
      throw new MepError("TOPOLOGY_INVALID", `graph node is neither a pipe nor an asset: ${node.id}`, {
        details: { nodeId: node.id },
      });
    }
    const expectedKind = node.id.startsWith("mep-asset-") ? "asset" : "pipe";
    if (node.kind !== expectedKind) {
      throw new MepError("TOPOLOGY_INVALID", `graph node kind disagrees with the id: ${node.id}`, {
        details: { nodeId: node.id, kind: node.kind, expectedKind },
      });
    }
    if (previousId !== undefined && previousId >= node.id) {
      throw new MepError("TOPOLOGY_INVALID", "graph nodes are not in canonical id order", {
        details: { previousId, nodeId: node.id },
      });
    }
    previousId = node.id;
    if (!Number.isInteger(node.degree) || node.degree < 0) {
      throw new MepError("TOPOLOGY_INVALID", `graph node degree must be a non-negative integer: ${node.id}`, {
        details: { nodeId: node.id, degree: String(node.degree) },
      });
    }
    if (!Number.isInteger(node.component) || node.component < 0 || node.component >= topology.graph.counts.components) {
      throw new MepError("TOPOLOGY_INVALID", `graph node component index out of range: ${node.id}`, {
        details: { nodeId: node.id, component: String(node.component), components: topology.graph.counts.components },
      });
    }
  }
  if (nodeIds.size !== expectedIds.size) {
    throw new MepError("TOPOLOGY_INVALID", "graph node set does not cover every pipe and asset", {
      details: { declared: expectedIds.size, actual: nodeIds.size },
    });
  }

  // Edges: referential integrity, ordering, uniqueness, bijections.
  const degreeCounts = new Map<string, number>(nodes.map((node) => [node.id, 0] as const));
  const pairs = new Set<string>();
  const junctionPairs = new Set<string>(
    topology.junctions.map((junction) => [junction.pipeId, junction.nearPipeId].sort().join("|")),
  );
  const connectionPairs = new Map<string, MepAssetConnection[]>();
  for (const asset of topology.assets) {
    for (const connection of asset.connections) {
      const key = `${connection.assetId}|${connection.pipeId}`;
      const bucket = connectionPairs.get(key);
      if (bucket === undefined) {
        connectionPairs.set(key, [connection]);
      } else {
        bucket.push(connection);
      }
    }
  }
  const seenJunctionPairs = new Set<string>();
  const seenConnectionPairs = new Set<string>();
  let previousPair: [string, string] | undefined;
  for (const edge of edges) {
    const pair: [string, string] = [edge.a, edge.b];
    if (edge.a >= edge.b) {
      throw new MepError("TOPOLOGY_INVALID", `graph edge is not in canonical (a < b) order: ${edge.a}|${edge.b}`, {
        details: { a: edge.a, b: edge.b },
      });
    }
    if (!nodeIds.has(edge.a) || !nodeIds.has(edge.b)) {
      throw new MepError("TOPOLOGY_INVALID", `graph edge references an unknown node: ${edge.a}|${edge.b}`, {
        details: { a: edge.a, b: edge.b },
      });
    }
    const pairKey = `${edge.a}|${edge.b}`;
    if (pairs.has(pairKey)) {
      throw new MepError("TOPOLOGY_INVALID", `duplicate graph edge pair: ${pairKey}`, {
        details: { pairKey },
      });
    }
    pairs.add(pairKey);
    if (previousPair !== undefined && (previousPair[0] > edge.a || (previousPair[0] === edge.a && previousPair[1] >= edge.b))) {
      throw new MepError("TOPOLOGY_INVALID", "graph edges are not in canonical (a, b) order", {
        details: { previous: `${previousPair[0]}|${previousPair[1]}`, current: pairKey },
      });
    }
    previousPair = pair;
    degreeCounts.set(edge.a, (degreeCounts.get(edge.a) ?? 0) + 1);
    degreeCounts.set(edge.b, (degreeCounts.get(edge.b) ?? 0) + 1);
    if (edge.kind === "pipe-junction") {
      if (!pipeIds.has(edge.a) || !pipeIds.has(edge.b)) {
        throw new MepError("TOPOLOGY_INVALID", `pipe-junction edge must connect two pipes: ${pairKey}`, {
          details: { pairKey, a: edge.a, b: edge.b },
        });
      }
      const junctionKey = [edge.junction.pipeId, edge.junction.nearPipeId].sort().join("|");
      if (junctionKey !== pairKey) {
        throw new MepError("TOPOLOGY_INVALID", `pipe-junction edge payload disagrees with its endpoints: ${pairKey}`, {
          details: { pairKey, junctionKey },
        });
      }
      if (!junctionPairs.has(junctionKey)) {
        throw new MepError("TOPOLOGY_INVALID", `pipe-junction edge has no matching junction: ${junctionKey}`, {
          details: { junctionKey },
        });
      }
      seenJunctionPairs.add(junctionKey);
    } else {
      const assetSide = assetIds.has(edge.a) ? edge.a : assetIds.has(edge.b) ? edge.b : undefined;
      const pipeSide = pipeIds.has(edge.a) ? edge.a : pipeIds.has(edge.b) ? edge.b : undefined;
      if (assetSide === undefined || pipeSide === undefined || assetSide === pipeSide) {
        throw new MepError("TOPOLOGY_INVALID", `asset-connection edge must connect one asset and one pipe: ${pairKey}`, {
          details: { pairKey, a: edge.a, b: edge.b },
        });
      }
      for (const connection of edge.connections) {
        if (connection.assetId !== assetSide || connection.pipeId !== pipeSide) {
          throw new MepError("TOPOLOGY_INVALID", `asset-connection edge payload disagrees with its endpoints: ${pairKey}`, {
            details: { pairKey, assetId: connection.assetId, pipeId: connection.pipeId },
          });
        }
      }
      const connectionKey = `${assetSide}|${pipeSide}`;
      if (!connectionPairs.has(connectionKey)) {
        throw new MepError("TOPOLOGY_INVALID", `asset-connection edge has no matching connections: ${pairKey}`, {
          details: { pairKey },
        });
      }
      const expected = connectionPairs.get(connectionKey) ?? [];
      if (expected.length !== edge.connections.length) {
        throw new MepError("TOPOLOGY_INVALID", `asset-connection edge payload count disagrees with the connections: ${pairKey}`, {
          details: { pairKey, declared: edge.connections.length, actual: expected.length },
        });
      }
      seenConnectionPairs.add(connectionKey);
    }
  }
  // Bijections: every junction and every connection pair has an edge.
  for (const junctionKey of junctionPairs) {
    if (!seenJunctionPairs.has(junctionKey)) {
      throw new MepError("TOPOLOGY_INVALID", `junction has no graph edge: ${junctionKey}`, {
        details: { junctionKey },
      });
    }
  }
  for (const connectionKey of connectionPairs.keys()) {
    if (!seenConnectionPairs.has(connectionKey)) {
      throw new MepError("TOPOLOGY_INVALID", `asset connection pair has no graph edge: ${connectionKey}`, {
        details: { connectionKey },
      });
    }
  }

  // Degrees: recomputed incidence.
  for (const node of nodes) {
    if (node.degree !== (degreeCounts.get(node.id) ?? 0)) {
      throw new MepError("TOPOLOGY_INVALID", `graph node degree disagrees with the incident edge count: ${node.id}`, {
        details: { nodeId: node.id, declared: node.degree, actual: degreeCounts.get(node.id) ?? 0 },
      });
    }
  }

  // Components: recompute the partition over the edge set (O(N+E)),
  // then verify label consistency and canonical index order.
  const parent = new Map<string, string>(nodes.map((node) => [node.id, node.id] as const));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root) as string;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      if (ra < rb) {
        parent.set(rb, ra);
      } else {
        parent.set(ra, rb);
      }
    }
  };
  for (const edge of edges) {
    union(edge.a, edge.b);
  }
  // Every union-find root maps to exactly one component label and
  // every component label maps to exactly one root.
  const labelsByRoot = new Map<string, number>();
  const rootsByLabel = new Map<number, string>();
  for (const node of nodes) {
    const root = find(node.id);
    const knownLabel = labelsByRoot.get(root);
    if (knownLabel === undefined) {
      labelsByRoot.set(root, node.component);
    } else if (knownLabel !== node.component) {
      throw new MepError("TOPOLOGY_INVALID", `connected nodes carry different component labels: ${node.id}`, {
        details: { nodeId: node.id, root, labels: [knownLabel, node.component] },
      });
    }
    const knownRoot = rootsByLabel.get(node.component);
    if (knownRoot === undefined) {
      rootsByLabel.set(node.component, root);
    } else if (knownRoot !== root) {
      throw new MepError("TOPOLOGY_INVALID", `nodes share a component label but are not connected: ${node.id}`, {
        details: { nodeId: node.id, component: node.component, roots: [knownRoot, root] },
      });
    }
  }
  // Component indices are dense and canonical: components ordered by
  // their smallest member node id must carry indices 0..K-1 in order.
  const membersByLabel = new Map<number, string[]>();
  for (const node of nodes) {
    const bucket = membersByLabel.get(node.component);
    if (bucket === undefined) {
      membersByLabel.set(node.component, [node.id]);
    } else {
      bucket.push(node.id);
    }
  }
  const orderedLabels = [...membersByLabel.entries()]
    .map(([label, ids]) => ({ label, minId: ids.reduce((min, id) => (id < min ? id : min), ids[0] as string) }))
    .sort((x, y) => (x.minId < y.minId ? -1 : x.minId > y.minId ? 1 : 0));
  orderedLabels.forEach((entry, index) => {
    if (entry.label !== index) {
      throw new MepError("TOPOLOGY_INVALID", "component indices are not canonical (smallest-member-id order)", {
        details: { component: entry.label, expected: index, minId: entry.minId },
      });
    }
  });
  // Component count consistency.
  const usedComponents = new Set(nodes.map((node) => node.component));
  if (usedComponents.size !== topology.graph.counts.components) {
    throw new MepError("TOPOLOGY_INVALID", "graph component count disagrees with the used component indices", {
      details: { declared: topology.graph.counts.components, actual: usedComponents.size },
    });
  }
}
