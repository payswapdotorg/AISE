/**
 * PROD-011b — the Redis-backed session store twin.
 *
 * CONTRACT (docs/productization-work-orders.md §PROD-011b): the real Vercel
 * deployment proved requests route across warm serverless instances WITHOUT
 * session affinity, so the per-instance `FsSessionStore` loses a session
 * mid-journey (observed: `session_invalid` on a new connection while the
 * minting connection still answered 200). This module is the SAME
 * `SessionStore` contract over the PROD-007 Redis port — a STORE TWIN, not a
 * redesign: same cookie, same TTL contract, same sweep behavior, zero
 * auth-semantics changes. The composition (runtime/entry.ts) selects it ONLY
 * when the Upstash env group is complete; otherwise the Fs twin serves,
 * byte-identically to today.
 *
 * TRANSIENT STATE ONLY (the frozen architecture): Redis is NEVER canonical
 * state — and sessions are exactly transient state. Every key this store
 * writes carries an explicit TTL derived from the record's own `expiresAt`
 * (`max(1, ceil((Date.parse(expiresAt) − clock()) / 1000))` — no invented
 * defaults anywhere; an already-expired record still writes with the 1-second
 * floor so Redis remains the hard bound). Redis TTL eviction therefore
 * guarantees boundedness even if every sweep is skipped.
 *
 * WHY THE INDEX EXISTS: `list()` is REQUIRED by the deterministic expiry
 * sweep, and the Redis port has NO enumeration (string get/set/delete only —
 * no SCAN, no keyspace iteration). So the store maintains one index key
 * (`aise:auth:session-index`, a JSON string array of session ids): `put()`
 * adds the id (dedup) and rewrites the index with the SAME ttlSeconds as the
 * session; `delete()` removes the id (best-effort); `list()` reads the index,
 * `get`s each id, DROPs the nulls (lazy prune — TTL-evicted sessions
 * disappear) and rewrites the pruned index. The index is DERIVED,
 * self-healing state: its own expiry only bounds enumeration staleness —
 * sessions are TTL-evicted by Redis regardless, and `get()`/auth never touch
 * the index.
 *
 * FAIL-CLOSED DEGRADATION (the PROD-007 outage discipline IN SPIRIT — typed
 * failures are LOGGED data, never exceptions escaping the store): every
 * `ok: false` outcome logs one structured warn
 * (`redis_session_store_<op>_failed`, kind + detail — the port's details name
 * signatures and variable NAMES, never credential VALUES) and the operation
 * degrades honestly:
 *   - `get`    → null: the request fails closed as unauthenticated (401) —
 *                the LOG is what distinguishes a Redis blip from a genuinely
 *                lost session;
 *   - `put`    → resolves without storing (the mint succeeds, the session
 *                simply is not durable — the next request 401s, loudly in
 *                the logs);
 *   - `delete` → resolves (idempotent contract holds);
 *   - `list`   → [] (the sweep then no-ops; Redis TTLs still bound every
 *                session).
 * A present-but-unparseable VALUE (Redis answered, the bytes are not a
 * session record) reads as ABSENT with its own typed warn — mirroring the Fs
 * twin's corrupt-file honesty; one bad key never takes the surface down.
 *
 * COMPOSITION NOTE (why this store takes the RAW client, no outage wrapper):
 * the PROD-007 `OutageTolerantRedis` seam degrades to a per-instance memory
 * twin — the right discipline for availability-first surfaces (cache,
 * rate-limit, jobs). For a SESSION store that would re-create the PROD-011b
 * defect in degraded scope: sessions minted during an outage would live in
 * one instance's memory and vanish on recovery, with no log line to explain
 * it. This fail-closed surface keeps the raw typed failures so every blip is
 * visible in the logs.
 *
 * Determinism: no wall clock and no randomness inside the store — the epoch-ms
 * clock is injected (`RedisClock`), so tests drive TTL math with a fixed
 * clock, exactly like the memory twin drives its expiry.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { Logger } from "../lib/log";
import type { RedisClientPort, RedisClock, RedisFailure } from "../redis/model";
import type { SessionRecord } from "./model";
import { parseSessionRecord, type SessionStore } from "./store";

/* ------------------------------------------------------------------ */
/* Key layout (the PROD-011b wire contract)                             */
/* ------------------------------------------------------------------ */

/**
 * Session records live at `aise:auth:session:<sessionId>` (canonical JSON —
 * byte-identical to the Fs twin's file content, so `parseSessionRecord`
 * round-trips verbatim). The trailing `:` in the prefix makes a collision
 * with the index key structurally impossible (minted ids are `sess-<hex>`).
 */
