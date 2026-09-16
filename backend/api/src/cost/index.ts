/**
 * Cost family barrel + composition root — PROD-013.
 *
 * `bootCostGuards` is the ONE place environment becomes the cost-guard
 * wiring (the redis family's env-factory discipline, applied to cost):
 * pure construction, NO I/O at boot, honest mode matrix:
 *
 *  - QUOTA LEDGER: the PROD-007 Upstash pair (AISE_REDIS_REST_URL +
 *    AISE_REDIS_REST_TOKEN both present) → the Redis twin (shared monthly
 *    window counters, outage-tolerant); anything else → the in-memory
 *    per-instance twin (honestly labeled). Half-configured → the memory
 *    twin (the redis family's env factory owns that group's validation;
 *    the session-store seam already warns on it — no duplicate nagging).
 *  - METERED REDIS CLIENT: built ONLY in upstash mode (metering a memory
 *    client would count a resource nobody bills — dishonest theater). It
 *    is the client the runtime hands to the PROD-011b session-store seam
 *    and to this family's guard, so EVERY Upstash REST command the process
 *    issues is counted against `redis_commands`.
 *  - THE GUARD: the expensive-route rate limiter over the metered client
 *    (upstash mode) or a fresh per-instance memory client (default mode).
 *  - UPLOAD CAP: parsed here, enforced at the entry pipeline (uploads.ts).
 *
 * The snapshot this module projects is what /readyz's additive `cost`
 * section serves: ledger mode + window + one meter per resource with
 * usage/cap/remaining percent and the per-field status
 * (`ok | threshold | exhausted`), PLUS the honest `metered` flag (false =
 * no external provider is configured for that resource — the counter is
 * idle, not secretly counting) and the guard's tuning (window + budgets).
 * A meter at cap is reported as `exhausted` per-field AND in the
 * cost-level aggregate; the top-level /readyz `ok` (config validity) is
 * deliberately untouched — a quota cap degrades an optional dimension, it
 * does not make the service's configuration invalid (documented in
 * docs/COST-GUARDS.md).
 *
 * Determinism: everything here is a pure function of the env record plus
 * the injected clock; construction performs zero I/O (the Upstash client's
 * constructor performs none — PROD-007 contract).
 */

import { UpstashRedisClient } from "../redis/client-upstash";
import { MemoryRedisClient } from "../redis/client-memory";
import { withMemoryFallback } from "../redis/outage";
import type { RedisClientPort } from "../redis/model";
import type { Logger } from "../lib/log";
import {
  InMemoryQuotaLedger,
  MeteredRedisClient,
  parseQuotaConfig,
  projectMeter,
  QUOTA_RESOURCES,
  quotaWindowId,
  RedisQuotaLedger,
  type QuotaConfig,
  type QuotaLedger,
  type QuotaMeterStatus,
} from "./quotas";
import {
  CostGuard,
  parseRateLimitTuning,
  type RateLimitTuning,
} from "./guards";
import { uploadCapOrDefault } from "./uploads";

export * from "./quotas";
export * from "./guards";
export * from "./uploads";

/* ------------------------------------------------------------------ */
/* Readiness projection (pure data — no I/O on the readiness path)      */
/* ------------------------------------------------------------------ */

/** One meter's /readyz projection (the ledger view + the honest flags). */
export interface CostMeterReadiness {
  readonly resource: string;
  /** False when no external provider is configured for this resource. */
  readonly metered: boolean;
  readonly used: number;
  readonly cap: number;
  readonly remaining: number;
  readonly remainingPercent: number;
  readonly status: QuotaMeterStatus;
}

/** The /readyz `cost` section (additive — served beside providers/auth/artifacts). */
export interface CostReadiness {
  /** Which ledger twin is counting ("memory" = per-instance, honestly). */
  readonly ledger: "memory" | "redis";
  /** The UTC month window the numbers belong to ("YYYY-MM"). */
  readonly windowId: string;
  /** The threshold percent the warn band starts at. */
  readonly thresholdPercent: number;
  readonly meters: readonly CostMeterReadiness[];
  /** The expensive-route guard's tuning (pure config — no counters read). */
  readonly rateLimit: {
    readonly windowSeconds: number;
    readonly maxPerPrincipal: number;
    readonly maxGlobal: number;
  };
  /** The upload cap enforced before body buffering (bytes). */
  readonly maxUploadBytes: number;
  /** Honest aggregate: the worst per-meter status, never a lying ok. */
  readonly status: QuotaMeterStatus;
}

/* ------------------------------------------------------------------ */
/* Boot                                                                 */
/* ------------------------------------------------------------------ */

export interface BootCostGuardsOptions {
  /** The environment record (the SAME source /readyz re-checks). */
  readonly env: Record<string, string | undefined>;
  /** Structured logger (mode lines: names, never values). */
  readonly logger: Logger;
  /** Injected clock (epoch ms) — defaults to the wall clock HERE only. */
  readonly clock?: () => number;
}

