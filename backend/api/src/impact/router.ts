/**
 * AISE-028 — Intervention quantities/cost impacts HTTP surface (transport
 * adapter ONLY).
 *
 * Contract (spec/work-orders.md §028; R11 — "quantities/cost impacts are
 * traceable"; R8/R9 — BOQ source traceability without altering either
 * source; this surface never judges truth: it applies typed inputs through
 * the deterministic impact service and reads back canonical records):
 *
 *   POST /v1/impacts
 *       Compute (and idempotently persist) the quantities/cost impact
 *       report of one scenario state layer against its layer-0 baseline
 *       overlay, mapped onto the import's LATEST BOQ mapping revision.
 *       Body `{ scenarioId, stateIndex, importId, epistemicStatus?,
 *       rates? }`. A claimed epistemic status other than PROPOSED is 422
 *       `invalid_epistemic_status` (impact figures describe proposed state
 *       deltas, never observed reality). Unknown scenario → 422
 *       `unknown_scenario_ref`; out-of-range layer → 422 `state_not_found`;
 *       an import without a stored mapping → 422 `mapping_not_available`.
 *       Re-computing the SAME resolved inputs is idempotent (200, the
 *       stored record); a stored record that diverges from the fresh
 *       recomputation is 422 `impact_record_divergence`.
 *   GET  /v1/impacts
 *       List stored impact record summaries.
 *   GET  /v1/impacts/:impactId
 *       Full impact record (report + request pins + write-once history).
 *
 * HTTP STATUS MAPPING — the single authoritative place for this
 * translation (mirrors the execution router discipline; do not duplicate
 * elsewhere):
 *
 *   not-found codes  -> 404 (impact_not_found)
 *   invalid ids      -> 400 (invalid_impact_id | invalid_scenario_ref |
 *                          invalid_import_ref | malformed_json)
 *   everything else  -> 422 (typed validation/semantic codes listed above
 *                          plus invalid_impact, invalid_state_index,
 *                          invalid_rate_input, invalid_epistemic_status,
 *                          scenario_projection_invalid and the corrupted
 *                          persisted-record guard invalid_impact_record)
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`); wrong methods get 405 with an explicit `allow`; paths
 * that match no impact route return null so the server's default 404
 * applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { ImpactError, parseComputeImpactInput, validateImpactId } from "./model";
import { ImpactService } from "./service";

export interface ImpactRouteOptions {
  /** The deterministic impact compute engine over an injected store + clock + read-only resolvers. */
  readonly service: ImpactService;
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
function impactErrorResponse(error: ImpactError, requestId: string): Response {
  const status =
    error.code === "impact_not_found"
      ? 404
      : error.code === "invalid_impact_id" ||
          error.code === "invalid_scenario_ref" ||
          error.code === "invalid_import_ref"
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
 * Route and answer one request against the impact surface. Returns null
 * when the path is not an impact route (the server then answers 404).
 * Error mapping happens HERE only (see module header).
 */
export async function handleImpactRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: ImpactRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "impacts") {
    return null;
  }
  const { service, logger } = options;

  try {
    /* POST/GET /v1/impacts ----------------------------------------------- */

    if (segments.length === 2) {
      if (request.method === "POST") {
        const body = await readJsonBody(request);
        if (!body.ok) {
          return malformedJson(requestId);
        }
        const record = await service.computeImpact(parseComputeImpactInput(body.payload));
        logger.info("impact_computed", {
          requestId,
          impactId: record.impactId,
          scenarioId: record.request.scenarioId,
          stateIndex: record.request.stateIndex,
          importId: record.request.importId,
          mappingVersion: record.request.mappingVersion,
          lineCount: record.report.summary.lineCount,
          costImpactCount: record.report.summary.costImpactCount,
        });
        return jsonResponse(200, { ok: true, impact: record }, requestId);
      }
      if (request.method === "GET") {
        const impacts = await service.listImpacts();
        return jsonResponse(200, { ok: true, impacts }, requestId);
      }
      return methodNotAllowed(requestId, "GET, POST");
    }

    /* GET /v1/impacts/:impactId ------------------------------------------ */

    if (segments.length === 3) {
      if (request.method !== "GET") {
        return methodNotAllowed(requestId, "GET");
      }
      const impactId = decodeSegment(segments[2] ?? "");
      if (impactId === null || impactId.length === 0) {
        return jsonResponse(
          400,
          { ok: false, error: "invalid_impact_id", detail: "impact id is not decodable" },
          requestId,
        );
      }
      validateImpactId(impactId);
      const record = await service.getImpact(impactId);
      if (record === null) {
        return jsonResponse(
          404,
          {
            ok: false,
            error: "impact_not_found",
            detail: `impact ${impactId} does not exist`,
          },
          requestId,
        );
      }
      return jsonResponse(200, { ok: true, impact: record }, requestId);
    }

    // A /v1/impacts/... path with no matching route shape falls through
    // to the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof ImpactError) {
      logger.warn("impact_request_rejected", {
        requestId,
        code: error.code,
        detail: error.detail,
      });
      return impactErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
