/**
 * Ingestion error construction for the capture gateway.
 *
 * Every rejection emitted by the ingestion boundary is an AISE-003
 * v1.0 `SyncError` envelope (the finalized error contract), mapped
 * onto an HTTP status. Retry semantics follow the contract rules:
 * the `retryable` flag and `retryAfterMs` are authoritative data;
 * clients never parse `message`.
 *
 * Contract invariants guarded here:
 * - `IDEMPOTENCY_CONFLICT` is NEVER retryable (requirements AC-012:
 *   a conflict is a client correctness failure, not a transient one);
 * - every emitted envelope validates against the sync-error schema
 *   (proven by tests that validate every error response).
 */
import type { SyncError, SyncErrorCode } from "@aise/shared-contracts";
import { CONTRACT_VERSION } from "@aise/shared-contracts";

/** HTTP status for each sync-error code the gateway can emit. */
const HTTP_STATUS_BY_CODE: Record<SyncErrorCode, number> = {
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  PROJECT_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  ASSET_NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  CHECKSUM_MISMATCH: 422,
  PAYLOAD_TOO_LARGE: 413,
  IDEMPOTENCY_CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  CONTRACT_VERSION_UNSUPPORTED: 400,
};

/**
 * Codes that are retryable by contract default, with the suggested
 * minimum wait. Everything else fails closed with `retryable: false`.
 */
const RETRYABLE_BY_CODE: Partial<Record<SyncErrorCode, number>> = {
  CHECKSUM_MISMATCH: 5000,
  RATE_LIMITED: 60_000,
  SERVER_ERROR: 5000,
  SERVICE_UNAVAILABLE: 5000,
};

export interface IngestionErrorOptions {
  /** Structured, code-specific details for the error envelope. */
  readonly details?: Record<string, unknown>;
  /** Overrides the retryability default (guarded for conflicts). */
  readonly retryable?: boolean;
  /** Overrides the default retry-after delay in milliseconds. */
  readonly retryAfterMs?: number;
  /**
   * Overrides the HTTP status for the code (the sync-error envelope
   * stays code-driven). Used for well-formed payloads that conflict
   * with existing state (HTTP 409) rather than malformed ones (400).
   */
  readonly status?: number;
}

/**
 * A typed ingestion failure carrying the AISE-003 sync-error envelope
 * and the HTTP status it maps to. Handlers throw these; the router
 * converts them into contract-shaped responses.
 */
export class IngestionError extends Error {
  readonly status: number;
  readonly envelope: SyncError;

  constructor(code: SyncErrorCode, message: string, options: IngestionErrorOptions = {}) {
    super(message);
    this.name = "IngestionError";

    if (code === "IDEMPOTENCY_CONFLICT" && (options.retryable ?? false)) {
      // Contract invariant: an idempotency conflict must never be
      // retryable. A caller trying to construct one as retryable is
      // a programming error and must fail loudly, not silently.
      throw new Error("IDEMPOTENCY_CONFLICT must never be constructed as retryable");
    }

    const retryableByDefault = RETRYABLE_BY_CODE[code] !== undefined;
    const retryable = options.retryable ?? retryableByDefault;
    const retryAfterMs =
      options.retryAfterMs ?? (retryable ? (RETRYABLE_BY_CODE[code] ?? 5000) : undefined);

    this.status = options.status ?? HTTP_STATUS_BY_CODE[code] ?? 500;
    this.envelope = {
      contractVersion: CONTRACT_VERSION,
      code,
      message,
      retryable,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      ...(options.details !== undefined ? { details: options.details } : {}),
    };
  }
}

/** Envelope for unexpected internal failures on ingestion routes. */
export function serverErrorSyncError(): SyncError {
  return new IngestionError(
    "SERVER_ERROR",
    "unexpected internal failure while processing the ingestion request",
  ).envelope;
}
