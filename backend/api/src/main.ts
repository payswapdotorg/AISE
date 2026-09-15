/**
 * AISE backend API entry point — the LOCAL adapter (Bun.serve).
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
 *
 * PROD-003 (the ONLY change to this file — every line documented): the
 * handler is now constructed by the shared runtime factory
 * (backend/api/src/runtime/entry.ts) instead of inline, so the local
 * `bun run start` adapter and the Vercel catch-all function serve the
 * IDENTICAL contract — the same createRequestHandler routing core, wrapped
 * in the same runtime layer (CORS, /readyz provider statuses, the stable
 * error envelope). The local adapter's OWN disciplines are preserved
 * exactly: `loadConfigOrExit` still fails fast on an invalid environment
 * (exit 1 with every issue), and `failFast: true` makes the factory throw
 * RuntimeBootError when the capture store cannot be constructed — caught
 * below and turned into the same exit(1) the previous
 * `captureStoreOrExit` performed (that helper moved into the factory; its
 * log line and exit code are unchanged).
 */

import { ConfigError, loadConfig, type AppConfig } from "./lib/config";
import { createLogger } from "./lib/log";
import { SERVICE_NAME } from "./server";
import { createRuntimeHandler, RuntimeBootError } from "./runtime";
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

  // PROD-003: shared runtime factory — see the module header. `failFast`
  // preserves this adapter's exit(1) discipline on capture-store failure.
  let handler: (request: Request) => Promise<Response>;
  try {
    handler = createRuntimeHandler({ failFast: true, logger });
  } catch (error) {
    const issues = error instanceof RuntimeBootError
      ? [...error.issues]
      : [error instanceof Error ? error.message : String(error)];
    logger.error("runtime construction failed; refusing to start", { issues });
    process.exit(1);
  }

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
