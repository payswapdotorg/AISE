/**
 * Pipeline runner tests (AISE-008).
 *
 * Cover the asynchronous execution semantics the architect gate
 * requires: job lifecycle and states, failure isolation (a failing
 * job never stops the runner and never leaves partial derived
 * state), fail-closed composition (missing estimator/engine),
 * end-to-end reconstruction with artifact creation and verification,
 * idempotent re-runs, and the background poll loop.
 */
import { describe, expect, it } from "vitest";
import { createLogger } from "@aise/backend-logging";
import { createStaticCaptureSource, type CommittedCaptureUpload } from "../capture/source.js";
import { createInMemoryReconstructionStateStore } from "../state/store.js";
import { createReconstructionRunner } from "./runner.js";
import { buildUpload, payloadFor } from "../testing/test-uploads.js";
import {
  verifySceneArtifact,
  type SceneArtifact,
} from "../artifacts/scene.js";
import { verifyPointCloudArtifact, type PointCloudArtifact } from "../artifacts/point-cloud.js";
import type { PoseEstimator, PoseEstimationResult } from "../pose/pose.js";
import type { ReconstructionEngine, ReconstructionOutput } from "../reconstruction/engine.js";
import { createAcquisitionMetadataPoseAdapter } from "../pose/metadata-pose.js";
import { sha256HexBytes } from "../canonical.js";

const SESSION = "11111111-1111-4111-8111-111111111111";

function quietLogger() {
  return createLogger({ level: "error", module: "reconstruction-test", sink: () => undefined });
}

function uploadsFor(sessionId = SESSION): CommittedCaptureUpload[] {
  return [
    buildUpload({
      sessionId,
      assetId: "a-asset",
      capturedAt: "2026-09-03T07:12:31Z",
      orientation: { x: 0.01, y: -0.02, z: 0.005, w: 0.9996 },
      geolocation: { latitude: 5.6037, longitude: -0.187, altitudeM: 76, accuracyM: 4.5 },
    }),
    buildUpload({ sessionId, assetId: "b-asset", capturedAt: "2026-09-03T07:13:02Z" }),
    buildUpload({
      sessionId,
      assetId: "z-voice",
      capturedAt: "2026-09-03T07:12:00Z",
      assetType: "VOICE",
      mimeType: "audio/ogg",
    }),
  ];
}

/** A deterministic engine double implementing the port honestly. */
function testEngine(output?: ReconstructionOutput): ReconstructionEngine {
  return {
    id: "deterministic-test-engine/1",
    reconstruct: (): ReconstructionOutput =>
      output ?? {
        status: "succeeded",
        points: [
          { x: 0, y: 0, z: 0, r: 10, g: 20, b: 30 },
          { x: 1, y: 0.5, z: -0.25 },
          { x: -1, y: -0.5, z: 0.25 },
        ],
        method: "deterministic-test-fusion/1",
        parameters: { scale: 1, mode: "test" },
      },
  };
}

function runnerOf(options: {
  uploads?: CommittedCaptureUpload[];
  engine?: ReconstructionEngine;
  /** `null` omits the pose estimator (fail-closed composition tests). */
  poseEstimator?: PoseEstimator | null;
}) {
  const stateStore = createInMemoryReconstructionStateStore();
  const runner = createReconstructionRunner({
    source: createStaticCaptureSource(options.uploads ?? uploadsFor()),
    stateStore,
    logger: quietLogger(),
    ...(options.poseEstimator === null
      ? {}
      : { poseEstimator: options.poseEstimator ?? createAcquisitionMetadataPoseAdapter() }),
    reconstructionEngine: options.engine,
    pollIntervalMs: 10,
    now: () => "2026-09-03T08:00:00Z",
  });
  return { runner, stateStore };
}

