/**
 * AISE-026 — Intervention Studio HTTP surface (transport adapter ONLY).
 *
 * Contract (spec/work-orders.md §026; R11 — deterministic proposed
 * states, never overwriting observed reality; this surface never judges
 * truth or approval: it applies typed inputs through the deterministic
 * intervention service and reads back canonical proposed state):
 *
 *   POST /v1/interventions
 *       Create a scenario. Body `{ scenarioId, projectId, title,
 *       baselineVersionId }` — caller-supplied stable ids; the baseline
 *       version is PINNED and resolved read-only (through the injected
 *       baseline resolver). Duplicate ids are 422 `scenario_exists`;
 *       an unresolvable baseline is 404 `baseline_not_found`. Responds
 *       with the full scenario record (states[0] = layer 0 overlay).
 *   GET  /v1/interventions
 *       List scenario summaries.
 *   GET  /v1/interventions/:id
 *       Full scenario record (steps + immutable states).
 *   POST /v1/interventions/:id/steps
 *       Append one step `{ kind, targetNodeId, ...payload, rationale?,
 *       provenance }` → materializes the NEXT state layer immutably.
 *       Unknown targets are 422 `unknown_node_ref`; missing provenance is
 *       422 `missing_provenance`; terminal scenarios refuse (422
 *       `scenario_terminal`).
 *   GET  /v1/interventions/:id/states/:index   (or `latest`)
 *       One materialized state layer (every node PROPOSED).
 *   POST /v1/interventions/:id/approval-reference
 *       Record `{ caseId, reviewDecision, reviewedAt }` VERBATIM (a
 *       Case-domain review reference; never interpreted here).
 *   POST /v1/interventions/:id/status
 *       Governed transition `{ status }` — `approved` without a recorded
 *       reference is 422 `approval_reference_required`; illegal edges are
 *       422 `invalid_status_transition`.
 *
 * HTTP STATUS MAPPING — the single authoritative place for this
 * translation (mirrors the cases/reality router discipline; do not
 * duplicate elsewhere):
 *
 *   not-found codes  -> 404 (scenario_not_found | state_not_found |
 *                          baseline_not_found)
 *   malformed ids    -> 400 (invalid_scenario_id | invalid_project_id |
 *                          invalid_version_id | invalid_state_index |
 *                          malformed_json)
 *   everything else  -> 422 (typed validation/semantic codes listed above
 *                          plus scenario_exists, invalid_*, the corrupted
 *                          persisted-record guard invalid_intervention_record
 *                          and the epistemic invariant guard
 *                          invalid_epistemic_status)
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`); wrong methods get 405 with an explicit `allow`; paths
 * that match no intervention route return null so the server's default
 * 404 applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import {
  InterventionError,
  parseAddStepInput,
  parseApprovalReferenceInput,
  parseCreateScenarioInput,
  parseStatusTransitionInput,
  validateScenarioId,
} from "./model";
import { InterventionService } from "./service";

export interface InterventionRouteOptions {
  /** The Intervention Studio policy engine over an injected store + clock. */
  readonly service: InterventionService;
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

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** 404 vs 400 vs 422 — the single authoritative status table (see header). */
function interventionErrorResponse(error: InterventionError, requestId: string): Response {
  const status =
    error.code === "scenario_not_found" ||
    error.code === "state_not_found" ||
    error.code === "baseline_not_found"
      ? 404
      : error.code === "invalid_scenario_id" ||
          error.code === "invalid_project_id" ||
          error.code === "invalid_version_id" ||
          error.code === "invalid_state_index"
        ? 400
        : 422;
  return jsonResponse(
    status,
    { ok: false, error: error.code, detail: error.detail },
    requestId,
  );
}

function malformedJson(requestId: string): Response {
  return jsonResponse(
    400,
    { ok: false, error: "malformed_json", detail: "request body is not valid JSON" },
    requestId,
  );
}

/* ------------------------------------------------------------------ */
/* Router                                                               */
/* ------------------------------------------------------------------ */

/**
 * Route and answer one request against the Intervention Studio surface.
 * Returns null when the path is not an intervention route (the server
 * then answers 404). Error mapping happens HERE only (see module header).
 */
