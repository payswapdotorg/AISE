/**
 * Capture ingestion HTTP surface (AISE-004) — the transport adapter for the
 * gateway policy engine (`capture/gateway.ts`).
 *
 * Contract (spec/work-orders.md §004; spec/architecture-lock.md — the gateway
 * stores and validates only, no reconstruction/readiness logic):
 *
 *   POST /v1/capture/assets/:contentId
 *       Raw-body upload of ONE content-addressed asset. The server computes
 *       sha-256 over the bytes; a mismatch with :contentId is rejected with
 *       CONTENT_ID_MISMATCH. The asset's media type is the request's
 *       Content-Type header (parameters stripped; absent →
 *       application/octet-stream). Idempotent: re-uploading identical bytes
 *       succeeds without duplication.
 *
 *   POST /v1/capture/sync
 *       Accepts a `SyncBatch` JSON document (family `sync`,
 *       @aise/shared-contracts), validated with `decodeSyncBatchStrict`,
 *       manifest-verified against the immutable content store, and applied
 *       idempotently to the session. Responds with an encoded `SyncAck`
 *       (canonical JSON produced by `SyncAckCodec`).
 *
 *   GET  /v1/capture/sessions/:sessionId
 *       Read-only projection of the stored session record: verbatim source
 *       envelope, accumulated asset list, append-only batch history and sync
 *       state.
 *
 * HTTP STATUS MAPPING — the single authoritative place for this translation
 * (AISE-004 requirement; do not duplicate it elsewhere):
 *
 *   SyncAck outcome ACCEPTED  -> 200 (SyncAck body)
 *   SyncAck outcome DUPLICATE -> 200 (SyncAck body)
 *   SyncAck outcome REJECTED  -> 422 (SyncAck body, reasonCode REQUIRED)
 *   bad_request results       -> 400 (plain error envelope; bodies that fail
 *                                    JSON parsing, fail the wire contract
 *                                    schema, or carry an unsupported contract
 *                                    version without ackable identity fields)
 *   asset-upload rejections   -> 422 (error envelope carrying the stable
 *                                    reason code CONTENT_ID_MISMATCH or
 *                                    CONTENT_COLLISION)
 *
 * Every response carries the `x-request-id` correlation header (see
 * `lib/http.ts`); wrong methods get 405 with an explicit `allow`; paths that
 * match no capture route return null so the server's default 404 applies.
 */

import {
  contentIdSchema,
  mediaTypeSchema,
  SyncAckCodec,
} from "@aise/shared-contracts";
import { jsonResponse, jsonTextResponse, methodNotAllowed } from "../lib/http";
import type { Logger } from "../lib/log";
import type { CaptureGateway } from "./gateway";

export interface CaptureRouteOptions {
  /** Capture ingestion gateway (policy engine over an injected store). */
  readonly gateway: CaptureGateway;
  /** Structured logger for domain-level request events. */
  readonly logger: Logger;
}

/** Outcome -> HTTP status for SyncAck-carrying responses (see module header). */
function syncAckStatus(outcome: "ACCEPTED" | "DUPLICATE" | "REJECTED"): 200 | 422 {
  return outcome === "REJECTED" ? 422 : 200;
}

/** Strip Content-Type parameters; default to application/octet-stream. */
function normalizeMediaType(header: string | null): string | null {
  if (header === null) {
    return "application/octet-stream";
  }
  const candidate = header.split(";")[0]?.trim() ?? "";
  return mediaTypeSchema.safeParse(candidate).success ? candidate : null;
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").filter((segment) => segment !== "");
}

/**
 * Route and answer one request against the capture surface. Returns null
 * when the path is not a capture route (the server then answers 404).
 */
export async function handleCaptureRequest(
  request: Request,
  url: URL,
  requestId: string,
  options: CaptureRouteOptions,
): Promise<Response | null> {
  const segments = pathSegments(url);
  if (segments[0] !== "v1" || segments[1] !== "capture") {
    return null;
  }
  const { gateway, logger } = options;

  /* POST /v1/capture/sync ------------------------------------------------ */

  if (segments.length === 3 && segments[2] === "sync") {
    if (request.method !== "POST") {
      return methodNotAllowed(requestId, "POST");
    }
    const rawBody = await request.text();
    const result = await gateway.ingestSyncBatch(rawBody);
    if (result.kind === "ack") {
      logger.info("capture_sync", {
        requestId,
        outcome: result.ack.outcome,
        batchId: result.ack.batchId,
        sessionId: result.sessionId,
        sequence: result.sequence,
        ...(result.ack.reasonCode === undefined ? {} : { reasonCode: result.ack.reasonCode }),
      });
      return jsonTextResponse(
        syncAckStatus(result.ack.outcome),
        SyncAckCodec.encode(result.ack),
        requestId,
      );
    }
    logger.warn("capture_sync_bad_request", {
      requestId,
      error: result.error,
    });
    return jsonResponse(
      400,
      {
        ok: false,
        error: result.error,
        detail: result.detail,
        ...(result.issues === undefined ? {} : { issues: result.issues }),
      },
      requestId,
    );
  }

  /* POST /v1/capture/assets/:contentId ---------------------------------- */

  if (segments.length === 4 && segments[2] === "assets") {
    if (request.method !== "POST") {
      return methodNotAllowed(requestId, "POST");
    }
    const contentId = segments[3] ?? "";
    if (!contentIdSchema.safeParse(contentId).success) {
      return jsonResponse(
        400,
        { ok: false, error: "invalid_content_id" },
        requestId,
      );
    }
    const mediaType = normalizeMediaType(request.headers.get("content-type"));
    if (mediaType === null) {
      return jsonResponse(400, { ok: false, error: "invalid_media_type" }, requestId);
    }
    const bytes = new Uint8Array(await request.arrayBuffer());
    const result = await gateway.ingestAsset(contentId, bytes, mediaType);
    if (result.kind === "rejected") {
      logger.warn("capture_asset_rejected", {
        requestId,
        contentId,
        reasonCode: result.reasonCode,
        byteSize: bytes.length,
      });
      return jsonResponse(
        422,
        { ok: false, reasonCode: result.reasonCode, reasonDetail: result.reasonDetail },
        requestId,
      );
    }
    logger.info("capture_asset", {
      requestId,
      contentId,
      byteSize: result.asset.byteSize,
      mediaType: result.asset.mediaType,
      outcome: result.kind === "stored" ? "STORED" : "DUPLICATE",
    });
    return jsonResponse(
      200,
      {
        ok: true,
        outcome: result.kind === "stored" ? "STORED" : "DUPLICATE",
        contentId: result.asset.contentId,
        byteSize: result.asset.byteSize,
        mediaType: result.asset.mediaType,
      },
      requestId,
    );
  }

  /* GET /v1/capture/sessions/:sessionId --------------------------------- */

  if (segments.length === 4 && segments[2] === "sessions") {
    if (request.method !== "GET") {
      return methodNotAllowed(requestId, "GET");
    }
    let sessionId: string;
    try {
      sessionId = decodeURIComponent(segments[3] ?? "");
    } catch {
      return jsonResponse(400, { ok: false, error: "invalid_session_id" }, requestId);
    }
    const session = await gateway.getSession(sessionId);
    if (session === null) {
      return jsonResponse(404, { ok: false, error: "session_not_found" }, requestId);
    }
    logger.info("capture_session_read", {
      requestId,
      sessionId,
      lastAcceptedSequence: session.lastAcceptedSequence,
    });
    return jsonResponse(200, { ok: true, session }, requestId);
  }

  // A /v1/capture/... path with no matching route shape falls through to the
  // server-wide 404.
  return null;
}
