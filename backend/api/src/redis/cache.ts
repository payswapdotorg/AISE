/**
 * Cache-aside helpers — PROD-007.
 *
 * The read path pattern over `RedisClientPort`, with the work order's
 * safety rule made STRUCTURAL:
 *
 *  - CANONICAL STATE IS NEVER WRITTEN THROUGH THE CACHE. The only
 *    canonical interaction is the caller-supplied `load` function (a
 *    READ-ONLY loader). The cache writes exclusively to CACHE-NAMESPACE
 *    keys via the port's `set`, and invalidation deletes exclusively
 *    cache-namespace keys — there is no code path from this module to
 *    any canonical store. Invalidation therefore cannot corrupt
 *    canonical state BY CONSTRUCTION, and the colocated tests prove it
 *    (a canonical loader that records every call, plus the branded-key
 *    and runtime-prefix guards).
 *  - EXPLICIT TTL on every cached write (required `ttlSeconds`, no
 *    default anywhere in this module).
 *  - HONEST DEGRADATION: when Redis answers a typed failure, the read
 *    falls through to the canonical loader and reports `degraded: true`
 *    — availability first, never a thrown error, never a fabricated
 *    cache hit.
 *  - SERIALIZATION IS INJECTED: the port is string-typed; callers own
 *    the codec (JSON by convention). A deserialize failure treats the
 *    entry as a miss (the cache is never authoritative over the shape).
 */

import { cacheKeyPrefix, type CacheKey } from "./keys";
import { type RedisClientPort, type RedisFailure, type RedisOutcome } from "./model";

/** Where a cache-aside read's value came from. */
export type CacheReadSource =
  /** A live cache entry was deserialized and returned. */
  | "cache"
  /** The canonical loader produced a value (cache miss or degraded). */
  | "canonical"
  /** The canonical loader produced nothing (no value exists to cache). */
  | "miss";

export interface CacheReadResult<T> {
  readonly source: CacheReadSource;
  readonly value: T | null;
  /** True when a Redis typed-failure forced the canonical path. */
  readonly degraded: boolean;
}

export interface CacheReadOptions<T> {
  /** The Redis port (cache-namespace access only). */
  readonly client: RedisClientPort;
  /** The cache key — MUST come from `cacheKey()` (branded). */
  readonly key: CacheKey;
  /** Explicit TTL for the cached value (seconds, > 0). Required. */
  readonly ttlSeconds: number;
  /** READ-ONLY canonical loader. The ONLY canonical interaction. */
  readonly load: () => Promise<T | null>;
  /** Encode a canonical value for the string-typed port. */
  readonly serialize: (value: T) => string;
  /** Decode a cached string; returning null treats the entry as a miss. */
  readonly deserialize: (raw: string) => T | null;
}

/**
 * Cache-aside read: cache hit → return it; miss → canonical `load()` →
 * write-through to the CACHE key only → return the canonical value.
 * Redis typed-failures degrade to the canonical path (flagged, never
 * thrown, never fatal).
 */
export async function readThroughCache<T>(options: CacheReadOptions<T>): Promise<CacheReadResult<T>> {
  const { client, key, ttlSeconds, load, serialize, deserialize } = options;

  const cached = await client.get(key.key);
  if (cached.ok) {
    if (cached.value === null) {
      // Cache miss: fall through to the canonical loader below.
    } else {
      const decoded = deserialize(cached.value);
      if (decoded !== null) {
        return { source: "cache", value: decoded, degraded: false };
      }
      // Undecodable cache entry: treat as a miss (canonical is the
      // authority on shape, the cache never is).
    }
  } else {
    // Typed Redis failure: degrade honestly — read canonical, never
    // throw, and do not attempt further Redis calls on this request.
    const value = await load();
    return { source: value === null ? "miss" : "canonical", value, degraded: true };
  }

  const value = await load();
  if (value === null) {
    return { source: "miss", value: null, degraded: false };
  }
  const write = await client.set(key.key, serialize(value), ttlSeconds);
  return {
    source: "canonical",
    value,
    degraded: !write.ok,
  };
}

/** Invalidate exactly one cache key (branded; runtime-guarded). */
export async function invalidateCacheKey(
  client: RedisClientPort,
  key: CacheKey,
): Promise<RedisOutcome<boolean>> {
  const guard = cacheNamespaceGuard(key);
  if (guard !== null) {
    return { ok: false, failure: guard };
  }
  return client.delete(key.key);
}

/** Invalidate several cache keys in one call (each branded; each guarded). */
export async function invalidateCacheKeys(
  client: RedisClientPort,
  keys: readonly CacheKey[],
): Promise<RedisOutcome<readonly boolean[]>> {
  const results: boolean[] = [];
  for (const key of keys) {
    const result = await invalidateCacheKey(client, key);
    if (!result.ok) {
      return result;
    }
    results.push(result.value);
  }
  return { ok: true, value: results };
}

/**
 * Runtime guard of the by-construction rule: a cache key MUST live under
 * the versioned cache namespace. `CacheKey` is branded (only `cacheKey()`
 * builds it), and this check makes the guarantee runtime-enforced as
 * well — a defensively-cast foreign key is refused with a typed
 * protocol error instead of deleting outside the cache namespace.
 */
function cacheNamespaceGuard(key: CacheKey): RedisFailure | null {
  const prefix = `${cacheKeyPrefix()}:`;
  if (typeof key.key !== "string" || !key.key.startsWith(prefix) || key.kind !== "cache") {
    return {
      kind: "protocol_error",
      detail: "refusing to invalidate a key outside the cache namespace",
    };
  }
  return null;
}
