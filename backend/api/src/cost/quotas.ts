/**
 * The quota ledger — PROD-013 (cost guards / operational safety).
 *
 * WHAT THIS MODULE OWNS: counting consumption of METERED external free-tier
 * resources against configurable caps, and refusing (never silently, never
 * "upgrading") when a cap is reached. The meter set is deliberately minimal
 * and REAL — every resource below maps to an external provider the deployed
 * demo actually spends:
 *
 *   redis_commands   Upstash Redis REST commands (free tier ≈ 500K/month —
 *                    docs/COST-GUARDS.md cites the provider page). Metered
 *                    per port call by `MeteredRedisClient`, the wrapper the
 *                    runtime puts in front of the Upstash client.
 *   r2_storage_bytes Cloudflare R2 stored bytes (free tier includes
 *                    10 GB-month — cited in docs/COST-GUARDS.md). Metered
 *                    per artifact upload by `MeteredArtifactStorage`.
 *   r2_objects       Artifact object count. HONEST NOTE: R2's free tier
 *                    publishes no object-COUNT cap (storage and operation
 *                    classes are the billed dimensions); this meter is an
 *                    OPERATIONAL HYGIENE bound (default 100,000), not a
 *                    provider-cited number — overridable, and labeled as
 *                    hygiene in the docs.
 *
 * The LLM/integration-call meter was considered and deliberately NOT
 * invented: the only integration adapter that performs network calls
 * (integrations/apify — PROD-008) is default-disabled and is not wired into
 * the runtime entry; nothing in the deployed demo performs LLM calls today.
 * Metering a call path that does not exist would be dishonest theater. When
 * a real integration lands, its adapter seam gets a meter HERE (the ledger
 * is open for new resources by design).
 *
 * SEMANTICS (identical for both ledger twins — the repo's twin discipline):
 *
 *   COUNT-kind resources (redis_commands, r2_objects): increment-then-
 *   decide. The counter counts ATTEMPTS, including refused ones (a bounded,
 *   conservative overcount — it can only make the guard stricter, never
 *   looser). Amounts are normalized to whole positive units (one unit per
 *   attempt — every real caller consumes exactly 1; degenerate 0/fractional
 *   amounts count as one attempt, the conservative direction) so the twins
 *   are observably identical for ANY call sequence. The Redis twin
 *   implements each unit as ONE atomic `increment` call, so every counted
 *   command maps 1:1 to one real REST command — which is what makes the
 *   400K default a safe margin under the 500K provider limit.
 *
 *   BYTES-kind resources (r2_storage_bytes): check-then-record. A refused
 *   upload records NOTHING (a refused upload stored nothing; one giant
 *   attempt must not permanently exhaust the meter for the month).
 *
 * THRESHOLD (default 80%, `AISE_QUOTA_THRESHOLD_PERCENT`): crossing into
 * the threshold band logs ONE structured warn per resource per window per
 * instance (`quota_<resource>_threshold` — usage numbers only, never
 * values, never credentials). At the cap the ledger REFUSES with a typed
 * `quota_exhausted` outcome and logs ONE first-refusal warn per resource
 * per window per instance; every subsequent refusal returns the same typed
 * failure (visible to the caller every time) without re-warning.
 *
 * PERSISTENCE: `InMemoryQuotaLedger` (the zero-config default — per
 * instance, honestly documented as such) and `RedisQuotaLedger` (used when
 * the PROD-007 Upstash pair is configured — counters live under
 * `aise:v1:quota:<resource>:<YYYY-MM>` with a TTL that expires the counter
 * at the window's end, mirroring the provider's monthly reset). The Redis
 * ledger's client is the outage-tolerant wrapper (`withMemoryFallback`):
 * during an Upstash outage counting continues on the local fallback
 * (undercounting the shared window — documented, conservative in the sense
 * that the outage also blocks the metered operations themselves).
 *
 * HONEST LIMITATIONS, documented here and in docs/COST-GUARDS.md:
 *  - the Redis ledger's own bookkeeping commands (the `increment`/`get`/
 *    `set` calls that persist counters) are NOT counted against
 *    redis_commands — for count-kind metering the increment IS the counter
 *    (1:1), and the bytes-kind get+set only runs on artifact uploads
 *    (rare); the cap margin (400K counted vs 500K provider) covers this.
 *  - the monthly window is the UTC calendar month (the provider's reset
 *    cadence); `windowId` is surfaced in every snapshot so operators can
 *    see which window a number belongs to.
 *  - check-then-increment has a bounded concurrency race (two overlapping
 *    consumes may both pass the check); the DECISION and reported budget
 *    always clamp to the cap, so the race can only overshoot the counter,
 *    never the refusal boundary — the safe direction.
 *
 * Determinism: pure functions plus an INJECTED clock (epoch ms). No I/O of
 * its own (the Redis twin delegates to an injected `RedisClientPort`), no
 * randomness, zero npm dependencies, no secrets — ever.
 */

