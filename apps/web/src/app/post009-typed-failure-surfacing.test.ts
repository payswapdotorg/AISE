/**
 * POST-009 — typed-failure surfacing (the adversarial-upload finding,
 * 2026-09-29): an 11 MB upload was refused with HTTP 413 and the UI rendered
 * only "/v1/capture/assets/<id> answered HTTP 413" — while the server's body
 * carried the STANDARD error envelope { error: { code, message, requestId } }
 * with the actionable reason ("payload_too_large … exceeds the configured
 * upload cap …").
 *
 * Two defects, both fixed and asserted here:
 *  1. captureRejection (via uploadCaptureAssetLive) read `error` only as a
 *     STRING; the API's standard envelope carries it as an OBJECT — the code
 *     and message were dropped. It now reads error.code (and falls back to
 *     error.message for the reason when no top-level detail exists).
 *  2. describeApiFailure returned ONLY the detail line whenever `code` was
 *     undefined — silently dropping a present `reason`. A reason without a
 *     code now renders as "detail: reason"; the code+reason format is
 *     unchanged.
 */
import { describe, expect, test } from "bun:test";
import { describeApiFailure, uploadCaptureAssetLive, type FetchLike } from "./api";

const CONTENT_ID = "cec2e31bdb4d010af87c1e82ca7ebf9a2344d5be0b1e89b1319288e74eea839d";
const CAP_MESSAGE =
  "The request body exceeds the configured upload cap of 10485760 bytes " +
  "(AISE_MAX_UPLOAD_BYTES) — at least 11534336 bytes were read before the refusal. " +
  "Large uploads are bounded and rejected, never truncated.";

describe("POST-009 describeApiFailure (a reason is never dropped)", () => {
  test("code + reason keep the established format", () => {
    expect(
      describeApiFailure({
        kind: "http",
        status: 422,
        detail: "/x answered HTTP 422",
        code: "duplicate_node_ref",
        reason: "the id is already live",
      }),
    ).toBe("/x answered HTTP 422 — duplicate_node_ref: the id is already live");
  });

  test("a reason WITHOUT a code still states why (was: dropped entirely)", () => {
    expect(
      describeApiFailure({
        kind: "http",
        status: 413,
        detail: "/v1/capture/assets/x answered HTTP 413",
        reason: CAP_MESSAGE,
      }),
    ).toBe(`/v1/capture/assets/x answered HTTP 413: ${CAP_MESSAGE}`);
  });

  test("neither code nor reason renders the bare detail (unchanged)", () => {
    expect(describeApiFailure({ kind: "http", status: 502, detail: "/x answered HTTP 502" })).toBe(
      "/x answered HTTP 502",
    );
  });
});

describe("POST-009 uploadCaptureAssetLive (the standard OBJECT error envelope surfaces)", () => {
  const digest = async (): Promise<string> => CONTENT_ID;

  test("a 413 payload_too_large envelope carries its code and reason into the failure", async () => {
    const fetchStub: FetchLike = async () =>
      new Response(
        JSON.stringify({
          error: { code: "payload_too_large", message: CAP_MESSAGE, requestId: "r-stress-413" },
        }),
        { status: 413, headers: { "content-type": "application/json" } },
      );
    const result = await uploadCaptureAssetLive(fetchStub, digest, new Uint8Array([1, 2, 3]), "application/octet-stream");
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("unreachable");
    }
    expect(result.failure.kind).toBe("http");
    if (result.failure.kind !== "http") {
      throw new Error("unreachable");
    }
    expect(result.failure.status).toBe(413);
    expect(result.failure.code).toBe("payload_too_large");
    expect(result.failure.reason).toContain("upload cap of 10485760 bytes");
    const text = describeApiFailure(result.failure);
    expect(text).toContain("payload_too_large");
    expect(text).toContain("upload cap of 10485760 bytes");
    expect(text).toContain("HTTP 413");
  });

  test("the legacy {ok:false, reasonCode, reasonDetail} shape still surfaces (regression guard)", async () => {
    const fetchStub: FetchLike = async () =>
      new Response(
        JSON.stringify({ ok: false, reasonCode: "CONTENT_ID_MISMATCH", reasonDetail: "the declared id does not match the bytes" }),
        { status: 422, headers: { "content-type": "application/json" } },
      );
    const result = await uploadCaptureAssetLive(fetchStub, digest, new Uint8Array([4, 5]), "image/jpeg");
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("unreachable");
    }
    if (result.failure.kind !== "http") {
      throw new Error("unreachable");
    }
    expect(result.failure.code).toBe("CONTENT_ID_MISMATCH");
    expect(result.failure.reason).toBe("the declared id does not match the bytes");
    expect(describeApiFailure(result.failure)).toContain("CONTENT_ID_MISMATCH: the declared id does not match the bytes");
  });
});
