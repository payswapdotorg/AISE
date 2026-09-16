/**
 * Job primitives tests — PROD-007.
 *
 * Proves the acceptance "queue/job operations are retry-safe":
 *  - duplicate enqueue (same idempotency key) is a NO-OP returning the
 *    existing record — including after terminal completion/failure;
 *  - claims are lease-guarded, attempt-counted and bounded by
 *    maxAttempts (exhausted ⇒ terminally failed, never an infinite
 *    retry loop);
 *  - a crashed worker's expired lease makes the job claimable again;
 *  - duplicate completion is an idempotent no-op;
 *  - job records are TRANSIENT: they honor the explicit record TTL.
 * Determinism: injected clock, memory twin, no I/O.
 */

import { describe, expect, test } from "bun:test";
import { MemoryRedisClient } from "./client-memory";
import { JobStore } from "./jobs";
import { jobKey, jobIdFromIdempotencyKey } from "./keys";

/** Mutable injected clock. */
function makeClock(startMs = 1_000_000) {
  let now = startMs;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

function makeStore(clock: () => number, overrides?: { ttlSeconds?: number; claimLeaseSeconds?: number }) {
  const client = new MemoryRedisClient({ clock });
  const store = new JobStore({
    client,
    queue: "reconstruction",
    ttlSeconds: overrides?.ttlSeconds ?? 3600,
    claimLeaseSeconds: overrides?.claimLeaseSeconds ?? 30,
    clock,
  });
  return { client, store };
}

describe("enqueue idempotency (retry-safe by construction)", () => {
  test("first enqueue creates a pending job; duplicate enqueue is a NO-OP returning the existing record", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    const created = await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 3 });
    expect(created.kind).toBe("created");
    if (created.kind !== "created") {
      throw new Error("unreachable");
    }
    expect(created.job.status).toBe("pending");
    expect(created.job.attempts).toBe(0);
    expect(created.job.payload).toBe("work");
    expect(created.job.id).toBe(jobIdFromIdempotencyKey({ queue: "reconstruction", idempotencyKey: "req-1" }));

    clock.advance(5_000);
    const duplicate = await store.enqueue({ idempotencyKey: "req-1", payload: "DIFFERENT-payload-retry", maxAttempts: 3 });
    expect(duplicate.kind).toBe("duplicate");
    if (duplicate.kind !== "duplicate") {
      throw new Error("unreachable");
    }
    // The EXISTING record is returned untouched — no re-create, no payload
    // overwrite, no attempt reset.
    expect(duplicate.job).toEqual(created.job);
  });

  test("malformed enqueue inputs are typed protocol failures", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    const emptyKey = await store.enqueue({ idempotencyKey: "", payload: "p", maxAttempts: 1 });
    expect(emptyKey.kind).toBe("failure");
    const badAttempts = await store.enqueue({ idempotencyKey: "k", payload: "p", maxAttempts: 0 });
    expect(badAttempts.kind).toBe("failure");
  });

  test("different idempotency keys are different jobs in the same queue", async () => {
    const clock = makeClock();
    const { client, store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "a", maxAttempts: 1 });
    await store.enqueue({ idempotencyKey: "req-2", payload: "b", maxAttempts: 1 });
    const live = client.liveEntries(clock.now());
    expect(live).toHaveLength(2);
    expect(new Set(live.map((entry) => entry.key)).size).toBe(2);
  });
});

describe("claim (attempt counting + lease guarding)", () => {
  test("claim increments attempts and sets the lease", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 3 });
    const claimed = await store.claim("req-1");
    expect(claimed.kind).toBe("claimed");
    if (claimed.kind !== "claimed") {
      throw new Error("unreachable");
    }
    expect(claimed.job.attempts).toBe(1);
    expect(claimed.job.status).toBe("claimed");
    expect(claimed.job.leaseExpiresAtMs).toBe(1_000_000 + 30_000);
  });

  test("a live lease blocks a second claimant (no double-run)", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 3 });
    await store.claim("req-1");
    const blocked = await store.claim("req-1");
    expect(blocked.kind).toBe("lease-held");
    if (blocked.kind === "lease-held") {
      expect(blocked.job.attempts).toBe(1);
    }
  });

  test("an EXPIRED lease (crashed worker) makes the job claimable again, attempts preserved", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 3 });
    await store.claim("req-1");
    clock.advance(30_000); // the lease elapses
    const reclaimed = await store.claim("req-1");
    expect(reclaimed.kind).toBe("claimed");
    if (reclaimed.kind === "claimed") {
      expect(reclaimed.job.attempts).toBe(2);
    }
  });

  test("claiming an unknown job reports missing with the derived id", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    const missing = await store.claim("never-enqueued");
    expect(missing.kind).toBe("missing");
    if (missing.kind === "missing") {
      expect(missing.id).toBe(jobIdFromIdempotencyKey({ queue: "reconstruction", idempotencyKey: "never-enqueued" }));
    }
  });
});

