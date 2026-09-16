/**
 * Redis primitives model — PROD-007 (Upstash Redis, transient state only).
 *
 * Contract (docs/productization-work-orders.md §PROD-007; the frozen
 * architecture's "Redis is a TRANSIENT-state store, never canonical
 * state" rule):
 *
 *  - TYPED OUTCOMES, NO RAW THROWS. Every port operation resolves to a
 *    result union: `{ ok: true, value }` or `{ ok: false, failure }`.
 *    Failures are DATA (`RedisFailure`): a machine-readable kind plus a
 *    deterministic, log-safe `detail` that names signatures and variable
 *    NAMES, never credential VALUES. No Redis call can throw through an
 *    unaware caller — the outage wrapper (outage.ts) and every consumer
 *    branch on `ok`, never on try/catch.
 *  - TTLs ARE REQUIRED PARAMETERS, ALWAYS. Every write path (`set`,
 *    `increment`, and every helper built over the port) takes an explicit
 *    positive-integer `ttlSeconds`. There is NO hidden default TTL in any
 *    layer: a caller must choose the lifetime at the call site (checked at
 *    runtime by `validateTtlSeconds`, rejected as a typed
 *    `protocol_error` — never silently coerced).
 *  - STRING VALUES ONLY. Upstash REST (and the free-tier discipline) is a
 *    string-typed store; richer shapes are serialized by the caller
 *    (cache.ts, jobs.ts own their JSON codecs). This keeps both client
 *    implementations byte-faithful twins.
 *  - DETERMINISM. The in-memory client (client-memory.ts) is driven by an
 *    INJECTED CLOCK (`RedisClock`, epoch milliseconds — the repo's
 *    injected-clock discipline; no `Date.now()` internals), so tests and
 *    the outage-degradation path are fully deterministic.
 *
 * This module is PURE TYPES + validation data: no I/O, no clock, no
 * randomness, zero npm dependencies.
 */

/* ------------------------------------------------------------------ */
/* Modes                                                                */
/* ------------------------------------------------------------------ */

/** Which backing implementation answers behind a client instance. */
export type RedisMode = "upstash" | "memory";

/**
 * Injected clock: epoch milliseconds. The memory client, the rate limiter,
 * the job store and the outage wrapper all take this seam so that every
 * TTL/expiry/outage behavior is deterministic under test (the fixed-clock
 * discipline used across the repo's stores and services).
 */
export type RedisClock = () => number;

/* ------------------------------------------------------------------ */
/* Typed failures                                                       */
/* ------------------------------------------------------------------ */

/**
 * Machine-readable failure classification (mirrors the artifacts storage
 * discipline — the kinds an Upstash REST deployment actually produces).
 */
export type RedisFailureKind =
  /** The endpoint could not be reached, timed out, or answered 5xx. */
  | "unavailable"
  /** The endpoint refused our credentials (misconfiguration, not a client error). */
  | "auth_failed"
  /** A quota signature was recognized (free-tier request/byte limits). */
  | "quota_exceeded"
  /**
   * The request or response violated the expected protocol — malformed
   * local arguments (non-positive TTL, non-integer counter) or an
   * unexpected response shape/status.
   */
  | "protocol_error";

/**
 * Typed failure. `detail` is deterministic and safe to surface in logs and
 * health payloads: it names failure signatures and variable NAMES, never
 * credential VALUES (the URL and token never appear).
 */
export interface RedisFailure {
  readonly kind: RedisFailureKind;
  readonly detail: string;
}

/** Construct a typed failure (the ONLY way implementations report errors). */
export function redisFailure(kind: RedisFailureKind, detail: string): RedisFailure {
  return { kind, detail };
}

/* ------------------------------------------------------------------ */
/* Result unions                                                        */
/* ------------------------------------------------------------------ */

/** The port's universal outcome shape: success value or typed failure. */
export type RedisOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: RedisFailure };

/** `get` outcome: the stored string, or `null` when absent/expired. */
export type RedisGetResult = RedisOutcome<string | null>;
/** `set` outcome: `true` on success (the only success shape). */
export type RedisSetResult = RedisOutcome<true>;
/** `delete` outcome: whether an unexpired key was actually removed. */
export type RedisDeleteResult = RedisOutcome<boolean>;
/** `expire` outcome: whether an existing key had its TTL refreshed. */
export type RedisExpireResult = RedisOutcome<boolean>;
/** `increment` outcome: the counter value after the increment. */
export type RedisIncrementResult = RedisOutcome<number>;

/* ------------------------------------------------------------------ */
/* The port                                                             */
/* ------------------------------------------------------------------ */

/**
 * The Redis client port — the single seam both implementations
 * (client-upstash.ts, client-memory.ts) and the outage wrapper
 * (outage.ts) satisfy. PERSISTENCE ONLY, string keys and values:
 *
 *  - no policy lives here (no rate-limit math, no job semantics — those
 *    are the helpers' modules, built OVER the port);
 *  - every write takes an EXPLICIT positive-integer TTL — Redis is used
 *    only for transient state, so nothing may outlive its declared
 *    lifetime;
 *  - implementations MUST be deterministic given the same call sequence
 *    and the same injected clock (the memory twin is the deterministic
 *    reference; the upstash twin issues identical REST pipelines for
 *    identical inputs).
 */
export interface RedisClientPort {
  /** Which backing implementation answers (health-visible, no I/O). */
  readonly mode: RedisMode;

  /** Read a key. Absent or TTL-expired keys read as `null`. */
  get(key: string): Promise<RedisGetResult>;
  /** Write a string value with an explicit TTL (seconds, > 0). */
  set(key: string, value: string, ttlSeconds: number): Promise<RedisSetResult>;
  /** Delete a key. Value reports whether an unexpired key was removed. */
  delete(key: string): Promise<RedisDeleteResult>;
  /** Refresh an existing key's TTL. Value reports whether the key existed. */
  expire(key: string, ttlSeconds: number): Promise<RedisExpireResult>;
  /**
   * Increment a counter. When the key is CREATED by this call its TTL is
   * set to `ttlSeconds`; an existing unexpired key keeps its original TTL
   * (the INCR + EXPIRE NX discipline — a window's bound never stretches).
   */
  increment(key: string, ttlSeconds: number): Promise<RedisIncrementResult>;
}

/* ------------------------------------------------------------------ */
/* Shared validation                                                    */
/* ------------------------------------------------------------------ */

/** The TTL floor: Redis EXPIRE-style TTLs are positive whole seconds. */
export const REDIS_TTL_MIN_SECONDS = 1;

/**
 * Validate an explicit TTL. Returns `null` when the value is a positive
 * integer, else a deterministic protocol-error detail naming the
 * expectation (never other call data). Every write path on every
 * implementation MUST run this check first — this is the runtime half of
 * "TTLs are explicit".
 */
export function validateTtlSeconds(ttlSeconds: number): string | null {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < REDIS_TTL_MIN_SECONDS) {
    return `ttlSeconds must be an integer >= ${REDIS_TTL_MIN_SECONDS} (got ${String(ttlSeconds)})`;
  }
  return null;
}
