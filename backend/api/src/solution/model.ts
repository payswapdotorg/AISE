/**
 * PROD-022 — Deterministic solution tool endpoints, domain model.
 *
 * Contract (docs/productization-work-orders.md §PROD-022: "expose
 * deterministic tool endpoints for validate, step, inspect and derived
 * quantities"; spec/solution-operation-contract.md; ACR-005):
 *
 * THE SOLUTION HTTP SURFACE IS A STATELESS DETERMINISTIC TOOL SET, never
 * an authority:
 *
 *  - every request carries its own inputs (the version/state/intent
 *    payloads); the service holds NO store, NO clock and NO state — the
 *    same request bytes always produce the same response bytes;
 *  - wire payloads are decoded through the CONTRACT's STRICT decoders
 *    (`decodeStrict` — canonical validation; typed
 *    `SolutionError`s on any violation, never a silent coercion);
 *  - engine evaluation outcomes (`applied` / `invalid` / `unsupported` /
 *    `needs-input` with machine-readable reasons) are DETERMINISTIC
 *    ANSWERS (HTTP 200 data), not transport errors — the agent consumes
 *    the reasons; transport-level problems (malformed JSON, undecodable
 *    payloads, bad shapes) are 4xx typed errors;
 *  - instants (`materializedAt`, `validatedAt`, `createdAt`) are REQUIRED
 *    request inputs — this surface NEVER reads a clock (determinism pin);
 *  - the authoritative Reality Graph is reachable ONLY through the
 *    engine's read-only `BaselineGeometryResolver` seam (wired by the
 *    route factory options); there is NO write path (the engine package's
 *    frozen discipline).
 *
 * This module owns the request/response shapes, the typed error registry
 * and the boundary parsers (shape → typed codes, the execution model's
 * hand-rolled discipline). Policy lives in service.ts; transport in
 * router.ts.
 */

import type {
  OperationApplicationResult,
  StateQuantityInventory,
} from "@aise/solution-engine";
import type { ReviseVersionResult } from "@aise/solution-engine";
import type {
  ProposedState,
  SolutionValidationSnapshot,
} from "@aise/solution-contract";

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)            */
/* ------------------------------------------------------------------ */

export const SOLUTION_ERROR_CODES = Object.freeze([
  // shape / boundary validation (400/422 at the HTTP boundary)
  "invalid_request",
  "invalid_intent",
  "invalid_baseline",
  "invalid_version",
  "invalid_state_index",
  "invalid_timestamp",
  "malformed_json",
  // unsupported route shapes
  "unknown_route",
] as const);
export type SolutionErrorCode = (typeof SOLUTION_ERROR_CODES)[number];

/** One typed solution-tool error (fail closed, never silent). */
export class SolutionError extends Error {
  readonly code: SolutionErrorCode;
  readonly detail: string;

  constructor(code: SolutionErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "SolutionError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Request shapes                                                       */
/* ------------------------------------------------------------------ */

/** POST /v1/solutions/step — apply ONE intent to a baseline state. */
export interface StepRequest {
  readonly baseline: ProposedState;
  readonly intent: unknown;
  readonly capabilityProfile?: unknown;
  readonly materializedAt: string;
}

/** POST /v1/solutions/validate — run the deterministic checks over a version. */
export interface ValidateRequest {
  readonly version: unknown;
  readonly capabilityProfile?: unknown;
  readonly validatedAt: string;
}

/** POST /v1/solutions/inspect — state/version/lineage readback. */
export interface InspectRequest {
  readonly version: unknown;
  readonly stateIndex?: number;
}

/** POST /v1/solutions/quantities — derived quantities of a state. */
export interface QuantitiesRequest {
  readonly version: unknown;
  readonly stateIndex?: number;
}

/**
 * POST /v1/solutions/baseline (PROD-031) — materialize the solution-creation
 * baseline overlay (layer 0). The engine's own input shape: the state's
 * identity derivations need `node:crypto`, so the BROWSER workspace mount
 * materializes layer 0 through this route (the engine executes server-side).
 */
export interface BaselineRequest {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly baselineRealityVersionId: string;
  readonly materializedAt: string;
}

/**
 * The serializable stepped materialization clock of the revision leg: layer
 * N materializes at `base + N × stepMs` (the engine's own
 * `steppedMaterializeClock` arithmetic; the caller pins both values — this
 * surface never reads a clock).
 */
export interface ReviseClockSpec {
  readonly base: string;
  readonly stepMs: number;
}

/** POST /v1/solutions/revise (PROD-031) — the engine's revision (undo) leg. */
export interface ReviseRequest {
  readonly version: unknown;
  readonly revertOperationId: string;
  readonly capabilityProfile?: unknown;
  readonly createdAt: string;
  readonly materializeClock: ReviseClockSpec;
  readonly revisionProvenance: {
    readonly authoredBy: string;
    readonly reason: string;
    readonly authoredAt: string;
  };
}

/* ------------------------------------------------------------------ */
/* Response shapes                                                      */
/* ------------------------------------------------------------------ */

export interface StepResponse {
  readonly result: OperationApplicationResult;
}

export interface ValidateResponse {
  readonly snapshot: SolutionValidationSnapshot;
}

export interface InspectedOperation {
  readonly operationIndex: number;
  readonly operationId: string;
  readonly operationType: string;
  readonly intentRef: string | undefined;
  readonly appliedAtStateId: string | undefined;
  readonly dependencyCount: number;
  readonly effectCount: number;
}

export interface InspectResponse {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly parentVersionNumber?: number;
  readonly status: string;
  readonly operations: readonly InspectedOperation[];
  readonly states: readonly {
    readonly stateIndex: number;
    readonly stateId: string;
    readonly appliedOperationIds: readonly string[];
    readonly contentDigest: string | undefined;
    readonly materializedAt: string;
  }[];
  readonly requestedStateIndex: number;
  readonly requestedState: ProposedState | undefined;
}

export interface QuantitiesResponse {
  readonly inventory: StateQuantityInventory;
}

/** POST /v1/solutions/baseline response — the engine's layer-0 state verbatim. */
export interface BaselineResponse {
  readonly state: ProposedState;
}

/** POST /v1/solutions/revise response — the engine's typed revision outcome. */
export interface ReviseResponse {
  readonly result: ReviseVersionResult;
}

/* ------------------------------------------------------------------ */
/* Boundary parsers (shape → typed errors; hand-rolled discipline)      */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const ISO_8601_UTC_PATTERN_ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_8601_UTC_PATTERN_.test(value);
}

function parseStateIndex(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new SolutionError(
      "invalid_state_index",
      "stateIndex must be a non-negative integer layer number (0 = baseline overlay)",
    );
  }
  return value;
}

