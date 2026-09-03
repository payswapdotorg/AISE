/**
 * Reality-model service process entry (AISE-011).
 *
 * Boots with the same fail-closed discipline as the API, worker,
 * reconstruction, geometry, and semantics processes:
 * configuration comes only from the environment (via
 * `@aise/backend-config`), invalid configuration logs a
 * structured `config.invalid` record and exits 1. SIGINT/SIGTERM
 * shut down gracefully (exit 0).
 *
 * v1.0 limitation (documented, not hidden): the reality-model
 * service is a deterministic ingestion + persistence library, not
 * a request-serving process — there is no external intake yet
 * (the transport that feeds committed scenes into model versions
 * is a later Work Item; the web workspace reads arrive with
 * AISE-015). This entry proves the boot/shutdown contract and is
 * the composition point that intake binds into.
 */
import process from "node:process";
import { loadConfig, loadEnvFileIfPresent } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { buildRealityModelService } from "./runtime.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const envFileLoaded = loadEnvFileIfPresent();

  const result = loadConfig(process.env);
  if (!result.ok) {
    const bootLogger = createLogger({ level: "error", module: "reality-model" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "reality-model" });
  const service = buildRealityModelService(config, logger);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("reality-model.shutdown", { signal });
    logger.info("reality-model.stopped", { signal });
    process.exit(0);
  };

  logger.info("reality-model.started", {
    env: config.env,
    maxSceneObjects: service.limits.maxSceneObjects,
    note: "canonical Reality Graph ingestion and persistence; no external intake in v1.0",
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason) => {
  const logger = createLogger({ level: "error", module: "reality-model" });
  logger.error("reality-model.unhandled_rejection", { error: errorMessage(reason) });
  process.exit(1);
});

await main();
