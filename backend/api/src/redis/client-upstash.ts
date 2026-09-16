/**
 * Upstash REST adapter — PROD-007.
 *
 * The production implementation of `RedisClientPort` over the Upstash
 * REST API (the free-tier-friendly protocol): one HTTPS POST per call
 * over the GLOBAL `fetch` — ZERO new npm dependencies (the work order's
 * hard constraint; no upstash-redis client package).
 *
 *  - PROTOCOL: `POST <url>` with a JSON array body (a single command, or
 *    an array of arrays for a pipelined batch) and the
 *    `Authorization: Bearer <token>` header. `increment` uses a
 *    two-command pipeline (`INCR` + `EXPIRE NX`) so a created counter
 *    ALWAYS carries its window TTL atomically within one round trip.
 *  - TYPED FAILURES, NEVER RAW THROWS: transport errors, HTTP statuses
 *    and malformed responses all map to `RedisFailure` data
 *    (`unavailable` / `auth_failed` / `quota_exceeded` /
 *    `protocol_error`). Details name the signature (HTTP status, error
 *    name), NEVER the URL or token values.
 *  - DETERMINISM: identical inputs (and same injected `fetchImpl`) issue
 *    byte-identical requests — the twin contract with client-memory.ts.
 *    The fetch implementation is INJECTED (defaulting to the global
 *    fetch) precisely so tests can prove the wire shapes with a stub,
 *    with no network and no credentials.
 */

import {
  redisFailure,
  validateTtlSeconds,
  type RedisClientPort,
  type RedisDeleteResult,
  type RedisExpireResult,
  type RedisGetResult,
  type RedisIncrementResult,
  type RedisSetResult,
} from "./model";

/** Injectable fetch seam — defaults to the platform's global fetch. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface UpstashRedisClientOptions {
  /** The Upstash REST URL (e.g. https://example.upstash.io). Never logged. */
  readonly url: string;
  /** The Upstash REST token. Never logged, never sent anywhere else. */
  readonly token: string;
  /** Optional fetch override (tests inject a stub; production uses global fetch). */
  readonly fetchImpl?: FetchLike;
  /** Optional request timeout in milliseconds (default 5000). */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

/** A single REST command or a pipelined batch of commands. */
export type RedisCommand = readonly (string | number)[];

export class UpstashRedisClient implements RedisClientPort {
  readonly mode = "upstash" as const;

