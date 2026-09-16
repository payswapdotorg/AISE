/**
 * Redis key namespacing — PROD-007.
 *
 * Every key the Redis family touches is built here, so the keyspace is:
 *
 *  - NAMESPACED: one shared root + schema version (`aise:v1:`) — the
 *    workspace owns the Redis database, not the other way around, and a
 *    future key-schema change can migrate by version;
 *  - TENANT/PROJECT-SCOPED: cache and job keys carry their scope parts
 *    explicitly, so one tenant's transient state can never read or
 *    invalidate another's;
 *  - COLLISION-SAFE: every free-text part is percent-encoded (`%` and the
 *    `:` separator are escaped), so distinct part tuples ALWAYS map to
 *    distinct keys — `("a:b", "c")` and `("a", "b:c")` encode
 *    differently. No silent concatenation anywhere.
 *
 * Cache keys are additionally BRANDED (`CacheKey`): the only constructor
 * is `cacheKey()`, and cache invalidation (cache.ts) accepts nothing
 * else — plus a runtime prefix guard — so invalidation can only ever
 * touch cache-namespace keys BY CONSTRUCTION.
 *
 * This module is PURE: no I/O, no clock, no randomness.
 */

import { sha256Hex } from "../lib/hash";

/** The workspace's Redis namespace root. */
export const REDIS_KEY_ROOT = "aise";
/** The key-schema version (bump to migrate the whole transient keyspace). */
export const REDIS_KEY_VERSION = "v1";
/** The key-part separator. */
const SEPARATOR = ":";

/**
 * Percent-encode one key part: `%` and `:` are escaped so the separator
 * can never appear inside a part. Collision-safe and reversible.
 */
export function encodeKeyPart(part: string): string {
  let encoded = "";
  for (const char of part) {
    if (char === "%" || char === SEPARATOR) {
      encoded += `%${char.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase()}`;
    } else {
      encoded += char;
    }
  }
  return encoded;
}

/** Build a raw Redis key from scope parts under the versioned root. */
export function buildRedisKey(...parts: readonly string[]): string {
  return [REDIS_KEY_ROOT, REDIS_KEY_VERSION, ...parts.map(encodeKeyPart)].join(SEPARATOR);
}

/* ------------------------------------------------------------------ */
/* Cache keys (branded — the only keys invalidation may touch)          */
/* ------------------------------------------------------------------ */

/**
 * A cache-namespace key. Constructible ONLY via `cacheKey()`; carrying
 * this type is proof the key lives under the cache namespace, which is
 * what lets cache invalidation be structurally unable to touch
 * non-cache (canonical-adjacent) keys.
 */
export interface CacheKey {
  readonly kind: "cache";
  readonly key: string;
}

export interface CacheKeyInput {
  /** Owning tenant scope (empty string for the unscoped dev default). */
  readonly tenant: string;
  /** Owning project scope. */
  readonly projectId: string;
  /** The cached thing's name within the scope (e.g. "reconstruction:status"). */
  readonly name: string;
}

/** The literal prefix every cache key starts with (runtime guard datum). */
export function cacheKeyPrefix(): string {
  return buildRedisKey("cache");
}

/** Build a tenant/project-scoped, collision-safe cache key. */
export function cacheKey(input: CacheKeyInput): CacheKey {
  return {
    kind: "cache",
    key: buildRedisKey("cache", input.tenant, input.projectId, input.name),
  };
}

/* ------------------------------------------------------------------ */
/* Rate-limit keys                                                      */
/* ------------------------------------------------------------------ */

/**
 * Build a rate-limit counter key for one fixed window: the scope +
 * identifier + the window's index. The key's TTL equals the window
 * length, so counters die with their window (bounded state).
 */
export function rateLimitKey(scope: string, identifier: string, windowIndex: number): string {
  return buildRedisKey("rl", scope, identifier, String(windowIndex));
}

/** The rate-limit namespace prefix (used by boundedness tests). */
export function rateLimitKeyPrefix(): string {
  return buildRedisKey("rl");
}

/* ------------------------------------------------------------------ */
/* Job keys                                                             */
/* ------------------------------------------------------------------ */

export interface JobKeyInput {
  /** The job queue's name (e.g. "reconstruction"). */
  readonly queue: string;
  /** The caller-supplied idempotency key (arbitrary string). */
  readonly idempotencyKey: string;
}

/**
 * Derive a job's id: sha-256 over the queue + idempotency key. This is
 * the retry-safety cornerstone — every enqueue of the same
 * (queue, idempotencyKey) computes the SAME id, so a duplicate/retried
 * enqueue addresses the identical record and is a no-op returning the
 * existing job (no separate index key to keep consistent, no
 * create-twice race window).
 */
export function jobIdFromIdempotencyKey(input: JobKeyInput): string {
  return sha256Hex(`${input.queue}\n${input.idempotencyKey}`);
}

/** The storage key of a job record (queue-scoped, id-addressed). */
export function jobKey(input: JobKeyInput): string {
  return buildRedisKey("job", input.queue, jobIdFromIdempotencyKey(input));
}

/** The job namespace prefix (used by tests to prove scoping). */
export function jobKeyPrefix(): string {
  return buildRedisKey("job");
}
