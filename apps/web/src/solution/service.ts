/**
 * PROD-024 — the SOLUTION SERVICE SEAM of the interactive solution workspace.
 *
 * The ONE server-facing port through which every workspace mutation and
 * inspection flows. It mirrors the request/response shapes of the backend
 * solution tool surface (PROD-022, `backend/api/src/solution/` — the
 * stateless deterministic `/v1/solutions/*` endpoints the runtime entry
 * mounts): same field names, same JSON shapes, defined locally as
 * STRUCTURAL MIRRORS (the apps/web boundary discipline of
 * `workspace/model.ts`: apps may not import backend sources, so the wire
 * shapes are mirrored, and a genuine backend response satisfies these
 * types as-is).
 *
 * TWO implementations ship with the module:
 *
 *  1. `createLocalSolutionService` — the DETERMINISTIC LOCAL binding that
 *     calls the REAL `@aise/solution-engine` package directly (via relative
 *     import — apps→packages is boundary-legal). This is NOT a second
 *     operation semantics: it is the very engine PROD-022 ships, executing
 *     the exact `applyOperation`/`reviseVersion`/`deriveStateQuantities`/
 *     `validateSolutionVersion` functions the backend transport adapter
 *     calls. Deterministic, offline, no clock of its own (instants are
 *     caller-injected per the engine's determinism pin).
 *  2. `createHttpSolutionService` — the same-origin HTTP binding over the
 *     backend routes (`POST /v1/solutions/step|validate|inspect|quantities
 *     |revise|baseline`), for the Lead's production wiring. Fetch is
 *     INJECTED (tests pass stubs; the browser passes the global) — the
 *     PROD-001 same-origin contract, no configurable origin.
 *
 * PROD-031 (the browser-safe cut): the HTTP binding now lives in its own
 * crypto-free module (`./service-http`) and is re-exported here so every
 * existing consumer keeps importing `./service` — the LOCAL binding's
 * engine imports transitively reach `node:crypto` (the identity
 * derivations), which a plain-browser bundle externalizes, so the
 * browser mount's chunk graph imports `./service-http` only. The BASELINE
 * LEG (`baseline`) is new with PROD-031: the workspace's
 * `materializeBaselineState` call (the solution-creation baseline
 * overlay) is crypto-dependent, so it routes through the service port
 * too — the local binding calls the engine directly, the HTTP binding
 * posts `POST /v1/solutions/baseline` (the runtime-mounted route).
 *
 * NO CLIENT-SIDE AUTHORITY: the workspace renders engine-computed states
 * only; every refusal here is the ENGINE's typed outcome (200-data, not a
 * transport error) and is surfaced verbatim by the UI.
 */

import type {
  OperationApplicationResult,
  RevisionTransition,
  StateQuantityInventory,
} from "../../../../packages/solution-engine/src/index";
import type {
  EngineeringOperationIntent,
  OperationCapabilityProfile,
  ProposedState,
  SolutionValidationSnapshot,
  SolutionVersion,
} from "../../../../packages/solution-contract/src/index";
import {
  REFERENCE_BUILDING_OPERATION_PROFILE,
} from "../../../../packages/solution-contract/src/index";
import {
  applyOperation,
  deriveStateQuantities,
  materializeBaselineState,
  reviseVersion,
  steppedMaterializeClock,
  validateSolutionVersion,
  type BaselineGeometryResolver,
} from "../../../../packages/solution-engine/src/index";

/* ------------------------------------------------------------------ */
/* Wire shapes (structural mirrors of backend/api/src/solution/model)  */
/* ------------------------------------------------------------------ */

/** POST /v1/solutions/step — apply ONE intent to a baseline state. */
export interface StepServiceInput {
  readonly baseline: ProposedState;
  readonly intent: EngineeringOperationIntent;
  readonly capabilityProfile?: OperationCapabilityProfile;
  /** Caller-pinned deterministic materialization instant (ISO-8601 UTC). */
  readonly materializedAt: string;
}

/** POST /v1/solutions/step response — the ENGINE's typed outcome. */
export interface StepServiceResult {
  readonly result: OperationApplicationResult;
}

