/**
 * Reporting service process entry (AISE-019).
 *
 * Boots with the same fail-closed discipline as the sibling
 * service processes: configuration comes only from the
 * environment (via `@aise/backend-config`); invalid
 * configuration logs a structured `config.invalid` record and
 * exits 1. SIGINT/SIGTERM shut down gracefully (exit 0).
 *
 * v1.0 limitation (documented, not hidden — the AISE-010
 * precedent): the reporting package is a deterministic report
 * library, not a request-serving process — there is no external
 * request intake yet (the transport that serves site reports
 * over HTTP is a later Work Item). This entry proves the
 * boot/shutdown contract and is the composition point that
 * intake binds into.
 */
import process from "node:process";
import { loadConfig, loadEnvFileIfPresent } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { buildReportingService } from "./runtime.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const envFileLoaded = loadEnvFileIfPresent();

  const result = loadConfig(process.env);
  if (!result.ok) {
    const bootLogger = createLogger({ level: "error", module: "reporting" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "reporting" });
  const service = buildReportingService(config, logger);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("reporting.shutdown", { signal });
    logger.info("reporting.stopped", { signal });
    process.exit(0);
  };

  logger.info("reporting.started", {
    env: config.env,
    maxGraphObjects: service.limits.maxGraphObjects,
    maxOutputBytes: service.limits.maxOutputBytes,
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (error) => {
    logger.error("reporting.uncaught", { message: errorMessage(error) });
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("reporting.unhandledRejection", { reason: errorMessage(reason) });
    process.exit(1);
  });
}

main().catch((error: unknown) => {
  console.error(`reporting boot failure: ${errorMessage(error)}`);
  process.exit(1);
});
