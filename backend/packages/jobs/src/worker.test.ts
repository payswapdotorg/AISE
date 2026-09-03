import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, type Logger, type LogFields } from "@aise/backend-logging";
import type { JobRecord, JobType } from "./types.js";
import { createWorker, type WorkerQueue } from "./worker.js";

interface CapturedLog {
  msg: unknown;
  [key: string]: unknown;
}

function capturingLogger(): { logger: Logger; records: CapturedLog[] } {
  const records: CapturedLog[] = [];
  const logger = createLogger({
    level: "debug",
    module: "worker-test",
    sink: (line) => records.push(JSON.parse(line) as CapturedLog),
    now: () => "2026-01-01T00:00:00.000Z",
  });
  return { logger, records };
}

function fakeQueue(jobs: JobRecord[] = []): WorkerQueue & { dequeueCount: number } {
  const state = { pending: [...jobs], dequeueCount: 0 };
  return {
    dequeueCount: 0,
    dequeue() {
      state.dequeueCount += 1;
      this.dequeueCount = state.dequeueCount;
      return state.pending.shift() ?? null;
    },
  };
}

function job(type: JobType, id: string): JobRecord {
  return { id, type, payload: null, enqueuedAt: "2026-01-01T00:00:00.000Z" };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createWorker", () => {
  it("processes an enqueued job and logs its lifecycle", async () => {
    const { logger, records } = capturingLogger();
    const heartbeat = job("system.heartbeat", "job-1");
    const queue = fakeQueue([heartbeat]);
    const seen: string[] = [];
    const worker = createWorker({
      queue,
      logger,
      handlers: {
        "system.heartbeat": ({ job: current }) => {
          seen.push(current.id);
        },
      },
      pollIntervalMs: 10,
    });

    await worker.start();
    await vi.waitFor(() => {
      expect(seen).toEqual(["job-1"]);
    });
    await worker.stop();

    expect(records.some((r) => r.msg === "job.started")).toBe(true);
    expect(records.some((r) => r.msg === "job.completed")).toBe(true);
    expect(worker.isRunning()).toBe(false);
  });

  it("isolates handler failures: the loop continues with the next job", async () => {
    const { logger, records } = capturingLogger();
    const failing = job("system.noop", "job-fail");
    const healthy = job("system.noop", "job-ok");
    const queue = fakeQueue([failing, healthy]);
    const handled: string[] = [];
    const worker = createWorker({
      queue,
      logger,
      handlers: {
        "system.noop": ({ job: current }) => {
          if (current.id === "job-fail") {
            throw new Error("boom");
          }
          handled.push(current.id);
        },
      },
      pollIntervalMs: 10,
    });

    await worker.start();
    await vi.waitFor(() => {
      expect(handled).toEqual(["job-ok"]);
    });
    await worker.stop();

    const failed = records.find((r) => r.msg === "job.failed") as { jobId?: string } | undefined;
    expect(failed?.jobId).toBe("job-fail");
    expect(records.some((r) => r.msg === "job.completed")).toBe(true);
  });

  it("surfaces jobs that have no registered handler instead of ignoring them", async () => {
    const { logger, records } = capturingLogger();
    const queue = fakeQueue([job("system.heartbeat", "orphan-1")]);
    const worker = createWorker({
      queue,
      logger,
      handlers: {}, // deliberately empty
      pollIntervalMs: 10,
    });

    await worker.start();
    await vi.waitFor(() => {
      expect(records.some((r) => r.msg === "job.no_handler")).toBe(true);
    });
    await worker.stop();

    const noHandler = records.find((r) => r.msg === "job.no_handler") as
      | { jobId?: string; type?: string }
      | undefined;
    expect(noHandler?.jobId).toBe("orphan-1");
    expect(noHandler?.type).toBe("system.heartbeat");
  });

  it("polls the queue at the configured interval and stops polling after stop()", async () => {
    vi.useFakeTimers();
    const { logger } = capturingLogger();
    const queue = fakeQueue();
    const worker = createWorker({ queue, logger, handlers: {}, pollIntervalMs: 50 });

    await worker.start();
    await vi.advanceTimersByTimeAsync(160);
    expect(queue.dequeueCount).toBeGreaterThanOrEqual(3);

    await worker.stop();
    const countAtStop = queue.dequeueCount;
    await vi.advanceTimersByTimeAsync(500);
    expect(queue.dequeueCount).toBe(countAtStop);
    expect(worker.isRunning()).toBe(false);
  });

  it("stop() is idempotent and resolves even while the loop is idle-waiting", async () => {
    vi.useFakeTimers();
    const { logger } = capturingLogger();
    const queue = fakeQueue();
    const worker = createWorker({ queue, logger, handlers: {}, pollIntervalMs: 60_000 });

    await worker.start();
    await vi.advanceTimersByTimeAsync(10); // loop is now sleeping for 60s
    await worker.stop();
    await worker.stop(); // idempotent
    expect(worker.isRunning()).toBe(false);
  });

  it("start() rejects after the worker has been stopped", async () => {
    const { logger } = capturingLogger();
    const queue = fakeQueue();
    const worker = createWorker({ queue, logger, handlers: {}, pollIntervalMs: 10 });
    await worker.start();
    await worker.stop();
    await expect(worker.start()).rejects.toThrow("already stopped");
  });

  it("forwards a child logger to handlers so job logs stay namespaced", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "info",
      module: "worker",
      sink: (line) => lines.push(line),
      now: () => "2026-01-01T00:00:00.000Z",
    });
    const queue = fakeQueue([job("system.heartbeat", "ctx-1")]);
    const worker = createWorker({
      queue,
      logger,
      handlers: {
        "system.heartbeat": ({ logger: jobLogger }) => {
          const fields: LogFields = { from: "handler" };
          jobLogger.info("handler.emit", fields);
        },
      },
      pollIntervalMs: 10,
    });

    await worker.start();
    await vi.waitFor(() => {
      expect(lines.some((l) => (JSON.parse(l) as { msg?: string }).msg === "handler.emit")).toBe(
        true,
      );
    });
    await worker.stop();
    const emitted = JSON.parse(
      lines.find((l) => (JSON.parse(l) as { msg?: string }).msg === "handler.emit") ?? "{}",
    ) as { module?: string };
    expect(emitted.module).toBe("worker.job");
  });
});
