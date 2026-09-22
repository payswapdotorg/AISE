/**
 * PROD-029 — the Layer-3 substitution-evaluation SERVICE (the thin transport
 * adapter over the harness — the solution/solution-boq/providers exemplar).
 *
 * Stateless (the provider-registry event log travels WITH the request — the
 * caller owns the log; the harness is pure). Every method is a thin
 * parse → harness call; no store, no clock, no I/O. Evaluation-level
 * refusals are RESULTS (verdict "substitution-refused" — evidence, not
 * transport errors); parse-level failures throw the typed
 * `SolutionEvalError` the router maps to 4xx.
 */

import type { ProviderRegistryEvent } from "@aise/provider-registry";
import {
  parseRegistryLogPayload,
  parseSubstitutionScenario,
  SolutionEvalError,
} from "./model";
import type { SubstitutionScenario } from "./model";
import { evaluateSubstitution, runSubstitutionMatrix } from "./harness";
import type {
  MatrixCellSummary,
  MatrixRunResult,
  SubstitutionEvaluation,
} from "./harness";
import {
  canonicalRegistryLog,
  committedScenarioMatrix,
} from "./fixtures";

/* ------------------------------------------------------------------ */
/* Request / response DTOs                                             */
/* ------------------------------------------------------------------ */

export interface ScenarioValidateRequest {
  readonly scenario: unknown;
}

export interface ScenarioValidateResponse {
  readonly valid: true;
  readonly scenarioId: string;
  readonly seam: string;
  readonly baselineId: string;
  readonly substitute: { readonly providerId: string; readonly technologyVersion: string };
  readonly expectation: string;
  readonly expectedDivergenceKind?: string;
}

export interface SubstitutionEvaluateRequest {
  readonly scenario: unknown;
  readonly registryLog: readonly unknown[];
}

export interface SubstitutionEvaluateResponse {
  readonly evaluation: SubstitutionEvaluation;
}

export interface MatrixRunRequest {
  readonly registryLog?: readonly unknown[];
}

export interface MatrixRunResponse {
  readonly matrixId: string;
  readonly totals: MatrixRunResult["totals"];
  readonly cells: readonly MatrixCellSummary[];
}

/* ------------------------------------------------------------------ */
/* Parse helpers (fail-closed, typed)                                   */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseScenarioValidateRequest(payload: unknown): ScenarioValidateRequest {
  if (!isRecord(payload)) {
    throw new SolutionEvalError("invalid_request", "a scenario/validate body must be a JSON object");
  }
  if (payload["scenario"] === undefined) {
    throw new SolutionEvalError("invalid_request", "the 'scenario' field is required");
  }
  return { scenario: payload["scenario"] };
}

function parseSubstitutionEvaluateRequest(payload: unknown): SubstitutionEvaluateRequest {
  if (!isRecord(payload)) {
    throw new SolutionEvalError(
      "invalid_request",
      "a substitution/evaluate body must be a JSON object",
    );
  }
  if (payload["scenario"] === undefined) {
    throw new SolutionEvalError("invalid_request", "the 'scenario' field is required");
  }
  if (payload["registryLog"] === undefined) {
    throw new SolutionEvalError(
      "invalid_request",
      "the 'registryLog' field is required — the caller owns the provider-registry event log",
    );
  }
  return {
    scenario: payload["scenario"],
    registryLog: parseRegistryLogPayload(payload["registryLog"]),
  };
}

function parseMatrixRunRequest(payload: unknown): MatrixRunRequest {
  if (!isRecord(payload)) {
    throw new SolutionEvalError("invalid_request", "a matrix/run body must be a JSON object");
  }
  const registryLog = payload["registryLog"];
  if (registryLog === undefined) {
    return {};
  }
  return { registryLog: parseRegistryLogPayload(registryLog) };
}

/**
 * Narrows the caller-supplied log to the registry event type. The events
 * themselves are VALIDATED by the control plane's replay inside the harness
 * (an unlawful log answers the typed `registry-log-refused` refusal — never
 * a silent acceptance).
 */
function asRegistryEvents(log: readonly unknown[]): readonly ProviderRegistryEvent[] {
  return log as readonly ProviderRegistryEvent[];
}

/* ------------------------------------------------------------------ */
/* The service                                                          */
/* ------------------------------------------------------------------ */

export const SUBSTITUTION_MATRIX_ID = "layer3-substitution-matrix/1" as const;

/**
 * The Layer-3 substitution-evaluation endpoint service. Thin, stateless
 * transport adapter; the harness owns every domain decision.
 */
export class SolutionEvalService {
  /** POST /v1/solution-eval/scenario/validate — pure scenario-shape validation. */
  validateScenario(payload: unknown): ScenarioValidateResponse {
    const request = parseScenarioValidateRequest(payload);
    const scenario = parseSubstitutionScenario(request.scenario);
    return {
      valid: true,
      scenarioId: scenario.scenarioId,
      seam: scenario.seam,
      baselineId: scenario.baselineId,
      substitute: scenario.substitute,
      expectation: scenario.expectation,
      ...(scenario.expectedDivergenceKind === undefined
        ? {}
        : { expectedDivergenceKind: scenario.expectedDivergenceKind }),
    };
  }

  /** POST /v1/solution-eval/substitution/evaluate — one scenario over the caller's registry log. */
  async evaluateSubstitution(payload: unknown): Promise<SubstitutionEvaluateResponse> {
    const request = parseSubstitutionEvaluateRequest(payload);
    const scenario = parseSubstitutionScenario(request.scenario);
    const evaluation = await evaluateSubstitution(
      scenario,
      asRegistryEvents(request.registryLog),
    );
    return { evaluation };
  }

  /**
   * POST /v1/solution-eval/matrix/run — the committed substitution matrix
   * (4 seams × {equal, divergent}) over the caller's log (default: the
   * canonical committed log). The tools/solution-eval benchmark consumes
   * the committed golden of this computation.
   */
  async runMatrix(payload: unknown): Promise<MatrixRunResponse> {
    const request = parseMatrixRunRequest(payload);
    const registryLog =
      request.registryLog === undefined
        ? canonicalRegistryLog()
        : asRegistryEvents(request.registryLog);
    const result = await runSubstitutionMatrix(committedScenarioMatrix(), registryLog);
    return {
      matrixId: SUBSTITUTION_MATRIX_ID,
      totals: result.totals,
      cells: result.summaries,
    };
  }
}

export type { SubstitutionScenario };