import { buildRedisKey } from "../redis/keys";
import type {
  RedisClientPort,
  RedisDeleteResult,
  RedisExpireResult,
  RedisGetResult,
  RedisIncrementResult,
  RedisSetResult,
} from "../redis/model";
import { redisFailure } from "../redis/model";
import type { Logger } from "../lib/log";
import {
  ArtifactStorageError,
  type ArtifactBackendDescriptor,
  type ArtifactBlobInfo,
  type ArtifactStorage,
  type ArtifactStoragePutOutcome,
} from "../artifacts/storage";

/* ------------------------------------------------------------------ */
/* Resources + caps                                                     */
/* ------------------------------------------------------------------ */

/** The metered free-tier resources (see the module header for the set). */
export type QuotaResource =
  | "redis_commands"
  | "r2_storage_bytes"
  | "r2_objects";

/** Every metered resource, in stable snapshot order. */
export const QUOTA_RESOURCES: readonly QuotaResource[] = [
  "redis_commands",
  "r2_storage_bytes",
  "r2_objects",
] as const;

/** How a resource is counted (see the module header for the semantics). */
export type QuotaResourceKind = "count" | "bytes";

const RESOURCE_KINDS: Readonly<Record<QuotaResource, QuotaResourceKind>> = {
  redis_commands: "count",
  r2_storage_bytes: "bytes",
  r2_objects: "count",
};

/** The kind of a resource (count vs bytes — decides the consume semantics). */
export function quotaResourceKind(resource: QuotaResource): QuotaResourceKind {
  return RESOURCE_KINDS[resource];
}

/**
 * Conservative documented defaults (overridable via `AISE_QUOTA_*`):
 *  - redis_commands 400,000 = 80% of the Upstash free tier's 500K
 *    commands/month (docs/COST-GUARDS.md cites the provider page);
 *  - r2_storage_bytes 8 GiB = 80% of R2's 10 GB-month free storage;
 *  - r2_objects 100,000 = OPERATIONAL HYGIENE (R2 publishes no object-count
 *    cap on the free tier — see the module header).
 */
export const QUOTA_CAP_DEFAULTS: Readonly<Record<QuotaResource, number>> =
  Object.freeze({
    redis_commands: 400_000,
    r2_storage_bytes: 8 * 1024 * 1024 * 1024,
    r2_objects: 100_000,
  });

/** Default threshold percent (the warn band starts at 80% of a cap). */
export const QUOTA_THRESHOLD_PERCENT_DEFAULT = 80;

/** The ceiling for cap overrides (a cap above these is a misconfiguration). */
const CAP_CEILINGS: Readonly<Record<QuotaResource, number>> = Object.freeze({
  redis_commands: 100_000_000,
  r2_storage_bytes: 1024 * 1024 * 1024 * 1024,
  r2_objects: 100_000_000,
});

/** Parsed, validated quota configuration (values the wiring consumes). */
export interface QuotaConfig {
  readonly caps: Readonly<Record<QuotaResource, number>>;
  readonly thresholdPercent: number;
}

