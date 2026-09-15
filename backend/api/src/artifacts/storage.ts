/**
 * Artifact storage port — PROD-006.
 *
 * The persistence boundary for artifact BLOBS. Implementations
 * (R2ArtifactStorage for Cloudflare R2, FsArtifactStorage for local dev)
 * are PERSISTENCE ONLY:
 *
 *  - keys are CONTENT ADDRESSES (sha-256 of the bytes, 64 lowercase hex);
 *    the store never sees project scope — scope lives in the metadata
 *    rows, so identical bytes are stored ONCE regardless of how many
 *    projects reference them;
 *  - no policy lives here: no limits, no type checks, no access checks
 *    (those are the service's, always enforced BEFORE any storage call);
 *  - failures are TYPED (`ArtifactStorageError`): quota-exceeded
 *    signatures and availability failures are explicit, never silent —
 *    the service maps them to 503 outcomes with distinct stable codes.
 *
 * Implementations MUST be deterministic given the same call sequence (the
 * Fs twin writes identical bytes at identical paths; the R2 adapter
 * issues identical requests for identical inputs given the same clock).
 */

/* ------------------------------------------------------------------ */
/* Descriptors                                                          */
/* ------------------------------------------------------------------ */

/** What backend answers behind this storage instance (no credentials). */
export type ArtifactBackendDescriptor =
  | { readonly kind: "r2"; readonly bucket: string; readonly endpoint: string }
  | { readonly kind: "local-fs"; readonly root: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/* ------------------------------------------------------------------ */
/* Typed storage failures                                               */
/* ------------------------------------------------------------------ */

/** Machine-readable failure classification (mapped to 503 codes upstream). */
export type ArtifactStorageFailureKind =
  /** The backend could not be reached or answered a server error. */
  | "unavailable"
  /** A quota signature was recognized (free-tier storage/op limits). */
  | "quota_exceeded"
  /** The backend refused our credentials (misconfiguration, not a client error). */
  | "auth_failed";

/**
 * Typed storage failure. `detail` is deterministic and safe to surface in
 * logs and error envelopes: it names failure signatures and variable
 * NAMES, never credential VALUES.
 */
export class ArtifactStorageError extends Error {
  readonly failureKind: ArtifactStorageFailureKind;
  readonly detail: string;

  constructor(failureKind: ArtifactStorageFailureKind, detail: string) {
    super(`artifact storage ${failureKind}: ${detail}`);
    this.name = "ArtifactStorageError";
    this.failureKind = failureKind;
    this.detail = detail;
  }
}

/* ------------------------------------------------------------------ */
/* Outcomes                                                             */
/* ------------------------------------------------------------------ */

/** Put is unconditional (content-addressed): the bytes under a content address are immutable. */
export interface ArtifactStoragePutOutcome {
  readonly outcome: "stored";
  readonly byteSize: number;
}

/** HEAD-style probe: blob metadata, or null when no blob is stored. */
export interface ArtifactBlobInfo {
  readonly byteSize: number;
}

/* ------------------------------------------------------------------ */
/* The port                                                             */
/* ------------------------------------------------------------------ */

/**
 * Content-addressed blob storage. `contentSha256` MUST be the sha-256 of
 * `bytes` (the service computes it; the store trusts its caller — it is
 * not an authority over content addressing).
 */
export interface ArtifactStorage {
  /** Store the bytes under their content address (idempotent overwrite of identical bytes). */
  put(contentSha256: string, bytes: Uint8Array): Promise<ArtifactStoragePutOutcome>;
  /** A copy of the stored bytes, or null when no blob is stored under the address. */
  get(contentSha256: string): Promise<Uint8Array | null>;
  /** Blob metadata, or null when no blob is stored under the address. */
  head(contentSha256: string): Promise<ArtifactBlobInfo | null>;
  /** Remove the blob; true when something was removed, false when absent. */
  remove(contentSha256: string): Promise<boolean>;
  /** The backend descriptor (statuses only — never credentials). */
  describe(): ArtifactBackendDescriptor;
}

/**
 * A storage that fails every operation with an explicit typed error. Used
 * ONLY as the degraded wiring when R2 env is half-configured (the
 * operator asked for R2 but it cannot be constructed — artifact byte
 * operations fail LOUDLY with 503 instead of silently degrading to a
 * non-durable local fallback).
 */
export class UnavailableArtifactStorage implements ArtifactStorage {
  constructor(reason: string) {
    this.reason = reason;
  }

  private readonly reason: string;

  private fail(): never {
    throw new ArtifactStorageError("unavailable", this.reason);
  }

  put(): Promise<never> {
    this.fail();
  }

  get(): Promise<never> {
    this.fail();
  }

  head(): Promise<never> {
    this.fail();
  }

  remove(): Promise<never> {
    this.fail();
  }

  describe(): ArtifactBackendDescriptor {
    return { kind: "unavailable", reason: this.reason };
  }
}
