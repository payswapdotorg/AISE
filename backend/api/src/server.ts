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
 *   POST /v1/missions/plan              -> adaptive capture mission planning
 *   GET  /v1/missions/:missionId        -> stored mission + revision history
 *   GET  /v1/missions                   -> mission list projection
 *
 * The capture routes are implemented by `capture/router.ts` over the
 * `capture/gateway.ts` policy engine and an injected `CaptureStore`; the
 * missions routes are implemented by `missions/router.ts` over the pure
 * `missions/planner.ts` policy engine and an injected `MissionStore`. This
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
import {
  createDefaultMissionsRouting,
  handleMissionsRequest,
  type MissionsRouteOptions,
} from "./missions/router";

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
  missions: () => MissionsRouteOptions,
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
  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
    const url = new URL(request.url);
    let response: Response;
    try {
      response = await route(request, url, requestId, options, missions);
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
