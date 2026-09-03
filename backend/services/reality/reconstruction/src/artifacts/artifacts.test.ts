/**
 * Artifact tests (AISE-008): provenance, point clouds, scenes.
 *
 * Cover the fail-closed artifact/provenance behavior the architect
 * gate requires:
 * - provenance completeness (every missing lineage field fails
 *   creation AND verification);
 * - the epistemic guard (reconstruction output claiming OBSERVED /
 *   CONFIRMED / PROPOSED is rejected — it is INFERRED by definition);
 * - content-addressing determinism (same content ⇒ same hash);
 * - tamper detection (mutated points, mutated provenance, mutated
 *   scene references all fail verification);
 * - scene cross-artifact integrity (a tampered referenced cloud
 *   invalidates the scene that cites it);
 * - the empty-scene/empty-cloud rejections.
 */
import { describe, expect, it } from "vitest";
import { parametersFingerprintOf, validateArtifactProvenance, type ArtifactInput, type ArtifactProvenance } from "./provenance.js";
import {
  createPointCloudArtifact,
  verifyPointCloudArtifact,
  type CreatePointCloudArtifactInput,
  type PointCloudArtifact,
  type PointCloudCoordinateFrame,
} from "./point-cloud.js";
import {
  createSceneArtifact,
  verifySceneArtifact,
  type SceneArtifact,
  type SceneFrameRef,
  type ScenePointCloudRef,
} from "./scene.js";
import type { PoseEstimate } from "../pose/pose.js";
import { ReconstructionError } from "../errors.js";

const SESSION = "11111111-1111-4111-8111-111111111111";

const FRAME: PointCloudCoordinateFrame = {
  type: "SESSION_LOCAL",
  unit: "meters",
  georeferenced: false,
};

const INPUTS: ArtifactInput[] = [
  { kind: "capture_asset", sessionId: SESSION, assetId: "a-asset", contentHash: "a".repeat(64) },
  { kind: "capture_asset", sessionId: SESSION, assetId: "b-asset", contentHash: "b".repeat(64) },
];

function provenance(overrides: Partial<ArtifactProvenance> = {}): ArtifactProvenance {
  return {
    pipelineId: "aise.reconstruction.foundation",
    pipelineVersion: "1.0",
    method: "test-fusion/1",
    parametersFingerprint: parametersFingerprintOf({ scale: 1 }),
    inputs: INPUTS,
    ...overrides,
  };
}

function cloudInput(overrides: Partial<CreatePointCloudArtifactInput> = {}): CreatePointCloudArtifactInput {
  return {
    sessionId: SESSION,
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0.5, z: -0.25, r: 10, g: 20, b: 30 },
    ],
    coordinateFrame: FRAME,
    provenance: provenance(),
    artifactId: "cloud-1",
    now: () => "2026-09-03T08:00:00Z",
    ...overrides,
  };
}

function makeCloud(overrides: Partial<CreatePointCloudArtifactInput> = {}): PointCloudArtifact {
  return createPointCloudArtifact(cloudInput(overrides));
}

const FRAME_REFS: SceneFrameRef[] = [
  { frameId: "a-asset", assetId: "a-asset", contentHash: "a".repeat(64) },
  { frameId: "b-asset", assetId: "b-asset", contentHash: "b".repeat(64) },
];

const POSES: PoseEstimate[] = [
  {
    frameId: "a-asset",
    assetId: "a-asset",
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    orientationProvenance: "ACQUISITION_METADATA",
    position: null,
    positionProvenance: "NOT_ESTABLISHED",
  },
  { frameId: "b-asset", assetId: "b-asset", orientation: null, orientationProvenance: "NOT_ESTABLISHED", position: null, positionProvenance: "NOT_ESTABLISHED" },
];

function makeScene(cloud: PointCloudArtifact, overrides: Record<string, unknown> = {}): SceneArtifact {
  const cloudRefs: ScenePointCloudRef[] = [
    { artifactId: cloud.artifactId, contentHash: cloud.contentHash },
  ];
  return createSceneArtifact({
    sessionId: SESSION,
    frames: FRAME_REFS,
    poses: POSES,
    pointClouds: cloudRefs,
    provenance: provenance({ method: "scene-composition", inputs: [...INPUTS, { kind: "artifact", artifactId: cloud.artifactId, contentHash: cloud.contentHash }] }),
    artifactId: "scene-1",
    now: () => "2026-09-03T08:00:01Z",
    ...overrides,
  } as Parameters<typeof createSceneArtifact>[0]);
}

function expectError(fn: () => unknown, code: string): ReconstructionError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ReconstructionError);
  const reconstructionError = caught as ReconstructionError;
  expect(reconstructionError.code).toBe(code);
  return reconstructionError;
}

