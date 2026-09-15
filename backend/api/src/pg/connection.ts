/**
 * Postgres connection management for the AISE API (PROD-005).
 *
 * The Neon persistence family's connection authority. Neon Free (see
 * docs/free-tier-deployment.md) is a serverless Postgres with scale-to-zero
 * behind a PgBouncer POOLED endpoint, which IMPOSES the rules implemented
 * here:
 *
 *   - ONE pooled connection per cold start (`max: 1`): a Vercel function
 *     instance must never open a connection storm against a 0.5 GB / 2 CU
 *     free-tier project; the Neon pooled endpoint (`-pooler` host) is the
 *     documented serverless entry point and multiplexes across instances.
 *   - TLS REQUIRED for every non-local host (`ssl: "require"`): Neon refuses
 *     plaintext; a URL `?sslmode=` parameter always wins so local throwaway
 *     databases can opt out (`sslmode=disable`) and strict operators can
 *     upgrade (`sslmode=verify-full`).
 *   - prepared statements DISABLED (`prepare: false`): transaction-mode
 *     PgBouncer cannot cache session-level prepared statements.
 *   - BOUNDED time: `connect_timeout` (10 s) bounds connection
 *     establishment; the server-side `statement_timeout` (5 s) is passed as
 *     the `options` startup parameter (native for direct endpoints; Neon's
 *     pooler ignores the `options` parameter rather than rejecting it) and
 *     is re-asserted with `SET LOCAL` inside every migration transaction;
 *     `idle_timeout` (20 s) drops idle connections so Neon can scale to
 *     zero between bursts.
 *   - LEAN cold start: `fetch_types: false` skips the startup type probe.
 *
 * CREDENTIAL HYGIENE: `DATABASE_URL` is a secret. It lives in the
 * environment ONLY — never in code, logs, error messages or test output.
 * Every string this module produces that can reach a log line goes through
 * `redactDatabaseUrl` / `redactConnectionStringOccurrences` (both pure,
 * both unit-tested): credentials become `***`, and any occurrence of the
 * full connection string in a foreign error message is replaced by the
 * redacted form. `PgPersistenceError` messages are always pre-redacted.
 */

import postgres from "postgres";

/** The one allowed new dependency: porsager/postgres.js (see PROD-005 report). */
export type PgClient = ReturnType<typeof postgres>;

export interface ParsedDatabaseUrl {
  /** The parsed URL (scheme-validated postgres:// or postgresql://). */
  readonly url: URL;
  /** Lower-cased hostname. */
  readonly host: string;
}

export type ParseDatabaseUrlResult =
  | { readonly ok: true; readonly parsed: ParsedDatabaseUrl }
  | { readonly ok: false; readonly reason: string };

const POSTGRES_SCHEMES: readonly string[] = ["postgres:", "postgresql:"];

/** Hosts that may reasonably run without TLS (local throwaway databases). */
const LOCAL_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
]);

/**
 * Validate a DATABASE_URL value. Pure; the failure reason names the
 * expectation, NEVER the value (mirroring the lib/config.ts discipline).
 */
export function parseDatabaseUrl(raw: string): ParseDatabaseUrlResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      reason: "DATABASE_URL: expected a valid postgres:// or postgresql:// connection URL",
    };
  }
  if (!POSTGRES_SCHEMES.includes(url.protocol)) {
    return {
      ok: false,
      reason: "DATABASE_URL: expected a postgres:// or postgresql:// connection URL scheme",
    };
  }
  if (url.host === "") {
    return { ok: false, reason: "DATABASE_URL: expected a host component" };
  }
  return { ok: true, parsed: { url, host: url.hostname.toLowerCase() } };
}

/** True when the host is a loopback/local address (TLS may be off by default). */
export function isLocalPgHost(host: string): boolean {
  return LOCAL_HOSTS.has(host);
}

/**
 * Resolve the TLS mode for one URL. Precedence: the URL's own `sslmode`
 * parameter wins; otherwise TLS is REQUIRED for every non-local host (Neon)
 * and OFF for loopback hosts. The result is CONSTRAINED to exactly the
 * modes the bundled postgres.js client accepts as strings
 * (`require|allow|prefer|verify-full`); an explicit `sslmode` the client
 * cannot represent (e.g. `verify-ca`, which would need a CA bundle
 * postgres.js cannot derive from the URL) is returned as `null` so the
 * caller fails LOUDLY with an actionable message — never a silent
 * downgrade of an operator's stricter TLS choice.
 */
export function resolveSslMode(
  parsed: ParsedDatabaseUrl,
): "require" | "allow" | "prefer" | "verify-full" | false | null {
  const explicit = parsed.url.searchParams.get("sslmode");
  if (explicit !== null) {
    const normalized = explicit.trim().toLowerCase();
    if (normalized === "" || normalized === "disable" || normalized === "false") {
      return false;
    }
    if (
      normalized === "require" ||
      normalized === "allow" ||
      normalized === "prefer" ||
      normalized === "verify-full"
    ) {
      return normalized;
    }
    return null; // unsupported by the bundled client — refuse loudly
  }
  return isLocalPgHost(parsed.host) ? false : "require";
}

/** Server-side statement timeout applied through the startup `options` parameter. */
export const STATEMENT_TIMEOUT_MS = 5000;

/** Client-side bound on establishing a connection (seconds). */
export const CONNECT_TIMEOUT_SECONDS = 10;

/** Idle-connection lifetime (seconds) — lets Neon scale to zero between bursts. */
export const IDLE_TIMEOUT_SECONDS = 20;

/** Connection pool size per cold start (serverless discipline: ONE). */
export const PG_POOL_MAX = 1;

