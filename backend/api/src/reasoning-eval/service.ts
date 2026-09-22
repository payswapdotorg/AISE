/**
 * PROD-028 — Layer-2 reasoning evaluation service (thin orchestration over
 * the harness + the committed fixture catalog — the providers-module
 * service discipline).
 *
 * DETERMINISTIC and IN-MEMORY: no clock, no randomness, no I/O, NO
 * NETWORK (providers are never invoked by this module — the registry log
 * carries the adapter-submitted execution). Identical request sequences
 * produce identical response bytes. Every domain decision is made by the
 * HARNESS (harness.ts) over the control plane's pure validators; this
 * service owns only the catalog index and the request parsing
 * (fail-closed typed errors, never silent coercion).
 */

import { ReasoningEvalError } from "./model";
import type { ReasoningEvalLane, ReasoningEvalScenario } from "./model";
import { evaluateScenario } from "./harness";
import type { ReasoningEvalOutcome } from "./harness";
import { reasoningEvalCatalog, registryLogForScenario, suiteSummaryOf } from "./testkit";
import type { ReasoningEvalSuiteSummary } from "./testkit";

/* ------------------------------------------------------------------ */
/* Request shapes (parsed fail-closed)                                  */
/* ------------------------------------------------------------------ */

/** POST /v1/reasoning-eval/catalog — optional lane filter. */
export interface CatalogRequest {
  readonly lane?: ReasoningEvalLane;
}

/** POST /v1/reasoning-eval/scenario/run — run a catalog scenario by id. */
export interface ScenarioRunRequest {
  readonly scenarioId: string;
}

/**
 * POST /v1/reasoning-eval/scenario/evaluate — THE provider-neutral entry
 * point over HTTP (what HFX-201/202/203/204 consume): an arbitrary
 * scenario + its registry log.
 */
export interface ScenarioEvaluateRequest {
  readonly scenario: unknown;
  readonly registryLog: {
    readonly profile: unknown;
    readonly execution: unknown;
  };
}

/* ------------------------------------------------------------------ */
/* Response shapes                                                      */
/* ------------------------------------------------------------------ */

/** The catalog listing projection (presentation only). */
export interface ScenarioSummary {
  readonly scenarioId: string;
  readonly lane: ReasoningEvalLane;
  readonly provider: {
    readonly providerId: string;
    readonly technologyVersion: string;
  };
  readonly capability: string;
  readonly behaviorTag: string;
  readonly expectedFailureKind: string;
}

/** The full suite run response. */
export interface SuiteRunResponse {
  readonly outcomes: readonly ReasoningEvalOutcome[];
  readonly summary: ReasoningEvalSuiteSummary;
}

/* ------------------------------------------------------------------ */
/* Boundary parsers (shape → typed errors)                              */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const LANES: readonly string[] = [
  "multimodal-reasoning",
  "document-understanding",
  "retrieval",
];

/** Parses the catalog request body (fail closed). */
export function parseCatalogRequest(payload: unknown): CatalogRequest {
  if (!isRecord(payload)) {
    throw new ReasoningEvalError("invalid_request", "expected a JSON object body");
  }
  const lane = payload["lane"];
  if (lane === undefined) {
    return {};
  }
  if (typeof lane !== "string" || !LANES.includes(lane)) {
    throw new ReasoningEvalError(
      "invalid_request",
      `lane, when present, must be one of [${LANES.join(", ")}]`,
    );
  }
  return { lane: lane as ReasoningEvalLane };
}

/** Parses the scenario/run request body (fail closed). */
export function parseScenarioRunRequest(payload: unknown): ScenarioRunRequest {
  if (!isRecord(payload)) {
    throw new ReasoningEvalError("invalid_request", "expected a JSON object body");
  }
  const scenarioId = payload["scenarioId"];
  if (typeof scenarioId !== "string" || scenarioId.trim().length === 0) {
    throw new ReasoningEvalError(
      "invalid_request",
      "scenarioId is required and must be a non-empty string",
    );
  }
  return { scenarioId };
}

