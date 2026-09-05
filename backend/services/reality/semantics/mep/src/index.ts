/**
 * @aise/backend-semantics-mep — the AISE-026 deterministic MEP
 * pipe reconstruction (CRITICAL).
 *
 * Pipe centerline, diameter and connectivity representation
 * derived from capture point clouds, behind a clean service
 * boundary:
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
 * - network  — the pure reconstruction: honest slenderness
 *              classification (refusals listed, never coerced),
 *              endpoint-to-centerline junctions (branch/coupled,
 *              diameter relations recorded — never averaged),
 *              content-derived identities, evidence-pinned
 *              provenance, epistemic passthrough, network digest
 * - validate — the built-in structural/topological conformance
 *              validator; the runtime self-checks EVERY produced
 *              network before return
 * - fixtures — the controlled golden fixture set (exact + seeded
 *              noisy pipe networks with ground truth)
 * - runtime  — service composition with bounded compute
 *
 * Authority: the pipe network is derived reality-side
 * representation (the AISE-010 extraction discipline) — no
 * canonical model changes, no epistemic upgrades, no fabricated
 * connectivity.
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
export { validatePipeNetwork } from "./validate.js";
export {
  exactPipeNetworkPoints,
  noisyPipeNetworkPoints,
  pipeNetworkGroundTruth,
  PIPE_NOISE_SEED,
  type PipeNetworkGroundTruth,
} from "./fixtures/golden.js";
export {
  buildMepService,
  DEFAULT_MAX_INPUT_POINTS,
  type MepService,
  type BuildMepServiceOptions,
} from "./runtime.js";
