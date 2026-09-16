/**
 * Cache-aside tests — PROD-007.
 *
 * Proves the work order's headline safety rule — CACHE INVALIDATION
 * CANNOT CORRUPT CANONICAL STATE — three independent ways:
 *
 *  1. STRUCTURAL: the canonical interaction is a caller-supplied
 *     READ-ONLY loader; the module writes ONLY to the branded cache key
 *     (the memory twin's live keys are asserted to contain exactly the
 *     cache key after a write-through read).
 *  2. BEHAVIORAL: invalidation never invokes the canonical loader, and
 *     a hit never does either — the canonical store is untouched.
 *  3. GUARDED: a defensively-cast foreign key is refused with a typed
 *     protocol error instead of deleting outside the cache namespace.
 *
 * Also proves explicit TTLs on cached writes and honest degradation on
 * Redis typed-failures. Determinism: injected clock, no I/O, no network.
 */

import { describe, expect, test } from "bun:test";
import { invalidateCacheKey, invalidateCacheKeys, readThroughCache } from "./cache";
import { cacheKey } from "./keys";
import { MemoryRedisClient } from "./client-memory";
import type { RedisClientPort } from "./model";

/** A canonical source that records EVERY interaction with it. */
class CanonicalSource {
  reads = 0;
  writes = 0;
  value: string | null;

  constructor(value: string | null) {
    this.value = value;
  }

  get loader(): () => Promise<string | null> {
    return async () => {
      this.reads += 1;
      return this.value;
    };
  }

  /** Any canonical mutation attempt (must NEVER be reachable from cache.ts). */
  async mutate(): Promise<void> {
    this.writes += 1;
  }
}

const identityCodec = {
  serialize: (value: string) => value,
  deserialize: (raw: string) => raw as string | null,
};

describe("readThroughCache (cache-aside)", () => {
  test("miss → canonical load → write-through to the CACHE key only", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    const canonical = new CanonicalSource("canonical-value");
    const key = cacheKey({ tenant: "t", projectId: "p", name: "n" });

    const first = await readThroughCache({
      client,
      key,
      ttlSeconds: 120,
      load: canonical.loader,
      ...identityCodec,
    });
    expect(first).toEqual({ source: "canonical", value: "canonical-value", degraded: false });
    expect(canonical.reads).toBe(1);

    // STRUCTURAL PROOF: the only key the cache family ever wrote is the
    // branded cache key — the canonical store is not Redis-addressable
    // from this module at all.
    expect(client.liveEntries(clock.now())).toEqual([{ key: key.key, value: "canonical-value" }]);

    const second = await readThroughCache({
      client,
      key,
      ttlSeconds: 120,
      load: canonical.loader,
      ...identityCodec,
    });
    expect(second).toEqual({ source: "cache", value: "canonical-value", degraded: false });
    // BEHAVIORAL PROOF: the hit never touched the canonical source.
    expect(canonical.reads).toBe(1);
    expect(canonical.writes).toBe(0);
  });

  test("the cached write honors the EXPLICIT TTL", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    const canonical = new CanonicalSource("v");
    const key = cacheKey({ tenant: "t", projectId: "p", name: "n" });
    await readThroughCache({ client, key, ttlSeconds: 30, load: canonical.loader, ...identityCodec });
    clock.advance(29_999);
    expect((await readThroughCache({ client, key, ttlSeconds: 30, load: canonical.loader, ...identityCodec })).source).toBe("cache");
    clock.advance(1);
    const after = await readThroughCache({ client, key, ttlSeconds: 30, load: canonical.loader, ...identityCodec });
    expect(after.source).toBe("canonical");
    expect(canonical.reads).toBe(2);
  });

  test("a canonical miss (null) is never cached and reports source miss", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    const canonical = new CanonicalSource(null);
    const key = cacheKey({ tenant: "t", projectId: "p", name: "n" });
    const result = await readThroughCache({ client, key, ttlSeconds: 60, load: canonical.loader, ...identityCodec });
    expect(result).toEqual({ source: "miss", value: null, degraded: false });
    expect(client.liveEntries(clock.now())).toEqual([]);
  });

  test("an undecodable cache entry is a miss — canonical stays the shape authority", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    const key = cacheKey({ tenant: "t", projectId: "p", name: "n" });
    await client.set(key.key, "not-the-right-shape", 60);
    const canonical = new CanonicalSource("fresh");
    const result = await readThroughCache({
      client,
      key,
      ttlSeconds: 60,
      load: canonical.loader,
      serialize: identityCodec.serialize,
      deserialize: () => null,
    });
    expect(result.source).toBe("canonical");
    expect(result.value).toBe("fresh");
  });

  test("a Redis typed-failure degrades honestly: canonical value, degraded flag, no throw", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    const key = cacheKey({ tenant: "t", projectId: "p", name: "n" });
    // Poison only the read path with a typed failure via a failing wrapper.
    const failing: RedisClientPort = {
      mode: "memory",
      get: async () => ({ ok: false, failure: { kind: "unavailable", detail: "redis rest answered HTTP 503" } }),
      set: (k, v, ttl) => client.set(k, v, ttl),
      delete: (k) => client.delete(k),
      expire: (k, ttl) => client.expire(k, ttl),
      increment: (k, ttl) => client.increment(k, ttl),
    };
    const canonical = new CanonicalSource("still-available");
    const result = await readThroughCache({ client: failing, key, ttlSeconds: 60, load: canonical.loader, ...identityCodec });
    expect(result).toEqual({ source: "canonical", value: "still-available", degraded: true });
    expect(canonical.reads).toBe(1);
    // Degraded reads do not attempt further cache writes.
    expect(client.liveEntries(clock.now())).toEqual([]);
  });
});

