/**
 * PROD-027 — the Layer-1 reality evaluation service (the thin HTTP-surface
 * orchestration).
 *
 * A DETERMINISTIC, IN-MEMORY EVENT-SOURCED evaluation registry over the
 * `@aise/provider-registry` control plane + the pure `evaluateScenario`
 * harness (the providers module's thin-orchestration discipline):
 *
 *  - the service owns an append-only registry log (the control plane's
 *    event vocabulary + derived state). DETERMINISTIC: identical request
 *    sequences produce identical registry states and identical response
 *    bytes — no clock (no event carries a timestamp: the log order IS the
 *    time), no randomness, NO NETWORK EGRESS (this module never invokes a
 *    provider over the network; adapters submit declared executions);
 *  - every scenario is validated through the module's PURE typed validators
 *    and evaluated through the harness (profile resolution by registry-log
 *    REPLAY — never an inline profile; normalization through the control
 *    plane's boundary; canonical comparison against Layer-1's OWN types);
 *  - a successful evaluation appends the LAWFUL lifecycle events
 *    (execution-normalized + provenance-sealed); the benchmark-record
 *    intake and promotion decisions belong to the control-plane surface
 *    (`/v1/providers/**`), never this module;
 *  - every refusal maps onto a typed `RealityEvalServiceError` with a
 *    stable code — never a silent coercion, never a fabricated result.
 */

import {
  applyRegistryEvent,
  createProviderRegistry,
  providerResultDigestOf,
  validateProviderProfile,
} from "@aise/provider-registry";
import type {
  ProviderRegistry,
  ProviderRegistryEvent,
  RegistryEntry,
  RegistryEventFailure,
} from "@aise/provider-registry";
import { evaluateScenario } from "./harness";
import type { ScenarioEvaluation } from "./harness";
import type { RealityEvalScenario } from "./model";

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the router maps them to HTTP)            */
/* ------------------------------------------------------------------ */

export const REALITY_EVAL_SERVICE_ERROR_CODES = Object.freeze([
  // shape / boundary validation (400/422 at the HTTP boundary)
  "malformed_json",
  "invalid_request",
  "invalid_scenario",
  "invalid_profile",
  "unknown_provider",
  "provider_not_in_evaluated_state",
  "capability_lane_unavailable",
  "invalid_input",
  "normalization_refused",
  "registry_unreplayable",
  // registry state machine (422)
  "registration_conflict",
  "unlawful_transition",
] as const);
export type RealityEvalServiceErrorCode = (typeof REALITY_EVAL_SERVICE_ERROR_CODES)[number];

/** One typed reality-eval endpoint error (fail closed, never silent). */
export class RealityEvalServiceError extends Error {
  readonly code: RealityEvalServiceErrorCode;
  readonly detail: string;

