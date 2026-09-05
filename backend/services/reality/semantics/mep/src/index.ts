/**
 * @aise/backend-semantics-mep — the AISE-026 deterministic MEP
 * pipe reconstruction (CRITICAL) and the AISE-027 asset/topology
 * reconstruction (CRITICAL).
 *
 * Pipe centerline, diameter and connectivity representation
 * derived from capture point clouds, plus valves/equipment and
 * the connectivity graph, behind a clean service boundary:
 *
 * - errors   — typed, fail-closed MepError (non-retryable by
 *              construction)
 * - cluster  — deterministic grid-hash proximity clustering over
 *              canonicalized points (union-find, canonical
 *              representatives)
 * - fit      — the deterministic cylinder fit: PCA axis (fixed
 *              power iteration), centerline = extreme axis
 *              projections, diameter = 2·RMS radial, residuals
 *              verbatim
 * - network  — the pure AISE-026 pipe reconstruction: honest
 *              slenderness classification (refusals listed,
 *              never coerced), endpoint-to-centerline junctions
 *              (branch/coupled, diameter relations recorded —
 *              never averaged), content-derived identities,
 *              evidence-pinned provenance, epistemic passthrough,
 *              network digest
 * - asset    — the AISE-027 compact-blob assets: valve /
 *              equipment roles from gap-connected surface
 *              evidence (colinear continuation vs terminal),
 *              content-derived identities, honest
 *              `unconnected-cluster` refusals
 * - topology — the AISE-027 composition: the SAME pipe facts
 *              (bit-identical shared internals) + assets + the
 *              connectivity graph (nodes, edges, degrees,
 *              components) + the topology digest
 * - validate — the built-in structural/topological conformance
 *              validators; the runtime self-checks EVERY produced
 *              network / topology before return
 * - fixtures — the controlled golden fixture sets (exact + seeded
 *              noisy pipe networks and asset topologies with
 *              ground truth)
 * - runtime  — service composition with bounded compute
 *
 * Authority: the pipe network and the asset topology are derived
 * reality-side representation (the AISE-010 extraction discipline)
 * — no canonical model changes, no epistemic upgrades, no
 * fabricated connectivity, no semantic asset identification.
 */
export {
  MepError,
  toMepError,
  type MepErrorCode,
  type MepErrorDetails,
} from "./errors.js";
export {
  clusterPoints,
  type PointCluster,
} from "./cluster.js";
export {
  fitCylinder,
  distanceToSegment,
  type CylinderFit,
} from "./fit.js";
export {
  reconstructPipeNetwork,
  MEP_LIMITATIONS,
  DEFAULT_CLUSTER_RADIUS,
  DEFAULT_JOIN_TOLERANCE,
  DEFAULT_MIN_PIPE_POINTS,
  SLENDERNESS_MIN,
  DIAMETER_RELATION_FRACTION,
  type MepInput,
  type MepPipe,
  type MepPipeNetwork,
  type MepJunction,
  type DiameterRelation,
  type UnassignedCluster,
} from "./network.js";
export { validatePipeNetwork, validateMepTopology } from "./validate.js";
export {
  exactPipeNetworkPoints,
  noisyPipeNetworkPoints,
  pipeNetworkGroundTruth,
  PIPE_NOISE_SEED,
  type PipeNetworkGroundTruth,
} from "./fixtures/golden.js";
export {
  exactTopologyPoints,
  noisyTopologyPoints,
  topologyGroundTruth,
  TOPOLOGY_NOISE_SEED,
  TOPOLOGY_ASSET_TOLERANCE,
  TOPOLOGY_JOIN_TOLERANCE,
  TOPOLOGY_VALVE_GAP,
  TOPOLOGY_EQUIPMENT_GAP,
  type TopologyGroundTruth,
} from "./fixtures/topology.js";
export {
  reconstructMepTopology,
  topologyDigest,
  buildGraph,
  MEP_TOPOLOGY_LIMITATIONS,
  type MepTopologyInput,
  type MepTopology,
  type MepGraph,
  type MepGraphNode,
  type MepGraphEdge,
} from "./topology.js";
export {
  DEFAULT_ASSET_TOLERANCE,
  COLINEAR_COS_MIN,
  fitAssetBlob,
  extractConnections,
  classifyRole,
  type AssetRole,
  type AssetRoleBasis,
  type AssetBlobStats,
  type RawAssetConnection,
  type MepAsset,
  type MepAssetConnection,
} from "./asset.js";
export {
  buildMepService,
  DEFAULT_MAX_INPUT_POINTS,
  type MepService,
  type BuildMepServiceOptions,
} from "./runtime.js";
