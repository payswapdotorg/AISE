/**
 * Env factory tests — PROD-007.
 *
 * Proves the mode matrix is EXPLICIT AND HONEST:
 *  - no redis env at all → memory mode (the documented default);
 *  - both REST URL + token → upstash mode behind the outage-tolerant
 *    wrapper (injecting a stub fetch — no network, no real credentials);
 *  - ONE of the two → memory mode + an explicit misconfiguration reason
 *    (the env gate flags it; the factory refuses to guess);
 *  - tuning variables parse with documented defaults, mirroring
 *    tools/env-schema.ts exactly.
 * Determinism: injected clock + injected fetch, no I/O.
 */

import { describe, expect, test } from "bun:test";
import {
  createRedisFromEnv,
  redisTuningFromEnv,
  REDIS_TUNING_DEFAULTS,
} from "./index";
import { OutageTolerantRedis } from "./outage";
import { MemoryRedisClient } from "./client-memory";

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

describe("createRedisFromEnv mode matrix", () => {
  test("empty environment → explicit memory mode, no misconfiguration, default tuning", () => {
    const clock = makeClock();
    const result = createRedisFromEnv({}, { clock: clock.now });
    expect(result.mode).toBe("memory");
    expect(result.client.mode).toBe("memory");
    expect(result.client).toBeInstanceOf(MemoryRedisClient);
    expect(result.misconfiguration).toBeNull();
    expect(result.tuning).toEqual(REDIS_TUNING_DEFAULTS);
  });

  test("both URL and token → upstash mode behind the outage-tolerant wrapper", () => {
    const clock = makeClock();
    const result = createRedisFromEnv(
      {
        AISE_REDIS_REST_URL: "https://redis-test.example.upstash.io",
        AISE_REDIS_REST_TOKEN: "test-token-not-a-real-credential",
      },
      { clock: clock.now },
    );
    expect(result.mode).toBe("upstash");
    expect(result.client).toBeInstanceOf(OutageTolerantRedis);
    expect(result.client.mode).toBe("upstash"); // healthy at construction
    expect(result.misconfiguration).toBeNull();
  });

  test("the upstash mode answers over the injected fetch seam (no network)", async () => {
    const clock = makeClock();
    const result = createRedisFromEnv(
      {
        AISE_REDIS_REST_URL: "https://redis-test.example.upstash.io",
        AISE_REDIS_REST_TOKEN: "test-token-not-a-real-credential",
      },
      {
        clock: clock.now,
        fetchImpl: (async () =>
          new Response(JSON.stringify("OK"), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })) as unknown as typeof fetch,
      },
    );
    expect(await result.client.set("aise:v1:cache:t:p:n", "v", 60)).toEqual({ ok: true, value: true });
    // And the outage wrapper degrades that same client when upstash dies.
    expect(result.client.mode).toBe("upstash");
  });

  test("half-configured group (URL only) → memory mode + an explicit reason naming both variables", () => {
    const clock = makeClock();
    const result = createRedisFromEnv(
      { AISE_REDIS_REST_URL: "https://redis-test.example.upstash.io" },
      { clock: clock.now },
    );
    expect(result.mode).toBe("memory");
    expect(result.client).toBeInstanceOf(MemoryRedisClient);
    expect(result.misconfiguration).toContain("AISE_REDIS_REST_URL");
    expect(result.misconfiguration).toContain("AISE_REDIS_REST_TOKEN");
    expect(result.misconfiguration).toContain("half-configured");
  });

  test("half-configured group (token only) → memory mode + the same honesty", () => {
    const clock = makeClock();
    const result = createRedisFromEnv(
      { AISE_REDIS_REST_TOKEN: "test-token-not-a-real-credential" },
      { clock: clock.now },
    );
    expect(result.mode).toBe("memory");
    expect(result.misconfiguration).not.toBeNull();
  });

  test("whitespace-only values count as unset (present-but-empty never activates upstash)", () => {
    const clock = makeClock();
    const result = createRedisFromEnv(
      { AISE_REDIS_REST_URL: "   ", AISE_REDIS_REST_TOKEN: "   " },
      { clock: clock.now },
    );
    expect(result.mode).toBe("memory");
    // Both are empty → a plain default, not a half-configured group.
    expect(result.misconfiguration).toBeNull();
  });
});

describe("redisTuningFromEnv (documented defaults, mirrored with tools/env-schema.ts)", () => {
  test("defaults when nothing is set: cache 300s, window 60s, max 100", () => {
    expect(redisTuningFromEnv({})).toEqual({
      cacheTtlSeconds: 300,
      rateLimitWindowSeconds: 60,
      rateLimitMax: 100,
    });
  });

  test("valid values are honored", () => {
    expect(
      redisTuningFromEnv({
        AISE_REDIS_CACHE_TTL_SECONDS: "600",
        AISE_REDIS_RATELIMIT_WINDOW_SECONDS: "120",
        AISE_REDIS_RATELIMIT_MAX: "500",
      }),
    ).toEqual({
      cacheTtlSeconds: 600,
      rateLimitWindowSeconds: 120,
      rateLimitMax: 500,
    });
  });

  test("malformed or out-of-range values fall back to the documented defaults (never throw)", () => {
    for (const bad of ["banana", "", "0", "-5", "2.5", "999999999999"]) {
      expect(
        redisTuningFromEnv({
          AISE_REDIS_CACHE_TTL_SECONDS: bad,
          AISE_REDIS_RATELIMIT_WINDOW_SECONDS: bad,
          AISE_REDIS_RATELIMIT_MAX: bad,
        }),
      ).toEqual(REDIS_TUNING_DEFAULTS);
    }
  });
});

describe("the composed client is a real working family (smoke over the factory)", () => {
  test("memory mode round-trips cache-aside + rate limit + jobs end to end", async () => {
    const clock = makeClock();
    const { client } = createRedisFromEnv({}, { clock: clock.now });
    // The barrel-exported helpers work over the factory's client.
    expect(await client.increment("aise:v1:rl:api:t:0", 60)).toEqual({ ok: true, value: 1 });
    expect(await client.set("aise:v1:cache:t:p:n", "v", 30)).toEqual({ ok: true, value: true });
    clock.advance(29_999);
    expect(await client.get("aise:v1:cache:t:p:n")).toEqual({ ok: true, value: "v" });
  });
});
