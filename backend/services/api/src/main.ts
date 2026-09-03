import process from "node:process";
import { loadConfig, loadEnvFileIfPresent } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import { createApiServer } from "./server.js";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const envFileLoaded = loadEnvFileIfPresent();

  // Fail closed: invalid or missing required configuration terminates the
  // process with a structured record and exit code 1.
  const result = loadConfig(process.env);
  if (!result.ok) {
    const bootLogger = createLogger({ level: "error", module: "config" });
    bootLogger.error("config.invalid", {
      errors: [...result.errors],
      envFileLoaded,
    });
    process.exit(1);
  }

  const { config } = result;
  const logger = createLogger({ level: config.logLevel, module: "api" });

  const api = createApiServer({ config, logger });
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("api.shutdown", { signal });
    api
      .stop()
      .then(() => {
        logger.info("api.stopped", { signal });
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error("api.stop_failed", { signal, error: errorMessage(error) });
        process.exit(1);
      });
  };

  try {
    const address = await api.start();
    logger.info("api.listening", {
      host: address.host,
      port: address.port,
      env: config.env,
    });
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    logger.error("api.start_failed", { error: errorMessage(error) });
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason) => {
  // A foundation process must never swallow an unhandled rejection.
  const logger = createLogger({ level: "error", module: "api" });
  logger.error("api.unhandled_rejection", { error: errorMessage(reason) });
  process.exit(1);
});

await main();
