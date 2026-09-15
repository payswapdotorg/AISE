/**
 * AISE-018 — Adaptive evidence-gap engine HTTP surface (transport
 * adapter ONLY).
 *
 * Contract (spec/work-orders.md §018; R3; this surface never judges truth:
 * it applies typed inputs through the deterministic gap-analysis service
 * and reads back canonical derived records):
 *
 *   POST /v1/gaps
 *       Run one adaptive gap analysis. Body
 *       `{ analysisId, taskRef: { projectId, versionId, profileId },
 *       annotations?: [{ targetNodeId, observationStatus:
 *       UNKNOWN|NOT_OBSERVED|OCCLUDED, evidenceIds }],
 *       uncertaintyAnnotations?: [{ nodeId, propertyKey, sigma, unit,
 *       basis? }], taskFocus?: [{ subjectNodeId, impactWeight }],
 *       effortContext?: { byMethod: { <METHOD>: [0,1] } },
 *       methodPreferences?: { measureProperty?, assertProperty?,
 *       observeNode?, confirmProperty?, verifyCaptureStatus?,
 *       resolveOcclusion? }, deviceCapabilityFacts?: { capabilityFacts:
 *       { ... } } }` — the assurance profile and the pinned Reality Graph
 *       version resolve READ-ONLY; the evidence graph state resolves
 *       READ-ONLY. Unresolvable profiles are 422 `unknown_profile`;
 *       unresolvable reality versions are 422 `unknown_reality_version`;
 *       phantom evidence references are 422 `unknown_evidence_ref` /
 *       `dangling_evidence_ref` (naming the ids); annotations that
 *       contradict the authoritative version are 422
 *       `annotation_contradicts_reality`; id reuse is 422
 *       `analysis_exists`.
 *   GET  /v1/gaps
 *       List analysis summaries (readiness level is the readiness
 *       authority's own consumed verdict, clearly labeled).
 *   GET  /v1/gaps/:id
 *       Full derived record (gaps with kinds/states/classes, ranked
 *       candidates with the four named score components and their
 *       derivations, the consumed readiness report VERBATIM, the input
 *       digest, the append-only history).
 *
 * HTTP STATUS MAPPING — the single authoritative place for this
 * translation (mirrors the comparison/execution router discipline; do
 * not duplicate elsewhere):
 *
 *   not-found codes  -> 404 (analysis_not_found)
 *   invalid ids      -> 400 (invalid_analysis_id | invalid_project_id |
 *                          invalid_version_id | malformed_json)
 *   everything else  -> 422 (typed validation/semantic codes listed above
 *                          plus invalid_* payload codes and the corrupted
 *                          persisted-record guard invalid_analysis_record)
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`); wrong methods get 405 with an explicit `allow`; paths
 * that match no gap route return null so the server's default 404
 * applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { GapAnalysisError, parseRunGapAnalysisInput, validateAnalysisId } from "./model";
import { GapAnalysisService } from "./service";

export interface GapsRouteOptions {
  /** The adaptive gap-analysis policy engine over an injected store + clock + read-only resolvers. */
  readonly service: GapAnalysisService;
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
function gapsErrorResponse(error: GapAnalysisError, requestId: string): Response {
  const status =
    error.code === "analysis_not_found"
      ? 404
      : error.code === "invalid_analysis_id" ||
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
 * Route and answer one request against the adaptive evidence-gap
 * surface. Returns null when the path is not a gap route (the server
 * then answers 404). Error mapping happens HERE only (see module
 * header).
 */
export async function handleGapsRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: GapsRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "gaps") {
    return null;
  }
  const { service, logger } = options;

  try {
    /* POST/GET /v1/gaps -------------------------------------------------- */

    if (segments.length === 2) {
      if (request.method === "POST") {
        const body = await readJsonBody(request);
        if (!body.ok) {
          return malformedJson(requestId);
        }
        const record = await service.runGapAnalysis(parseRunGapAnalysisInput(body.payload));
        logger.info("gap_analysis_recorded", {
          requestId,
          analysisId: record.analysisId,
          projectId: record.taskRef.projectId,
          versionId: record.taskRef.versionId,
          readinessLevel: record.readinessReport.readiness,
          totalGaps: record.stats.totalGaps,
          totalCandidates: record.stats.totalCandidates,
          topCandidateId: record.stats.topCandidateId,
        });
        return jsonResponse(200, { ok: true, analysis: record }, requestId);
      }
      if (request.method === "GET") {
        const analyses = await service.listAnalyses();
        return jsonResponse(200, { ok: true, analyses }, requestId);
      }
      return methodNotAllowed(requestId, "GET, POST");
    }

    /* GET /v1/gaps/:id ---------------------------------------------------- */

    const analysisId = decodeSegment(segments[2] ?? "");
    if (analysisId === null || analysisId.length === 0) {
      return jsonResponse(
        400,
        { ok: false, error: "invalid_analysis_id", detail: "analysis id is not decodable" },
        requestId,
      );
    }

    if (segments.length === 3) {
      if (request.method !== "GET") {
        return methodNotAllowed(requestId, "GET");
      }
      try {
        validateAnalysisId(analysisId);
      } catch (error) {
        if (error instanceof GapAnalysisError) {
          return gapsErrorResponse(error, requestId);
        }
        throw error;
      }
      const record = await service.getAnalysis(analysisId);
      if (record === null) {
        return jsonResponse(
          404,
          {
            ok: false,
            error: "analysis_not_found",
            detail: `analysis ${analysisId} does not exist`,
          },
          requestId,
        );
      }
      logger.info("gap_analysis_read", {
        requestId,
        analysisId,
        totalGaps: record.stats.totalGaps,
        totalCandidates: record.stats.totalCandidates,
      });
      return jsonResponse(200, { ok: true, analysis: record }, requestId);
    }

    // A /v1/gaps/... path with no matching route shape falls through to
    // the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof GapAnalysisError) {
      logger.warn("gap_analysis_request_rejected", {
        requestId,
        code: error.code,
        detail: error.detail,
      });
      return gapsErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
