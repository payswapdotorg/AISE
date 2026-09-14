/**
 * AISE-031 — Execution/outcome loop public surface.
 *
 * Consumers (server.ts, future AISE-027 viewer outcome panels / AISE-035
 * physical reality lab / AISE-038 developer API) import from HERE only.
 * The module is a domain library plus its HTTP adapter: model (types,
 * vocabularies, typed errors, parsers, digest, read-only authority
 * projections) + service (policy engine over an injected store and THREE
 * read-only reference resolvers) + store (persistence + in-memory twin) +
 * router (transport).
 *
 * THE RECORD-KEEPER BOUNDARY, restated at the surface: this module imports
 * NO sibling module at runtime (read-only TYPE imports from
 * intervention/model and cases/model only) — there is no write path from
 * here into the case, intervention, evidence or capture authorities, ever.
 * The intervention state transition PROPOSED → EXECUTED lives HERE as an
 * execution-domain record; the intervention authority's own records are
 * never mutated by this domain.
 */

export {
  EXECUTION_ERROR_CODES,
  EXECUTION_EVENT_TYPES,
  STATE_EXECUTION_STATUSES,
  ExecutionError,
  executionContentDigest,
  parseExecutionRecord,
  parseRecordExecutionInput,
  parseRecordOutcomeInput,
  projectCaseContext,
  projectInterventionContext,
  summarizeExecution,
  validateCaseRefId,
  validateExecutionRecordId,
  validateScenarioRefId,
  type CaseContext,
  type CaseLineage,
  type ExecutionErrorCode,
  type ExecutionEvent,
  type ExecutionEventType,
  type ExecutionRecord,
  type ExecutionSummary,
  type InterventionContext,
  type OutcomeObservation,
  type RecordExecutionInput,
  type RecordOutcomeInput,
  type StateExecutionStatusKind,
  type StateExecutionView,
  type StateTransitionRecord,
} from "./model";
export {
  ExecutionService,
  readOnlyCaseContextResolver,
  readOnlyEvidenceMembershipResolver,
  readOnlyInterventionContextResolver,
  type CaseContextResolver,
  type EvidenceMembershipResolver,
  type ExecutionServiceDeps,
  type InterventionContextResolver,
} from "./service";
export { FsExecutionStore, InMemoryExecutionStore, type ExecutionStore } from "./store";
export { handleExecutionRequest, type ExecutionRouteOptions } from "./router";
