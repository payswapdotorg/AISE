/**
 * Reality-model service composition (AISE-011 backend).
 *
 * Binds the ingestion adapter and the versioned append-only store
 * into a single service object with bounded-compute defaults:
 *
 * - bounded ingestion: scenes above `maxSceneObjects` (default
 *   5,000 extracted objects) are rejected (`BOUNDS_EXCEEDED` in
 *   the underlying model error vocabulary / `INGESTION_INVALID`),
 *   never silently attempted — unbounded work is the store's
 *   enemy (a graph commit is O(content), but the producer must
 *   still be bounded);
 * - the service adds NO authority of its own: ingestion is
 *   transport (epistemic states pass through unchanged, guarded),
 *   the store validates at the boundary and computes digests
 *   itself;
 * - v1.0 composition boundary: one scene → one graph → one
 *   committed version (multi-scene composition and incremental
 *   updates are deferred — they need cross-scene identity
 *   correspondence, which is an evidence-subsystem question,
 *   AISE-012+).
 */
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";
import type { ArchitecturalScene } from "@aise/backend-semantics";
import {
  createInMemoryRealityModelStore,
  type CommitVersionResult,
  type CreateModelResult,
  type RealityModelStore,
  type StoredModelVersion,
} from "./store.js";
import {
  ingestArchitecturalScene,
  type IngestionReport,
  type IngestionResult,
  type IngestionTarget,
} from "./ingest.js";
import { RealityModelError } from "./errors.js";
import type { ModelVersionRecord, ModelProvenance, RealityModelGraph } from "@aise/engineering-model";

/** Default upper bound on ingested scene objects. */
export const DEFAULT_MAX_SCENE_OBJECTS = 5000;

/** The reality-model service surface. */
export interface RealityModelService {
  /** Registers a model identity (create-if-absent). */
  readonly createModel: (input: { modelId: string; projectId: string }) => CreateModelResult;

  /** Ingests one architectural scene into a complete graph (deterministic). */
  readonly ingestScene: (
    scene: ArchitecturalScene,
    target: IngestionTarget,
  ) => IngestionResult & { bounded: { sceneObjectCount: number } };

  /**
   * Ingest-and-commit in one step: the graph is validated at the
   * store boundary and committed as the next version (or reported
   * as `already_present` when the content matches the head — the
   * end-to-end determinism proof).
   */
  readonly ingestAndCommit: (
    scene: ArchitecturalScene,
    target: IngestionTarget,
    producer: ModelProvenance,
  ) => { commit: CommitVersionResult; report: IngestionReport };

  /** Commits an assembled graph (the store validates at the boundary). */
  readonly commitVersion: (
    modelId: string,
    graph: RealityModelGraph,
    producer: ModelProvenance,
  ) => CommitVersionResult;

  readonly getCurrentVersion: (modelId: string) => StoredModelVersion | undefined;
  readonly getVersion: (modelId: string, version: number) => StoredModelVersion | undefined;
  readonly listVersions: (modelId: string) => readonly ModelVersionRecord[];

  readonly limits: { readonly maxSceneObjects: number };
}

export interface BuildRealityModelServiceOptions {
  /** Upper bound on ingested scene objects (default 5,000). */
  readonly maxSceneObjects?: number;
  /** Store override (tests inject a store with a fixed clock). */
  readonly store?: RealityModelStore;
}

export function buildRealityModelService(
  config: AiseConfig,
  logger: Logger,
  options: BuildRealityModelServiceOptions = {},
): RealityModelService {
  const maxSceneObjects = options.maxSceneObjects ?? DEFAULT_MAX_SCENE_OBJECTS;
  if (!Number.isInteger(maxSceneObjects) || maxSceneObjects < 1) {
    throw new Error(`reality-model service limit must be a positive integer: ${String(maxSceneObjects)}`);
  }
  const store = options.store ?? createInMemoryRealityModelStore();

  logger.debug("reality-model.service.built", { maxSceneObjects, storeKind: store.kind });
  void config; // composition parity with sibling services; no config branch yet

  return {
    createModel: (input) => store.createModel(input),

    ingestScene: (scene, target) => {
      if (scene.objects.length > maxSceneObjects) {
        throw new RealityModelError(
          "INGESTION_INVALID",
          `scene exceeds the ingestion bound: ${scene.objects.length} objects > ${maxSceneObjects}`,
          { details: { field: "scene.objects", value: String(scene.objects.length) } },
        );
      }
      const result = ingestArchitecturalScene(scene, target);
      return { ...result, bounded: { sceneObjectCount: scene.objects.length } };
    },

    ingestAndCommit: (scene, target, producer) => {
      if (scene.objects.length > maxSceneObjects) {
        throw new RealityModelError(
          "INGESTION_INVALID",
          `scene exceeds the ingestion bound: ${scene.objects.length} objects > ${maxSceneObjects}`,
          { details: { field: "scene.objects", value: String(scene.objects.length) } },
        );
      }
      const { graph, report } = ingestArchitecturalScene(scene, target);
      const commit = store.commitModelVersion(target.modelId, graph, producer);
      logger.info("reality-model.version.committed", {
        modelId: target.modelId,
        status: commit.status,
        version: commit.version,
        digest: commit.digest,
        objects: report.ingestedObjectCount,
      });
      return { commit, report };
    },

    commitVersion: (modelId, graph, producer) => store.commitModelVersion(modelId, graph, producer),

    getCurrentVersion: (modelId) => store.getCurrentVersion(modelId),
    getVersion: (modelId, version) => store.getVersion(modelId, version),
    listVersions: (modelId) => store.listVersions(modelId),

    limits: { maxSceneObjects },
  };
}
