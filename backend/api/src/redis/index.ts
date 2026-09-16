/**
 * Redis family barrel + env factory — PROD-007.
 *
 * `createRedisFromEnv` is the composition root of the redis family —
 * the ONLY place environment becomes a client. The mode matrix is
 * EXPLICIT AND HONEST (never a silent pretend-upstash):
 *
 *  - `AISE_REDIS_REST_URL` + `AISE_REDIS_REST_TOKEN` both present →
 *    UPSTASH mode: the REST adapter (client-upstash.ts) wrapped in the
 *    outage-tolerant seam (outage.ts) whose fallback is a fresh
 *    deterministic memory client — an outage degrades loudly, never
 *    fatally.
 *  - neither present → MEMORY mode: the deterministic in-memory twin,
 *    reported as exactly what it is (the no-credentials development
 *    default; readiness says "explicit memory mode").
 *  - ONE present (half-configured group) → MEMORY mode + an explicit
 *    `misconfiguration` reason. The workspace env gate
 *    (tools/env-schema.ts, PROD-007 redis group) fails this state
 *    deterministically; the factory still refuses to guess.
 *
 * Tuning variables (all optional, all with documented defaults that
 * mirror tools/env-schema.ts exactly) are parsed here and handed to the
 * runtime wiring (PROD-010's scope) — never hidden inside the helpers.
 *
 * The clock defaults to the wall clock AT THIS COMPOSITION ROOT ONLY:
 * the clients and helpers themselves take an injected clock (the repo's
 * determinism discipline); tests and deterministic callers inject.
 */

import { MemoryRedisClient } from "./client-memory";
import { UpstashRedisClient } from "./client-upstash";
import { withMemoryFallback } from "./outage";
import type { RedisClock, RedisClientPort, RedisMode } from "./model";

export * from "./model";
export * from "./client-memory";
export * from "./client-upstash";
export * from "./keys";
export * from "./cache";
export * from "./ratelimit";
export * from "./jobs";
export * from "./outage";
export * from "./health";

/* ------------------------------------------------------------------ */
/* Tuning                                                               */
/* ------------------------------------------------------------------ */

/** Parsed, validated tuning (values the runtime wiring consumes). */
export interface RedisTuning {
  /** Default cache TTL seconds (AISE_REDIS_CACHE_TTL_SECONDS, default 300). */
  readonly cacheTtlSeconds: number;
  /** Rate-limit window seconds (AISE_REDIS_RATELIMIT_WINDOW_SECONDS, default 60). */
  readonly rateLimitWindowSeconds: number;
  /** Rate-limit max per window (AISE_REDIS_RATELIMIT_MAX, default 100). */
  readonly rateLimitMax: number;
}

/** The documented defaults (MUST mirror tools/env-schema.ts exactly). */
export const REDIS_TUNING_DEFAULTS: Readonly<RedisTuning> = Object.freeze({
  cacheTtlSeconds: 300,
  rateLimitWindowSeconds: 60,
  rateLimitMax: 100,
});

/**
 * Parse the tuning variables. Malformed values fall back to the
 * documented default (the env gate is the validator of record; the
 * factory never throws and never guesses a secret).
 */
export function redisTuningFromEnv(env: Record<string, string | undefined>): RedisTuning {
  const cacheRaw = env.AISE_REDIS_CACHE_TTL_SECONDS;
  const windowRaw = env.AISE_REDIS_RATELIMIT_WINDOW_SECONDS;
  const maxRaw = env.AISE_REDIS_RATELIMIT_MAX;
  return {
    cacheTtlSeconds: parseTuning(cacheRaw, 60, 2_592_000, REDIS_TUNING_DEFAULTS.cacheTtlSeconds),
    rateLimitWindowSeconds: parseTuning(windowRaw, 60, 2_592_000, REDIS_TUNING_DEFAULTS.rateLimitWindowSeconds),
    rateLimitMax: parseTuning(maxRaw, 1, 100_000, REDIS_TUNING_DEFAULTS.rateLimitMax),
  };
}

/** Strict whole-string integer parse: malformed/out-of-range → the default. */
function parseTuning(raw: string | undefined, min: number, max: number, fallback: number): number {
  const trimmed = raw?.trim() ?? "";
  // "2.5" or "banana" are malformed, not 2 — never silently coerced.
  if (!/^\d+$/.test(trimmed)) {
    return fallback;
  }
  const value = Number.parseInt(trimmed, 10);
  return value >= min && value <= max ? value : fallback;
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

export interface CreateRedisFromEnvOptions {
  /** Injected clock (epoch ms). Defaults to the wall clock HERE only. */
  readonly clock?: RedisClock;
  /** Injected fetch (tests stub the wire; production uses global fetch). */
  readonly fetchImpl?: typeof globalThis.fetch;
  /** Outage probe interval in ms (default 30000). */
  readonly outageRetryAfterMs?: number;
}

export interface RedisFromEnv {
  /** The CONFIGURED mode (what the environment asked for). */
  readonly mode: RedisMode;
  /** The client: outage-tolerant in upstash mode; plain memory otherwise. */
  readonly client: RedisClientPort;
  /** Parsed tuning with documented defaults (see RedisTuning). */
  readonly tuning: RedisTuning;
  /** Why the configured mode could not be honored (half-configured group). */
  readonly misconfiguration: string | null;
}

/**
 * Build the redis family from an environment record. NEVER throws; the
 * mode matrix is documented on the module header.
 */
export function createRedisFromEnv(
  env: Record<string, string | undefined>,
  options: CreateRedisFromEnvOptions = {},
): RedisFromEnv {
  const clock = options.clock ?? (() => Date.now());
  const tuning = redisTuningFromEnv(env);
  const url = env.AISE_REDIS_REST_URL?.trim() ?? "";
  const token = env.AISE_REDIS_REST_TOKEN?.trim() ?? "";

  if (url !== "" && token !== "") {
    const upstash = new UpstashRedisClient({
      url,
      token,
      fetchImpl: options.fetchImpl,
    });
    return {
      mode: "upstash",
      client: withMemoryFallback(upstash, clock, options.outageRetryAfterMs),
      tuning,
      misconfiguration: null,
    };
  }

  const misconfiguration =
    url !== "" || token !== ""
      ? "redis group half-configured: AISE_REDIS_REST_URL and AISE_REDIS_REST_TOKEN must be set together — serving from the explicit memory mode"
      : null;
  return {
    mode: "memory",
    client: new MemoryRedisClient({ clock }),
    tuning,
    misconfiguration,
  };
}
