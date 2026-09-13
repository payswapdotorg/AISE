/**
 * AISE backend API entry point.
 *
 * Startup contract (AISE-001):
 * - load and validate configuration, failing fast (exit 1) with every
 *   invalid/missing variable listed;
 * - bind the HTTP skeleton via Bun.serve;
 * - log lifecycle events through the structured logger only;
 * - shut down cleanly on SIGINT/SIGTERM.
 */

import { ConfigError, loadConfig, type AppConfig } from "./lib/config";
import { createLogger } from "./lib/log";
import { createRequestHandler, SERVICE_NAME } from "./server";
import pkg from "../package.json" with { type: "json" };

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    const boot = createLogger("error");
    const issues = error instanceof ConfigError
      ? error.issues
      : ["configuration failed to load"];
    boot.error("invalid environment configuration; refusing to start", { issues });
    process.exit(1);
  }
}

function main(): void {
  const config = loadConfigOrExit();
  const logger = createLogger(config.logLevel);

  const handler = createRequestHandler({
    envSource: () => process.env,
    version: pkg.version,
    logger,
  });

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: handler,
  });

  logger.info("aise-api listening", {
    service: SERVICE_NAME,
    host: config.host,
    port: server.port,
    version: pkg.version,
  });

  const shutdown = (signal: string): void => {
    logger.info("shutting down", { signal });
    server.stop(true);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
