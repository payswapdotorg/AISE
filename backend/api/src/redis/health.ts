/**
 * Redis readiness contribution — PROD-007.
 *
 * PURE DATA, NO I/O: the health shape the redis family contributes to
 * the API's readiness surface. The runtime wiring (PROD-010's scope)
 * composes it into /v1/health; here we only define the deterministic
 * projection from an outage-tolerant client's observable state:
 *
 *  - `ready`   : the configured mode answers (memory mode is ALWAYS
 *                ready — it is the honest no-credentials default, not a
 *                degraded accident; upstash mode answering is ready).
 *  - `degraded`: the outage wrapper is currently serving from the
 *                in-memory fallback (loud: operators must see it).
 *  - details carry the last outage/recovery timestamps and the outage
 *    count — deterministic data, never credentials, never wall-clock
 *    reads (all timestamps come from the injected clock upstream).
 */

import type { RedisMode } from "./model";

export type RedisHealthStatus = "ready" | "degraded";

export interface RedisHealthInput {
  /** The mode answering RIGHT NOW (e.g. wrapper.currentMode()). */
  readonly mode: RedisMode;
  /** The mode the runtime CONFIGURED (env-derived; never changes). */
  readonly configuredMode: RedisMode;
  /** When the last outage began (epoch ms), or null when never. */
  readonly lastOutageAtMs: number | null;
  /** When the last recovery happened (epoch ms), or null when never. */
  readonly lastRecoveryAtMs: number | null;
  /** Total recorded outage events (0 when none). */
  readonly outageCount: number;
}

export interface RedisHealth {
  readonly status: RedisHealthStatus;
  readonly mode: RedisMode;
  readonly configuredMode: RedisMode;
  readonly lastOutageAtMs: number | null;
  readonly lastRecoveryAtMs: number | null;
  readonly outageCount: number;
  /** Human-readable, deterministic summary (safe to surface). */
  readonly detail: string;
}

/**
 * Project the readiness contribution. Pure: same input ⇒ same output,
 * no I/O, no clock, no randomness.
 */
export function redisHealth(input: RedisHealthInput): RedisHealth {
  const degraded = input.mode !== input.configuredMode || (input.configuredMode === "upstash" && input.mode === "memory");
  const status: RedisHealthStatus = degraded ? "degraded" : "ready";
  const detail = degraded
    ? `redis degraded: configured ${input.configuredMode}, serving ${input.mode}` +
      (input.lastOutageAtMs === null ? "" : ` (last outage at ${input.lastOutageAtMs} ms, ${input.outageCount} recorded)`)
    : input.configuredMode === "upstash"
      ? "redis ready: upstash answering"
      : "redis ready: explicit memory mode (no AISE_REDIS_REST_URL/AISE_REDIS_REST_TOKEN configured)";
  return {
    status,
    mode: input.mode,
    configuredMode: input.configuredMode,
    lastOutageAtMs: input.lastOutageAtMs,
    lastRecoveryAtMs: input.lastRecoveryAtMs,
    outageCount: input.outageCount,
    detail,
  };
}
