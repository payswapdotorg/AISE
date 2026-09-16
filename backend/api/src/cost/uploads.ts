/**
 * Upload limits — PROD-013 (cost guards / operational safety).
 *
 * The audit this module closes: BEFORE PROD-013, only the ARTIFACTS
 * ingestion had a body-size cap (AISE_ARTIFACT_MAX_BYTES, 25 MiB default —
 * verified, documented and tested by PROD-006). The capture surface
 * (`POST /v1/capture/assets/:contentId` — raw bytes, whole-body
 * `arrayBuffer()`) and the BOQ import surface (`POST /v1/boq/imports` —
 * whole-body `arrayBuffer()` before XLSX/ZIP parsing) and the capture sync
 * batch (`POST /v1/capture/sync` — whole-body `text()` before JSON
 * parsing) buffered ARBITRARY-SIZED bodies before any limit ran. On a
 * free-tier deployment that is a silent cost/availability hazard: one
 * huge upload buffers the entire payload in function memory.
 *
 * This module enforces ONE configurable cap (`AISE_MAX_UPLOAD_BYTES`,
 * conservative default 10 MiB = 10,485,760 bytes, overridable) over the
 * UNCAPPED ingestion routes, BEFORE the body is buffered:
 *
 *   1. a `content-length` precheck rejects an over-cap upload with the
 *      typed 413 stable error envelope WITHOUT READING A SINGLE BODY BYTE
 *      (the inbound stream is cancelled at the source — the refused body
 *      is never buffered or drained);
 *   2. when content-length is absent or lying (chunked/streamed bodies),
 *      the stream is read INCREMENTALLY and aborted the moment the cap is
 *      exceeded — at most `cap + 1` bytes are ever read, never the whole
 *      body; the request is then rebuilt with the buffered bytes when it
 *      fits (the same rebuild discipline the auth layer uses for JSON
 *      bodies — the core sees identical bytes).
 *
 * DELIBERATE SCOPE DECISION (documented in docs/COST-GUARDS.md):
 * `POST /v1/artifacts` keeps its OWN dedicated cap (AISE_ARTIFACT_MAX_BYTES)
 * — applying the global upload cap on top would silently lower the
 * documented artifact allowance (25 MiB) to the global default (10 MiB);
 * the artifacts cap is verified and tested where it lives (PROD-006's
 * surface), and this guard covers exactly the routes that had none.
 *
 * The 413 reuses the artifacts surface's stable code `payload_too_large`
 * (same meaning, same envelope — no new error shape) and names the
 * variable + the caps in the message (never any body content).
 *
 * Determinism: pure parsing plus streaming over the request's own body; no
 * clock, no randomness, no secrets.
 */

import { errorResponse } from "../runtime/errors";

/** Default upload cap: 10 MiB (the conservative free-tier posture). */
export const MAX_UPLOAD_BYTES_DEFAULT = 10 * 1024 * 1024;
/** Sanity ceiling for AISE_MAX_UPLOAD_BYTES (a cap above 1 GiB is junk). */
export const MAX_UPLOAD_BYTES_CEILING = 1024 * 1024 * 1024;

export type UploadCapParseResult =
  | { readonly ok: true; readonly maxBytes: number }
  | { readonly ok: false; readonly issue: string };

/**
 * Parse AISE_MAX_UPLOAD_BYTES. Unset → the documented default. Present
 * values must be an integer between 1 and the ceiling; the issue string
 * names the variable and the expectation, never anything else. Mirrors
 * tools/env-schema.ts's PROD-013 rule exactly.
 */
export function parseUploadCap(raw: string | undefined): UploadCapParseResult {
  if (raw === undefined) {
    return { ok: true, maxBytes: MAX_UPLOAD_BYTES_DEFAULT };
  }
  if (!/^\d+$/.test(raw)) {
    return {
      ok: false,
      issue: "AISE_MAX_UPLOAD_BYTES: expected an integer number of bytes between 1 and 1073741824",
    };
  }
  const value = Number.parseInt(raw, 10);
  if (value < 1 || value > MAX_UPLOAD_BYTES_CEILING) {
    return {
      ok: false,
      issue: "AISE_MAX_UPLOAD_BYTES: expected an integer number of bytes between 1 and 1073741824",
    };
  }
  return { ok: true, maxBytes: value };
}

/** The parsed cap, falling back to the documented default on a malformed value. */
export function uploadCapOrDefault(raw: string | undefined): number {
  const parsed = parseUploadCap(raw);
  return parsed.ok ? parsed.maxBytes : MAX_UPLOAD_BYTES_DEFAULT;
}

/* ------------------------------------------------------------------ */
/* The capped route set (data, not logic)                               */
/* ------------------------------------------------------------------ */

/** One capped body-carrying route: a method + an exact path or prefix. */
export interface CappedUploadRoute {
  readonly id: string;
  readonly method: "POST";
  readonly path: string;
  readonly prefix: boolean;
}

/**
 * The routes this guard caps (see the module header): the ingestion
 * surfaces that had NO cap before PROD-013. Artifacts is deliberately
 * absent (its own AISE_ARTIFACT_MAX_BYTES governs it — see the header).
 */
