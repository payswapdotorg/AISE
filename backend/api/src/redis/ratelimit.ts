/**
 * Bounded fixed-window rate limiter — PROD-007.
 *
 * A keyed counter over `RedisClientPort` with the window AS the TTL:
 *
 *  - BOUNDED BY CONSTRUCTION: the counter key is scoped to ONE window
 *    (scope + identifier + window index) and its TTL equals the window
 *    length, so state dies with its window — a limiter over a shared
 *    identifier can never accumulate unbounded Redis state, however
 *    long the service runs. The reported `remaining` is clamped to
 *    `max` (the counter may count past the limit; the DECISION and the
 *    reported budget never do).
 *  - EXPLICIT PARAMETERS: window length and max are required options;
 *    the counter TTL is derived from the window (there is no other
 *    correct lifetime for a window counter — still explicit at the
 *    port call, never a hidden default).
 *  - INJECTED CLOCK: window boundaries come from the `RedisClock` seam,
 *    never from `Date.now()` internals — deterministic under test.
 *  - HONEST DEGRADATION: on a Redis typed-failure the limiter FAILS
 *    OPEN with `degraded: true`. The limiter protects shared transient
 *    resources; it is explicitly NOT a security boundary, and a Redis
 *    outage must not take the API's availability with it. Degradation
 *    is loud: the flag feeds the health snapshot (health.ts).
 */

import { rateLimitKey } from "./keys";
import { type RedisClock, type RedisClientPort, type RedisFailure } from "./model";

export interface RateLimiterOptions {
  /** The Redis port (counter-namespace access only). */
  readonly client: RedisClientPort;
  /** Fixed window length in seconds (> 0). One counter key per window. */
  readonly windowSeconds: number;
  /** Maximum allowed requests per window per identifier (> 0). */
  readonly max: number;
  /** Injected clock (epoch ms) — window math is deterministic. */
  readonly clock: RedisClock;
}

export interface RateLimitRequest {
  /** The limiter's scope (e.g. "api", "reconstruction"). */
  readonly scope: string;
  /** The limited identity within the scope (tenant, ip, principal...). */
  readonly identifier: string;
}

export interface RateLimitDecision {
  /** Whether this request is allowed under the window budget. */
  readonly allowed: boolean;
  /** The configured per-window limit (echoed for callers). */
  readonly limit: number;
  /** Remaining budget in THIS window (0 once denied; clamped to max). */
  readonly remaining: number;
  /** The window length in seconds. */
  readonly windowSeconds: number;
  /** When denied: seconds until the next window opens (0 when allowed). */
  readonly retryAfterSeconds: number;
  /** True when a Redis typed-failure forced fail-open (health-visible). */
  readonly degraded: boolean;
  /** The typed failure when `degraded` is true (null otherwise). */
  readonly failure: RedisFailure | null;
}

/**
 * Consume one request's worth of budget for (scope, identifier) in the
 * current window. NEVER throws; never blocks longer than the round trip.
 */
export async function consumeRateLimit(
  options: RateLimiterOptions,
  request: RateLimitRequest,
): Promise<RateLimitDecision> {
  const { client, windowSeconds, max, clock } = options;

  const nowMs = clock();
  const windowIndex = Math.floor(nowMs / 1000 / windowSeconds);
  const windowEndSeconds = (windowIndex + 1) * windowSeconds;
  const nowSeconds = Math.floor(nowMs / 1000);

  const key = rateLimitKey(request.scope, request.identifier, windowIndex);
  const counted = await client.increment(key, windowSeconds);

  if (!counted.ok) {
    // Fail-open degradation (see module header): allow, flag loudly.
    return {
      allowed: true,
      limit: max,
      remaining: max,
      windowSeconds,
      retryAfterSeconds: 0,
      degraded: true,
      failure: counted.failure,
    };
  }

  const allowed = counted.value <= max;
  return {
    allowed,
    limit: max,
    remaining: allowed ? max - counted.value : 0,
    windowSeconds,
    retryAfterSeconds: allowed ? 0 : Math.max(1, windowEndSeconds - nowSeconds),
    degraded: false,
    failure: null,
  };
}
