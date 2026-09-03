/**
 * Reconstruction state store tests (AISE-008).
 *
 * Cover the versioned, append-only, content-addressed semantics:
 * idempotent re-commits, retained prior versions, artifact id
 * conflicts, and the per-session read models.
 */
import { describe, expect, it } from "vitest";
import { createInMemoryReconstructionStateStore } from "./store.js";
import type { PreprocessedSession } from "../preprocessing/preprocess.js";
import { parametersFingerprintOf, type ArtifactProvenance } from "../artifacts/provenance.js";
import { createPointCloudArtifact, type PointCloudArtifact } from "../artifacts/point-cloud.js";
import { canonicalContentHash } from "../canonical.js";
import {
  createSceneArtifact,
  sceneContent,
  type ReconstructionArtifact,
  type SceneArtifact,
} from "../artifacts/scene.js";
import { ReconstructionError } from "../errors.js";

const SESSION = "11111111-1111-4111-8111-111111111111";
const NOW = "2026-09-03T08:00:00Z";

function preprocessed(fingerprint: string, assetId = "a-asset"): PreprocessedSession {
  return {
    formatVersion: "1.0",
    sessionId: SESSION,
    frames: [
      {
        frameId: assetId,
        assetId,
        assetType: "PHOTO",
        capturedAt: "2026-09-03T07:12:31Z",
        mimeType: "image/jpeg",
        contentHash: "a".repeat(64),
        byteSize: 96,
        acquisition: { capturedAt: "2026-09-03T07:12:31Z" },
      },
    ],
    excludedAssets: [],
    fingerprint,
    createdAt: NOW,
  };
}

function provenance(): ArtifactProvenance {
  return {
    pipelineId: "aise.reconstruction.foundation",
    pipelineVersion: "1.0",
    method: "test/1",
    parametersFingerprint: parametersFingerprintOf(null),
    inputs: [{ kind: "capture_asset", sessionId: SESSION, assetId: "a-asset", contentHash: "a".repeat(64) }],
  };
}

function cloud(artifactId: string, seed = 0): PointCloudArtifact {
  return createPointCloudArtifact({
    sessionId: SESSION,
    points: [
      { x: seed, y: 0, z: 0 },
      { x: seed + 1, y: 1, z: 1 },
    ],
    coordinateFrame: { type: "SESSION_LOCAL", unit: "meters", georeferenced: false },
    provenance: provenance(),
    artifactId,
    now: () => NOW,
  });
}

function scene(artifactId: string, cited: PointCloudArtifact): SceneArtifact {
  return createSceneArtifact({
    sessionId: SESSION,
    frames: [{ frameId: "a-asset", assetId: "a-asset", contentHash: "a".repeat(64) }],
    poses: [
      {
        frameId: "a-asset",
        assetId: "a-asset",
        orientation: null,
        orientationProvenance: "NOT_ESTABLISHED",
        position: null,
        positionProvenance: "NOT_ESTABLISHED",
      },
    ],
    pointClouds: [{ artifactId: cited.artifactId, contentHash: cited.contentHash }],
    provenance: provenance(),
    artifactId,
    now: () => NOW,
  });
}

describe("preprocessed-session versioning", () => {
  it("commits the first version and treats an identical re-commit as already_present", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    expect(store.commitPreprocessedSession(preprocessed("f1"))).toEqual({ status: "committed" });
    expect(store.commitPreprocessedSession(preprocessed("f1"))).toEqual({ status: "already_present" });
    expect(store.listPreprocessedSessionVersions(SESSION)).toHaveLength(1);
  });

  it("appends a new version when the fingerprint changes and retains prior versions", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    store.commitPreprocessedSession(preprocessed("f1"));
    expect(store.commitPreprocessedSession(preprocessed("f2"))).toEqual({ status: "committed" });

    const versions = store.listPreprocessedSessionVersions(SESSION);
    expect(versions).toHaveLength(2);
    expect(versions[0]?.fingerprint).toBe("f1");
    expect(versions[1]?.fingerprint).toBe("f2");
    expect(store.latestPreprocessedSession(SESSION)?.fingerprint).toBe("f2");
  });

  it("re-committing an older fingerprint after a newer one commits as a new version", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    store.commitPreprocessedSession(preprocessed("f1"));
    store.commitPreprocessedSession(preprocessed("f2"));
    // State changed since f1; reprocessing f1 is a new derived version,
    // not a duplicate — and f1's earlier version stays discoverable.
    expect(store.commitPreprocessedSession(preprocessed("f1"))).toEqual({ status: "committed" });
    expect(store.listPreprocessedSessionVersions(SESSION)).toHaveLength(3);
    expect(store.latestPreprocessedSession(SESSION)?.fingerprint).toBe("f1");
  });

  it("answers undefined for sessions without preprocessing state", () => {
    const store = createInMemoryReconstructionStateStore();
    expect(store.latestPreprocessedSession("99999999-9999-4999-8999-999999999999")).toBeUndefined();
    expect(store.listPreprocessedSessionVersions("99999999-9999-4999-8999-999999999999")).toEqual([]);
  });
});