/** The revision ("undo") leg — the engine's `reviseVersion` over HTTP.
 *  The materialization clock crosses the wire as the SERIALIZABLE stepped
 *  spec { base, stepMs } (a function cannot cross HTTP); the bindings
 *  rebuild it through the engine's own `steppedMaterializeClock` — the
 *  same numbers, never a second clock semantics. */
export interface ReviseServiceInput {
  readonly version: SolutionVersion;
  readonly revertOperationId: string;
  readonly capabilityProfile?: OperationCapabilityProfile;
  readonly createdAt: string;
  readonly materializeClock: Readonly<{ readonly base: string; readonly stepMs: number }>;
  readonly revisionProvenance: {
    readonly authoredBy: string;
    readonly reason: string;
    readonly authoredAt: string;
  };
}

export type ReviseServiceResult =
  | {
      readonly outcome: "revised";
      readonly newVersion: SolutionVersion;
      readonly revision: RevisionTransition;
    }
  | {
      readonly outcome: "invalid";
      readonly reasons: readonly { readonly code: string; readonly detail: string }[];
    };

/** POST /v1/solutions/validate — the deterministic server-side Validate. */
export interface ValidateServiceInput {
  readonly version: SolutionVersion;
  readonly capabilityProfile?: OperationCapabilityProfile;
  readonly validatedAt: string;
}

export interface ValidateServiceResult {
  readonly snapshot: SolutionValidationSnapshot;
}

/** POST /v1/solutions/inspect — state/version/lineage readback. */
export interface InspectServiceInput {
  readonly version: SolutionVersion;
  readonly stateIndex?: number;
}

export interface InspectServiceResult {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly status: string;
  readonly operationCount: number;
  readonly stateCount: number;
  readonly requestedStateIndex: number;
  readonly requestedState: ProposedState;
}

/** POST /v1/solutions/quantities — derived quantities of a state. */
export interface QuantitiesServiceInput {
  readonly version: SolutionVersion;
  readonly stateIndex?: number;
}

export interface QuantitiesServiceResult {
  readonly inventory: StateQuantityInventory;
}

/** POST /v1/solutions/baseline (PROD-031) — the solution-creation baseline
 *  overlay (layer 0): the engine's own input shape, the engine's
 *  `ProposedState` output verbatim. Crypto-dependent client-side (the
 *  state identity derivations), so the browser mount materializes it
 *  through the service port — the backend engine executes it. */
export interface BaselineServiceInput {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly baselineRealityVersionId: string;
  /** Caller-pinned deterministic materialization instant (ISO-8601 UTC). */
  readonly materializedAt: string;
}

export interface BaselineServiceResult {
  readonly state: ProposedState;
}

/* ------------------------------------------------------------------ */
/* The port                                                            */
/* ------------------------------------------------------------------ */

/** Honest identity of the service binding (metadata, never authority). */
export interface SolutionServiceDescriptor {
  readonly serviceId: string;
  /** The engine kind the binding executes (echoed from the engine). */
  readonly engineKind: string;
  readonly engineVersion: string;
}

/**
 * THE solution service port — the only server-facing seam of the workspace.
 * Implementations must be DETERMINISTIC GIVEN THEIR INPUTS (the backend
 * routes are stateless; the local binding is the engine itself).
 */
export interface SolutionServicePort {
  readonly descriptor: SolutionServiceDescriptor;
  step(input: StepServiceInput): Promise<StepServiceResult>;
  revise(input: ReviseServiceInput): Promise<ReviseServiceResult>;
  validate(input: ValidateServiceInput): Promise<ValidateServiceResult>;
  inspect(input: InspectServiceInput): Promise<InspectServiceResult>;
  quantities(input: QuantitiesServiceInput): Promise<QuantitiesServiceResult>;
  /** The baseline overlay materialization (PROD-031) — the engine's
   *  `materializeBaselineState` through the port. */
  baseline(input: BaselineServiceInput): Promise<BaselineServiceResult>;
}

