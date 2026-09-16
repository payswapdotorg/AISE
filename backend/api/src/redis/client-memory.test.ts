/**
 * Memory client tests — PROD-007.
 *
 * Proves the deterministic twin's contract: TTL expiry honored via the
 * INJECTED clock (never Date.now internals), explicit-TTL enforcement,
 * increment's created-vs-existing TTL semantics, and bounded storage
 * (swept expired keys). Determinism: one mutable injected clock, no I/O.
 */

import { describe, expect, test } from "bun:test";
import { MemoryRedisClient } from "./client-memory";

/** A mutable injected clock: tests advance time explicitly. */
function makeClock(startMs = 1_000_000) {
  let now = startMs;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    set: (ms: number) => {
      now = ms;
    },
  };
}

describe("MemoryRedisClient basics", () => {
  test("mode is memory (honest, health-visible)", () => {
    const client = new MemoryRedisClient({ clock: makeClock().now });
    expect(client.mode).toBe("memory");
  });

  test("set/get round-trips a string within the TTL; absent keys read null", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    expect(await client.set("k", "v", 60)).toEqual({ ok: true, value: true });
    expect(await client.get("k")).toEqual({ ok: true, value: "v" });
    expect(await client.get("missing")).toEqual({ ok: true, value: null });
  });

  test("delete reports whether an unexpired key was removed", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    await client.set("k", "v", 60);
    expect(await client.delete("k")).toEqual({ ok: true, value: true });
    expect(await client.delete("k")).toEqual({ ok: true, value: false });
  });

  test("expire refreshes an existing key's TTL and reports missing keys", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    await client.set("k", "v", 60);
    expect(await client.expire("k", 3600)).toEqual({ ok: true, value: true });
    // Outlives the original 60s TTL after the refresh.
    clock.advance(120_000);
    expect(await client.get("k")).toEqual({ ok: true, value: "v" });
    expect(await client.expire("gone", 60)).toEqual({ ok: true, value: false });
  });
});

describe("TTL expiry is deterministic via the injected clock", () => {
  test("a key dies exactly when its TTL elapses", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    await client.set("k", "v", 10);
    clock.advance(9_999);
    expect(await client.get("k")).toEqual({ ok: true, value: "v" });
    clock.advance(1);
    expect(await client.get("k")).toEqual({ ok: true, value: null });
  });

  test("delete on an expired key reports false (it is already gone)", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    await client.set("k", "v", 5);
    clock.advance(5_000);
    expect(await client.delete("k")).toEqual({ ok: true, value: false });
  });

  test("the same call sequence plus clock readings is byte-identical (twin determinism)", async () => {
    const run = async () => {
      const clock = makeClock(5_000);
      const client = new MemoryRedisClient({ clock: clock.now });
      await client.set("a", "1", 10);
      clock.advance(1_000);
      await client.increment("b", 10);
      await client.increment("b", 10);
      await client.set("a", "2", 10);
      clock.advance(500);
      return {
        a: await client.get("a"),
        b: await client.get("b"),
        live: client.liveEntries(clock.now()),
      };
    };
    expect(await run()).toEqual(await run());
  });
});

describe("explicit-TTL enforcement on every write path", () => {
  test("set/increment/expire reject zero, negative and fractional TTLs as typed protocol errors", async () => {
    const client = new MemoryRedisClient({ clock: makeClock().now });
    for (const bad of [0, -1, 2.5]) {
      const setResult = await client.set("k", "v", bad);
      expect(setResult.ok).toBe(false);
      if (!setResult.ok) {
        expect(setResult.failure.kind).toBe("protocol_error");
        expect(setResult.failure.detail).toContain("ttlSeconds must be an integer >= 1");
      }
      const incrResult = await client.increment("k", bad);
      expect(incrResult.ok).toBe(false);
      const expResult = await client.expire("k", bad);
      expect(expResult.ok).toBe(false);
    }
    // Nothing was written by the rejected calls.
    expect(await client.get("k")).toEqual({ ok: true, value: null });
  });
});

describe("increment semantics (the counter/window discipline)", () => {
  test("a created counter starts at 1 with the fresh TTL", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    expect(await client.increment("c", 30)).toEqual({ ok: true, value: 1 });
    expect(await client.increment("c", 30)).toEqual({ ok: true, value: 2 });
    // The created key's TTL (30s) is honored — INCR + EXPIRE NX semantics.
    clock.advance(29_999);
    expect(await client.get("c")).toEqual({ ok: true, value: "2" });
    clock.advance(1);
    expect(await client.get("c")).toEqual({ ok: true, value: null });
  });

  test("an existing unexpired counter KEEPS its original TTL across increments", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    await client.increment("c", 10);
    clock.advance(5_000);
    await client.increment("c", 999); // must NOT stretch the window
    expect(await client.increment("c", 999)).toEqual({ ok: true, value: 3 });
    clock.advance(5_000); // 10s after creation
    expect(await client.get("c")).toEqual({ ok: true, value: null });
  });

  test("incrementing a key holding a non-integer is a typed protocol error", async () => {
    const client = new MemoryRedisClient({ clock: makeClock().now });
    await client.set("text", "not-a-number", 60);
    const result = await client.increment("text", 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("protocol_error");
    }
  });
});

describe("bounded storage (transient state only)", () => {
  test("writes sweep expired keys: storage stays bounded by the TTL horizon", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    let maxObserved = 0;
    const internalSize = () =>
      (client as unknown as { entries: Map<string, unknown> }).entries.size;
    // 100 distinct short-TTL keys, each dying before the next write.
    for (let index = 0; index < 100; index += 1) {
      await client.set(`k${index}`, String(index), 1);
      maxObserved = Math.max(maxObserved, internalSize());
      clock.advance(2_000);
    }
    // Storage never grew with the WRITE COUNT (100 writes): at most the
    // newest key plus one not-yet-swept expired predecessor were held.
    expect(maxObserved).toBeLessThanOrEqual(2);
    // The newest key is unreachable the instant its TTL elapses...
    expect(client.liveEntries(clock.now())).toEqual([]);
    // ...and the next write sweeps its corpse: the map returns to <= 1.
    await client.set("final", "f", 1);
    expect(internalSize()).toBe(1);
  });
});
