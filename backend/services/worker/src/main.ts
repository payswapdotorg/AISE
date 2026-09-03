import process from "node:process";
import { loadConfig, loadEnvFileIfPresent } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { buildFoundationWorker } from "./runtime.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const envFileLoaded = loadEnvFileIfPresent();

  // Fail closed: identical boot rules to the API service.
  const result = loadConfig(process.env);
  if (!result.ok) {
    const bootLogger = createLogger({ level: "error", module: "config" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "worker" });

  const { runtime } = buildFoundationWorker(config, logger);
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("worker.shutdown", { signal });
    runtime
      .stop()
      .then(() => {
        logger.info("worker.stopped", { signal });
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error("worker.stop_failed", { signal, error: errorMessage(error) });
        process.exit(1);
      });
  };

  await runtime.start();
  logger.info("worker.started", {
    env: config.env,
    pollIntervalMs: config.worker.pollIntervalMs,
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason) => {
  const logger = createLogger({ level: "error", module: "worker" });
  logger.error("worker.unhandled_rejection", { error: errorMessage(reason) });
  process.exit(1);
});

await main();
