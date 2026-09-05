/**
 * MEP reconstruction service composition (AISE-026, CRITICAL).
 *
 * Binds the deterministic reconstruction into a service object
 * with the production discipline of the sibling services:
 * bounded compute (`maxInputPoints`, default 2,000,000; the
 * clustering is O(n) in point count) and the CRITICAL
 * self-check — every produced network is validated with the
 * built-in structural/topological validator BEFORE it is
 * returned (`NETWORK_INVALID` fail-closed).
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import { reconstructPipeNetwork, type MepInput, type MepPipeNetwork } from "./network.js";
import { validatePipeNetwork } from "./validate.js";
import { MepError } from "./errors.js";

/** Default bound on input points per reconstruction. */
export const DEFAULT_MAX_INPUT_POINTS = 2_000_000;

/** The deterministic MEP reconstruction surface. */
export interface MepService {
  readonly reconstruct: (input: MepInput) => MepPipeNetwork;
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
  };
}
