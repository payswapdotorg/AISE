/**
 * PROD-004 — Auth and tenant safety: the MODEL (types, vocabularies, typed
 * errors, decision shapes).
 *
 * Contract (docs/productization-work-orders.md §PROD-004):
 * "Implement account/session behavior and project/tenant authorization
 * without introducing a second domain authority. Provide a deterministic
 * demo access path for evaluators."
 *
 * AUTHORITY DISCIPLINE (the loud parts first):
 *
 *  - THIS MODULE IS THE REQUEST-AUTHENTICATION AND TENANT-SCOPING LAYER AT
 *    THE RUNTIME SEAM — NOT a second identity authority. The
 *    organization/project/role/permission/audit model, its vocabularies and
 *    its records belong to the frozen identity library (identity/**,
 *    AISE-036). The auth layer CONSUMES that library's registry (its store
 *    interface) to resolve principals, tenancy and memberships; it never
 *    re-models any of them.
 *  - SESSIONS ARE SERVER-SIDE SECRETS. A session token is an OPAQUE
 *    HMAC-signed string carrying ONLY a session id and an expiry; every
 *    other fact (principal, kind, display data) lives in the server-side
 *    session store. No JWT-with-claims exists anywhere.
 *  - CLIENT-VISIBLE PRINCIPAL DATA IS DISPLAY-ONLY: a signed-in caller may
 *    learn their display name, their role label and whether they are on the
 *    demo path — nothing else (no membership map, no permission grants, no
 *    token material).
 *
 * Determinism: no wall clock and no randomness live in this module's logic —
 * clocks are injected by the callers; ids are content-derived (sha-256 over
 * fixed inputs + a monotonic counter).
 */

/* ------------------------------------------------------------------ */
/* Principals                                                          */
/* ------------------------------------------------------------------ */

/**
 * How a session was minted: a signed-in registered user, or the controlled
 * deterministic demo path ("Enter demo"). The kind is display-level
 * metadata (the web gate badges demo sessions); it grants nothing.
 */
export type PrincipalKind = "user" | "demo";

/* ------------------------------------------------------------------ */
/* Typed errors (stable codes; the middleware maps them to HTTP)       */
/* ------------------------------------------------------------------ */

/**
 * The frozen auth-layer error vocabulary. Codes are stable snake_case
 * strings served through the runtime's documented error envelope
 * ({error:{code,message,requestId}}). They deliberately REUSE the identity
 * library's refusal vocabulary (`unknown_principal`, `cross_tenant`) where
 * the semantics match — never inventing a parallel name for the same
 * concept.
 */
export const AUTH_ERROR_CODES = Object.freeze([
  // the layer is enabled but cannot serve (misconfiguration / store failure)
  "auth_not_configured",
  "auth_store_unavailable",
  // authentication (401)
  "authentication_required",
  "session_invalid",
  "session_expired",
  "unknown_principal",
  // request shape (400)
  "malformed_json",
  "invalid_request",
  "invalid_principal_id",
  "invalid_project_id",
  "invalid_organization_id",
  // tenant scoping (403)
  "cross_tenant",
  "unregistered_project",
  "unregistered_organization",
  // transport (405)
  "method_not_allowed",
] as const satisfies readonly string[]);
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** Typed rejection carrying a stable code and an HTTP status (never a bare string). */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;
  readonly detail: string;

  constructor(code: AuthErrorCode, status: number, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/** The server-side session record (persisted in the session store). */
export interface SessionRecord {
  /** Content-derived opaque id (`sess-<hex>`); NEVER the token itself. */
  readonly sessionId: string;
  readonly principalId: string;
  readonly kind: PrincipalKind;
  /** ISO instant the session was minted (injected clock). */
  readonly createdAt: string;
  /** ISO instant the session stops being valid (createdAt + TTL). */
  readonly expiresAt: string;
}

/** The HMAC token payload materialized (no signature). */
export interface TokenPayload {
  readonly sessionId: string;
  /** Expiry as epoch milliseconds (the only second fact the token carries). */
  readonly expiresAtMs: number;
}

/** Why a presented token failed verification. */
export type TokenRejection =
  | "malformed_token"
  | "bad_signature"
  | "expired_token";

export type TokenVerification =
  | { readonly ok: true; readonly payload: TokenPayload }
  | { readonly ok: false; readonly reason: TokenRejection };

/* ------------------------------------------------------------------ */
/* Principals (request-level, resolved from the identity registry)     */
/* ------------------------------------------------------------------ */

/**
 * The principal a request is authenticated as. `organizationIds` is the
 * INTERNAL tenant set (active memberships) used by the tenant predicate —
 * it is never serialized to clients.
 */
export interface ResolvedPrincipal {
  readonly principalId: string;
  readonly displayName: string;
  readonly kind: PrincipalKind;
  /** Active tenant memberships (sorted, deduplicated organization ids). */
  readonly organizationIds: readonly string[];
  /** Display-only role label (the client-visible vocabulary). */
  readonly roleLabel: string;
}

/* ------------------------------------------------------------------ */
/* The tenant predicate (typed decision over a route's scope)          */
/* ------------------------------------------------------------------ */

/**
 * The tenant scope a request addresses, extracted from the route's
 * project/organization id parameters (path segments of the documented
 * shapes, or a top-level `projectId`/`organizationId` field of a JSON
 * mutation body).
 */
export type TenantScope =
  | { readonly kind: "project"; readonly projectId: string }
  | { readonly kind: "organization"; readonly organizationId: string };

/** The typed tenant decision (never a blanket error). */
export type TenantDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      /** Stable snake_case code (auth vocabulary; mirrors identity's). */
      readonly code: AuthErrorCode;
      /** HTTP status for the envelope (400 | 401 | 403). */
      readonly status: 400 | 401 | 403;
      /** Detail naming the scope and the refusal (never secrets). */
      readonly detail: string;
    };

/* ------------------------------------------------------------------ */
/* Shared boundary-shape helpers                                       */
/* ------------------------------------------------------------------ */

/** Mirrors the identity library's id discipline: 1..256 characters. */
export function isValidIdShape(value: string): boolean {
  return value.length >= 1 && value.length <= 256;
}

/** The cookie name carrying the session token (httpOnly, sameSite=strict). */
export const SESSION_COOKIE_NAME = "aise_session";