const SESSION_KEY_PREFIX = "aise:auth:session:";

/**
 * The enumeration index: a canonical-JSON string array of session ids. The
 * ONLY purpose is `list()` (the sweep's input); see the module header for the
 * maintenance and staleness discipline.
 */
const INDEX_KEY = "aise:auth:session-index";

function sessionKey(sessionId: string): string {
  return SESSION_KEY_PREFIX + sessionId;
}

/** The explicit TTL for one record's remaining lifetime (floor: 1 second). */
function ttlSecondsFor(expiresAt: string, clock: RedisClock): number {
  const remainingMs = Date.parse(expiresAt) - clock();
  return Math.max(1, Math.ceil(remainingMs / 1000));
}

/**
 * Parse an index value into its id set. Null for anything not shaped like a
 * JSON string array (a corrupt index is DERIVED state — callers heal it from
 * live writes and log it; it is never treated as a session-record problem).
 */
function parseIndexIds(value: string): Set<string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.some((id) => typeof id !== "string")) {
    return null;
  }
  return new Set(parsed as string[]);
}

/** Serialize an id set into the index's canonical bytes (sorted). */
function serializeIndexIds(ids: ReadonlySet<string>): string {
  return canonicalJsonStringify([...ids].sort());
}

/* ------------------------------------------------------------------ */
/* The Redis-backed store                                               */
/* ------------------------------------------------------------------ */

export class RedisSessionStore implements SessionStore {
  private readonly client: RedisClientPort;
  private readonly logger: Logger;
  private readonly clock: RedisClock;

  constructor(client: RedisClientPort, logger: Logger, clock: RedisClock) {
    this.client = client;
    this.logger = logger;
    this.clock = clock;
  }

