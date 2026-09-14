/**
 * AISE-031 — Execution/outcome loop HTTP surface (transport adapter ONLY).
 *
 * Contract (spec/work-orders.md §031; R13 — historical states remain
 * immutable; this surface never judges truth or approval: it applies typed
 * inputs through the deterministic execution service and reads back
 * canonical records):
 *
 *   POST /v1/executions
 *       Record the execution of an APPROVED intervention scenario state.
 *       Body `{ executionRecordId, caseId, scenarioId, stateId,
 *       executedStepIds, evidenceIds, captureSessionIds?, executedAt }` —
 *       caller-supplied stable execution id; every reference is resolved
 *       read-only. Non-approved scenarios are 422 `scenario_not_approved`;
 *       unknown case/scenario/state/step/evidence references are 422
 *       `unknown_*_ref` naming the id; duplicates are 422
 *       `execution_exists`.
 *   GET  /v1/executions
 *       List execution summaries.
 *   GET  /v1/executions/:id
 *       Full execution record (embedded PROPOSED → EXECUTED state
 *       transition + append-only history + outcomes).
 *   POST /v1/executions/:id/outcomes
 *       Record one OBSERVED post-work outcome observation. Body
 *       `{ caseId, statement, evidenceIds, captureSessionIds?,
 *       measurementRefs? }` — caseId must equal the execution's case
 *       (`outcome_case_mismatch`); evidence is REQUIRED; a claimed
 *       epistemicStatus other than OBSERVED is 422 `invalid_outcome`.
 *   GET  /v1/executions/lineage/:caseId
 *       The verified issue→outcome lineage (every hop verified; missing
 *       links are typed refusals `lineage_missing_execution` /
 *       `lineage_missing_outcome` / `lineage_missing_capture` /
 *       `unknown_*_ref`). `lineage` and `states` are reserved path words.
 *   GET  /v1/executions/states/:scenarioId/:stateId
 *       The derived state execution view: PROPOSED until execution
 *       evidence is recorded for that state, EXECUTED afterwards (the
 *       projection discipline — the intervention authority's own records
 *       are never mutated).
 *
 * HTTP STATUS MAPPING — the single authoritative place for this
 * translation (mirrors the cases/intervention router discipline; do not
 * duplicate elsewhere):
 *
 *   not-found codes  -> 404 (execution_not_found | case_not_found)
 *   invalid ids      -> 400 (invalid_execution_id | invalid_case_id |
 *                          invalid_scenario_ref | malformed_json)
 *   everything else  -> 422 (typed validation/semantic codes listed above
 *                          plus execution_exists, invalid_*, the lineage
 *                          missing-link codes and the corrupted
 *                          persisted-record guard invalid_execution_record)
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`); wrong methods get 405 with an explicit `allow`; paths
 * that match no execution route return null so the server's default 404
 * applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import {
  ExecutionError,
  parseRecordExecutionInput,
  parseRecordOutcomeInput,
  validateCaseRefId,
  validateExecutionRecordId,
  validateScenarioRefId,
} from "./model";
import { ExecutionService } from "./service";

export interface ExecutionRouteOptions {
  /** The Execution/Outcome policy engine over an injected store + clock + read-only resolvers. */
  readonly service: ExecutionService;
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
function executionErrorResponse(error: ExecutionError, requestId: string): Response {
  const status =
    error.code === "execution_not_found" || error.code === "case_not_found"
      ? 404
      : error.code === "invalid_execution_id" ||
          error.code === "invalid_case_id" ||
          error.code === "invalid_scenario_ref"
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
 * Route and answer one request against the Execution/Outcome surface.
 * Returns null when the path is not an execution route (the server then
 * answers 404). Error mapping happens HERE only (see module header).
 */
export async function handleExecutionRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: ExecutionRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "executions") {
    return null;
  }
  const { service, logger } = options;

  try {
    /* POST/GET /v1/executions ------------------------------------------- */

    if (segments.length === 2) {
      if (request.method === "POST") {
        const body = await readJsonBody(request);
        if (!body.ok) {
          return malformedJson(requestId);
        }
        const record = await service.recordExecution(parseRecordExecutionInput(body.payload));
        logger.info("execution_recorded", {
          requestId,
          executionRecordId: record.executionRecordId,
          caseId: record.caseId,
          scenarioId: record.scenarioId,
          stateId: record.stateId,
        });
        return jsonResponse(200, { ok: true, execution: record }, requestId);
      }
      if (request.method === "GET") {
        const executions = await service.listExecutions();
        return jsonResponse(200, { ok: true, executions }, requestId);
      }
      return methodNotAllowed(requestId, "GET, POST");
    }

    /* GET /v1/executions/lineage/:caseId -------------------------------- */

    if (segments.length === 4 && segments[2] === "lineage") {
      if (request.method !== "GET") {
        return methodNotAllowed(requestId, "GET");
      }
      const caseId = decodeSegment(segments[3] ?? "");
      if (caseId === null || caseId.length === 0) {
        return jsonResponse(
          400,
          { ok: false, error: "invalid_case_id", detail: "case id is not decodable" },
          requestId,
        );
      }
      validateCaseRefId(caseId);
      const lineage = await service.getCaseLineage(caseId);
      logger.info("execution_lineage_verified", {
        requestId,
        caseId,
        executions: lineage.executions.length,
      });
      return jsonResponse(200, { ok: true, lineage }, requestId);
    }

    /* GET /v1/executions/states/:scenarioId/:stateId --------------------- */

    if (segments.length === 5 && segments[2] === "states") {
      if (request.method !== "GET") {
        return methodNotAllowed(requestId, "GET");
      }
      const scenarioId = decodeSegment(segments[3] ?? "");
      if (scenarioId === null || scenarioId.length === 0) {
        return jsonResponse(
          400,
          { ok: false, error: "invalid_scenario_ref", detail: "scenario id is not decodable" },
          requestId,
        );
      }
      validateScenarioRefId(scenarioId);
      const stateId = decodeSegment(segments[4] ?? "");
      if (stateId === null || stateId.length === 0) {
        return jsonResponse(
          400,
          { ok: false, error: "invalid_execution", detail: "state id is not decodable" },
          requestId,
        );
      }
      const stateExecution = await service.getStateExecution(scenarioId, stateId);
      logger.info("execution_state_status_read", {
        requestId,
        scenarioId,
        stateId,
        epistemicStatus: stateExecution.epistemicStatus,
      });
      return jsonResponse(200, { ok: true, stateExecution }, requestId);
    }

    const executionRecordId = decodeSegment(segments[2] ?? "");
    if (executionRecordId === null || executionRecordId.length === 0) {
      return jsonResponse(
        400,
        { ok: false, error: "invalid_execution_id", detail: "execution id is not decodable" },
        requestId,
      );
    }
    validateExecutionRecordId(executionRecordId);

    /* GET /v1/executions/:id --------------------------------------------- */

    if (segments.length === 3) {
      if (request.method !== "GET") {
        return methodNotAllowed(requestId, "GET");
      }
      const record = await service.getExecution(executionRecordId);
      if (record === null) {
        return jsonResponse(
          404,
          {
            ok: false,
            error: "execution_not_found",
            detail: `execution ${executionRecordId} does not exist`,
          },
          requestId,
        );
      }
      return jsonResponse(200, { ok: true, execution: record }, requestId);
    }

    const action = segments[3] ?? "";

    /* POST /v1/executions/:id/outcomes ----------------------------------- */

    if (segments.length === 4 && action === "outcomes") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const outcome = await service.recordOutcome(
        executionRecordId,
        parseRecordOutcomeInput(body.payload),
      );
      logger.info("execution_outcome_recorded", {
        requestId,
        executionRecordId,
        outcomeId: outcome.outcomeId,
      });
      return jsonResponse(200, { ok: true, outcome }, requestId);
    }

    // A /v1/executions/... path with no matching route shape falls through
    // to the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof ExecutionError) {
      logger.warn("execution_request_rejected", {
        requestId,
        code: error.code,
        detail: error.detail,
      });
      return executionErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