/** Parses the POST /v1/solutions/step request body (fail closed). */
export function parseStepRequest(payload: unknown): StepRequest {
  if (!isRecord(payload)) {
    throw new SolutionError("invalid_request", "expected a JSON object body");
  }
  const baseline = payload["baseline"];
  if (!isRecord(baseline)) {
    throw new SolutionError(
      "invalid_baseline",
      "baseline must be a ProposedState-shaped object (the state to apply onto)",
    );
  }
  const intent = payload["intent"];
  if (!isRecord(intent)) {
    throw new SolutionError(
      "invalid_intent",
      "intent must be an EngineeringOperationIntent-shaped object",
    );
  }
  const materializedAt = payload["materializedAt"];
  if (!isIsoTimestamp(materializedAt)) {
    throw new SolutionError(
      "invalid_timestamp",
      "materializedAt is required and must be an ISO-8601 UTC instant " +
        "(milliseconds, e.g. 2026-09-16T10:01:00.000Z) — the caller pins the " +
        "deterministic materialization instant; this surface never reads a clock",
    );
  }
  return {
    baseline: baseline as unknown as ProposedState,
    intent,
    ...(payload["capabilityProfile"] === undefined
      ? {}
      : { capabilityProfile: payload["capabilityProfile"] }),
    materializedAt,
  };
}

/** Parses the POST /v1/solutions/validate request body (fail closed). */
export function parseValidateRequest(payload: unknown): ValidateRequest {
  if (!isRecord(payload)) {
    throw new SolutionError("invalid_request", "expected a JSON object body");
  }
  const version = payload["version"];
  if (!isRecord(version)) {
    throw new SolutionError(
      "invalid_version",
      "version must be a SolutionVersion-shaped object",
    );
  }
  const validatedAt = payload["validatedAt"];
  if (!isIsoTimestamp(validatedAt)) {
    throw new SolutionError(
      "invalid_timestamp",
      "validatedAt is required and must be an ISO-8601 UTC instant " +
        "(milliseconds) — the caller pins the deterministic validation instant",
    );
  }
  return {
    version,
    ...(payload["capabilityProfile"] === undefined
      ? {}
      : { capabilityProfile: payload["capabilityProfile"] }),
    validatedAt,
  };
}

/** Parses the POST /v1/solutions/inspect request body (fail closed). */
export function parseInspectRequest(payload: unknown): InspectRequest {
  if (!isRecord(payload)) {
    throw new SolutionError("invalid_request", "expected a JSON object body");
  }
  const version = payload["version"];
  if (!isRecord(version)) {
    throw new SolutionError(
      "invalid_version",
      "version must be a SolutionVersion-shaped object",
    );
  }
  return {
    version,
    ...(payload["stateIndex"] === undefined
      ? {}
      : { stateIndex: parseStateIndex(payload["stateIndex"]) }),
  };
}

/** Parses the POST /v1/solutions/quantities request body (fail closed). */
export function parseQuantitiesRequest(payload: unknown): QuantitiesRequest {
  if (!isRecord(payload)) {
    throw new SolutionError("invalid_request", "expected a JSON object body");
  }
  const version = payload["version"];
  if (!isRecord(version)) {
    throw new SolutionError(
      "invalid_version",
      "version must be a SolutionVersion-shaped object",
    );
  }
  return {
    version,
    ...(payload["stateIndex"] === undefined
      ? {}
      : { stateIndex: parseStateIndex(payload["stateIndex"]) }),
  };
}

