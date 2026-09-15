/**
 * PROD-004 — the auth/tenant-safety layer's public surface.
 *
 * Consumers (runtime/entry.ts — the production entry seam) import from
 * HERE only. The module is a REQUEST-AUTHENTICATION and TENANT-SCOPING
 * layer, not an identity authority: the organization/project/role/
 * permission/audit model belongs to the frozen identity library
 * (identity/**), whose registry this layer consumes through the narrow
 * `PrincipalDirectory` seam. See each file's header for the contracts:
 *
 *   model.ts      types, vocabularies, typed errors, decision shapes
 *   config.ts     the auth env discipline (AISE_AUTH, AUTH_SECRET, …)
 *   token.ts      HMAC-signed opaque session tokens (id + expiry ONLY)
 *   store.ts      the session store interface + Fs/in-memory twins + sweep
 *   principal.ts  principal resolution + THE tenant predicate
 *   demo.ts       the deterministic, contained demo path
 *   middleware.ts the seam layer (auth endpoints + /v1 enforcement)
 */

export {
  AUTH_ERROR_CODES,
  AuthError,
  SESSION_COOKIE_NAME,
  isValidIdShape,
  type AuthErrorCode,
  type PrincipalKind,
  type ResolvedPrincipal,
  type SessionRecord,
  type TenantDecision,
  type TenantScope,
  type TokenPayload,
  type TokenRejection,
  type TokenVerification,
} from "./model";
export {
  AUTH_MODES,
  authReadiness,
  parseAuthConfig,
  type AuthConfig,
  type AuthConfigResult,
  type AuthMode,
  type AuthReadinessStatus,
  type EnvRecord as AuthEnvRecord,
} from "./config";
export { mintSessionToken, verifySessionToken } from "./token";
export {
  FsSessionStore,
  InMemorySessionStore,
  parseSessionRecord,
  sweepExpiredSessions,
  type SessionStore,
  type SessionSweepReport,
} from "./store";
export {
  decideTenantAccess,
  isReadVerb,
  resolvePrincipal,
  type PrincipalDirectory,
  type PrincipalResolution,
} from "./principal";
export {
  DEMO_ORGANIZATION_ID,
  DEMO_PRINCIPAL_DISPLAY_NAME,
  DEMO_PROJECT_IDS,
  ensureDemoTenant,
  memoizedDemoBootstrap,
  type DemoBootstrapReport,
} from "./demo";
export {
  createAuthLayer,
  createDegradedAuthLayer,
  decideUnscopedAccess,
  extractBodyScope,
  extractPathScope,
  readSessionCookie,
  readSessionToken,
  type AuthLayer,
  type AuthLayerDeps,
  type AuthOutcome,
} from "./middleware";
