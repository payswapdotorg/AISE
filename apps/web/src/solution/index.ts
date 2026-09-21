/**
 * PROD-024 — the interactive solution workspace module, public API.
 *
 * `apps/web/src/solution/` is a SELF-CONTAINED workspace module (the
 * work order's mount contract §4.1): the Tech Lead mounts the single
 * `SolutionWorkspace` React component at the integration station (a
 * route/pane in the app shell) with the case/solution context, the agent
 * session handle and the optional service/BOQ bindings as props — no
 * global singletons, no module side effects, no edits outside this path.
 *
 * ONE OPERATION SEMANTICS (§4.2): every manipulation — direct
 * manipulation, timeline action, fallback action or confirmed agent
 * proposal — produces the same typed `EngineeringOperationIntent` objects
 * (the contract's single constructor surface) and flows through the ONE
 * engine submission path (`submitIntent` of operations.ts) into the
 * deterministic solution engine. The UI renders engine-computed states
 * only. OBSERVED reality stays read-only; PROPOSED layers can never
 * overwrite it (§4.3).
 *
 * The exports below are the mount surface + the seams the Lead wires:
 * the service port (engine), the agent port (the PROD-023 compiler) and
 * the guarded BOQ sync input. Everything else is module-internal.
 */

export { SolutionWorkspace } from "./SolutionWorkspace";
export type {
  SolutionWorkspaceProps,
  SolutionCaseContext,
  SolutionAgentHandle,
} from "./SolutionWorkspace";

/* The engine service seam (the local engine binding + the HTTP binding). */
export {
  createLocalSolutionService,
  createHttpSolutionService,
} from "./service";
export type {
  SolutionServicePort,
  SolutionServiceDescriptor,
  StepServiceInput,
  StepServiceResult,
  ReviseServiceInput,
  ReviseServiceResult,
  ValidateServiceInput,
  ValidateServiceResult,
  InspectServiceInput,
  InspectServiceResult,
  QuantitiesServiceInput,
  QuantitiesServiceResult,
  LocalSolutionServiceDeps,
} from "./service";

/* The agent seam (the PROD-023 compiler port + the scripted test double). */
export {
  createHttpSolutionAgentPort,
  createScriptedSolutionAgentPort,
  buildAgentIntent,
  proposeDecisionOf,
  dispatchOperationDecisionOf,
  askDecisionOf,
  unsupportedDecisionOf,
  refuseDecisionOf,
  ambiguousDecisionOf,
  dispatchToolDecisionOf,
} from "./agent/port";
export type {
  SolutionAgentPort,
  SolutionAgentDescriptor,
  AgentSessionContext,
  AgentSessionFocus,
  AgentCompiledCommand,
  AgentTurnDecision,
  AgentTurnInput,
  AgentOperationProposal,
  AgentPendingClarification,
  AgentPendingProposal,
  AgentToolCommand,
  AgentClarificationQuestion,
  AgentAmbiguityReading,
  AgentCommandAttribution,
  ScriptedAgentTurn,
} from "./agent/port";

/* The guarded BOQ synchronization seam (§4.6). */
export type { SolutionBoqSyncInput } from "./boq";
export { boqPaneStatusOf, operationsForBoqLine, resolveBoqForOperation, boqLineHighlightOf } from "./boq";

/* The deterministic workspace clock + the demo case fixtures. */
export {
  defaultWorkspaceClock,
  steppedWorkspaceClock,
  type WorkspaceClock,
  type WorkspaceDeps,
  manipulationActionsForElement,
  buildDirectManipulationIntent,
  openWorkspace,
  submitIntent,
  stepTimeline,
  reviseOperation,
  validateCurrentVersion,
  agentSessionContextOf,
  applyAgentDecision,
  operationIdentityOf,
} from "./operations";
export {
  DEMO_SOLUTION_WORLD,
  demoObservedScene,
  demoBaselineGeometry,
} from "./fixtures";

/* The workspace stylesheet (a constant string, WCAG AA). */
export { SOLUTION_WORKSPACE_CSS } from "./styles";
