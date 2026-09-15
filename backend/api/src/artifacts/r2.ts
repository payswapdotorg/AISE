/**
 * Cloudflare R2 artifact storage — the deployed backend (PROD-006).
 *
 * Implements the `ArtifactStorage` port over R2's S3-compatible API
 * (endpoint `https://<account>.r2.cloudflarestorage.com`, path-style
 * requests, AWS SigV4 authentication — see docs/free-tier-deployment.md).
 *
 * Discipline:
 *
 *  - ZERO new dependencies: requests are signed by the hand-rolled SigV4
 *    signer (sigv4.ts, node:crypto — the lib/hash discipline), whose
 *    correctness is proven offline against the published AWS example
 *    vectors. The adapter itself is tested against an INJECTED fake fetch
 *    (request-shape assertions only; a real-R2 smoke is env-gated and
 *    NEVER part of the verify gate).
 *  - CONTENT-ADDRESSED keys: the object key IS the sha-256 of the bytes
 *    (64 lowercase hex, path-safe), so the payload hash that SigV4 sends
 *    as x-amz-content-sha256 is ALWAYS the content address itself.
 *  - TYPED failures only: quota signatures (HTTP 429, or 503 with a
 *    SlowDown/TooManyRequests body) map to `quota_exceeded`; credential
 *    refusals (401/403) to `auth_failed`; network failures and every other
 *    server-side answer to `unavailable`. Details name statuses and
 *    variable names, NEVER credential values.
 *  - DETERMINISM: given the same inputs and the same injected clock, the
 *    adapter issues byte-identical requests (the signer is pure).
 *  - describe() reports the bucket and endpoint only — statuses, never
 *    credentials.
 */

import type { EnvRecord } from "../lib/config";
import { formatAmzDate, sha256Hex, signSigV4, s3UriEncode } from "./sigv4";
import {
  ArtifactStorageError,
  type ArtifactBackendDescriptor,
  type ArtifactBlobInfo,
  type ArtifactStorage,
  type ArtifactStoragePutOutcome,
} from "./storage";

/* ------------------------------------------------------------------ */
/* Environment resolution (the R2_* group)                              */
/* ------------------------------------------------------------------ */

/** The R2_* group members (R2_PUBLIC_ENDPOINT is optional within it). */
export const R2_REQUIRED_ENV_VARS = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
] as const;

export const R2_OPTIONAL_ENV_VARS = ["R2_PUBLIC_ENDPOINT"] as const;

/** The resolved R2 configuration (present values only — never echoed). */
export interface R2StorageConfig {
  readonly accountId: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Explicit endpoint override (R2_PUBLIC_ENDPOINT); null → the account-derived default. */
  readonly endpoint: string | null;
}

export type R2EnvResolution =
  | { readonly status: "absent" }
  | { readonly status: "partial"; readonly missing: readonly string[] }
  | { readonly status: "complete"; readonly config: R2StorageConfig };

