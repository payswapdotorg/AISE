/**
 * MEP reconstruction service composition (AISE-026 + AISE-027, CRITICAL).
 *
 * Binds the deterministic reconstructions into a service object
 * with the production discipline of the sibling services:
 * bounded compute (`maxInputPoints`, default 2,000,000; the
 * clustering is O(n) in point count) and the CRITICAL
 * self-check — every produced network / topology is validated
 * with the built-in structural/topological validator BEFORE it
 * is returned (`NETWORK_INVALID` / `TOPOLOGY_INVALID`
 * fail-closed, including topology digest content-binding).
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import { reconstructPipeNetwork, type MepInput, type MepPipeNetwork } from "./network.js";
import { reconstructMepTopology, type MepTopology, type MepTopologyInput } from "./topology.js";
import { validatePipeNetwork, validateMepTopology } from "./validate.js";
import { MepError } from "./errors.js";

/** Default bound on input points per reconstruction. */
export const DEFAULT_MAX_INPUT_POINTS = 2_000_000;

/** The deterministic MEP reconstruction surface. */
export interface MepService {
  readonly reconstruct: (input: MepInput) => MepPipeNetwork;
  /** The AISE-027 asset/topology reconstruction (valves, equipment, connectivity graph). */
  readonly reconstructTopology: (input: MepTopologyInput) => MepTopology;
  readonly limits: {
    readonly maxInputPoints: number;
  };
}

export interface BuildMepServiceOptions {
  /** Upper bound on input points (default 2,000,000). */
  readonly maxInputPoints?: number;
}

export function buildMepService(
  config: AiseConfig,
  logger: Logger,
  options: BuildMepServiceOptions = {},
): MepService {
  const maxInputPoints = options.maxInputPoints ?? DEFAULT_MAX_INPUT_POINTS;
  if (!Number.isInteger(maxInputPoints) || maxInputPoints < 1) {
    throw new MepError("OPTION_INVALID", `maxInputPoints must be a positive integer: ${String(maxInputPoints)}`, {
      details: { maxInputPoints: String(maxInputPoints) },
    });
  }
  const module = config.env;
  return {
    limits: { maxInputPoints },
    reconstruct: (input) => {
      if (input.points.length > maxInputPoints) {
        throw new MepError("VALIDATION_FAILED", `input exceeds the point cap: ${input.points.length} > ${maxInputPoints}`, {
          details: { points: input.points.length, cap: maxInputPoints },
        });
      }
      const network = reconstructPipeNetwork(input);
      // CRITICAL self-check: never return an unvalidated network.
      validatePipeNetwork(network);
      logger.debug("mep.reconstructed", {
        module,
        inputPoints: network.counts.inputPoints,
        pipes: network.counts.pipes,
        junctions: network.counts.junctions,
        unassigned: network.counts.unassigned,
        digest: network.digest,
      });
      return network;
    },
    reconstructTopology: (input) => {
      if (input.points.length > maxInputPoints) {
        throw new MepError("VALIDATION_FAILED", `input exceeds the point cap: ${input.points.length} > ${maxInputPoints}`, {
          details: { points: input.points.length, cap: maxInputPoints },
        });
      }
      const topology = reconstructMepTopology(input);
      // CRITICAL self-check: never return an unvalidated topology
      // (the digest is recomputed and must bind the content).
      validateMepTopology(topology);
      logger.debug("mep.topology-reconstructed", {
        module,
        inputPoints: topology.counts.inputPoints,
        pipes: topology.counts.pipes,
        junctions: topology.counts.junctions,
        assets: topology.counts.assets,
        valves: topology.counts.valves,
        equipment: topology.counts.equipment,
        nodes: topology.graph.counts.nodes,
        edges: topology.graph.counts.edges,
        components: topology.graph.counts.components,
        digest: topology.digest,
      });
      return topology;
    },
  };
}
