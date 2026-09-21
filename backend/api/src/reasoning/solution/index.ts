/**
 * PROD-023 — `backend/api/src/reasoning/solution/` public API.
 *
 * The agent engineering-operation compiler and interaction loop of the
 * interactive engineering solution workflow (ACR-005; PROD-023): the
 * deterministic natural-language → `EngineeringOperationIntent` compiler,
 * the clarification/proposal interaction loop, the deterministic solution
 * tool port (with its clearly-labeled in-memory test double), the versioned
 * command corpus and the pure transport route factory.
 *
 * AUTHORITY: this module translates, clarifies and proposes. It never
 * declares reality, readiness, validation success, engineering approval or
 * cost authority; it never writes raw geometry; its ONLY effect surface is
 * the `SolutionToolPort`. The PROD-021 contract is imported FROZEN from
 * `@aise/solution-contract` — intents are built exclusively through
 * `createOperationIntent` and identities derive from the contract's own
 * deterministic derivations.
 */

/* Model (types, registries, typed errors) ----------------------------------- */

export {
  CLARIFICATION_SLOT_KINDS,
  UNSAFE_REFUSAL_REASON_CODES,
  COMPILER_PATHS,
  AGENT_TOOL_COMMAND_KINDS,
  SOLUTION_COMPILER_ERROR_CODES,
  SolutionCompilerError,
  validateAgentSessionContext,
  isOperationIntentCommand,
} from "./model";
export type {
  ClarificationSlotKind,
  UnsafeRefusalReasonCode,
  CompilerPath,
  AgentToolCommandKind,
  SolutionCompilerErrorCode,
  SessionFocus,
  RecentOperationSummary,
  AgentSessionContext,
  ClarificationQuestion,
  AmbiguityReading,
  CommandAttribution,
  OperationIntentCompiledCommand,
  ClarificationNeededCompiledCommand,
  UnsupportedCompiledCommand,
  AmbiguousCompiledCommand,
  UnsafeRefusalCompiledCommand,
  ToolCommandCompiledCommand,
  CompiledCommand,
  UnassignedMeasurement,
  NlUnderstandingDescriptor,
  NlSlotResolutionRequest,
  NlSlotAssignment,
  NlUnderstandingPort,
  SolutionCommandCompilerOptions,
  CompileAgentCommandInput,
  SolutionCommandCompiler,
  EstimatedQuantity,
  OperationProposal,
} from "./model";

/* Compiler (the deterministic core + NLU seam) ------------------------------- */

export {
  createSolutionCommandCompiler,
  createDeterministicGrammarUnderstanding,
  requiredParametersOf,
  renderNormalizedCommandText,
  formatCanonicalNumber,
  serializeToolCommand,
} from "./compiler";

/* Vocabulary (the frozen grammar tables) ------------------------------------- */

export {
  UNSAFE_REQUEST_PATTERNS,
  TOOL_COMMAND_PATTERNS,
  STRONG_OPERATION_PATTERNS,
  WEAK_OPERATION_HINTS,
  VERTICAL_HINT_PATTERNS,
  NAVIGATION_TARGETS,
  DIMENSION_WORDS,
  COMPARATIVE_WORDS,
  CHANGE_VERBS,
  MATERIAL_CHANGE_VERBS,
  ADD_COAT_PATTERN,
  COAT_COUNT_PATTERN,
  MEASUREMENT_PATTERN,
  LINEAR_UNIT_FACTORS,
  CANONICAL_UNITS,
  MATERIAL_VOCABULARIES,
  CONFIRMATION_PATTERN,
  CANCELLATION_PATTERN,
  canonicalUnitFor,
  toCanonicalUnit,
  extractMaterials,
  extractChangedMaterial,
  extractStepIndex,
  navigationTargetOf,
  stripClauses,
} from "./vocabulary";
export type { NavigationTarget } from "./vocabulary";

/* Quantities (deterministic estimates from parameters alone) ------------------ */

export {
  estimateOperationQuantities,
  isIrreversibleOperation,
  reviewRequirementsOf,
  numericParameterOf,
  textParameterOf,
  QUANTITY_ESTIMATE_BASIS,
  IRREVERSIBLE_OPERATION_TYPES,
} from "./quantities";

/* Tool port (the only effect surface) ----------------------------------------- */

export {
  toolCommandOf,
  toolCommandText,
  isAgentToolCommandKind,
  createInMemorySolutionToolDouble,
} from "./tools";
export type {
  ValidateToolCommand,
  ApplyToolCommand,
  InspectToolCommand,
  NavigateToolCommand,
  ExplainToolCommand,
  BoqStepLookupToolCommand,
  SolutionToolCommand,
  SolutionToolDescriptor,
  SolutionToolPort,
  ValidationReportResponse,
  ApplyAcceptedResponse,
  InspectionReportResponse,
  NavigationReportResponse,
  ExplanationReportResponse,
  BoqTraceReportResponse,
  ToolRefusalResponse,
  SolutionToolResponse,
  InMemorySolutionToolDoubleOptions,
  InMemorySolutionToolDouble,
} from "./tools";

/* Interaction loop (clarify → propose → confirm → dispatch) ------------------- */

export {
  decideNextTurn,
  executeDecision,
  buildOperationProposal,
  TurnExecutionError,
} from "./interaction";
export type {
  PendingClarification,
  PendingProposal,
  TurnInput,
  AskTurnDecision,
  ProposeTurnDecision,
  DispatchOperationTurnDecision,
  DispatchToolTurnDecision,
  UnsupportedTurnDecision,
  AmbiguousTurnDecision,
  RefuseTurnDecision,
  CancelledTurnDecision,
  TurnDecision,
} from "./interaction";

/* Corpus (the versioned command corpus) --------------------------------------- */

export {
  COMMAND_CORPUS_VERSION,
  COMMAND_CORPUS_CATEGORIES,
  COMMAND_CORPUS,
  corpusEntriesOf,
  corpusEquivalenceGroups,
  corpusCategoryCounts,
} from "./corpus";
export type {
  CommandCorpusCategory,
  CorpusSessionKind,
  CorpusExpectation,
  CommandCorpusEntry,
} from "./corpus";

/* Transport (the pure route factory — mounted by the Tech Lead) --------------- */

export { createSolutionAgentRoutes } from "./router";
export type { SolutionAgentRouteOptions } from "./router";
