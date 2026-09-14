/**
 * HTTP request handling for the AISE backend API.
 *
 * Contract (AISE-001 health/readiness plumbing; AISE-004 capture ingestion):
 *
 *   GET  /healthz  -> 200 {"ok":true,"service":"aise-api","version":"<pkg version>"}
 *   GET  /readyz   -> 200 when the environment (config) is valid, 503 otherwise
 *   POST /v1/capture/assets/:contentId  -> raw content-addressed asset upload
 *   POST /v1/capture/sync               -> SyncBatch ingestion, SyncAck reply
 *   GET  /v1/capture/sessions/:sessionId -> stored session projection
 *   POST /v1/evidence                     -> register immutable evidence (AISE-008)
 *   GET  /v1/evidence?includeInvalidated  -> list registered evidence
 *   GET  /v1/evidence/:contentId          -> full evidence read view
 *   POST /v1/evidence/:contentId/invalidation -> append an invalidation
 *   POST /v1/evidence/provenance-links    -> append a provenance link
 *   POST /v1/evidence/derivations         -> record a derivation
 *
 * The capture routes are implemented by `capture/router.ts` over the
 * `capture/gateway.ts` policy engine and an injected `CaptureStore`; the
 * evidence routes by `evidence/router.ts` over `evidence/service.ts` and an
 * injected (or lazily-constructed) `EvidenceService`. This module owns ONLY
 * routing dispatch and the request/response envelope.
 *
 * Every response carries an `x-request-id` correlation header: the request's
 * own `x-request-id` when provided, otherwise a generated UUID. Every request
 * is logged through the structured logger with its correlation id.
 */

import { validateEnv, type EnvSource } from "./lib/config";
import { jsonResponse, methodNotAllowed } from "./lib/http";
import type { Logger } from "./lib/log";
import { handleCaptureRequest } from "./capture/router";
import type { CaptureGateway } from "./capture/gateway";
import { handleEvidenceRequest } from "./evidence/router";
import { createEvidenceService, type EvidenceService } from "./evidence/service";
import { FsEvidenceStore } from "./evidence/store";

export const SERVICE_NAME = "aise-api";

export interface HandlerOptions {
  /** Live environment source, re-checked on every /readyz call. */
  envSource: EnvSource;
  /** Service version, sourced from the package manifest. */
  version: string;
  /** Structured logger used for request/error events. */
  logger: Logger;
  /** Capture ingestion gateway (AISE-004). */
  capture: CaptureGateway;
  // AISE-008 routing: injected evidence/source service. When omitted, a
  // default service over the FsEvidenceStore rooted at the configured data
  // directory (AISE_DATA_DIR, default ./data) is constructed lazily on the
  // FIRST evidence request. Wiring the optional content-pinning resolver
  // requires the capture STORE instance (owned by main.ts), so callers that
  // hold one inject a fully-configured service here instead.
  evidence?: EvidenceService;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

async function route(
  request: Request,
  url: URL,
  requestId: string,
  options: HandlerOptions,
  evidenceService: () => EvidenceService,
): Promise<Response> {
  if (url.pathname === "/healthz") {
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    return jsonResponse(
      200,
      { ok: true, service: SERVICE_NAME, version: options.version },
      requestId,
    );
  }

  if (url.pathname === "/readyz") {
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    const result = validateEnv(options.envSource());
    if (result.ok) {
      return jsonResponse(200, { ok: true }, requestId);
    }
    return jsonResponse(503, { ok: false, issues: result.issues }, requestId);
  }

  const captureResponse = await handleCaptureRequest(request, url, requestId, {
    gateway: options.capture,
    logger: options.logger,
  });
  if (captureResponse !== null) {
    return captureResponse;
  }

  // AISE-008 routing: evidence/source surface — one delegation point after
  // the capture block. `handleEvidenceRequest` resolves the lazy default
  // service ONLY when the path is an evidence route, so deployments without
  // evidence traffic never touch the filesystem.
  const evidenceResponse = await handleEvidenceRequest(request, url, requestId, {
    service: options.evidence ?? evidenceService,
    logger: options.logger,
  });
  if (evidenceResponse !== null) {
    return evidenceResponse;
  }

  return jsonResponse(404, { ok: false, error: "not_found" }, requestId);
}

/** Create the API request handler (pure — no server binding). */
export function createRequestHandler(
  options: HandlerOptions,
): (request: Request) => Promise<Response> {
  // AISE-008 routing: lazily-constructed default evidence service, memoized
  // per handler (see HandlerOptions.evidence). Mirrors the capture wiring in
  // main.ts: FsEvidenceStore over the configured data directory plus a UTC
  // wall clock; the pinning resolver stays optional until the caller can
  // provide the capture store.
  let defaultEvidence: EvidenceService | undefined;
  const evidenceService = (): EvidenceService => {
    if (defaultEvidence === undefined) {
      const result = validateEnv(options.envSource());
      defaultEvidence = createEvidenceService({
        store: new FsEvidenceStore(result.ok ? result.config.dataDir : "./data"),
        clock: (): string => new Date().toISOString(),
      });
    }
    return defaultEvidence;
  };
  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const url = new URL(request.url);
    let response: Response;
    try {
      response = await route(request, url, requestId, options, evidenceService);
    } catch (error) {
      options.logger.error("request handler error", {
        requestId,
        method: request.method,
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      response = jsonResponse(500, { ok: false, error: "internal_error" }, requestId);
    }
    options.logger.info("http_request", {
      requestId,
      method: request.method,
      path: url.pathname,
      status: response.status,
    });
    return response;
  };
}
