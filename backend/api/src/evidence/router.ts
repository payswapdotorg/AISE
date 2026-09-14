/**
 * Evidence/source HTTP surface (AISE-008) — the transport adapter for the
 * policy engine (`evidence/service.ts`).
 *
 * Contract (spec/work-orders.md §008; spec/architecture-lock.md — this
 * surface persists, pins, closes and invalidates ONLY: no readiness scoring,
 * no truth judgement, no interpretation of evidence content):
 *
 *   POST /v1/evidence
 *       Register one `Evidence` document (family `evidence`,
 *       @aise/shared-contracts), validated with `decodeEvidenceStrict`.
 *       Identical re-registration is idempotent (outcome IDEMPOTENT); a
 *       differing re-registration is 422 `evidence_conflict`; unpinned
 *       content (when a resolver is wired) is 422 `content_not_pinned`.
 *
 *   GET  /v1/evidence?includeInvalidated=false
 *       List registered evidence. Invalidated records are EXCLUDED by
 *       default; `includeInvalidated=true` includes them (invalidated ≠
 *       deleted — full read views stay reachable at any time).
 *
 *   POST /v1/evidence/:contentId/invalidation
 *       Append one invalidation `{ reason }` to an immutable record. The
 *       response is the updated full read view. Double invalidation is 422
 *       `already_invalidated`; unknown content ids are 404.
 *
 *   POST /v1/evidence/provenance-links
 *       Append one `ProvenanceLink` (exact duplicates are idempotent no-ops).
 *       Closure violations are 422 `provenance_closure` naming the id.
 *
 *   POST /v1/evidence/derivations
 *       Record one `Derivation` (identical retries are idempotent no-ops).
 *       Closure violations are 422 `provenance_closure`; cycles are 422
 *       `derivation_cycle`; a reused derivationId with different content is
 *       422 `derivation_conflict`.
 *
 *   GET  /v1/evidence/:contentId
 *       Full read view: record, invalidation state, both-direction
 *       provenance links, derivations (inputs-of / derived-from) and
 *       upstream invalidations. Unknown ids are 404.
 *
 * HTTP STATUS MAPPING — the single authoritative place for this translation
 * (mirrors capture/router.ts discipline; do not duplicate it elsewhere):
 *
 *   service policy codes     -> 422 (evidence_conflict | content_not_pinned |
 *                                  already_invalidated | provenance_closure |
 *                                  derivation_cycle | derivation_conflict),
 *                                  404 (evidence_not_found),
 *                                  400 (invalid_reason)
 *   contract decode failures -> 400 (version_unsupported | schema_invalid)
 *   non-JSON bodies          -> 400 (malformed_json)
 *   malformed path ids/query -> 400 (invalid_content_id | invalid_query)
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`); wrong methods get 405 with an explicit `allow`; paths that
 * match no evidence route return null so the server's default 404 applies.
 * The service may be injected directly or as a lazy factory (resolved only
 * after the path is recognized as an evidence route — see server.ts wiring,
 * which constructs the default service on first evidence traffic).
 */

import {
  ContractDecodeError,
  ContractVersionMismatchError,
  contentIdSchema,
  textSchema,
  type Derivation,
  type Evidence,
  type ProvenanceLink,
} from "@aise/shared-contracts";
import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import {
  EvidenceServiceError,
  type EvidenceReadView,
  type EvidenceService,
} from "./service";

/* ------------------------------------------------------------------ */
/* Route options                                                       */
/* ------------------------------------------------------------------ */