  async put(session: SessionRecord): Promise<void> {
    const ttlSeconds = ttlSecondsFor(session.expiresAt, this.clock);
    const stored = await this.client.set(
      sessionKey(session.sessionId),
      canonicalJsonStringify(session),
      ttlSeconds,
    );
    if (!stored.ok) {
      this.warnFailed("put", stored.failure);
      return;
    }
    // Index maintenance: add (dedup) + rewrite with the SAME ttlSeconds as
    // the session. A failing index READ aborts the update (rewriting without
    // knowing the current ids would silently DROP live ids from enumeration
    // — non-destructive beats possibly-clobbering); the session record
    // itself is already stored, so get()/auth work regardless.
    const index = await this.readIndexFor("put_index");
    if (index === null) {
      return;
    }
    index.add(session.sessionId);
    const written = await this.client.set(INDEX_KEY, serializeIndexIds(index), ttlSeconds);
    if (!written.ok) {
      this.warnFailed("put_index", written.failure);
    }
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const result = await this.client.get(sessionKey(sessionId));
    if (!result.ok) {
      // Fail closed: the caller answers 401 — the warn is what separates a
      // Redis blip from a genuinely absent session in the logs.
      this.warnFailed("get", result.failure);
      return null;
    }
    if (result.value === null) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.value) as unknown;
    } catch {
      this.logger.warn("redis_session_store_corrupt_record_ignored", {
        sessionId: sessionId.slice(0, 8),
      });
      return null;
    }
    const record = parseSessionRecord(parsed);
    if (record === null) {
      this.logger.warn("redis_session_store_invalid_record_ignored", {
        sessionId: sessionId.slice(0, 8),
      });
      return null;
    }
    return record;
  }

  async delete(sessionId: string): Promise<void> {
    // Read the record FIRST: its expiry is the only DATA-DERIVED TTL for the
    // index rewrite (the TTL discipline forbids invented defaults).
    let expiresAt: string | null = null;
    const existing = await this.client.get(sessionKey(sessionId));
    if (!existing.ok) {
      // The pre-read failed: STILL attempt the direct-key delete (the primary
      // job) but skip index surgery — no data-derived TTL exists.
      this.warnFailed("delete", existing.failure);
    } else if (existing.value !== null) {
      expiresAt = expiresAtOf(existing.value);
    }
    const removed = await this.client.delete(sessionKey(sessionId));
    if (!removed.ok) {
      this.warnFailed("delete", removed.failure);
    }
    if (expiresAt === null) {
      // Absent or unreadable record: idempotent success; a stale index id (if
      // any) is owned by list()'s lazy prune.
      return;
    }
    const ttlSeconds = ttlSecondsFor(expiresAt, this.clock);
    const index = await this.readIndexFor("delete_index");
    if (index === null) {
      return;
    }
    if (!index.has(sessionId)) {
      return;
    }
    index.delete(sessionId);
    const written = await this.client.set(INDEX_KEY, serializeIndexIds(index), ttlSeconds);
    if (!written.ok) {
      this.warnFailed("delete_index", written.failure);
    }
  }

  async list(): Promise<SessionRecord[]> {
    const index = await this.readIndexFor("list");
    if (index === null) {
      // A failed/corrupt index read: no enumeration is possible (the port has
      // none) — [] is the honest answer and the sweep no-ops; Redis TTLs
      // still bound every session.
      return [];
    }
    const records: SessionRecord[] = [];
    const survivingIds: string[] = [];
    let pruned = false;
    let maxRemainingMs: number | null = null;
    for (const sessionId of [...index].sort()) {
      const result = await this.client.get(sessionKey(sessionId));
      if (!result.ok) {
        // A FAILED read is not an absent read: keep the id (do not prune
        // what could not be read — a transient blip must not drop a live
        // session from enumeration) and skip the record.
        this.warnFailed("list_get", result.failure);
        survivingIds.push(sessionId);
        continue;
      }
      if (result.value === null) {
        // Absent/expired: the lazy prune (expired sessions disappear).
        pruned = true;
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(result.value) as unknown;
      } catch {
        // Corrupt value: skipped by list (get() logs it when addressed) —
        // the id is kept, mirroring the Fs twin's corrupt-file behavior.
        survivingIds.push(sessionId);
        continue;
      }
      const record = parseSessionRecord(parsed);
      if (record === null) {
        survivingIds.push(sessionId);
        continue;
      }
      records.push(record);
      survivingIds.push(sessionId);
      const remainingMs = Date.parse(record.expiresAt) - this.clock();
      if (maxRemainingMs === null || remainingMs > maxRemainingMs) {
        maxRemainingMs = remainingMs;
      }
    }
    if (pruned) {
      // Rewrite the pruned index so staleness does not accumulate. The TTL
      // is data-derived: the longest remaining lifetime among the records
      // list() can enumerate (the index then outlives every session it
      // names; ids with unreadable values may outlive it — accepted
      // staleness, Redis still bounds the sessions themselves). An empty
      // survivor set deletes the index (absent ≡ empty for enumeration).
      if (survivingIds.length === 0) {
        const removed = await this.client.delete(INDEX_KEY);
        if (!removed.ok) {
          this.warnFailed("list_index", removed.failure);
        }
      } else {
        const ttlSeconds = Math.max(1, Math.ceil((maxRemainingMs ?? 0) / 1000));
        const written = await this.client.set(
          INDEX_KEY,
          serializeIndexIds(new Set(survivingIds)),
          ttlSeconds,
        );
        if (!written.ok) {
          this.warnFailed("list_index", written.failure);
        }
      }
    }
    return records.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  }

  /* ---------------------------------------------------------------- */
  /* Internals                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Read the index for one owning operation. Null when the read failed (the
   * typed warn is logged under the OP's index name) or when the value is
   * corrupt (logged as its own typed warn — derived state, never a session
   * problem). A corrupt value is reported to the caller as ABSENT-so-far:
   * `put()` heals it by rewriting from its own live id, `list()` returns []
   * until then.
   */
  private async readIndexFor(op: "put_index" | "delete_index" | "list"): Promise<Set<string> | null> {
    const result = await this.client.get(INDEX_KEY);
    if (!result.ok) {
      this.warnFailed(op, result.failure);
      return null;
    }
    if (result.value === null) {
      return new Set<string>();
    }
    const ids = parseIndexIds(result.value);
    if (ids === null) {
      this.logger.warn("redis_session_store_index_corrupt_ignored", {
        op,
        detail:
          "the session index held a value that is not a JSON string array — " +
          "it will be rewritten from live writes",
      });
      return new Set<string>();
    }
    return ids;
  }

  /** One structured, typed warn per failed Redis operation (never values). */
  private warnFailed(op: string, failure: RedisFailure): void {
    this.logger.warn(`redis_session_store_${op}_failed`, {
      kind: failure.kind,
      detail: failure.detail,
    });
  }
}

/**
 * The `expiresAt` of a stored session value (used ONLY by `delete()` for its
 * data-derived index TTL). Null for anything unparseable or not carrying a
 * finite ISO `expiresAt` — the caller then skips index surgery rather than
 * inventing a TTL (the record itself is still deleted).
 */
function expiresAtOf(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>)["expiresAt"] === "string"
    ) {
      const candidate = (parsed as Record<string, unknown>)["expiresAt"] as string;
      return Number.isFinite(Date.parse(candidate)) ? candidate : null;
    }
  } catch {
    // Corrupt value: no data-derived TTL.
  }
  return null;
}
