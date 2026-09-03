/**
 * The asynchronous reconstruction runner (AISE-008).
 *
 * Executes pipeline jobs one at a time. Semantics mirror the
 * AISE-001 worker loop, adapted to the reconstruction job model:
 *
 * - a failing job is recorded `FAILED` with its typed failure and
 *   isolated — it never stops the runner and never leaves partial
 *   derived state (each stage either commits complete artifacts or
 *   nothing);
 * - jobs are processed strictly in enqueue order (FIFO);
 * - `drain()` processes everything currently queued (deterministic
 *   composition/tests); `start()`/`stop()` run the background poll
 *   loop with graceful shutdown (current job finishes first);
 * - the runner never retries: v1.0 failure records carry `retryable`
 *   data, but the retry policy itself is deferred to the durable
 *   transport work item.
 *
 * The reconstruction chain (`reconstruction.reconstruct_session`):
 *
 *   preprocess (integrity-validated, committed versioned)
 *   → pose (registered estimator, output validated fail-closed;
 *     any failed frame fails the job — ambiguous poses must not
 *     become scene state)
 *   → engine (registered engine, output validated fail-closed)
 *   → point-cloud artifact (content-addressed, INFERRED,
 *     provenance-complete)
 *   → scene artifact (references frames, poses, clouds)
 *   → commit both (idempotent).
 *
 * With no engine registered the job fails closed
 * (`NO_RECONSTRUCTION_ENGINE`): the foundation ships no production
 * geometry engine, and placeholder geometry would violate
 * evidence-over-claims.
 */
import { randomUUID } from "node:crypto";
import type { Logger } from "@aise/backend-logging";
import type { Timestamp, Uuid } from "@aise/shared-contracts";
import type { CaptureUploadSource } from "../capture/source.js";
import { ReconstructionError, toReconstructionError } from "../errors.js";
import { preprocessSession, type PreprocessedSession } from "../preprocessing/preprocess.js";
import { validatePoseEstimationResult, type PoseEstimator } from "../pose/pose.js";
import {
  assertValidReconstructionOutput,
  type ReconstructionEngine,
  type ReconstructionOutput,
} from "../reconstruction/engine.js";
import {
  createPointCloudArtifact,
  type PointCloudArtifact,
  type PointCloudCoordinateFrame,
} from "../artifacts/point-cloud.js";
import {
  createSceneArtifact,
  type SceneArtifact,
  type SceneFrameRef,
  type ScenePointCloudRef,
} from "../artifacts/scene.js";
import { parametersFingerprintOf, type ArtifactInput, type ArtifactProvenance } from "../artifacts/provenance.js";
import type { ReconstructionStateStore } from "../state/store.js";
import type { ReconstructionJobFailure, ReconstructionJobRecord, ReconstructionJobType } from "./jobs.js";

/** Pipeline identity recorded in every artifact's provenance. */
export const PIPELINE_ID = "aise.reconstruction.foundation";
export const PIPELINE_VERSION = "1.0";

/** The coordinate frame every foundation cloud declares. */
export const SESSION_LOCAL_FRAME: PointCloudCoordinateFrame = {
  type: "SESSION_LOCAL",
  unit: "meters",
  georeferenced: false,
};

const DEFAULT_POLL_INTERVAL_MS = 1000;

export interface ReconstructionRunnerOptions {
  readonly source: CaptureUploadSource;
  readonly stateStore: ReconstructionStateStore;
  readonly logger: Logger;
  /** Pose estimator for the pose stage. Required by reconstruct jobs. */
  readonly poseEstimator?: PoseEstimator;
  /** Geometry engine for the reconstruction stage. Required by reconstruct jobs. */
  readonly reconstructionEngine?: ReconstructionEngine;
  /** Poll interval of the background loop. Default: 1000 ms. */
  readonly pollIntervalMs?: number;
  /** Injectable clock for deterministic tests. */
  readonly now?: () => string;
}

export interface ReconstructionRunner {
  /** Enqueues a job and returns its PENDING record snapshot. */
  enqueue(type: ReconstructionJobType, sessionId: Uuid): ReconstructionJobRecord;
  /** Returns a snapshot of the job record. */
  getJob(jobId: Uuid): ReconstructionJobRecord | undefined;
  /** Snapshot list, optionally filtered by session; enqueue order. */
  listJobs(sessionId?: Uuid): readonly ReconstructionJobRecord[];
  /** Processes every currently queued job to completion. */
  drain(): Promise<void>;
  /** Starts the background poll loop. Idempotent; rejects after stop. */
  start(): Promise<void>;
  /** Gracefully stops: aborts idle wait, finishes the current job. */
  stop(): Promise<void>;
  isRunning(): boolean;
}