describe("artifact commits (content-addressed)", () => {
  it("commits once and deduplicates identical content", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    const first = cloud("cloud-1");
    const sameContent = cloud("cloud-1");
    expect(store.commitArtifact(first)).toEqual({ status: "committed" });
    expect(store.commitArtifact(sameContent)).toEqual({ status: "already_present" });
    expect(store.listArtifactsForSession(SESSION)).toHaveLength(1);
  });

  it("fails closed when an artifact id is reused for different content", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    const original = cloud("cloud-1", 0);
    store.commitArtifact(original);

    const conflicting = cloud("cloud-1", 5);
    let caught: unknown;
    try {
      store.commitArtifact(conflicting);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReconstructionError);
    expect((caught as ReconstructionError).code).toBe("ARTIFACT_ID_CONFLICT");
    // The original is untouched.
    expect(store.findArtifactById("cloud-1")?.contentHash).toBe(original.contentHash);
    expect(store.listArtifactsForSession(SESSION)).toHaveLength(1);
  });

  it("stores distinct content as distinct artifacts in commit order", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    const first = cloud("cloud-1", 0);
    const second = cloud("cloud-2", 5);
    const sceneArtifact = scene("scene-1", first);
    store.commitArtifact(first);
    store.commitArtifact(second);
    store.commitArtifact(sceneArtifact);

    const artifacts = store.listArtifactsForSession(SESSION);
    expect(artifacts.map((artifact) => artifact.artifactId)).toEqual(["cloud-1", "cloud-2", "scene-1"]);
    expect(store.findArtifactByHash(first.contentHash)?.artifactId).toBe("cloud-1");
  });

  it("keeps the session index duplicate-free across re-commits", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    const first = cloud("cloud-1", 0);
    store.commitArtifact(first);
    store.commitArtifact(cloud("cloud-1", 0));
    expect(store.listArtifactsForSession(SESSION)).toHaveLength(1);
  });

  it("answers undefined for unknown artifact lookups", () => {
    const store = createInMemoryReconstructionStateStore();
    expect(store.findArtifactById("nope")).toBeUndefined();
    expect(store.findArtifactByHash("nope")).toBeUndefined();
  });
});

