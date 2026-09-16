/**
 * Key namespacing tests — PROD-007.
 *
 * Proves collision safety (distinct part tuples ⇒ distinct keys, even
 * with separator characters inside parts), tenant/project scoping, the
 * versioned root, and the deterministic job-id derivation that makes
 * enqueue idempotent. Pure: no I/O, no clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { sha256Hex } from "../lib/hash";
import {
  buildRedisKey,
  cacheKey,
  cacheKeyPrefix,
  encodeKeyPart,
  jobKey,
  jobIdFromIdempotencyKey,
  jobKeyPrefix,
  rateLimitKey,
  rateLimitKeyPrefix,
  REDIS_KEY_ROOT,
  REDIS_KEY_VERSION,
} from "./keys";

describe("namespaced, versioned root", () => {
  test("every key starts with the workspace root and schema version", () => {
    expect(buildRedisKey("a", "b")).toBe("aise:v1:a:b");
    expect(REDIS_KEY_ROOT).toBe("aise");
    expect(REDIS_KEY_VERSION).toBe("v1");
  });
});

describe("collision-safe part encoding", () => {
  test("the separator and percent are escaped inside parts", () => {
    expect(encodeKeyPart("a:b")).toBe("a%3Ab");
    expect(encodeKeyPart("100%")).toBe("100%25");
    expect(encodeKeyPart("plain")).toBe("plain");
  });

  test("distinct part tuples never collide, separator characters included", () => {
    expect(buildRedisKey("a:b", "c")).not.toBe(buildRedisKey("a", "b:c"));
    expect(buildRedisKey("a%b")).not.toBe(buildRedisKey("a%25b"));
  });
});

describe("cache keys (tenant/project-scoped, branded)", () => {
  test("carry the cache namespace and the scope parts", () => {
    const key = cacheKey({ tenant: "tenant-1", projectId: "proj-9", name: "reconstruction:status" });
    expect(key.kind).toBe("cache");
    expect(key.key.startsWith(`${cacheKeyPrefix()}:`)).toBe(true);
    expect(key.key).toBe("aise:v1:cache:tenant-1:proj-9:reconstruction%3Astatus");
  });

  test("different tenants/projects never share a cache key", () => {
    const a = cacheKey({ tenant: "t1", projectId: "p", name: "n" });
    const b = cacheKey({ tenant: "t2", projectId: "p", name: "n" });
    const c = cacheKey({ tenant: "t1", projectId: "other", name: "n" });
    expect(new Set([a.key, b.key, c.key]).size).toBe(3);
  });
});

describe("rate-limit keys (window-scoped)", () => {
  test("carry scope, identifier and the window index under the rl namespace", () => {
    const key = rateLimitKey("api", "tenant-1", 42);
    expect(key.startsWith(`${rateLimitKeyPrefix()}:`)).toBe(true);
    expect(key).toBe("aise:v1:rl:api:tenant-1:42");
  });

  test("different windows and identifiers never share a counter key", () => {
    expect(rateLimitKey("api", "t", 1)).not.toBe(rateLimitKey("api", "t", 2));
    expect(rateLimitKey("api", "t1", 1)).not.toBe(rateLimitKey("api", "t2", 1));
  });
});

describe("job keys (the idempotency cornerstone)", () => {
  test("the job id is sha-256 over the queue + idempotency key", () => {
    const id = jobIdFromIdempotencyKey({ queue: "reconstruction", idempotencyKey: "abc" });
    expect(id).toBe(sha256Hex("reconstruction\nabc"));
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  test("same (queue, idempotencyKey) always derives the SAME key — retry safety", () => {
    const first = jobKey({ queue: "reconstruction", idempotencyKey: "abc" });
    const second = jobKey({ queue: "reconstruction", idempotencyKey: "abc" });
    expect(first).toBe(second);
    expect(first.startsWith(`${jobKeyPrefix()}:reconstruction:`)).toBe(true);
  });

  test("different queues or idempotency keys never share a record key", () => {
    const keys = [
      jobKey({ queue: "q1", idempotencyKey: "a" }),
      jobKey({ queue: "q2", idempotencyKey: "a" }),
      jobKey({ queue: "q1", idempotencyKey: "b" }),
      jobKey({ queue: "q1", idempotencyKey: "a:b" }),
      jobKey({ queue: "q1:a", idempotencyKey: "b" }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
