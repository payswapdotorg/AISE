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
import { createSceneArtifact, type SceneArtifact } from "../artifacts/scene.js";
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
