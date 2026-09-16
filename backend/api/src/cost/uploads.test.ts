/**
 * PROD-013 — the upload-limit tests (uploads.ts).
 *
 * Proves the UPLOAD CAP CONTRACT:
 *
 *   - CONFIG: parseUploadCap — unset → the documented 10 MiB default;
 *     present values must be an integer in 1..1 GiB; malformed values are
 *     typed issues naming the variable (never the value) and the fallback
 *     helper degrades to the default;
 *   - THE ROUTE SET: exactly the previously-UNCAPPED ingestion surfaces
 *     (capture assets, capture sync, the BOQ import upload) — the artifacts
 *     surface deliberately keeps its OWN AISE_ARTIFACT_MAX_BYTES cap;
 *   - BEFORE-BUFFERING enforcement:
 *       1. a content-length precheck refuses an over-cap upload WITHOUT
 *          READING A SINGLE BODY BYTE (the spy stream is never pulled);
 *       2. without a usable content-length the body is streamed
 *          incrementally and ABORTED at the first chunk that crosses the
 *          cap — the remaining chunks are never pulled, the stream is
 *          cancelled, the buffered prefix is discarded;
 *       3. an under-cap body is rebuilt with identical bytes (method and
 *          headers preserved) for the routing core;
 *   - the typed 413 uses the EXISTING stable error envelope with the
 *     artifacts surface's `payload_too_large` code (no new error shape);
 *   - a body that cannot be read is a typed 400 (never a throw).
 *
 * Determinism: pure parsing plus synthetic ReadableStreams that count every
 * pulled byte — no Fs, no network, no clock, no randomness.
 */

import { describe, expect, test } from "bun:test";
import {
  CAPPED_UPLOAD_ROUTES,
  enforceUploadCap,
  findCappedUploadRoute,
  matchesCappedUploadRoute,
  MAX_UPLOAD_BYTES_CEILING,
  MAX_UPLOAD_BYTES_DEFAULT,
  parseUploadCap,
  payloadTooLargeResponse,
  uploadCapOrDefault,
} from "./uploads";

/* ------------------------------------------------------------------ */
/* Spy streams (count every pulled byte; record cancellation)          */
/* ------------------------------------------------------------------ */

interface StreamSpy {
  readonly stream: ReadableStream<Uint8Array>;
  bytesPulled(): number;
  isCancelled(): boolean;
}

/** A body of `chunkTexts` string chunks, delivered one pull at a time. */
function spyStream(chunkTexts: string[], failAtChunk?: number): StreamSpy {
  const chunks = chunkTexts.map((text) => new TextEncoder().encode(text));
  let pulled = 0;
  let bytes = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunks.length) {
        controller.close();
        return;
      }
      if (failAtChunk !== undefined && pulled === failAtChunk) {
        controller.error(new Error("synthetic body read failure"));
        return;
      }
      const chunk = chunks[pulled]!;
      pulled += 1;
      bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    stream,
    bytesPulled: (): number => bytes,
    isCancelled: (): boolean => cancelled,
  };
}

function post(
  path: string,
  options: {
    headers?: Record<string, string>;
    /** (56-c typecheck fix: `BodyInit` is not a global under lib ES2022 —
     * spell the exact union the tests actually use: spy streams + strings.) */
    body?: ReadableStream<Uint8Array> | string;
  } = {},
): Request {
  return new Request(`https://api.aise.example${path}`, {
    method: "POST",
    headers: { "x-request-id": `up-${path.replace(/[^a-z0-9]/gi, "-")}`.slice(0, 32), ...(options.headers ?? {}) },
    ...(options.body === undefined ? {} : { body: options.body }),
  });
}

/* ------------------------------------------------------------------ */
/* Configuration                                                        */
/* ------------------------------------------------------------------ */

