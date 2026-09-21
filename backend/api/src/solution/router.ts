/**
 * PROD-022 — Deterministic solution tool endpoints (transport adapter
 * ONLY — the `execution/` exemplar's pure route-factory discipline).
 *
 * ENDPOINT INVENTORY (all under /v1/solutions, all POST — the tool
 * inputs are full contract objects; all handlers deterministic and fail
 * closed with typed errors; every response carries the x-request-id
 * correlation header; wrong methods get 405 with an explicit allow):
 *
 *   POST /v1/solutions/step
 *       Apply ONE typed operation intent to a baseline proposed state.
 *       Body `{ baseline: ProposedState, intent: EngineeringOperationIntent,
 *       materializedAt, capabilityProfile? }` — the intent and baseline
 *       are STRICT-decoded through the contract codecs (typed
 *       `invalid_intent` / `invalid_baseline` on any violation). The
 *       response is the engine's `OperationApplicationResult`: an
 *       `applied` result (new state, operation record, effects,
 *       quantities, lineage) OR a fail-closed `invalid` / `unsupported` /
 *       `needs-input` outcome with machine-readable reasons — evaluation
 *       refusals are DETERMINISTIC ANSWERS (HTTP 200 data for the
 *       caller/agent to consume), never silently dropped.
 *   POST /v1/solutions/validate
 *       Run the deterministic validation checks over a solution version.
 *       Body `{ version: SolutionVersion, validatedAt, capabilityProfile? }`
 *       → `{ snapshot: SolutionValidationSnapshot }` (the contract-shaped
 *       record; outcome = worst-of the checks).
 *   POST /v1/solutions/inspect
 *       State/version/lineage readback. Body `{ version: SolutionVersion,
 *       stateIndex? }` → the version spine (operations, states, lineage
 *       parent), the requested layer (default: final state) and its
 *       applied operation ids. Out-of-range stateIndex → 422
 *       `invalid_state_index`.
 *   POST /v1/solutions/quantities
 *       Derived quantities of a state layer. Body `{ version:
 *       SolutionVersion, stateIndex? }` → the raw, traced quantity
 *       inventory (per-operation + net totals; the PROD-025 input — NO
 *       BOQ lines are constructed here).
 *
 * HTTP STATUS MAPPING (the single authoritative place for this
 * translation; mirrors the execution router's discipline):
 *
 *   malformed JSON  -> 400 malformed_json
 *   shape errors    -> 422 invalid_request | invalid_intent |
 *                          invalid_baseline | invalid_version |
 *                          invalid_state_index | invalid_timestamp
 *   everything else -> 200 (deterministic evaluation answers)
 *
 * MOUNT POINT (the Tech Lead wires this at the integration station —
 * this file does NOT touch shared server files): in `backend/api/src/
 * server.ts`, next to the AISE-031 execution block:
 *
 *   import { handleSolutionRequest, type SolutionRouteOptions } from "./solution/router";
 *
 *   if (url.pathname === "/v1/solutions" || url.pathname.startsWith("/v1/solutions/")) {
 *     const response = await handleSolutionRequest(
 *       request, url, requestId, solutionRoutesOrDefault(options),
 *     );
 *     if (response !== null) { return response; }
 *   }
 *
 * with a `solutions?: SolutionRouteOptions` HandlerOptions field wired
 * lazily (the execution/intervention lazy-mount discipline) to
 * `new SolutionService({ baselineGeometry: <read-only resolver over this
 * data dir> })`. `lineage` and `states` are NOT reserved path words here
 * (no GET sub-resources); paths that match no solution route return null
 * so the server's default 404 applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { SolutionError } from "./model";
import { SolutionService } from "./service";

export interface SolutionRouteOptions {
  /** The deterministic solution tool service (thin engine orchestration). */
  readonly service: SolutionService;
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

/** 400 vs 422 — the single authoritative status table (see header). */
function solutionErrorResponse(error: SolutionError, requestId: string): Response {
  const status = error.code === "malformed_json" ? 400 : 422;
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
 * Route and answer one request against the deterministic solution tool
 * surface. Returns null when the path is not a solution route (the
 * server then answers 404). PURE TRANSPORT: every domain decision is
 * made by the engine package through the service; error mapping happens
 * HERE only (see module header).
 */
export async function handleSolutionRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: SolutionRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "solutions") {
    return null;
  }
  const { service, logger } = options;

  try {
    if (segments.length === 3 && segments[2] === "step") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.step(body.payload);
      logger.info("solution_step_evaluated", {
        requestId,
        outcome: response.result.outcome,
        operationType:
          response.result.outcome === "applied"
            ? response.result.operation.operationType
            : undefined,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 3 && segments[2] === "validate") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.validate(body.payload);
      logger.info("solution_validated", {
        requestId,
        solutionId: response.snapshot.solutionId,
        versionNumber: response.snapshot.versionNumber,
        outcome: response.snapshot.outcome,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 3 && segments[2] === "inspect") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.inspect(body.payload);
      logger.info("solution_inspected", {
        requestId,
        solutionId: response.solutionId,
        versionNumber: response.versionNumber,
        stateIndex: response.requestedStateIndex,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 3 && segments[2] === "quantities") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.quantities(body.payload);
      logger.info("solution_quantities_derived", {
        requestId,
        solutionId: response.inventory.solutionId,
        versionNumber: response.inventory.versionNumber,
        stateIndex: response.inventory.stateIndex,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    // A /v1/solutions/... path with no matching route shape falls through
    // to the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof SolutionError) {
      logger.warn("solution_request_rejected", {
        requestId,
        code: error.code,
      });
      return solutionErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
