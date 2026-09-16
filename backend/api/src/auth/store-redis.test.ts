/**
 * PROD-011b — the Redis session-store twin tests (store-redis.ts over the
 * deterministic PROD-007 memory client).
 *
 * Proves the STORE TWIN contract:
 *
 *   - the exact FsSessionStore behaviors (put/get round-trip, sorted list,
 *     absent→null, idempotent delete) over `MemoryRedisClient`;
 *   - TTL discipline: the injected fixed clock drives BOTH the store's ttl
 *     math and the twin's key expiry — a session dies exactly at its
 *     `expiresAt` boundary, past/now boundaries floor at the 1-second TTL,
 *     and the index carries the SAME ttl as its session (bounded staleness);
 *   - lazy prune: `list()` drops TTL-evicted sessions and rewrites the
 *     index; a FAILED per-id read is NOT an absent read (the id is kept — a
 *     blip must not drop a live session from enumeration);
 *   - honesty: corrupt values read as absent WITH typed warns; EVERY op
 *     failing degrades to typed, logged data (get → null, list → [],
 *     put/delete resolve — never a throw) and the store stays usable after
 *     recovery;
 *   - the wire contract: session records at `aise:auth:session:<id>` in
 *     canonical JSON (byte-identical to the Fs twin's file content), the
 *     enumeration index at `aise:auth:session-index`.
 *
 * Determinism: one fixed epoch clock per world (shared by store + client),
 * fixed ISO timestamps, no Fs, no network, no randomness.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { createLogger, type Logger } from "../lib/log";
import { MemoryRedisClient } from "../redis/client-memory";
import {
  redisFailure,
  type RedisClientPort,
  type RedisDeleteResult,
  type RedisExpireResult,
  type RedisGetResult,
  type RedisIncrementResult,
  type RedisSetResult,
} from "../redis/model";
import { sweepExpiredSessions } from "./store";
import type { SessionRecord } from "./model";
import { RedisSessionStore } from "./store-redis";

/* ------------------------------------------------------------------ */
/* World                                                                */
/* ------------------------------------------------------------------ */

const T0 = 1_700_000_000_000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

interface StoreWorld {
  readonly store: RedisSessionStore;
  readonly client: RedisClientPort;
  readonly lines: readonly string[];
  advance(ms: number): void;
  nowIso(): string;
}

/**
 * A fresh deterministic world: fixed clock (shared by the store and the
 * memory twin), captured log lines. The client is injectable for the
 * failure-matrix tests; defaults to the plain memory twin.
 */
function world(clientOf?: (clock: () => number) => RedisClientPort): StoreWorld {
  let now = T0;
  const clock = (): number => now;
  const lines: string[] = [];
  const logger: Logger = createLogger("debug", (line) => {
    lines.push(line);
  });
  const client = clientOf === undefined ? new MemoryRedisClient({ clock }) : clientOf(clock);
  return {
    store: new RedisSessionStore(client, logger, clock),
    client,
    lines,
    advance: (ms: number): void => {
      now += ms;
    },
    nowIso: (): string => new Date(now).toISOString(),
  };
}

/** A fixed, valid session record (ids are opaque strings in the tests). */
function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    sessionId: "sess-fixed-0001",
    principalId: "user-alice",
    kind: "user",
    createdAt: "2026-01-01T00:00:00.000Z",
    expiresAt: "2026-01-08T00:00:00.000Z",
    ...overrides,
  };
}

/** The captured warn lines (structured JSON, one per log call). */
function warnLines(w: StoreWorld): string[] {
  return w.lines.filter((line) => line.includes('"level":"warn"'));
}

function hasWarn(w: StoreWorld, message: string): boolean {
  return warnLines(w).some((line) => line.includes(`"message":"${message}"`));
}

/** The raw index value through the client (null when absent/expired). */
async function rawIndex(w: StoreWorld): Promise<string | null> {
  const result = await w.client.get("aise:auth:session-index");
  expect(result.ok).toBe(true);
  return result.ok ? result.value : null;
}

/* ------------------------------------------------------------------ */
/* Failure-matrix client stubs (typed failures, never throws)            */
/* ------------------------------------------------------------------ */

const FAILING_FAILURE = redisFailure("unavailable", "failing client (deterministic test stub)");

/** EVERY operation answers one typed failure. */
class FailingRedisClient implements RedisClientPort {
  readonly mode = "memory" as const;

  async get(): Promise<RedisGetResult> {
    return { ok: false, failure: FAILING_FAILURE };
  }

  async set(): Promise<RedisSetResult> {
    return { ok: false, failure: FAILING_FAILURE };
  }

