/**
 * Rate-limit tests — PROD-007.
 *
 * Proves BOUNDED fixed-window limiting: the per-window budget (allow at
 * the limit, deny past it with a precise retry-after), the window
 * rollover (fresh budget, dead counter), and STATE BOUNDEDNESS — every
 * counter key dies with its window, so unlimited identifiers over
 * unlimited time still hold only the live windows' worth of keys.
 * Also proves fail-open degradation on Redis typed-failures.
 * Determinism: injected clock, no I/O.
 */

import { describe, expect, test } from "bun:test";
import { MemoryRedisClient } from "./client-memory";
import { consumeRateLimit } from "./ratelimit";
import { rateLimitKeyPrefix } from "./keys";
import type { RedisClientPort, RedisFailure } from "./model";

/** Mutable injected clock. */
function makeClock(startMs = 0) {
  let now = startMs;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

/** A port that fails every call with one typed failure. */
class AlwaysFailingClient implements RedisClientPort {
  readonly mode = "memory" as const;
  constructor(private readonly failure: RedisFailure) {}
  async get(): Promise<{ ok: false; failure: RedisFailure }> {
    return { ok: false, failure: this.failure };
  }
  async set(): Promise<{ ok: false; failure: RedisFailure }> {
    return { ok: false, failure: this.failure };
  }
  async delete(): Promise<{ ok: false; failure: RedisFailure }> {
    return { ok: false, failure: this.failure };
  }
  async expire(): Promise<{ ok: false; failure: RedisFailure }> {
    return { ok: false, failure: this.failure };
  }
  async increment(): Promise<{ ok: false; failure: RedisFailure }> {
    return { ok: false, failure: this.failure };
  }
}

function makeLimiter(client: RedisClientPort, clock: () => number, max = 3, windowSeconds = 60) {
  return {
    take: (identifier: string) =>
      consumeRateLimit({ client, windowSeconds, max, clock }, { scope: "api", identifier }),
  };
}

describe("fixed-window budget", () => {
  test("allows exactly max requests per window, then denies with a precise retry-after", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(new MemoryRedisClient({ clock: clock.now }), clock.now, 3, 60);

    for (let i = 1; i <= 3; i += 1) {
      const decision = await limiter.take("tenant-1");
      expect(decision.allowed).toBe(true);
      expect(decision.remaining).toBe(3 - i);
      expect(decision.retryAfterSeconds).toBe(0);
      expect(decision.degraded).toBe(false);
    }
    const denied = await limiter.take("tenant-1");
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.limit).toBe(3);
    expect(denied.windowSeconds).toBe(60);
    expect(denied.retryAfterSeconds).toBe(60);
    expect(denied.degraded).toBe(false);
  });

  test("the reported remaining never grows past the limit (decision stays bounded)", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(new MemoryRedisClient({ clock: clock.now }), clock.now, 2, 60);
    await limiter.take("t");
    await limiter.take("t");
    for (let i = 0; i < 10; i += 1) {
      const decision = await limiter.take("t");
      expect(decision.allowed).toBe(false);
      expect(decision.remaining).toBe(0);
    }
  });

  test("identifiers are isolated within a scope", async () => {
    const clock = makeClock();
    const limiter = makeLimiter(new MemoryRedisClient({ clock: clock.now }), clock.now, 1, 60);
    expect((await limiter.take("tenant-a")).allowed).toBe(true);
    expect((await limiter.take("tenant-a")).allowed).toBe(false);
    expect((await limiter.take("tenant-b")).allowed).toBe(true);
  });
});

describe("window rollover", () => {
  test("a new window means a fresh budget and a dead counter key", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    const limiter = makeLimiter(client, clock.now, 1, 60);
    expect((await limiter.take("t")).allowed).toBe(true);
    expect((await limiter.take("t")).allowed).toBe(false);
    clock.advance(60_000);
    const fresh = await limiter.take("t");
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(0);
    // The PREVIOUS window's counter is unreachable (TTL = window).
    expect(await client.get(`${rateLimitKeyPrefix()}:api:t:0`)).toEqual({ ok: true, value: null });
  });

  test("retryAfterSeconds shrinks as the window drains", async () => {
    const clock = makeClock(30_000); // 30s into window 0 (60s windows)
    const limiter = makeLimiter(new MemoryRedisClient({ clock: clock.now }), clock.now, 1, 60);
    await limiter.take("t");
    const denied = await limiter.take("t");
    expect(denied.retryAfterSeconds).toBe(30);
    clock.advance(29_000);
    const later = await limiter.take("t");
    expect(later.retryAfterSeconds).toBe(1);
  });
});

describe("state boundedness (the acceptance: rate limiting is bounded)", () => {
  test("unlimited identifiers over many windows hold only the LIVE windows' keys", async () => {
    const clock = makeClock();
    const client = new MemoryRedisClient({ clock: clock.now });
    const limiter = makeLimiter(client, clock.now, 5, 1);
    for (let round = 0; round < 50; round += 1) {
      for (let identifier = 0; identifier < 20; identifier += 1) {
        await limiter.take(`tenant-${identifier}`);
      }
      // Each window is 1s; advance a full window every round.
      clock.advance(1_000);
    }
    // 1000 (identifier, window) pairs were counted; only the CURRENT
    // window's 20 counters can still be alive after the sweep — the
    // store grew with the WINDOW HORIZON, not with request count.
    const live = client.liveEntries(clock.now());
    expect(live.length).toBeLessThanOrEqual(20);
    for (const entry of live) {
      expect(entry.key.startsWith(`${rateLimitKeyPrefix()}:`)).toBe(true);
    }
  });
});

describe("honest degradation on Redis typed-failure", () => {
  test("fails OPEN with degraded=true and the typed failure attached — never throws", async () => {
    const clock = makeClock();
    const failure: RedisFailure = { kind: "quota_exceeded", detail: "redis rest rate/quota limit reached (HTTP 429)" };
    const limiter = makeLimiter(new AlwaysFailingClient(failure), clock.now, 3, 60);
    const decision = await limiter.take("t");
    expect(decision.allowed).toBe(true);
    expect(decision.degraded).toBe(true);
    expect(decision.remaining).toBe(3);
    expect(decision.retryAfterSeconds).toBe(0);
    expect(decision.failure).toEqual(failure);
  });
});