describe("parametersFingerprintOf", () => {
  it("is deterministic for equal parameters", () => {
    expect(parametersFingerprintOf({ a: 1, b: "x" })).toBe(parametersFingerprintOf({ b: "x", a: 1 }));
  });
  it("distinguishes different parameters", () => {
    expect(parametersFingerprintOf({ a: 1 })).not.toBe(parametersFingerprintOf({ a: 2 }));
  });
  it("distinguishes absent parameters from an empty record", () => {
    expect(parametersFingerprintOf(null)).not.toBe(parametersFingerprintOf({}));
  });
});

describe("provenance gate (fail closed on incomplete lineage)", () => {
  it("accepts complete provenance", () => {
    expect(() => validateArtifactProvenance(provenance())).not.toThrow();
  });

  it("rejects a missing pipeline id", () => {
    expectError(() => validateArtifactProvenance(provenance({ pipelineId: "" })), "PROVENANCE_INCOMPLETE");
  });

  it("rejects a missing pipeline version", () => {
    expectError(() => validateArtifactProvenance(provenance({ pipelineVersion: "" })), "PROVENANCE_INCOMPLETE");
  });

  it("rejects a missing method", () => {
    expectError(() => validateArtifactProvenance(provenance({ method: "" })), "PROVENANCE_INCOMPLETE");
  });

  it("rejects a malformed parameters fingerprint", () => {
    expectError(
      () => validateArtifactProvenance(provenance({ parametersFingerprint: "nope" })),
      "PROVENANCE_INCOMPLETE",
    );
  });

  it("rejects empty input lineage", () => {
    expectError(() => validateArtifactProvenance(provenance({ inputs: [] })), "PROVENANCE_INCOMPLETE");
  });

  it("rejects a capture_asset input without a content hash", () => {
    const broken = provenance({
      inputs: [{ kind: "capture_asset", sessionId: SESSION, assetId: "x", contentHash: "short" }],
    });
    expectError(() => validateArtifactProvenance(broken), "PROVENANCE_INCOMPLETE");
  });

  it("rejects an artifact input without an artifact id", () => {
    const broken = provenance({
      inputs: [{ kind: "artifact", artifactId: "", contentHash: "a".repeat(64) }],
    });
    expectError(() => validateArtifactProvenance(broken), "PROVENANCE_INCOMPLETE");
  });

  it("rejects an input of unknown kind", () => {
    const broken = provenance({
      inputs: [{ kind: "mystery" } as unknown as ArtifactInput],
    });
    expectError(() => validateArtifactProvenance(broken), "PROVENANCE_INCOMPLETE");
  });
});

describe("point-cloud artifact creation", () => {
  it("creates a content-addressed cloud with INFERRED epistemic state", () => {
    const cloud = makeCloud();
    expect(cloud.kind).toBe("point_cloud");
    expect(cloud.formatVersion).toBe("1.0");
    expect(cloud.pointCount).toBe(2);
    expect(cloud.epistemicState).toBe("INFERRED");
    expect(cloud.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cloud.coordinateFrame).toEqual(FRAME);
  });

  it("is deterministic: equal content produces equal hashes", () => {
    const first = makeCloud();
    const second = makeCloud({ artifactId: "cloud-2" });
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.artifactId).not.toBe(second.artifactId);
  });

  it("changes the hash when the content changes", () => {
    const first = makeCloud();
    const second = makeCloud({
      points: [{ x: 5, y: 0, z: 0 }],
    });
    expect(first.contentHash).not.toBe(second.contentHash);
  });

  it("changes the hash when the provenance inputs change", () => {
    const first = makeCloud();
    const second = makeCloud({
      provenance: provenance({
        inputs: [{ kind: "capture_asset", sessionId: SESSION, assetId: "other", contentHash: "c".repeat(64) }],
      }),
    });
    expect(first.contentHash).not.toBe(second.contentHash);
  });

  it("rejects an empty cloud", () => {
    expectError(() => makeCloud({ points: [] }), "EMPTY_RECONSTRUCTION");
  });

  it("rejects a non-finite point", () => {
    expectError(
      () => makeCloud({ points: [{ x: Number.NaN, y: 0, z: 0 }] }),
      "VALIDATION_FAILED",
    );
  });

  it("rejects an out-of-range color channel", () => {
    expectError(
      () => makeCloud({ points: [{ x: 0, y: 0, z: 0, r: 999 }] }),
      "VALIDATION_FAILED",
    );
  });

  it("rejects a georeferencing claim", () => {
    expectError(
      () =>
        makeCloud({
          coordinateFrame: { type: "SESSION_LOCAL", unit: "meters", georeferenced: true },
        }),
      "VALIDATION_FAILED",
    );
  });

  it("rejects an epistemic claim of OBSERVED", () => {
    expectError(() => makeCloud({ epistemicState: "OBSERVED" }), "EPISTEMIC_STATE_INVALID");
  });

  it("rejects an epistemic claim of CONFIRMED", () => {
    expectError(() => makeCloud({ epistemicState: "CONFIRMED" }), "EPISTEMIC_STATE_INVALID");
  });

  it("rejects an epistemic claim of PROPOSED", () => {
    expectError(() => makeCloud({ epistemicState: "PROPOSED" }), "EPISTEMIC_STATE_INVALID");
  });

  it("rejects incomplete provenance at creation", () => {
    expectError(
      () => makeCloud({ provenance: provenance({ inputs: [] }) }),
      "PROVENANCE_INCOMPLETE",
    );
  });
});

