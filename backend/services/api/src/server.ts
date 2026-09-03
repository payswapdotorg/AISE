import { createServer, type Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AiseConfig } from "@aise/backend-config";
import type { Logger } from "@aise/backend-logging";

export interface ApiAddress {
  readonly host: string;
  readonly port: number;
}

export interface ApiServer {
  readonly server: Server;
  /**
   * Starts listening on the configured host/port. Use port `0` in the
   * configuration to bind an ephemeral port (tests) — the actual address is
   * resolved and returned.
   */
  start(): Promise<ApiAddress>;
  /** Gracefully stops accepting and serving requests. */
  stop(): Promise<void>;
}

export interface ApiServerDeps {
  readonly config: AiseConfig;
  readonly logger: Logger;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function roundToMilliSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Creates the AISE API service HTTP server.
 *
 * Foundation routes only (health/readiness + JSON 404/405 semantics); every
 * request is logged as a structured `http.request` record. Handlers are
 * error-isolated: an unexpected failure returns `500 {"error":"internal"}`
 * without crashing the process.
 */
export function createApiServer(deps: ApiServerDeps): ApiServer {
  const { config, logger } = deps;
  const startedAtMs = Date.now();

  const server: Server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestStartMs = Date.now();
    const method = req.method ?? "GET";
    const path = req.url ?? "/";
    try {
      if (path === "/healthz" || path === "/readyz") {
        if (method !== "GET") {
          sendJson(res, 405, { error: "method_not_allowed" });
        } else if (path === "/healthz") {
          sendJson(res, 200, {
            service: "api",
            status: "ok",
            env: config.env,
            uptimeSec: roundToMilliSeconds((Date.now() - startedAtMs) / 1000),
          });
        } else {
          sendJson(res, 200, { service: "api", status: "ready" });
        }
        return;
      }
      sendJson(res, 404, { error: "not_found", path });
    } catch (error) {
      logger.error("http.request_failed", { method, path, error: errorMessage(error) });
      if (!res.headersSent) {
        sendJson(res, 500, { error: "internal" });
      } else {
        res.end();
      }
    } finally {
      logger.info("http.request", {
        method,
        path,
        status: res.statusCode,
        durationMs: Date.now() - requestStartMs,
      });
    }
  }

  server.on("clientError", (error, socket) => {
    logger.debug("http.client_error", { error: errorMessage(error) });
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    }
  });

  return {
    server,
    start: () =>
      new Promise<ApiAddress>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.api.port, config.api.host, () => {
          const address = server.address();
          if (address !== null && typeof address === "object") {
            resolve({ host: address.address, port: address.port });
          } else {
            resolve({ host: config.api.host, port: config.api.port });
          }
        });
      }),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.closeIdleConnections();
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      }),
  };
}
