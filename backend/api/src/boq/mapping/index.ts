/**
 * AISE-017 public surface — BOQ-to-reality mapping (derived, explicit,
 * append-only). See model.ts / matcher.ts / store.ts / service.ts for the
 * frozen contracts; the transport adapter lives in ../router.ts.
 */

export {
  MAPPING_CONFIDENCES,
  MAPPING_ERROR_CODES,
  MAPPING_METHODS,
  MAPPING_STATUSES,
  MappingError,
  computeMappingStats,
  mappingIdentity,
  mappingVersionFileName,
  parseGraphSnapshot,
  parseManualMappingInput,
  parseMappingRecord,
} from "./model";
export type {
  BoqItemRef,
  BoqMapping,
  GraphSnapshot,
  ManualMappingInput,
  MappingAlternative,
  MappingConfidence,
  MappingEntry,
  MappingErrorCode,
  MappingMethod,
  MappingProvenance,
  MappingStats,
  MappingStatus,
  MappingTarget,
  SnapshotNode,
} from "./model";
export { applyManualMapping, mapBoqToReality } from "./matcher";
export { MappingService, MappingServiceError } from "./service";
export type { MappingServiceOptions } from "./service";
export { FsMappingStore, InMemoryMappingStore } from "./store";
export type { MappingStore } from "./store";
