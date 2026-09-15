/**
 * PROD-004 — the auth layer's environment discipline.
 *
 * Mirrors — and deliberately does not import — the backend API's own
 * configuration authority (`lib/config.ts`, AISE-001) and the workspace
 * level declaration in `tools/env-schema.ts`: three validation surfaces,
 * one documented semantic (the established PROD-003 mirror pattern).
 *
 * Variables (all ADDITIVE — when `AISE_AUTH` is unset or explicitly
 * disabled, NONE of them changes any behavior):
 *
 *   AISE_AUTH             1|true to enable the auth layer; 0|false or unset
 *                         to disable (zero behavior change). Production
 *                         deployments set it to 1 (docs/INSTALL.md §Auth).
 *   AUTH_SECRET           REQUIRED when auth is enabled: the HMAC key for
 *                         session tokens. A long random string; never
 *                         committed, never echoed in any issue, response or
 *                         log. Missing/empty while enabled is a
 *                         misconfiguration (fail closed, never a silent
 *                         insecure fallback key).
 *   AISE_AUTH_MODE        required | demo-open (default demo-open).
 *                         `required`: every /v1 request needs a session.
 *                         `demo-open`: anonymous GETs of the DEMO tenant's
 *                         projects (and of unscoped discovery routes) are
 *                         allowed so evaluators see content; writes always
 *                         require a session.
 *   AISE_SESSION_TTL_SECONDS  session lifetime (default 604800 = 7 days,
 *                         bounds 60..2592000 = 1 minute..30 days).
 *   AISE_DEMO_PRINCIPAL   the deterministic demo principal id (default
 *                         "demo-evaluator") — the id "Enter demo" mints a
 *                         session for, bound to the fixed demo tenant.
 *
 * INERT-WHEN-DISABLED (the additive discipline, made precise): a malformed
 * AISE_AUTH_MODE / AISE_SESSION_TTL_SECONDS / AISE_DEMO_PRINCIPAL is an
 * issue ONLY while the layer is ENABLED — those values are inert when the
 * toggle is unset or cleanly disabled, so the runtime keeps its zero-
 * behavior-change contract (the workspace-level `check:env` stays STRICT
 * about malformed values in every mode: it is the env discipline gate,
 * this parser is the behavior gate). The TOGGLE itself is never inert: a
 * malformed or present-but-empty AISE_AUTH is always a fail-closed issue
 * (the intent cannot be honored and cannot be guessed).
 *
 * Determinism contract: pure function of the env record; issue strings name
 * the variable and the expectation, NEVER the value.
 */

export type AuthMode = "required" | "demo-open";

export const AUTH_MODES: readonly AuthMode[] = ["required", "demo-open"] as const;

/** The auth layer's resolved configuration. */
export interface AuthConfig {
  readonly enabled: boolean;
  readonly mode: AuthMode;
  /** The HMAC secret (only ever held server-side; never serialized). */
  readonly secret: string;
  readonly sessionTtlSeconds: number;
  readonly demoPrincipalId: string;
}

export type AuthConfigResult =
  | { readonly ok: true; readonly config: AuthConfig }
  | { readonly ok: false; readonly issues: readonly string[] };

export type EnvRecord = Record<string, string | undefined>;

const DEFAULT_MODE: AuthMode = "demo-open";
const DEFAULT_SESSION_TTL_SECONDS = 604_800; // 7 days
const MIN_SESSION_TTL_SECONDS = 60; // 1 minute
const MAX_SESSION_TTL_SECONDS = 2_592_000; // 30 days
const DEFAULT_DEMO_PRINCIPAL = "demo-evaluator";

const AUTH_TOGGLE_ISSUE = "AISE_AUTH: expected 1|true|0|false";
const AUTH_SECRET_REQUIRED_ISSUE =
  "AUTH_SECRET: required when AISE_AUTH=1 — set it to a long random string (see docs/INSTALL.md §Auth)";
const AUTH_MODE_ISSUE = "AISE_AUTH_MODE: expected required|demo-open";
const SESSION_TTL_ISSUE =
  "AISE_SESSION_TTL_SECONDS: expected an integer between 60 and 2592000 (seconds)";
const DEMO_PRINCIPAL_ISSUE = "AISE_DEMO_PRINCIPAL: expected a non-empty value (1..256 characters)";

