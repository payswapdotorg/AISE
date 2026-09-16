/**
 * Redis outage degradation wrapper — PROD-007.
 *
 * The loud-but-non-fatal seam between an Upstash deployment and the
 * deterministic memory twin. It satisfies `RedisClientPort` itself, so
 * consumers hold ONE client and never see an outage as an exception —
 * they ASK about it (health-visible data):
 *
 *  - ON TYPED FAILURE of the primary (upstash) client, the wrapper
 *    records an outage event (operation, kind, deterministic detail,
 *    injected-clock timestamp), SWITCHES to the injected fallback (the
 *    in-memory client) and answers the operation from it — the very
 *    call that discovered the outage still succeeds.
 *  - STICKY, TIME-BOUNDED DEGRADATION: after `retryAfterMs` (injected
 *    clock), the next operation probes the primary again — success
 *    recovers (mode flips back, a recovery timestamp is recorded);
 *    failure re-degrades and pushes the next probe out. Free-tier
 *    blips heal; hard outages stay loudly degraded.
 *  - NEVER FATAL, NEVER SILENT: operations resolve via the fallback
 *    (typed outcomes only); `currentMode()`, `lastOutageAt()`,
 *    `lastRecoveryAt()` and `outageEvents()` expose the degradation
 *    for health.ts.
 */

import { MemoryRedisClient } from "./client-memory";
import type {
  RedisClock,
  RedisClientPort,
  RedisDeleteResult,
  RedisExpireResult,
  RedisFailure,
  RedisGetResult,
  RedisIncrementResult,
  RedisMode,
  RedisSetResult,
} from "./model";

/** One recorded outage event (deterministic detail; no credentials). */
export interface RedisOutageEvent {
  readonly atMs: number;
  readonly operation: string;
  readonly kind: RedisFailure["kind"];
  readonly detail: string;
}

export interface OutageTolerantRedisOptions {
  /** The production client (upstash). */
  readonly primary: RedisClientPort;
  /** The degradation fallback (the memory twin). */
  readonly fallback: RedisClientPort;
  /** Injected clock (epoch ms). */
  readonly clock: RedisClock;
  /** How long to stay degraded before probing the primary again (ms, > 0). */
  readonly retryAfterMs?: number;
}

const DEFAULT_RETRY_AFTER_MS = 30_000;

/** The dispatch-relevant shape of every port result union. */
type AnyRedisResult = { readonly ok: true } | { readonly ok: false; readonly failure: RedisFailure };

export class OutageTolerantRedis implements RedisClientPort {
  private readonly primary: RedisClientPort;
  private readonly fallback: RedisClientPort;
  private readonly clock: RedisClock;
  private readonly retryAfterMs: number;

  private degraded: boolean = false;
  private degradeAtMs: number | null = null;
  private nextProbeAtMs: number | null = null;
  private recoveredAtMs: number | null = null;
  private readonly events: RedisOutageEvent[] = [];

  constructor(options: OutageTolerantRedisOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback;
    this.clock = options.clock;
    this.retryAfterMs = options.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
  }

  /** Which backing implementation answers RIGHT NOW (health-visible). */
  get mode(): RedisMode {
    return this.currentMode();
  }

  currentMode(): RedisMode {
    return this.degraded ? this.fallback.mode : this.primary.mode;
  }

  /** When the last outage began (epoch ms), or null when never. */
  lastOutageAt(): number | null {
    return this.degradeAtMs;
  }

  /** When the last recovery happened (epoch ms), or null when never. */
  lastRecoveryAt(): number | null {
    return this.recoveredAtMs;
  }

  /** The recorded outage events (chronological; deterministic data). */
  outageEvents(): readonly RedisOutageEvent[] {
    return this.events;
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

  /**
   * The degradation state machine. Healthy → try the primary (record +
   * fall back on typed failure). Degraded → serve from the fallback
   * until the probe time, then try the primary once (recover or
   * re-degrade). The fallback is a deterministic memory client, so this
   * method only fails if the FALLBACK fails (it cannot, by contract).
   */
  private async dispatch<T extends AnyRedisResult>(
    operation: string,
    run: (client: RedisClientPort) => Promise<T>,
  ): Promise<T> {
    const now = this.clock();
    const shouldProbe = this.degraded && this.nextProbeAtMs !== null && now >= this.nextProbeAtMs;
    if (!this.degraded || shouldProbe) {
      const result = await run(this.primary);
      if (result.ok) {
        if (this.degraded) {
          this.degraded = false;
          this.recoveredAtMs = now;
        }
        return result;
      }
      const firstOutage = !this.degraded;
      this.recordOutage(now, operation, result.failure);
      if (!firstOutage) {
        // A failed probe: push the next probe out from now.
        this.nextProbeAtMs = now + this.retryAfterMs;
      }
    }
    return run(this.fallback);
  }

  private recordOutage(now: number, operation: string, failure: RedisFailure): void {
    this.degraded = true;
    this.degradeAtMs = now;
    this.nextProbeAtMs = now + this.retryAfterMs;
    this.events.push({
      atMs: now,
      operation,
      kind: failure.kind,
      detail: `primary redis ${failure.kind}: ${failure.detail} — serving from the in-memory fallback`,
    });
  }
}

/**
 * Convenience constructor: an outage-tolerant wrapper whose fallback is a
 * FRESH deterministic memory client sharing the wrapper's injected clock
 * (the factory's default composition).
 */
export function withMemoryFallback(
  primary: RedisClientPort,
  clock: RedisClock,
  retryAfterMs?: number,
): OutageTolerantRedis {
  return new OutageTolerantRedis({
    primary,
    fallback: new MemoryRedisClient({ clock }),
    clock,
    retryAfterMs,
  });
}