describe("parseUploadCap + uploadCapOrDefault", () => {
  test("unset → the documented 10 MiB conservative default", () => {
    expect(parseUploadCap(undefined)).toEqual({ ok: true, maxBytes: 10_485_760 });
    expect(MAX_UPLOAD_BYTES_DEFAULT).toBe(10 * 1024 * 1024);
    expect(MAX_UPLOAD_BYTES_CEILING).toBe(1024 * 1024 * 1024);
  });

  test("valid integer byte counts are honored", () => {
    expect(parseUploadCap("1")).toEqual({ ok: true, maxBytes: 1 });
    expect(parseUploadCap("1048576")).toEqual({ ok: true, maxBytes: 1_048_576 });
    expect(parseUploadCap("1073741824")).toEqual({ ok: true, maxBytes: 1_073_741_824 });
  });

  test("malformed or out-of-range values are typed issues naming the variable and range", () => {
    const ISSUE =
      "AISE_MAX_UPLOAD_BYTES: expected an integer number of bytes between 1 and 1073741824";
    for (const bad of ["banana", "", "  ", "0", "-1", "2.5", "10MB", "1073741825"]) {
      const parsed = parseUploadCap(bad);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        // The issue is the fixed documented CONSTANT — by construction it
        // cannot echo the submitted value (no interpolation exists).
        expect(parsed.issue).toBe(ISSUE);
      }
      // The fallback helper degrades to the documented default.
      expect(uploadCapOrDefault(bad)).toBe(10_485_760);
    }
    // The never-echo property, asserted where it is NON-VACUOUS (56-c fix:
    // 56-b's blanket `not.toContain(bad.trim())` failed for "" — every
    // string contains the empty string — and for "0", which the constant's
    // own range text "1073741824" contains). These distinctive values are
    // not substrings of the constant, so their absence proves no echo.
    for (const distinctive of ["banana", "2.5", "10MB", "-1", "1073741825"]) {
      const parsed = parseUploadCap(distinctive);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.issue).not.toContain(distinctive);
      }
    }
  });

  test("uploadCapOrDefault: unset → default, valid → the configured cap", () => {
    expect(uploadCapOrDefault(undefined)).toBe(10_485_760);
    expect(uploadCapOrDefault("2048")).toBe(2048);
  });
});

/* ------------------------------------------------------------------ */
/* The capped route set                                                 */
/* ------------------------------------------------------------------ */

