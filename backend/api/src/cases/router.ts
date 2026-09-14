/**
 * AISE-025 — Engineering Case HTTP surface (transport adapter ONLY).
 *
 * Contract (spec/work-orders.md §025; R10/R12; architecture-lock "Truth and
 * uncertainty" — this surface never judges truth: it applies typed inputs
 * through the deterministic case service and reads back canonical state):
 *
 *   POST /v1/cases                                        create a case
 *       Body `{ caseId, title, links? }` — caller-supplied stable id.
 *       Duplicate ids are 422 `case_exists`.
 *   GET  /v1/cases                                        list summaries
 *   GET  /v1/cases/:id                                    full case record
 *       (facts in `observations`, inferences in `hypotheses` — separate)
 *   POST /v1/cases/:id/observations                       add an OBSERVED fact
 *       Body `{ statement, evidenceIds, measurementRefs? }` — evidenceIds
 *       REQUIRED non-empty (`observation_without_evidence`); a claimed
 *       epistemicStatus other than OBSERVED is 422 `invalid_epistemic_status`.
 *   POST /v1/cases/:id/hypotheses                         add an interpretation
 *       Body `{ statement, epistemicStatus: INFERRED|PROPOSED,
 *              supportingObservationIds, contradictingObservationIds,
 *              confidence }` — unknown observation refs are 422
 *       `unknown_observation_ref`.
 *   POST /v1/cases/:id/missing-evidence                   declare a gap
 *       Body `{ description, kind, wouldResolve, requestedMethod? }`.
 *   POST /v1/cases/:id/missing-evidence/:missingId/collect
 *       Mark collected — does NOT auto-create an observation (the human/
 *       agent must still record what was observed, with evidence).
 *   POST /v1/cases/:id/missing-evidence/:missingId/waive
 *       Body `{ note }` REQUIRED — a waiver is never silent
 *       (`waiver_note_required`).
 *   POST /v1/cases/:id/review                             submit human review
 *       Body `{ reviewer, decision, note }`; the service pins the evidence
 *       state digest at review time.
 *   POST /v1/cases/:id/resolve                            resolve the case
 *       Requires an approved review (`review_required_for_resolution`,
 *       `review_not_approved`); resolved cases refuse further mutations
 *       (`already_resolved`).
 *
 * HTTP STATUS MAPPING — the single authoritative place for this translation
 * (mirrors capture/reality router discipline; do not duplicate elsewhere):
 *
 *   not-found codes  -> 404 (case_not_found | missing_evidence_not_found)
 *   invalid_case_id  -> 400 (path/body id shape; malformed JSON -> 400
 *                          malformed_json)
 *   everything else  -> 422 (typed validation/semantic codes listed above
 *                          plus case_exists, invalid_* and the corrupted
 *                          persisted-record guard invalid_case_record)
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`); wrong methods get 405 with an explicit `allow`; paths
 * that match no case route return null so the server's default 404 applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import {
  CaseError,
  parseAddHypothesisInput,
  parseAddMissingEvidenceInput,
  parseAddObservationInput,
  parseCreateCaseInput,
  parseSubmitReviewInput,
  parseWaiveNoteInput,
  validateCaseId,
} from "./model";
import { CaseService } from "./service";

export interface CasesRouteOptions {
  /** The Engineering Case policy engine over an injected store + clock. */
  readonly service: CaseService;
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
function caseErrorResponse(error: CaseError, requestId: string): Response {
  const status =
    error.code === "case_not_found" || error.code === "missing_evidence_not_found"
      ? 404
      : error.code === "invalid_case_id"
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
 * Route and answer one request against the Engineering Case surface.
 * Returns null when the path is not a case route (the server then answers
 * 404). Error mapping happens HERE only (see module header).
 */
export async function handleCasesRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: CasesRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "cases") {
    return null;
  }
  const { service, logger } = options;

  try {
    /* POST/GET /v1/cases ------------------------------------------------ */

    if (segments.length === 2) {
      if (request.method === "POST") {
        const body = await readJsonBody(request);
        if (!body.ok) {
          return malformedJson(requestId);
        }
        const input = parseCreateCaseInput(body.payload);
        const record = await service.createCase(input);
        logger.info("case_created", { requestId, caseId: record.caseId });
        return jsonResponse(200, { ok: true, case: record }, requestId);
      }
      if (request.method === "GET") {
        const cases = await service.listCases();
        return jsonResponse(200, { ok: true, cases }, requestId);
      }
      return methodNotAllowed(requestId, "GET, POST");
    }

    const caseId = decodeSegment(segments[2] ?? "");
    if (caseId === null || caseId.length === 0) {
      return jsonResponse(
        400,
        { ok: false, error: "invalid_case_id", detail: "case id is not decodable" },
        requestId,
      );
    }
    validateCaseId(caseId);

    /* GET /v1/cases/:id -------------------------------------------------- */

    if (segments.length === 3) {
      if (request.method !== "GET") {
        return methodNotAllowed(requestId, "GET");
      }
      const record = await service.getCase(caseId);
      if (record === null) {
        return jsonResponse(
          404,
          { ok: false, error: "case_not_found", detail: `case ${caseId} does not exist` },
          requestId,
        );
      }
      return jsonResponse(200, { ok: true, case: record }, requestId);
    }

    const action = segments[3] ?? "";

    /* POST /v1/cases/:id/observations ------------------------------------ */

    if (segments.length === 4 && action === "observations") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const observation = await service.addObservation(
        caseId,
        parseAddObservationInput(body.payload),
      );
      logger.info("case_observation_recorded", { requestId, caseId });
      return jsonResponse(200, { ok: true, observation }, requestId);
    }

    /* POST /v1/cases/:id/hypotheses -------------------------------------- */

    if (segments.length === 4 && action === "hypotheses") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const hypothesis = await service.addHypothesis(
        caseId,
        parseAddHypothesisInput(body.payload),
      );
      logger.info("case_hypothesis_recorded", { requestId, caseId });
      return jsonResponse(200, { ok: true, hypothesis }, requestId);
    }

    /* POST /v1/cases/:id/missing-evidence -------------------------------- */

    if (segments.length === 4 && action === "missing-evidence") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const missing = await service.addMissingEvidence(
        caseId,
        parseAddMissingEvidenceInput(body.payload),
      );
      logger.info("case_missing_evidence_recorded", { requestId, caseId, missingId: missing.missingId });
      return jsonResponse(200, { ok: true, missingEvidence: missing }, requestId);
    }

    /* POST /v1/cases/:id/missing-evidence/:missingId/collect|waive ------- */

    if (segments.length === 6 && action === "missing-evidence") {
      const verb = segments[5] ?? "";
      if (verb !== "collect" && verb !== "waive") {
        return null; // unknown sub-route shape -> server 404
      }
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const missingId = decodeSegment(segments[4] ?? "");
      if (missingId === null || missingId.length === 0) {
        return jsonResponse(
          400,
          { ok: false, error: "invalid_body", detail: "missing evidence id is not decodable" },
          requestId,
        );
      }
      if (verb === "collect") {
        const missing = await service.collectEvidence(caseId, missingId);
        logger.info("case_missing_evidence_collected", { requestId, caseId, missingId });
        return jsonResponse(200, { ok: true, missingEvidence: missing }, requestId);
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const missing = await service.waiveEvidence(caseId, missingId, parseWaiveNoteInput(body.payload));
      logger.info("case_missing_evidence_waived", { requestId, caseId, missingId });
      return jsonResponse(200, { ok: true, missingEvidence: missing }, requestId);
    }

    /* POST /v1/cases/:id/review ------------------------------------------ */

    if (segments.length === 4 && action === "review") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const review = await service.submitReview(caseId, parseSubmitReviewInput(body.payload));
      logger.info("case_review_submitted", {
        requestId,
        caseId,
        decision: review.decision,
        reviewer: review.reviewer,
      });
      return jsonResponse(200, { ok: true, review }, requestId);
    }

    /* POST /v1/cases/:id/resolve ----------------------------------------- */

    if (segments.length === 4 && action === "resolve") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const record = await service.resolveCase(caseId);
      logger.info("case_resolved", { requestId, caseId });
      return jsonResponse(200, { ok: true, case: record }, requestId);
    }

    // A /v1/cases/... path with no matching route shape falls through to the
    // server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof CaseError) {
      logger.warn("case_request_rejected", {
        requestId,
        code: error.code,
        detail: error.detail,
      });
      return caseErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
