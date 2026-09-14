/**
 * Default AISE reconstruction provider registry (AISE-012).
 *
 * Order is the orchestrator's deterministic first-match selection order and
 * follows the strategy's device-aware routing preference: the local
 * deterministic depth/LiDAR fusion path is evaluated BEFORE the external
 * WorldSculpt engine (a high-end device producing depth evidence bypasses
 * WorldSculpt for suitable tasks).
 *
 * NOTE — REFERENCE-CONSTRAINED ADAPTER CLASS (deliberately NOT implemented
 * here, scope discipline): engines that reconstruct under explicit
 * reference-measurement constraints (scale-constrained / instrument-referenced
 * reconstruction consuming `reference_measurements` evidence) are a valid
 * FUTURE provider class behind the same frozen contract — adding one later
 * requires an adapter + descriptor + translations, no contract change.
 *
 * Removing WorldSculpt requires NO data-model change: filter the provider
 * list (see registry tests) — existing job/artifact records remain readable
 * exactly as stored.
 */

import type { ReconstructionProvider } from "../contract";
import { DepthLidarFusionAdapter } from "./depth-lidar/adapter";
import { DeterministicDepthFusionBackend, type DepthFusionBackend } from "./depth-lidar/backend";
import { WorldSculptAdapter } from "./worldsculpt/adapter";
import type { EvidenceBytesReader, WorldSculptBackend } from "./worldsculpt/backend";

export interface DefaultAiseProvidersOptions {
  /**
   * WorldSculpt backend seam. Absent (the default) → the WorldSculpt adapter
   * is REGISTERED but honestly ACCESS_REQUIRED: no inference endpoint,
   * weights or credentials exist in a default deployment.
   */
  readonly worldSculptBackend?: WorldSculptBackend;
  /** Depth fusion backend; defaults to the deterministic in-process backend. */
  readonly depthBackend?: DepthFusionBackend;
  /** Optional evidence bytes reader shared by the adapters. */
  readonly evidenceReader?: EvidenceBytesReader;
}

/**
 * The default adapter list: depth/LiDAR fusion (deterministic, READY) first,
 * WorldSculpt second (READY only when a backend is configured — otherwise
 * present-but-unavailable, ACCESS_REQUIRED).
 */
export function createDefaultAiseProviders(
  options: DefaultAiseProvidersOptions = {},
): ReconstructionProvider[] {
  const depthBackend = options.depthBackend ?? new DeterministicDepthFusionBackend();
  return [
    new DepthLidarFusionAdapter({
      backend: depthBackend,
      evidenceReader: options.evidenceReader,
    }),
    new WorldSculptAdapter({
      backend: options.worldSculptBackend,
      evidenceReader: options.evidenceReader,
    }),
  ];
}
