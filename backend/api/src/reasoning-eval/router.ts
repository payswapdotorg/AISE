/**
 * PROD-028 — Layer-2 reasoning evaluation endpoints (transport adapter
 * ONLY — the solution-boq/providers pure route-factory discipline).
 *
 * ENDPOINT INVENTORY (all under /v1/reasoning-eval — all POST, all
 * deterministic and fail closed with typed errors; every response carries
 * the x-request-id correlation header; wrong methods get 405 with an
 * explicit allow):
 *
 *   POST /v1/reasoning-eval/catalog
 *       The committed scenario catalog: body `{}` → every scenario
 *       summary; body `{ lane }` → one lane's scenarios.
 *   POST /v1/reasoning-eval/scenario/run
 *       Run ONE catalog scenario: body `{ scenarioId }` → 200 with the
 *       full outcome (canonical envelope, classification, violations,
 *       benchmark record, provenance manifest) | 404 `unknown_scenario`.
 *   POST /v1/reasoning-eval/scenario/evaluate
 *       THE provider-neutral evaluation entry point (HFX-201/202/203/204
 *       consume this): body `{ scenario, registryLog: { profile,
 *       execution } }` → 200 with the full outcome | 422 typed codes.
 *   POST /v1/reasoning-eval/suite/run
 *       Run the whole catalog: body `{}` → 200 with every outcome + the
 *       suite summary (the five-way discrimination coverage table).
 *
 * HTTP STATUS MAPPING (the single authoritative place):
 *
 *   malformed JSON            -> 400 malformed_json
 *   unknown scenario          -> 404 unknown_scenario
 *   everything else (typed)   -> 422 invalid_request | invalid_scenario |
 *                                   invalid_bundle | invalid_registry_log |
 *                                   invalid_profile | invalid_input
 *   deterministic answers     -> 200
 *
 * MOUNT POINT (the Tech Lead wires this at the integration station — this
 * file does NOT touch shared server files): in `backend/api/src/server.ts`,
 * next to the providers block:
 *
 *   import {
 *     handleReasoningEvalRequest,
 *     type ReasoningEvalRouteOptions,
 *   } from "./reasoning-eval/router";
 *
 *   if (url.pathname.startsWith("/v1/reasoning-eval")) {
 *     const response = await handleReasoningEvalRequest(
 *       request, url, requestId, reasoningEvalRoutesOrDefault(options),
 *     );
 *     if (response !== null) { return response; }
 *   }
 *
 * with a `reasoningEval?: ReasoningEvalRouteOptions` HandlerOptions field
 * wired lazily to `new ReasoningEvalService()` (the service is a
 * deterministic in-memory evaluation over the committed fixture catalog —
 * no external deps, no network egress). Paths that match no route return
 * null so the server's default 404 applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { ReasoningEvalError } from "./model";
import {
  ReasoningEvalService,
  parseCatalogRequest,
  parseScenarioEvaluateRequest,
  parseScenarioRunRequest,
} from "./service";

export interface ReasoningEvalRouteOptions {
  /** The deterministic Layer-2 evaluation service (thin harness orchestration). */
  readonly service: ReasoningEvalService;
  /** Structured logger for domain-level request events. */
  readonly logger: Logger;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; payload: unknown } | { ok: false }> {
  const text = await request.text();
  try {
    return { ok: true, payload: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function malformedJson(requestId: string): Response {
  return jsonResponse(
    400,
    { ok: false, error: "malformed_json", detail: "request body is not valid JSON" },
    requestId,
  );
}

/** 400 vs 404 vs 422 — the single authoritative status table (see header). */
function reasoningEvalErrorResponse(error: ReasoningEvalError, requestId: string): Response {
  const status = error.code === "unknown_scenario" ? 404 : 422;
  return jsonResponse(
    status,
    { ok: false, error: error.code, detail: error.detail },
    requestId,
  );
}

/* ------------------------------------------------------------------ */
/* Router                                                               */
/* ------------------------------------------------------------------ */

/**
 * Route and answer one request against the Layer-2 reasoning evaluation
 * surface. Returns null when the path is not a reasoning-eval route (the
 * server then answers 404). PURE TRANSPORT: every domain decision is made
 * by the harness through the service; error mapping happens HERE only.
 */
export async function handleReasoningEvalRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: ReasoningEvalRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "reasoning-eval") {
    return null;
  }
  const area = segments[2] ?? "";
  const action = segments[3] ?? "";
  const { service, logger } = options;

  try {
    if (segments.length === 4 && area === "catalog" && action === "list") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = { scenarios: service.listScenarios(parseCatalogRequest(body.payload)) };
      logger.info("reasoning_eval_catalog_listed", {
        requestId,
        scenarios: response.scenarios.length,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "scenario" && action === "run") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const outcome = service.runScenario(parseScenarioRunRequest(body.payload).scenarioId);
      logger.info("reasoning_eval_scenario_run", {
        requestId,
        scenarioId: outcome.scenarioId,
        lane: outcome.lane,
        classification: outcome.classification,
        violations: outcome.violations.length,
        expectedMatch: outcome.expectedMatch,
      });
      return jsonResponse(200, { ok: true, outcome }, requestId);
    }

    if (segments.length === 4 && area === "scenario" && action === "evaluate") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const evaluateRequest = parseScenarioEvaluateRequest(body.payload);
      const outcome = service.evaluate(evaluateRequest);
      logger.info("reasoning_eval_scenario_evaluated", {
        requestId,
        scenarioId: outcome.scenarioId,
        lane: outcome.lane,
        classification: outcome.classification,
        violations: outcome.violations.length,
        expectedMatch: outcome.expectedMatch,
      });
      return jsonResponse(200, { ok: true, outcome }, requestId);
    }

    if (segments.length === 4 && area === "suite" && action === "run") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.runSuite();
      logger.info("reasoning_eval_suite_run", {
        requestId,
        total: response.summary.total,
        classificationMatches: response.summary.classificationMatches,
        expectedMatches: response.summary.expectedMatches,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    // A /v1/reasoning-eval/... path with no matching route shape falls
    // through to the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof ReasoningEvalError) {
      logger.warn("reasoning_eval_request_rejected", {
        requestId,
        code: error.code,
      });
      return reasoningEvalErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
