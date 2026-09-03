/**
 * Geometry service process entry (AISE-009).
 *
 * Boots with the same fail-closed discipline as the API, worker,
 * and reconstruction processes: configuration comes only from the
 * environment (via `@aise/backend-config`), invalid configuration
 * logs a structured `config.invalid` record and exits 1.
 * SIGINT/SIGTERM shut down gracefully (exit 0).
 *
 * v1.0 limitation (documented, not hidden): the geometry package
 * is a deterministic computation library, not a request-serving
 * process — there is no external job/request intake yet (the
 * transport that connects reconstruction outputs and semantic
 * consumers to measurement computation is a later Work Item).
 * This entry proves the boot/shutdown contract and is the
 * composition point that intake binds into.
 */
import process from "node:process";
import { loadConfig, loadEnvFileIfPresent } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { buildGeometryService } from "./runtime.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const envFileLoaded = loadEnvFileIfPresent();

  const result = loadConfig(process.env);
  if (!result.ok) {
    const bootLogger = createLogger({ level: "error", module: "geometry" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "geometry" });
  const service = buildGeometryService(config, logger);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("geometry.shutdown", { signal });
    logger.info("geometry.stopped", { signal });
    process.exit(0);
  };

  logger.info("geometry.started", {
    env: config.env,
    maxFitPoints: service.limits.maxFitPoints,
    note: "deterministic measurement primitives; no external intake in v1.0",
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason) => {
  const logger = createLogger({ level: "error", module: "geometry" });
  logger.error("geometry.unhandled_rejection", { error: errorMessage(reason) });
  process.exit(1);
});

await main();
