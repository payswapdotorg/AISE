/**
 * Artifact storage HTTP surface — transport adapter ONLY (PROD-006).
 *
 * Contract (docs/productization-work-orders.md §PROD-006; the gaps
 * router discipline):
 *
 *   POST   /v1/artifacts
 *       Upload one artifact. The body IS the raw bytes; the metadata rides
 *       in headers (no multipart machinery, no declared ids — the artifact
 *       id is COMPUTED as the sha-256 of the body, never trusted from the
 *       wire):
 *         x-aise-project-id     (required)  project scope
 *         x-aise-kind           (required)  boq|image|video|capture|derived
 *         x-aise-tenant-id      (optional)  tenant scope, default "default"
 *         x-aise-retention      (optional)  demo-fixture|project-evidence|
 *                                           derived-cache (default per kind)
 *         x-aise-filename       (optional; REQUIRED for kind=derived)
 *         x-aise-evidence-ids   (optional)  comma list of evidence content
 *                                           ids — linked BY REFERENCE
 *         x-aise-derivation-ids (optional)  comma list of derivation ids —
 *                                           linked BY REFERENCE
 *         content-type          (required by the type allowlist)
 *       201 stored / 200 idempotent duplicate (same content + same
 *       metadata); 400 invalid shapes + empty body; 413 over the size cap;
 *       415 outside the kind's type allowlist; 409 metadata conflict; 503
 *       typed storage failures (unavailable/quota/auth).
 *   GET    /v1/artifacts?projectId=...
 *       Live metadata rows of one project (sorted by artifactId).
 *   GET    /v1/artifacts/status
 *       Backend descriptor + effective limits — statuses only, never
 *       credentials (the quota/availability surface).
 *   GET    /v1/artifacts/:artifactId
 *       The metadata row (content-addressed id, provenance links,
 *       retention class, upload state).
 *   GET    /v1/artifacts/:artifactId/content
 *       The stored bytes, answered with the stored content-type.
 *   DELETE /v1/artifacts/:artifactId
 *       Tombstone the row + refcounted blob removal (idempotent).
 *
 * ACCESS (the port is the authority): every list/get/delete/upload calls
 * the injected ArtifactAccessPredicate with the acting subject (extracted
 * from the request context IF an `accessContextFromRequest` reader is
 * injected — anonymous by default) BEFORE anything is served. Denials:
 * `anonymous_required` → 401 `unauthorized`, `forbidden` → 403
 * `forbidden` — the stable envelope discipline, cross-project reads
 * included (the record's OWN project is what the predicate judges).
 *
 * HTTP STATUS MAPPING — the single authoritative place for this
 * translation (do not duplicate elsewhere):
 *
 *   invalid shapes / empty body     -> 400 (the invalid_* + empty_body +
 *                                          invalid_media_type +
 *                                          filename_required codes)
 *   not-found codes                 -> 404 (artifact_not_found)
 *   metadata conflicts              -> 409 (artifact_conflict)
 *   size cap                        -> 413 (payload_too_large)
 *   type allowlist                  -> 415 (unsupported_media_type)
 *   storage failures                -> 503 (storage_unavailable |
 *                                          storage_quota_exceeded |
 *                                          storage_auth_failed)
 *
 * Every response carries the `x-request-id` correlation header; wrong
 * methods get 405 with an explicit `allow`; paths that match no artifact
 * route return null so the server's default 404 applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import {
  ANONYMOUS_ARTIFACT_CONTEXT,
  type ArtifactAccessContext,
  type ArtifactAccessPredicate,
} from "./access";
import { ArtifactService, ArtifactServiceError } from "./service";

export interface ArtifactsRouteOptions {
  /** The artifact policy engine over injected storage + metadata + limits. */
  readonly service: ArtifactService;
  /** Structured logger for domain-level request events. */
  readonly logger: Logger;
  /**
   * The access predicate — the ONLY access authority on this surface
   * (PROD-010 wires it to the authenticated principal/tenant context).
   */
  readonly accessPredicate: ArtifactAccessPredicate;
  /**
   * Optional request→subject extraction (PROD-010 wires this to the auth
   * request context). Default: the honest anonymous subject.
   */
  readonly accessContextFromRequest?: (request: Request) => ArtifactAccessContext;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Split a comma-separated id-list header; empty items collapse away. */
