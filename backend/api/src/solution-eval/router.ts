/**
 * PROD-029 — the Layer-3 substitution-evaluation ROUTE FACTORY (the pure
 * solution/solution-boq/providers exemplar: one exported async handler over
 * path segments, returning `null` for non-module paths).
 *
 * ENDPOINT INVENTORY (all POST):
 *
 *   POST /v1/solution-eval/scenario/validate       — pure scenario-shape validation
 *   POST /v1/solution-eval/substitution/evaluate   — one scenario over the caller's registry log
 *   POST /v1/solution-eval/matrix/run              — the committed 4×2 substitution matrix
 *
 * Status table: 400 `malformed_json`; 422 every other typed code
 * (invalid_request / invalid_scenario / invalid_registry_log). Evaluation
 * refusals are NOT transport errors — they answer 200 with the verdict
 * `substitution-refused` and the typed machine-readable refusal.
 *
 * MOUNT POINT (the Tech Lead wires this at the integration station — the
 * providers/router exemplar; a DISTINCT top-level path word so the
 * /v1/solutions cascade stays untouched):
 *
 *   if (url.pathname === "/v1/solution-eval" || url.pathname.startsWith("/v1/solution-eval/")) {
 *     const response = await handleSolutionEvalRequest(request, url, requestId, options);
 *     if (response !== null) { return response; }
 *   }
 *
 * with `SolutionEvalRouteOptions` on the handler options (lazily defaulted
 * to `{ service: new SolutionEvalService(), logger }`).
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { SolutionEvalError } from "./model";
import { SolutionEvalService } from "./service";

export interface SolutionEvalRouteOptions {
  readonly service: SolutionEvalService;
  readonly logger: Logger;
}

function pathSegments(url: URL): readonly string[] {
  return url.pathname.split("/").filter((segment) => segment.length > 0);
}

async function readJsonBody(
  request: Request,
): Promise<{ readonly ok: true; readonly payload: unknown } | { readonly ok: false }> {
  try {
    const payload = (await request.json()) as unknown;
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}

function malformedJson(requestId: string): Response {
  return jsonResponse(
    400,
    {
      ok: false,
      error: "malformed_json",
      detail: "the request body is not parseable JSON",
    },
    requestId,
  );
}

function solutionEvalErrorResponse(error: SolutionEvalError, requestId: string): Response {
  const status = error.code === "malformed_json" ? 400 : 422;
  return jsonResponse(
    status,
    {
      ok: false,
      error: error.code,
      detail: error.detail,
    },
    requestId,
  );
}

/**
 * The pure route factory: handles every `/v1/solution-eval/**` path,
 * returns `null` for anything else (the server's 404 applies).
 */
export async function handleSolutionEvalRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: SolutionEvalRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "solution-eval") {
    return null;
  }
  const area = segments[2] ?? "";
  const action = segments[3] ?? "";
  const { service, logger } = options;

  try {
    if (segments.length === 4 && area === "scenario" && action === "validate") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.validateScenario(body.payload);
      logger.info("solution_eval_scenario_validated", {
        requestId,
        scenarioId: response.scenarioId,
        seam: response.seam,
        expectation: response.expectation,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "substitution" && action === "evaluate") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = await service.evaluateSubstitution(body.payload);
      logger.info("solution_eval_substitution_evaluated", {
        requestId,
        scenarioId: response.evaluation.scenarioId,
        seam: response.evaluation.seam,
        verdict: response.evaluation.verdict,
        expectationSatisfied: response.evaluation.expectationSatisfied,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "matrix" && action === "run") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = await service.runMatrix(body.payload);
      logger.info("solution_eval_matrix_run", {
        requestId,
        matrixId: response.matrixId,
        scenarios: response.totals.scenarios,
        proven: response.totals.proven,
        divergenceRecorded: response.totals.divergenceRecorded,
        refused: response.totals.refused,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    return null;
  } catch (error) {
    if (error instanceof SolutionEvalError) {
      logger.warn("solution_eval_request_rejected", {
        requestId,
        code: error.code,
      });
      return solutionEvalErrorResponse(error, requestId);
    }
    throw error;
  }
}
