/**
 * PROD-013 — the quota ledger tests (quotas.ts).
 *
 * Proves the LEDGER CONTRACT on both twins (the repo's twin discipline):
 *
 *   - WINDOW SEMANTICS: the UTC calendar-month window id, its end instant,
 *     the TTL that expires a counter exactly at the window's end, and the
 *     collision-safe counter key layout under aise:v1:quota:;
 *   - CONFIG: parseQuotaConfig honors valid overrides and falls back to the
 *     documented conservative defaults on malformed/out-of-range values
 *     (mirroring tools/env-schema.ts's PROD-013 rules exactly);
 *   - COUNT-KIND (redis_commands, r2_objects): increment-then-decide — the
 *     counter counts ATTEMPTS (refused ones included), the cap-th attempt
 *     is the last allowed one (status honestly "exhausted" at used == cap),
 *     the cap+1-th is REFUSED with the typed `quota_exhausted` refusal;
 *   - BYTES-KIND (r2_storage_bytes): check-then-record — a refused upload
 *     records NOTHING (one giant attempt cannot exhaust the month);
 *   - THRESHOLD WARNS: exactly ONE structured `quota_<resource>_threshold`
 *     warn per resource per window per instance, one first-refusal warn,
 *     never re-warned inside the window, re-armed in the NEXT window;
 *   - TWIN PARITY: the memory ledger and the Redis ledger (over the
 *     deterministic PROD-007 MemoryRedisClient — the redis/index.test.ts
 *     testkit pattern) answer IDENTICALLY for the same call sequence,
 *     including degenerate amounts and refusals;
 *   - REDIS TWIN EXTRAS: the counter dies with its window TTL, corrupt
 *     stored counters reset to zero with a warn, and a failed ledger client
 *     refuses the consume typed (never silently unbounded);
 *   - THE METERED WRAPPERS: MeteredRedisClient counts EVERY port call as one
 *     redis_commands unit and refuses to dispatch at the cap; the refusal is
 *     a typed `quota_exceeded` RedisFailure naming the LOCAL cap. Metered-
 *     ArtifactStorage counts bytes + one object per put BEFORE the dispatch
 *     and throws the typed ArtifactStorageError("quota_exceeded") on a cap.
 *
 * Determinism: fixed epoch clocks shared by ledger + memory client, captured
 * log lines, fake ids/hashes only — no Fs, no network, no randomness.
 */

import { describe, expect, test } from "bun:test";
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
import { ArtifactStorageError, type ArtifactStorage } from "../artifacts/storage";
import {
  InMemoryQuotaLedger,
  MeteredArtifactStorage,
  MeteredRedisClient,
  parseQuotaConfig,
  projectMeter,
  QUOTA_CAP_DEFAULTS,
  QUOTA_RESOURCES,
  quotaCounterKey,
  quotaWindowEndMs,
  quotaWindowId,
  quotaWindowTtlSeconds,
  RedisQuotaLedger,
  type QuotaConfig,
  type QuotaConsumeOutcome,
  type QuotaLedger,
  type QuotaResource,
} from "./quotas";

/* ------------------------------------------------------------------ */
/* World                                                                */
/* ------------------------------------------------------------------ */

/** Mid-January 2026, 12:00 UTC (safely inside a window, never a boundary). */
const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);
/** The END of T0's window: 2026-02-01T00:00:00Z. */
const JAN_END = Date.UTC(2026, 1, 1);

interface LedgerWorld {
  readonly ledger: QuotaLedger;
  readonly client: MemoryRedisClient;
  readonly lines: readonly string[];
  advance(ms: number): void;
}

/**
 * A fresh deterministic ledger world: fixed clock shared by the ledger and
 * the memory twin, captured log lines. `caps` overrides the defaults.
 */
function memoryWorld(caps: Partial<Record<keyof QuotaConfig["caps"], number>> = {}): LedgerWorld {
  let now = T0;
  const clock = (): number => now;
  const lines: string[] = [];
  const logger: Logger = createLogger("debug", (line) => {
    lines.push(line);
  });
  const config = parseQuotaConfig({});
  const ledger = new InMemoryQuotaLedger({
    clock,
    logger,
    config: { ...config, caps: { ...config.caps, ...caps } },
  });
  return {
    ledger,
    client: new MemoryRedisClient({ clock }),
    lines,
    advance: (ms: number): void => {
      now += ms;
    },
  };
}

/** The Redis twin over the deterministic memory client (shared clock). */
function redisWorld(caps: Partial<Record<keyof QuotaConfig["caps"], number>> = {}): LedgerWorld {
  let now = T0;
  const clock = (): number => now;
  const lines: string[] = [];
  const logger: Logger = createLogger("debug", (line) => {
    lines.push(line);
  });
  const client = new MemoryRedisClient({ clock });
  const config = parseQuotaConfig({});
  const ledger = new RedisQuotaLedger({
    client,
    clock,
    logger,
    config: { ...config, caps: { ...config.caps, ...caps } },
  });
  return {
    ledger,
    client,
    lines,
    advance: (ms: number): void => {
      now += ms;
    },
  };
}