describe("invalidateCacheKey (the by-construction guarantee)", () => {
  test("deletes the cache entry and NEVER touches the canonical source", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    const canonical = new CanonicalSource("v");
    const key = cacheKey({ tenant: "t", projectId: "p", name: "n" });
    await readThroughCache({ client, key, ttlSeconds: 60, load: canonical.loader, ...identityCodec });
    expect(client.liveEntries(clock.now())).toHaveLength(1);

    const result = await invalidateCacheKey(client, key);
    expect(result).toEqual({ ok: true, value: true });
    expect(client.liveEntries(clock.now())).toEqual([]);
    // BEHAVIORAL PROOF: invalidation performed zero canonical reads and
    // the canonical source recorded zero writes — there is no path.
    expect(canonical.reads).toBe(1);
    expect(canonical.writes).toBe(0);
  });

  test("invalidating an absent key is an ok no-op (false)", async () => {
    const client = new MemoryRedisClient({ clock: makeClock().now });
    const result = await invalidateCacheKey(client, cacheKey({ tenant: "t", projectId: "p", name: "n" }));
    expect(result).toEqual({ ok: true, value: false });
  });

  test("invalidateCacheKeys removes several scoped keys at once", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    const canonical = new CanonicalSource("v");
    const keys = [
      cacheKey({ tenant: "t", projectId: "p1", name: "n" }),
      cacheKey({ tenant: "t", projectId: "p2", name: "n" }),
      cacheKey({ tenant: "other", projectId: "p1", name: "n" }),
    ];
    for (const key of keys) {
      await readThroughCache({ client, key, ttlSeconds: 60, load: canonical.loader, ...identityCodec });
    }
    expect(client.liveEntries(clock.now())).toHaveLength(3);
    const result = await invalidateCacheKeys(client, keys);
    expect(result).toEqual({ ok: true, value: [true, true, true] });
    expect(client.liveEntries(clock.now())).toEqual([]);
    expect(canonical.reads).toBe(3);
  });

  test("a defensively-cast FOREIGN key is refused — nothing outside the cache namespace is deleted", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    // A canonical-adjacent key living in the SAME redis (proves the
    // guard: even same-store foreign keys are untouchable).
    await client.set("aise:v1:job:queue:job-id", "canonical-adjacent-record", 60);
    const foreign = { kind: "cache", key: "aise:v1:job:queue:job-id" } as ReturnType<typeof cacheKey>;

    const result = await invalidateCacheKey(client, foreign);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("protocol_error");
      expect(result.failure.detail).toContain("outside the cache namespace");
    }
    // The foreign record is untouched.
    expect(await client.get("aise:v1:job:queue:job-id")).toEqual({
      ok: true,
      value: "canonical-adjacent-record",
    });
  });
});

/** Mutable injected clock. */
function makeClock(startMs = 1_000_000) {
  let now = startMs;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