describe("persistence-boundary verification (the store does not trust the caller)", () => {
  function expectCommitFailure(
    store: ReturnType<typeof createInMemoryReconstructionStateStore>,
    artifact: ReconstructionArtifact,
    code: string,
  ): ReconstructionError {
    let caught: unknown;
    try {
      store.commitArtifact(artifact);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReconstructionError);
    const failure = caught as ReconstructionError;
    expect(failure.code).toBe(code);
    return failure;
  }

  it("rejects a tampered point cloud (mutated points, stale hash) and stores nothing", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    const original = cloud("cloud-1", 0);
    const tampered = {
      ...original,
      points: [{ x: 99, y: 0, z: 0 }, original.points[1]!],
    } as PointCloudArtifact;
    expectCommitFailure(store, tampered, "INTEGRITY_MISMATCH");
    // Nothing entered the store — not by hash, not by id, not in the
    // session index, not in the read model.
    expect(store.listArtifactsForSession(SESSION)).toEqual([]);
    expect(store.findArtifactById("cloud-1")).toBeUndefined();
    expect(store.findArtifactByHash(original.contentHash)).toBeUndefined();
    expect(store.sessionReconstruction(SESSION).artifactCount).toBe(0);
  });

  it("rejects a drifted pointCount even when the claimed hash matches committed content", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    const original = cloud("cloud-1", 0);
    expect(store.commitArtifact(original)).toEqual({ status: "committed" });
    // pointCount is bookkeeping (excluded from the content hash): the
    // drifted object claims the SAME hash, so without boundary
    // verification it would be waved through as `already_present`.
    const drifted = { ...original, pointCount: 7 } as PointCloudArtifact;
    expectCommitFailure(store, drifted, "VALIDATION_FAILED");
    // The committed original is untouched and still the only artifact.
    const stored = store.findArtifactById("cloud-1") as PointCloudArtifact | undefined;
    expect(stored?.pointCount).toBe(original.pointCount);
    expect(store.listArtifactsForSession(SESSION)).toHaveLength(1);
  });

  it("rejects a tampered scene (poses removed) and stores nothing", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    const cited = cloud("cloud-1", 0);
    expect(store.commitArtifact(cited)).toEqual({ status: "committed" });
    const validScene = scene("scene-1", cited);
    const tampered = { ...validScene, poses: [] } as unknown as SceneArtifact;
    expectCommitFailure(store, tampered, "SCENE_POSE_FRAME_MISMATCH");
    // The scene never entered the store; the cited cloud is intact.
    expect(store.findArtifactById("scene-1")).toBeUndefined();
    expect(store.listArtifactsForSession(SESSION)).toHaveLength(1);
    expect(store.sessionReconstruction(SESSION).sceneCount).toBe(0);
  });

  it("rejects a FORGED scene whose content hash was recomputed after tampering", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    const cited = cloud("cloud-1", 0);
    expect(store.commitArtifact(cited)).toEqual({ status: "committed" });
    const validScene = scene("scene-1", cited);
    // The strongest adversary: break the frame ↔ pose correspondence
    // AND recompute the hash, so hash comparison alone would pass —
    // the store's boundary verification is what fails closed.
    const broken: SceneArtifact = { ...validScene, poses: [] };
    const forged: SceneArtifact = {
      ...broken,
      contentHash: canonicalContentHash(sceneContent(broken)),
    };
    expectCommitFailure(store, forged, "SCENE_POSE_FRAME_MISMATCH");
    expect(store.findArtifactById("scene-1")).toBeUndefined();
    expect(store.listArtifactsForSession(SESSION)).toHaveLength(1);
  });

  it("rejects a scene citing a point cloud that has not been committed", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    const uncommitted = cloud("cloud-9", 3);
    const sceneArtifact = scene("scene-1", uncommitted);
    expectCommitFailure(store, sceneArtifact, "ARTIFACT_NOT_FOUND");
    expect(store.listArtifactsForSession(SESSION)).toEqual([]);
  });

  it("rejects an artifact of unknown kind", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    const mystery = {
      ...cloud("cloud-1", 0),
      kind: "mystery",
    } as unknown as ReconstructionArtifact;
    const failure = expectCommitFailure(store, mystery, "VALIDATION_FAILED");
    expect(failure.message).toContain("unknown kind");
    expect(store.listArtifactsForSession(SESSION)).toEqual([]);
  });

  it("still verifies and accepts idempotent re-commits of committed content", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    const original = cloud("cloud-1", 0);
    expect(store.commitArtifact(original)).toEqual({ status: "committed" });
    // The boundary gate runs first and passes; identity logic then
    // deduplicates — idempotency is preserved behind verification.
    expect(store.commitArtifact(cloud("cloud-1", 0))).toEqual({ status: "already_present" });
    expect(store.listArtifactsForSession(SESSION)).toHaveLength(1);
  });
});

describe("session reconstruction summary", () => {
  it("summarizes derived state per session", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    store.commitPreprocessedSession(preprocessed("f1"));
    store.commitPreprocessedSession(preprocessed("f2"));
    const first = cloud("cloud-1", 0);
    store.commitArtifact(first);
    store.commitArtifact(scene("scene-1", first));

    expect(store.sessionReconstruction(SESSION)).toEqual({
      sessionId: SESSION,
      preprocessedVersions: 2,
      artifactCount: 2,
      pointCloudCount: 1,
      sceneCount: 1,
    });
    expect(store.sessionReconstruction("99999999-9999-4999-8999-999999999999")).toEqual({
      sessionId: "99999999-9999-4999-8999-999999999999",
      preprocessedVersions: 0,
      artifactCount: 0,
      pointCloudCount: 0,
      sceneCount: 0,
    });
  });

  it("exposes its kind and an injectable clock", () => {
    const store = createInMemoryReconstructionStateStore({ now: () => NOW });
    expect(store.kind).toBe("memory");
    expect(store.now()).toBe(NOW);
  });
});