  private readonly url: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: UpstashRedisClientOptions) {
    this.url = options.url.trim();
    this.token = options.token.trim();
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async get(key: string): Promise<RedisGetResult> {
    const invalid = validateKey(key);
    if (invalid !== null) {
      return { ok: false, failure: invalid };
    }
    const result = await this.request(["GET", key]);
    if (!result.ok) {
      return result;
    }
    const value = result.value;
    if (value === null) {
      return { ok: true, value: null };
    }
    if (typeof value === "string") {
      return { ok: true, value };
    }
    return {
      ok: false,
      failure: redisFailure("protocol_error", "redis rest GET returned a non-string value"),
    };
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<RedisSetResult> {
    const invalid = validateWriteArgs(key, ttlSeconds);
    if (invalid !== null) {
      return { ok: false, failure: invalid };
    }
    const result = await this.request(["SET", key, value, "EX", ttlSeconds]);
    if (!result.ok) {
      return result;
    }
    if (result.value === "OK") {
      return { ok: true, value: true };
    }
    return {
      ok: false,
      failure: redisFailure("protocol_error", "redis rest SET did not answer OK"),
    };
  }

  async delete(key: string): Promise<RedisDeleteResult> {
    const invalid = validateKey(key);
    if (invalid !== null) {
      return { ok: false, failure: invalid };
    }
    const result = await this.request(["DEL", key]);
    if (!result.ok) {
      return result;
    }
    const removed = asNonNegativeInteger(result.value);
    if (removed === null) {
      return {
        ok: false,
        failure: redisFailure("protocol_error", "redis rest DEL returned a non-integer value"),
      };
    }
    return { ok: true, value: removed >= 1 };
  }

  async expire(key: string, ttlSeconds: number): Promise<RedisExpireResult> {
    const invalid = validateWriteArgs(key, ttlSeconds);
    if (invalid !== null) {
      return { ok: false, failure: invalid };
    }
    const result = await this.request(["EXPIRE", key, ttlSeconds]);
    if (!result.ok) {
      return result;
    }
    const refreshed = asNonNegativeInteger(result.value);
    if (refreshed === null) {
      return {
        ok: false,
        failure: redisFailure("protocol_error", "redis rest EXPIRE returned a non-integer value"),
      };
    }
    return { ok: true, value: refreshed === 1 };
  }

  async increment(key: string, ttlSeconds: number): Promise<RedisIncrementResult> {
    const invalid = validateWriteArgs(key, ttlSeconds);
    if (invalid !== null) {
      return { ok: false, failure: invalid };
    }
    // One pipelined round trip: INCR creates/counts; EXPIRE NX sets the
    // TTL only when the key has none — a created counter is ALWAYS
    // window-bounded, an existing counter KEEPS its original TTL.
    const result = await this.request([
      ["INCR", key],
      ["EXPIRE", key, ttlSeconds, "NX"],
    ]);
    if (!result.ok) {
      return result;
    }
    if (!Array.isArray(result.value) || result.value.length !== 2) {
      return {
        ok: false,
        failure: redisFailure("protocol_error", "redis rest INCR/EXPIRE pipeline returned an unexpected shape"),
      };
    }
    const count = asNonNegativeInteger(result.value[0]);
    if (count === null) {
      return {
        ok: false,
        failure: redisFailure("protocol_error", "redis rest INCR returned a non-integer value"),
      };
    }
    return { ok: true, value: count };
  }

  /**
   * Issue one REST call. The wire shape is deterministic per command:
   * JSON body, bearer token header, no other state. Failures map to
   * typed data — this method NEVER throws (transport errors included).
   */
  private async request(command: RedisCommand | readonly RedisCommand[]): Promise<
    { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly failure: ReturnType<typeof redisFailure> }
  > {
    if (this.url === "" || this.token === "") {
      return {
        ok: false,
        failure: redisFailure(
          "auth_failed",
          "redis rest url/token missing — both AISE_REDIS_REST_URL and AISE_REDIS_REST_TOKEN must be set",
        ),
      };
    }
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (reason) {
      // Transport failure (DNS/refused/timeout). The error NAME is a
      // signature; its message may embed the URL, so only the name is kept.
      const name = reason instanceof Error ? reason.name : "UnknownError";
      return {
        ok: false,
        failure: redisFailure("unavailable", `redis rest request failed (${name})`),
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        failure: redisFailure("auth_failed", `redis rest refused credentials (HTTP ${response.status})`),
      };
    }
    if (response.status === 429) {
      return {
        ok: false,
        failure: redisFailure("quota_exceeded", "redis rest rate/quota limit reached (HTTP 429)"),
      };
    }
    if (response.status >= 500) {
      return {
        ok: false,
        failure: redisFailure("unavailable", `redis rest answered HTTP ${response.status}`),
      };
    }
    if (response.status !== 200) {
      return {
        ok: false,
        failure: redisFailure("protocol_error", `redis rest unexpected HTTP ${response.status}`),
      };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return {
        ok: false,
        failure: redisFailure("protocol_error", "redis rest response was not valid JSON"),
      };
    }
    return { ok: true, value: body };
  }
}

/** Runtime key validation (the builders guarantee it; the port enforces it). */
function validateKey(key: string): ReturnType<typeof redisFailure> | null {
  if (typeof key !== "string" || key === "") {
    return redisFailure("protocol_error", "key must be a non-empty string");
  }
  return null;
}

/** Shared write-path validation: key shape + the explicit TTL contract. */
function validateWriteArgs(key: string, ttlSeconds: number): ReturnType<typeof redisFailure> | null {
  const keyInvalid = validateKey(key);
  if (keyInvalid !== null) {
    return keyInvalid;
  }
  const ttlInvalid = validateTtlSeconds(ttlSeconds);
  if (ttlInvalid !== null) {
    return redisFailure("protocol_error", ttlInvalid);
  }
  return null;
}

/** Parse a REST result as a non-negative integer (counters/flags). */
function asNonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}
