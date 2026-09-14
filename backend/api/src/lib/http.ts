/**
 * Shared HTTP response helpers for the AISE backend API.
 *
 * Contract (AISE-001, extracted for AISE-004):
 * - EVERY response is JSON with an `x-request-id` correlation header — the
 *   request's own `x-request-id` when provided, otherwise a generated UUID
 *   (decided once in `createRequestHandler`, passed down as `requestId`);
 * - `jsonResponse` serializes a plain response body object;
 * - `jsonTextResponse` emits an ALREADY-SERIALIZED JSON document verbatim —
 *   used by the capture gateway to return canonical-JSON contract envelopes
 *   (e.g. `SyncAck`) byte-for-byte as produced by the shared codecs;
 * - `methodNotAllowed` centralizes 405 responses with an explicit `allow`.
 *
 * No routing, no domain logic — pure response construction.
 */

export function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  requestId: string,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": requestId,
      ...extraHeaders,
    },
  });
}

/**
 * Respond with a pre-serialized JSON text unchanged (canonical contract
 * documents keep their deterministic byte form, including any trailing
 * newline produced by the codec's canonical JSON encoder).
 */
export function jsonTextResponse(
  status: number,
  bodyText: string,
  requestId: string,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(bodyText, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": requestId,
      ...extraHeaders,
    },
  });
}

export function methodNotAllowed(requestId: string, allow: string): Response {
  return jsonResponse(
    405,
    { ok: false, error: "method_not_allowed" },
    requestId,
    { allow },
  );
}