/** Strict whole-string integer parse: malformed/out-of-range → fallback. */
function parsePositiveInt(raw: string | undefined, fallback: number, max: number): number {
  const trimmed = raw?.trim() ?? "";
  if (!/^\d+$/.test(trimmed)) {
    return fallback;
  }
  const value = Number.parseInt(trimmed, 10);
  return value >= 1 && value <= max ? value : fallback;
}

/**
 * Parse the `AISE_QUOTA_*` variables. Malformed values fall back to the
 * documented conservative defaults (the workspace env gate is the validator
 * of record; this parser never throws and never guesses a secret). Mirrors
 * tools/env-schema.ts's PROD-013 rules exactly.
 */
export function parseQuotaConfig(env: Record<string, string | undefined>): QuotaConfig {
  return {
    caps: {
      redis_commands: parsePositiveInt(
        env.AISE_QUOTA_REDIS_COMMANDS,
        QUOTA_CAP_DEFAULTS.redis_commands,
        CAP_CEILINGS.redis_commands,
      ),
      r2_storage_bytes: parsePositiveInt(
        env.AISE_QUOTA_R2_BYTES,
        QUOTA_CAP_DEFAULTS.r2_storage_bytes,
        CAP_CEILINGS.r2_storage_bytes,
      ),
      r2_objects: parsePositiveInt(
        env.AISE_QUOTA_R2_OBJECTS,
        QUOTA_CAP_DEFAULTS.r2_objects,
        CAP_CEILINGS.r2_objects,
      ),
    },
    thresholdPercent: parsePositiveInt(
      env.AISE_QUOTA_THRESHOLD_PERCENT,
      QUOTA_THRESHOLD_PERCENT_DEFAULT,
      100,
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Windows (the provider reset cadence: UTC calendar months)            */
/* ------------------------------------------------------------------ */

/** The window id for an epoch-ms instant: the UTC "YYYY-MM" month. */
export function quotaWindowId(clockMs: number): string {
  const date = new Date(clockMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** When the window containing `clockMs` ends (epoch ms, UTC month start). */
export function quotaWindowEndMs(clockMs: number): number {
  const date = new Date(clockMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/** TTL (seconds, >= 1) that expires a key at its window's end. */
export function quotaWindowTtlSeconds(clockMs: number): number {
  return Math.max(1, Math.ceil((quotaWindowEndMs(clockMs) - clockMs) / 1000));
}

/** The Redis key a resource's counter lives under for one window. */
export function quotaCounterKey(resource: QuotaResource, windowId: string): string {
  return buildRedisKey("quota", resource, windowId);
}

/* ------------------------------------------------------------------ */
/* Typed outcomes                                                       */
/* ------------------------------------------------------------------ */

/** Per-meter state surfaced in snapshots and /readyz. */
export type QuotaMeterStatus = "ok" | "threshold" | "exhausted";

/** One meter's projected usage (pure data — safe to surface anywhere). */
export interface QuotaMeterSnapshot {
  readonly resource: QuotaResource;
  readonly used: number;
  readonly cap: number;
  readonly remaining: number;
  /** floor(remaining / cap * 100), clamped to 0..100. */
  readonly remainingPercent: number;
  readonly status: QuotaMeterStatus;
}

/** The ledger's whole state (pure data; windowId says which window). */
export interface QuotaLedgerSnapshot {
  /** Which window the numbers belong to (UTC "YYYY-MM"). */
  readonly windowId: string;
  readonly meters: readonly QuotaMeterSnapshot[];
}

/** The typed refusal at a hard cap (visible, never silent, never "upgrade"). */
export interface QuotaRefusal {
  readonly code: "quota_exhausted";
  readonly resource: QuotaResource;
  readonly used: number;
  readonly cap: number;
  /** Deterministic, log-safe detail (names + numbers, never secrets). */
  readonly detail: string;
}

/** `consume` resolves to one of these — NEVER throws. */
export type QuotaConsumeOutcome =
  | {
      readonly ok: true;
      readonly resource: QuotaResource;
      readonly used: number;
      readonly cap: number;
      readonly remaining: number;
      readonly remainingPercent: number;
      readonly status: QuotaMeterStatus;
    }
  | { readonly ok: false; readonly refusal: QuotaRefusal };

/**
 * Normalize a count-kind amount to whole positive units (twin parity — see
 * the module header). Every real caller consumes ONE unit per attempt; a
 * degenerate 0/fractional/NaN amount counts as one attempt, never zero
 * (the conservative direction: the counter may overcount, never undercount).
 */
function countUnits(amount: number): number {
  return Number.isFinite(amount) && amount >= 1 ? Math.floor(amount) : 1;
}

function remainingPercentOf(used: number, cap: number): number {
  if (cap <= 0) {
    return 0;
  }
  const percent = Math.floor(((cap - used) / cap) * 100);
  return Math.max(0, Math.min(100, percent));
}

function meterStatusOf(used: number, cap: number, thresholdPercent: number): QuotaMeterStatus {
  if (used >= cap) {
    return "exhausted";
  }
  const threshold = Math.floor((cap * thresholdPercent) / 100);
  if (used >= threshold) {
    return "threshold";
  }
  return "ok";
}

function allowedOutcome(
  resource: QuotaResource,
  used: number,
  cap: number,
  thresholdPercent: number,
): QuotaConsumeOutcome {
  return {
    ok: true,
    resource,
    used,
    cap,
    remaining: Math.max(0, cap - used),
    remainingPercent: remainingPercentOf(used, cap),
    status: meterStatusOf(used, cap, thresholdPercent),
  };
}

function refusalOf(resource: QuotaResource, used: number, cap: number): QuotaRefusal {
  return {
    code: "quota_exhausted",
    resource,
    used,
    cap,
    detail:
      `quota '${resource}' is exhausted: used ${used} of the configured cap ${cap} ` +
      "(AISE_QUOTA_* — conservative free-tier default, overridable) — the operation is " +
      "REFUSED to protect the free-tier budget; it is never auto-upgraded",
  };
}

/* ------------------------------------------------------------------ */
/* The ledger port                                                      */
/* ------------------------------------------------------------------ */

export interface QuotaLedgerOptions {
  /** Injected clock (epoch ms) — window math is deterministic. */
  readonly clock: () => number;
  /** The configured caps + threshold (see parseQuotaConfig). */
  readonly config: QuotaConfig;
  /** Structured logger (threshold + first-refusal warns). */
  readonly logger: Logger;
}

/**
 * The quota ledger port: count consumption, refuse at caps, project state.
 * Both twins MUST be observably identical given the same call sequence.
 */
export interface QuotaLedger {
  /**
   * Count `amount` of `resource` against its cap (see the module header for
   * the count-vs-bytes semantics). NEVER throws; refusals are typed data.
   */
  consume(resource: QuotaResource, amount: number): Promise<QuotaConsumeOutcome>;
  /** Pure projection of the current window's counters (no I/O). */
  snapshot(): QuotaLedgerSnapshot;
}

/** Shared warn bookkeeping: once per resource per window per instance. */
abstract class BaseQuotaLedger implements QuotaLedger {
  protected readonly clock: () => number;
  protected readonly config: QuotaConfig;
  private readonly logger: Logger;
  private readonly warned = new Set<string>();

  constructor(options: QuotaLedgerOptions) {
    this.clock = options.clock;
    this.config = options.config;
    this.logger = options.logger;
  }

  abstract consume(
    resource: QuotaResource,
    amount: number,
  ): Promise<QuotaConsumeOutcome>;
  abstract snapshot(): QuotaLedgerSnapshot;

  /** Warn-once helper keyed by (kind, resource, window). */
  protected warnOnce(
    kind: "threshold" | "refusal",
    resource: QuotaResource,
    windowId: string,
    message: string,
    fields: Record<string, unknown>,
  ): void {
    const key = `${kind}:${resource}:${windowId}`;
    if (this.warned.has(key)) {
      return;
    }
    this.warned.add(key);
    this.logger.warn(message, fields);
  }
}

/* ------------------------------------------------------------------ */
/* The in-memory twin (zero-config default; per-instance, honestly)     */
/* ------------------------------------------------------------------ */

/**
 * The zero-config ledger: per-instance counters for the current UTC month
 * window. HONEST scope: on a multi-instance deployment each instance
 * counts only its own consumption (documented in docs/COST-GUARDS.md —
 * the shared-window view requires the Redis twin).
 */
export class InMemoryQuotaLedger extends BaseQuotaLedger {
  private windowId: string;
  private readonly counts = new Map<QuotaResource, number>();

  constructor(options: QuotaLedgerOptions) {
    super(options);
    this.windowId = quotaWindowId(options.clock());
  }

  /** Reset the counters when the clock crosses into a new window. */
  private rollWindow(): void {
    const current = quotaWindowId(this.clock());
    if (current !== this.windowId) {
      this.windowId = current;
      this.counts.clear();
    }
  }

  async consume(resource: QuotaResource, amount: number): Promise<QuotaConsumeOutcome> {
    this.rollWindow();
    const cap = this.config.caps[resource];
    const current = this.counts.get(resource) ?? 0;
    if (RESOURCE_KINDS[resource] === "bytes") {
      // Check-then-record: a refused upload records nothing.
      if (current + amount > cap) {
        this.warnOnce("refusal", resource, this.windowId, `quota_${resource}_exhausted`, {
          resource,
          used: current,
          cap,
          windowId: this.windowId,
          ledger: "memory",
        });
        return { ok: false, refusal: refusalOf(resource, current, cap) };
      }
      const used = current + amount;
      this.counts.set(resource, used);
      this.maybeThresholdWarn(resource, used, cap);
      return allowedOutcome(resource, used, cap, this.config.thresholdPercent);
    }
    // Count-kind: increment-then-decide (the counter counts attempts).
    const used = current + countUnits(amount);
    this.counts.set(resource, used);
    if (used > cap) {
      this.warnOnce("refusal", resource, this.windowId, `quota_${resource}_exhausted`, {
        resource,
        used,
        cap,
        windowId: this.windowId,
        ledger: "memory",
      });
      return { ok: false, refusal: refusalOf(resource, used, cap) };
    }
    this.maybeThresholdWarn(resource, used, cap);
    return allowedOutcome(resource, used, cap, this.config.thresholdPercent);
  }

  snapshot(): QuotaLedgerSnapshot {
    this.rollWindow();
    return {
      windowId: this.windowId,
      meters: QUOTA_RESOURCES.map((resource) => {
        const cap = this.config.caps[resource];
        const used = this.counts.get(resource) ?? 0;
        return projectMeter(resource, used, cap, this.config.thresholdPercent);
      }),
    };
  }

  private maybeThresholdWarn(resource: QuotaResource, used: number, cap: number): void {
    if (meterStatusOf(used, cap, this.config.thresholdPercent) !== "threshold") {
      return;
    }
    this.warnOnce("threshold", resource, this.windowId, `quota_${resource}_threshold`, {
      resource,
      used,
      cap,
      remainingPercent: remainingPercentOf(used, cap),
      windowId: this.windowId,
      ledger: "memory",
    });
  }
}

/** Build one meter snapshot (pure). */
export function projectMeter(
  resource: QuotaResource,
  used: number,
  cap: number,
  thresholdPercent: number,
): QuotaMeterSnapshot {
  return {
    resource,
    used,
    cap,
    remaining: Math.max(0, cap - used),
    remainingPercent: remainingPercentOf(used, cap),
    status: meterStatusOf(used, cap, thresholdPercent),
  };
}

/* ------------------------------------------------------------------ */
/* The Redis twin (when the PROD-007 Upstash pair is configured)        */
/* ------------------------------------------------------------------ */

export interface RedisQuotaLedgerOptions extends QuotaLedgerOptions {
  /**
   * The client the counters live on. The composition root passes an
   * OUTAGE-TOLERANT wrapper over the raw Upstash client (see the module
   * header): counter writes never fail, they degrade to the local twin.
   */
  readonly client: RedisClientPort;
}

/**
 * The shared-window ledger: counters under
 * `aise:v1:quota:<resource>:<YYYY-MM>`, TTL-expiring at the window's end
 * (the provider's monthly reset cadence). All instances configured against
 * the same Upstash database share one window counter.
 */
export class RedisQuotaLedger extends BaseQuotaLedger {
  private readonly client: RedisClientPort;
  /** Cached view for snapshots (updated on every consume — see header). */
  private cached = new Map<QuotaResource, number>();
  private cachedWindowId: string;

  constructor(options: RedisQuotaLedgerOptions) {
    super(options);
    this.client = options.client;
    this.cachedWindowId = quotaWindowId(options.clock());
  }

  async consume(resource: QuotaResource, amount: number): Promise<QuotaConsumeOutcome> {
    const nowMs = this.clock();
    const windowId = quotaWindowId(nowMs);
    const cap = this.config.caps[resource];
    const key = quotaCounterKey(resource, windowId);
    this.resetCacheOnWindowChange(windowId);

    if (RESOURCE_KINDS[resource] === "count") {
      // ONE atomic increment per UNIT: the counter IS the count, so
      // counted commands map 1:1 to real REST commands (the property the
      // conservative default's margin is computed from — see the header).
      // Units are normalized (countUnits) so the twins are observably
      // identical for any amount; every real caller passes exactly 1.
      const units = countUnits(amount);
      let used = 0;
      for (let unit = 0; unit < units; unit++) {
        const result = await this.client.increment(key, quotaWindowTtlSeconds(nowMs));
        if (!result.ok) {
          // The composition root hands us an outage-tolerant client, so a
          // failure here means the FALLBACK itself failed (impossible by
          // contract). Still: never throw, never count blind — refuse the
          // consume with the typed refusal shape so the caller sees the
          // metering is unavailable rather than silently unbounded.
          return this.ledgerUnavailable(resource, cap, windowId, result.failure.kind);
        }
        used = result.value;
      }
      this.cached.set(resource, used);
      if (used > cap) {
        this.warnOnce("refusal", resource, windowId, `quota_${resource}_exhausted`, {
          resource,
          used,
          cap,
          windowId,
          ledger: "redis",
        });
        return { ok: false, refusal: refusalOf(resource, used, cap) };
      }
      this.maybeThresholdWarn(resource, used, cap, windowId);
      return allowedOutcome(resource, used, cap, this.config.thresholdPercent);
    }

    // Bytes-kind: read-check-write. A refused upload records nothing.
    const currentResult = await this.client.get(key);
    if (!currentResult.ok) {
      return this.ledgerUnavailable(resource, cap, windowId, currentResult.failure.kind);
    }
    const current = parseCounter(currentResult.value);
    if (current === null) {
      // Corrupt counter: reset to zero (warn) — a fresh window is strictly
      // more conservative than trusting junk bytes.
      this.loggerWarnCorrupt(resource, windowId);
    }
    const base = current ?? 0;
    if (base + amount > cap) {
      this.warnOnce("refusal", resource, windowId, `quota_${resource}_exhausted`, {
        resource,
        used: base,
        cap,
        windowId,
        ledger: "redis",
      });
      return { ok: false, refusal: refusalOf(resource, base, cap) };
    }
    const write = await this.client.set(key, String(base + amount), quotaWindowTtlSeconds(nowMs));
    if (!write.ok) {
      return this.ledgerUnavailable(resource, cap, windowId, write.failure.kind);
    }
    const used = base + amount;
    this.cached.set(resource, used);
    this.maybeThresholdWarn(resource, used, cap, windowId);
    return allowedOutcome(resource, used, cap, this.config.thresholdPercent);
  }

  snapshot(): QuotaLedgerSnapshot {
    // Readiness discipline: NO I/O on the snapshot path — this is the
    // cached view as of the last consume on THIS instance (documented in
    // docs/COST-GUARDS.md; the authoritative shared counter is the key).
    const windowId = quotaWindowId(this.clock());
    this.resetCacheOnWindowChange(windowId);
    return {
      windowId,
      meters: QUOTA_RESOURCES.map((resource) =>
        projectMeter(
          resource,
          this.cached.get(resource) ?? 0,
          this.config.caps[resource],
          this.config.thresholdPercent,
        ),
      ),
    };
  }

  private ledgerUnavailable(
    resource: QuotaResource,
    cap: number,
    windowId: string,
    kind: string,
  ): QuotaConsumeOutcome {
    this.warnOnce("refusal", resource, windowId, `quota_${resource}_ledger_unavailable`, {
      resource,
      kind,
      windowId,
      detail: "the quota ledger's redis client failed — refusing the metered operation",
    });
    return {
      ok: false,
      refusal: {
        code: "quota_exhausted",
        resource,
        used: this.cached.get(resource) ?? 0,
        cap,
        detail:
          `quota ledger unavailable (${kind}) — refusing the metered operation ` +
          "rather than spending uncounted",
      },
    };
  }

  private loggerWarnCorrupt(resource: QuotaResource, windowId: string): void {
    this.warnOnce("refusal", resource, windowId, `quota_${resource}_counter_corrupt`, {
      resource,
      windowId,
      detail: "the stored counter is not a non-negative integer — resetting to 0",
    });
  }

  private resetCacheOnWindowChange(windowId: string): void {
    if (windowId !== this.cachedWindowId) {
      this.cachedWindowId = windowId;
      this.cached.clear();
    }
  }

  private maybeThresholdWarn(
    resource: QuotaResource,
    used: number,
    cap: number,
    windowId: string,
  ): void {
    if (meterStatusOf(used, cap, this.config.thresholdPercent) !== "threshold") {
      return;
    }
    this.warnOnce("threshold", resource, windowId, `quota_${resource}_threshold`, {
      resource,
      used,
      cap,
      remainingPercent: remainingPercentOf(used, cap),
      windowId,
      ledger: "redis",
    });
  }
}

/** Parse a stored counter: non-negative integers only, else null. */
function parseCounter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null;
  }
  return Number.parseInt(value, 10);
}

/* ------------------------------------------------------------------ */
/* MeteredRedisClient — the Upstash command meter                       */
/* ------------------------------------------------------------------ */

export interface MeteredRedisOptions {
  /** The real client every command is dispatched through. */
  readonly inner: RedisClientPort;
  /** The ledger `redis_commands` is counted against. */
  readonly ledger: QuotaLedger;
  readonly logger: Logger;
}

/**
 * `RedisClientPort` wrapper that meters EVERY port call as one
 * `redis_commands` consumption and REFUSES to dispatch when the cap is
 * reached — the hard cap that keeps the demo provably incapable of
 * silently burning the Upstash free tier. Refusals are typed
 * `quota_exceeded` failures (the PROD-007 failure family's kind for quota
 * signatures — the detail names the LOCAL cap, distinguishing a
 * cost-guard refusal from a provider-side quota answer) and the
 * underlying operation is NEVER dispatched.
 */
export class MeteredRedisClient implements RedisClientPort {
  readonly mode: "upstash" | "memory";

  private readonly inner: RedisClientPort;
  private readonly ledger: QuotaLedger;
  private readonly logger: Logger;

  constructor(options: MeteredRedisOptions) {
    this.inner = options.inner;
    this.ledger = options.ledger;
    this.logger = options.logger;
    this.mode = options.inner.mode;
  }

  async get(key: string): Promise<RedisGetResult> {
    return this.dispatch("get", (client) => client.get(key));
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<RedisSetResult> {
    return this.dispatch("set", (client) => client.set(key, value, ttlSeconds));
  }

  async delete(key: string): Promise<RedisDeleteResult> {
    return this.dispatch("delete", (client) => client.delete(key));
  }

  async expire(key: string, ttlSeconds: number): Promise<RedisExpireResult> {
    return this.dispatch("expire", (client) => client.expire(key, ttlSeconds));
  }

  async increment(key: string, ttlSeconds: number): Promise<RedisIncrementResult> {
    return this.dispatch("increment", (client) => client.increment(key, ttlSeconds));
  }

  private async dispatch<T extends { readonly ok: boolean }>(
    operation: string,
    run: (client: RedisClientPort) => Promise<T>,
  ): Promise<T> {
    const outcome = await this.ledger.consume("redis_commands", 1);
    if (!outcome.ok) {
      // The hard cap: refuse to spend. Typed, visible, never dispatched.
      // (Every RedisClientPort result union carries exactly this failure
      // arm — the outage wrapper's AnyRedisResult discipline — so the
      // double cast is sound, not a shape invention.)
      this.logger.warn("quota_redis_commands_refused", {
        operation,
        used: outcome.refusal.used,
        cap: outcome.refusal.cap,
      });
      return {
        ok: false,
        failure: redisFailure(
          "quota_exceeded",
          `cost-guard cap reached for redis commands (used ${outcome.refusal.used} of ` +
            `${outcome.refusal.cap}, AISE_QUOTA_REDIS_COMMANDS) — the '${operation}' was ` +
            "refused before dispatch to protect the free-tier budget",
        ),
      } as unknown as T;
    }
    return run(this.inner);
  }
}

/* ------------------------------------------------------------------ */
/* MeteredArtifactStorage — the R2 bytes/objects meter                  */
/* ------------------------------------------------------------------ */

export interface MeteredArtifactStorageOptions {
  /** The real storage backend (R2 in the wired deployment). */
  readonly inner: ArtifactStorage;
  /** The ledger r2_storage_bytes + r2_objects are counted against. */
  readonly ledger: QuotaLedger;
  readonly logger: Logger;
}

/**
 * `ArtifactStorage` wrapper that meters artifact uploads: every `put`
 * counts its bytes against `r2_storage_bytes` and one object against
 * `r2_objects` BEFORE the dispatch, refusing with the typed
 * `ArtifactStorageError("quota_exceeded", …)` when either cap is reached —
 * the blob write never happens, so the metadata rows (the authoritative
 * artifact registry) are never written for a refused upload.
 *
 * HONEST overcount, documented: `put` is metered unconditionally — a
 * content-addressed duplicate (identical bytes already stored) re-counts
 * its bytes rather than paying a `head()` probe per upload (one extra R2
 * Class B op per put to save an overcount is the wrong trade at demo
 * scale; the conservative direction is the safe one).
 */
export class MeteredArtifactStorage implements ArtifactStorage {
  private readonly inner: ArtifactStorage;
  private readonly ledger: QuotaLedger;
  private readonly logger: Logger;

  constructor(options: MeteredArtifactStorageOptions) {
    this.inner = options.inner;
    this.ledger = options.ledger;
    this.logger = options.logger;
  }

  async put(contentSha256: string, bytes: Uint8Array): Promise<ArtifactStoragePutOutcome> {
    const bytesOutcome = await this.ledger.consume("r2_storage_bytes", bytes.byteLength);
    if (!bytesOutcome.ok) {
      this.logger.warn("quota_r2_storage_bytes_refused", {
        byteSize: bytes.byteLength,
        used: bytesOutcome.refusal.used,
        cap: bytesOutcome.refusal.cap,
      });
      throw new ArtifactStorageError("quota_exceeded", bytesOutcome.refusal.detail);
    }
    const objectsOutcome = await this.ledger.consume("r2_objects", 1);
    if (!objectsOutcome.ok) {
      this.logger.warn("quota_r2_objects_refused", {
        used: objectsOutcome.refusal.used,
        cap: objectsOutcome.refusal.cap,
      });
      throw new ArtifactStorageError("quota_exceeded", objectsOutcome.refusal.detail);
    }
    return this.inner.put(contentSha256, bytes);
  }

  async get(contentSha256: string): Promise<Uint8Array | null> {
    return this.inner.get(contentSha256);
  }

  async head(contentSha256: string): Promise<ArtifactBlobInfo | null> {
    return this.inner.head(contentSha256);
  }

  async remove(contentSha256: string): Promise<boolean> {
    return this.inner.remove(contentSha256);
  }

  describe(): ArtifactBackendDescriptor {
    return this.inner.describe();
  }
}
