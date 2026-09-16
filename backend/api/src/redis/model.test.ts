/**
 * Redis model tests — PROD-007.
 *
 * Proves the runtime half of "TTLs are explicit": the shared validator
 * every write path calls, and the typed-failure shape. Determinism: no
 * clock, no I/O, no randomness.
 */

import { describe, expect, test } from "bun:test";
import {
  REDIS_TTL_MIN_SECONDS,
  redisFailure,
  validateTtlSeconds,
} from "./model";

describe("validateTtlSeconds (the explicit-TTL contract)", () => {
  test("accepts positive integer TTLs", () => {
    expect(validateTtlSeconds(1)).toBeNull();
    expect(validateTtlSeconds(60)).toBeNull();
    expect(validateTtlSeconds(2_592_000)).toBeNull();
  });

  test("rejects zero, negatives, fractions and NaN with a deterministic detail", () => {
    for (const bad of [0, -1, -60, 1.5, Number.NaN]) {
      const detail = validateTtlSeconds(bad);
      expect(detail).not.toBeNull();
      expect(detail).toBe(
        `ttlSeconds must be an integer >= ${REDIS_TTL_MIN_SECONDS} (got ${String(bad)})`,
      );
    }
  });
});

describe("redisFailure (typed failures are data, never throws)", () => {
  test("constructs the machine-readable shape with a log-safe detail", () => {
    const failure = redisFailure("unavailable", "redis rest answered HTTP 500");
    expect(failure).toEqual({ kind: "unavailable", detail: "redis rest answered HTTP 500" });
  });
});