  async delete(): Promise<RedisDeleteResult> {
    return { ok: false, failure: FAILING_FAILURE };
  }

  async expire(): Promise<RedisExpireResult> {
    return { ok: false, failure: FAILING_FAILURE };
  }

  async increment(): Promise<RedisIncrementResult> {
    return { ok: false, failure: FAILING_FAILURE };
  }
}

/** Fails the FIRST call only, then delegates to the real twin (recovery). */
class FlakyRedisClient implements RedisClientPort {
  readonly mode = "memory" as const;
  private failsRemaining = 1;

  constructor(private readonly inner: RedisClientPort) {}

  async get(key: string): Promise<RedisGetResult> {
    if (this.failsRemaining > 0) {
      this.failsRemaining -= 1;
      return { ok: false, failure: redisFailure("unavailable", "flaky blip (test)") };
    }
    return this.inner.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<RedisSetResult> {
    if (this.failsRemaining > 0) {
      this.failsRemaining -= 1;
      return { ok: false, failure: redisFailure("unavailable", "flaky blip (test)") };
    }
    return this.inner.set(key, value, ttlSeconds);
  }

  async delete(key: string): Promise<RedisDeleteResult> {
    if (this.failsRemaining > 0) {
      this.failsRemaining -= 1;
      return { ok: false, failure: redisFailure("unavailable", "flaky blip (test)") };
    }
    return this.inner.delete(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<RedisExpireResult> {
    if (this.failsRemaining > 0) {
      this.failsRemaining -= 1;
      return { ok: false, failure: redisFailure("unavailable", "flaky blip (test)") };
    }
    return this.inner.expire(key, ttlSeconds);
  }

  async increment(key: string, ttlSeconds: number): Promise<RedisIncrementResult> {
    if (this.failsRemaining > 0) {
      this.failsRemaining -= 1;
      return { ok: false, failure: redisFailure("unavailable", "flaky blip (test)") };
    }
    return this.inner.increment(key, ttlSeconds);
  }
}

/** Fails the first get of ONE key only (the selective per-id blip). */
class SelectivelyFailingClient implements RedisClientPort {
  readonly mode = "memory" as const;
  private failedOnce = false;

  constructor(
    private readonly inner: RedisClientPort,
    private readonly failKey: string,
  ) {}

  async get(key: string): Promise<RedisGetResult> {
    if (!this.failedOnce && key === this.failKey) {
      this.failedOnce = true;
      return { ok: false, failure: redisFailure("unavailable", "selective blip (test)") };
    }
    return this.inner.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<RedisSetResult> {
    return this.inner.set(key, value, ttlSeconds);
  }

  async delete(key: string): Promise<RedisDeleteResult> {
    return this.inner.delete(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<RedisExpireResult> {
    return this.inner.expire(key, ttlSeconds);
  }

  async increment(key: string, ttlSeconds: number): Promise<RedisIncrementResult> {
    return this.inner.increment(key, ttlSeconds);
  }
}

/* ------------------------------------------------------------------ */
/* The Fs-twin behaviors                                                 */
/* ------------------------------------------------------------------ */

describe("RedisSessionStore — the Fs-twin behaviors over the memory client", () => {
  test("put/get round-trip returns the exact record", async () => {
    const w = world();
    const record = session({ expiresAt: iso(T0 + 60_000) });
    await w.store.put(record);
    await expect(w.store.get(record.sessionId)).resolves.toEqual(record);
  });

  test("get of an absent session is null; the index is untouched by get", async () => {
    const w = world();
    await expect(w.store.get("sess-never-minted")).resolves.toBeNull();
    expect(w.lines).toHaveLength(0);
  });

  test("list returns every session sorted by sessionId", async () => {
    const w = world();
    await w.store.put(session({ sessionId: "sess-000c", expiresAt: iso(T0 + 60_000) }));
    await w.store.put(session({ sessionId: "sess-000a", expiresAt: iso(T0 + 60_000) }));
    await w.store.put(session({ sessionId: "sess-000b", expiresAt: iso(T0 + 60_000) }));
    const listed = await w.store.list();
    expect(listed.map((record) => record.sessionId)).toEqual([
      "sess-000a",
      "sess-000b",
      "sess-000c",
    ]);
  });

  test("delete is idempotent and removes the id from the index", async () => {
    const w = world();
    await w.store.delete("sess-never-minted");
    expect(warnLines(w)).toHaveLength(0);
    const record = session({ expiresAt: iso(T0 + 60_000) });
    await w.store.put(record);
    await w.store.delete(record.sessionId);
    await expect(w.store.get(record.sessionId)).resolves.toBeNull();
    await expect(w.store.list()).resolves.toEqual([]);
    expect(await rawIndex(w)).toBe(canonicalJsonStringify([]));
  });

  test("index dedup: re-putting a session keeps the id once", async () => {
    const w = world();
    const record = session({ expiresAt: iso(T0 + 60_000) });
    await w.store.put(record);
    await w.store.put(record);
    expect(JSON.parse((await rawIndex(w)) ?? "null")).toEqual([record.sessionId]);
  });

  test("the index accumulates every live id, sorted", async () => {
    const w = world();
    await w.store.put(session({ sessionId: "sess-000b", expiresAt: iso(T0 + 60_000) }));
    await w.store.put(session({ sessionId: "sess-000a", expiresAt: iso(T0 + 60_000) }));
    expect(JSON.parse((await rawIndex(w)) ?? "null")).toEqual(["sess-000a", "sess-000b"]);
  });

  test("the wire contract: canonical JSON at aise:auth:session:<id> + the index key", async () => {
    const w = world();
    const record = session({ expiresAt: iso(T0 + 60_000) });
    await w.store.put(record);
    const raw = await w.client.get(`aise:auth:session:${record.sessionId}`);
    expect(raw).toEqual({ ok: true, value: canonicalJsonStringify(record) });
    expect(await rawIndex(w)).toBe(canonicalJsonStringify([record.sessionId]));
  });
});

/* ------------------------------------------------------------------ */
/* TTL discipline                                                       */
/* ------------------------------------------------------------------ */

describe("RedisSessionStore — TTL expiry (the injected clock drives both sides)", () => {
  test("a session dies exactly at its expiresAt boundary (ttl = remaining seconds, ceil)", async () => {
    const w = world();
    const record = session({ sessionId: "sess-ttl", expiresAt: iso(T0 + 5_000) });
    await w.store.put(record);
    w.advance(4_999);
    await expect(w.store.get("sess-ttl")).resolves.toEqual(record);
    w.advance(1);
    await expect(w.store.get("sess-ttl")).resolves.toBeNull();
  });

  test("boundary TTL math: expiresAt in the past still writes with ttl 1", async () => {
    const w = world();
    const record = session({ sessionId: "sess-past", expiresAt: iso(T0 - 5_000) });
    await w.store.put(record);
    w.advance(999);
    await expect(w.store.get("sess-past")).resolves.toEqual(record);
    w.advance(1);
    await expect(w.store.get("sess-past")).resolves.toBeNull();
  });

  test("boundary TTL math: expiresAt exactly now still writes with ttl 1", async () => {
    const w = world();
    const record = session({ sessionId: "sess-now", expiresAt: iso(T0) });
    await w.store.put(record);
    w.advance(999);
    await expect(w.store.get("sess-now")).resolves.toEqual(record);
    w.advance(1);
    await expect(w.store.get("sess-now")).resolves.toBeNull();
  });

  test("the index carries the SAME ttl as its session (bounded staleness)", async () => {
    const w = world();
    await w.store.put(session({ sessionId: "sess-index-ttl", expiresAt: iso(T0 + 2_000) }));
    w.advance(2_000);
    await expect(w.store.get("sess-index-ttl")).resolves.toBeNull();
    expect(await rawIndex(w)).toBeNull();
  });

  test("list lazily prunes TTL-evicted sessions and rewrites the index", async () => {
    const w = world();
    const short = session({ sessionId: "sess-short", expiresAt: iso(T0 + 2_000) });
    const long = session({ sessionId: "sess-long", expiresAt: iso(T0 + 10_000) });
    await w.store.put(short);
    await w.store.put(long);
    w.advance(3_000);
    const listed = await w.store.list();
    expect(listed.map((record) => record.sessionId)).toEqual(["sess-long"]);
    expect(JSON.parse((await rawIndex(w)) ?? "null")).toEqual(["sess-long"]);
    await expect(w.store.get("sess-short")).resolves.toBeNull();
  });

  test("the deterministic sweep works over the twin (data-expired but key-alive)", async () => {
    const w = world();
    // remaining 1500ms → ttl = ceil(1.5) = 2: the KEY outlives the DATA
    // expiry by 500ms — exactly the window the sweep owns.
    const record = session({ sessionId: "sess-sweep", expiresAt: iso(T0 + 1_500) });
    await w.store.put(record);
    w.advance(1_600);
    const report = await sweepExpiredSessions(w.store, w.nowIso());
    expect(report).toEqual({ considered: 1, removedSessionIds: ["sess-sweep"] });
    await expect(w.store.get("sess-sweep")).resolves.toBeNull();
    await expect(w.store.list()).resolves.toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Honesty: corrupt values read as absent                               */
/* ------------------------------------------------------------------ */

describe("RedisSessionStore — unparseable values read as absent (typed warns)", () => {
  test("a corrupt JSON value reads as null with the corrupt-record warn", async () => {
    const w = world();
    await w.client.set("aise:auth:session:sess-corrupt", "{definitely-not-json", 60);
    await expect(w.store.get("sess-corrupt")).resolves.toBeNull();
    expect(hasWarn(w, "redis_session_store_corrupt_record_ignored")).toBe(true);
  });

  test("a well-formed JSON value that is not a session record reads as null", async () => {
    const w = world();
    await w.client.set("aise:auth:session:sess-invalid", JSON.stringify({ banana: 1 }), 60);
    await expect(w.store.get("sess-invalid")).resolves.toBeNull();
    expect(hasWarn(w, "redis_session_store_invalid_record_ignored")).toBe(true);
  });

  test("a corrupt index is logged, answered as empty by list, and healed by put", async () => {
    const w = world();
    await w.client.set("aise:auth:session-index", "{corrupt-index", 60);
    await expect(w.store.list()).resolves.toEqual([]);
    expect(hasWarn(w, "redis_session_store_index_corrupt_ignored")).toBe(true);
    const record = session({ expiresAt: iso(T0 + 60_000) });
    await w.store.put(record);
    expect(JSON.parse((await rawIndex(w)) ?? "null")).toEqual([record.sessionId]);
    await expect(w.store.list()).resolves.toEqual([record]);
  });
});

/* ------------------------------------------------------------------ */
/* Honesty: every op failing (typed, logged, never a throw)             */
/* ------------------------------------------------------------------ */

describe("RedisSessionStore — every op failing degrades honestly", () => {
  test("no throw anywhere: get → null, list → [], put/delete resolve, warns typed", async () => {
    const w = world(() => new FailingRedisClient());
    await expect(w.store.put(session({ expiresAt: iso(T0 + 60_000) }))).resolves.toBeUndefined();
    await expect(w.store.get("sess-x")).resolves.toBeNull();
    await expect(w.store.delete("sess-x")).resolves.toBeUndefined();
    await expect(w.store.list()).resolves.toEqual([]);
    for (const op of ["put", "get", "delete", "list"]) {
      expect(hasWarn(w, `redis_session_store_${op}_failed`)).toBe(true);
    }
    // The warn carries the typed failure (kind + detail) — log-safe data.
    expect(warnLines(w).some((line) => line.includes('"kind":"unavailable"'))).toBe(true);
  });

  test("the store stays usable after failures (a blip does not wedge it)", async () => {
    const w = world((clock) => new FlakyRedisClient(new MemoryRedisClient({ clock })));
    const record = session({ expiresAt: iso(T0 + 60_000) });
    await w.store.put(record);
    expect(hasWarn(w, "redis_session_store_put_failed")).toBe(true);
    await expect(w.store.get(record.sessionId)).resolves.toBeNull();
    await w.store.put(record);
    await expect(w.store.get(record.sessionId)).resolves.toEqual(record);
  });

  test("a FAILED per-id read during list is not an absent read (the id is kept)", async () => {
    const inner = new MemoryRedisClient({ clock: (): number => T0 });
    const w = world(() => new SelectivelyFailingClient(inner, "aise:auth:session:sess-blip-a"));
    await w.store.put(session({ sessionId: "sess-blip-a", expiresAt: iso(T0 + 60_000) }));
    await w.store.put(session({ sessionId: "sess-blip-b", expiresAt: iso(T0 + 60_000) }));
    // The blip hits sess-blip-a's read: the record is skipped, but the id
    // STAYS in the index (pruning an unreadable key would silently drop a
    // possibly-live session from enumeration).
    const listed = await w.store.list();
    expect(listed.map((record) => record.sessionId)).toEqual(["sess-blip-b"]);
    expect(hasWarn(w, "redis_session_store_list_get_failed")).toBe(true);
    expect(JSON.parse((await rawIndex(w)) ?? "null")).toEqual(["sess-blip-a", "sess-blip-b"]);
    // The next list() recovers the full enumeration.
    await expect(w.store.list()).resolves.toEqual([
      session({ sessionId: "sess-blip-a", expiresAt: iso(T0 + 60_000) }),
      session({ sessionId: "sess-blip-b", expiresAt: iso(T0 + 60_000) }),
    ]);
  });
});