  constructor(code: RealityEvalServiceErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "RealityEvalServiceError";
    this.code = code;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Request shapes                                                       */
/* ------------------------------------------------------------------ */

/** POST /v1/reality-eval/profile/register — { profile }. */
export interface ProfileRegisterRequest {
  readonly profile: unknown;
}

/** POST /v1/reality-eval/evaluation/start | /v1/reality-eval/registry/query. */
export interface ProviderKeyRequest {
  readonly providerId: string;
  readonly technologyVersion: string;
}

/**
 * POST /v1/reality-eval/scenario/evaluate — the COMPLETE scenario (the
 * committed descriptor form + the provider's declared execution). The
 * harness validates it, resolves the profile from the service's registry,
 * evaluates it and appends the lawful lifecycle events.
 */
export interface ScenarioEvaluateRequest {
  readonly scenario: unknown;
}

/* ------------------------------------------------------------------ */
/* Response shapes                                                      */
/* ------------------------------------------------------------------ */

/** The evaluation answer: the verdict, the record, the manifest. */
export interface ScenarioEvaluateResponse {
  readonly scenarioId: string;
  readonly scenarioClass: string;
  readonly verdict: "pass" | "fail";
  readonly discriminationCaught: boolean;
  readonly failureObservations: readonly {
    readonly kind: string;
    readonly detail: string;
  }[];
  readonly criterionViolations: readonly {
    readonly metric: string;
    readonly subjectId: string;
    readonly value: number;
    readonly threshold: number;
    readonly critical: boolean;
  }[];
  readonly record: ScenarioEvaluation["record"];
  readonly manifest: ScenarioEvaluation["manifest"];
}

/** The deterministic registry entry summary (state + counts). */
export interface RealityEvalEntrySummary {
  readonly providerId: string;
  readonly technologyVersion: string;
  readonly state: string;
  readonly capabilities: readonly string[];
  readonly evaluationOnly: boolean;
  readonly normalizedExecutionCount: number;
  readonly provenanceManifestCount: number;
}

export interface ProfileRegisterResponse {
  readonly entry: RealityEvalEntrySummary;
}

export interface RegistryQueryResponse {
  readonly entries: readonly RealityEvalEntrySummary[];
}

/* ------------------------------------------------------------------ */
/* Boundary parsers (shape → typed errors; hand-rolled discipline)      */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireProviderKey(payload: Record<string, unknown>): ProviderKeyRequest {
  const providerId = payload["providerId"];
  const technologyVersion = payload["technologyVersion"];
  if (typeof providerId !== "string" || providerId.trim().length === 0) {
    throw new RealityEvalServiceError(
      "invalid_request",
      "providerId is required and must be a non-empty string",
    );
  }
  if (typeof technologyVersion !== "string" || technologyVersion.trim().length === 0) {
    throw new RealityEvalServiceError(
      "invalid_request",
      "technologyVersion is required and must be a non-empty string",
    );
  }
  return { providerId, technologyVersion };
}

/** Parses the POST /v1/reality-eval/profile/register body (fail closed). */
export function parseProfileRegisterRequest(payload: unknown): ProfileRegisterRequest {
  if (!isRecord(payload)) {
    throw new RealityEvalServiceError("invalid_request", "expected a JSON object body");
  }
  const profile = payload["profile"];
  if (!isRecord(profile)) {
    throw new RealityEvalServiceError(
      "invalid_profile",
      "profile must be a ProviderProfile-shaped object (typed seal 'provider-profile')",
    );
  }
  return { profile };
}

/** Parses the provider-key bodies (fail closed). */
export function parseProviderKeyRequest(payload: unknown): ProviderKeyRequest {
  if (!isRecord(payload)) {
    throw new RealityEvalServiceError("invalid_request", "expected a JSON object body");
  }
  return requireProviderKey(payload);
}

/** Parses the POST /v1/reality-eval/scenario/evaluate body (fail closed). */
export function parseScenarioEvaluateRequest(payload: unknown): ScenarioEvaluateRequest {
  if (!isRecord(payload)) {
    throw new RealityEvalServiceError("invalid_request", "expected a JSON object body");
  }
  const scenario = payload["scenario"];
  if (!isRecord(scenario)) {
    throw new RealityEvalServiceError(
      "invalid_scenario",
      "scenario must be a RealityEvalScenario-shaped object (typed seal 'reality-eval-scenario')",
    );
  }
  return { scenario };
}

/** The entry summary projection (pure; derived from the control-plane entry). */
export function realityEvalEntrySummaryOf(entry: RegistryEntry): RealityEvalEntrySummary {
  return {
    providerId: entry.providerId,
    technologyVersion: entry.technologyVersion,
    state: entry.state,
    capabilities: [...entry.profile.capabilities],
    evaluationOnly: entry.profile.license.evaluationOnly,
    normalizedExecutionCount: entry.normalizedExecutions.length,
    provenanceManifestCount: entry.provenanceManifests.length,
  };
}

/* ------------------------------------------------------------------ */
/* The service                                                          */
/* ------------------------------------------------------------------ */

/** Maps a control-plane registry-event failure onto the typed service error. */
function fromRegistryFailure(failure: RegistryEventFailure): RealityEvalServiceError {
  switch (failure.kind) {
    case "invalid-profile": {
      const issues = (failure.underlying ?? [])
        .map((entry) => `${entry.path || "(root)"} ${entry.detail}`)
        .join("; ");
      return new RealityEvalServiceError(
        "invalid_profile",
        `the profile failed typed validation${issues === "" ? "" : `: ${issues}`}`,
      );
    }
    case "invalid-event-shape":
      return new RealityEvalServiceError("invalid_request", failure.detail);
    case "unknown-provider":
      return new RealityEvalServiceError("unknown_provider", failure.detail);
    case "registration-conflict":
      return new RealityEvalServiceError("registration_conflict", failure.detail);
    case "unlawful-transition":
      return new RealityEvalServiceError("unlawful_transition", failure.detail);
    case "invalid-benchmark-record":
    case "invalid-provenance-manifest":
    case "record-provider-mismatch":
    case "manifest-provider-mismatch":
    case "promotion-gate-refused":
      return new RealityEvalServiceError(
        "unlawful_transition",
        `the event is not part of this surface's lifecycle: ${failure.detail}`,
      );
  }
}

/**
 * The Layer-1 reality evaluation service: a deterministic, event-sourced
 * in-memory registry + the pure harness. Instantiate once per process;
 * every method is a pure function of (current registry state, request
 * payload).
 */
export class RealityEvalService {
  private registry: ProviderRegistry = createProviderRegistry();

  /** POST /v1/reality-eval/profile/register — validate + register (idempotent). */
  register(payload: unknown): ProfileRegisterResponse {
    const request = parseProfileRegisterRequest(payload);
    const validation = validateProviderProfile(request.profile);
    if (!validation.ok) {
      const issues = validation.failures
        .map((failure) => `${failure.path || "(root)"} ${failure.kind}: ${failure.detail}`)
        .join("; ");
      throw new RealityEvalServiceError(
        "invalid_profile",
        `the profile failed typed validation (${validation.failures.length} failure(s)): ${issues}`,
      );
    }
    const result = applyRegistryEvent(this.registry, {
      kind: "provider-registered",
      profile: validation.profile,
    });
    if (!result.ok) {
      throw fromRegistryFailure(result.failure);
    }
    this.registry = result.registry;
    return {
      entry: realityEvalEntrySummaryOf(
        this.requireEntry(validation.profile.providerId, validation.profile.technologyVersion),
      ),
    };
  }

  /** POST /v1/reality-eval/evaluation/start — the registered → evaluation transition. */
  startEvaluation(payload: unknown): ProfileRegisterResponse {
    const request = parseProviderKeyRequest(payload);
    this.requireEntry(request.providerId, request.technologyVersion);
    const result = applyRegistryEvent(this.registry, {
      kind: "evaluation-started",
      providerId: request.providerId,
      technologyVersion: request.technologyVersion,
    });
    if (!result.ok) {
      throw fromRegistryFailure(result.failure);
    }
    this.registry = result.registry;
    return {
      entry: realityEvalEntrySummaryOf(this.requireEntry(request.providerId, request.technologyVersion)),
    };
  }

  /**
   * POST /v1/reality-eval/scenario/evaluate — validate the complete
   * scenario, evaluate it through the harness against the service's
   * registry log, and (on a successful evaluation) append the lawful
   * lifecycle events (execution-normalized + provenance-sealed). The
   * BenchmarkRecord and ProvenanceManifest are RETURNED as data — their
   * control-plane intake is a separate decision.
   */
  evaluateScenarioRequest(payload: unknown): ScenarioEvaluateResponse {
    const request = parseScenarioEvaluateRequest(payload);
    const outcome = evaluateScenario(request.scenario as RealityEvalScenario, this.registry.events);
    if (!outcome.ok) {
      throw fromScenarioRefusal(outcome.refusal.kind, outcome.refusal.detail);
    }
    const evaluation = outcome.evaluation;

    const applied = applyRegistryEvent(this.registry, {
      kind: "execution-normalized",
      providerId: evaluation.record.providerId,
      technologyVersion: evaluation.record.technologyVersion,
      execution: {
        capability: evaluation.record.capability,
        inputDigest: evaluation.record.reproduction.inputsDigest,
        normalizedResultDigest: providerResultDigestOf(evaluation.normalizedResult),
      },
    });
    if (!applied.ok) {
      throw fromRegistryFailure(applied.failure);
    }
    this.registry = applied.registry;

    const sealed = applyRegistryEvent(this.registry, {
      kind: "provenance-sealed",
      manifest: evaluation.manifest,
    });
    if (!sealed.ok) {
      throw fromRegistryFailure(sealed.failure);
    }
    this.registry = sealed.registry;

    return {
      scenarioId: evaluation.scenarioId,
      scenarioClass: evaluation.scenarioClass,
      verdict: evaluation.verdict,
      discriminationCaught: evaluation.discriminationCaught,
      failureObservations: evaluation.failureObservations,
      criterionViolations: evaluation.criterionViolations.map((violation) => ({
        metric: violation.metric,
        subjectId: violation.subjectId,
        value: violation.value,
        threshold: violation.threshold,
        critical: violation.critical,
      })),
      record: evaluation.record,
      manifest: evaluation.manifest,
    };
  }

  /** POST /v1/reality-eval/registry/query — one entry or the full listing. */
  queryRegistry(payload: unknown): RegistryQueryResponse {
    const request = parseProviderKeyRequest(payload);
    return {
      entries: [realityEvalEntrySummaryOf(this.requireEntry(request.providerId, request.technologyVersion))],
    };
  }

  /** The current append-only event log (the deterministic-replay seam). */
  events(): readonly ProviderRegistryEvent[] {
    return this.registry.events;
  }

  /* ---------------------------------------------------------------- */
  /* Internal helpers                                                  */
  /* ---------------------------------------------------------------- */

  private requireEntry(providerId: string, technologyVersion: string): RegistryEntry {
    const entry = this.registry.entryOf(providerId, technologyVersion);
    if (entry === undefined) {
      throw new RealityEvalServiceError(
        "unknown_provider",
        `provider '${providerId}' (${technologyVersion}) is not registered — register the profile first`,
      );
    }
    return entry;
  }
}

/** Maps a harness refusal kind onto the typed service error. */
function fromScenarioRefusal(kind: string, detail: string): RealityEvalServiceError {
  switch (kind) {
    case "scenario-invalid":
      return new RealityEvalServiceError("invalid_scenario", detail);
    case "unknown-provider":
      return new RealityEvalServiceError("unknown_provider", detail);
    case "provider-not-in-evaluated-state":
      return new RealityEvalServiceError("provider_not_in_evaluated_state", detail);
    case "capability-lane-unavailable":
      return new RealityEvalServiceError("capability_lane_unavailable", detail);
    case "input-invalid":
      return new RealityEvalServiceError("invalid_input", detail);
    case "normalization-refused":
      return new RealityEvalServiceError("normalization_refused", detail);
    case "registry-unreplayable":
      return new RealityEvalServiceError("registry_unreplayable", detail);
    default:
      return new RealityEvalServiceError("invalid_scenario", detail);
  }
}

/** Re-exported for the router's mount-point documentation consumers. */
export type { RealityEvalScenario };
