/**
 * Deterministic in-memory Redis twin — PROD-007.
 *
 * The reference implementation of `RedisClientPort`: used directly in
 * tests, as the outage wrapper's degradation fallback (outage.ts), and as
 * the honest no-credentials mode of the env factory (index.ts — explicit
 * memory mode, never a silent pretend-upstash).
 *
 * Determinism contract:
 *  - the clock is INJECTED (`RedisClock`, epoch ms — no `Date.now()`
 *    internals), so TTL expiry is deterministic and testable;
 *  - no randomness, no I/O; the same call sequence plus the same clock
 *    readings produce byte-identical outcomes;
 *  - expiry is lazily evaluated on access AND swept on every write, so
 *    the map stays bounded: a key is unreachable the instant its TTL
 *    elapses, and swept storage cannot grow without bound across
 *    TTL-expiring writes (the transient-state discipline).
 */

import {
  redisFailure,
  validateTtlSeconds,
  type RedisClock,
  type RedisClientPort,
  type RedisDeleteResult,
  type RedisExpireResult,
  type RedisGetResult,
  type RedisIncrementResult,
  type RedisSetResult,
} from "./model";

/** A stored entry: a string value plus its absolute expiry (null = never). */
interface MemoryEntry {
  readonly value: string;
  expiresAtMs: number | null;
}

export interface MemoryRedisClientOptions {
  /** Injected clock (epoch ms) — REQUIRED, never defaulted internally. */
  readonly clock: RedisClock;
}

/**
 * The in-memory Redis twin. One instance is one isolated keyspace (the
 * tests' hermetic world; the outage wrapper's degradation sandbox).
 */
export class MemoryRedisClient implements RedisClientPort {
  readonly mode = "memory" as const;

  private readonly clock: RedisClock;
  private readonly entries = new Map<string, MemoryEntry>();

  constructor(options: MemoryRedisClientOptions) {
    this.clock = options.clock;
  }

  /** The injected clock seam (epoch ms), exposed for wrapper composition. */
  get injectedClock(): RedisClock {
    return this.clock;
  }

  async get(key: string): Promise<RedisGetResult> {
    const now = this.clock();
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return { ok: true, value: null };
    }
    if (isExpired(entry, now)) {
      this.entries.delete(key);
      return { ok: true, value: null };
    }
    return { ok: true, value: entry.value };
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<RedisSetResult> {
    const invalid = validateTtlSeconds(ttlSeconds);
    if (invalid !== null) {
      return { ok: false, failure: redisFailure("protocol_error", invalid) };
    }
    const now = this.clock();
    this.sweepExpired(now);
    this.entries.set(key, { value, expiresAtMs: now + ttlSeconds * 1000 });
    return { ok: true, value: true };
  }

  async delete(key: string): Promise<RedisDeleteResult> {
    const now = this.clock();
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return { ok: true, value: false };
    }
    if (isExpired(entry, now)) {
      this.entries.delete(key);
      return { ok: true, value: false };
    }
    this.entries.delete(key);
    return { ok: true, value: true };
  }

  async expire(key: string, ttlSeconds: number): Promise<RedisExpireResult> {
    const invalid = validateTtlSeconds(ttlSeconds);
    if (invalid !== null) {
      return { ok: false, failure: redisFailure("protocol_error", invalid) };
    }
    const now = this.clock();
    const entry = this.entries.get(key);
    if (entry === undefined || isExpired(entry, now)) {
      if (entry !== undefined) {
        this.entries.delete(key);
      }
      return { ok: true, value: false };
    }
    this.entries.set(key, { value: entry.value, expiresAtMs: now + ttlSeconds * 1000 });
    return { ok: true, value: true };
  }

  async increment(key: string, ttlSeconds: number): Promise<RedisIncrementResult> {
    const invalid = validateTtlSeconds(ttlSeconds);
    if (invalid !== null) {
      return { ok: false, failure: redisFailure("protocol_error", invalid) };
    }
    const now = this.clock();
    const entry = this.entries.get(key);
    if (entry === undefined || isExpired(entry, now)) {
      // Created by this call: the counter starts at 1 with the fresh TTL.
      this.entries.set(key, { value: "1", expiresAtMs: now + ttlSeconds * 1000 });
      return { ok: true, value: 1 };
    }
    const current = Number.parseInt(entry.value, 10);
    if (!Number.isFinite(current)) {
      return {
        ok: false,
        failure: redisFailure("protocol_error", `key holds a non-integer value and cannot be incremented`),
      };
    }
    const next = current + 1;
    // Existing unexpired key KEEPS its original TTL (INCR + EXPIRE NX).
    this.entries.set(key, { value: String(next), expiresAtMs: entry.expiresAtMs });
    return { ok: true, value: next };
  }

  /**
   * Remove every expired entry. Called on every write so live storage is
   * bounded by the TTL horizon, never by total write count. Deterministic:
   * Map iteration order is insertion order, and deletion is idempotent.
   */
  private sweepExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (isExpired(entry, now)) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Test/diagnostic snapshot: the live (unexpired) keys with values, in
   * insertion order — deterministic, no clock reads (uses the supplied
   * `now`). Used by tests to prove boundedness and TTL discipline.
   */
  liveEntries(now: number): readonly { readonly key: string; readonly value: string }[] {
    const live: { key: string; value: string }[] = [];
    for (const [key, entry] of this.entries) {
      if (!isExpired(entry, now)) {
        live.push({ key, value: entry.value });
      }
    }
    return live;
  }
}

/** A key is expired the instant `now` reaches its absolute expiry. */
function isExpired(entry: MemoryEntry, now: number): boolean {
  return entry.expiresAtMs !== null && now >= entry.expiresAtMs;
}