describe("preprocess jobs (asynchronous preprocessing)", () => {
  it("processes an enqueued preprocess job and commits the derived session", async () => {
    const { runner, stateStore } = runnerOf({});
    const enqueued = runner.enqueue("reconstruction.preprocess_session", SESSION);
    expect(enqueued.state).toBe("PENDING");
    expect(enqueued.failure).toBeUndefined();

    await runner.drain();

    const job = runner.getJob(enqueued.id);
    expect(job?.state).toBe("SUCCEEDED");
    expect(job?.startedAt).toBeDefined();
    expect(job?.finishedAt).toBeDefined();
    expect(job?.failure).toBeUndefined();

    const latest = stateStore.latestPreprocessedSession(SESSION);
    expect(latest?.frames.map((frame) => frame.assetId)).toEqual(["a-asset", "b-asset"]);
    expect(latest?.excludedAssets).toEqual([
      { assetId: "z-voice", assetType: "VOICE", reason: "not_reconstructable_asset_type" },
    ]);
  });

  it("records a typed failure and commits nothing when the source is unknown", async () => {
    const { runner, stateStore } = runnerOf({ uploads: [] });
    const enqueued = runner.enqueue("reconstruction.preprocess_session", SESSION);
    await runner.drain();

    const job = runner.getJob(enqueued.id);
    expect(job?.state).toBe("FAILED");
    expect(job?.failure?.code).toBe("SESSION_NOT_FOUND");
    expect(job?.failure?.retryable).toBe(false);
    expect(stateStore.latestPreprocessedSession(SESSION)).toBeUndefined();
  });

  it("isolates failures: a failing job does not stop later jobs", async () => {
    const { runner, stateStore } = runnerOf({});
    const failing = runner.enqueue("reconstruction.preprocess_session", "99999999-9999-4999-8999-999999999999");
    const succeeding = runner.enqueue("reconstruction.preprocess_session", SESSION);
    await runner.drain();

    expect(runner.getJob(failing.id)?.state).toBe("FAILED");
    expect(runner.getJob(succeeding.id)?.state).toBe("SUCCEEDED");
    expect(stateStore.latestPreprocessedSession(SESSION)).toBeDefined();
  });

  it("is idempotent: duplicate preprocess jobs commit one version", async () => {
    const { runner, stateStore } = runnerOf({});
    runner.enqueue("reconstruction.preprocess_session", SESSION);
    runner.enqueue("reconstruction.preprocess_session", SESSION);
    await runner.drain();

    expect(runner.listJobs(SESSION).every((job) => job.state === "SUCCEEDED")).toBe(true);
    expect(stateStore.listPreprocessedSessionVersions(SESSION)).toHaveLength(1);
  });

  it("fails closed on tampered payload bytes and commits nothing", async () => {
    const uploads = [
      buildUpload({
        sessionId: SESSION,
        assetId: "a-asset",
        payload: payloadFor("real"),
        contentHash: sha256HexBytes(payloadFor("declared")),
      }),
    ];
    const { runner, stateStore } = runnerOf({ uploads });
    const enqueued = runner.enqueue("reconstruction.preprocess_session", SESSION);
    await runner.drain();

    expect(runner.getJob(enqueued.id)?.state).toBe("FAILED");
    expect(runner.getJob(enqueued.id)?.failure?.code).toBe("INTEGRITY_MISMATCH");
    expect(stateStore.latestPreprocessedSession(SESSION)).toBeUndefined();
  });
});

