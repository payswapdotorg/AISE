/**
 * @aise/backend-history — the AISE-031 historical comparison
 * service.
 *
 * Deterministic version-to-version geometry/semantic/evidence
 * change detection over committed Reality Graph versions, with
 * provenance and strict confidence/uncertainty separation. A
 * read-only verification-family analysis: never a canonical
 * authority, never a mutation of the Reality Graph or the
 * evidence mapping.
 *
 * Public surface:
 * - errors    — typed, fail-closed HistoryError
 * - subjects  — change-record subjects + canonical keys
 * - records   — the change-record model, identity derivation and
 *   the kind→field contract
 * - quantities — verbatim quantity passthrough, uncertainty-
 *   separated deltas (no confidence anywhere)
 * - compare   — the graph decomposition (objects/geometry/
 *   properties/spaces/relationships)
 * - evidence  — the AISE-012 validity-projection comparison
 * - report    — the comparison boundary, report assembly and
 *   the content-bound digest
 * - validate  — the fail-closed two-level validator (report
 *   digest + per-record identity re-derivation)
 * - runtime   — the bounded, self-checking service composition
 */
export {
  HistoryError,
  isHistoryError,
  type HistoryErrorCode,
  type HistoryErrorDetails,
} from "./errors.js";

export {
  historySubjectKey,
  SUBJECT_KIND_RANK,
  type HistorySubjectRef,
} from "./subjects.js";

export {
  CATEGORY_RANK,
  categoryOfKind,
  compareRecords,
  deriveChangeId,
  makeChange,
  checkRecordShape,
  type ChangeCategory,
  type ChangeKind,
  type ChangeRecord,
  type ChangeRecordInput,
  type ExtentSnapshot,
  type FrameSnapshot,
  type ProvenancePair,
  type ProvenanceSummary,
  type QuantityDelta,
  type QuantitySnapshot,
  type QualitySnapshot,
  type SpaceFrameSnapshot,
} from "./records.js";

export {
  deriveQuantityDelta,
  formatQuantity,
  quantityEquals,
  uncertaintyEquals,
  checkQuantitySnapshot,
} from "./quantities.js";

export {
  compareObjects,
  compareRelationships,
  compareSpaces,
} from "./compare.js";

export {
  compareEvidenceValidity,
  validityProjection,
} from "./evidence.js";

export {
  compareModelVersions,
  reportDigest,
  HISTORICAL_CHANGE_LIMITATIONS,
  HISTORY_LIMITS,
  type CompareInput,
  type EvidencePair,
  type HistoricalChangeReport,
  type VersionedGraph,
  type VersionPin,
} from "./report.js";

export {
  validateHistoricalChangeReport,
} from "./validate.js";

export {
  buildHistoryService,
  runHistoricalComparison,
  type HistoryService,
  type HistoryServiceLimits,
} from "./runtime.js";