export interface DerivedPgClientOptions {
  readonly max: number;
  /** TLS is NOT derived here — `resolveSslMode` must be validated first. */
  readonly connect_timeout: number;
  readonly idle_timeout: number;
  readonly prepare: boolean;
  readonly fetch_types: boolean;
  readonly connection: {
    readonly application_name: string;
    readonly options: string;
  };
}

/**
 * Derive the postgres.js options for one URL (pure — unit-tested). The
 * statement timeout rides the `options` startup parameter because it is in
 * Neon's pooler ignore list (`ignore_startup_parameters`), so the pooled
 * endpoint never REJECTS the connection over it, while direct endpoints
 * apply it natively.
 */
export function derivePgClientOptions(parsed: ParsedDatabaseUrl): DerivedPgClientOptions {
  void parsed; // the URL is consumed by postgres() itself; options are URL-independent
  return {
    max: PG_POOL_MAX,
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    prepare: false,
    fetch_types: false,
    connection: {
      application_name: "aise-api",
      options: `-c statement_timeout=${STATEMENT_TIMEOUT_MS}`,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Credential redaction (pure, load-bearing for the leak-scan tests)   */
/* ------------------------------------------------------------------ */

export const REDACTED_MARKER = "***";

/**
 * Redact one DATABASE_URL value for logs/messages: credentials become
 * `***`, the scheme/host/database stay (operators need to know WHICH
 * database; the hostname is not a credential). Unparseable values collapse
 * to a fixed marker — the raw value is never echoed, not even partially.
 */
export function redactDatabaseUrl(raw: string): string {
  const result = parseDatabaseUrl(raw);
  if (!result.ok) {
    return `postgres://${REDACTED_MARKER}@${REDACTED_MARKER}/${REDACTED_MARKER}`;
  }
  const { url } = result.parsed;
  const userinfo = url.username === "" ? REDACTED_MARKER : `${url.username}:${REDACTED_MARKER}`;
  const port = url.port === "" ? "" : `:${url.port}`;
  return `${url.protocol}//${userinfo}@${url.hostname}${port}${url.pathname}`;
}

/**
 * Replace every occurrence of a connection string (and of any embedded
 * password) inside an arbitrary error message with the redacted form.
 * Used when wrapping foreign errors (postgres.js, the OS) that might embed
 * the URL or parts of it.
 */
export function redactConnectionStringOccurrences(text: string, rawUrl: string): string {
  let swept = text.split(rawUrl).join(redactDatabaseUrl(rawUrl));
  try {
    const url = new URL(rawUrl);
    if (url.password !== "") {
      swept = swept.split(url.password).join(REDACTED_MARKER);
      swept = swept
        .split(`${url.username}:${url.password}`)
        .join(`${url.username}:${REDACTED_MARKER}`);
    }
  } catch {
    // Unparseable URL: the whole-string sweep above already covered it.
  }
  return swept;
}

/** Typed, always-redacted persistence failure (the family's only error shape). */
export type PgPersistenceErrorCode =
  | "pg_url_invalid"
  | "pg_unavailable"
  | "pg_migration_failed"
  | "pg_store_failure";

export class PgPersistenceError extends Error {
  readonly code: PgPersistenceErrorCode;
  /** Pre-redacted, deterministic detail (never carries credentials). */
  readonly detail: string;

  constructor(code: PgPersistenceErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = "PgPersistenceError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * Wrap any thrown value into a `PgPersistenceError` with the raw
 * connection string swept out of the message. Pure.
 */
export function toPgPersistenceError(
  code: PgPersistenceErrorCode,
  error: unknown,
  rawUrl: string,
): PgPersistenceError {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const detail = redactConnectionStringOccurrences(rawMessage, rawUrl);
  return new PgPersistenceError(code, detail === "" ? "unknown failure" : detail);
}

/* ------------------------------------------------------------------ */
/* Pooled singleton per cold start                                     */
/* ------------------------------------------------------------------ */

const clients = new Map<string, PgClient>();

/**
 * The pooled singleton: ONE postgres.js client per connection URL per
 * process (cold start). Constructing a client performs NO I/O — postgres.js
 * connects lazily on the first query — so the singleton is safe to build in
 * any environment, including offline tests.
 */
export function getOrCreatePgClient(rawUrl: string): PgClient {
  let client = clients.get(rawUrl);
  if (client === undefined) {
    const result = parseDatabaseUrl(rawUrl);
    if (!result.ok) {
      throw new PgPersistenceError("pg_url_invalid", result.reason);
    }
    const ssl = resolveSslMode(result.parsed);
    if (ssl === null) {
      throw new PgPersistenceError(
        "pg_url_invalid",
        "DATABASE_URL: the URL's sslmode value is not supported by the bundled " +
          "client (supported: disable|require|allow|prefer|verify-full) — use one " +
          "of those, or provide the TLS settings out of band",
      );
    }
    const derived = derivePgClientOptions(result.parsed);
    client = postgres(result.parsed.url.toString(), {
      max: derived.max,
      ssl,
      connect_timeout: derived.connect_timeout,
      idle_timeout: derived.idle_timeout,
      prepare: derived.prepare,
      fetch_types: derived.fetch_types,
      connection: derived.connection,
    });
    clients.set(rawUrl, client);
  }
  return client;
}

/** True when a singleton client exists for the URL (test introspection). */
export function hasPgClient(rawUrl: string): boolean {
  return clients.has(rawUrl);
}

/** Close every singleton client (CLI shutdown / test cleanup). */
export async function endPgClients(): Promise<void> {
  const pending: Promise<unknown>[] = [];
  for (const [key, client] of clients) {
    clients.delete(key);
    pending.push(client.end({ timeout: 5 }));
  }
  await Promise.all(pending);
}
