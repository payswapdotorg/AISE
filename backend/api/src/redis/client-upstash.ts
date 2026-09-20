/**
 * Upstash REST adapter — PROD-007.
 *
 * The production implementation of `RedisClientPort` over the Upstash
 * REST API (the free-tier-friendly protocol): one HTTPS POST per call
 * over the GLOBAL `fetch` — ZERO new npm dependencies (the work order's
 * hard constraint; no upstash-redis client package).
 *
 *  - PROTOCOL: `POST <url>` with a flat JSON array body (one command)
 *    and the `Authorization: Bearer <token>` header. The response is the
 *    Upstash REST envelope — `{"result": <value>}` on success,
 *    `{"error": "<message>"}` on failure — unwrapped at the single
 *    choke point in `request()` so every command wrapper sees the bare
 *    value. Pipelined batches (nested arrays) are NOT used: the live
 *    free-tier endpoint (upstash_version 1.18.1, verified 2026-09-20)
 *    rejects the nested-array form with HTTP 400 ("unsupported arg
 *    type"), so `increment` issues its `INCR` + `EXPIRE NX` as two flat
 *    round trips.
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
    // Two flat commands, not a pipeline: the live free-tier endpoint
    // (upstash_version 1.18.1, verified 2026-09-20) rejects the
    // nested-array batch form with HTTP 400 ("unsupported arg type"),
    // so INCR and EXPIRE NX are issued as separate flat commands.
    // INCR creates/counts; EXPIRE NX sets the TTL only when the key has
    // none — a created counter is ALWAYS window-bounded, an existing
    // counter KEEPS its original TTL (the original pipeline semantics,
    // now in two round trips).
    const incr = await this.request(["INCR", key]);
    if (!incr.ok) {
      return incr;
    }
    const count = asNonNegativeInteger(incr.value);
    if (count === null) {
      return {
        ok: false,
        failure: redisFailure("protocol_error", "redis rest INCR returned a non-integer value"),
      };
    }
    const expire = await this.request(["EXPIRE", key, ttlSeconds, "NX"]);
    if (!expire.ok) {
      // The count was already spent server-side but the window bound
      // could not be set — surface the failure honestly; never silently
      // coerce a possibly-unbounded counter into a success.
      return expire;
    }
    return { ok: true, value: count };
  }

  /**
   * Issue one REST call. The wire shape is deterministic per command:
   * flat JSON body, bearer token header, no other state. Failures map to
   * typed data — this method NEVER throws (transport errors included).
   */
  private async request(command: RedisCommand): Promise<
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
      // The documented failure envelope {"error": "..."} (e.g. HTTP 400
      // for an unsupported command) contributes a bounded, single-line,
      // server-authored excerpt — the status signature stays primary.
      const excerpt = await errorEnvelopeExcerpt(response);
      return {
        ok: false,
        failure: redisFailure(
          "protocol_error",
          excerpt === null
            ? `redis rest unexpected HTTP ${response.status}`
            : `redis rest error response (HTTP ${response.status}, ${excerpt})`,
        ),
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
    // The Upstash REST envelope, verified live 2026-09-20 against the
    // deployed free-tier endpoint (upstash_version 1.18.1): success →
    // {"result": <value>} (including {"result": null} for absent keys);
    // failure → {"error": "<server message>"} with a non-200 status.
    // The envelope is unwrapped HERE — the single choke point — so every
    // command wrapper sees the bare value. A body that is NOT the
    // envelope is a protocol error: passing a bare value through whole
    // is the exact deployed-walk defect this guard exists for (every GET
    // answered "non-string value" and every SET "did not answer OK"
    // while the server-side effects still executed).
    if (isRecordShape(body) && "result" in body) {
      return { ok: true, value: body.result };
    }
    if (isRecordShape(body) && "error" in body) {
      return {
        ok: false,
        failure: redisFailure("protocol_error", `redis rest error response (${boundedExcerpt(body.error)})`),
      };
    }
    return {
      ok: false,
      failure: redisFailure("protocol_error", "redis rest response was not the {result|error} envelope"),
    };
  }
}

/** A plain object shape test (the envelope carriers). */
function isRecordShape(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A bounded, single-line excerpt of a server-authored error string. */
function boundedExcerpt(value: unknown): string {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "unknown error");
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= 160 ? flat : `${flat.slice(0, 160)}…`;
}

/** Read the {"error": "..."} envelope off a non-200 response, if present. */
async function errorEnvelopeExcerpt(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as unknown;
    if (isRecordShape(body) && "error" in body) {
      return boundedExcerpt(body.error);
    }
  } catch {
    // Not JSON (or already consumed) — the status-only message answers.
  }
  return null;
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
