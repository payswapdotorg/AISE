/**
 * Export-DXF service process entry (AISE-019).
 *
 * Boots with the same fail-closed discipline as the sibling
 * service processes: configuration comes only from the
 * environment (via `@aise/backend-config`); invalid
 * configuration logs a structured `config.invalid` record and
 * exits 1. SIGINT/SIGTERM shut down gracefully (exit 0).
 *
 * v1.0 limitation (documented, not hidden — the AISE-010
 * precedent): the export-dxf package is a deterministic
 * serialization library, not a request-serving process — there
 * is no external request intake yet (the transport that serves
 * DXF drawings over HTTP is a later Work Item). This entry
 * proves the boot/shutdown contract and is the composition
 * point that intake binds into.
 */
import process from "node:process";
import { loadConfig, loadEnvFileIfPresent } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { buildExportDxfService } from "./runtime.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const envFileLoaded = loadEnvFileIfPresent();

  const result = loadConfig(process.env);
  if (!result.ok) {
    const bootLogger = createLogger({ level: "error", module: "export-dxf" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "export-dxf" });
  const service = buildExportDxfService(config, logger);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("exportdxf.shutdown", { signal });
    logger.info("exportdxf.stopped", { signal });
    process.exit(0);
  };

  logger.info("exportdxf.started", {
    env: config.env,
    maxPrimitives: service.limits.maxPrimitives,
    maxOutputBytes: service.limits.maxOutputBytes,
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (error) => {
    logger.error("exportdxf.uncaught", { message: errorMessage(error) });
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("exportdxf.unhandledRejection", { reason: errorMessage(reason) });
    process.exit(1);
  });
}

main().catch((error: unknown) => {
  console.error(`export-dxf boot failure: ${errorMessage(error)}`);
  process.exit(1);
});