function isSet(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

/**
 * Resolve the R2_* env group. Pure; present-but-empty counts as NOT set
 * (the workspace env gate flags it as malformed — this resolver stays
 * value-agnostic and never echoes values).
 */
export function resolveR2StorageConfig(env: EnvRecord): R2EnvResolution {
  const set = (name: string): boolean => isSet(env[name]);
  const anySet = [...R2_REQUIRED_ENV_VARS, ...R2_OPTIONAL_ENV_VARS].some(set);
  if (!anySet) {
    return { status: "absent" };
  }
  const missing = R2_REQUIRED_ENV_VARS.filter((name) => !set(name));
  if (missing.length > 0) {
    return { status: "partial", missing };
  }
  return {
    status: "complete",
    config: {
      accountId: env.R2_ACCOUNT_ID?.trim() ?? "",
      bucket: env.R2_BUCKET?.trim() ?? "",
      accessKeyId: env.R2_ACCESS_KEY_ID?.trim() ?? "",
      secretAccessKey: env.R2_SECRET_ACCESS_KEY?.trim() ?? "",
      endpoint: isSet(env.R2_PUBLIC_ENDPOINT) ? env.R2_PUBLIC_ENDPOINT?.trim() ?? null : null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The adapter                                                          */
/* ------------------------------------------------------------------ */

/** The S3-compatible endpoint URL for an R2 account (path-style base). */
export function r2EndpointFor(accountId: string, override: string | null): string {
  if (override !== null) {
    return override.endsWith("/") ? override.slice(0, -1) : override;
  }
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export interface R2ArtifactStorageOptions {
  readonly accountId: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  /** Endpoint override (R2_PUBLIC_ENDPOINT); defaults to the account URL. */
  readonly endpoint?: string | null;
  /** SigV4 region (R2 accepts any; "auto" is the documented default). */
  readonly region?: string;
  /** Signing clock — INJECTED so tests are deterministic. Default: now. */
  readonly clock?: () => Date;
  /** Fetch implementation — INJECTED so tests run offline. Default: global fetch. */
  readonly fetchImpl?: typeof fetch;
}

const CONTENT_ADDRESS_PATTERN = /^[0-9a-f]{64}$/;
const EMPTY_PAYLOAD_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/**
 * R2-backed content-addressed blob storage. Construction performs NO I/O
 * (pure configuration) so a serverless cold start never blocks on the
 * network; availability is established per operation with typed failures.
 */
export class R2ArtifactStorage implements ArtifactStorage {
  private readonly endpoint: string;
  private readonly region: string;
  private readonly clock: () => Date;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: R2ArtifactStorageOptions) {
    this.endpoint = r2EndpointFor(options.accountId, options.endpoint ?? null);
    this.region = options.region ?? "auto";
    this.clock = options.clock ?? ((): Date => new Date());
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** The full request URL for one content address (path-style). */
  requestUrl(contentSha256: string): string {
    this.assertContentAddress(contentSha256);
    return `${this.endpoint}/${s3UriEncode(this.options.bucket, true)}/${contentSha256}`;
  }

  async put(contentSha256: string, bytes: Uint8Array): Promise<ArtifactStoragePutOutcome> {
    this.assertContentAddress(contentSha256);
    const payloadHash = sha256Hex(bytes);
    const response = await this.request("PUT", contentSha256, payloadHash, bytes);
    if (response.status === 200 || response.status === 201) {
      return { outcome: "stored", byteSize: bytes.length };
    }
    throw await this.storageError("put", contentSha256, response);
  }

  async get(contentSha256: string): Promise<Uint8Array | null> {
    this.assertContentAddress(contentSha256);
    const response = await this.request("GET", contentSha256, EMPTY_PAYLOAD_SHA256);
    if (response.status === 200) {
      return new Uint8Array(await response.arrayBuffer());
    }
    if (response.status === 404) {
      return null;
    }
    throw await this.storageError("get", contentSha256, response);
  }

  async head(contentSha256: string): Promise<ArtifactBlobInfo | null> {
    this.assertContentAddress(contentSha256);
    const response = await this.request("HEAD", contentSha256, EMPTY_PAYLOAD_SHA256);
    if (response.status === 200) {
      const length = Number.parseInt(response.headers.get("content-length") ?? "", 10);
      if (!Number.isFinite(length) || length < 0) {
        throw new ArtifactStorageError(
          "unavailable",
          `R2 HEAD answered 200 without a usable content-length (bucket '${this.options.bucket}')`,
        );
      }
      return { byteSize: length };
    }
    if (response.status === 404) {
      return null;
    }
    throw await this.storageError("head", contentSha256, response);
  }

  async remove(contentSha256: string): Promise<boolean> {
    this.assertContentAddress(contentSha256);
    const response = await this.request("DELETE", contentSha256, EMPTY_PAYLOAD_SHA256);
    if (response.status === 204 || response.status === 200) {
      return true;
    }
    if (response.status === 404) {
      return false;
    }
    throw await this.storageError("remove", contentSha256, response);
  }

  describe(): ArtifactBackendDescriptor {
    return { kind: "r2", bucket: this.options.bucket, endpoint: this.endpoint };
  }

  /* ---------------------------------------------------------------- */

  private assertContentAddress(contentSha256: string): void {
    if (!CONTENT_ADDRESS_PATTERN.test(contentSha256)) {
      throw new ArtifactStorageError(
        "unavailable",
        "R2 artifact storage: content address must be 64 lowercase hex characters",
      );
    }
  }

  /**
   * Issue ONE SigV4-signed S3-compatible request. The signed header set is
   * exactly the headers sent (host, x-amz-content-sha256, x-amz-date) —
   * the payload hash is honest (never UNSIGNED-PAYLOAD).
   */
  private async request(
    method: "GET" | "HEAD" | "PUT" | "DELETE",
    contentSha256: string,
    payloadHash: string,
    body?: Uint8Array,
  ): Promise<Response> {
    const url = new URL(this.requestUrl(contentSha256));
    const amzDate = formatAmzDate(this.clock());
    const hostHeader = url.host;
    const contentSha256Header = payloadHash;
    const headers: Record<string, string> = {
      host: hostHeader,
      "x-amz-content-sha256": contentSha256Header,
      "x-amz-date": amzDate,
    };
    const signed = signSigV4(
      {
        method,
        canonicalUri: `${url.pathname}`,
        canonicalQuery: "",
        headers,
        payloadHash,
        amzDate,
        region: this.region,
        service: "s3",
      },
      { accessKeyId: this.options.accessKeyId, secretAccessKey: this.options.secretAccessKey },
    );
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method,
        headers: {
          host: hostHeader,
          "x-amz-content-sha256": contentSha256Header,
          "x-amz-date": amzDate,
          authorization: signed.authorization,
        },
        body: body === undefined ? undefined : new Uint8Array(body),
      });
    } catch (error) {
      throw new ArtifactStorageError(
        "unavailable",
        `R2 request failed before an answer arrived (${method} object in bucket ` +
          `'${this.options.bucket}': ${error instanceof Error ? error.message : String(error)})`,
      );
    }
    return response;
  }

  /** Map a non-success answer to the typed failure taxonomy. */
  private async storageError(
    operation: string,
    contentSha256: string,
    response: Response,
  ): Promise<ArtifactStorageError> {
    const head = contentSha256.slice(0, 12);
    if (response.status === 401 || response.status === 403) {
      return new ArtifactStorageError(
        "auth_failed",
        `R2 refused the credentials for ${operation} of object ${head}… ` +
          "(HTTP 401/403 — check R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY)",
      );
    }
    let bodyText: string;
    try {
      // Error bodies are bounded S3 XML/JSON; read for signature matching only.
      bodyText = (await response.text()).slice(0, 2048);
    } catch {
      bodyText = "";
    }
    const quotaSignature =
      response.status === 429 ||
      (response.status === 503 && /SlowDown|TooManyRequests|QuotaExceeded/i.test(bodyText));
    if (quotaSignature) {
      return new ArtifactStorageError(
        "quota_exceeded",
        `R2 quota signature for ${operation} of object ${head}… ` +
          "(HTTP 429/503 SlowDown — the free-tier operation/storage allowance is exhausted)",
      );
    }
    return new ArtifactStorageError(
      "unavailable",
      `R2 answered HTTP ${response.status} for ${operation} of object ${head}… ` +
        `(bucket '${this.options.bucket}')`,
    );
  }
}
