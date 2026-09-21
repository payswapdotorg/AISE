/**
 * PROD-025 — Solution BOQ endpoints (transport adapter ONLY — the
 * `execution/`/`solution/` exemplar's pure route-factory discipline).
 *
 * ENDPOINT INVENTORY (all under /v1/solutions/boq — the solution-BOQ
 * subsurface of /v1/solutions, all POST, all deterministic and fail closed
 * with typed errors; every response carries the x-request-id correlation
 * header; wrong methods get 405 with an explicit allow):
 *
 *   POST /v1/solutions/boq/generate
 *       Generate the versioned derived BOQ of a validated solution version
 *       from its DECLARED validation snapshot. Body `{ version:
 *       SolutionVersion, snapshot: SolutionValidationSnapshot,
 *       sourceBoqRef? }` — both wire payloads STRICT-decoded through the
 *       contract codecs; `sourceBoqRef` is the optional identity-only
 *       reference to a related source BOQ (never overwritten). Gate
 *       failures answer 422 with the package's typed codes
 *       (snapshot_version_mismatch | snapshot_identity_mismatch |
 *       snapshot_input_digest_mismatch | snapshot_declaration_mismatch |
 *       snapshot_outcome_fail | empty_version); success answers 200 with
 *       the generated `SolutionBoq` (byte-identical across identical
 *       requests — no derivation time exists).
 *   POST /v1/solutions/boq/readback
 *       The versioned readback of a previously generated BOQ: verifies it
 *       (typed seal + full integrity re-derivation + contract trace
 *       invariants + navigation round trip) and answers `{ boq,
 *       verification }`. A non-generated-BOQ payload answers 422
 *       `invalid_boq`; a broken one answers 422 `boq_integrity_mismatch`.
 *   POST /v1/solutions/boq/line-operations
 *       BOQ-line → contributing solution steps: Body `{ boq, boqLineId }`
 *       → the line's contributions with each operation's geometry target
 *       refs, reality node refs and resulting proposed state (the solution
 *       step). Unknown line id → 404 `unknown_boq_line`.
 *   POST /v1/solutions/boq/operation-lines
 *       Operation → generated/modified/removed BOQ lines (reverse
 *       navigation): Body `{ boq, operationId }` → the affected lines with
 *       this operation's contribution kind. Operation unknown to the BOQ's
 *       version → 404 `unknown_operation`; a KNOWN operation contributing
 *       to no line answers an honest EMPTY list (200, never an error).
 *
 * HTTP STATUS MAPPING (the single authoritative place for this
 * translation; mirrors the solution router's discipline):
 *
 *   malformed JSON           -> 400 malformed_json
 *   unknown navigation ids   -> 404 unknown_boq_line | unknown_operation
 *   everything else          -> 422 (the typed shape/gate codes above plus
 *                                  invalid_request | invalid_version |
 *                                  invalid_snapshot | invalid_source_ref |
 *                                  invalid_boq | invalid_boq_line_id |
 *                                  invalid_operation_id |
 *                                  boq_integrity_mismatch)
 *   deterministic answers    -> 200
 *
 * MOUNT POINT (the Tech Lead wires this at the integration station — this
 * file does NOT touch shared server files): in `backend/api/src/server.ts`,
 * next to the PROD-022 solution block (which ignores the `boq` path word —
 * its routes are step|validate|inspect|quantities only):
 *
 *   import {
 *     handleSolutionBoqRequest,
 *     type SolutionBoqRouteOptions,
 *   } from "./solution-boq/router";
 *
 *   if (url.pathname.startsWith("/v1/solutions/boq")) {
 *     const response = await handleSolutionBoqRequest(
 *       request, url, requestId, solutionBoqRoutesOrDefault(options),
 *     );
 *     if (response !== null) { return response; }
 *   }
 *
 * with a `solutionBoq?: SolutionBoqRouteOptions` HandlerOptions field
 * wired lazily to `new SolutionBoqService()` (the service is stateless —
 * no deps). NOTE for the integration station: add
 * `"@aise/solution-boq": "workspace:*"` to backend/api/package.json
 * dependencies when wiring (this module already resolves through the
 * workspace root; the declaration keeps the dependency graph explicit).
 * Paths that match no solution-BOQ route return null so the server's
 * default 404 applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { SolutionBoqServiceError } from "./model";
import { SolutionBoqService } from "./service";

export interface SolutionBoqRouteOptions {
  /** The deterministic solution-BOQ service (thin package orchestration). */
  readonly service: SolutionBoqService;
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
function solutionBoqErrorResponse(error: SolutionBoqServiceError, requestId: string): Response {
  const status =
    error.code === "malformed_json"
      ? 400
      : error.code === "unknown_boq_line" || error.code === "unknown_operation"
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
 * Route and answer one request against the solution-BOQ surface. Returns
 * null when the path is not a solution-BOQ route (the server then answers
 * 404). PURE TRANSPORT: every domain decision is made by the
 * `@aise/solution-boq` package through the service; error mapping happens
 * HERE only (see module header).
 */
export async function handleSolutionBoqRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: SolutionBoqRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "solutions" || segments[2] !== "boq") {
    return null;
  }
  const action = segments[3] ?? "";
  const { service, logger } = options;

  try {
    if (segments.length === 4 && action === "generate") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.generate(body.payload);
      logger.info("solution_boq_generated", {
        requestId,
        solutionId: response.boq.solutionId,
        versionNumber: response.boq.versionNumber,
        boqId: response.boq.boqId,
        lineCount: response.boq.lines.length,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && action === "readback") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.readback(body.payload);
      logger.info("solution_boq_readback_verified", {
        requestId,
        boqId: response.verification.boqId,
        solutionId: response.verification.solutionId,
        versionNumber: response.verification.versionNumber,
        lineCount: response.verification.lineCount,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && action === "line-operations") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.lineOperations(body.payload);
      logger.info("solution_boq_line_operations_resolved", {
        requestId,
        boqLineId: response.boqLineId,
        contributions: response.contributions.length,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && action === "operation-lines") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.operationLines(body.payload);
      logger.info("solution_boq_operation_lines_resolved", {
        requestId,
        operationId: response.operationId,
        lines: response.lines.length,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    // A /v1/solutions/boq/... path with no matching route shape falls
    // through to the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof SolutionBoqServiceError) {
      logger.warn("solution_boq_request_rejected", {
        requestId,
        code: error.code,
      });
      return solutionBoqErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
