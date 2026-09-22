/**
 * PROD-027 — the Layer-1 reality evaluation endpoints (transport adapter
 * ONLY — the `providers` module's pure route-factory discipline).
 *
 * ENDPOINT INVENTORY (all under /v1/reality-eval — all POST, all
 * deterministic and fail closed with typed errors; every response carries
 * the x-request-id correlation header; wrong methods get 405 with an
 * explicit allow):
 *
 *   POST /v1/reality-eval/profile/register
 *       Validate + register a Layer-1 provider profile into the evaluation
 *       registry (idempotent on providerId+technologyVersion): body
 *       `{ profile }` → 200 with the entry summary | 422 `invalid_profile` |
 *       `registration_conflict`.
 *   POST /v1/reality-eval/evaluation/start
 *       The registered → evaluation transition: body
 *       `{ providerId, technologyVersion }` → 200 with the entry summary |
 *       404 `unknown_provider` | 422 `unlawful_transition`.
 *   POST /v1/reality-eval/scenario/evaluate
 *       THE ENTRY POINT: body `{ scenario }` (the complete scenario — the
 *       committed descriptor form + the provider's declared execution) →
 *       the harness validates it, resolves the profile from the evaluation
 *       registry (deterministic replay), normalizes the declared result
 *       through the control plane's boundary, compares against the expected
 *       CANONICAL outcome, and answers the verdict + the control-plane
 *       BenchmarkRecord + the ProvenanceManifest (the lawful lifecycle
 *       events are appended) | the typed refusals (404 `unknown_provider`;
 *       422 `invalid_scenario`, `provider_not_in_evaluated_state`,
 *       `capability_lane_unavailable`, `invalid_input`,
 *       `normalization_refused`, …).
 *   POST /v1/reality-eval/registry/query
 *       Evaluation registry state query: body `{ providerId,
 *       technologyVersion }` → the one entry | 404 `unknown_provider`.
 *
 * HTTP STATUS MAPPING (the single authoritative place for this
 * translation; mirrors the providers router's discipline):
 *
 *   malformed JSON           -> 400 malformed_json
 *   unknown provider         -> 404 unknown_provider
 *   everything else          -> 422 (the typed shape/gate codes above)
 *   deterministic answers    -> 200
 *
 * MOUNT POINT (the Tech Lead wires this at the integration station — this
 * file does NOT touch shared server files): in `backend/api/src/server.ts`,
 * next to the providers block:
 *
 *   import {
 *     handleRealityEvalRequest,
 *     type RealityEvalRouteOptions,
 *   } from "./reality-eval/router";
 *
 *   if (url.pathname.startsWith("/v1/reality-eval")) {
 *     const response = await handleRealityEvalRequest(
 *       request, url, requestId, realityEvalRoutesOrDefault(options),
 *     );
 *     if (response !== null) { return response; }
 *   }
 *
 * with a `realityEval?: RealityEvalRouteOptions` HandlerOptions field wired
 * lazily to `new RealityEvalService()` (the service is a deterministic
 * in-memory event-sourced evaluation registry — no external deps, no
 * network egress). Paths that match no reality-eval route return null so
 * the server's default 404 applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { RealityEvalServiceError } from "./service";
import { RealityEvalService } from "./service";

export interface RealityEvalRouteOptions {
  /** The deterministic Layer-1 evaluation service (thin harness orchestration). */
  readonly service: RealityEvalService;
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
function realityEvalErrorResponse(error: RealityEvalServiceError, requestId: string): Response {
  const status =
    error.code === "malformed_json"
      ? 400
      : error.code === "unknown_provider"
        ? 404
        : 422;
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
 * Route and answer one request against the Layer-1 reality evaluation
 * surface. Returns null when the path is not a reality-eval route (the
 * server then answers 404). PURE TRANSPORT: every domain decision is made
 * by the harness (`evaluateScenario`) through the service; error mapping
 * happens HERE only (see module header).
 */
export async function handleRealityEvalRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: RealityEvalRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "reality-eval") {
    return null;
  }
  const area = segments[2] ?? "";
  const action = segments[3] ?? "";
  const { service, logger } = options;

  try {
    if (segments.length === 4 && area === "profile" && action === "register") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.register(body.payload);
      logger.info("reality_eval_provider_registered", {
        requestId,
        providerId: response.entry.providerId,
        technologyVersion: response.entry.technologyVersion,
        state: response.entry.state,
        capabilities: response.entry.capabilities,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "evaluation" && action === "start") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.startEvaluation(body.payload);
      logger.info("reality_eval_started", {
        requestId,
        providerId: response.entry.providerId,
        technologyVersion: response.entry.technologyVersion,
        state: response.entry.state,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "scenario" && action === "evaluate") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.evaluateScenarioRequest(body.payload);
      logger.info("reality_eval_scenario_evaluated", {
        requestId,
        scenarioId: response.scenarioId,
        scenarioClass: response.scenarioClass,
        verdict: response.verdict,
        discriminationCaught: response.discriminationCaught,
        recordId: response.record.recordId,
        manifestId: response.manifest.manifestId,
        failureObservationKinds: response.failureObservations.map((observation) => observation.kind),
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "registry" && action === "query") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.queryRegistry(body.payload);
      logger.info("reality_eval_registry_queried", {
        requestId,
        providerId: response.entries[0]?.providerId,
        technologyVersion: response.entries[0]?.technologyVersion,
        state: response.entries[0]?.state,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    // A /v1/reality-eval/... path with no matching route shape falls
    // through to the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof RealityEvalServiceError) {
      logger.warn("reality_eval_request_rejected", {
        requestId,
        code: error.code,
      });
      return realityEvalErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
