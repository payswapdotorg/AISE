/**
 * @aise/backend-reality-model — the AISE-011 Reality Graph
 * backend.
 *
 * Public surface:
 * - errors — typed, fail-closed RealityModelError (wrapped
 *   engineering-model causes preserved)
 * - ingest — the deterministic architectural-scene → Reality
 *   Graph adapter (explicit vocabulary mapping, epistemic
 *   pass-through with no-upgrade guard, honest accounting)
 * - store — the versioned, append-only, boundary-validating
 *   reality-model persistence
 * - runtime — service composition with bounded ingestion
 */
export {
  RealityModelError,
  toRealityModelError,
  type ErrorCauseRecord,
  type RealityModelErrorCode,
  type RealityModelErrorDetails,
} from "./errors.js";

export {
  INGEST_METHOD,
  ingestArchitecturalScene,
  type IngestionReport,
  type IngestionResult,
  type IngestionTarget,
} from "./ingest.js";

export {
  createInMemoryRealityModelStore,
  type CommitVersionResult,
  type CreateModelResult,
  type RealityModelStore,
  type StoredModelVersion,
} from "./store.js";

export {
  DEFAULT_MAX_SCENE_OBJECTS,
  buildRealityModelService,
  type BuildRealityModelServiceOptions,
  type RealityModelService,
} from "./runtime.js";
