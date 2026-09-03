/**
 * Reconstruction service composition (AISE-008).
 *
 * Wires the pipeline with production defaults:
 *
 * - state: the in-memory reconstruction store (documented placeholder);
 * - capture source: fail-closed/unbound — the process has no live
 *   view of ingestion state until a durable transport Work Item
 *   binds one; jobs fail closed with `CAPTURE_SOURCE_UNAVAILABLE`
 *   rather than answering from empty or fabricated state;
 * - pose: the acquisition-metadata orientation adapter (real,
 *   honest, production-safe);
 * - engine: none registered — reconstruction jobs fail closed with
 *   `NO_RECONSTRUCTION_ENGINE` until a real geometry engine lands.
 *
 * All of these are injectable for composition and tests; production
 * defaults never fabricate.
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import { createFailClosedCaptureSource, type CaptureUploadSource } from "./capture/source.js";
import { createAcquisitionMetadataPoseAdapter } from "./pose/metadata-pose.js";
import type { PoseEstimator } from "./pose/pose.js";
import type { ReconstructionEngine } from "./reconstruction/engine.js";
import { createReconstructionRunner, type ReconstructionRunner } from "./pipeline/runner.js";
import {
  createInMemoryReconstructionStateStore,
  type ReconstructionStateStore,
} from "./state/store.js";

export interface ReconstructionService {
  readonly runner: ReconstructionRunner;
  readonly stateStore: ReconstructionStateStore;
}

export interface BuildReconstructionServiceOptions {
  /** Capture source binding; default: fail-closed/unbound. */
  readonly source?: CaptureUploadSource;
  /** Pose estimator; default: acquisition-metadata adapter. */
  readonly poseEstimator?: PoseEstimator;
  /** Geometry engine; default: none (reconstruction fails closed). */
  readonly reconstructionEngine?: ReconstructionEngine;
  /** Poll interval; default: the worker poll interval from config. */
  readonly pollIntervalMs?: number;
  /** Injectable state store; default: in-memory placeholder. */
  readonly stateStore?: ReconstructionStateStore;
}

export function buildReconstructionService(
  config: AiseConfig,
  logger: Logger,
  options: BuildReconstructionServiceOptions = {},
): ReconstructionService {
  const stateStore = options.stateStore ?? createInMemoryReconstructionStateStore();
  const runner = createReconstructionRunner({
    source: options.source ?? createFailClosedCaptureSource(),
    stateStore,
    logger,
    poseEstimator: options.poseEstimator ?? createAcquisitionMetadataPoseAdapter(),
    reconstructionEngine: options.reconstructionEngine,
    pollIntervalMs: options.pollIntervalMs ?? config.worker.pollIntervalMs,
  });
  return { runner, stateStore };
}
