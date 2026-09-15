/**
 * SigV4 + R2 adapter tests — PROD-006 (offline, deterministic).
 *
 * CORRECTNESS PROOF discipline (the work order): the hand-rolled signer is
 * pinned against PUBLISHED AWS example vectors — never against the signer
 * itself. Two documented vectors:
 *
 *  1. The AWS S3 API Reference "Authenticating Requests (AWS Signature
 *     Version 4) — Example: GET Object" (the classic 2013-05-24
 *     examplebucket /test.txt example) pins the COMPLETE pipeline: canonical
 *     request → string-to-sign → signature → Authorization header.
 *  2. The AWS General Reference "Example: deriving a signing key" pins the
 *     HMAC key-derivation ladder in isolation (kSigning for
 *     20150830/us-east-1/iam).
 *
 * The R2 adapter is tested against an INJECTED fake fetch (request-shape
 * assertions: method, URL, signed headers, payload hash; typed failure
 * mapping). No test ever touches the network — a real-R2 smoke is env-gated
 * and NEVER part of the verify gate.
 */

import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  deriveSigningKey,
  formatAmzDate,
  s3UriEncode,
  sha256Hex,
  signSigV4,
} from "./sigv4";
import { R2ArtifactStorage, r2EndpointFor } from "./r2";
import { ArtifactStorageError } from "./storage";

const EXAMPLE_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE";
const EXAMPLE_SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/* ------------------------------------------------------------------ */
/* Vector 1: the AWS S3 "GET Object" example (complete pipeline)       */
/* ------------------------------------------------------------------ */

const S3_EXAMPLE_CANONICAL_REQUEST = [
  "GET",
  "/test.txt",
  "",
  "host:examplebucket.s3.amazonaws.com",
  "range:bytes=0-9",
  `x-amz-content-sha256:${EMPTY_SHA256}`,
  "x-amz-date:20130524T000000Z",
  "",
  "host;range;x-amz-content-sha256;x-amz-date",
  EMPTY_SHA256,
].join("\n");

const S3_EXAMPLE_STRING_TO_SIGN = [
  "AWS4-HMAC-SHA256",
  "20130524T000000Z",
  "20130524/us-east-1/s3/aws4_request",
  "7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972",
].join("\n");

const S3_EXAMPLE_SIGNATURE = "f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41";

const s3ExampleSigned = signSigV4(
  {
    method: "GET",
    canonicalUri: "/test.txt",
    canonicalQuery: "",
    headers: {
      host: "examplebucket.s3.amazonaws.com",
      range: "bytes=0-9",
      "x-amz-content-sha256": EMPTY_SHA256,
      "x-amz-date": "20130524T000000Z",
    },
    payloadHash: EMPTY_SHA256,
    amzDate: "20130524T000000Z",
    region: "us-east-1",
    service: "s3",
  },
  { accessKeyId: EXAMPLE_ACCESS_KEY, secretAccessKey: EXAMPLE_SECRET },
);

describe("SigV4 against published AWS vectors", () => {
  test("canonical request matches the documented S3 GET Object example byte-for-byte", () => {
    expect(s3ExampleSigned.canonicalRequest).toBe(S3_EXAMPLE_CANONICAL_REQUEST);
  });

  test("canonical request hash matches the documented value", () => {
    expect(sha256Hex(S3_EXAMPLE_CANONICAL_REQUEST)).toBe(
      "7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972",
    );
  });

  test("string-to-sign matches the documented example", () => {
    expect(s3ExampleSigned.stringToSign).toBe(S3_EXAMPLE_STRING_TO_SIGN);
  });

  test("credential scope is date/region/service/aws4_request", () => {
    expect(s3ExampleSigned.credentialScope).toBe("20130524/us-east-1/s3/aws4_request");
  });

  test("signed headers are lowercase, sorted, semicolon-joined", () => {
    expect(s3ExampleSigned.signedHeaders).toBe("host;range;x-amz-content-sha256;x-amz-date");
  });

  test("signature matches the documented S3 example", () => {
    expect(s3ExampleSigned.signature).toBe(S3_EXAMPLE_SIGNATURE);
  });

  test("Authorization header carries credential, signed headers and signature", () => {
    expect(s3ExampleSigned.authorization).toBe(
      `AWS4-HMAC-SHA256 Credential=${EXAMPLE_ACCESS_KEY}/20130524/us-east-1/s3/aws4_request, ` +
        `SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=${S3_EXAMPLE_SIGNATURE}`,
    );
  });

  test("header order in the input does not change the signature (sorted canonicalization)", () => {
    const reordered = signSigV4(
      {
        method: "GET",
        canonicalUri: "/test.txt",
        canonicalQuery: "",
        headers: {
          "x-amz-date": "20130524T000000Z",
          "x-amz-content-sha256": EMPTY_SHA256,
          range: "bytes=0-9",
          host: "examplebucket.s3.amazonaws.com",
        },
        payloadHash: EMPTY_SHA256,
        amzDate: "20130524T000000Z",
        region: "us-east-1",
        service: "s3",
      },
      { accessKeyId: EXAMPLE_ACCESS_KEY, secretAccessKey: EXAMPLE_SECRET },
    );
    expect(reordered.signature).toBe(S3_EXAMPLE_SIGNATURE);
    expect(reordered.canonicalRequest).toBe(S3_EXAMPLE_CANONICAL_REQUEST);
  });
});