function warnLines(w: LedgerWorld): string[] {
  return w.lines.filter((line) => line.includes('"level":"warn"'));
}

function hasWarn(w: LedgerWorld, message: string): boolean {
  return warnLines(w).some((line) => line.includes(`"message":"${message}"`));
}

function warnCount(w: LedgerWorld, message: string): number {
  return warnLines(w).filter((line) => line.includes(`"message":"${message}"`)).length;
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

/** A port spy: records every operation dispatched to the inner client. */
class RecordingRedisClient implements RedisClientPort {
  readonly mode: "memory" | "upstash";
  readonly operations: string[] = [];

  constructor(private readonly inner: RedisClientPort) {
    this.mode = inner.mode;
  }

  async get(key: string): Promise<RedisGetResult> {
    this.operations.push(`get ${key}`);
    return this.inner.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<RedisSetResult> {
    this.operations.push(`set ${key}`);
    return this.inner.set(key, value, ttlSeconds);
  }

  async delete(key: string): Promise<RedisDeleteResult> {
    this.operations.push(`delete ${key}`);
    return this.inner.delete(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<RedisExpireResult> {
    this.operations.push(`expire ${key}`);
    return this.inner.expire(key, ttlSeconds);
  }

  async increment(key: string, ttlSeconds: number): Promise<RedisIncrementResult> {
    this.operations.push(`increment ${key}`);
    return this.inner.increment(key, ttlSeconds);
  }
}

/** A storage spy: records puts; answers fixed metadata otherwise. */
class RecordingArtifactStorage implements ArtifactStorage {
  readonly puts: { readonly contentSha256: string; readonly byteLength: number }[] = [];

  async put(contentSha256: string, bytes: Uint8Array) {
    this.puts.push({ contentSha256, byteLength: bytes.byteLength });
    return { outcome: "stored" as const, byteSize: bytes.byteLength };
  }

  async get(): Promise<Uint8Array | null> {
    return new Uint8Array([1, 2, 3]);
  }

  async head() {
    return { byteSize: 3 };
  }

  async remove(): Promise<boolean> {
    return true;
  }

  describe() {
    return { kind: "local-fs" as const, root: "./test-data" };
  }
}

/* ------------------------------------------------------------------ */
/* Window semantics                                                     */
/* ------------------------------------------------------------------ */

describe("quota windows (the provider reset cadence: UTC calendar months)", () => {
  test("quotaWindowId is the zero-padded UTC YYYY-MM of the instant", () => {
    expect(quotaWindowId(Date.UTC(2026, 0, 1, 0, 0, 0))).toBe("2026-01");
    expect(quotaWindowId(Date.UTC(2026, 0, 31, 23, 59, 59, 999))).toBe("2026-01");
    expect(quotaWindowId(Date.UTC(2026, 1, 1, 0, 0, 0))).toBe("2026-02");
    expect(quotaWindowId(Date.UTC(2026, 11, 15))).toBe("2026-12");
    expect(quotaWindowId(Date.UTC(2027, 3, 10))).toBe("2027-04");
  });

  test("quotaWindowEndMs is the first instant of the NEXT UTC month", () => {
    expect(quotaWindowEndMs(Date.UTC(2026, 0, 15))).toBe(Date.UTC(2026, 1, 1));
    expect(quotaWindowEndMs(Date.UTC(2026, 11, 15))).toBe(Date.UTC(2027, 0, 1));
    // Leap-year February: 2028-02 has 29 days.
    expect(quotaWindowEndMs(Date.UTC(2028, 1, 15))).toBe(Date.UTC(2028, 2, 1));
  });

  test("quotaWindowTtlSeconds expires the counter exactly at the window end (>= 1s)", () => {
    const mid = Date.UTC(2026, 0, 15, 12, 0, 0);
    expect(quotaWindowTtlSeconds(mid)).toBe(
      Math.ceil((quotaWindowEndMs(mid) - mid) / 1000),
    );
    // The last millisecond of a window still gets a 1-second TTL floor.
    expect(quotaWindowTtlSeconds(JAN_END - 1)).toBe(1);
    // A window start gets (nearly) the whole month.
    expect(quotaWindowTtlSeconds(Date.UTC(2026, 0, 1))).toBe(31 * 24 * 60 * 60);
  });

  test("quotaCounterKey is the namespaced, collision-safe key for one window", () => {
    expect(quotaCounterKey("redis_commands", "2026-01")).toBe(
      "aise:v1:quota:redis_commands:2026-01",
    );
    expect(quotaCounterKey("r2_storage_bytes", "2026-12")).toBe(
      "aise:v1:quota:r2_storage_bytes:2026-12",
    );
  });
});

/* ------------------------------------------------------------------ */
/* Configuration                                                        */
/* ------------------------------------------------------------------ */

describe("parseQuotaConfig (documented conservative defaults, env-overridable)", () => {
  test("empty environment → the documented defaults (80% of the cited provider tiers)", () => {
    expect(parseQuotaConfig({})).toEqual({
      caps: {
        redis_commands: 400_000,
        r2_storage_bytes: 8 * 1024 * 1024 * 1024,
        r2_objects: 100_000,
      },
      thresholdPercent: 80,
    });
    expect(QUOTA_CAP_DEFAULTS.redis_commands).toBe(400_000);
    expect(QUOTA_CAP_DEFAULTS.r2_storage_bytes).toBe(8_589_934_592);
    expect(QUOTA_CAP_DEFAULTS.r2_objects).toBe(100_000);
  });

  test("valid values are honored (whitespace-tolerant, like the API's loaders)", () => {
    expect(
      parseQuotaConfig({
        AISE_QUOTA_REDIS_COMMANDS: "500000",
        AISE_QUOTA_R2_BYTES: String(1024 * 1024 * 1024),
        AISE_QUOTA_R2_OBJECTS: " 42 ",
        AISE_QUOTA_THRESHOLD_PERCENT: "95",
      }),
    ).toEqual({
      caps: { redis_commands: 500_000, r2_storage_bytes: 1_073_741_824, r2_objects: 42 },
      thresholdPercent: 95,
    });
  });

  test("malformed or out-of-range values fall back to the defaults (never throw)", () => {
    for (const bad of ["banana", "", "  ", "0", "-5", "2.5", "1e6"]) {
      expect(
        parseQuotaConfig({
          AISE_QUOTA_REDIS_COMMANDS: bad,
          AISE_QUOTA_R2_BYTES: bad,
          AISE_QUOTA_R2_OBJECTS: bad,
          AISE_QUOTA_THRESHOLD_PERCENT: bad,
        }),
      ).toEqual({
        caps: QUOTA_CAP_DEFAULTS,
        thresholdPercent: 80,
      });
    }
    // The ceilings: a value above EVERY cap ceiling is a misconfiguration.
    // (10^15 - 1 exceeds the count ceilings (10^8) AND the bytes ceiling
    // (1 TiB ≈ 1.1×10^12); the threshold ceiling is 100.)
    expect(
      parseQuotaConfig({
        AISE_QUOTA_REDIS_COMMANDS: "999999999999999",
        AISE_QUOTA_R2_BYTES: "999999999999999",
        AISE_QUOTA_R2_OBJECTS: "999999999999999",
        AISE_QUOTA_THRESHOLD_PERCENT: "101",
      }),
    ).toEqual({
      caps: QUOTA_CAP_DEFAULTS,
      thresholdPercent: 80,
    });
  });
});

/* ------------------------------------------------------------------ */
/* The meter projection (pure)                                          */
/* ------------------------------------------------------------------ */

describe("projectMeter + meterStatusOf boundaries", () => {
  test("ok below the threshold band, threshold inside it, exhausted at/over the cap", () => {
    const cap = 100;
    const thresholdPercent = 80;
    expect(projectMeter("redis_commands", 0, cap, thresholdPercent).status).toBe("ok");
    expect(projectMeter("redis_commands", 79, cap, thresholdPercent).status).toBe("ok");
    expect(projectMeter("redis_commands", 80, cap, thresholdPercent).status).toBe("threshold");
    expect(projectMeter("redis_commands", 99, cap, thresholdPercent).status).toBe("threshold");
    expect(projectMeter("redis_commands", 100, cap, thresholdPercent).status).toBe("exhausted");
    expect(projectMeter("redis_commands", 250, cap, thresholdPercent).status).toBe("exhausted");
  });

  test("remaining is clamped at 0 and remainingPercent floors into 0..100", () => {
    const under = projectMeter("r2_objects", 25, 100, 80);
    expect(under).toEqual({
      resource: "r2_objects",
      used: 25,
      cap: 100,
      remaining: 75,
      remainingPercent: 75,
      status: "ok",
    });
    const over = projectMeter("r2_objects", 130, 100, 80);
    expect(over.remaining).toBe(0);
    expect(over.remainingPercent).toBe(0);
    expect(over.status).toBe("exhausted");
  });

  test("QUOTA_RESOURCES is the stable snapshot order", () => {
    expect(QUOTA_RESOURCES).toEqual(["redis_commands", "r2_storage_bytes", "r2_objects"]);
  });
});

/* ------------------------------------------------------------------ */
/* The in-memory twin                                                   */
/* ------------------------------------------------------------------ */

describe("InMemoryQuotaLedger — count-kind (redis_commands)", () => {
  test("increment-then-decide: the cap-th attempt is the last allowed one, typed refusal after", async () => {
    // cap 3 + default threshold 80% → the warn band starts at floor(3*0.8)=2,
    // so the second allowed attempt is already honestly "threshold".
    const w = memoryWorld({ redis_commands: 3 });
    // (56-c typecheck fix: `.status` lives on the ok:true arm — narrow
    // before asserting; the runtime behavior is unchanged.)
    const first = await w.ledger.consume("redis_commands", 1);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.status).toBe("ok");
    }
    const second = await w.ledger.consume("redis_commands", 1);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.status).toBe("threshold");
    }
    const last = await w.ledger.consume("redis_commands", 1);
    expect(last).toMatchObject({ ok: true, used: 3, cap: 3, remaining: 0, remainingPercent: 0 });
    // used == cap is ALLOWED but honestly reported as exhausted budget.
    expect(last.ok).toBe(true);
    if (last.ok) {
      expect(last.status).toBe("exhausted");
    }

    const refusal = await w.ledger.consume("redis_commands", 1);
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) {
      expect(refusal.refusal.code).toBe("quota_exhausted");
      expect(refusal.refusal.resource).toBe("redis_commands");
      // The counter counts ATTEMPTS: the refused one is included.
      expect(refusal.refusal.used).toBe(4);
      expect(refusal.refusal.cap).toBe(3);
      expect(refusal.refusal.detail).toContain("REFUSED");
      expect(refusal.refusal.detail).toContain("never auto-upgraded");
    }
    // Subsequent refusals return the same typed failure (still counted).
    const again = await w.ledger.consume("redis_commands", 1);
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.refusal.used).toBe(5);
    }
  });

  test("exactly ONE threshold warn and ONE first-refusal warn per resource per window", async () => {
    const w = memoryWorld({ redis_commands: 5 }); // threshold band starts at 4
    for (let i = 0; i < 3; i++) {
      await w.ledger.consume("redis_commands", 1);
    }
    expect(hasWarn(w, "quota_redis_commands_threshold")).toBe(false);
    await w.ledger.consume("redis_commands", 1); // used 4 — enters the band
    expect(hasWarn(w, "quota_redis_commands_threshold")).toBe(true);
    await w.ledger.consume("redis_commands", 1); // used 5 == cap (allowed)
    await w.ledger.consume("redis_commands", 1); // used 6 — refused
    await w.ledger.consume("redis_commands", 1); // refused again
    expect(warnCount(w, "quota_redis_commands_threshold")).toBe(1);
    expect(warnCount(w, "quota_redis_commands_exhausted")).toBe(1);
    // The threshold warn carries usage numbers only — never credentials.
    const thresholdLine = warnLines(w).find((line) =>
      line.includes('"message":"quota_redis_commands_threshold"'),
    );
    expect(thresholdLine).toBeDefined();
    expect(JSON.parse(thresholdLine!)).toMatchObject({
      level: "warn",
      message: "quota_redis_commands_threshold",
      resource: "redis_commands",
      used: 4,
      cap: 5,
      ledger: "memory",
      windowId: "2026-01",
    });
  });

  test("warns re-arm in the NEXT window (the counter resets with the month)", async () => {
    // cap 10 + threshold 80% → the warn band starts at 8.
    const w = memoryWorld({ redis_commands: 10 });
    for (let i = 0; i < 8; i++) {
      await w.ledger.consume("redis_commands", 1);
    }
    expect(warnCount(w, "quota_redis_commands_threshold")).toBe(1); // January's
    await w.ledger.consume("redis_commands", 1); // 9 — still allowed
    await w.ledger.consume("redis_commands", 1); // 10 == cap (allowed)
    await w.ledger.consume("redis_commands", 1); // 11 — refused
    expect(warnCount(w, "quota_redis_commands_exhausted")).toBe(1);
    expect(w.ledger.snapshot().windowId).toBe("2026-01");
    w.advance(JAN_END - T0 + 1); // into February
    expect(w.ledger.snapshot().windowId).toBe("2026-02");
    for (let i = 1; i <= 7; i++) {
      const fresh = await w.ledger.consume("redis_commands", 1);
      expect(fresh).toMatchObject({ ok: true, used: i, cap: 10 });
    }
    expect(warnCount(w, "quota_redis_commands_threshold")).toBe(1); // still just January's
    await w.ledger.consume("redis_commands", 1); // February used 8 — the re-armed warn
    expect(warnCount(w, "quota_redis_commands_threshold")).toBe(2);
    expect(warnCount(w, "quota_redis_commands_exhausted")).toBe(1);
  });

  test("snapshot projects every meter in stable order with the current window", async () => {
    const w = memoryWorld({ redis_commands: 10 });
    await w.ledger.consume("redis_commands", 9); // 90% — threshold band
    const snapshot = w.ledger.snapshot();
    expect(snapshot.windowId).toBe("2026-01");
    expect(snapshot.meters.map((meter) => meter.resource)).toEqual([
      "redis_commands",
      "r2_storage_bytes",
      "r2_objects",
    ]);
    expect(snapshot.meters[0]).toEqual({
      resource: "redis_commands",
      used: 9,
      cap: 10,
      remaining: 1,
      remainingPercent: 10,
      status: "threshold",
    });
    expect(snapshot.meters[1]?.status).toBe("ok"); // untouched meter
  });
});

