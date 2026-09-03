import { randomUUID } from "node:crypto";
import type { JobRecord, JobType, JsonValue } from "./types.js";

/**
 * The queue side of the job boundary. Producers enqueue; the worker
 * process dequeues. Implementations may be in-memory (foundation) or
 * durable (introduced by later Work Items) without changing this contract.
 */
export interface JobQueue {
  enqueue(type: JobType, payload?: JsonValue): JobRecord;
  dequeue(): JobRecord | null;
  size(): number;
}

/**
 * Foundation in-memory FIFO transport. Jobs live only inside the owning
 * process; this is a placeholder until a durable transport is specified
 * (AISE-004+). Deterministic ordering: strict FIFO.
 */
export class InMemoryJobQueue implements JobQueue {
  private readonly jobs: JobRecord[] = [];

  public enqueue(type: JobType, payload: JsonValue = null): JobRecord {
    const job: JobRecord = {
      id: randomUUID(),
      type,
      payload,
      enqueuedAt: new Date().toISOString(),
    };
    this.jobs.push(job);
    return job;
  }

  public dequeue(): JobRecord | null {
    return this.jobs.shift() ?? null;
  }

  public size(): number {
    return this.jobs.length;
  }
}
