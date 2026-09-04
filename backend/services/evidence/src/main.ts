/**
 * Evidence-service process entry (AISE-012).
 *
 * Boots with the same fail-closed discipline as the API,
 * worker, reconstruction, geometry, semantics, and reality-model
 * processes: configuration comes only from the environment (via
 * `@aise/backend-config`), invalid configuration logs a
 * structured `config.invalid` record and exits 1. SIGINT/SIGTERM
 * shut down gracefully (exit 0).
 *
 * v1.0 limitation (documented, not hidden): the evidence service
 * is a deterministic registration/linking/validity library, not
 * a request-serving process — there is no external intake yet
 * (capture evidence registration and review-time linking bind
 * into this composition point; the web workspace reads arrive
 * with AISE-015/016). This entry proves the boot/shutdown
 * contract and is the composition point that intake binds into.
 */
import process from "node:process";
import { loadConfig, loadEnvFileIfPresent } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { buildEvidenceService } from "./runtime.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const envFileLoaded = loadEnvFileIfPresent();

  const result = loadConfig(process.env);
  if (!result.ok) {
    const bootLogger = createLogger({ level: "error", module: "evidence" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "evidence" });
  const service = buildEvidenceService(config, logger);

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("evidence.shutdown", { signal });
    logger.info("evidence.stopped", { signal });
    process.exit(0);
  };

  logger.info("evidence.started", {
    env: config.env,
    maxEvidenceRecords: service.limits.maxEvidenceRecords,
    maxEvidenceLinks: service.limits.maxEvidenceLinks,
    note: "authoritative provenance mapping: evidence registration, linking, retraction, verification validity; no external intake in v1.0",
  });

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason) => {
  const logger = createLogger({ level: "error", module: "evidence" });
  logger.error("evidence.unhandled_rejection", { error: errorMessage(reason) });
  process.exit(1);
});

await main();
