import type { AiseConfig } from "@aise/backend-config";
import {
  createWorker,
  InMemoryJobQueue,
  type JobHandlers,
  type JobQueue,
  type WorkerRuntime,
} from "@aise/backend-jobs";
import type { Logger } from "@aise/backend-logging";

export interface FoundationWorker {
  readonly runtime: WorkerRuntime;
  readonly queue: JobQueue;
}

/**
 * Wires the foundation worker: a fresh in-memory queue plus the two
 * system-level handlers. Deliberately free of product-domain logic.
 */
export function buildFoundationWorker(config: AiseConfig, logger: Logger): FoundationWorker {
  const queue = new InMemoryJobQueue();

  const handlers: JobHandlers = {
    "system.heartbeat": ({ logger: jobLogger, job }) => {
      jobLogger.info("worker.heartbeat", { jobId: job.id, enqueuedAt: job.enqueuedAt });
    },
    "system.noop": () => undefined,
  };

  const runtime = createWorker({
    queue,
    logger,
    handlers,
    pollIntervalMs: config.worker.pollIntervalMs,
  });

  return { runtime, queue };
}