describe("InMemoryQuotaLedger — bytes-kind (r2_storage_bytes)", () => {
  test("check-then-record: a refused upload records NOTHING (a giant attempt cannot exhaust the month)", async () => {
    const w = memoryWorld({ r2_storage_bytes: 100 });
    expect(await w.ledger.consume("r2_storage_bytes", 60)).toMatchObject({
      ok: true,
      used: 60,
      remaining: 40,
    });
    const giant = await w.ledger.consume("r2_storage_bytes", 1_000_000_000);
    expect(giant.ok).toBe(false);
    if (!giant.ok) {
      expect(giant.refusal.code).toBe("quota_exhausted");
      // The refusal reports the USED amount, not used+attempted.
      expect(giant.refusal.used).toBe(60);
    }
    expect(hasWarn(w, "quota_r2_storage_bytes_exhausted")).toBe(true);
    // The counter is UNCHANGED by the refused upload…
    expect(w.ledger.snapshot().meters[1]?.used).toBe(60);
    // …so the remaining budget is still spendable.
    expect(await w.ledger.consume("r2_storage_bytes", 40)).toMatchObject({ ok: true, used: 100 });
    // At the cap: allowed, honestly exhausted; one more byte is refused.
    expect((await w.ledger.consume("r2_storage_bytes", 1)).ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The Redis twin (over the deterministic PROD-007 memory client)       */
/* ------------------------------------------------------------------ */

describe("RedisQuotaLedger — the shared-window twin", () => {
  test("count-kind: same increment-then-decide semantics, counters under the window key", async () => {
    const w = redisWorld({ redis_commands: 3 });
    for (let i = 1; i <= 3; i++) {
      expect(await w.ledger.consume("redis_commands", 1)).toMatchObject({ ok: true, used: i });
    }
    expect(await w.client.get("aise:v1:quota:redis_commands:2026-01")).toEqual({
      ok: true,
      value: "3",
    });
    const refusal = await w.ledger.consume("redis_commands", 1);
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) {
      expect(refusal.refusal).toMatchObject({ code: "quota_exhausted", used: 4, cap: 3 });
    }
    // The refused attempt was counted in the shared window counter.
    expect(await w.client.get("aise:v1:quota:redis_commands:2026-01")).toEqual({
      ok: true,
      value: "4",
    });
    expect(warnCount(w, "quota_redis_commands_exhausted")).toBe(1);
    expect(w.ledger.snapshot().meters[0]).toMatchObject({ used: 4, cap: 3, status: "exhausted" });
  });

  test("ONE increment per unit: the counted command maps 1:1 to one port call", async () => {
    const w = redisWorld();
    const inner = new RecordingRedisClient(w.client);
    const lines: string[] = [];
    const ledger = new RedisQuotaLedger({
      client: inner,
      clock: (): number => T0,
      logger: createLogger("debug", (line) => lines.push(line)),
      config: parseQuotaConfig({}),
    });
    await ledger.consume("redis_commands", 1);
    expect(inner.operations).toEqual(["increment aise:v1:quota:redis_commands:2026-01"]);
    await ledger.consume("redis_commands", 1);
    expect(inner.operations).toHaveLength(2);
  });

  test("the counter dies with its window TTL (the provider's monthly reset, mirrored)", async () => {
    const w = redisWorld({ redis_commands: 10 });
    for (let i = 0; i < 8; i++) {
      await w.ledger.consume("redis_commands", 1); // into the threshold band
    }
    expect(hasWarn(w, "quota_redis_commands_threshold")).toBe(true);
    w.advance(JAN_END - T0 + 1); // 2026-02-01T00:00:00.001Z — past the TTL
    expect(await w.client.get("aise:v1:quota:redis_commands:2026-01")).toEqual({
      ok: true,
      value: null,
    });
    // A fresh window counts from zero and re-arms the warns.
    expect(await w.ledger.consume("redis_commands", 1)).toMatchObject({ ok: true, used: 1 });
    expect(await w.client.get("aise:v1:quota:redis_commands:2026-02")).toEqual({
      ok: true,
      value: "1",
    });
    expect(w.ledger.snapshot().windowId).toBe("2026-02");
  });

  test("bytes-kind: check-then-record; a refused upload never writes the counter", async () => {
    const w = redisWorld({ r2_storage_bytes: 100 });
    expect(await w.ledger.consume("r2_storage_bytes", 70)).toMatchObject({ ok: true, used: 70 });
    expect(await w.client.get("aise:v1:quota:r2_storage_bytes:2026-01")).toEqual({
      ok: true,
      value: "70",
    });
    const refusal = await w.ledger.consume("r2_storage_bytes", 50);
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) {
      expect(refusal.refusal.used).toBe(70);
    }
    // Nothing was written for the refused upload.
    expect(await w.client.get("aise:v1:quota:r2_storage_bytes:2026-01")).toEqual({
      ok: true,
      value: "70",
    });
    expect(await w.ledger.consume("r2_storage_bytes", 30)).toMatchObject({ ok: true, used: 100 });
  });

  test("a corrupt stored counter resets to zero with a structured warn (bytes-kind read)", async () => {
    const w = redisWorld({ r2_storage_bytes: 100 });
    expect(await w.client.set("aise:v1:quota:r2_storage_bytes:2026-01", "junk-not-a-number", 60))
      .toMatchObject({ ok: true });
    const outcome = await w.ledger.consume("r2_storage_bytes", 10);
    expect(outcome).toMatchObject({ ok: true, used: 10 });
    expect(hasWarn(w, "quota_r2_storage_bytes_counter_corrupt")).toBe(true);
    expect(await w.client.get("aise:v1:quota:r2_storage_bytes:2026-01")).toEqual({
      ok: true,
      value: "10",
    });
  });

  test("a failed ledger client REFUSES the consume typed (never silently unbounded)", async () => {
    const lines: string[] = [];
    const ledger = new RedisQuotaLedger({
      client: new FailingRedisClient(),
      clock: (): number => T0,
      logger: createLogger("debug", (line) => lines.push(line)),
      config: parseQuotaConfig({}),
    });
    const refusal = await ledger.consume("redis_commands", 1);
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) {
      expect(refusal.refusal.code).toBe("quota_exhausted");
      expect(refusal.refusal.detail).toContain("quota ledger unavailable");
      expect(refusal.refusal.detail).toContain("unavailable");
    }
    const warned = lines.some((line) => line.includes('"quota_redis_commands_ledger_unavailable"'));
    expect(warned).toBe(true);
    // The bytes twin refuses the same way (a get failure is a refusal too).
    const bytes = await ledger.consume("r2_storage_bytes", 10);
    expect(bytes.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Twin parity (the repo's twin discipline, made executable)            */
/* ------------------------------------------------------------------ */

describe("twin parity — memory and redis ledgers answer IDENTICALLY", () => {
  test("the same call sequence (counts, bytes, refusals, degenerate amounts) → identical outcomes", async () => {
    const memory = memoryWorld({ redis_commands: 6, r2_storage_bytes: 100, r2_objects: 3 });
    const redis = redisWorld({ redis_commands: 6, r2_storage_bytes: 100, r2_objects: 3 });

    // (56-c fix: 56-b left dead scaffolding here — a `script` array of
    // closures bound to the MEMORY ledger plus a `scriptFor` mapper whose
    // world parameter was never used (the lint error). The honest parity
    // proof replays ONE explicit call sequence against BOTH twins.)
    const calls: readonly (readonly [QuotaResource, number])[] = [
      ["redis_commands", 1],
      ["redis_commands", 1],
      ["r2_storage_bytes", 40],
      ["r2_objects", 1],
      ["r2_objects", 1],
      ["r2_objects", 1], // at cap (allowed, exhausted)
      ["r2_objects", 1], // refused (counted)
      ["r2_storage_bytes", 70], // refused (nothing recorded)
      ["r2_storage_bytes", 60], // allowed → 100
      ["redis_commands", 2], // multi-unit count
      ["redis_commands", 1], // threshold band
      ["redis_commands", 1], // at cap
      ["redis_commands", 1], // refused
      // Degenerate amounts count as one unit on BOTH twins (countUnits).
      ["redis_commands", 0],
      ["redis_commands", 2.5],
    ];

    const memoryOutcomes: QuotaConsumeOutcome[] = [];
    for (const [resource, amount] of calls) {
      memoryOutcomes.push(await memory.ledger.consume(resource, amount));
    }
    const redisOutcomes: QuotaConsumeOutcome[] = [];
    for (const [resource, amount] of calls) {
      redisOutcomes.push(await redis.ledger.consume(resource, amount));
    }

    // Every outcome is deep-equal (allowance shape, used/cap/remaining,
    // status, and the typed refusals with their deterministic details).
    expect(redisOutcomes).toEqual(memoryOutcomes);
    // Both refused exactly where they should have (the objects over-cap
    // attempt, the bytes over-cap attempt, and the three redis_commands
    // attempts past the cap — degenerate amounts count as real attempts).
    expect(memoryOutcomes.filter((o) => !o.ok)).toHaveLength(5);
    expect(redisOutcomes.filter((o) => !o.ok)).toHaveLength(5);
    // And the final snapshots agree (same window, same counters).
    expect(redis.ledger.snapshot()).toEqual(memory.ledger.snapshot());
  });
});

/* ------------------------------------------------------------------ */
/* MeteredRedisClient — the Upstash command meter                       */
/* ------------------------------------------------------------------ */

describe("MeteredRedisClient — every port call is one counted, capped command", () => {
  function meteredWorld(cap: number) {
    const lines: string[] = [];
    const logger = createLogger("debug", (line) => lines.push(line));
    const inner = new RecordingRedisClient(new MemoryRedisClient({ clock: () => T0 }));
    const ledger = new InMemoryQuotaLedger({
      clock: () => T0,
      logger,
      config: { ...parseQuotaConfig({}), caps: { ...parseQuotaConfig({}).caps, redis_commands: cap } },
    });
    const metered = new MeteredRedisClient({ inner, ledger, logger });
    return { metered, inner, ledger, lines };
  }

  test("get/set/delete/expire/increment each count exactly one redis_commands unit", async () => {
    const w = meteredWorld(100);
    expect(await w.metered.set("aise:v1:quota:x:2026-01", "1", 60)).toMatchObject({ ok: true });
    expect(await w.metered.get("aise:v1:quota:x:2026-01")).toMatchObject({ ok: true, value: "1" });
    expect(await w.metered.increment("aise:v1:quota:x:2026-01", 60)).toMatchObject({
      ok: true,
      value: 2,
    });
    expect(await w.metered.expire("aise:v1:quota:x:2026-01", 30)).toMatchObject({ ok: true });
    expect(await w.metered.delete("aise:v1:quota:x:2026-01")).toMatchObject({ ok: true });
    expect(w.ledger.snapshot().meters[0]).toMatchObject({ used: 5, cap: 100, status: "ok" });
    expect(w.inner.operations).toHaveLength(5);
    // The wrapper is a transparent port: the inner mode is surfaced.
    expect(w.metered.mode).toBe("memory");
  });

  test("at the hard cap the operation is REFUSED, typed, and NEVER dispatched", async () => {
    const w = meteredWorld(2);
    expect(await w.metered.set("k1", "v", 60)).toMatchObject({ ok: true });
    expect(await w.metered.get("k1")).toMatchObject({ ok: true });
    const refused = await w.metered.get("k1");
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.failure.kind).toBe("quota_exceeded");
      expect(refused.failure.detail).toContain("AISE_QUOTA_REDIS_COMMANDS");
      expect(refused.failure.detail).toContain("'get'");
      expect(refused.failure.detail).toContain("refused before dispatch");
    }
    // The underlying client was NEVER called for the refused command.
    expect(w.inner.operations).toEqual(["set k1", "get k1"]);
    // The refusal is loud (a structured warn) and repeats typed every time.
    expect(
      w.lines.filter((line) => line.includes('"quota_redis_commands_refused"')).length,
    ).toBeGreaterThanOrEqual(1);
    const again = await w.metered.increment("k1", 60);
    expect(again.ok).toBe(false);
    expect(w.inner.operations).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ */
/* MeteredArtifactStorage — the R2 bytes/objects meter                  */
/* ------------------------------------------------------------------ */

describe("MeteredArtifactStorage — uploads are metered before the blob write", () => {
  function storageWorld(caps: Partial<Record<keyof QuotaConfig["caps"], number>>) {
    const lines: string[] = [];
    const logger = createLogger("debug", (line) => lines.push(line));
    const inner = new RecordingArtifactStorage();
    const base = parseQuotaConfig({});
    const ledger = new InMemoryQuotaLedger({
      clock: () => T0,
      logger,
      config: { ...base, caps: { ...base.caps, ...caps } },
    });
    const metered = new MeteredArtifactStorage({ inner, ledger, logger });
    return { metered, inner, ledger, lines };
  }

  test("put counts its bytes AND one object, then dispatches to the backend", async () => {
    const w = storageWorld({});
    const bytes = new Uint8Array(256);
    expect(await w.metered.put("fake-sha256-0001", bytes)).toEqual({
      outcome: "stored",
      byteSize: 256,
    });
    expect(w.inner.puts).toEqual([{ contentSha256: "fake-sha256-0001", byteLength: 256 }]);
    const meters = new Map(w.ledger.snapshot().meters.map((m) => [m.resource, m]));
    expect(meters.get("r2_storage_bytes")).toMatchObject({ used: 256, status: "ok" });
    expect(meters.get("r2_objects")).toMatchObject({ used: 1, status: "ok" });
  });

  test("a bytes-cap refusal throws the typed quota_exceeded error and the blob write NEVER happens", async () => {
    const w = storageWorld({ r2_storage_bytes: 100 });
    await expect(w.metered.put("fake-sha256-0002", new Uint8Array(101))).rejects.toMatchObject({
      name: "ArtifactStorageError",
      failureKind: "quota_exceeded",
    });
    expect(w.inner.puts).toEqual([]);
    // The objects meter was NOT consumed (bytes refused first).
    expect(w.ledger.snapshot().meters[2]).toMatchObject({ used: 0 });
    expect(
      w.lines.some((line) => line.includes('"quota_r2_storage_bytes_refused"')),
    ).toBe(true);
    // The counter recorded NOTHING for the refused upload — the remaining
    // budget is still spendable.
    expect(await w.metered.put("fake-sha256-0003", new Uint8Array(100))).toMatchObject({
      outcome: "stored",
    });
  });

  test("an objects-cap refusal is typed too; the honest bytes overcount is pinned", async () => {
    const w = storageWorld({ r2_objects: 1 });
    expect(await w.metered.put("fake-sha256-0004", new Uint8Array(10))).toMatchObject({
      outcome: "stored",
    });
    await expect(w.metered.put("fake-sha256-0005", new Uint8Array(20))).rejects.toMatchObject({
      name: "ArtifactStorageError",
      failureKind: "quota_exceeded",
    });
    expect(w.inner.puts).toHaveLength(1);
    // DOCUMENTED overcount (quotas.ts header): the second put's bytes were
    // consumed before the objects refusal — conservative, never looser.
    // The objects counter itself counts the REFUSED attempt too
    // (increment-then-decide): used 2 against the cap 1.
    expect(w.ledger.snapshot().meters[1]).toMatchObject({ used: 30 });
    expect(w.ledger.snapshot().meters[2]).toMatchObject({ used: 2, status: "exhausted" });
  });

  test("reads and metadata operations are NEVER metered (only uploads spend)", async () => {
    const w = storageWorld({});
    expect(await w.metered.get("fake-sha256-0006")).toEqual(new Uint8Array([1, 2, 3]));
    expect(await w.metered.head("fake-sha256-0006")).toEqual({ byteSize: 3 });
    expect(await w.metered.remove("fake-sha256-0006")).toBe(true);
    expect(w.metered.describe()).toEqual({ kind: "local-fs", root: "./test-data" });
    const meters = new Map(w.ledger.snapshot().meters.map((m) => [m.resource, m]));
    expect(meters.get("r2_storage_bytes")?.used).toBe(0);
    expect(meters.get("r2_objects")?.used).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* The typed-refusal envelope shape (never a thrown string)             */
/* ------------------------------------------------------------------ */

describe("the typed exhaustion refusal (never silent, never an upgrade)", () => {
  test("the refusal detail names the resource, the numbers and the variable — no secrets", async () => {
    const w = memoryWorld({ r2_objects: 1 });
    await w.ledger.consume("r2_objects", 1);
    const refusal = await w.ledger.consume("r2_objects", 1);
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) {
      expect(refusal.refusal.detail).toBe(
        "quota 'r2_objects' is exhausted: used 2 of the configured cap 1 " +
          "(AISE_QUOTA_* — conservative free-tier default, overridable) — the operation is " +
          "REFUSED to protect the free-tier budget; it is never auto-upgraded",
      );
      // Structured warn fields carry numbers only.
      const warnLine = warnLines(w).find((line) =>
        line.includes('"message":"quota_r2_objects_exhausted"'),
      );
      expect(JSON.parse(warnLine!)).toMatchObject({
        resource: "r2_objects",
        used: 2,
        cap: 1,
        ledger: "memory",
        windowId: "2026-01",
      });
    }
  });

  test("ArtifactStorageError surface for a capped upload (the artifacts family's shape)", async () => {
    const lines: string[] = [];
    const logger = createLogger("debug", (line) => lines.push(line));
    const base = parseQuotaConfig({});
    const ledger = new InMemoryQuotaLedger({
      clock: () => T0,
      logger,
      config: { ...base, caps: { ...base.caps, r2_storage_bytes: 5 } },
    });
    const storage = new MeteredArtifactStorage({
      inner: new RecordingArtifactStorage(),
      ledger,
      logger,
    });
    try {
      await storage.put("fake-sha256-0007", new Uint8Array(6));
      expect.unreachable("put must refuse at the cap");
    } catch (error) {
      expect(error).toBeInstanceOf(ArtifactStorageError);
      const typed = error as ArtifactStorageError;
      expect(typed.failureKind).toBe("quota_exceeded");
      expect(typed.detail).toContain("r2_storage_bytes");
      expect(typed.detail).toContain("never auto-upgraded");
    }
  });
});
