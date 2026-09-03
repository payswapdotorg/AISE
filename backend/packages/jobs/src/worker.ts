import type { Logger } from "@aise/backend-logging";
import type { JobRecord, JobType } from "./types.js";

export interface WorkerContext {
  readonly logger: Logger;
  readonly job: JobRecord;
}

export type JobHandler = (context: WorkerContext) => Promise<void> | void;

export type JobHandlers = Partial<Record<JobType, JobHandler>>;

/** The queue capabilities the worker loop needs. */
export interface WorkerQueue {
  dequeue(): JobRecord | null;
}

export interface WorkerOptions {
  readonly queue: WorkerQueue;
  readonly logger: Logger;
  readonly handlers: JobHandlers;
  /** Poll interval when the queue is empty. Default: 1000 ms. */
  readonly pollIntervalMs?: number;
}

export interface WorkerRuntime {
  /** Starts the poll-execute loop. Idempotent; rejects after `stop()`. */
  start(): Promise<void>;
  /**
   * Gracefully stops the loop: aborts idle waiting, finishes the current
   * handler, then resolves. Idempotent.
   */
  stop(): Promise<void>;
  isRunning(): boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 1000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => resolve(), ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Creates a background worker loop.
 *
 * Semantics:
 * - Dequeues one job at a time; a failing handler is logged (`job.failed`)
 *   and isolated — it never stops the loop.
 * - A job with no registered handler is logged (`job.no_handler`) and
 *   dropped: unknown work is surfaced, never silently ignored.
 * - `stop()` is graceful and idempotent; the loop exits promptly even
 *   while idle-waiting.
 */
export function createWorker(options: WorkerOptions): WorkerRuntime {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const { queue, logger, handlers } = options;

  let running = false;
  let started = false;
  let stopped = false;
  let loopPromise: Promise<void> | null = null;
  let sleepAbort: AbortController | null = null;

  const processJob = async (job: JobRecord): Promise<void> => {
    const handler = handlers[job.type];
    if (handler === undefined) {
      logger.error("job.no_handler", { jobId: job.id, type: job.type });
      return;
    }
    const startedAtMs = Date.now();
    logger.debug("job.started", { jobId: job.id, type: job.type });
    try {
      await handler({ logger: logger.child("job"), job });
      logger.info("job.completed", {
        jobId: job.id,
        type: job.type,
        durationMs: Date.now() - startedAtMs,
      });
    } catch (error) {
      logger.error("job.failed", {
        jobId: job.id,
        type: job.type,
        error: errorMessage(error),
      });
    }
  };

  const loop = async (): Promise<void> => {
    while (running) {
      const job = queue.dequeue();
      if (job === null) {
        logger.debug("worker.poll");
        await sleep(pollIntervalMs, sleepAbort?.signal ?? new AbortController().signal);
        continue;
      }
      await processJob(job);
    }
    logger.debug("worker.loop_exited");
  };

  return {
    start: async () => {
      if (stopped) {
        throw new Error("worker already stopped");
      }
      if (started) {
        return;
      }
      started = true;
      running = true;
      sleepAbort = new AbortController();
      loopPromise = loop();
    },
    stop: async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      running = false;
      sleepAbort?.abort();
      await loopPromise;
    },
    isRunning: () => running,
  };
}
