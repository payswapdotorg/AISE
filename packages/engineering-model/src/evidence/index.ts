/**
 * @aise/engineering-model/evidence — the AISE-012 evidence and
 * provenance graph layer.
 *
 * The Evidence subsystem's pure model (architecture-lock §1:
 * "the authoritative provenance mapping for engineering
 * assertions"): first-class immutable content-pinned evidence
 * records for image/video/LiDAR/measurement/document/human-
 * observation sources (AC-060), append-only subject→evidence
 * links with retractions (AC-063 invalidation semantics), and
 * derived verification-validity projections (AC-062) — with the
 * strict guarantee that this layer NEVER stores assertion
 * content, geometry, or epistemic state: it references the
 * canonical Reality Graph; it does not compete with it.
 *
 * Module map:
 * - errors    — typed, fail-closed EvidenceError
 * - records   — immutable, content-pinned evidence records
 * - subjects  — assertion references into committed model versions
 * - links     — evidence links + append-only retractions
 * - graph     — the project-scoped mapping aggregate (digest, freeze)
 * - validate  — whole-mapping re-validation (persistence boundary)
 * - validity  — the AC-062/AC-063 verification-validity projection
 * - query     — derived coverage/bundle read views
 */
export {
  EvidenceError,
  toEvidenceError,
  type EvidenceErrorCode,
  type EvidenceErrorDetails,
} from "./errors.js";

export {
  EVIDENCE_KINDS,
  compatibleAssetTypes,
  deriveEvidenceId,
  evidenceRecord,
  recordContentHash,
  sourcePin,
  validateAcquisition,
  type CaptureSource,
  type DocumentSource,
  type EvidenceKind,
  type EvidenceRecord,
  type EvidenceRecordInput,
  type EvidenceSource,
  type HumanObservationSource,
  type ManualMeasurementSource,
} from "./records.js";

export {
  describeSubject,
  evidenceSubject,
  resolveSubject,
  subjectKey,
  validateSubject,
  type EvidenceSubject,
  type EvidenceSubjectKind,
  type ResolvedSubject,
} from "./subjects.js";

export {
  assertRetractionNotBefore,
  deriveLinkId,
  evidenceLink,
  evidenceRetraction,
  linkRetraction,
  validateEvidenceRetraction,
  validateLink,
  validateLinkRetraction,
  type EvidenceLink,
  type EvidenceLinkInput,
  type EvidenceRetraction,
  type LinkRetraction,
} from "./links.js";

export {
  assembleEvidenceGraph,
  isEvidenceLive,
  liveEvidenceForSubject,
  liveLinks,
  liveLinksForSubject,
  liveRecords,
  subjectsForEvidence,
  type AssembleEvidenceGraphInput,
  type EvidenceGraph,
} from "./graph.js";

export { validateEvidenceGraph } from "./validate.js";

export {
  assertionSupport,
  computeVersionValidity,
  listConfirmedAssertionSubjects,
  type AssertionSupport,
  type ConfirmedAssertionRef,
  type ConfirmedAssertionValidity,
  type InvalidationReason,
  type VersionValidityReport,
} from "./validity.js";

export {
  evidenceBundleForEntity,
  evidenceCoverage,
  type EntityEvidenceCoverage,
  type EvidenceCoverageReport,
  type SubjectEvidenceBundle,
} from "./query.js";