function splitIdList(value: string | null): string[] {
  if (value === null) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

/** 400 vs 404 vs 409 vs 413 vs 415 vs 503 — the single authoritative table. */
function artifactsErrorResponse(error: ArtifactServiceError, requestId: string): Response {
  const status =
    error.code === "artifact_not_found"
      ? 404
      : error.code === "artifact_conflict"
        ? 409
        : error.code === "payload_too_large"
          ? 413
          : error.code === "unsupported_media_type"
            ? 415
            : error.code.startsWith("storage_")
              ? 503
              : 400;
  return jsonResponse(
    status,
    { ok: false, error: error.code, detail: error.detail },
    requestId,
  );
}

function accessDeniedResponse(
  reason: "anonymous_required" | "forbidden",
  requestId: string,
): Response {
  return jsonResponse(
    reason === "anonymous_required" ? 401 : 403,
    {
      ok: false,
      error: reason === "anonymous_required" ? "unauthorized" : "forbidden",
      detail:
        reason === "anonymous_required"
          ? "this artifact operation requires an authenticated principal"
          : "the acting principal is not allowed to access this project's artifacts",
    },
    requestId,
  );
}

/* ------------------------------------------------------------------ */
/* Router                                                               */
/* ------------------------------------------------------------------ */

/**
 * Route and answer one request against the artifact storage surface.
 * Returns null when the path is not an artifact route (the server then
 * answers 404). Error mapping happens HERE only (see the module header).
 */
export async function handleArtifactsRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: ArtifactsRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "artifacts") {
    return null;
  }
  const { service, logger } = options;
  const context = options.accessContextFromRequest?.(request) ?? ANONYMOUS_ARTIFACT_CONTEXT;
  const authorize = (action: Parameters<ArtifactAccessPredicate>[1], projectId: string) =>
    options.accessPredicate(context, action, projectId);

  try {
    /* POST/GET /v1/artifacts -------------------------------------------- */

    if (segments.length === 2) {
      if (request.method === "POST") {
        const projectId = request.headers.get("x-aise-project-id") ?? "";
        const decision = await authorize("upload", projectId);
        if (decision.outcome === "deny") {
          return accessDeniedResponse(decision.reason, requestId);
        }
        const bytes = new Uint8Array(await request.arrayBuffer());
        const result = await service.uploadArtifact({
          projectId,
          tenantId: request.headers.get("x-aise-tenant-id") ?? "default",
          kind: request.headers.get("x-aise-kind") ?? "",
          retention: request.headers.get("x-aise-retention") ?? undefined,
          filename: request.headers.get("x-aise-filename"),
          contentTypeHeader: request.headers.get("content-type"),
          bytes,
          evidenceIds: splitIdList(request.headers.get("x-aise-evidence-ids")),
          derivationIds: splitIdList(request.headers.get("x-aise-derivation-ids")),
        });
        logger.info("artifact_uploaded", {
          requestId,
          projectId: result.record.projectId,
          artifactId: result.record.artifactId,
          kind: result.record.kind,
          byteSize: result.record.byteSize,
          duplicate: result.outcome === "duplicate",
        });
        return jsonResponse(
          result.outcome === "stored" ? 201 : 200,
          { ok: true, artifact: result.record, duplicate: result.outcome === "duplicate" },
          requestId,
        );
      }
      if (request.method === "GET") {
        const projectId = url.searchParams.get("projectId") ?? "";
        const decision = await authorize("list", projectId);
        if (decision.outcome === "deny") {
          return accessDeniedResponse(decision.reason, requestId);
        }
        const artifacts = await service.listArtifacts(projectId);
        return jsonResponse(200, { ok: true, artifacts }, requestId);
      }
      return methodNotAllowed(requestId, "GET, POST");
    }

    /* GET /v1/artifacts/status ------------------------------------------ */

    if (segments.length === 3 && segments[2] === "status") {
      if (request.method !== "GET") {
        return methodNotAllowed(requestId, "GET");
      }
      return jsonResponse(200, { ok: true, ...service.status() }, requestId);
    }

    /* /v1/artifacts/:artifactId[/:content] ------------------------------ */

    const artifactId = decodeSegment(segments[2] ?? "");
    if (artifactId === null || artifactId.length === 0) {
      return jsonResponse(
        400,
        { ok: false, error: "invalid_artifact_id", detail: "artifact id is not decodable" },
        requestId,
      );
    }
    // The record's OWN project scope is what the predicate judges — it
    // rides the same x-aise-project-id header as the upload.
    const projectId = request.headers.get("x-aise-project-id") ?? "";

    if (segments.length === 3) {
      if (request.method === "GET") {
        const decision = await authorize("read", projectId);
        if (decision.outcome === "deny") {
          return accessDeniedResponse(decision.reason, requestId);
        }
        const record = await service.getArtifact(projectId, artifactId);
        if (record === null) {
          return artifactsErrorResponse(
            new ArtifactServiceError(
              "artifact_not_found",
              `no live artifact row for content address ${artifactId.slice(0, 12)}… in this project`,
            ),
            requestId,
          );
        }
        return jsonResponse(200, { ok: true, artifact: record }, requestId);
      }
      if (request.method === "DELETE") {
        const decision = await authorize("delete", projectId);
        if (decision.outcome === "deny") {
          return accessDeniedResponse(decision.reason, requestId);
        }
        const result = await service.deleteArtifact(projectId, artifactId);
        logger.info("artifact_deleted", {
          requestId,
          projectId: result.record.projectId,
          artifactId: result.record.artifactId,
        });
        return jsonResponse(200, { ok: true, artifact: result.record }, requestId);
      }
      return methodNotAllowed(requestId, "GET, DELETE");
    }

    /* GET /v1/artifacts/:artifactId/content ----------------------------- */

    if (segments.length === 4 && (decodeSegment(segments[3] ?? "") === "content")) {
      if (request.method !== "GET") {
        return methodNotAllowed(requestId, "GET");
      }
      const decision = await authorize("read", projectId);
      if (decision.outcome === "deny") {
        return accessDeniedResponse(decision.reason, requestId);
      }
      const record = await service.getArtifact(projectId, artifactId);
      if (record === null) {
        return artifactsErrorResponse(
          new ArtifactServiceError(
            "artifact_not_found",
            `no live artifact row for content address ${artifactId.slice(0, 12)}… in this project`,
          ),
          requestId,
        );
      }
      const bytes = await service.readArtifactBytes(record);
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: {
          "content-type": record.contentType,
          "content-length": String(record.byteSize),
          "x-artifact-id": record.artifactId,
          "x-request-id": requestId,
        },
      });
    }

    return null;
  } catch (error) {
    if (error instanceof ArtifactServiceError) {
      logger.warn("artifact_request_rejected", {
        requestId,
        code: error.code,
        detail: error.detail,
      });
      return artifactsErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
