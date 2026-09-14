/**
 * HTTP request handling for the AISE backend API.
 *
 * Contract (AISE-001 health/readiness plumbing; AISE-004 capture ingestion;
 * AISE-007 mission planning; AISE-008 evidence/source service; AISE-011 BOQ
 * ingestion):
 *
 *   GET  /healthz  -> 200 {"ok":true,"service":"aise-api","version":"<pkg version>"}
 *   GET  /readyz   -> 200 when the environment (config) is valid, 503 otherwise
 *   POST /v1/capture/assets/:contentId  -> raw content-addressed asset upload
 *   POST /v1/capture/sync               -> SyncBatch ingestion, SyncAck reply
 *   GET  /v1/capture/sessions/:sessionId -> stored session projection
 *   POST /v1/missions/plan              -> adaptive capture mission planning
 *   GET  /v1/missions/:missionId        -> stored mission + revision history
 *   GET  /v1/missions                   -> mission list projection
 *   POST /v1/evidence                     -> register immutable evidence (AISE-008)
 *   GET  /v1/evidence?includeInvalidated  -> list registered evidence
 *   GET  /v1/evidence/:contentId          -> full evidence read view
 *   POST /v1/evidence/:contentId/invalidation -> append an invalidation
 *   POST /v1/evidence/provenance-links    -> append a provenance link
 *   POST /v1/evidence/derivations         -> record a derivation
 *   POST /v1/boq/imports                 -> BOQ source upload (AISE-011)
 *   GET  /v1/boq/imports[/:id[/source]]  -> BOQ import list/detail/source
 *
 * The capture routes are implemented by `capture/router.ts` over the
 * `capture/gateway.ts` policy engine and an injected `CaptureStore`; the
 * missions routes are implemented by `missions/router.ts` over the pure
 * `missions/planner.ts` policy engine and an injected `MissionStore`; the
 * evidence routes by `evidence/router.ts` over `evidence/service.ts` and an
 * injected (or lazily-constructed) `EvidenceService`; the BOQ routes by
 * `boq/router.ts` over `boq/service.ts` and a file-system store. This module
 * owns ONLY routing dispatch and the request/response envelope.
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
import {
  createDefaultMissionsRouting,
  handleMissionsRequest,
  type MissionsRouteOptions,
} from "./missions/router";
import { handleEvidenceRequest } from "./evidence/router";
import { createEvidenceService, type EvidenceService } from "./evidence/service";
import { FsEvidenceStore } from "./evidence/store";
import { handleBoqRequest, type BoqRouteOptions } from "./boq/router";
import { BoqService } from "./boq/service";
import { FsBoqStore } from "./boq/store";

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
  /**
   * Mission planning surface (AISE-007). Optional: when absent a default
   * wiring is constructed once per handler (file-system store under the
   * configured data dir, in-memory fallback when the environment does not
   * resolve) — explicit construction wins, mirroring the capture wiring.
   */
  missions?: MissionsRouteOptions;
  // AISE-008 routing: injected evidence/source service. When omitted, a
  // default service over the FsEvidenceStore rooted at the configured data
  // directory (AISE_DATA_DIR, default ./data) is constructed lazily on the
  // FIRST evidence request. Wiring the optional content-pinning resolver
  // requires the capture STORE instance (owned by main.ts), so callers that
  // hold one inject a fully-configured service here instead.
  evidence?: EvidenceService;
  /** BOQ ingestion routes (AISE-011); defaults to a file-system store
   *  rooted at the live environment's dataDir when not injected. */
  boq?: BoqRouteOptions;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

// AISE-011: memoized default BOQ routing (see HandlerOptions.boq).
let defaultBoqRoutes: BoqRouteOptions | null = null;

function boqRoutesOrDefault(options: HandlerOptions): BoqRouteOptions {
  if (options.boq !== undefined) {
    return options.boq;
  }
  if (defaultBoqRoutes === null) {
    const result = validateEnv(options.envSource());
    const dataDir = result.ok ? result.config.dataDir : "./data";
    defaultBoqRoutes = {
      service: new BoqService({
        store: new FsBoqStore(dataDir),
        clock: () => new Date().toISOString(),
      }),
      logger: options.logger,
    };
  }
  return defaultBoqRoutes;
}

async function route(
  request: Request,
  url: URL,
  requestId: string,
  options: HandlerOptions,
  missions: () => MissionsRouteOptions,
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

  // AISE-007 routing
  const missionsResponse = await handleMissionsRequest(request, url, requestId, missions());
  if (missionsResponse !== null) {
    return missionsResponse;
  }

  // AISE-008 routing: evidence/source surface — one delegation point after
  // the missions block. `handleEvidenceRequest` resolves the lazy default
  // service ONLY when the path is an evidence route, so deployments without
  // evidence traffic never touch the filesystem.
  const evidenceResponse = await handleEvidenceRequest(request, url, requestId, {
    service: options.evidence ?? evidenceService,
    logger: options.logger,
  });
  if (evidenceResponse !== null) {
    return evidenceResponse;
  }

  // AISE-011 routing — delegates to the BOQ ingestion surface. When no
  // options are injected, a service is constructed from the LIVE
  // environment's dataDir (AISE_DATA_DIR, default ./data) — the same
  // configuration source the capture gateway uses — and memoized so only
  // one store instance exists per process. The path guard keeps the lazy
  // store construction off non-BOQ requests entirely.
  if (url.pathname === "/v1/boq" || url.pathname.startsWith("/v1/boq/")) {
    const boqResponse = await handleBoqRequest(request, url, requestId, boqRoutesOrDefault(options));
    if (boqResponse !== null) {
      return boqResponse;
    }
  }

  return jsonResponse(404, { ok: false, error: "not_found" }, requestId);
}

/** Create the API request handler (pure — no server binding). */
export function createRequestHandler(
  options: HandlerOptions,
): (request: Request) => Promise<Response> {
  // AISE-007: resolve the missions wiring lazily, at most once per handler.
  // Explicit options win; otherwise the default (FsMissionStore under the
  // configured data dir, in-memory fallback) is built from the handler's
  // environment source on the first missions request — handlers that never
  // touch the missions surface perform no store construction at all.
  let missionsRouting: MissionsRouteOptions | null = options.missions ?? null;
  const missions = (): MissionsRouteOptions => {
    missionsRouting ??= createDefaultMissionsRouting(options);
    return missionsRouting;
  };

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
      response = await route(request, url, requestId, options, missions, evidenceService);
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
