/**
 * `@aise/solution-engine` — public API (PROD-022).
 *
 * The DETERMINISTIC INTERACTIVE SOLUTION ENGINE of ACR-005/ACR-006: applies
 * typed engineering operation intents (from `@aise/solution-contract`) to
 * proposed states and produces reproducible proposed states, effects and
 * derived quantities; validates solution versions deterministically;
 * revises/undoes via NEW versions (never destructive mutation); replays
 * sequences bit-identically.
 *
 * PURE DETERMINISTIC COMPUTATION: no network, no clock reads (instants are
 * caller-injected), no randomness, no environment-dependent output, no
 * filesystem in the core. NO WRITE PATH to authoritative reality: the only
 * window into the Reality Graph is the injected READ-ONLY
 * `BaselineGeometryResolver` (one read method; see baseline.ts). The
 * exported surface is functions + constants ONLY — every function consumes
 * its inputs read-only and returns new values (asserted by the mutation
 * sabotage tests).
 *
 * Endpoint-side orchestration lives in the backend module
 * `backend/api/src/solution/` (transport adapter over this package).
 */

/* Engine identity ------------------------------------------------------ */

export {
  SOLUTION_ENGINE_KIND,
  SOLUTION_ENGINE_VERSION,
  quantityCalculationRef,
} from "./engine-version";
export type { TransitionIdentityInput } from "./engine-version";

/* Typed reasons / outcomes ----------------------------------------------- */

export {
  ENGINE_APPLICATION_OUTCOMES,
  ENGINE_REASON_CODES,
  ENGINE_REVISION_OUTCOMES,
  ENGINE_REPLAY_OUTCOMES,
} from "./errors";
export type {
  EngineApplicationOutcome,
  EngineReasonCode,
  EngineReason,
  EngineRevisionOutcome,
  EngineReplayOutcome,
} from "./errors";

/* Deterministic unit handling --------------------------------------------- */

export {
  UNIT_VOCABULARY,
  CANONICAL_QUANTITY_UNITS,
  resolveNumericParameter,
  roundFloat,
  roundUp,
} from "./units";
export type {
  UnitDimension,
  UnitKind,
  ResolvedParameter,
  UnitResolutionFailure,
  ParameterSlotDimension,
} from "./units";

/* Read-only baseline geometry ---------------------------------------------- */

export {
  TableBaselineGeometryResolver,
  isSurfaceTarget,
} from "./baseline";
export type { BaselineSurfaceArea, BaselineGeometryResolver } from "./baseline";

/* Quantity models (deterministic, swappable) -------------------------------- */

export {
  referenceBuildingQuantityModels,
  surfaceAreaUnresolvedReason,
  evaluateOperationLimits,
  DEFAULT_BLOCK_MODULE_LENGTH,
  DEFAULT_BLOCK_MODULE_HEIGHT,
  REFERENCE_BUILDING_OPERATION_LIMITS,
} from "./quantity-models";
export type {
  EngineQuantity,
  QuantityModel,
  QuantityModelInput,
  QuantityComputation,
  OperationLimit,
} from "./quantity-models";

/* State materialization ------------------------------------------------------ */

export {
  materializeBaselineState,
  stateContentDigest,
  deriveTransitionId,
} from "./states";
export type { StateChainLink, BaselineOverlayInput } from "./states";

/* Operation application + state-delta computation (the core) ------------------ */

export { applyOperation } from "./apply";
export type {
  OperationBaseline,
  EngineOptions,
  ApplyOperationInput,
  AppliedOperation,
  RefusedOperation,
  OperationApplicationResult,
  ApplyTransitionLineage,
} from "./apply";

/* Deterministic replay --------------------------------------------------------- */

export { replaySolution, fixedMaterializeClock, steppedMaterializeClock } from "./replay";
export type {
  ReplayInput,
  ReplayStep,
  ReplayComplete,
  ReplayFailed,
  ReplayResult,
} from "./replay";

/* Deterministic validation -------------------------------------------------------- */

export { validateSolutionVersion } from "./validation";
export type { ValidateVersionInput } from "./validation";

/* Undo/revision via new versions ------------------------------------------------------ */

export { reviseVersion } from "./revise";
export type {
  ReviseVersionInput,
  RevisionProvenance,
  RevisionTransition,
  RevisionComplete,
  RevisionRefused,
  ReviseVersionResult,
} from "./revise";

/* Derived quantities of a state/version (raw, traced — the PROD-025 input) -------------- */

export { deriveStateQuantities } from "./quantities";
export type {
  TracedQuantity,
  QuantityTotal,
  StateQuantityInventory,
} from "./quantities";
