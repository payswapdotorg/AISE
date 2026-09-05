/**
 * MEP reconstruction service process entry (AISE-026).
 *
 * The standard fail-closed boot/SIGTERM discipline (v1.0
 * limitation, documented — the AISE-010 precedent: the package
 * is a deterministic reconstruction library; the transport that
 * serves reconstructions over HTTP is a later Work Item. This
 * entry proves the boot/shutdown contract).
 */
import process from "node:process";
import { loadConfig, loadEnvFileIfPresent } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { buildMepService } from "./runtime.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const envFileLoaded = loadEnvFileIfPresent();
  const result = loadConfig(process.env);
  if (!result.ok) {
    const bootLogger = createLogger({ level: "error", module: "semantics-mep" });
    bootLogger.error("config.invalid", { errors: [...result.errors], envFileLoaded });
    process.exit(1);
  }
  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "semantics-mep" });
  const service = buildMepService(config, logger);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("mep.shutdown", { signal });
    logger.info("mep.stopped", { signal });
    process.exit(0);
  };

  logger.info("mep.started", {
    env: config.env,
    maxInputPoints: service.limits.maxInputPoints,
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("uncaughtException", (error) => {
    logger.error("mep.uncaught", { message: errorMessage(error) });
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("mep.unhandledRejection", { reason: errorMessage(reason) });
    process.exit(1);
  });
}

main().catch((error: unknown) => {
  console.error(`semantics-mep boot failure: ${errorMessage(error)}`);
  process.exit(1);
});