describe("complete (terminal + idempotent)", () => {
  test("completing a claimed job records the result terminally", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 2 });
    await store.claim("req-1");
    const done = await store.complete("req-1", "the-result");
    expect(done.kind).toBe("completed");
    if (done.kind === "completed") {
      expect(done.job.status).toBe("completed");
      expect(done.job.result).toBe("the-result");
      expect(done.job.leaseExpiresAtMs).toBeNull();
    }
  });

  test("duplicate completion is a NO-OP returning the completed record (retry safety of the final write)", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 2 });
    await store.claim("req-1");
    await store.complete("req-1", "the-result");
    const again = await store.complete("req-1", "a-different-result-from-a-retry");
    expect(again.kind).toBe("already-completed");
    if (again.kind === "already-completed") {
      expect(again.job.result).toBe("the-result");
    }
  });

  test("re-enqueueing a COMPLETED job returns the terminal record — never re-runs", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 2 });
    await store.claim("req-1");
    const done = await store.complete("req-1", "result");
    const requeued = await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 2 });
    expect(requeued.kind).toBe("duplicate");
    if (requeued.kind === "duplicate" && done.kind === "completed") {
      expect(requeued.job.status).toBe("completed");
      expect(requeued.job).toEqual(done.job);
    }
    const claimAfterDone = await store.claim("req-1");
    expect(claimAfterDone.kind).toBe("terminal");
  });

  test("completing an unclaimed (pending) job is an invalid-state outcome", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 2 });
    const result = await store.complete("req-1", "result");
    expect(result.kind).toBe("invalid-state");
  });
});

describe("fail + retry bounds", () => {
  test("fail under the bound returns the job to pending (retry-scheduled), attempts preserved", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 3 });
    await store.claim("req-1");
    const retried = await store.fail("req-1", "worker exploded");
    expect(retried.kind).toBe("retry-scheduled");
    if (retried.kind === "retry-scheduled") {
      expect(retried.job.status).toBe("pending");
      expect(retried.job.attempts).toBe(1);
      expect(retried.job.failureDetail).toBe("worker exploded");
      expect(retried.job.leaseExpiresAtMs).toBeNull();
    }
    // And it is claimable again immediately.
    const reclaimed = await store.claim("req-1");
    expect(reclaimed.kind).toBe("claimed");
    if (reclaimed.kind === "claimed") {
      expect(reclaimed.job.attempts).toBe(2);
    }
  });

  test("the last allowed attempt fails terminally (attempts == maxAttempts)", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 2 });
    await store.claim("req-1");
    await store.fail("req-1", "first failure");
    await store.claim("req-1");
    const final = await store.fail("req-1", "second failure");
    expect(final.kind).toBe("failed");
    if (final.kind === "failed") {
      expect(final.job.status).toBe("failed");
      expect(final.job.attempts).toBe(2);
      expect(final.job.failureDetail).toBe("second failure");
    }
  });

  test("claiming past the bound marks the job terminally failed (never an infinite retry loop)", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now, { claimLeaseSeconds: 30 });
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 1 });
    await store.claim("req-1");
    // The worker crashes: its lease expires, a stale worker re-claims —
    // attempts(1) >= maxAttempts(1) ⇒ typed `exhausted`, terminally
    // failed, attempts NOT incremented.
    clock.advance(30_000);
    const exhausted = await store.claim("req-1");
    expect(exhausted.kind).toBe("exhausted");
    if (exhausted.kind === "exhausted") {
      expect(exhausted.job.status).toBe("failed");
      expect(exhausted.job.attempts).toBe(1);
      expect(exhausted.job.failureDetail).toBe("attempts exhausted");
    }
    const terminal = await store.claim("req-1");
    expect(terminal.kind).toBe("terminal");
  });

  test("a completed job can never be failed", async () => {
    const clock = makeClock();
    const { store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 2 });
    await store.claim("req-1");
    await store.complete("req-1", "result");
    const result = await store.fail("req-1", "late failure");
    expect(result.kind).toBe("terminal");
  });
});

describe("transient state discipline", () => {
  test("job records honor the EXPLICIT record TTL (nothing lingers past its horizon)", async () => {
    const clock = makeClock();
    const { client, store } = makeStore(clock.now, { ttlSeconds: 60 });
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 2 });
    expect(client.liveEntries(clock.now())).toHaveLength(1);
    clock.advance(60_000);
    expect(await store.get("req-1")).toBeNull();
    expect(client.liveEntries(clock.now())).toEqual([]);
    // The record expired → re-enqueue legitimately CREATES again.
    const recreated = await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 2 });
    expect(recreated.kind).toBe("created");
  });

  test("the record lives at the derived job key (queue-scoped address)", async () => {
    const clock = makeClock();
    const { client, store } = makeStore(clock.now);
    await store.enqueue({ idempotencyKey: "req-1", payload: "work", maxAttempts: 2 });
    const expectedKey = jobKey({ queue: "reconstruction", idempotencyKey: "req-1" });
    expect(client.liveEntries(clock.now()).map((entry) => entry.key)).toEqual([expectedKey]);
  });

  test("a corrupt stored record is a typed protocol failure, never a crash", async () => {
    const clock = makeClock();
    const { client, store } = makeStore(clock.now);
    await client.set(jobKey({ queue: "reconstruction", idempotencyKey: "req-1" }), "not-json{", 60);
    const result = await store.claim("req-1");
    expect(result.kind).toBe("failure");
    if (result.kind === "failure") {
      expect(result.failure.kind).toBe("protocol_error");
    }
  });
});
