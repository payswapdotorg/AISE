/**
 * AISE product web shell — public surface.
 *
 * The browser product (PROD-002) is the React application in `./app/`
 * (mounted by `./main.tsx`). The frozen server-side rendering libraries —
 * the AISE-021 engineering workspace, the AISE-024 BOQ Lens, the AISE-027
 * intervention viewer and the AISE-040 adoption shell — remain re-exported
 * here as the app's library surface; the product application CONSUMES them
 * and adds presentation only (no browser-side engineering authority).
 */

export * from "./workspace/index";
export * from "./boqlens/index";
export { App } from "./app/App";
export { parseHash, formatRoute } from "./app/router";
export {
  BROWSER_ADAPTER_PROFILE,
  BROWSER_ADAPTER_PROFILE_ID,
  BROWSER_IMPLEMENTED_INTERACTION_MODES,
  browserDeclaredInteractionModes,
  negotiateBrowserTask,
} from "./app/adapter-profile";
export { createBrowserConformanceBinding, BROWSER_BINDING_ID } from "./app/adapter-binding";
export {
  CONTRACT_PRESENTED_FIELDS,
  presentedFieldsOf,
  ContractObjectFields,
  SemanticObjectsAudit,
} from "./app/contract-objects";
export {
  GOLDEN_JOURNEY_STEPS,
  journeyStepRoute,
  journeyStepHref,
  taskFlowView,
  nextBestActionView,
  authorizationContextView,
  negotiationView,
  operationResultView,
  type JourneyStepId,
  type JourneyStepDefinition,
  type JourneyStepView,
  type TaskFlowView,
  type NextBestActionView,
  type AuthorizationContextView,
  type NegotiationView,
  type OperationResultView,
} from "./app/task-flow";
export {
  DEMO_TASK_PROJECT_ID,
  DEMO_TASK_ID,
  demoTaskFlowBundle,
  demoActionableNextBestAction,
  demoFailedOperationResult,
  demoSucceededOperationResult,
  demoAuthorizationContext,
} from "./app/task-dataset";

export const PAGE_LABEL = "AISE — AI Site Engineer product shell";

export function pageLabel(): string {
  return PAGE_LABEL;
}