describe("reconstruct jobs (fail-closed composition)", () => {
  it("fails closed with NO_RECONSTRUCTION_ENGINE when no engine is registered", async () => {
    const { runner, stateStore } = runnerOf({ engine: undefined });
    const enqueued = runner.enqueue("reconstruction.reconstruct_session", SESSION);
    await runner.drain();

    const job = runner.getJob(enqueued.id);
    expect(job?.state).toBe("FAILED");
    expect(job?.failure?.code).toBe("NO_RECONSTRUCTION_ENGINE");
    // Preprocessing still ran and committed (it is real); no artifacts exist.
    expect(stateStore.latestPreprocessedSession(SESSION)).toBeDefined();
    expect(stateStore.listArtifactsForSession(SESSION)).toEqual([]);
  });

  it("fails closed with NO_POSE_ESTIMATOR when no estimator is registered", async () => {
    const { runner } = runnerOf({ engine: testEngine(), poseEstimator: null });
    const enqueued = runner.enqueue("reconstruction.reconstruct_session", SESSION);
    await runner.drain();

    expect(runner.getJob(enqueued.id)?.failure?.code).toBe("NO_POSE_ESTIMATOR");
  });

  it("fails closed when the pose estimator cannot pose every frame", async () => {
    const partialEstimator: PoseEstimator = {
      id: "partial/1",
      estimatePoses: (frames): PoseEstimationResult => {
        const [first, ...rest] = frames;
        void rest;
        return {
          estimatorId: "partial/1",
          poses: first
            ? [
                {
                  frameId: first.frameId,
                  assetId: first.assetId,
                  orientation: null,
                  orientationProvenance: "NOT_ESTABLISHED",
                  position: null,
                  positionProvenance: "NOT_ESTABLISHED",
                },
              ]
            : [],
          failedFrames: frames
            .slice(1)
            .map((frame) => ({ frameId: frame.frameId, assetId: frame.assetId, reason: "no_match" })),
        };
      },
    };
    const { runner, stateStore } = runnerOf({ engine: testEngine(), poseEstimator: partialEstimator });
    const enqueued = runner.enqueue("reconstruction.reconstruct_session", SESSION);
    await runner.drain();

    const job = runner.getJob(enqueued.id);
    expect(job?.state).toBe("FAILED");
    expect(job?.failure?.code).toBe("POSE_ESTIMATION_FAILED");
    expect(stateStore.listArtifactsForSession(SESSION)).toEqual([]);
  });

  it("fails closed with ENGINE_FAILED when the engine reports failure", async () => {
    const { runner, stateStore } = runnerOf({
      engine: testEngine({ status: "failed", reason: "insufficient overlap" }),
    });
    const enqueued = runner.enqueue("reconstruction.reconstruct_session", SESSION);
    await runner.drain();

    expect(runner.getJob(enqueued.id)?.failure?.code).toBe("ENGINE_FAILED");
    expect(stateStore.listArtifactsForSession(SESSION)).toEqual([]);
  });

  it("fails closed with INVALID_ENGINE_OUTPUT on a malformed engine success", async () => {
    const { runner, stateStore } = runnerOf({
      engine: testEngine({ status: "succeeded", points: [], method: "empty/1" }),
    });
    const enqueued = runner.enqueue("reconstruction.reconstruct_session", SESSION);
    await runner.drain();

    expect(runner.getJob(enqueued.id)?.failure?.code).toBe("INVALID_ENGINE_OUTPUT");
    expect(stateStore.listArtifactsForSession(SESSION)).toEqual([]);
  });

  it("fails closed with INTERNAL_ERROR when the engine throws, and keeps running", async () => {
    const throwingEngine: ReconstructionEngine = {
      id: "throwing/1",
      reconstruct: () => {
        throw new Error("boom");
      },
    };
    const { runner, stateStore } = runnerOf({ engine: throwingEngine });
    const first = runner.enqueue("reconstruction.reconstruct_session", SESSION);
    const second = runner.enqueue("reconstruction.preprocess_session", SESSION);
    await runner.drain();

    expect(runner.getJob(first.id)?.failure?.code).toBe("INTERNAL_ERROR");
    expect(runner.getJob(second.id)?.state).toBe("SUCCEEDED");
    expect(stateStore.listArtifactsForSession(SESSION)).toEqual([]);
  });
});

