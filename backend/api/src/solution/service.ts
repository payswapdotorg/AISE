/**
 * PROD-022 — Deterministic solution tool service.
 *
 * THIN deterministic orchestration over the `@aise/solution-engine`
 * package (the work order's "service.ts (deterministic orchestration over
 * the engine package — thin)"):
 *
 *  - STATELESS: no store, no clock, no random state — every method is a
 *    pure function of its request; the same inputs always produce the
 *    same outputs (byte-identical responses at the router);
 *  - the wire payloads are decoded through the CONTRACT's STRICT decoders
 *    (canonical validation; a payload that fails decoding is a typed
 *    `SolutionError` carrying the contract's structured issues — never a
 *    silent coercion, never a best-effort parse);
 *  - the authoritative Reality Graph is reachable ONLY through the
 *    injected READ-ONLY `BaselineGeometryResolver` (one read method;
 *    defaults to a resolver that resolves NOTHING — every coated
 *    operation then answers the honest `surface_area_unresolved`
 *    needs-input state, never an invented area);
 *  - the capability profile defaults to the contract's
 *    REFERENCE_BUILDING_OPERATION_PROFILE and may be supplied per request
 *    (strict-decoded; the profile is engine-owned data on the wire).
 */

import {
  REFERENCE_BUILDING_OPERATION_PROFILE,
  decodeEngineeringOperationIntentStrict,
  decodeOperationCapabilityProfileStrict,
  decodeProposedStateStrict,
  decodeSolutionVersionStrict,
  type OperationCapabilityProfile,
  type ProposedState,
  type SolutionVersion,
} from "@aise/solution-contract";
import {
  applyOperation,
  deriveStateQuantities,
  validateSolutionVersion,
  type BaselineGeometryResolver,
  type OperationApplicationResult,
} from "@aise/solution-engine";
import {
  SolutionError,
  parseInspectRequest,
  parseQuantitiesRequest,
  parseStepRequest,
  parseValidateRequest,
  type InspectResponse,
  type QuantitiesResponse,
  type SolutionErrorCode,
  type StepResponse,
  type ValidateResponse,
} from "./model";

/* ------------------------------------------------------------------ */
/* Service deps                                                         */
/* ------------------------------------------------------------------ */

export interface SolutionServiceDeps {
  /**
   * READ-ONLY baseline geometry resolution (the engine's only window into
   * the Reality Graph). Optional: when absent, coated operations
   * (plaster/finish over an unresolved face-set) answer the honest
   * needs-input `surface_area_unresolved` state — the surface area is
   * then supplied by the caller as better anchored geometry.
   */
  readonly baselineGeometry?: BaselineGeometryResolver;
}

/* ------------------------------------------------------------------ */
/* The service                                                          */
/* ------------------------------------------------------------------ */

export class SolutionService {
  private readonly baselineGeometry: BaselineGeometryResolver | undefined;

  constructor(deps: SolutionServiceDeps = {}) {
    this.baselineGeometry = deps.baselineGeometry;
  }

  /** POST /v1/solutions/step — apply ONE intent to a baseline state. */
  step(payload: unknown): StepResponse {
    const request = parseStepRequest(payload);
    const intent = decodeStrict(
      "invalid_intent",
      (value) => decodeEngineeringOperationIntentStrict(value),
      request.intent,
    );
    const baseline = decodeStrict(
      "invalid_baseline",
      (value) => decodeProposedStateStrict(value),
      request.baseline,
    );
    const capabilityProfile = this.resolveCapabilityProfile(request.capabilityProfile);
    const result: OperationApplicationResult = applyOperation({
      baseline,
      intent,
      capabilityProfile,
      materializedAt: request.materializedAt,
      ...(this.baselineGeometry === undefined
        ? {}
        : { baselineGeometry: this.baselineGeometry }),
    });
    return { result };
  }