/* ------------------------------------------------------------------ */
/* The local engine-backed implementation (the deterministic default)  */
/* ------------------------------------------------------------------ */

export interface LocalSolutionServiceDeps {
  /**
   * READ-ONLY baseline geometry resolution (the engine's only window into
   * the Reality Graph — surface facts for coated operations). When absent,
   * coated operations over unresolved faces answer the honest
   * `surface_area_unresolved` needs-input state, never an invented area.
   */
  readonly baselineGeometry?: BaselineGeometryResolver;
}

/**
 * The DETERMINISTIC LOCAL binding over the REAL `@aise/solution-engine`
 * package. Every method delegates to the engine's own functions with the
 * reference building capability profile (the engine-owned catalogue); the
 * caller pins every instant. The Tech Lead may swap in the HTTP binding at
 * the integration station without workspace edits — the shapes are
 * identical.
 */
export function createLocalSolutionService(
  deps: LocalSolutionServiceDeps = {},
): SolutionServicePort {
  const engineOptions =
    deps.baselineGeometry === undefined ? {} : { baselineGeometry: deps.baselineGeometry };
  return {
    descriptor: {
      serviceId: "solution-service-local-engine",
      engineKind: "aise-solution-engine",
      engineVersion: "1.0.0",
    },
    step: async (input) => ({
      result: applyOperation({
        baseline: input.baseline,
        intent: input.intent,
        capabilityProfile: input.capabilityProfile ?? REFERENCE_BUILDING_OPERATION_PROFILE,
        materializedAt: input.materializedAt,
        ...engineOptions,
      }),
    }),
    revise: async (input) =>
      reviseVersion({
        version: input.version,
        revertOperationId: input.revertOperationId,
        capabilityProfile: input.capabilityProfile ?? REFERENCE_BUILDING_OPERATION_PROFILE,
        createdAt: input.createdAt,
        // The wire's SERIALIZABLE stepped spec, rebuilt through the ENGINE's
        // own clock builder (the same numbers the workspace clock's
        // materializeAt produces — never a second clock semantics).
        materializeClock: steppedMaterializeClock(
          Date.parse(input.materializeClock.base),
          input.materializeClock.stepMs,
        ),
        revisionProvenance: input.revisionProvenance,
        ...engineOptions,
      }),
    validate: async (input) => ({
      snapshot: validateSolutionVersion({
        version: input.version,
        capabilityProfile: input.capabilityProfile ?? REFERENCE_BUILDING_OPERATION_PROFILE,
        validatedAt: input.validatedAt,
        ...engineOptions,
      }),
    }),
    inspect: async (input) => {
      const version = input.version;
      const requestedStateIndex =
        input.stateIndex === undefined ? version.states.length - 1 : input.stateIndex;
      const requestedState = version.states[requestedStateIndex];
      if (requestedState === undefined) {
        throw new Error(
          `stateIndex ${requestedStateIndex} is out of range: version ` +
            `${version.versionNumber} of solution '${version.solutionId}' has ` +
            `${version.states.length} state layers (0..${version.states.length - 1})`,
        );
      }
      return {
        solutionId: version.solutionId,
        versionNumber: version.versionNumber,
        status: version.status,
        operationCount: version.operations.length,
        stateCount: version.states.length,
        requestedStateIndex,
        requestedState,
      };
    },
    quantities: async (input) => ({
      inventory: deriveStateQuantities(input.version, input.stateIndex),
    }),
    baseline: async (input) => ({
      state: materializeBaselineState(input),
    }),
  };
}

/* ------------------------------------------------------------------ */
/* The HTTP binding (the Lead's production wiring)                      */
/* ------------------------------------------------------------------ */

/* The HTTP binding lives in its own crypto-free module (./service-http —
 * PROD-031's browser-safe cut: this module's local engine binding
 * transitively imports node:crypto, which a plain-browser bundle
 * externalizes) and is re-exported here so every existing consumer keeps
 * importing `./service` with the same surface. */
export { createHttpSolutionService } from "./service-http";
export type { HttpSolutionServiceOptions } from "./service-http";
export type { SolutionFetchLike } from "./service-http";
