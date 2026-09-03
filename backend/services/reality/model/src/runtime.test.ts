/**
 * Service composition tests: bounded ingestion, store injection,
 * the ingest-and-commit flow.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { loadConfig } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { modelProvenance } from "@aise/engineering-model";
import { RealityModelError } from "./errors.js";
import { buildRealityModelService, DEFAULT_MAX_SCENE_OBJECTS } from "./runtime.js";
import { createInMemoryRealityModelStore } from "./store.js";

const MODEL = "model-runtime";
const PROJECT = "project-runtime";
const SPACE = "room-runtime";
const target = { modelId: MODEL, projectId: PROJECT, spaceId: SPACE };

const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });

function buildService(options?: { maxSceneObjects?: number; store?: ReturnType<typeof createInMemoryRealityModelStore> }) {
  const env: Record<string, string> = { AISE_ENV: "test", AISE_LOG_LEVEL: "error" };
  const configResult = loadConfig(env);
  if (!configResult.ok) {
    throw new Error("test config must load");
  }
  const logger = createLogger({ level: "error", module: "reality-model-test" });
  return buildRealityModelService(configResult.config, logger, options);
}

describe("buildRealityModelService", () => {
  it("builds with bounded-compute defaults", () => {
    const service = buildService();
    expect(service.limits.maxSceneObjects).toBe(DEFAULT_MAX_SCENE_OBJECTS);
    expect(DEFAULT_MAX_SCENE_OBJECTS).toBeGreaterThan(0);
  });

  it("rejects invalid bounds (fail closed)", () => {
    expect(() => buildService({ maxSceneObjects: 0 })).toThrow();
    expect(() => buildService({ maxSceneObjects: 2.5 })).toThrow();
  });
});

describe("the ingest-and-commit flow", () => {
  it("creates the model, ingests, and commits exactly one version", () => {
    const service = buildService();
    expect(service.createModel({ modelId: MODEL, projectId: PROJECT })).toEqual({ status: "created" });
    const producer = modelProvenance("model/version-commit-v1", { sceneId: scene.sceneId }, [
      { kind: "scene", sceneId: scene.sceneId, contentHash: scene.contentHash, epistemic: "INFERRED" },
    ]);
    const { commit, report } = service.ingestAndCommit(scene, target, producer);
    expect(commit.status).toBe("committed");
    expect(commit.version).toBe(1);
    expect(report.ingestedObjectCount).toBe(scene.objects.length);

    const current = service.getCurrentVersion(MODEL)!;
    expect(current.record.version).toBe(1);
    expect(current.graph.objects).toHaveLength(scene.objects.length);
  });

  it("reports already_present on deterministic re-ingestion (end-to-end idempotency)", () => {
    const service = buildService();
    service.createModel({ modelId: MODEL, projectId: PROJECT });
    const producer = modelProvenance("model/version-commit-v1", { sceneId: scene.sceneId }, [
      { kind: "scene", sceneId: scene.sceneId, contentHash: scene.contentHash, epistemic: "INFERRED" },
    ]);
    service.ingestAndCommit(scene, target, producer);
    const again = service.ingestAndCommit(scene, target, producer);
    expect(again.commit.status).toBe("already_present");
    expect(service.listVersions(MODEL)).toHaveLength(1);
  });

  it("exposes ingestScene without committing", () => {
    const service = buildService();
    const result = service.ingestScene(scene, target);
    expect(result.graph.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.bounded.sceneObjectCount).toBe(scene.objects.length);
    expect(service.getCurrentVersion(MODEL)).toBeUndefined();
  });

  it("rejects scenes above the ingestion bound (bounded compute)", () => {
    const service = buildService({ maxSceneObjects: 1 });
    expect(() => service.ingestScene(scene, target)).toThrow(RealityModelError);
    expect(() =>
      service.ingestAndCommit(
        scene,
        target,
        modelProvenance("model/version-commit-v1", {}, [
          { kind: "scene", sceneId: scene.sceneId, contentHash: scene.contentHash, epistemic: "INFERRED" },
        ]),
      ),
    ).toThrow(RealityModelError);
  });

  it("accepts an injected store (fixed clock)", () => {
    const store = createInMemoryRealityModelStore({ now: () => "2026-01-01T00:00:00Z" });
    const service = buildService({ store });
    service.createModel({ modelId: MODEL, projectId: PROJECT });
    const producer = modelProvenance("model/version-commit-v1", {}, [
      { kind: "scene", sceneId: scene.sceneId, contentHash: scene.contentHash, epistemic: "INFERRED" },
    ]);
    service.ingestAndCommit(scene, target, producer);
    expect(service.getCurrentVersion(MODEL)!.record.committedAt).toBe("2026-01-01T00:00:00Z");
  });
});