  /** POST /v1/solutions/validate — deterministic validation snapshot. */
  validate(payload: unknown): ValidateResponse {
    const request = parseValidateRequest(payload);
    const version = decodeStrict(
      "invalid_version",
      (value) => decodeSolutionVersionStrict(value),
      request.version,
    );
    const capabilityProfile = this.resolveCapabilityProfile(request.capabilityProfile);
    const snapshot = validateSolutionVersion({
      version,
      capabilityProfile,
      ...(this.baselineGeometry === undefined ? {} : { baselineGeometry: this.baselineGeometry }),
      validatedAt: request.validatedAt,
    });
    return { snapshot };
  }

  /** POST /v1/solutions/inspect — state/version/lineage readback. */
  inspect(payload: unknown): InspectResponse {
    const request = parseInspectRequest(payload);
    const version = decodeStrict(
      "invalid_version",
      (value) => decodeSolutionVersionStrict(value),
      request.version,
    );
    const requestedStateIndex =
      request.stateIndex === undefined ? version.states.length - 1 : request.stateIndex;
    const requestedState = version.states[requestedStateIndex];
    if (requestedState === undefined) {
      throw new SolutionError(
        "invalid_state_index",
        `stateIndex ${requestedStateIndex} is out of range: version ` +
          `${version.versionNumber} of solution '${version.solutionId}' has ` +
          `${version.states.length} state layers (0..${version.states.length - 1})`,
      );
    }
    return {
      solutionId: version.solutionId,
      versionNumber: version.versionNumber,
      ...(version.parentVersionNumber === undefined
        ? {}
        : { parentVersionNumber: version.parentVersionNumber }),
      status: version.status,
      operations: version.operations.map((operation) => ({
        operationIndex: operation.operationIndex,
        operationId: operation.operationId,
        operationType: operation.operationType,
        intentRef: operation.provenance.intentRef,
        appliedAtStateId: version.states[operation.operationIndex]?.stateId,
        dependencyCount: operation.dependsOn.length,
        effectCount: operation.effects.length,
      })),
      states: version.states.map((state) => ({
        stateIndex: state.stateIndex,
        stateId: state.stateId,
        appliedOperationIds: state.appliedOperationIds,
        contentDigest: state.contentDigest,
        materializedAt: state.materializedAt,
      })),
      requestedStateIndex,
      requestedState,
    };
  }

  /** POST /v1/solutions/quantities — derived quantities of a state. */
  quantities(payload: unknown): QuantitiesResponse {
    const request = parseQuantitiesRequest(payload);
    const version = decodeStrict(
      "invalid_version",
      (value) => decodeSolutionVersionStrict(value),
      request.version,
    );
    const stateIndex =
      request.stateIndex === undefined ? version.states.length - 1 : request.stateIndex;
    if (version.states[stateIndex] === undefined) {
      throw new SolutionError(
        "invalid_state_index",
        `stateIndex ${stateIndex} is out of range: version ` +
          `${version.versionNumber} of solution '${version.solutionId}' has ` +
          `${version.states.length} state layers (0..${version.states.length - 1})`,
      );
    }
    const inventory = deriveStateQuantities(version, stateIndex);
    return { inventory };
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                         */
  /* ---------------------------------------------------------------- */

  private resolveCapabilityProfile(payload: unknown): OperationCapabilityProfile {
    if (payload === undefined || payload === null) {
      return REFERENCE_BUILDING_OPERATION_PROFILE;
    }
    return decodeStrict(
      "invalid_request",
      (value) => decodeOperationCapabilityProfileStrict(value),
      payload,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Strict-decode helper (typed errors with the contract's issues)       */
/* ------------------------------------------------------------------ */

function decodeStrict<T>(
  code: SolutionErrorCode,
  decode: (value: unknown) => T,
  payload: unknown,
): T {
  try {
    return decode(payload);
  } catch (error) {
    const issues = contractIssuesOf(error);
    throw new SolutionError(
      code,
      `payload failed strict contract decoding${issues === "" ? "" : `: ${issues}`}`,
    );
  }
}

function contractIssuesOf(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "issues" in error &&
    Array.isArray((error as { issues: unknown }).issues)
  ) {
    const issues = (error as { issues: { path: (string | number)[]; message: string; code: string }[] })
      .issues;
    return issues
      .map((issue) => `${issue.path.join("/")} ${issue.message} (${issue.code})`)
      .join("; ");
  }
  return "";
}

export type { ProposedState, SolutionVersion };
