/**
 * PROD-024 — the SOLUTION SERVICE SEAM of the interactive solution workspace.
 *
 * The ONE server-facing port through which every workspace mutation and
 * inspection flows. It mirrors the request/response shapes of the backend
 * solution tool surface (PROD-022, `backend/api/src/solution/` — the
 * stateless deterministic `/v1/solutions/*` endpoints the Tech Lead mounts):
 * same field names, same JSON shapes, defined locally as STRUCTURAL MIRRORS
 * (the apps/web boundary discipline of `workspace/model.ts`: apps may not
 * import backend sources, so the wire shapes are mirrored, and a genuine
 * backend response satisfies these types as-is).
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
 *     backend routes (`POST /v1/solutions/step|validate|inspect|quantities`
 *     + the revision leg), for the Lead's production wiring. Fetch is
 *     INJECTED (tests pass stubs; the browser passes the global) — the
 *     PROD-001 same-origin contract, no configurable origin.
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
  reviseVersion,
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

/** The revision ("undo") leg — the engine's `reviseVersion` over HTTP. */
export interface ReviseServiceInput {
  readonly version: SolutionVersion;
  readonly revertOperationId: string;
  readonly capabilityProfile?: OperationCapabilityProfile;
  readonly createdAt: string;
  readonly materializeClock: (stateIndex: number) => string;
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
        materializeClock: input.materializeClock,
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
  };
}

/* ------------------------------------------------------------------ */
/* The HTTP binding (the Lead's production wiring)                      */
/* ------------------------------------------------------------------ */

/** A fetch-like transport (the browser global, or a test stub). */
export type SolutionFetchLike = (
  input: string,
  init?: { readonly method?: string; readonly body?: string },
) => Promise<{ readonly ok: boolean; readonly status: number; readonly text: () => Promise<string> }>;

interface HttpSolutionServiceOptions {
  /** INJECTED fetch (tests stub it; the browser passes the global). */
  readonly fetchImpl: SolutionFetchLike;
  /**
   * Base path prefix of the solution routes (default `/v1/solutions`). The
   * PROD-002 same-origin contract: requests are always same-origin relative
   * paths — never an absolute URL, never another origin.
   */
  readonly basePath?: string;
}

async function postJson(
  fetchImpl: SolutionFetchLike,
  path: string,
  body: unknown,
): Promise<unknown> {
  const response = await fetchImpl(path, { method: "POST", body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`solution service ${path} answered HTTP ${response.status}: ${text}`);
  }
  return JSON.parse(text) as unknown;
}

/**
 * The same-origin HTTP binding over the backend solution routes
 * (`handleSolutionRequest` — the PROD-022 route factory the Tech Lead
 * mounts). Request/response bodies are the backend's own shapes verbatim.
 */
export function createHttpSolutionService(
  options: HttpSolutionServiceOptions,
): SolutionServicePort {
  const base = options.basePath ?? "/v1/solutions";
  const fetchImpl = options.fetchImpl;
  return {
    descriptor: {
      serviceId: "solution-service-http",
      engineKind: "aise-solution-engine",
      engineVersion: "1.0.0",
    },
    step: async (input) =>
      postJson(fetchImpl, `${base}/step`, input) as Promise<StepServiceResult>,
    revise: async (input) =>
      postJson(fetchImpl, `${base}/revise`, input) as Promise<ReviseServiceResult>,
    validate: async (input) =>
      postJson(fetchImpl, `${base}/validate`, input) as Promise<ValidateServiceResult>,
    inspect: async (input) =>
      postJson(fetchImpl, `${base}/inspect`, input) as Promise<InspectServiceResult>,
    quantities: async (input) =>
      postJson(fetchImpl, `${base}/quantities`, input) as Promise<QuantitiesServiceResult>,
  };
}
