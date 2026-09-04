/**
 * Model-QA service process entry (AISE-014).
 *
 * Boots with the same fail-closed discipline as the API,
 * worker, reconstruction, geometry, semantics, reality-model,
 * evidence and assurance processes: configuration comes only
 * from the environment (via `@aise/backend-config`), invalid
 * configuration logs a structured `config.invalid` record and
 * exits 1. SIGINT/SIGTERM shut down gracefully (exit 0).
 *
 * v1.0 limitation (documented, not hidden): the model-QA
 * service is a deterministic verification library, not a
 * request-serving process — QA runs bind into this composition
 * point from the API layer (reads arrive with AISE-015/AISE-016
 * review surfaces). This entry proves the boot/shutdown contract
 * and is the composition point those surfaces bind into.
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
    const bootLogger = createLogger({ level: "error", module: "model-qa" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "model-qa" });

  // v1.0 composition boundary: model/evidence/readiness readers
  // bind at the API layer where intake lives (the boot contract
  // itself is what this entry proves; see the note in
  // model-qa.started).
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("model-qa.shutdown", { signal });
    logger.info("model-qa.stopped", { signal });
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.info("model-qa.started", {
    env: config.env,
    checkSuiteVersion: "qa/model-qa-v1",
    note: "deterministic verification library; readers bind at the API composition point",
  });

  await new Promise<void>((resolve) => {
    process.on("beforeExit", () => resolve());
  });
}

main().catch((error: unknown) => {
  const fallback = createLogger({ level: "error", module: "model-qa" });
  fallback.error("model-qa.fatal", { message: errorMessage(error) });
  process.exit(1);
});