/** Parses the POST /v1/solutions/baseline request body (fail closed). */
export function parseBaselineRequest(payload: unknown): BaselineRequest {
  if (!isRecord(payload)) {
    throw new SolutionError("invalid_request", "expected a JSON object body");
  }
  const solutionId = payload["solutionId"];
  if (!isNonEmptyString(solutionId)) {
    throw new SolutionError(
      "invalid_request",
      "solutionId is required and must be a non-empty string (the solution the baseline overlay opens)",
    );
  }
  const versionNumber = payload["versionNumber"];
  if (
    typeof versionNumber !== "number" ||
    !Number.isInteger(versionNumber) ||
    versionNumber < 1
  ) {
    throw new SolutionError(
      "invalid_request",
      "versionNumber is required and must be a positive integer (the version the baseline overlay opens)",
    );
  }
  const baselineRealityVersionId = payload["baselineRealityVersionId"];
  if (!isNonEmptyString(baselineRealityVersionId)) {
    throw new SolutionError(
      "invalid_request",
      "baselineRealityVersionId is required and must be a non-empty string (the pinned read-only Reality-Graph version)",
    );
  }
  const materializedAt = payload["materializedAt"];
  if (!isIsoTimestamp(materializedAt)) {
    throw new SolutionError(
      "invalid_timestamp",
      "materializedAt is required and must be an ISO-8601 UTC instant " +
        "(milliseconds) — the caller pins the deterministic materialization " +
        "instant; this surface never reads a clock",
    );
  }
  return { solutionId, versionNumber, baselineRealityVersionId, materializedAt };
}

/** Parses the POST /v1/solutions/revise request body (fail closed). */
export function parseReviseRequest(payload: unknown): ReviseRequest {
  if (!isRecord(payload)) {
    throw new SolutionError("invalid_request", "expected a JSON object body");
  }
  const version = payload["version"];
  if (!isRecord(version)) {
    throw new SolutionError(
      "invalid_version",
      "version must be a SolutionVersion-shaped object (the version to revise, consumed read-only)",
    );
  }
  const revertOperationId = payload["revertOperationId"];
  if (!isNonEmptyString(revertOperationId)) {
    throw new SolutionError(
      "invalid_request",
      "revertOperationId is required and must be a non-empty string (the recorded operation whose effect to revert)",
    );
  }
  const createdAt = payload["createdAt"];
  if (!isIsoTimestamp(createdAt)) {
    throw new SolutionError(
      "invalid_timestamp",
      "createdAt is required and must be an ISO-8601 UTC instant " +
        "(milliseconds) — the deterministic creation instant of the new version",
    );
  }
  const clock = payload["materializeClock"];
  if (!isRecord(clock) || !isIsoTimestamp(clock["base"])) {
    throw new SolutionError(
      "invalid_request",
      "materializeClock is required and must be { base, stepMs } — the " +
        "serializable stepped clock of the new version's states (base: an " +
        "ISO-8601 UTC instant, layer N materializes at base + N × stepMs)",
    );
  }
  const stepMs = clock["stepMs"];
  if (typeof stepMs !== "number" || !Number.isInteger(stepMs) || stepMs < 0) {
    throw new SolutionError(
      "invalid_request",
      "materializeClock.stepMs must be a non-negative integer (milliseconds per state layer)",
    );
  }
  const provenance = payload["revisionProvenance"];
  if (!isRecord(provenance)) {
    throw new SolutionError(
      "invalid_request",
      "revisionProvenance is required (the undo act's attribution is never optional)",
    );
  }
  const authoredBy = provenance["authoredBy"];
  if (!isNonEmptyString(authoredBy)) {
    throw new SolutionError(
      "invalid_request",
      "revisionProvenance.authoredBy is required and must be a non-empty string",
    );
  }
  const reason = provenance["reason"];
  if (!isNonEmptyString(reason)) {
    throw new SolutionError(
      "invalid_request",
      "revisionProvenance.reason is required and must be a non-empty string",
    );
  }
  const authoredAt = provenance["authoredAt"];
  if (!isIsoTimestamp(authoredAt)) {
    throw new SolutionError(
      "invalid_timestamp",
      "revisionProvenance.authoredAt is required and must be an ISO-8601 UTC instant (milliseconds)",
    );
  }
  return {
    version,
    revertOperationId,
    ...(payload["capabilityProfile"] === undefined
      ? {}
      : { capabilityProfile: payload["capabilityProfile"] }),
    createdAt,
    materializeClock: { base: clock["base"] as string, stepMs },
    revisionProvenance: { authoredBy, reason, authoredAt },
  };
}

/** Validates a free-form id-like echo field (shape gate for logging). */
export function requireNonEmptyString(value: unknown, code: SolutionErrorCode, field: string): string {
  if (!isNonEmptyString(value)) {
    throw new SolutionError(code, `${field} must be a non-empty string`);
  }
  return value;
}