describe("CAPPED_UPLOAD_ROUTES — exactly the previously-uncapped surfaces", () => {
  test("the stable route set (artifacts deliberately absent: its own cap governs it)", () => {
    expect(CAPPED_UPLOAD_ROUTES.map((route) => route.id)).toEqual([
      "capture-assets",
      "capture-sync",
      "boq-import",
    ]);
  });

  test("the capped POSTs match; reads, derived compute and artifacts never do", () => {
    const matched: readonly (readonly [string, string])[] = [
      ["/v1/capture/assets", "capture-assets"],
      ["/v1/capture/assets/sha256-abc", "capture-assets"],
      ["/v1/capture/sync", "capture-sync"],
      ["/v1/boq/imports", "boq-import"],
    ];
    for (const [path, id] of matched) {
      expect(findCappedUploadRoute("POST", path)?.id ?? null).toBe(id);
    }
    // The BOQ derived-compute routes carry small JSON bodies, not uploads.
    expect(findCappedUploadRoute("POST", "/v1/boq/imports/bqm-1/normalization")).toBeNull();
    // The artifacts surface keeps its OWN AISE_ARTIFACT_MAX_BYTES cap.
    expect(findCappedUploadRoute("POST", "/v1/artifacts")).toBeNull();
    expect(findCappedUploadRoute("GET", "/v1/capture/assets/x")).toBeNull();
    // Boundary discipline.
    expect(matchesCappedUploadRoute(CAPPED_UPLOAD_ROUTES[0]!, "POST", "/v1/capture/assetsx")).toBe(false);
    expect(matchesCappedUploadRoute(CAPPED_UPLOAD_ROUTES[1]!, "POST", "/v1/capture/sync/x")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The typed 413 envelope                                               */
/* ------------------------------------------------------------------ */

describe("payloadTooLargeResponse — the stable envelope, artifacts' code", () => {
  test("content-length form: names the cap and the variable, never body content", async () => {
    const response = payloadTooLargeResponse("req-413a", 1024, null);
    expect(response.status).toBe(413);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-request-id")).toBe("req-413a");
    expect(await response.json()).toEqual({
      error: {
        code: "payload_too_large",
        message:
          "The request body exceeds the configured upload cap of 1024 bytes " +
          "(AISE_MAX_UPLOAD_BYTES) — the request's content-length exceeds the cap. " +
          "Large uploads are bounded and rejected, never truncated.",
        requestId: "req-413a",
      },
    });
  });

  test("streamed form: reports at least how many bytes were read before the refusal", async () => {
    const response = payloadTooLargeResponse("req-413b", 512, 513);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("at least 513 bytes were read before the refusal");
  });
});

/* ------------------------------------------------------------------ */
/* Enforcement                                                          */
/* ------------------------------------------------------------------ */

describe("enforceUploadCap", () => {
  test("non-matching routes pass through as the SAME Request object", async () => {
    const req = post("/v1/cases", { body: '{"ok":1}' });
    const outcome = await enforceUploadCap(req, 10, "req-p1");
    expect(outcome).toEqual({ kind: "pass", request: req });
  });

  test("matching route with NO body: pass-through of the same object", async () => {
    const req = post("/v1/capture/sync");
    const outcome = await enforceUploadCap(req, 10, "req-p2");
    expect(outcome).toEqual({ kind: "pass", request: req });
  });

  test("content-length precheck refuses WITHOUT reading a single body byte", async () => {
    const spy = spyStream(["abcdefghij", "never-read"]);
    const req = post("/v1/capture/sync", {
      headers: { "content-length": "999999" },
      body: spy.stream,
    });
    const outcome = await enforceUploadCap(req, 100, "req-c1");
    expect(outcome.kind).toBe("response");
    if (outcome.kind === "response") {
      expect(outcome.response.status).toBe(413);
      const body = (await outcome.response.json()) as { error: { code: string; requestId: string } };
      expect(body.error.code).toBe("payload_too_large");
      expect(body.error.requestId).toBe("req-c1");
    }
    // THE decisive property (56-c, after the source-cancel fix): the body
    // was never pulled — ZERO bytes buffered — and the inbound stream was
    // CANCELLED at the source (the refused upload is stopped mid-flight,
    // never drained by the platform).
    expect(spy.bytesPulled()).toBe(0);
    expect(spy.isCancelled()).toBe(true);
  });

  test("content-length exactly at the cap is NOT refused (the cap is inclusive)", async () => {
    const spy = spyStream(["abcdefghij"]);
    const req = post("/v1/capture/sync", {
      headers: { "content-length": "10" },
      body: spy.stream,
    });
    const outcome = await enforceUploadCap(req, 10, "req-c2");
    expect(outcome.kind).toBe("pass");
    expect(spy.bytesPulled()).toBe(10);
  });

  test("a lying/absent content-length is caught by the INCREMENTAL stream read", async () => {
    // 20 chunks of 4 bytes; the cap is 10 — the read stops at the FIRST
    // chunk that crosses the cap (12 bytes read), the rest are never
    // pulled, and the stream is cancelled at the source.
    const spy = spyStream(Array.from({ length: 20 }, () => "abcd"));
    const req = post("/v1/capture/assets/sha256-abc", { body: spy.stream });
    const outcome = await enforceUploadCap(req, 10, "req-c3");
    expect(outcome.kind).toBe("response");
    if (outcome.kind === "response") {
      expect(outcome.response.status).toBe(413);
      const body = (await outcome.response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("payload_too_large");
      expect(body.error.message).toContain("at least 12 bytes were read before the refusal");
      expect(body.error.message).toContain("cap of 10 bytes");
    }
    expect(spy.bytesPulled()).toBe(12); // 4 + 4 + 4 — then aborted
    expect(spy.isCancelled()).toBe(true);
  });

  test("an under-cap body is REBUILT with identical bytes, method and headers", async () => {
    const spy = spyStream(["abcd", "efgh", "ijkl"]);
    const req = post("/v1/boq/imports", {
      headers: { "content-type": "application/octet-stream", "x-request-id": "req-c4" },
      body: spy.stream,
    });
    const outcome = await enforceUploadCap(req, 100, "req-c4");
    expect(outcome.kind).toBe("pass");
    if (outcome.kind === "pass") {
      expect(outcome.request).not.toBe(req); // rebuilt, not the consumed original
      expect(outcome.request.method).toBe("POST");
      expect(outcome.request.headers.get("content-type")).toBe("application/octet-stream");
      expect(outcome.request.headers.get("x-request-id")).toBe("req-c4");
      expect(await outcome.request.text()).toBe("abcdefghijkl");
    }
    expect(spy.bytesPulled()).toBe(12);
  });

  test("a body that cannot be read is a typed 400 (never a throw)", async () => {
    const spy = spyStream(["fine", "boom"], 1); // fails on the SECOND chunk
    const req = post("/v1/capture/sync", { body: spy.stream });
    const outcome = await enforceUploadCap(req, 100, "req-c5");
    expect(outcome.kind).toBe("response");
    if (outcome.kind === "response") {
      expect(outcome.response.status).toBe(400);
      const body = (await outcome.response.json()) as { error: { code: string; requestId: string } };
      expect(body.error.code).toBe("invalid_body");
      expect(body.error.requestId).toBe("req-c5");
    }
  });

  test("the cap is enforced per capped route with the configured value", async () => {
    // The BOQ import surface (exact rule) with a content-length over a TIGHT cap.
    const spy = spyStream(["x".repeat(50)]);
    const req = post("/v1/boq/imports", {
      headers: { "content-length": "50" },
      body: spy.stream,
    });
    const outcome = await enforceUploadCap(req, 49, "req-c6");
    expect(outcome.kind).toBe("response");
    expect(spy.bytesPulled()).toBe(0);
  });
});
