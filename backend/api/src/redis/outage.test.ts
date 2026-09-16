/**
 * Outage degradation tests — PROD-007.
 *
 * Proves the acceptance "Redis outage degrades safely": a primary typed
 * failure switches the wrapper to the memory fallback WITHOUT failing
 * the in-flight call, records a loud (queryable) outage event, and —
 * after the probe interval — recovers to the primary when it heals.
 * Determinism: injected clock + scripted failing/healthy primaries.
 */

import { describe, expect, test } from "bun:test";
import { MemoryRedisClient } from "./client-memory";
import { OutageTolerantRedis, withMemoryFallback } from "./outage";
import type { RedisClientPort, RedisFailure } from "./model";

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

/** A scripted primary: fails while `failing` is true, then answers from `healthy`. */
class ScriptedPrimary implements RedisClientPort {
  readonly mode = "upstash" as const;
  failing = true;
  readonly failure: RedisFailure = { kind: "unavailable", detail: "redis rest answered HTTP 503" };
  calls = 0;

  constructor(private readonly healthy: RedisClientPort) {}

  private run<T extends { ok: boolean }>(call: () => Promise<T>): Promise<T> {
    this.calls += 1;
    if (this.failing) {
      return Promise.resolve({ ok: false, failure: this.failure } as unknown as T);
    }
    return call();
  }

  get(key: string) {
    return this.run(() => this.healthy.get(key));
  }
  set(key: string, value: string, ttlSeconds: number) {
    return this.run(() => this.healthy.set(key, value, ttlSeconds));
  }
  delete(key: string) {
    return this.run(() => this.healthy.delete(key));
  }
  expire(key: string, ttlSeconds: number) {
    return this.run(() => this.healthy.expire(key, ttlSeconds));
  }
  increment(key: string, ttlSeconds: number) {
    return this.run(() => this.healthy.increment(key, ttlSeconds));
  }
}

function makeWrapper(clock: () => number, retryAfterMs = 30_000) {
  const primary = new ScriptedPrimary(new MemoryRedisClient({ clock }));
  const fallback = new MemoryRedisClient({ clock });
  const wrapper = new OutageTolerantRedis({ primary, fallback, clock, retryAfterMs });
  return { primary, fallback, wrapper };
}

describe("degradation on primary typed-failure", () => {
  test("the discovering call still succeeds via the fallback; the outage is recorded loudly", async () => {
    const clock = makeClock();
    const { wrapper } = makeWrapper(clock.now);
    expect(wrapper.mode).toBe("upstash");

    const result = await wrapper.set("k", "v", 60);
    expect(result).toEqual({ ok: true, value: true });
    // Loud: mode flipped, timestamp recorded, event queryable.
    expect(wrapper.currentMode()).toBe("memory");
    expect(wrapper.lastOutageAt()).toBe(1_000_000);
    expect(wrapper.outageEvents()).toHaveLength(1);
    const event = wrapper.outageEvents()[0];
    expect(event).toEqual({
      atMs: 1_000_000,
      operation: "set",
      kind: "unavailable",
      detail: "primary redis unavailable: redis rest answered HTTP 503 — serving from the in-memory fallback",
    });
  });

  test("subsequent calls serve from the fallback (sticky) without probing early", async () => {
    const clock = makeClock();
    const { primary, wrapper } = makeWrapper(clock.now);
    await wrapper.set("k", "v", 60);
    expect(primary.calls).toBe(1);

    clock.advance(29_999);
    const cached = await wrapper.get("k");
    expect(cached).toEqual({ ok: true, value: "v" });
    expect(primary.calls).toBe(1); // no probe before retryAfterMs
    expect(wrapper.currentMode()).toBe("memory");
  });

  test("the fallback state answers coherently (reads see fallback writes)", async () => {
    const clock = makeClock();
    const { wrapper } = makeWrapper(clock.now);
    await wrapper.set("shared", "1", 60);
    expect(await wrapper.get("shared")).toEqual({ ok: true, value: "1" });
    expect(await wrapper.increment("counter", 60)).toEqual({ ok: true, value: 1 });
    expect(await wrapper.delete("shared")).toEqual({ ok: true, value: true });
  });
});

describe("recovery after the probe interval", () => {
  test("a successful probe flips back to upstash and records the recovery", async () => {
    const clock = makeClock();
    const { primary, wrapper } = makeWrapper(clock.now);
    await wrapper.set("k", "v", 60);
    expect(wrapper.currentMode()).toBe("memory");

    clock.advance(30_000); // retryAfterMs elapses
    primary.failing = false;
    const probed = await wrapper.get("k");
    expect(probed).toEqual({ ok: true, value: null }); // the healthy primary's keyspace
    expect(wrapper.currentMode()).toBe("upstash");
    expect(wrapper.lastRecoveryAt()).toBe(1_030_000);
    expect(wrapper.outageEvents()).toHaveLength(1); // one outage, one recovery
  });

  test("a failed probe re-degrades and pushes the next probe out", async () => {
    const clock = makeClock();
    const { primary, wrapper } = makeWrapper(clock.now);
    await wrapper.set("k", "v", 60);
    clock.advance(30_000);
    // Primary still failing: the probe call itself still succeeds via fallback.
    const probed = await wrapper.get("k");
    expect(probed).toEqual({ ok: true, value: "v" });
    expect(wrapper.currentMode()).toBe("memory");
    expect(wrapper.outageEvents()).toHaveLength(2);

    clock.advance(29_999);
    expect((await wrapper.get("k")).ok).toBe(true);
    expect(primary.calls).toBe(2); // initial + probe; no re-probe before the pushed-out time
    clock.advance(1);
    await wrapper.get("k");
    expect(primary.calls).toBe(3); // the pushed-out probe happened
  });

  test("multiple outages accumulate as chronological events", async () => {
    const clock = makeClock();
    const { primary, wrapper } = makeWrapper(clock.now);
    await wrapper.set("a", "1", 60);
    clock.advance(30_000);
    await wrapper.get("a"); // failed probe → event 2
    clock.advance(30_000);
    primary.failing = false;
    await wrapper.get("a"); // recovery
    primary.failing = true;
    await wrapper.set("b", "2", 60); // fresh outage → event 3
    expect(wrapper.outageEvents()).toHaveLength(3);
    expect(wrapper.outageEvents().map((event) => event.atMs)).toEqual([1_000_000, 1_030_000, 1_060_000]);
    expect(wrapper.lastOutageAt()).toBe(1_060_000);
  });
});

describe("withMemoryFallback composition", () => {
  test("composes an upstash primary with a fresh memory twin on the shared clock", async () => {
    const clock = makeClock();
    const primary = new ScriptedPrimary(new MemoryRedisClient({ clock: clock.now }));
    const wrapper = withMemoryFallback(primary, clock.now, 10_000);
    expect(wrapper.mode).toBe("upstash");
    expect(await wrapper.increment("c", 30)).toEqual({ ok: true, value: 1 });
    expect(wrapper.currentMode()).toBe("memory");
  });
});