export const CAPPED_UPLOAD_ROUTES: readonly CappedUploadRoute[] = [
  // POST /v1/capture/assets/:contentId — raw content-addressed upload.
  { id: "capture-assets", method: "POST", path: "/v1/capture/assets", prefix: true },
  // POST /v1/capture/sync — the SyncBatch JSON document.
  { id: "capture-sync", method: "POST", path: "/v1/capture/sync", prefix: false },
  // POST /v1/boq/imports — the BOQ source upload (exact: the derived
  // compute POSTs under …/:id/* carry small JSON bodies, not uploads).
  { id: "boq-import", method: "POST", path: "/v1/boq/imports", prefix: false },
] as const;

/** Does a (method, pathname) pair match a capped route? */
export function matchesCappedUploadRoute(
  route: CappedUploadRoute,
  method: string,
  pathname: string,
): boolean {
  if (method.toUpperCase() !== route.method) {
    return false;
  }
  if (route.prefix) {
    return pathname === route.path || pathname.startsWith(`${route.path}/`);
  }
  return pathname === route.path;
}

/** The first capped route matching (method, pathname), or null. */
export function findCappedUploadRoute(
  method: string,
  pathname: string,
): CappedUploadRoute | null {
  for (const route of CAPPED_UPLOAD_ROUTES) {
    if (matchesCappedUploadRoute(route, method, pathname)) {
      return route;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The guard                                                            */
/* ------------------------------------------------------------------ */

/** What the guard decided for one request. */
export type UploadCapOutcome =
  /** Pass this (possibly rebuilt) request to the next pipeline stage. */
  | { readonly kind: "pass"; readonly request: Request }
  /** Serve this 413 response (stable envelope, zero body bytes read past the cap). */
  | { readonly kind: "response"; readonly response: Response };

/** Build the typed 413 in the stable envelope (same code as artifacts). */
export function payloadTooLargeResponse(
  requestId: string,
  maxBytes: number,
  seenBytes: number | null,
): Response {
  const seen =
    seenBytes === null
      ? "the request's content-length exceeds the cap"
      : `at least ${seenBytes} bytes were read before the refusal`;
  return errorResponse(
    413,
    "payload_too_large",
    `The request body exceeds the configured upload cap of ${maxBytes} bytes ` +
      `(AISE_MAX_UPLOAD_BYTES) — ${seen}. Large uploads are bounded and rejected, never truncated.`,
    requestId,
  );
}

/** Read a content-length as a non-negative integer, or null when unusable. */
function contentLengthOf(request: Request): number | null {
  const raw = request.headers.get("content-length");
  if (raw === null) {
    return null;
  }
  if (!/^\d+$/.test(raw.trim())) {
    return null;
  }
  return Number.parseInt(raw.trim(), 10);
}

/**
 * Enforce the upload cap over the capped routes. For every other request
 * this is a zero-overhead pass-through returning the SAME request object.
 * NEVER throws: body-stream read errors propagate as a typed 400 (a body
 * that cannot be read cannot be an upload we want).
 */
export async function enforceUploadCap(
  request: Request,
  maxBytes: number,
  requestId: string,
): Promise<UploadCapOutcome> {
  const url = new URL(request.url);
  const route = findCappedUploadRoute(request.method, url.pathname);
  if (route === null) {
    return { kind: "pass", request };
  }

  // 1. The content-length precheck: reject WITHOUT reading any body byte.
  const declared = contentLengthOf(request);
  if (declared !== null && declared > maxBytes) {
    // Cancel the inbound body AT THE SOURCE (56-c fix, verified against the
    // Bun runtime): a refused upload must not linger on the connection —
    // the platform would otherwise buffer/drain the client's stream after
    // the 413 is served. `cancel()` marks the stream cancelled BEFORE any
    // body byte is read, so the refusal still costs zero buffered bytes
    // (the runtime's own one-time eager first-chunk pull of a constructed
    // Request body is prevented by the same synchronous cancel).
    await request.body?.cancel().catch(() => undefined);
    return {
      kind: "response",
      response: payloadTooLargeResponse(requestId, maxBytes, null),
    };
  }

  // 2. No body (or already-consumed) → pass through untouched.
  if (request.body === null) {
    return { kind: "pass", request };
  }

  // 3. Stream the body incrementally: at most cap+1 bytes are ever read.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.byteLength;
      if (received > maxBytes) {
        // Stop the upload at the source; the buffered prefix is discarded.
        await reader.cancel().catch(() => undefined);
        return {
          kind: "response",
          response: payloadTooLargeResponse(requestId, maxBytes, received),
        };
      }
      chunks.push(value);
    }
  } catch (error) {
    // A body that cannot be streamed cannot be accepted — typed 400, the
    // same shape the core's own body readers produce for junk.
    const reason = error instanceof Error ? error.message : String(error);
    return {
      kind: "response",
      response: errorResponse(
        400,
        "invalid_body",
        `The request body could not be read (${reason}).`,
        requestId,
      ),
    };
  }

  // 4. Rebuild the request with the buffered bytes (the auth layer's
  //    rebuild discipline: method + headers preserved, identical bytes).
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const rebuilt = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  });
  return { kind: "pass", request: rebuilt };
}