/** Parse the toggle: unset → disabled; 1|true → enabled; 0|false → disabled; anything else → issue. */
function parseToggle(value: string | undefined, issues: string[]): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "") {
    // Present-but-empty mirrors the HOST/PORT discipline: a misconfigured
    // value, reported as such — but treated as "not enabled" (the safe
    // status quo) rather than guessing the operator meant "on".
    if (normalized === "") {
      issues.push(AUTH_TOGGLE_ISSUE);
    }
    return false;
  }
  issues.push(AUTH_TOGGLE_ISSUE);
  return false;
}

function parseMode(value: string | undefined, enabled: boolean, issues: string[]): AuthMode {
  if (value === undefined) {
    return DEFAULT_MODE;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "required" || normalized === "demo-open") {
    return normalized;
  }
  // Inert when the layer is disabled (see the module header): the value
  // changes nothing, so it reports nothing — check:env stays the strict gate.
  if (enabled) {
    issues.push(AUTH_MODE_ISSUE);
  }
  return DEFAULT_MODE;
}

function parseTtl(value: string | undefined, enabled: boolean, issues: string[]): number {
  if (value === undefined) {
    return DEFAULT_SESSION_TTL_SECONDS;
  }
  if (!/^\d+$/.test(value.trim())) {
    if (enabled) {
      issues.push(SESSION_TTL_ISSUE);
    }
    return DEFAULT_SESSION_TTL_SECONDS;
  }
  const ttl = Number.parseInt(value.trim(), 10);
  if (ttl < MIN_SESSION_TTL_SECONDS || ttl > MAX_SESSION_TTL_SECONDS) {
    if (enabled) {
      issues.push(SESSION_TTL_ISSUE);
    }
    return DEFAULT_SESSION_TTL_SECONDS;
  }
  return ttl;
}

function parseDemoPrincipal(value: string | undefined, enabled: boolean, issues: string[]): string {
  if (value === undefined) {
    return DEFAULT_DEMO_PRINCIPAL;
  }
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 256) {
    if (enabled) {
      issues.push(DEMO_PRINCIPAL_ISSUE);
    }
    return DEFAULT_DEMO_PRINCIPAL;
  }
  return normalized;
}

function parseSecret(value: string | undefined, enabled: boolean, issues: string[]): string {
  if (value === undefined || value.trim() === "") {
    if (enabled) {
      issues.push(AUTH_SECRET_REQUIRED_ISSUE);
    }
    return "";
  }
  return value;
}

/**
 * Validate the auth environment. Fail-closed semantics: a request to enable
 * auth that cannot be satisfied (malformed toggle, missing secret) yields
 * `{ok:false}` with precise issues — the runtime then serves the honest
 * degraded mode (every /v1 request fails 503 with the issues) instead of
 * silently running an insecure or unintended configuration.
 */
export function parseAuthConfig(env: EnvRecord): AuthConfigResult {
  const issues: string[] = [];
  const enabled = parseToggle(env.AISE_AUTH, issues);
  const secret = parseSecret(env.AUTH_SECRET, enabled, issues);
  const config: AuthConfig = {
    enabled,
    mode: parseMode(env.AISE_AUTH_MODE, enabled, issues),
    secret,
    sessionTtlSeconds: parseTtl(env.AISE_SESSION_TTL_SECONDS, enabled, issues),
    demoPrincipalId: parseDemoPrincipal(env.AISE_DEMO_PRINCIPAL, enabled, issues),
  };
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, config };
}

/** The auth status surfaced through /readyz (names only, never values). */
export interface AuthReadinessStatus {
  readonly status: "enabled" | "disabled" | "unavailable";
  readonly mode?: AuthMode;
  readonly issues?: readonly string[];
}

/**
 * The /readyz projection of the auth configuration, re-derived from the
 * LIVE env record on every readiness call (the same liveness discipline as
 * the optional providers). Disabled ⇒ {status:"disabled"} with no mode
 * detail, so the readiness body stays byte-identical to the pre-auth
 * contract unless auth is actually in play.
 */
export function authReadiness(env: EnvRecord): AuthReadinessStatus {
  const result = parseAuthConfig(env);
  if (result.ok) {
    return result.config.enabled
      ? { status: "enabled", mode: result.config.mode }
      : { status: "disabled" };
  }
  return { status: "unavailable", issues: result.issues };
}
