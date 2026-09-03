/**
 * Ingestion router for the capture gateway's /v1 surface (AISE-004).
 *
 * Responsibilities:
 * - route /v1 method+path combinations to the ingestion handlers;
 * - read and cap request bodies (JSON envelopes, multipart uploads),
 *   draining-but-not-buffering once the cap is exceeded;
 * - enforce the media types the gateway accepts (415 for others);
 * - convert every failure into an AISE-003 sync-error envelope
 *   (IngestionError → its status+envelope; anything unexpected →
 *   500 SERVER_ERROR, retryable). Routing-level errors (unknown
 *   path, wrong method, wrong media type) use the plain foundation
 *   shapes already tested in server.test.ts.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Logger } from "@aise/backend-logging";
import { IngestionError, serverErrorSyncError } from "./errors.js";
import {
  createProject,
  createSession,
  getAssetEvidence,
  getProject,
  getSession,
  registerPackage,
  updateSession,
  uploadAsset,
  type HandlerDeps,
  type IngestionResponse,
} from "./handlers.js";
import {
  DEFAULT_INGESTION_LIMITS,
  MULTIPART_OVERHEAD_BYTES,
  type IngestionLimits,
} from "./limits.js";
import { parseMultipart } from "./multipart.js";
import type { CaptureStore } from "./store.js";

export interface IngestionRouterDeps {
  readonly store: CaptureStore;
  readonly logger: Logger;
  readonly limits?: IngestionLimits;
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
  headers?: Record<string, string>,
): void {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function sendResponse(res: ServerResponse, response: IngestionResponse): void {
  sendJson(
    res,
    response.status,
    response.body,
    response.location !== undefined ? { location: response.location } : undefined,
  );
}

type BodyRead = { ok: true; body: Buffer } | { ok: false; code: "too_large" };

/**
 * Reads the request body up to `limitBytes`. When the cap is exceeded
 * the remainder of the stream is drained without buffering (so the
 * client can finish sending and receive the 413 response) and the
 * result is `too_large`.
 */
async function readBody(req: IncomingMessage, limitBytes: number): Promise<BodyRead> {
  const chunks: Buffer[] = [];
  let total = 0;
  let exceeded = false;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    if (exceeded) {
      continue;
    }
    total += buffer.length;
    if (total > limitBytes) {
      exceeded = true;
      chunks.length = 0;
      continue;
    }
    chunks.push(buffer);
  }
  return exceeded ? { ok: false, code: "too_large" } : { ok: true, body: Buffer.concat(chunks) };
}

function readJson(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString("utf8")) as unknown;
  } catch (error) {
    throw new IngestionError("VALIDATION_FAILED", "request body is not valid JSON", {
      details: { parseError: error instanceof Error ? error.message : String(error) },
    });
  }
}

/** The ingestion routes, with their methods (405 checking). */
const ROUTES: ReadonlyArray<{
  readonly segments: readonly string[];
  readonly methods: readonly string[];
}> = [
  { segments: ["projects"], methods: ["POST"] },
  { segments: ["projects", ":id"], methods: ["GET"] },
  { segments: ["sessions"], methods: ["POST"] },
  { segments: ["sessions", ":id"], methods: ["GET", "PUT"] },
  { segments: ["packages"], methods: ["POST"] },
  { segments: ["uploads"], methods: ["POST"] },
  { segments: ["sessions", ":id", "assets", ":assetId"], methods: ["GET"] },
];

interface MatchedRoute {
  readonly pattern: string;
  readonly params: readonly string[];
  readonly methods: readonly string[];
}

function matchRoute(segments: readonly string[]): MatchedRoute | undefined {
  for (const route of ROUTES) {
    if (route.segments.length !== segments.length) {
      continue;
    }
    const params: string[] = [];
    let matches = true;
    for (let index = 0; index < route.segments.length; index += 1) {
      const pattern = route.segments[index] ?? "";
      const segment = segments[index] ?? "";
      if (pattern.startsWith(":")) {
        if (segment.length === 0) {
          matches = false;
          break;
        }
        params.push(segment);
      } else if (pattern !== segment) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return { pattern: route.segments.join("/"), params, methods: route.methods };
    }
  }
  return undefined;
}

/**
 * Handles one /v1 request end-to-end (including writing the
 * response). Never throws: unexpected failures become 500
 * SERVER_ERROR sync-error envelopes.
 */