interface MutableJobRecord {
  id: Uuid;
  type: ReconstructionJobType;
  sessionId: Uuid;
  state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  enqueuedAt: Timestamp;
  startedAt: Timestamp | undefined;
  finishedAt: Timestamp | undefined;
  failure: ReconstructionJobFailure | undefined;
}

function snapshot(record: MutableJobRecord): ReconstructionJobRecord {
  return { ...record, failure: record.failure === undefined ? undefined : { ...record.failure } };
}

export function createReconstructionRunner(options: ReconstructionRunnerOptions): ReconstructionRunner {
  const { source, stateStore, logger, poseEstimator, reconstructionEngine } = options;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const now = options.now ?? (() => new Date().toISOString());
  const jobLogger = logger.child("pipeline");

  const queue: MutableJobRecord[] = [];
  const records = new Map<Uuid, MutableJobRecord>();

  let running = false;
  let started = false;
  let stopped = false;
  let loopPromise: Promise<void> | null = null;
  let sleepAbort: AbortController | null = null;

  const enqueue = (type: ReconstructionJobType, sessionId: Uuid): ReconstructionJobRecord => {
    const record: MutableJobRecord = {
      id: randomUUID(),
      type,
      sessionId,
      state: "PENDING",
      enqueuedAt: now(),
      startedAt: undefined,
      finishedAt: undefined,
      failure: undefined,
    };
    queue.push(record);
    records.set(record.id, record);
    jobLogger.info("reconstruction.job_enqueued", { jobId: record.id, type, sessionId });
    return snapshot(record);
  };

  const processJob = async (record: MutableJobRecord): Promise<void> => {
    record.state = "RUNNING";
    record.startedAt = now();
    jobLogger.debug("reconstruction.job_started", { jobId: record.id, type: record.type, sessionId: record.sessionId });
    try {
      if (record.type === "reconstruction.preprocess_session") {
        runPreprocess(record.sessionId);
      } else {
        await runReconstruction(record.sessionId);
      }
      record.state = "SUCCEEDED";
      jobLogger.info("reconstruction.job_completed", { jobId: record.id, type: record.type, sessionId: record.sessionId });
    } catch (error) {
      const failure = toReconstructionError(error);
      record.state = "FAILED";
      record.failure = {
        code: failure.code,
        message: failure.message,
        retryable: failure.retryable,
      };
      jobLogger.error("reconstruction.job_failed", {
        jobId: record.id,
        type: record.type,
        sessionId: record.sessionId,
        code: failure.code,
        error: failure.message,
      });
    } finally {
      record.finishedAt = now();
    }
  };

  /** Stage 1 (also embedded in reconstruct): preprocessing. */
  const runPreprocess = (sessionId: Uuid): PreprocessedSession => {
    const preprocessed = preprocessSession(source, sessionId);
    stateStore.commitPreprocessedSession(preprocessed);
    return preprocessed;
  };

  /** The full reconstruction chain. */
  const runReconstruction = async (sessionId: Uuid): Promise<void> => {
    const preprocessed = runPreprocess(sessionId);
    const frames = preprocessed.frames;

    if (poseEstimator === undefined) {
      throw new ReconstructionError(
        "NO_POSE_ESTIMATOR",
        "no pose estimator is registered; the pose stage cannot run",
        { details: { sessionId } },
      );
    }
    const poseResult = await poseEstimator.estimatePoses(frames);
    validatePoseEstimationResult(poseResult, frames);
    if (poseResult.failedFrames.length > 0) {
      // Ambiguous poses must not become scene state: fail closed.
      throw new ReconstructionError(
        "POSE_ESTIMATION_FAILED",
        `the pose estimator could not establish poses for ${poseResult.failedFrames.length} frame(s)`,
        {
          details: {
            sessionId,
            estimatorId: poseResult.estimatorId,
            failedFrames: poseResult.failedFrames.map((frame) => ({ frameId: frame.frameId, reason: frame.reason })),
          },
        },
      );
    }

    if (reconstructionEngine === undefined) {
      throw new ReconstructionError(
        "NO_RECONSTRUCTION_ENGINE",
        "no reconstruction engine is registered; geometry cannot be produced without a real method",
        { details: { sessionId } },
      );
    }
    const output: ReconstructionOutput = await reconstructionEngine.reconstruct({
      sessionId,
      frames,
      poses: poseResult.poses,
    });
    assertValidReconstructionOutput(output);
    if (output.status === "failed") {
      throw new ReconstructionError("ENGINE_FAILED", `the reconstruction engine failed: ${output.reason}`, {
        details: { sessionId, engineId: reconstructionEngine.id, reason: output.reason },
      });
    }

    const frameInputs: ArtifactInput[] = frames.map((frame) => ({
      kind: "capture_asset",
      sessionId,
      assetId: frame.assetId,
      contentHash: frame.contentHash,
    }));

    const cloudProvenance: ArtifactProvenance = {
      pipelineId: PIPELINE_ID,
      pipelineVersion: PIPELINE_VERSION,
      method: output.method,
      parametersFingerprint: parametersFingerprintOf(output.parameters),
      inputs: frameInputs,
    };
    const pointCloud: PointCloudArtifact = createPointCloudArtifact({
      sessionId,
      points: output.points,
      coordinateFrame: SESSION_LOCAL_FRAME,
      provenance: cloudProvenance,
    });
    const cloudCommit = stateStore.commitArtifact(pointCloud);
    // Content is identity: on a re-run the same content is already
    // committed, and the scene must cite the canonical locator of
    // that content (the stored artifact id), so identical runs
    // produce identical scenes — idempotent, no duplicates.
    const storedCloud = stateStore.findArtifactByHash(pointCloud.contentHash);
    const canonicalCloud: PointCloudArtifact =
      cloudCommit.status === "already_present" &&
      storedCloud !== undefined &&
      storedCloud.kind === "point_cloud"
        ? storedCloud
        : pointCloud;

    const sceneFrames: SceneFrameRef[] = frames.map((frame) => ({
      frameId: frame.frameId,
      assetId: frame.assetId,
      contentHash: frame.contentHash,
    }));
    const cloudRefs: ScenePointCloudRef[] = [
      { artifactId: canonicalCloud.artifactId, contentHash: canonicalCloud.contentHash },
    ];
    const sceneProvenance: ArtifactProvenance = {
      pipelineId: PIPELINE_ID,
      pipelineVersion: PIPELINE_VERSION,
      method: "scene-composition",
      parametersFingerprint: parametersFingerprintOf(null),
      inputs: [...frameInputs, { kind: "artifact", artifactId: canonicalCloud.artifactId, contentHash: canonicalCloud.contentHash }],
    };
    const scene: SceneArtifact = createSceneArtifact({
      sessionId,
      frames: sceneFrames,
      poses: poseResult.poses,
      pointClouds: cloudRefs,
      provenance: sceneProvenance,
    });
    stateStore.commitArtifact(scene);
  };

  const drain = async (): Promise<void> => {
    for (;;) {
      const record = queue.shift();
      if (record === undefined) {
        return;
      }
      await processJob(record);
    }
  };

  const loop = async (): Promise<void> => {
    while (running) {
      const record = queue.shift();
      if (record === undefined) {
        jobLogger.debug("reconstruction.runner_poll");
        await sleep(pollIntervalMs, sleepAbort?.signal ?? new AbortController().signal);
        continue;
      }
      await processJob(record);
    }
    jobLogger.debug("reconstruction.runner_loop_exited");
  };

  return {
    enqueue,
    getJob: (jobId) => {
      const record = records.get(jobId);
      return record === undefined ? undefined : snapshot(record);
    },
    listJobs: (sessionId) =>
      [...records.values()]
        .filter((record) => sessionId === undefined || record.sessionId === sessionId)
        .map(snapshot),
    drain,
    start: async () => {
      if (stopped) {
        throw new Error("reconstruction runner already stopped");
      }
      if (started) {
        return;
      }
      started = true;
      running = true;
      sleepAbort = new AbortController();
      loopPromise = loop();
      jobLogger.info("reconstruction.runner_started", { pollIntervalMs });
    },
    stop: async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      running = false;
      sleepAbort?.abort();
      await loopPromise;
      jobLogger.info("reconstruction.runner_stopped");
    },
    isRunning: () => running,
  };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => resolve(), ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
