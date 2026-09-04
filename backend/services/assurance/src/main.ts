/**
 * Assurance-service process entry (AISE-013).
 *
 * Boots with the same fail-closed discipline as the API,
 * worker, reconstruction, geometry, semantics, reality-model,
 * and evidence processes: configuration comes only from the
 * environment (via `@aise/backend-config`), invalid
 * configuration logs a structured `config.invalid` record and
 * exits 1. SIGINT/SIGTERM shut down gracefully (exit 0).
 *
 * v1.0 limitation (documented, not hidden): the assurance
 * service is a deterministic assessment library, not a
 * request-serving process — profile registration and assessment
 * bind into this composition point from the API layer (reads
 * arrive with AISE-015). This entry proves the boot/shutdown
 * contract and is the composition point those surfaces bind
 * into.
 */
import process from "node:process";
import { loadConfig, loadEnvFileIfPresent } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const envFileLoaded = loadEnvFileIfPresent();

  const result = loadConfig(process.env);
  if (!result.ok) {
    const bootLogger = createLogger({ level: "error", module: "assurance" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "assurance" });

  // v1.0 composition boundary: model/evidence readers bind at
  // the API layer where intake lives (the boot contract itself
  // is what this entry proves; see the note in assurance.started).
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("assurance.shutdown", { signal });
    logger.info("assurance.stopped", { signal });
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.info("assurance.started", {
    env: config.env,
    note: "task-specific model-readiness authority: profiles, assessments, history; model/evidence readers bind at the API layer (AISE-015+)",
  });
}

main().catch((error: unknown) => {
  const bootLogger = createLogger({ level: "error", module: "assurance" });
  bootLogger.error("assurance.boot.failed", { error: errorMessage(error) });
  process.exit(1);
});
