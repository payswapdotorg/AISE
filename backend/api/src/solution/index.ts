/**
 * PROD-022 — deterministic solution tool surface, module entry.
 *
 * Public surface of the backend solution module (the execution module's
 * discipline: model / service / router, transport adapter ONLY — the
 * Tech Lead wires `handleSolutionRequest` into `server.ts` at the
 * integration station; see the router's header comment for the intended
 * mount point).
 */

export {
  SOLUTION_ERROR_CODES,
  SolutionError,
  parseStepRequest,
  parseValidateRequest,
  parseInspectRequest,
  parseQuantitiesRequest,
  requireNonEmptyString,
} from "./model";
export type {
  SolutionErrorCode,
  StepRequest,
  ValidateRequest,
  InspectRequest,
  QuantitiesRequest,
  StepResponse,
  ValidateResponse,
  InspectResponse,
  InspectedOperation,
  QuantitiesResponse,
} from "./model";

export { SolutionService } from "./service";
export type { SolutionServiceDeps } from "./service";

export { handleSolutionRequest } from "./router";
export type { SolutionRouteOptions } from "./router";
