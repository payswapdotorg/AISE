/**
 * Export-2D service process entry (AISE-017).
 *
 * Boots with the same fail-closed discipline as the sibling
 * service processes: configuration comes only from the
 * environment (via `@aise/backend-config`); invalid
 * configuration logs a structured `config.invalid` record and
 * exits 1. SIGINT/SIGTERM shut down gracefully (exit 0).
 *
 * v1.0 limitation (documented, not hidden — the AISE-010
 * precedent): the export-2d package is a deterministic
 * projection library, not a request-serving process — there is
 * no external request intake yet (the transport that serves
 * plan documents over HTTP and the DXF serialization are later
 * Work Items: AISE-019 consumes this document downstream). This
 * entry proves the boot/shutdown contract and is the composition
 * point that intake binds into.
 */
import process from "node:process";
import { loadConfig, loadEnvFileIfPresent } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { buildExport2dService } from "./runtime.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const envFileLoaded = loadEnvFileIfPresent();

  const result = loadConfig(process.env);
  if (!result.ok) {
    const bootLogger = createLogger({ level: "error", module: "export-2d" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "export-2d" });
  const service = buildExport2dService(config, logger);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("export2d.shutdown", { signal });
    logger.info("export2d.stopped", { signal });
    process.exit(0);
  };

  logger.info("export2d.started", {
    env: config.env,
    maxGraphObjects: service.limits.maxGraphObjects,
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (error) => {
    logger.error("export2d.uncaught", { message: errorMessage(error) });
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("export2d.unhandledRejection", { reason: errorMessage(reason) });
    process.exit(1);
  });
}

main().catch((error: unknown) => {
  console.error(`export-2d boot failure: ${errorMessage(error)}`);
  process.exit(1);
});