describe("point-cloud artifact verification (tamper detection)", () => {
  it("verifies an untampered cloud", () => {
    const cloud = makeCloud();
    expect(() => verifyPointCloudArtifact(cloud)).not.toThrow();
  });

  it("detects a mutated point", () => {
    const cloud = makeCloud();
    const tampered = {
      ...cloud,
      points: [{ x: 42, y: 0, z: 0 }, cloud.points[1]!],
    } as PointCloudArtifact;
    const error = expectError(() => verifyPointCloudArtifact(tampered), "INTEGRITY_MISMATCH");
    expect(error.details).toMatchObject({ artifactId: cloud.artifactId, stored: cloud.contentHash });
  });

  it("detects a mutated provenance input hash", () => {
    const cloud = makeCloud();
    const tampered = {
      ...cloud,
      provenance: provenance({
        inputs: [
          { kind: "capture_asset", sessionId: SESSION, assetId: "a-asset", contentHash: "f".repeat(64) },
          INPUTS[1]!,
        ],
      }),
    } as unknown as PointCloudArtifact;
    expectError(() => verifyPointCloudArtifact(tampered), "INTEGRITY_MISMATCH");
  });

  it("detects a mutated method label", () => {
    const cloud = makeCloud();
    const tampered = {
      ...cloud,
      provenance: provenance({ method: "other-method/2" }),
    } as unknown as PointCloudArtifact;
    expectError(() => verifyPointCloudArtifact(tampered), "INTEGRITY_MISMATCH");
  });

  it("detects an epistemic upgrade after creation", () => {
    const cloud = makeCloud();
    const tampered = { ...cloud, epistemicState: "CONFIRMED" as const } as PointCloudArtifact;
    expectError(() => verifyPointCloudArtifact(tampered), "EPISTEMIC_STATE_INVALID");
  });

  it("detects a drifted pointCount", () => {
    const cloud = makeCloud();
    const tampered = { ...cloud, pointCount: 7 } as PointCloudArtifact;
    expectError(() => verifyPointCloudArtifact(tampered), "VALIDATION_FAILED");
  });
});

