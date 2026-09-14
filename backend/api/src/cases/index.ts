/**
 * AISE-025 — Engineering Case public surface.
 *
 * Consumers (server.ts, future AISE-029 reasoning gateway / AISE-031
 * execution loop) import from HERE only. The module is a domain library
 * plus its HTTP adapter: model (types, vocabularies, typed errors, parsers,
 * digest) + service (policy engine) + store (persistence + in-memory twin)
 * + router (transport). No other AISE surface is imported — reality model
 * types and shared-contracts are read-only dependencies by convention.
 */

export {
  CASE_STATUSES,
  CONFIDENCE_LEVELS,
  HYPOTHESIS_EPISTEMIC_STATUSES,
  MISSING_EVIDENCE_KINDS,
  MISSING_EVIDENCE_STATUSES,
  REVIEW_DECISIONS,
  CASE_EVENT_TYPES,
  CASE_ERROR_CODES,
  CaseError,
  caseContentDigest,
  parseAddHypothesisInput,
  parseAddMissingEvidenceInput,
  parseAddObservationInput,
  parseCaseRecord,
  parseCreateCaseInput,
  parseSubmitReviewInput,
  parseWaiveNoteInput,
  validateCaseId,
  type AddHypothesisInput,
  type AddMissingEvidenceInput,
  type AddObservationInput,
  type CaseEvent,
  type CaseEventType,
  type CaseLinks,
  type CaseStatus,
  type CaseSummary,
  type ConfidenceLevel,
  type CreateCaseInput,
  type EngineeringCase,
  type Hypothesis,
  type HypothesisEpistemicStatus,
  type MissingEvidence,
  type MissingEvidenceKind,
  type MissingEvidenceStatus,
  type Observation,
  type ReviewDecision,
  type ReviewRecord,
  type SubmitReviewInput,
} from "./model";
export { CaseService, type CaseServiceDeps } from "./service";
export { FsCaseStore, InMemoryCaseStore, type CaseStore } from "./store";
export { handleCasesRequest, type CasesRouteOptions } from "./router";
