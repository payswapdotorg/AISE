import { describe, expect, it } from "vitest";
import { InMemoryJobQueue } from "./queue.js";
import type { JobRecord } from "./types.js";

describe("InMemoryJobQueue", () => {
  it("dequeues in strict FIFO order", () => {
    const queue = new InMemoryJobQueue();
    const first = queue.enqueue("system.noop", { seq: 1 });
    const second = queue.enqueue("system.noop", { seq: 2 });

    expect(queue.size()).toBe(2);
    expect(queue.dequeue()).toBe(first);
    expect(queue.dequeue()).toBe(second);
    expect(queue.dequeue()).toBeNull();
    expect(queue.size()).toBe(0);
  });

  it("assigns unique ids to every job", () => {
    const queue = new InMemoryJobQueue();
    const ids = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      ids.add(queue.enqueue("system.noop").id);
    }
    expect(ids.size).toBe(100);
  });

  it("uses null as the default payload and preserves provided payloads", () => {
    const queue = new InMemoryJobQueue();
    const defaulted = queue.enqueue("system.noop");
    const loaded = queue.enqueue("system.heartbeat", { note: "hi" });
    expect(defaulted.payload).toBeNull();
    expect(loaded.payload).toEqual({ note: "hi" });
  });

  it("records ISO-8601 enqueue timestamps", () => {
    const queue = new InMemoryJobQueue();
    const job: JobRecord = queue.enqueue("system.noop");
    expect(Number.isNaN(Date.parse(job.enqueuedAt))).toBe(false);
  });
});