export async function handleInterventionRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: InterventionRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "interventions") {
    return null;
  }
  const { service, logger } = options;

  try {
    /* POST/GET /v1/interventions ---------------------------------------- */

    if (segments.length === 2) {
      if (request.method === "POST") {
        const body = await readJsonBody(request);
        if (!body.ok) {
          return malformedJson(requestId);
        }
        const record = await service.createScenario(parseCreateScenarioInput(body.payload));
        logger.info("scenario_created", {
          requestId,
          scenarioId: record.scenarioId,
          baselineVersionId: record.baselineVersionId,
        });
        return jsonResponse(200, { ok: true, scenario: record }, requestId);
      }
      if (request.method === "GET") {
        const scenarios = await service.listScenarios();
        return jsonResponse(200, { ok: true, scenarios }, requestId);
      }
      return methodNotAllowed(requestId, "GET, POST");
    }

    const scenarioId = decodeSegment(segments[2] ?? "");
    if (scenarioId === null || scenarioId.length === 0) {
      return jsonResponse(
        400,
        { ok: false, error: "invalid_scenario_id", detail: "scenario id is not decodable" },
        requestId,
      );
    }
    validateScenarioId(scenarioId);

    /* GET /v1/interventions/:id ------------------------------------------ */

    if (segments.length === 3) {
      if (request.method !== "GET") {
        return methodNotAllowed(requestId, "GET");
      }
      const record = await service.getScenario(scenarioId);
      if (record === null) {
        return jsonResponse(
          404,
          {
            ok: false,
            error: "scenario_not_found",
            detail: `scenario ${scenarioId} does not exist`,
          },
          requestId,
        );
      }
      return jsonResponse(200, { ok: true, scenario: record }, requestId);
    }

    const action = segments[3] ?? "";

    /* POST /v1/interventions/:id/steps ----------------------------------- */

    if (segments.length === 4 && action === "steps") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const { step, state } = await service.addStep(
        scenarioId,
        parseAddStepInput(body.payload),
      );
      logger.info("scenario_step_recorded", {
        requestId,
        scenarioId,
        stepId: step.stepId,
        kind: step.kind,
        stateIndex: state.stateIndex,
      });
      return jsonResponse(200, { ok: true, step, state }, requestId);
    }

    /* GET /v1/interventions/:id/states/:index|latest --------------------- */

    if (segments.length === 5 && action === "states") {
      if (request.method !== "GET") {
        return methodNotAllowed(requestId, "GET");
      }
      const selector = decodeSegment(segments[4] ?? "");
      if (selector === null || selector.length === 0) {
        return jsonResponse(
          400,
          {
            ok: false,
            error: "invalid_state_index",
            detail: "state index is not decodable",
          },
          requestId,
        );
      }
      if (selector !== "latest" && !/^\d+$/.test(selector)) {
        return jsonResponse(
          400,
          {
            ok: false,
            error: "invalid_state_index",
            detail: `state selector "${selector}" must be a non-negative integer or "latest"`,
          },
          requestId,
        );
      }
      const state = await service.getState(
        scenarioId,
        selector === "latest" ? "latest" : Number(selector),
      );
      logger.info("scenario_state_read", {
        requestId,
        scenarioId,
        stateIndex: state.stateIndex,
      });
      return jsonResponse(200, { ok: true, state }, requestId);
    }

    /* POST /v1/interventions/:id/approval-reference ---------------------- */

    if (segments.length === 4 && action === "approval-reference") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const record = await service.recordApprovalReference(
        scenarioId,
        parseApprovalReferenceInput(body.payload),
      );
      logger.info("scenario_approval_reference_recorded", {
        requestId,
        scenarioId,
        caseId: record.approvalReference?.caseId,
      });
      return jsonResponse(200, { ok: true, scenario: record }, requestId);
    }

    /* POST /v1/interventions/:id/status ---------------------------------- */

    if (segments.length === 4 && action === "status") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const record = await service.transitionStatus(
        scenarioId,
        parseStatusTransitionInput(body.payload).status,
      );
      logger.info("scenario_status_transitioned", {
        requestId,
        scenarioId,
        status: record.status,
      });
      return jsonResponse(200, { ok: true, scenario: record }, requestId);
    }

    // A /v1/interventions/... path with no matching route shape falls
    // through to the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof InterventionError) {
      logger.warn("scenario_request_rejected", {
        requestId,
        code: error.code,
        detail: error.detail,
      });
      return interventionErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