export interface CostBoot {
  /** The quota ledger (memory or redis twin — see the mode matrix). */
  readonly ledger: QuotaLedger;
  /**
   * The metered Upstash client (upstash mode ONLY; null otherwise). The
   * runtime uses it as THE Upstash client so every REST command is counted.
   */
  readonly meteredRedis: RedisClientPort | null;
  /** The expensive-route guard (always constructed — see guards.ts). */
  readonly guard: CostGuard;
  /** The upload cap in bytes (enforced by uploads.ts at the pipeline). */
  readonly maxUploadBytes: number;
  /** The quota configuration actually in force (parsed + defaults). */
  readonly quotaConfig: QuotaConfig;
  /** The guard tuning actually in force. */
  readonly rateLimitTuning: RateLimitTuning;
  /**
   * The pure /readyz projection: ledger mode + window + meters + guard
   * tuning. NO I/O — the redis twin serves its cached last-consume view
   * (documented; the authoritative counter is the shared key).
   */
  readonly readiness: () => CostReadiness;
}

/**
 * Build the cost-guard wiring from an environment record. NEVER throws;
 * construction performs NO I/O. The mode matrix is on the module header.
 */
export function bootCostGuards(options: BootCostGuardsOptions): CostBoot {
  const clock = options.clock ?? (() => Date.now());
  const logger = options.logger;
  const quotaConfig = parseQuotaConfig(options.env);
  const rateLimitTuning = parseRateLimitTuning(options.env);
  const maxUploadBytes = uploadCapOrDefault(options.env.AISE_MAX_UPLOAD_BYTES);

  const redisUrl = options.env.AISE_REDIS_REST_URL?.trim() ?? "";
  const redisToken = options.env.AISE_REDIS_REST_TOKEN?.trim() ?? "";
  const upstashConfigured = redisUrl !== "" && redisToken !== "";

  let ledger: QuotaLedger;
  let meteredRedis: RedisClientPort | null = null;
  let guardClient: RedisClientPort;
  let ledgerMode: "memory" | "redis";

  if (upstashConfigured) {
    const raw = new UpstashRedisClient({ url: redisUrl, token: redisToken });
    // The ledger counts on the outage-tolerant wrapper: counter writes
    // degrade to the local twin instead of failing (see quotas.ts header).
    ledger = new RedisQuotaLedger({
      client: withMemoryFallback(raw, clock),
      clock,
      config: quotaConfig,
      logger,
    });
    // THE Upstash client of the process: every command counted + capped.
    meteredRedis = new MeteredRedisClient({ inner: raw, ledger, logger });
    guardClient = meteredRedis;
    ledgerMode = "redis";
    logger.info("cost_guards_mode", {
      ledger: "redis",
      meteredRedis: true,
      detail:
        "upstash pair configured — quota counters shared by window; every redis " +
        "command is metered and capped (AISE_QUOTA_REDIS_COMMANDS)",
    });
  } else {
    ledger = new InMemoryQuotaLedger({ clock, config: quotaConfig, logger });
    guardClient = new MemoryRedisClient({ clock });
    ledgerMode = "memory";
    logger.info("cost_guards_mode", {
      ledger: "memory",
      meteredRedis: false,
      detail:
        "no upstash pair configured — per-instance quota counters and per-instance " +
        "rate-limit windows (honest scope; set AISE_REDIS_REST_URL + AISE_REDIS_REST_TOKEN " +
        "for shared counters)",
    });
  }

  const guard = new CostGuard({
    client: guardClient,
    tuning: rateLimitTuning,
    clock,
    logger,
  });

  // Which meters have a real external provider behind them (the honest
  // `metered` flag): redis_commands iff the upstash pair is present;
  // r2_storage_bytes / r2_objects iff the R2 group is COMPLETE (the local
  // fs twin bills nobody — PROD-006's resolveR2StorageConfig owns that
  // group's semantics; this is a presence mirror, never a second validator).
  const r2Configured = isR2GroupComplete(options.env);

  const readiness = (): CostReadiness => {
    const snapshot = ledger.snapshot();
    const meters = QUOTA_RESOURCES.map((resource): CostMeterReadiness => {
      const view =
        snapshot.meters.find((meter) => meter.resource === resource) ??
        projectMeter(resource, 0, quotaConfig.caps[resource], quotaConfig.thresholdPercent);
      const metered =
        resource === "redis_commands" ? upstashConfigured : r2Configured;
      return {
        resource,
        metered,
        used: view.used,
        cap: view.cap,
        remaining: view.remaining,
        remainingPercent: view.remainingPercent,
        status: view.status,
      };
    });
    const aggregate: QuotaMeterStatus = meters.some((meter) => meter.status === "exhausted")
      ? "exhausted"
      : meters.some((meter) => meter.status === "threshold")
        ? "threshold"
        : "ok";
    return {
      ledger: ledgerMode,
      windowId: quotaWindowId(clock()),
      thresholdPercent: quotaConfig.thresholdPercent,
      meters,
      rateLimit: {
        windowSeconds: rateLimitTuning.windowSeconds,
        maxPerPrincipal: rateLimitTuning.maxPerPrincipal,
        maxGlobal: rateLimitTuning.maxGlobal,
      },
      maxUploadBytes,
      status: aggregate,
    };
  };

  return {
    ledger,
    meteredRedis,
    guard,
    maxUploadBytes,
    quotaConfig,
    rateLimitTuning,
    readiness,
  };
}

/** The R2 group's required members (presence mirror — see readiness()). */
function isR2GroupComplete(env: Record<string, string | undefined>): boolean {
  const required = ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
  return required.every((name) => (env[name]?.trim() ?? "") !== "");
}
