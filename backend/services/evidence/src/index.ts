/**
 * @aise/backend-evidence — the AISE-012 evidence service.
 *
 * Public surface:
 * - errors — typed, fail-closed EvidenceServiceError (wrapped
 *   pure-layer causes preserved)
 * - capture — the capture-upload adapter (binding pinned to the
 *   ingestion boundary's server-computed hash)
 * - store — the project-scoped, boundary-verifying, append-only
 *   evidence persistence
 * - runtime — bounded service composition (registration, linking,
 *   retraction, validity projection, coverage, bundles)
 */
export {
  EvidenceServiceError,
  toEvidenceServiceError,
  toEvidenceError,
  type ErrorCauseRecord,
  type EvidenceServiceErrorCode,
  type EvidenceServiceErrorDetails,
} from "./errors.js";

export {
  DEFAULT_KIND_BY_ASSET_TYPE,
  evidenceFromUpload,
  type CaptureUploadReader,
  type CaptureUploadView,
  type EvidenceFromUploadOptions,
} from "./capture.js";

export {
  createInMemoryEvidenceStore,
  type AddLinkResult,
  type EvidenceStore,
  type InMemoryEvidenceStoreOptions,
  type ModelGraphReader,
  type RegisterEvidenceResult,
  type RetractResult,
  type StoredEvidence,
  type StoredLink,
} from "./store.js";

export {
  DEFAULT_MAX_EVIDENCE_LINKS,
  DEFAULT_MAX_EVIDENCE_RECORDS,
  buildEvidenceService,
  type BuildEvidenceServiceOptions,
  type EvidenceService,
} from "./runtime.js";
