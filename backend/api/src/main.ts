/**
 * AISE backend API entry point.
 *
 * Startup contract (AISE-001, extended by AISE-004):
 * - load and validate configuration, failing fast (exit 1) with every
 *   invalid/missing variable listed;
 * - construct the file-system capture store rooted at `AISE_DATA_DIR`
 *   (default `./data`), refusing to start when the directory cannot be
 *   created or written;
 * - bind the HTTP surface (health/readiness + capture ingestion) via
 *   Bun.serve;
 * - log lifecycle events through the structured logger only;
 * - shut down cleanly on SIGINT/SIGTERM.
 */

import { ConfigError, loadConfig, type AppConfig } from "./lib/config";
import { createLogger } from "./lib/log";
import { createCaptureGateway } from "./capture/gateway";
import { FsCaptureStore } from "./capture/store";
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

function captureStoreOrExit(dataDir: string): FsCaptureStore {
  try {
    return new FsCaptureStore(dataDir);
  } catch (error) {
    const boot = createLogger("error");
    boot.error("capture store initialization failed; refusing to start", {
      dataDir,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

function main(): void {
  const config = loadConfigOrExit();
  const logger = createLogger(config.logLevel);
  const store = captureStoreOrExit(config.dataDir);

  const handler = createRequestHandler({
    envSource: () => process.env,
    version: pkg.version,
    logger,
    capture: createCaptureGateway({
      store,
      clock: () => new Date().toISOString(),
    }),
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
    dataDir: config.dataDir,
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
