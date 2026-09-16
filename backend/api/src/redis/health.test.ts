/**
 * Health snapshot tests — PROD-007.
 *
 * Proves the readiness contribution is PURE DATA (same input ⇒ same
 * output; no I/O, no clock, no randomness) and that both honesty rules
 * hold: explicit memory mode is READY (the documented no-credentials
 * default, not a degradation), while an upstash configuration currently
 * served by the fallback is DEGRADED (loud, operator-visible).
 */

import { describe, expect, test } from "bun:test";
import { redisHealth } from "./health";

describe("redisHealth (pure projection, no I/O)", () => {
  test("explicit memory mode is READY and says exactly why", () => {
    const health = redisHealth({
      mode: "memory",
      configuredMode: "memory",
      lastOutageAtMs: null,
      lastRecoveryAtMs: null,
      outageCount: 0,
    });
    expect(health).toEqual({
      status: "ready",
      mode: "memory",
      configuredMode: "memory",
      lastOutageAtMs: null,
      lastRecoveryAtMs: null,
      outageCount: 0,
      detail: "redis ready: explicit memory mode (no AISE_REDIS_REST_URL/AISE_REDIS_REST_TOKEN configured)",
    });
  });

  test("upstash answering is READY", () => {
    const health = redisHealth({
      mode: "upstash",
      configuredMode: "upstash",
      lastOutageAtMs: 123,
      lastRecoveryAtMs: 456,
      outageCount: 2,
    });
    expect(health.status).toBe("ready");
    expect(health.detail).toBe("redis ready: upstash answering");
    // Outage history is preserved even when currently healthy.
    expect(health.lastOutageAtMs).toBe(123);
    expect(health.outageCount).toBe(2);
  });

  test("upstash configured but memory serving is DEGRADED, with the outage data", () => {
    const health = redisHealth({
      mode: "memory",
      configuredMode: "upstash",
      lastOutageAtMs: 7_890,
      lastRecoveryAtMs: null,
      outageCount: 1,
    });
    expect(health.status).toBe("degraded");
    expect(health.mode).toBe("memory");
    expect(health.configuredMode).toBe("upstash");
    expect(health.detail).toContain("redis degraded: configured upstash, serving memory");
    expect(health.detail).toContain("last outage at 7890 ms, 1 recorded");
  });

  test("the projection is deterministic: identical inputs yield identical outputs", () => {
    const input = {
      mode: "memory" as const,
      configuredMode: "upstash" as const,
      lastOutageAtMs: 42,
      lastRecoveryAtMs: null,
      outageCount: 3,
    };
    expect(redisHealth(input)).toEqual(redisHealth(input));
  });
});
