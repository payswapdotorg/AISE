/**
 * HFX-000 — provider evaluation control-plane endpoints (transport
 * adapter ONLY — the `solution-boq` exemplar's pure route-factory
 * discipline).
 *
 * ENDPOINT INVENTORY (all under /v1/providers — all POST, all
 * deterministic and fail closed with typed errors; every response carries
 * the x-request-id correlation header; wrong methods get 405 with an
 * explicit allow):
 *
 *   POST /v1/providers/profile/validate
 *       Pure profile validation (no state change): body `{ profile }` →
 *       200 `{ ok, valid, profileDigest, evaluationOnly }` | 422
 *       `invalid_profile` with the typed failure inventory.
 *   POST /v1/providers/profile/register
 *       Validate + register a provider profile (idempotent on
 *       providerId+technologyVersion): body `{ profile }` → 200 with the
 *       derived entry summary | 422 `invalid_profile` |
 *       `registration_conflict`.
 *   POST /v1/providers/registry/query
 *       Registry state query: body `{}` → every entry summary; body
 *       `{ providerId, technologyVersion }` → the one entry (404
 *       `unknown_provider` when absent; the pair must be provided
 *       together).
 *   POST /v1/providers/evaluation/start
 *       The registered → evaluation transition: body
 *       `{ providerId, technologyVersion }` → 200 with the entry summary |
 *       404 `unknown_provider` | 422 `unlawful_transition`.
 *   POST /v1/providers/execution/normalize
 *       The I/O boundary: body `{ providerId, technologyVersion, input,
 *       execution }` — the input is validated against the profile's
 *       declared INPUT contract, the raw execution is normalized against
 *       the OUTPUT contract (typed refusals, never a silent coercion) and
 *       the normalized execution is recorded → 200 with the normalized
 *       ProviderResult + the entry summary.
 *   POST /v1/providers/benchmarks/intake
 *       Benchmark record intake (content-addressed; a matching record
 *       attaches idempotently): body `{ record }` → 200 with the recordId
 *       + entry summary | 422 typed codes.
 *   POST /v1/providers/provenance/seal
 *       Seal the portable provenance manifest from the entry's derived
 *       state: body `{ providerId, technologyVersion }` → 200 with the
 *       manifest (self-contained JSON, verifiable by digest).
 *   POST /v1/providers/provenance/manifest
 *       Provenance manifest retrieval: body `{ providerId,
 *       technologyVersion, manifestId? }` → 200 with the sealed
 *       manifest(s) | 404 `unknown_provider` | `unknown_manifest`.
 *   POST /v1/providers/promotion/decide
 *       The promotion decision with typed refusal reasons: body
 *       `{ providerId, technologyVersion }` → 200 with the decision —
 *       `promoted`, or `rejected` carrying the typed refusals (a REFUSED
 *       promotion is a recorded decision, not a transport error) | 404
 *       `unknown_provider` | 422 `unlawful_transition` (not benchmarked
 *       yet).
 *
 * HTTP STATUS MAPPING (the single authoritative place for this
 * translation; mirrors the solution-boq router's discipline):
 *
 *   malformed JSON           -> 400 malformed_json
 *   unknown provider/manifest-> 404 unknown_provider | unknown_manifest
 *   everything else          -> 422 (the typed shape/gate codes above)
 *   deterministic answers    -> 200
 *
 * MOUNT POINT (the Tech Lead wires this at the integration station — this
 * file does NOT touch shared server files): in `backend/api/src/server.ts`,
 * next to the solution-BOQ block:
 *
 *   import {
 *     handleProvidersRequest,
 *     type ProviderRouteOptions,
 *   } from "./providers/router";
 *
 *   if (url.pathname.startsWith("/v1/providers")) {
 *     const response = await handleProvidersRequest(
 *       request, url, requestId, providersRoutesOrDefault(options),
 *     );
 *     if (response !== null) { return response; }
 *   }
 *
 * with a `providers?: ProviderRouteOptions` HandlerOptions field wired
 * lazily to `new ProviderService()` (the service is a deterministic
 * in-memory event-sourced registry — no external deps, no network
 * egress). NOTE for the integration station: add
 * `"@aise/provider-registry": "workspace:*"` to backend/api/package.json
 * dependencies when wiring (already declared in this branch; the Lead
 * regenerates bun.lock). Paths that match no provider route return null
 * so the server's default 404 applies.
 */

import { jsonResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import { ProviderServiceError } from "./model";
import { ProviderService } from "./service";

export interface ProviderRouteOptions {
  /** The deterministic provider control-plane service (thin package orchestration). */
  readonly service: ProviderService;
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

function malformedJson(requestId: string): Response {
  return jsonResponse(
    400,
    { ok: false, error: "malformed_json", detail: "request body is not valid JSON" },
    requestId,
  );
}

/** 400 vs 404 vs 422 — the single authoritative status table (see header). */
function providerErrorResponse(error: ProviderServiceError, requestId: string): Response {
  const status =
    error.code === "malformed_json"
      ? 400
      : error.code === "unknown_provider" || error.code === "unknown_manifest"
        ? 404
        : 422;
  return jsonResponse(
    status,
    { ok: false, error: error.code, detail: error.detail },
    requestId,
  );
}

/* ------------------------------------------------------------------ */
/* Router                                                               */
/* ------------------------------------------------------------------ */

/**
 * Route and answer one request against the provider control-plane
 * surface. Returns null when the path is not a provider route (the server
 * then answers 404). PURE TRANSPORT: every domain decision is made by the
 * `@aise/provider-registry` package through the service; error mapping
 * happens HERE only (see module header).
 */
export async function handleProvidersRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: ProviderRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "providers") {
    return null;
  }
  const area = segments[2] ?? "";
  const action = segments[3] ?? "";
  const { service, logger } = options;

  try {
    if (segments.length === 4 && area === "profile" && action === "validate") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.validateProfile(body.payload);
      logger.info("provider_profile_validated", {
        requestId,
        profileDigest: response.profileDigest,
        evaluationOnly: response.evaluationOnly,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "profile" && action === "register") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.register(body.payload);
      logger.info("provider_registered", {
        requestId,
        providerId: response.entry.providerId,
        technologyVersion: response.entry.technologyVersion,
        state: response.entry.state,
        evaluationOnly: response.entry.evaluationOnly,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "registry" && action === "query") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.queryRegistry(body.payload);
      logger.info("provider_registry_queried", {
        requestId,
        entries: response.entries.length,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "evaluation" && action === "start") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.startEvaluation(body.payload);
      logger.info("provider_evaluation_started", {
        requestId,
        providerId: response.entry.providerId,
        technologyVersion: response.entry.technologyVersion,
        state: response.entry.state,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "execution" && action === "normalize") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.normalizeExecution(body.payload);
      logger.info("provider_execution_normalized", {
        requestId,
        providerId: response.entry.providerId,
        technologyVersion: response.entry.technologyVersion,
        status: response.result.status,
        inputDigest: response.result.inputDigest,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "benchmarks" && action === "intake") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.intakeBenchmark(body.payload);
      logger.info("provider_benchmark_recorded", {
        requestId,
        providerId: response.entry.providerId,
        technologyVersion: response.entry.technologyVersion,
        recordId: response.recordId,
        state: response.entry.state,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "provenance" && action === "seal") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.sealProvenance(body.payload);
      logger.info("provider_provenance_sealed", {
        requestId,
        providerId: response.entry.providerId,
        technologyVersion: response.entry.technologyVersion,
        manifestId: response.manifest.manifestId,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "provenance" && action === "manifest") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.provenanceManifests(body.payload);
      logger.info("provider_provenance_retrieved", {
        requestId,
        manifests: response.manifests.length,
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    if (segments.length === 4 && area === "promotion" && action === "decide") {
      if (request.method !== "POST") {
        return methodNotAllowed(requestId, "POST");
      }
      const body = await readJsonBody(request);
      if (!body.ok) {
        return malformedJson(requestId);
      }
      const response = service.decidePromotion(body.payload);
      logger.info("provider_promotion_decided", {
        requestId,
        providerId: response.entry.providerId,
        technologyVersion: response.entry.technologyVersion,
        decision: response.decision,
        refusalKinds: response.refusals.map((refusal) => refusal.kind),
      });
      return jsonResponse(200, { ok: true, ...response }, requestId);
    }

    // A /v1/providers/... path with no matching route shape falls through
    // to the server-wide 404.
    return null;
  } catch (error) {
    if (error instanceof ProviderServiceError) {
      logger.warn("provider_request_rejected", {
        requestId,
        code: error.code,
      });
      return providerErrorResponse(error, requestId);
    }
    throw error; // unexpected -> the server handler's 500 path
  }
}
