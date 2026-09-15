/**
 * AISE-032 — Reality-vs-design comparison HTTP surface (transport
 * adapter ONLY).
 *
 * Contract (spec/work-orders.md §032; R9 — discrepancies are explicit,
 * evidence-linked and uncertainty-aware; this surface never judges truth:
 * it applies typed inputs through the deterministic comparison service
 * and reads back canonical records):
 *
 *   POST /v1/comparisons
 *       Run one reality-vs-design comparison. Body
 *       `{ comparisonId, realityRef: { projectId, versionId },
 *       designReference: { sourceOfRecord: { systemClass,
 *       systemInstanceId, sourceRecordId, revision, retrievedAt }, items:
 *       [{ designItemId, label?, targetNodeId?, properties: [{ key,
 *       value, unit? }], geometry?, sourceDetail? }] }, tolerances?,
 *       coverage? }` — the pinned Reality Graph version is resolved
 *       READ-ONLY; the design reference is carried VERBATIM. Unresolvable
 *       reality refs are 422 `unknown_reality_version`; unsubstantiated
 *       discrepancies are 422 `discrepancy_without_evidence`; coverage
 *       annotations that contradict the authoritative version are 422
 *       `coverage_contradicts_reality`; id reuse is 422
 *       `comparison_exists`.
 *   GET  /v1/comparisons
 *       List comparison summaries.
 *   GET  /v1/comparisons/:id
 *       Full comparison record (entries with statuses, evidence links,
 *       verbatim design reference, input digest, append-only history).
 *
 * HTTP STATUS MAPPING — the single authoritative place for this
 * translation (mirrors the execution/cases router discipline; do not
 * duplicate elsewhere):
 *
 *   not-found codes  -> 404 (comparison_not_found)
 *   invalid ids      -> 400 (invalid_comparison_id | invalid_project_id |
 *                          invalid_version_id | malformed_json)
 *   everything else  -> 422 (typed validation/semantic codes listed above
 *                          plus comparison_without_items,
 *                          duplicate_design_item, unknown_coverage_target,
 *                          unknown_evidence_ref, coverage_without_evidence,
 *                          invalid_* payload codes and the corrupted
 *                          persisted-record guard invalid_comparison_record)
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`); wrong methods get 405 with an explicit `allow`; paths
 * that match no comparison route return null so the server's default 404
 * applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import {
  ComparisonError,
  parseRunComparisonInput,
  validateComparisonId,
} from "./model";
import { ComparisonService } from "./service";

export interface ComparisonRouteOptions {
  /** The reality-vs-design comparison policy engine over an injected store + clock + read-only resolvers. */
  readonly service: ComparisonService;
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
function comparisonErrorResponse(error: ComparisonError, requestId: string): Response {
  const status =
    error.code === "comparison_not_found"
      ? 404
      : error.code === "invalid_comparison_id" ||
          error.code === "invalid_project_id" ||
          error.code === "invalid_version_id"
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
 * Route and answer one request against the reality-vs-design comparison
 * surface. Returns null when the path is not a comparison route (the
 * server then answers 404). Error mapping happens HERE only (see module
 * header).
 */
export async function handleComparisonRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: ComparisonRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "comparisons") {
    return null;
  }
  const { service, logger } = options;

  try {
    /* POST/GET /v1/comparisons ------------------------------------------ */

    if (segments.length === 2) {
      if (request.method === "POST") {
        const body = await readJsonBody(request);
        if (!body.ok) {
          return malformedJson(requestId);
        }
        const record = await service.runComparison(parseRunComparisonInput(body.payload));
        logger.info("comparison_recorded", {
          requestId,
          comparisonId: record.comparisonId,
          projectId: record.realityRef.projectId,
          versionId: record.realityRef.versionId,
          totalEntries: record.stats.totalEntries,
          discrepancies: record.stats.discrepancies,
        });
        return jsonResponse(200, { ok: true, comparison: record }, requestId);
      }
      if (request.method === "GET") {
        const comparisons = await service.listComparisons();
        return jsonResponse(200, { ok: true, comparisons }, requestId);
      }
      return methodNotAllowed(requestId, "GET, POST");
    }

    /* GET /v1/comparisons/:id -------------------------------------------- */

    const comparisonId = decodeSegment(segments[2] ?? "");
    if (comparisonId === null || comparisonId.length === 0) {
      return jsonResponse(
        400,
        { ok: false, error: "invalid_comparison_id", detail: "comparison id is not decodable" },
        requestId,
      );
    }

    if (segments.length === 3) {
      if (request.method !== "GET") {
        return methodNotAllowed(requestId, "GET");
      }
      try {
        validateComparisonId(comparisonId);
      } catch (error) {
        if (error instanceof ComparisonError) {
          return comparisonErrorResponse(error, requestId);
        }
        throw error;
      }
      const record = await service.getComparison(comparisonId);
      if (record === null) {
        return jsonResponse(
          404,
          {
            ok: false,
            error: "comparison_not_found",
            detail: `comparison ${comparisonId} does not exist`,
          },
          requestId,
        );
      }
      logger.info("comparison_read", {
        requestId,
        comparisonId,
        totalEntries: record.stats.totalEntries,
      });
      return jsonResponse(200, { ok: true, comparison: record }, requestId);
    }

    // A /v1/comparisons/... path with no matching route shape falls
    // through to the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof ComparisonError) {
      logger.warn("comparison_request_rejected", {
        requestId,
        code: error.code,
        detail: error.detail,
      });
      return comparisonErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