export interface EvidenceRouteOptions {
  /**
   * The evidence service, or a lazy factory for it. A factory is resolved
   * ONLY after the path is recognized as an evidence route, so deployments
   * without evidence traffic never construct the service.
   */
  readonly service: EvidenceService | (() => EvidenceService);
  /** Structured logger for domain-level request events. */
  readonly logger: Logger;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

/** One schema-validation issue, summarized deterministically (no values). */
interface IssueSummary {
  readonly path: string;
  readonly code: string;
}

function summarizeIssues(
  issues: ReadonlyArray<{ readonly path: ReadonlyArray<string | number>; readonly code: string }>,
): IssueSummary[] {
  return issues.map((issue) => ({
    path: issue.path.length === 0 ? "<root>" : issue.path.map(String).join("/"),
    code: issue.code,
  }));
}

/** 200 body for a full read view (flattened; the view IS the response). */
function readViewBody(view: EvidenceReadView): Record<string, unknown> {
  return {
    ok: true,
    evidence: view.evidence,
    invalidation: view.invalidation,
    provenance: view.provenance,
    derivations: view.derivations,
    upstreamInvalidations: view.upstreamInvalidations,
  };
}

/** Map a typed service error to its single authoritative HTTP response. */
function serviceErrorResponse(
  error: { readonly code: string; readonly detail: string },
  requestId: string,
): Response {
  const status =
    error.code === "evidence_not_found" ? 404 : error.code === "invalid_reason" ? 400 : 422;
  return jsonResponse(
    status,
    { ok: false, error: error.code, detail: error.detail },
    requestId,
  );
}

/** Map typed contract-decode failures to 400 responses. */
function contractErrorResponse(error: unknown, requestId: string): Response | null {
  if (error instanceof ContractVersionMismatchError) {
    return jsonResponse(
      400,
      {
        ok: false,
        error: "version_unsupported",
        detail:
          `contract version mismatch: expected ${error.expected} (or same major), ` +
          `received ${error.received}`,
      },
      requestId,
    );
  }
  if (error instanceof ContractDecodeError) {
    return jsonResponse(
      400,
      {
        ok: false,
        error: "schema_invalid",
        detail: `request body does not satisfy the ${error.objectName} wire contract`,
        issues: summarizeIssues(error.issues),
      },
      requestId,
    );
  }
  return null;
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

function malformedJsonResponse(requestId: string): Response {
  return jsonResponse(
    400,
    { ok: false, error: "malformed_json", detail: "request body is not valid JSON" },
    requestId,
  );
}

/** Parse the invalidation body: exactly `{ reason }` with bounded text. */
function parseInvalidationBody(
  payload: unknown,
): { ok: true; reason: string } | { ok: false; issues: IssueSummary[] } {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, issues: [{ path: "<root>", code: "invalid_type" }] };
  }
  const keys = Object.keys(payload as Record<string, unknown>);
  const reason = (payload as Record<string, unknown>)["reason"];
  if (keys.length !== 1 || reason === undefined) {
    return {
      ok: false,
      issues: [{ path: "<root>", code: "unrecognized_keys" }],
    };
  }
  const parsed = textSchema.safeParse(reason);
  if (!parsed.success) {
    return {
      ok: false,
      issues: summarizeIssues(parsed.error.issues),
    };
  }
  return { ok: true, reason: parsed.data };
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

/**
 * Route and answer one request against the evidence surface. Returns null
 * when the path is not an evidence route (the server then answers 404).
 * Error mapping happens HERE only (see module header).
 */
export async function handleEvidenceRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: EvidenceRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "evidence") {
    return null;
  }
  try {
    return await dispatchEvidenceRoute(request, url, segments, requestId, options);
  } catch (error) {
    if (error instanceof EvidenceServiceError) {
      options.logger.warn("evidence_policy_rejection", {
        requestId,
        code: error.code,
      });
      return serviceErrorResponse(error, requestId);
    }
    const contract = contractErrorResponse(error, requestId);
    if (contract !== null) {
      options.logger.warn("evidence_bad_request", { requestId });
      return contract;
    }
    throw error;
  }
}

