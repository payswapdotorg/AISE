/**
 * Reconstruction service process entry (AISE-008).
 *
 * Boots with the same fail-closed discipline as the API and worker
 * processes: configuration comes only from the environment (via
 * `@aise/backend-config`), invalid configuration logs a structured
 * `config.invalid` record and exits 1. SIGINT/SIGTERM shut the
 * runner down gracefully (exit 0).
 *
 * v1.0 limitation (documented, not hidden): the process starts the
 * pipeline with production defaults — fail-closed capture source,
 * metadata pose adapter, no geometry engine — and has no external
 * job intake yet (the durable transport that connects ingestion to
 * reconstruction is a later Work Item). Jobs can only be enqueued
 * programmatically; this entry proves the boot/shutdown contract
 * and is the composition point future transport binds into.
 */
import process from "node:process";
import { loadConfig, loadEnvFileIfPresent } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { buildReconstructionService } from "./runtime.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const envFileLoaded = loadEnvFileIfPresent();

  // Fail closed: identical boot rules to the API and worker services.
  const result = loadConfig(process.env);
  if (!result.ok) {
    const bootLogger = createLogger({ level: "error", module: "reconstruction" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "reconstruction" });
  const { runner } = buildReconstructionService(config, logger);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("reconstruction.shutdown", { signal });
    runner
      .stop()
      .then(() => {
        logger.info("reconstruction.stopped", { signal });
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error("reconstruction.stop_failed", { signal, error: errorMessage(error) });
        process.exit(1);
      });
  };

  await runner.start();
  logger.info("reconstruction.started", {
    env: config.env,
    pollIntervalMs: config.worker.pollIntervalMs,
    note: "no external job intake in v1.0; capture source unbound; jobs enqueue programmatically",
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason) => {
  const logger = createLogger({ level: "error", module: "reconstruction" });
  logger.error("reconstruction.unhandled_rejection", { error: errorMessage(reason) });
  process.exit(1);
});

await main();