export async function handleIngestionRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: IngestionRouterDeps,
): Promise<void> {
  const limits = deps.limits ?? DEFAULT_INGESTION_LIMITS;
  const handlerDeps: HandlerDeps = { store: deps.store, logger: deps.logger, limits };

  try {
    const url = req.url ?? "/";
    const path = url.split("?")[0] ?? url;
    const segments = path.split("/").filter((segment) => segment.length > 0);
    const method = (req.method ?? "GET").toUpperCase();
    const contentType = (req.headers["content-type"] ?? "").toLowerCase();

    if (segments[0] !== "v1") {
      // Not an ingestion path; the foundation 404 applies.
      sendJson(res, 404, { error: "not_found", path });
      return;
    }

    const routeSegments = segments.slice(1);
    const match = matchRoute(routeSegments);
    if (match === undefined) {
      sendJson(res, 404, { error: "not_found", path });
      return;
    }
    if (!match.methods.includes(method)) {
      sendJson(res, 405, { error: "method_not_allowed" });
      return;
    }

    // JSON envelope creation endpoints
    if (path === "/v1/projects" || path === "/v1/sessions" || path === "/v1/packages") {
      if (!contentType.startsWith("application/json")) {
        sendJson(res, 415, { error: "unsupported_media_type" });
        return;
      }
      const read = await readBody(req, limits.maxJsonBodyBytes);
      if (!read.ok) {
        throw new IngestionError(
          "PAYLOAD_TOO_LARGE",
          `request body exceeds the ${limits.maxJsonBodyBytes} byte JSON limit`,
        );
      }
      const payload = readJson(read.body);
      const response =
        path === "/v1/projects"
          ? createProject(handlerDeps, payload)
          : path === "/v1/sessions"
            ? createSession(handlerDeps, payload)
            : registerPackage(handlerDeps, payload);
      sendResponse(res, response);
      return;
    }

    // Single-resource endpoints
    if (routeSegments.length === 2 && routeSegments[0] === "projects") {
      sendResponse(res, getProject(handlerDeps, routeSegments[1] ?? ""));
      return;
    }
    if (routeSegments.length === 2 && routeSegments[0] === "sessions") {
      const sessionId = routeSegments[1] ?? "";
      if (method === "GET") {
        sendResponse(res, getSession(handlerDeps, sessionId));
        return;
      }
      if (!contentType.startsWith("application/json")) {
        sendJson(res, 415, { error: "unsupported_media_type" });
        return;
      }
      const read = await readBody(req, limits.maxJsonBodyBytes);
      if (!read.ok) {
        throw new IngestionError(
          "PAYLOAD_TOO_LARGE",
          `request body exceeds the ${limits.maxJsonBodyBytes} byte JSON limit`,
        );
      }
      sendResponse(res, updateSession(handlerDeps, sessionId, readJson(read.body)));
      return;
    }

    // Upload endpoint (multipart: envelope part + payload part)
    if (path === "/v1/uploads") {
      if (!contentType.startsWith("multipart/form-data")) {
        sendJson(res, 415, { error: "unsupported_media_type" });
        return;
      }
      const read = await readBody(req, limits.maxUploadBytes + MULTIPART_OVERHEAD_BYTES);
      if (!read.ok) {
        throw new IngestionError(
          "PAYLOAD_TOO_LARGE",
          `upload exceeds the ${limits.maxUploadBytes} byte payload limit`,
        );
      }
      const parsed = parseMultipart(read.body, contentType);
      if (!parsed.ok) {
        throw new IngestionError("VALIDATION_FAILED", parsed.error, {
          details: { multipart: parsed.error },
        });
      }
      const requestParts = parsed.parts.filter((part) => part.name === "request");
      const payloadParts = parsed.parts.filter((part) => part.name === "payload");
      const otherParts = parsed.parts.filter(
        (part) => part.name !== "request" && part.name !== "payload",
      );
      const requestPart = requestParts[0];
      const payloadPart = payloadParts[0];
      if (
        requestPart === undefined ||
        payloadPart === undefined ||
        requestParts.length > 1 ||
        payloadParts.length > 1 ||
        otherParts.length > 0
      ) {
        throw new IngestionError(
          "VALIDATION_FAILED",
          "upload must carry exactly one 'request' part and one 'payload' part",
          {
            details: {
              requestParts: requestParts.length,
              payloadParts: payloadParts.length,
              otherParts: otherParts.length,
            },
          },
        );
      }
      if (!(requestPart.contentType ?? "").toLowerCase().startsWith("application/json")) {
        throw new IngestionError(
          "VALIDATION_FAILED",
          "the 'request' part must declare content type application/json",
        );
      }
      const envelope = readJson(requestPart.data);
      sendResponse(res, uploadAsset(handlerDeps, envelope, payloadPart.data));
      return;
    }

    // Asset evidence read (sessions/:id/assets/:assetId)
    if (routeSegments.length === 4 && routeSegments[0] === "sessions" && routeSegments[2] === "assets") {
      sendResponse(
        res,
        getAssetEvidence(handlerDeps, routeSegments[1] ?? "", routeSegments[3] ?? ""),
      );
      return;
    }

    sendJson(res, 404, { error: "not_found", path });
  } catch (error) {
    if (error instanceof IngestionError) {
      sendJson(res, error.status, error.envelope);
      return;
    }
    deps.logger.error("ingestion.internal_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    sendJson(res, 500, serverErrorSyncError());
  }
}