/** Parses the scenario/evaluate request body (fail closed). */
export function parseScenarioEvaluateRequest(payload: unknown): ScenarioEvaluateRequest {
  if (!isRecord(payload)) {
    throw new ReasoningEvalError("invalid_request", "expected a JSON object body");
  }
  const scenario = payload["scenario"];
  if (!isRecord(scenario)) {
    throw new ReasoningEvalError(
      "invalid_scenario",
      "scenario must be a JSON object (scenarioId, lane, providerRef, capability, input, expected)",
    );
  }
  const registryLog = payload["registryLog"];
  if (!isRecord(registryLog)) {
    throw new ReasoningEvalError(
      "invalid_registry_log",
      "registryLog must be an object (profile, execution)",
    );
  }
  const profile = registryLog["profile"];
  if (profile === undefined) {
    throw new ReasoningEvalError(
      "invalid_registry_log",
      "registryLog.profile is required (the registered provider profile)",
    );
  }
  const execution = registryLog["execution"];
  if (execution === undefined) {
    throw new ReasoningEvalError(
      "invalid_registry_log",
      "registryLog.execution is required (the adapter-submitted raw execution)",
    );
  }
  return { scenario, registryLog: { profile, execution } };
}

/* ------------------------------------------------------------------ */
/* The service                                                          */
/* ------------------------------------------------------------------ */

/**
 * The Layer-2 reasoning evaluation service: the committed fixture catalog
 * (default) or a caller-supplied scenario list, evaluated through the
 * provider-neutral harness. Instantiate once per process; deterministic.
 */
export class ReasoningEvalService {
  private readonly scenarios: readonly ReasoningEvalScenario[];
  private readonly byId: Map<string, ReasoningEvalScenario>;

  constructor(catalog: readonly ReasoningEvalScenario[] = reasoningEvalCatalog()) {
    this.scenarios = [...catalog];
    this.byId = new Map(this.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
    for (const scenario of this.scenarios) {
      if (this.byId.get(scenario.scenarioId) !== scenario) {
        throw new ReasoningEvalError(
          "invalid_scenario",
          `duplicate scenario id '${scenario.scenarioId}' — scenario identity is unique`,
        );
      }
    }
  }

  /** Lists the catalog (optionally filtered by lane), sorted by scenario id. */
  listScenarios(request: CatalogRequest = {}): readonly ScenarioSummary[] {
    return this.scenarios
      .filter((scenario) => request.lane === undefined || scenario.lane === request.lane)
      .map((scenario) => ({
        scenarioId: scenario.scenarioId,
        lane: scenario.lane,
        provider: scenario.providerRef,
        capability: scenario.capability,
        behaviorTag: String(scenario.input.payload["behaviorTag"] ?? ""),
        expectedFailureKind: scenario.expected.expectedFailureKind,
      }))
      .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  }

  /** Runs ONE catalog scenario through the harness (unknown id → typed 404 error). */
  runScenario(scenarioId: string): ReasoningEvalOutcome {
    const scenario = this.byId.get(scenarioId);
    if (scenario === undefined) {
      throw new ReasoningEvalError(
        "unknown_scenario",
        `no catalog scenario '${scenarioId}' — list the catalog via /v1/reasoning-eval/catalog`,
      );
    }
    return this.evaluate({ scenario, registryLog: registryLogForScenario(scenario) });
  }

  /**
   * Evaluates an ARBITRARY scenario + registry log — the provider-neutral
   * entry point (the HFX-201/202/203/204 consumption seam): register the
   * provider in the control plane, submit the scenario and the adapter's
   * raw execution, receive the canonical envelope + classification +
   * violations + benchmark record + provenance manifest.
   */
  evaluate(request: ScenarioEvaluateRequest): ReasoningEvalOutcome {
    return evaluateScenario(request.scenario, request.registryLog);
  }

  /** Runs the whole catalog (deterministic; the suite + discrimination summary). */
  runSuite(): SuiteRunResponse {
    const outcomes = this.scenarios.map((scenario) =>
      this.evaluate({ scenario, registryLog: registryLogForScenario(scenario) }),
    );
    return { outcomes, summary: suiteSummaryOf(outcomes) };
  }
}
