/**
 * Retry-safe idempotent job primitives — PROD-007.
 *
 * Bounded async jobs as TRANSIENT Redis state, with the two work-order
 * disciplines made structural:
 *
 *  - IDEMPOTENT ENQUEUE. A job's id is DERIVED — sha-256 over
 *    (queue, idempotencyKey) via `jobIdFromIdempotencyKey` — so every
 *    enqueue (first try or retry, from any worker) computes the SAME
 *    record address. A duplicate enqueue is a NO-OP that returns the
 *    existing record unchanged, whatever its status: a completed job is
 *    never re-run, a claimed job is never re-created, and there is no
 *    separate index key that could drift from the record.
 *  - BOUNDED RETRIES + EXPLICIT TTLs. Every write carries the required
 *    `ttlSeconds` (job records are transient state — they die with
 *    their horizon, never linger). Claims carry a LEASE (explicit
 *    `claimLeaseSeconds`): a crashed worker's lease expires and the job
 *    becomes claimable again, while `attempts`/`maxAttempts` bound the
 *    total retry count — exhausted jobs go terminally `failed`, never
 *    loop forever.
 *  - TYPED OUTCOMES ONLY. Every operation resolves to a discriminated
 *    outcome record (`kind` unions) — no raw throws, Redis failures are
 *    `failure` data.
 *  - INJECTED CLOCK. All time math (leases, timestamps) flows through
 *    the `RedisClock` seam — deterministic under test.
 *
 * The record is stored as JSON at the queue/id-addressed key from
 * keys.ts; both client twins are byte-faithful for the same sequence.
 */

import { jobKey, jobIdFromIdempotencyKey } from "./keys";
import { redisFailure, type RedisClock, type RedisClientPort, type RedisFailure } from "./model";