async function dispatchEvidenceRoute(
  request: Request,
  url: URL,
  segments: string[],
  requestId: string,
  options: EvidenceRouteOptions,
): Promise<Response | null> {
  const service =
    typeof options.service === "function" ? options.service() : options.service;
  const { logger } = options;

  /* POST /v1/evidence  |  GET /v1/evidence ------------------------------ */

  if (segments.length === 2) {
    if (request.method === "POST") {
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJsonResponse(requestId);
      }
      const result = await service.registerEvidence(body.payload as Evidence);
      logger.info("evidence_register", {
        requestId,
        contentId: result.evidence.contentId,
        outcome: result.kind === "registered" ? "REGISTERED" : "IDEMPOTENT",
      });
      return jsonResponse(
        200,
        {
          ok: true,
          outcome: result.kind === "registered" ? "REGISTERED" : "IDEMPOTENT",
          evidence: result.evidence,
          invalidation: result.invalidation,
        },
        requestId,
      );
    }
    if (request.method === "GET") {
      const includeInvalidated = url.searchParams.get("includeInvalidated");
      if (
        includeInvalidated !== null &&
        includeInvalidated !== "true" &&
        includeInvalidated !== "false"
      ) {
        return jsonResponse(
          400,
          {
            ok: false,
            error: "invalid_query",
            detail: 'includeInvalidated must be exactly "true" or "false"',
          },
          requestId,
        );
      }
      const items = await service.listEvidence({
        includeInvalidated: includeInvalidated === "true",
      });
      logger.info("evidence_list", {
        requestId,
        count: items.length,
        includeInvalidated: includeInvalidated === "true",
      });
      return jsonResponse(200, { ok: true, evidence: items }, requestId);
    }
    return methodNotAllowed(requestId, "GET, POST");
  }

  /* POST /v1/evidence/provenance-links ----------------------------------- */

  if (segments.length === 3 && segments[2] === "provenance-links") {
    if (request.method !== "POST") {
      return methodNotAllowed(requestId, "POST");
    }
    const body = await readJsonBody(request);
    if (!body.ok) {
      return malformedJsonResponse(requestId);
    }
    const result = await service.addProvenanceLink(body.payload as ProvenanceLink);
    logger.info("evidence_provenance_link", {
      requestId,
      subjectKind: result.link.subjectKind,
      evidenceContentId: result.link.evidenceContentId,
      role: result.link.role,
      outcome: result.kind === "linked" ? "LINKED" : "DUPLICATE",
    });
    return jsonResponse(
      200,
      {
        ok: true,
        outcome: result.kind === "linked" ? "LINKED" : "DUPLICATE",
        link: result.link,
      },
      requestId,
    );
  }

  /* POST /v1/evidence/derivations ---------------------------------------- */

  if (segments.length === 3 && segments[2] === "derivations") {
    if (request.method !== "POST") {
      return methodNotAllowed(requestId, "POST");
    }
    const body = await readJsonBody(request);
    if (!body.ok) {
      return malformedJsonResponse(requestId);
    }
    const result = await service.recordDerivation(body.payload as Derivation);
    logger.info("evidence_derivation", {
      requestId,
      derivationId: result.derivation.derivationId,
      outputContentId: result.derivation.outputContentId,
      inputs: result.derivation.inputEvidenceContentIds.length,
      outcome: result.kind === "recorded" ? "RECORDED" : "DUPLICATE",
    });
    return jsonResponse(
      200,
      {
        ok: true,
        outcome: result.kind === "recorded" ? "RECORDED" : "DUPLICATE",
        derivation: result.derivation,
      },
      requestId,
    );
  }

  /* POST /v1/evidence/:contentId/invalidation ---------------------------- */

  if (segments.length === 4 && segments[3] === "invalidation") {
    if (request.method !== "POST") {
      return methodNotAllowed(requestId, "POST");
    }
    const contentId = segments[2] ?? "";
    if (!contentIdSchema.safeParse(contentId).success) {
      return jsonResponse(400, { ok: false, error: "invalid_content_id" }, requestId);
    }
    const body = await readJsonBody(request);
    if (!body.ok) {
      return malformedJsonResponse(requestId);
    }
    const parsed = parseInvalidationBody(body.payload);
    if (!parsed.ok) {
      return jsonResponse(
        400,
        {
          ok: false,
          error: "schema_invalid",
          detail: 'request body must be an object with exactly one key "reason" (bounded text)',
          issues: parsed.issues,
        },
        requestId,
      );
    }
    const view = await service.invalidateEvidence(contentId, parsed.reason);
    logger.info("evidence_invalidate", { requestId, contentId });
    return jsonResponse(200, readViewBody(view), requestId);
  }

  /* GET /v1/evidence/:contentId ------------------------------------------ */

  if (segments.length === 3) {
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    const contentId = segments[2] ?? "";
    if (!contentIdSchema.safeParse(contentId).success) {
      return jsonResponse(400, { ok: false, error: "invalid_content_id" }, requestId);
    }
    const view = await service.getEvidence(contentId);
    if (view === null) {
      return jsonResponse(404, { ok: false, error: "evidence_not_found" }, requestId);
    }
    logger.info("evidence_read", {
      requestId,
      contentId,
      invalidated: view.invalidation !== null,
    });
    return jsonResponse(200, readViewBody(view), requestId);
  }

  // A /v1/evidence/... path with no matching route shape falls through to
  // the server-wide 404.
  return null;
}
