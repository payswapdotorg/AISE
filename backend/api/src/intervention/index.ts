/**
 * AISE-026 — Intervention Studio public surface.
 *
 * Consumers (server.ts, future AISE-027 synchronized viewer /
 * AISE-028 quantity & cost engine / AISE-029+ execution loop) import from
 * HERE only. The module is a domain library plus its HTTP adapter: model
 * (types, vocabularies, typed errors, parsers, state-id derivation) +
 * projection (the deterministic materialization engine) + service (policy
 * engine over an injected read-only baseline resolver) + store
 * (persistence + in-memory twin) + router (transport).
 *
 * PROPOSAL ISOLATION, restated at the surface: this module imports NO
 * reality store (read-only TYPE imports from reality/model only) — there
 * is no write path from here into observed reality, ever.
 */

export {
  INTERVENTION_ERROR_CODES,
  InterventionError,
  SCENARIO_STATUSES,
  SCENARIO_TRANSITIONS,
  STATE_NODE_ORIGINS,
  STATE_RELATIONSHIP_ORIGINS,
  STEP_KINDS,
  TERMINAL_SCENARIO_STATUSES,
  deriveStateId,
  isTerminalScenarioStatus,
  parseAddStepInput,
  parseApprovalReferenceInput,
  parseCreateScenarioInput,
  parseInterventionScenarioRecord,
  parseStatusTransitionInput,
  summarizeScenario,
  validateBaselineVersionId,
  validateProjectId,
  validateScenarioId,
  type AddStepInput,
  type ApprovalReference,
  type ApprovalReferenceInput,
  type CreateScenarioInput,
  type InterventionErrorCode,
  type InterventionScenario,
  type InterventionState,
  type InterventionStateNode,
  type InterventionStateRelationship,
  type InterventionStep,
  type ProposedNode,
  type ProposedProperty,
  type ProposedTombstone,
  type ScenarioStatus,
  type ScenarioSummary,
  type ScenarioTransition,
  type StateIdentity,
  type StateNodeOrigin,
  type StateRelationshipOrigin,
  type StepChange,
  type StepKind,
  type StepNodePayload,
  type StepPropertyPayload,
  type StepProvenance,
} from "./model";
export {
  applyStep,
  canonicalStateText,
  materializeState,
  overlayBaseline,
  type MaterializeStateInput,
  type OverlayBaselineInput,
} from "./projection";
export { InterventionService, type BaselineResolver, type InterventionServiceDeps } from "./service";
export {
  FsInterventionStore,
  InMemoryInterventionStore,
  type InterventionStore,
} from "./store";
export { handleInterventionRequest, type InterventionRouteOptions } from "./router";
