/**
 * CORS layer for the deployed AISE API (PROD-003).
 *
 * Policy (the work order's "safe CORS/configuration behavior"):
 *
 *   - SAME-ORIGIN BY DEFAULT. The web app (PROD-002) talks to the API
 *     same-origin (`/healthz`, `/readyz`, `/v1/**` — on Vercel those paths
 *     rewrite to the catch-all function, so the browser never needs CORS).
 *     Requests whose `Origin` equals the request's own origin, and requests
 *     with no `Origin` header at all (curl, server-to-server, same-origin
 *     GET navigation), get NO CORS headers — there is nothing to allow.
 *   - CROSS-ORIGIN IS OPT-IN via `AISE_CORS_ORIGINS` (comma-separated list of
 *     absolute http(s) origins, validated and normalized by lib/config.ts).
 *     A request whose `Origin` is on the allowlist gets
 *     `access-control-allow-origin: <origin>` (plus `vary: origin` and
 *     `access-control-expose-headers: x-request-id` for correlation).
 *   - NEVER ECHO ARBITRARY ORIGINS. An `Origin` that is not on the
 *     allowlist (including `null` and unparseable values) gets NO CORS
 *     headers — the browser refuses the response; the server never reflects
 *     the requester's origin back.
 *   - PREFLIGHT is handled at the seam: `OPTIONS` with an
 *     `access-control-request-method` header short-circuits with 204 (no
 *     body — nothing to preflight-cache beyond the headers) carrying the
 *     allow headers ONLY for allowlisted origins. Allowed methods are the
 *     API's actual surface (GET, POST, HEAD, OPTIONS); allowed request
 *     headers are the API's actual header surface (content-type,
 *     x-request-id). No credentials mode: the API has no cookies/bearer
 *     authn today, so `access-control-allow-credentials` is never emitted
 *     (least privilege — adding an authn scheme later must revisit this
 *     deliberately, not inherit it silently).
 *
 * The layer is a pure wrapper around the core handler: for every request it
 * either answers the preflight itself or decorates the core's response.
 * Deterministic: a pure function of the allowlist and the request.
 */

/** Headers echoed to allowlisted cross-origin callers. */
const CORS_EXPOSE_HEADERS = "x-request-id";
/** The API's actual request-header surface (what preflights may ask for). */
const CORS_ALLOW_HEADERS = "content-type, x-request-id";
/** The API's actual method surface. */
const CORS_ALLOW_METHODS = "GET, POST, HEAD, OPTIONS";
const CORS_MAX_AGE_SECONDS = "86400";

/** Normalize an origin string for exact comparison; null when unparseable
 * or not origin-shaped. A real Origin header is scheme://host[:port] with
 * NO path/query/fragment — a value that carries any of those is not a
 * browser Origin and must never be normalized INTO an allowlisted origin
 * (that would widen the allowlist by forgery). */
function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export interface CorsLayer {
  /**
   * Handle the CORS concerns of one request. Returns the preflight response
   * when the request IS a preflight (the core handler is never called), or
   * null when the request should flow to the core (the caller then applies
   * `decorate` to the core's response).
   */
  readonly handlePreflight: (request: Request) => Response | null;
  /** Decorate a core response with CORS headers when the origin is allowed. */
  readonly decorate: (request: Request, response: Response) => Response;
}

export function createCorsLayer(allowedOrigins: readonly string[]): CorsLayer {
  const allowlist = new Set<string>(allowedOrigins);

  const isAllowed = (request: Request): string | null => {
    const header = request.headers.get("origin");
    if (header === null) {
      return null; // No Origin: same-origin/non-browser — nothing to allow.
    }
    const origin = normalizeOrigin(header);
    if (origin === null) {
      return null; // Unparseable (incl. the literal "null"): never echoed.
    }
    const self = normalizeOrigin(new URL(request.url).origin);
    if (self !== null && origin === self) {
      return null; // Same-origin request: no CORS headers needed.
    }
    return allowlist.has(origin) ? origin : null;
  };

  const corsHeaders = (origin: string): Record<string, string> => ({
    "access-control-allow-origin": origin,
    vary: "origin",
  });

  return {
    handlePreflight: (request: Request): Response | null => {
      if (request.method !== "OPTIONS") {
        return null;
      }
      if (request.headers.get("access-control-request-method") === null) {
        // An OPTIONS without a requested method is not a CORS preflight —
        // let the core answer it (typically 405 with an `allow` header).
        return null;
      }
      const origin = isAllowed(request);
      if (origin === null) {
        // Deny: a valid preflight answer without CORS headers. The browser
        // fails the preflight; no origin is echoed.
        return new Response(null, {
          status: 204,
          headers: { vary: "origin" },
        });
      }
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          "access-control-allow-methods": CORS_ALLOW_METHODS,
          "access-control-allow-headers": CORS_ALLOW_HEADERS,
          "access-control-max-age": CORS_MAX_AGE_SECONDS,
        },
      });
    },
    decorate: (request: Request, response: Response): Response => {
      const origin = isAllowed(request);
      if (origin === null) {
        return response;
      }
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders(origin))) {
        headers.set(key, value);
      }
      headers.set("access-control-expose-headers", CORS_EXPOSE_HEADERS);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    },
  };
}