export const JOB_STATUSES = ["pending", "claimed", "completed", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobRecord {
  /** sha-256 of (queue, idempotencyKey) — the stable record address. */
  readonly id: string;
  readonly queue: string;
  readonly idempotencyKey: string;
  /** Caller-defined payload (string; callers own their codec). */
  readonly payload: string;
  readonly status: JobStatus;
  /** Claims made so far (each claim increments; bounded by maxAttempts). */
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  /** When set (claimed jobs): the claim lease's absolute expiry (ms). */
  readonly leaseExpiresAtMs: number | null;
  /** Terminal success payload (completed jobs only). */
  readonly result: string | null;
  /** Last failure detail (failed/failed-attempt jobs only). */
  readonly failureDetail: string | null;
}

export interface JobStoreOptions {
  readonly client: RedisClientPort;
  /** The queue's name — part of the record address. */
  readonly queue: string;
  /** Record TTL in seconds — REQUIRED explicit (transient state only). */
  readonly ttlSeconds: number;
  /** Claim lease in seconds — REQUIRED explicit (crashed-worker bound). */
  readonly claimLeaseSeconds: number;
  /** Injected clock (epoch ms). */
  readonly clock: RedisClock;
}

export interface EnqueueJobInput {
  /** Caller-supplied idempotency key: same key ⇒ same job, forever. */
  readonly idempotencyKey: string;
  readonly payload: string;
  /** Maximum claim attempts (>= 1) before the job fails terminally. */
  readonly maxAttempts: number;
}

export type JobEnqueueOutcome =
  /** Fresh job created in `pending`. */
  | { readonly kind: "created"; readonly job: JobRecord }
  /** Duplicate enqueue: the EXISTING record returned unchanged (no-op). */
  | { readonly kind: "duplicate"; readonly job: JobRecord }
  | { readonly kind: "failure"; readonly failure: RedisFailure };

export type JobClaimOutcome =
  /** This caller now holds the claim (attempts incremented, lease set). */
  | { readonly kind: "claimed"; readonly job: JobRecord }
  /** Another worker's lease is live — retry after it expires. */
  | { readonly kind: "lease-held"; readonly job: JobRecord }
  /** Terminal (completed/failed) jobs are never claimable. */
  | { readonly kind: "terminal"; readonly job: JobRecord }
  /** attempts >= maxAttempts: the job is marked terminally failed. */
  | { readonly kind: "exhausted"; readonly job: JobRecord }
  | { readonly kind: "missing"; readonly id: string }
  | { readonly kind: "failure"; readonly failure: RedisFailure };

export type JobCompleteOutcome =
  /** First completion: terminal `completed` with the result. */
  | { readonly kind: "completed"; readonly job: JobRecord }
  /** Duplicate completion: NO-OP returning the completed record (retry-safe). */
  | { readonly kind: "already-completed"; readonly job: JobRecord }
  /** The job is in a non-completable state (pending/unclaimed or failed). */
  | { readonly kind: "invalid-state"; readonly job: JobRecord }
  | { readonly kind: "missing"; readonly id: string }
  | { readonly kind: "failure"; readonly failure: RedisFailure };

export type JobFailOutcome =
  /** attempts reached maxAttempts: terminal `failed`. */
  | { readonly kind: "failed"; readonly job: JobRecord }
  /** Returned to `pending` (lease cleared) for the next claim attempt. */
  | { readonly kind: "retry-scheduled"; readonly job: JobRecord }
  /** A completed job can never be failed. */
  | { readonly kind: "terminal"; readonly job: JobRecord }
  | { readonly kind: "missing"; readonly id: string }
  | { readonly kind: "failure"; readonly failure: RedisFailure };

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

/**
 * The job primitives over one queue. Stateless besides its options —
 * all state lives in Redis (transient, TTL'd).
 */
export class JobStore {
  private readonly client: RedisClientPort;
  private readonly queue: string;
  private readonly ttlSeconds: number;
  private readonly claimLeaseSeconds: number;
  private readonly clock: RedisClock;

  constructor(options: JobStoreOptions) {
    this.client = options.client;
    this.queue = options.queue;
    this.ttlSeconds = options.ttlSeconds;
    this.claimLeaseSeconds = options.claimLeaseSeconds;
    this.clock = options.clock;
  }

  /**
   * Enqueue with idempotency: the record address is derived from the
   * idempotency key, so a duplicate (retried) enqueue returns the
   * existing record untouched — `created` exactly once, `duplicate`
   * forever after, whatever the status.
   */
  async enqueue(input: EnqueueJobInput): Promise<JobEnqueueOutcome> {
    const invalid = validateEnqueueInput(input);
    if (invalid !== null) {
      return { kind: "failure", failure: invalid };
    }
    const key = jobKey({ queue: this.queue, idempotencyKey: input.idempotencyKey });
    const existing = await this.readRecord(input.idempotencyKey);
    if (!existing.ok) {
      return { kind: "failure", failure: existing.failure };
    }
    if (existing.value !== null) {
      return { kind: "duplicate", job: existing.value };
    }
    const now = this.clock();
    const job: JobRecord = {
      id: deriveJobId(this.queue, input.idempotencyKey),
      queue: this.queue,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      maxAttempts: input.maxAttempts,
      createdAtMs: now,
      updatedAtMs: now,
      leaseExpiresAtMs: null,
      result: null,
      failureDetail: null,
    };
    const write = await this.client.set(key, serializeRecord(job), this.ttlSeconds);
    if (!write.ok) {
      return { kind: "failure", failure: write.failure };
    }
    return { kind: "created", job };
  }

  /** Read the record for an idempotency key (null when absent/expired). */
  async get(idempotencyKey: string): Promise<JobRecord | null | { failure: RedisFailure }> {
    const result = await this.readRecord(idempotencyKey);
    if (!result.ok) {
      return { failure: result.failure };
    }
    return result.value;
  }

  /**
   * Claim the job for one attempt: increments `attempts`, sets the claim
   * lease. Live leases, terminal statuses and exhausted attempts are all
   * typed outcomes — never a throw, never a silent double-run.
   */
  async claim(idempotencyKey: string): Promise<JobClaimOutcome> {
    const read = await this.readRecord(idempotencyKey);
    if (!read.ok) {
      return { kind: "failure", failure: read.failure };
    }
    const job = read.value;
    if (job === null) {
      return { kind: "missing", id: deriveJobId(this.queue, idempotencyKey) };
    }
    if (job.status === "completed" || job.status === "failed") {
      return { kind: "terminal", job };
    }
    if (job.status === "claimed" && job.leaseExpiresAtMs !== null && this.clock() < job.leaseExpiresAtMs) {
      return { kind: "lease-held", job };
    }
    if (job.attempts >= job.maxAttempts) {
      // The retry bound: mark terminally failed, never loop again.
      const exhausted = updateRecord(job, this.clock(), {
        status: "failed",
        leaseExpiresAtMs: null,
        failureDetail: "attempts exhausted",
      });
      const write = await this.writeRecord(exhausted);
      if (!write.ok) {
        return { kind: "failure", failure: write.failure };
      }
      return { kind: "exhausted", job: exhausted };
    }
    const claimed = updateRecord(job, this.clock(), {
      status: "claimed",
      attempts: job.attempts + 1,
      leaseExpiresAtMs: this.clock() + this.claimLeaseSeconds * 1000,
    });
    const write = await this.writeRecord(claimed);
    if (!write.ok) {
      return { kind: "failure", failure: write.failure };
    }
    return { kind: "claimed", job: claimed };
  }

  /**
   * Complete the job. Completing an already-completed job is a NO-OP
   * returning the terminal record — the retry-safety of the final write.
   */
  async complete(idempotencyKey: string, result: string): Promise<JobCompleteOutcome> {
    const read = await this.readRecord(idempotencyKey);
    if (!read.ok) {
      return { kind: "failure", failure: read.failure };
    }
    const job = read.value;
    if (job === null) {
      return { kind: "missing", id: deriveJobId(this.queue, idempotencyKey) };
    }
    if (job.status === "completed") {
      return { kind: "already-completed", job };
    }
    if (job.status !== "claimed") {
      return {
        kind: "invalid-state",
        job,
      };
    }
    const completed = updateRecord(job, this.clock(), {
      status: "completed",
      leaseExpiresAtMs: null,
      result,
    });
    const write = await this.writeRecord(completed);
    if (!write.ok) {
      return { kind: "failure", failure: write.failure };
    }
    return { kind: "completed", job: completed };
  }

  /**
   * Fail one attempt. Under the attempt bound the job returns to
   * `pending` (retry-scheduled, lease cleared, detail recorded); at the
   * bound it goes terminally `failed`.
   */
  async fail(idempotencyKey: string, detail: string): Promise<JobFailOutcome> {
    const read = await this.readRecord(idempotencyKey);
    if (!read.ok) {
      return { kind: "failure", failure: read.failure };
    }
    const job = read.value;
    if (job === null) {
      return { kind: "missing", id: deriveJobId(this.queue, idempotencyKey) };
    }
    if (job.status === "completed") {
      return { kind: "terminal", job };
    }
    if (job.status === "failed") {
      // Already terminally failed: idempotent no-op with the same shape.
      return { kind: "failed", job };
    }
    if (job.attempts >= job.maxAttempts) {
      const failed = updateRecord(job, this.clock(), {
        status: "failed",
        leaseExpiresAtMs: null,
        failureDetail: detail,
      });
      const write = await this.writeRecord(failed);
      if (!write.ok) {
        return { kind: "failure", failure: write.failure };
      }
      return { kind: "failed", job: failed };
    }
    const retried = updateRecord(job, this.clock(), {
      status: "pending",
      leaseExpiresAtMs: null,
      failureDetail: detail,
    });
    const write = await this.writeRecord(retried);
    if (!write.ok) {
      return { kind: "failure", failure: write.failure };
    }
    return { kind: "retry-scheduled", job: retried };
  }

  /* ---------------------------------------------------------------- */

  private async readRecord(
    idempotencyKey: string,
  ): Promise<{ ok: true; value: JobRecord | null } | { ok: false; failure: RedisFailure }> {
    const key = jobKey({ queue: this.queue, idempotencyKey });
    const result = await this.client.get(key);
    if (!result.ok) {
      return result;
    }
    if (result.value === null) {
      return { ok: true, value: null };
    }
    const parsed = parseRecord(result.value);
    if (parsed === null) {
      return {
        ok: false,
        failure: redisFailure("protocol_error", "job record is not valid stored JSON"),
      };
    }
    return { ok: true, value: parsed };
  }

  private async writeRecord(job: JobRecord): Promise<{ ok: true } | { ok: false; failure: RedisFailure }> {
    const key = jobKey({ queue: this.queue, idempotencyKey: job.idempotencyKey });
    const result = await this.client.set(key, serializeRecord(job), this.ttlSeconds);
    if (!result.ok) {
      return result;
    }
    return { ok: true };
  }
}

/* ------------------------------------------------------------------ */
/* Record codec + helpers                                              */
/* ------------------------------------------------------------------ */

/** The stable record address: sha-256 over (queue, idempotencyKey). */
function deriveJobId(queue: string, idempotencyKey: string): string {
  return jobIdFromIdempotencyKey({ queue, idempotencyKey });
}

/** Serialize with a FIXED key order (deterministic bytes for the twins). */
function serializeRecord(job: JobRecord): string {
  return JSON.stringify({
    id: job.id,
    queue: job.queue,
    idempotencyKey: job.idempotencyKey,
    payload: job.payload,
    status: job.status,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAtMs: job.createdAtMs,
    updatedAtMs: job.updatedAtMs,
    leaseExpiresAtMs: job.leaseExpiresAtMs,
    result: job.result,
    failureDetail: job.failureDetail,
  });
}

/** Parse + shape-validate a stored record (the cache is never authoritative). */
function parseRecord(raw: string): JobRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.queue !== "string" ||
    typeof record.idempotencyKey !== "string" ||
    typeof record.payload !== "string" ||
    typeof record.status !== "string" ||
    !(JOB_STATUSES as readonly string[]).includes(record.status) ||
    typeof record.attempts !== "number" ||
    typeof record.maxAttempts !== "number" ||
    typeof record.createdAtMs !== "number" ||
    typeof record.updatedAtMs !== "number" ||
    (record.leaseExpiresAtMs !== null && typeof record.leaseExpiresAtMs !== "number") ||
    (record.result !== null && typeof record.result !== "string") ||
    (record.failureDetail !== null && typeof record.failureDetail !== "string")
  ) {
    return null;
  }
  return record as unknown as JobRecord;
}

/** Copy a record with status transitions + a fresh updatedAt timestamp. */
function updateRecord(
  job: JobRecord,
  now: number,
  changes: Partial<Pick<JobRecord, "status" | "attempts" | "leaseExpiresAtMs" | "result" | "failureDetail">>,
): JobRecord {
  return { ...job, ...changes, updatedAtMs: now };
}

function validateEnqueueInput(input: EnqueueJobInput): RedisFailure | null {
  if (typeof input.idempotencyKey !== "string" || input.idempotencyKey === "") {
    return redisFailure("protocol_error", "idempotencyKey must be a non-empty string");
  }
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1) {
    return redisFailure("protocol_error", "maxAttempts must be an integer >= 1");
  }
  return null;
}