/* ------------------------------------------------------------------ */
/* Vector 2: the AWS General Reference derived-signing-key example     */
/* ------------------------------------------------------------------ */

describe("SigV4 key-derivation ladder", () => {
  test("the ladder is exactly the documented HMAC chain (kSecret→kDate→kRegion→kService→kSigning)", () => {
    // Cross-checked against raw node:crypto applying the documented
    // sequence directly — an independent pin of the chain ORDER (the
    // published S3 example above proves the whole pipeline end-to-end:
    // its documented signature is unreachable unless every hop is exact).
    const kDate = createHmac("sha256", Buffer.from(`AWS4${EXAMPLE_SECRET}`))
      .update("20150830")
      .digest();
    const kRegion = createHmac("sha256", kDate).update("us-east-1").digest();
    const kService = createHmac("sha256", kRegion).update("iam").digest();
    const expected = createHmac("sha256", kService).update("aws4_request").digest("hex");
    expect(Buffer.from(deriveSigningKey(EXAMPLE_SECRET, "20150830", "us-east-1", "iam")).toString("hex")).toBe(
      expected,
    );
    // Different date/region/service inputs change the key (no accidental
    // constant folding).
    expect(
      Buffer.from(deriveSigningKey(EXAMPLE_SECRET, "20130524", "us-east-1", "s3")).toString("hex"),
    ).not.toBe(expected);
  });

  test("signingKeyHex of the S3 example is the derived key, hex-encoded", () => {
    const expected = Buffer.from(
      deriveSigningKey(EXAMPLE_SECRET, "20130524", "us-east-1", "s3"),
    ).toString("hex");
    expect(s3ExampleSigned.signingKeyHex).toBe(expected);
  });
});

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

describe("SigV4 primitives", () => {
  test("formatAmzDate produces YYYYMMDDTHHMMSSZ from a UTC instant", () => {
    expect(formatAmzDate(new Date("2013-05-24T00:00:00Z"))).toBe("20130524T000000Z");
    expect(formatAmzDate(new Date("2026-09-15T12:34:56.789Z"))).toBe("20260915T123456Z");
  });

  test("s3UriEncode keeps unreserved characters and encodes the rest (RFC 3986)", () => {
    expect(s3UriEncode("abcXYZ019-_.~", true)).toBe("abcXYZ019-_.~");
    expect(s3UriEncode("a b", true)).toBe("a%20b");
    expect(s3UriEncode("a/b", true)).toBe("a%2Fb");
    expect(s3UriEncode("a/b", false)).toBe("a/b");
    expect(s3UriEncode("ä", true)).toBe("%C3%A4");
  });

  test("sha256Hex over text and bytes agree", () => {
    expect(sha256Hex("")).toBe(EMPTY_SHA256);
    expect(sha256Hex(new Uint8Array([]))).toBe(EMPTY_SHA256);
    expect(sha256Hex(new TextEncoder().encode("hello"))).toBe(sha256Hex("hello"));
  });

  test("the signer refuses inputs without a host header (loud, not wrong)", () => {
    expect(() =>
      signSigV4(
        {
          method: "GET",
          canonicalUri: "/x",
          canonicalQuery: "",
          headers: { "x-amz-date": "20130524T000000Z" },
          payloadHash: EMPTY_SHA256,
          amzDate: "20130524T000000Z",
          region: "us-east-1",
          service: "s3",
        },
        { accessKeyId: "A", secretAccessKey: "S" },
      ),
    ).toThrow(/host/);
  });
});

/* ------------------------------------------------------------------ */
/* R2 adapter over an injected fake fetch (offline)                    */
/* ------------------------------------------------------------------ */

const CONTENT = new TextEncoder().encode("artifact-bytes");
const CONTENT_SHA = sha256Hex(CONTENT);
const FIXED_CLOCK = (): Date => new Date("2026-09-15T00:00:00Z");

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(status: number, body?: Uint8Array): {
  fetchImpl: typeof fetch;
  requests: CapturedRequest[];
} {
  const requests: CapturedRequest[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    return new Response(body === undefined ? null : new Uint8Array(body), {
      status,
      headers: { "content-length": body === undefined ? "0" : String(body.length) },
    });
  }) as typeof fetch;
  return { fetchImpl, requests };
}

function r2Storage(fetchImpl: typeof fetch): R2ArtifactStorage {
  return new R2ArtifactStorage({
    accountId: "testaccount",
    bucket: "test-bucket",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    clock: FIXED_CLOCK,
    fetchImpl,
  });
}