describe("scene artifact creation", () => {
  it("creates a scene that references the cloud, frames and poses", () => {
    const cloud = makeCloud();
    const scene = makeScene(cloud);
    expect(scene.kind).toBe("scene");
    expect(scene.frames).toEqual(FRAME_REFS);
    expect(scene.poses).toEqual(POSES);
    expect(scene.pointClouds).toEqual([{ artifactId: cloud.artifactId, contentHash: cloud.contentHash }]);
    expect(scene.epistemicState).toBe("INFERRED");
    expect(scene.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(scene.stages.map((stage) => stage.name)).toEqual(["preprocessing", "scene_composition"]);
    expect(scene.stages.every((stage) => stage.status === "COMPLETED")).toBe(true);
  });

  it("rejects a scene with zero point clouds", () => {
    const cloud = makeCloud();
    expectError(() => makeScene(cloud, { pointClouds: [] }), "EMPTY_SCENE");
  });

  it("rejects a scene with zero frames", () => {
    const cloud = makeCloud();
    expectError(() => makeScene(cloud, { frames: [] }), "VALIDATION_FAILED");
  });

  it("rejects an epistemic claim of OBSERVED", () => {
    const cloud = makeCloud();
    expectError(() => makeScene(cloud, { epistemicState: "OBSERVED" }), "EPISTEMIC_STATE_INVALID");
  });

  it("rejects duplicate frame references", () => {
    const cloud = makeCloud();
    expectError(
      () =>
        makeScene(cloud, {
          frames: [FRAME_REFS[0]!, FRAME_REFS[0]!],
        }),
      "VALIDATION_FAILED",
    );
  });

  it("rejects duplicate cloud references", () => {
    const cloud = makeCloud();
    const ref = { artifactId: cloud.artifactId, contentHash: cloud.contentHash };
    expectError(
      () => makeScene(cloud, { pointClouds: [ref, ref] }),
      "VALIDATION_FAILED",
    );
  });

  it("rejects duplicate poses for one frame", () => {
    const cloud = makeCloud();
    expectError(
      () => makeScene(cloud, { poses: [POSES[0]!, POSES[0]!] }),
      "VALIDATION_FAILED",
    );
  });

  it("changes the scene hash when a cited cloud changes", () => {
    const cloudA = makeCloud();
    const cloudB = makeCloud({ points: [{ x: 9, y: 9, z: 9 }] });
    const sceneA = makeScene(cloudA, { artifactId: "scene-a" });
    const sceneB = makeScene(cloudB, { artifactId: "scene-b" });
    expect(sceneA.contentHash).not.toBe(sceneB.contentHash);
  });

  it("changes the scene hash when a pose changes", () => {
    const cloud = makeCloud();
    const sceneA = makeScene(cloud, { artifactId: "scene-a" });
    const sceneB = makeScene(cloud, {
      artifactId: "scene-b",
      poses: [
        {
          frameId: "a-asset",
          assetId: "a-asset",
          orientation: { x: 0.5, y: 0, z: 0, w: 0.866 },
          orientationProvenance: "ACQUISITION_METADATA",
          position: null,
          positionProvenance: "NOT_ESTABLISHED",
        },
        POSES[1]!,
      ],
    });
    expect(sceneA.contentHash).not.toBe(sceneB.contentHash);
  });
});

describe("scene verification (cross-artifact integrity)", () => {
  it("verifies an untampered scene with its cloud", () => {
    const cloud = makeCloud();
    const scene = makeScene(cloud);
    const resolver = (artifactId: string) => (artifactId === cloud.artifactId ? cloud : undefined);
    expect(() => verifySceneArtifact(scene, resolver)).not.toThrow();
  });

  it("fails closed when a cited artifact is missing", () => {
    const cloud = makeCloud();
    const scene = makeScene(cloud);
    expectError(() => verifySceneArtifact(scene, () => undefined), "ARTIFACT_NOT_FOUND");
  });

  it("fails closed when a reference resolves to a non-point-cloud", () => {
    const cloud = makeCloud();
    const scene = makeScene(cloud);
    expectError(
      () => verifySceneArtifact(scene, () => makeScene(cloud, { artifactId: cloud.artifactId })),
      "SCENE_REFERENCE_INVALID",
    );
  });

  it("fails closed when the cited hash does not match the artifact", () => {
    const cloud = makeCloud();
    const scene = makeScene(cloud);
    const mutated = makeCloud({ artifactId: cloud.artifactId, points: [{ x: 3, y: 3, z: 3 }] });
    const resolver = (artifactId: string) => (artifactId === cloud.artifactId ? mutated : undefined);
    expectError(() => verifySceneArtifact(scene, resolver), "SCENE_REFERENCE_INVALID");
  });

  it("fails closed when the cited cloud was tampered (deep verification)", () => {
    const cloud = makeCloud();
    const scene = makeScene(cloud);
    const tamperedCloud = {
      ...cloud,
      points: [{ x: 100, y: 0, z: 0 }, cloud.points[1]!],
    } as PointCloudArtifact;
    const resolver = (artifactId: string) =>
      artifactId === cloud.artifactId ? tamperedCloud : undefined;
    // The reference hash matches the stored (stale) hash, but the
    // cloud's own content no longer verifies — the scene fails too.
    expectError(() => verifySceneArtifact(scene, resolver), "INTEGRITY_MISMATCH");
  });

  it("fails closed when the scene content itself was tampered", () => {
    const cloud = makeCloud();
    const scene = makeScene(cloud);
    const tamperedScene = {
      ...scene,
      frames: [FRAME_REFS[0]!],
    } as unknown as SceneArtifact;
    const resolver = (artifactId: string) => (artifactId === cloud.artifactId ? cloud : undefined);
    expectError(() => verifySceneArtifact(tamperedScene, resolver), "INTEGRITY_MISMATCH");
  });

  it("fails closed when the scene's own epistemic state was upgraded", () => {
    const cloud = makeCloud();
    const scene = makeScene(cloud);
    const tamperedScene = { ...scene, epistemicState: "OBSERVED" as const } as SceneArtifact;
    expectError(() => verifySceneArtifact(tamperedScene, () => cloud), "EPISTEMIC_STATE_INVALID");
  });
});
