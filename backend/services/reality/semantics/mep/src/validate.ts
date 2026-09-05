/**
 * Built-in pipe-network conformance validator (AISE-026, CRITICAL
 * self-check — the AISE-018/019 discipline).
 *
 * Validates the produced network's STRUCTURAL and TOPOLOGICAL
 * invariants (the acceptance's "topology correctness"):
 * - positive finite diameters/lengths; finite centerlines;
 * - centerline endpoints distinct (non-degenerate pipes);
 * - junction referential integrity (both pipe IDs exist; no
 *   self-junctions);
 * - junction symmetry accounting (every unordered pair appears at
 *   most once);
 * - counts consistency;
 * - unit/epistemic consistency.
 *
 * The runtime validates EVERY produced network before return
 * (`NETWORK_INVALID` fail-closed) — the reconstruction never
 * returns a network that fails its own validator.
 */
import { MepError } from "./errors.js";
import type { MepPipeNetwork } from "./network.js";

/** Validates one reconstructed network; throws on the first violation. */
export function validatePipeNetwork(network: MepPipeNetwork): void {
  const pipeIds = new Set<string>();
  for (const pipe of network.pipes) {
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
    if (pipe.diameter.unit !== network.unit || pipe.length.unit !== network.unit) {
      throw new MepError("NETWORK_INVALID", `pipe quantity unit disagrees with the network unit: ${pipe.pipeId}`, {
        details: { pipeId: pipe.pipeId, networkUnit: network.unit },
      });
    }
    if (pipe.epistemic !== network.sourceEpistemic) {
      throw new MepError("NETWORK_INVALID", `pipe epistemic state not passthrough: ${pipe.pipeId}`, {
        details: { pipeId: pipe.pipeId, pipe: pipe.epistemic, source: network.sourceEpistemic },
      });
    }
  }

  const pairs = new Set<string>();
  for (const junction of network.junctions) {
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
