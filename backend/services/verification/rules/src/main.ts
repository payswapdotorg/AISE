/**
 * Rules-service process entry (AISE-021).
 *
 * Boots with the same fail-closed discipline as the API,
 * worker, reconstruction, geometry, semantics, reality-model,
 * evidence, assurance and model-QA processes: configuration
 * comes only from the environment (via
 * `@aise/backend-config`), invalid configuration logs a
 * structured `config.invalid` record and exits 1.
 * SIGINT/SIGTERM shut down gracefully (exit 0).
 *
 * v1.0 limitation (documented, not hidden): the rules service
 * is a deterministic evaluation library, not a request-serving
 * process — rule-set registration and evaluation bind into a
 * composition point at the API layer. This entry proves the
 * boot/shutdown contract and is that composition point.
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
    const bootLogger = createLogger({ level: "error", module: "rules" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "rules" });

  // v1.0 composition boundary: model/evidence/readiness readers
  // bind at the API layer where intake lives (the boot contract
  // itself is what this entry proves).
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("rules.shutdown", { signal });
    logger.info("rules.stopped", { signal });
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.info("rules.started", {
    env: config.env,
    note: "engineering rule engine: deterministic tri-state rule evaluation over the Reality Graph; model/evidence/readiness readers bind at the API layer",
  });
}

main().catch((error: unknown) => {
  const bootLogger = createLogger({ level: "error", module: "rules" });
  bootLogger.error("rules.boot.failed", { error: errorMessage(error) });
  process.exit(1);
});
