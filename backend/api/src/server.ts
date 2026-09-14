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
 *   POST /v1/boq/imports                 -> BOQ source upload (AISE-011)
 *   GET  /v1/boq/imports[/:id[/source]]  -> BOQ import list/detail/source
 *
 * The capture routes are implemented by `capture/router.ts` over the
 * `capture/gateway.ts` policy engine and an injected `CaptureStore`. This
 * module owns ONLY routing dispatch and the request/response envelope.
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
  /** BOQ ingestion routes (AISE-011); defaults to a file-system store
   *  rooted at the live environment's dataDir when not injected. */
  boq?: BoqRouteOptions;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Memoized default BOQ route options (AISE-011): one `BoqService` per
 * process over an `FsBoqStore` rooted at the live environment's dataDir.
 * main.ts wires the capture gateway explicitly; the BOQ surface constructs
 * its own default here so no entry-point change is required. Constructed
 * lazily on the first BOQ request; a construction failure surfaces through
 * the request handler's catch-all 500 (logged with the dataDir).
 */
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
  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const url = new URL(request.url);
    let response: Response;
    try {
      response = await route(request, url, requestId, options);
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
