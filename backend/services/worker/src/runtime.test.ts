import { describe, expect, it, vi } from "vitest";
import type { AiseConfig } from "@aise/backend-config";
import { createLogger, type Logger } from "@aise/backend-logging";
import { buildFoundationWorker } from "./runtime.js";

const config: AiseConfig = {
  env: "test",
  logLevel: "info",
  api: { host: "127.0.0.1", port: 8080 },
  worker: { pollIntervalMs: 10 },
};

interface JsonRecord {
  msg?: string;
  jobId?: string;
  [key: string]: unknown;
}

function makeLogger(): { logger: Logger; records: JsonRecord[] } {
  const records: JsonRecord[] = [];
  const logger = createLogger({
    level: "debug",
    module: "worker-test",
    sink: (line) => records.push(JSON.parse(line) as JsonRecord),
    now: () => "2026-01-01T00:00:00.000Z",
  });
  return { logger, records };
}

describe("buildFoundationWorker", () => {
  it("processes system.heartbeat jobs through the wired runtime", async () => {
    const { logger, records } = makeLogger();
    const { runtime, queue } = buildFoundationWorker(config, logger);

    const job = queue.enqueue("system.heartbeat");
    await runtime.start();
    await vi.waitFor(() => {
      expect(records.some((r) => r.msg === "worker.heartbeat" && r.jobId === job.id)).toBe(true);
    });
    expect(records.some((r) => r.msg === "job.completed")).toBe(true);
    await runtime.stop();
    expect(runtime.isRunning()).toBe(false);
  });

  it("processes system.noop jobs to completion", async () => {
    const { logger, records } = makeLogger();
    const { runtime, queue } = buildFoundationWorker(config, logger);

    const job = queue.enqueue("system.noop");
    await runtime.start();
    await vi.waitFor(() => {
      const completed = records.find((r) => r.msg === "job.completed") as
        | { jobId?: string; type?: string }
        | undefined;
      expect(completed?.jobId).toBe(job.id);
      expect(completed?.type).toBe("system.noop");
    });
    await runtime.stop();
  });

  it("honours the configured poll interval when idle", async () => {
    vi.useFakeTimers();
    const { logger, records } = makeLogger();
    const { runtime } = buildFoundationWorker(config, logger);

    await runtime.start();
    await vi.advanceTimersByTimeAsync(35);
    const pollsAt35 = records.filter((r) => r.msg === "worker.poll").length;
    expect(pollsAt35).toBeGreaterThanOrEqual(2);
    await runtime.stop();
  });
});