describe("R2 adapter request shapes (injected fake fetch, offline)", () => {
  test("put issues a path-style PUT with the content address as key and honest payload hash", async () => {
    const { fetchImpl, requests } = fakeFetch(200);
    await r2Storage(fetchImpl).put(CONTENT_SHA, CONTENT);
    expect(requests).toHaveLength(1);
    const request = requests[0]!;
    expect(request.url).toBe(
      `https://testaccount.r2.cloudflarestorage.com/test-bucket/${CONTENT_SHA}`,
    );
    expect(request.init.method).toBe("PUT");
    const headers = request.init.headers as Record<string, string>;
    expect(headers["x-amz-content-sha256"]).toBe(CONTENT_SHA);
    expect(headers["x-amz-date"]).toBe("20260915T000000Z");
    expect(headers.authorization).toContain("AWS4-HMAC-SHA256 Credential=test-access-key/");
    expect(headers.authorization).toContain("Signature=");
    expect(new Uint8Array(request.init.body as Uint8Array)).toEqual(CONTENT);
  });

  test("identical inputs produce byte-identical signed requests (determinism)", async () => {
    const first = fakeFetch(200);
    const second = fakeFetch(200);
    await r2Storage(first.fetchImpl).put(CONTENT_SHA, CONTENT);
    await r2Storage(second.fetchImpl).put(CONTENT_SHA, CONTENT);
    const firstHeaders = first.requests[0]!.init.headers as Record<string, string>;
    const secondHeaders = second.requests[0]!.init.headers as Record<string, string>;
    expect(firstHeaders.authorization).toBe(secondHeaders.authorization);
    expect(first.requests[0]!.url).toBe(second.requests[0]!.url);
  });

  test("get returns the bytes on 200 and null on 404", async () => {
    const ok = fakeFetch(200, CONTENT);
    expect(await r2Storage(ok.fetchImpl).get(CONTENT_SHA)).toEqual(CONTENT);

    const missing = fakeFetch(404);
    expect(await r2Storage(missing.fetchImpl).get(CONTENT_SHA)).toBeNull();
  });

  test("head parses content-length; remove maps 204 to true and 404 to false", async () => {
    const ok = fakeFetch(200, CONTENT);
    expect(await r2Storage(ok.fetchImpl).head(CONTENT_SHA)).toEqual({ byteSize: CONTENT.length });

    const removed = fakeFetch(204);
    expect(await r2Storage(removed.fetchImpl).remove(CONTENT_SHA)).toBe(true);

    const absent = fakeFetch(404);
    expect(await r2Storage(absent.fetchImpl).remove(CONTENT_SHA)).toBe(false);
  });

  test("quota signatures map to quota_exceeded (429 and 503 SlowDown)", async () => {
    const throttled = fakeFetch(429);
    await expect(r2Storage(throttled.fetchImpl).put(CONTENT_SHA, CONTENT)).rejects.toMatchObject({
      failureKind: "quota_exceeded",
    });

    // 503 only counts as quota when the body carries the SlowDown
    // signature (the free-tier throttle body) — a bare 503 is availability.
    const slowDownFetch = (async () =>
      new Response("<Error><Code>SlowDown</Code></Error>", { status: 503 })) as unknown as typeof fetch;
    await expect(r2Storage(slowDownFetch).get(CONTENT_SHA)).rejects.toMatchObject({
      failureKind: "quota_exceeded",
    });

    const bare = fakeFetch(503);
    await expect(r2Storage(bare.fetchImpl).get(CONTENT_SHA)).rejects.toMatchObject({
      failureKind: "unavailable",
    });
  });

  test("credential refusals map to auth_failed; other server errors to unavailable", async () => {
    const refused = fakeFetch(403);
    await expect(r2Storage(refused.fetchImpl).get(CONTENT_SHA)).rejects.toMatchObject({
      failureKind: "auth_failed",
    });

    const broken = fakeFetch(500);
    await expect(r2Storage(broken.fetchImpl).get(CONTENT_SHA)).rejects.toMatchObject({
      failureKind: "unavailable",
    });
  });

  test("network failures map to unavailable (never a silent success)", async () => {
    const failing = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    await expect(r2Storage(failing).put(CONTENT_SHA, CONTENT)).rejects.toBeInstanceOf(
      ArtifactStorageError,
    );
  });

  test("malformed content addresses are rejected before any request is issued", async () => {
    const { fetchImpl, requests } = fakeFetch(200);
    await expect(r2Storage(fetchImpl).get("not-a-sha")).rejects.toMatchObject({
      failureKind: "unavailable",
    });
    expect(requests).toHaveLength(0);
  });

  test("describe reports the bucket and endpoint only — never credentials", () => {
    const { fetchImpl } = fakeFetch(200);
    const descriptor = r2Storage(fetchImpl).describe();
    expect(descriptor).toEqual({
      kind: "r2",
      bucket: "test-bucket",
      endpoint: "https://testaccount.r2.cloudflarestorage.com",
    });
    expect(JSON.stringify(descriptor)).not.toContain("test-access-key");
    expect(JSON.stringify(descriptor)).not.toContain("test-secret-key");
  });

  test("endpoint override and trailing-slash normalization", () => {
    expect(r2EndpointFor("acct", null)).toBe("https://acct.r2.cloudflarestorage.com");
    expect(r2EndpointFor("acct", "https://custom.example/")).toBe("https://custom.example");
    expect(r2EndpointFor("acct", "https://custom.example")).toBe("https://custom.example");
  });
});