describe("reconstruct jobs (end-to-end artifact creation)", () => {
  it("creates, commits and leaves verifiable point-cloud and scene artifacts", async () => {
    const { runner, stateStore } = runnerOf({ engine: testEngine() });
    const enqueued = runner.enqueue("reconstruction.reconstruct_session", SESSION);
    await runner.drain();

    expect(runner.getJob(enqueued.id)?.state).toBe("SUCCEEDED");

    const artifacts = stateStore.listArtifactsForSession(SESSION);
    expect(artifacts.map((artifact) => artifact.kind).sort()).toEqual(["point_cloud", "scene"]);

    const cloud = artifacts.find((artifact) => artifact.kind === "point_cloud") as PointCloudArtifact;
    const scene = artifacts.find((artifact) => artifact.kind === "scene") as SceneArtifact;

    // Cloud: content-addressed, INFERRED, provenance-complete, verifiable.
    expect(cloud.pointCount).toBe(3);
    expect(cloud.epistemicState).toBe("INFERRED");
    expect(cloud.provenance.method).toBe("deterministic-test-fusion/1");
    expect(cloud.provenance.pipelineId).toBe("aise.reconstruction.foundation");
    expect(cloud.provenance.inputs).toEqual([
      { kind: "capture_asset", sessionId: SESSION, assetId: "a-asset", contentHash: sha256HexBytes(payloadFor("a-asset")) },
      { kind: "capture_asset", sessionId: SESSION, assetId: "b-asset", contentHash: sha256HexBytes(payloadFor("b-asset")) },
    ]);
    expect(() => verifyPointCloudArtifact(cloud)).not.toThrow();

    // Scene: cites the cloud, carries the metadata poses, verifiable
    // through the store resolver (cross-artifact integrity).
    expect(scene.pointClouds).toEqual([{ artifactId: cloud.artifactId, contentHash: cloud.contentHash }]);
    expect(scene.frames.map((frame) => frame.frameId)).toEqual(["a-asset", "b-asset"]);
    expect(scene.poses[0]?.orientationProvenance).toBe("ACQUISITION_METADATA");
    expect(scene.poses[1]?.orientationProvenance).toBe("NOT_ESTABLISHED");
    expect(() =>
      verifySceneArtifact(scene, (artifactId) => stateStore.findArtifactById(artifactId)),
    ).not.toThrow();

    expect(stateStore.sessionReconstruction(SESSION)).toMatchObject({
      preprocessedVersions: 1,
      pointCloudCount: 1,
      sceneCount: 1,
    });
  });

  it("runs preprocessing implicitly (no prior preprocess job required)", async () => {
    const { runner, stateStore } = runnerOf({ engine: testEngine() });
    runner.enqueue("reconstruction.reconstruct_session", SESSION);
    await runner.drain();
    expect(stateStore.latestPreprocessedSession(SESSION)).toBeDefined();
  });

  it("is idempotent: re-running reconstruct commits no duplicate artifacts", async () => {
    const { runner, stateStore } = runnerOf({ engine: testEngine() });
    runner.enqueue("reconstruction.reconstruct_session", SESSION);
    await runner.drain();
    runner.enqueue("reconstruction.reconstruct_session", SESSION);
    await runner.drain();

    expect(runner.listJobs(SESSION).every((job) => job.state === "SUCCEEDED")).toBe(true);
    expect(stateStore.sessionReconstruction(SESSION)).toMatchObject({
      pointCloudCount: 1,
      sceneCount: 1,
    });
  });
});

describe("runner background loop and job records", () => {
  it("starts, processes enqueued jobs in the background, and stops gracefully", async () => {
    const { runner, stateStore } = runnerOf({});
    await runner.start();
    expect(runner.isRunning()).toBe(true);

    const enqueued = runner.enqueue("reconstruction.preprocess_session", SESSION);

    const deadline = Date.now() + 5000;
    while (runner.getJob(enqueued.id)?.state === "PENDING" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(runner.getJob(enqueued.id)?.state).toBe("SUCCEEDED");
    expect(stateStore.latestPreprocessedSession(SESSION)).toBeDefined();

    await runner.stop();
    expect(runner.isRunning()).toBe(false);
    // Restarting after stop is rejected (same semantics as the
    // foundation worker loop).
    await expect(runner.start()).rejects.toThrow();
  });

  it("returns job snapshots that do not mutate with later transitions", async () => {
    const { runner } = runnerOf({});
    const enqueued = runner.enqueue("reconstruction.preprocess_session", SESSION);
    expect(enqueued.state).toBe("PENDING");
    await runner.drain();
    // The caller-held snapshot still shows PENDING; the live record advanced.
    expect(enqueued.state).toBe("PENDING");
    expect(runner.getJob(enqueued.id)?.state).toBe("SUCCEEDED");
  });

  it("lists jobs per session in enqueue order", async () => {
    const { runner } = runnerOf({});
    const other = "bbbbbbbb-0000-4000-8000-000000000001";
    const first = runner.enqueue("reconstruction.preprocess_session", SESSION);
    const second = runner.enqueue("reconstruction.preprocess_session", SESSION);
    const third = runner.enqueue("reconstruction.preprocess_session", other);
    await runner.drain();

    const sessionJobs = runner.listJobs(SESSION);
    expect(sessionJobs.map((job) => job.id)).toEqual([first.id, second.id]);
    expect(runner.listJobs().map((job) => job.id)).toEqual([first.id, second.id, third.id]);
    expect(runner.getJob("nope")).toBeUndefined();
  });
});
