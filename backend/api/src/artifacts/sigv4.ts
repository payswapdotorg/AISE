/**
 * Hand-rolled AWS Signature Version 4 signer — PROD-006.
 *
 * WHY HAND-ROLLED: the deployable API runs on BOTH Bun and Node serverless
 * runtimes with ZERO new heavy dependencies (the work order's rule; the
 * SigV4 algorithm is four HMAC-SHA256 hops plus one sha-256 — exactly the
 * `lib/hash` discipline). node:crypto's `createHash`/`createHmac` are
 * available on both runtimes and produce byte-identical digests.
 *
 * CORRECTNESS PROOF: the signer is tested against PUBLISHED AWS example
 * vectors (offline, deterministic — see sigv4.test.ts):
 *
 *  - the AWS S3 API Reference "Authenticating Requests (AWS Signature
 *    Version 4) — Example: GET Object" (the classic 2013-05-24
 *    examplebucket /test.txt example, whose documented signature is
 *    f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41),
 *    exercising the COMPLETE pipeline: canonical request → string-to-sign
 *    → derived signing key → signature → Authorization header;
 *  - the key-derivation ladder pinned IN ISOLATION against raw node:crypto
 *    applying the documented HMAC sequence (kSecret → kDate → kRegion →
 *    kService → kSigning) — the S3 example already proves the pipeline
 *    end-to-end (its documented signature is unreachable unless every hop
 *    of the ladder is exact); the isolation pin guards the chain ORDER.
 *
 * Scope of the implementation: header-based signing over a fixed header
 * set (everything the adapter sends), path-style URIs with S3's
 * RFC 3986 uri-encoding, and the UNSIGNED-PAYLOAD-free discipline (we
 * always send x-amz-content-sha256, the honest payload hash). Query
 * signing is supported (canonical query string) because the S3 contract
 * requires it, even though the R2 adapter's operations use none.
 */

import { createHash, createHmac } from "node:crypto";

/* ------------------------------------------------------------------ */
/* Credentials and inputs                                               */
/* ------------------------------------------------------------------ */

export interface SigV4Credentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/** Everything needed to sign one request. Headers use lowercase names. */
export interface SigV4SignInput {
  readonly method: string;
  /** Canonical URI: already S3-uri-encoded, starting with "/". */
  readonly canonicalUri: string;
  /** Canonical query string (sorted, encoded) — "" when there is none. */
  readonly canonicalQuery: string;
  /** The exact headers that will be sent (names lowercased here). */
  readonly headers: Readonly<Record<string, string>>;
  /** Hex sha-256 of the payload (the x-amz-content-sha256 value). */
  readonly payloadHash: string;
  /** ISO 8601 basic instant, YYYYMMDDTHHMMSSZ. */
  readonly amzDate: string;
  readonly region: string;
  readonly service: string;
}

/** The full signing artifacts (inspectable — the tests pin each stage). */
export interface SigV4Signed {
  readonly canonicalRequest: string;
  readonly stringToSign: string;
  readonly credentialScope: string;
  readonly signedHeaders: string;
  readonly signingKeyHex: string;
  readonly signature: string;
  readonly authorization: string;
}

/* ------------------------------------------------------------------ */
/* Primitives                                                           */
/* ------------------------------------------------------------------ */

/** sha-256 over UTF-8 text or raw bytes, as 64 lowercase hex characters. */
export function sha256Hex(input: Uint8Array | string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** HMAC-SHA256 (raw key, raw data) → raw digest bytes. */
function hmacSha256(key: Uint8Array, data: Uint8Array | string): Uint8Array {
  return new Uint8Array(createHmac("sha256", key).update(data).digest());
}

/**
 * S3's RFC 3986 uri-encoding: keep unreserved characters (A-Za-z0-9-_.~),
 * percent-encode everything else. `encodeSlash: false` keeps "/" intact
 * for path components (the canonical-URI rule); query values encode it.
 */
export function s3UriEncode(value: string, encodeSlash: boolean): string {
  let out = "";
  for (const byte of new TextEncoder().encode(value)) {
    const char = String.fromCharCode(byte);
    const unreserved =
      (char >= "A" && char <= "Z") ||
      (char >= "a" && char <= "z") ||
      (char >= "0" && char <= "9") ||
      char === "-" ||
      char === "_" ||
      char === "." ||
      char === "~";
    if (unreserved || (char === "/" && !encodeSlash)) {
      out += char;
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return out;
}

/** Format a UTC instant as the SigV4 amzDate (YYYYMMDDTHHMMSSZ). */
export function formatAmzDate(date: Date): string {
  return `${date.toISOString().replaceAll("-", "").replaceAll(":", "").slice(0, 15)}Z`;
}

/* ------------------------------------------------------------------ */
/* The signer                                                           */
/* ------------------------------------------------------------------ */

/**
 * Derive the SigV4 signing key: the documented HMAC ladder
 * kSecret → kDate → kRegion → kService → kSigning.
 */
export function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Uint8Array {
  const kDate = hmacSha256(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

/**
 * Sign one request (the complete SigV4 pipeline). Pure: a deterministic
 * function of the input — no clock, no network, no randomness.
 */
export function signSigV4(input: SigV4SignInput, credentials: SigV4Credentials): SigV4Signed {
  // Canonical headers: lowercase names, trimmed values, sorted by name.
  const names = Object.keys(input.headers).map((name) => name.toLowerCase().trim()).sort();
  const seen = new Set<string>();
  const canonicalHeaderLines: string[] = [];
  for (const name of names) {
    if (seen.has(name)) {
      throw new Error(`sigv4: duplicate header name '${name}'`);
    }
    seen.add(name);
    const value = input.headers[name];
    if (value === undefined) {
      throw new Error(`sigv4: missing value for header '${name}'`);
    }
    canonicalHeaderLines.push(`${name}:${value.trim()}\n`);
  }
  if (!seen.has("host")) {
    throw new Error("sigv4: the host header is required");
  }
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    input.method.toUpperCase(),
    input.canonicalUri,
    input.canonicalQuery,
    canonicalHeaderLines.join(""),
    signedHeaders,
    input.payloadHash,
  ].join("\n");

  const dateStamp = input.amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    input.amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = deriveSigningKey(credentials.secretAccessKey, dateStamp, input.region, input.service);
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    canonicalRequest,
    stringToSign,
    credentialScope,
    signedHeaders,
    signingKeyHex: Buffer.from(signingKey).toString("hex"),
    signature,
    authorization,
  };
}
