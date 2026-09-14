/**
 * Capture ingestion gateway — the policy engine (AISE-004).
 *
 * Contract (spec/work-orders.md §004: "Receive content-addressed capture
 * packages, idempotently create sessions/assets and preserve source
 * metadata. Verify retry/duplicate/malformed cases."; spec/architecture-lock.md:
 * raw evidence is immutable):
 *
 *  - AUTHORITY DISCIPLINE: this gateway stores and validates ONLY. It
 *    performs no reconstruction, no readiness judgement, no capability
 *    scoring and no evidence interpretation (those authorities are AISE-010/
 *    022/006/013+). Nothing here grades or interprets ingested content.
 *  - Content addressing: sha-256 over the RAW asset bytes; the declared
 *    `contentId` (64 lowercase hex) is never trusted from the wire — a
 *    mismatch is rejected with `CONTENT_ID_MISMATCH`.
 *  - Batches are validated with the shared contract codecs
 *    (`decodeSyncBatchStrict` — canonical validation for an internal
 *    pipeline) and cross-major contract versions are mapped to
 *    `CONTRACT_VERSION_UNSUPPORTED`.
 *  - Idempotency semantics (binding):
 *      * same `idempotencyKey` + same batch content  -> DUPLICATE (never a
 *        second session), carrying the session's current
 *        `lastAcceptedSequence`;
 *      * same `idempotencyKey` + different content   -> REJECTED
 *        `IDEMPOTENCY_CONFLICT`;
 *      * per-session sequences must be non-decreasing; a gap -> REJECTED
 *        `SEQUENCE_GAP` with `resumeFromSequence = lastAcceptedSequence + 1`;
 *      * an already-accepted sequence replayed with different content ->
 *        REJECTED `SESSION_CONFLICT` (re-posting the SAME envelope is
 *        idempotent and answers DUPLICATE).
 *  - Manifest verification: every manifest entry must reference an
 *    already-uploaded asset whose stored byteSize and mediaType match —
 *    otherwise `MANIFEST_MISMATCH` (a never-uploaded contentId included).
 *  - The gateway owns NO wall clock and NO randomness: both are injected, so
 *    every decision and every `SyncAck` is deterministic and testable.
 *
 * Decision order (stable, documented for review):
 *   parse -> strict decode/version gate -> envelope/batch sessionId
 *   consistency -> idempotency ledger -> sequence/replay gate -> manifest
 *   verification -> accept (ledger first, then the append-only batch record
 *   and session projection). DUPLICATE outcomes short-circuit before
 *   manifest re-verification: an exact retry of accepted content cannot
 *   change verdict, because the content store is immutable.
 */

import {
  canonicalJsonStringify,
  ContractDecodeError,
  ContractVersionMismatchError,
  decodeCaptureSessionEnvelopeStrict,
  decodeSyncBatchStrict,
  stableIdSchema,
  SyncAckCodec,
  type SyncAck,
  type SyncBatch,
  type SyncReasonCode,
} from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type {
  AcceptBatchInput,
  CaptureStore,
  StoredAsset,
  StoredIdempotencyRecord,
  StoredSession,
} from "./store";

/* ------------------------------------------------------------------ */
/* Result types                                                         */
/* ------------------------------------------------------------------ */

/** Result of a content-addressed asset upload. */
export type AssetIngestResult =
  | { readonly kind: "stored"; readonly asset: StoredAsset }
  | { readonly kind: "duplicate"; readonly asset: StoredAsset }
  | {
      readonly kind: "rejected";
      readonly reasonCode: "CONTENT_ID_MISMATCH" | "CONTENT_COLLISION";
      readonly reasonDetail: string;
      readonly declaredContentId: string;
    };

/** One schema-validation issue, summarized deterministically (no values). */
export interface ContractIssueSummary {
  readonly path: string;
  readonly code: string;
}

/**
 * Request-level failure that precedes any ackable decision: the body is not
 * JSON, does not satisfy the SyncBatch contract, or carries an unsupported
 * contract version without even usable batchId/idempotencyKey fields to ack.
 */
export interface SyncBadRequest {
  readonly kind: "bad_request";
  readonly error: "malformed_json" | "schema_invalid" | "version_unsupported";
  readonly detail: string;
  readonly issues?: ReadonlyArray<ContractIssueSummary>;
}

/** Result of a sync batch submission: a full SyncAck, or a bad request. */
export type SyncIngestResult =
  | {
      readonly kind: "ack";
      readonly ack: SyncAck;
      /** Correlation fields for logging (not part of the wire ack). */
      readonly sessionId: string;
      readonly sequence: number;
    }
  | SyncBadRequest;

export interface CaptureGateway {
  /** Ingest one raw content-addressed asset upload. */
  ingestAsset(
    declaredContentId: string,
    bytes: Uint8Array,
    mediaType: string,
  ): Promise<AssetIngestResult>;
  /** Ingest one SyncBatch request body (raw JSON text). */
  ingestSyncBatch(rawBody: string): Promise<SyncIngestResult>;
  /** Read the stored session projection (read-only operator/test surface). */
  getSession(sessionId: string): Promise<StoredSession | null>;
}

export interface CaptureGatewayDeps {
  /** Persistence boundary (file-system or in-memory implementation). */
  readonly store: CaptureStore;
  /** UTC instant supplier — ISO 8601, millisecond precision, `Z` suffix. */
  readonly clock: () => string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

interface AckIdentity {
  readonly batchId: string;
  readonly idempotencyKey: string;
}

/** Best-effort correlation context extracted from an undecodable payload. */
interface PayloadContext {
  readonly identity: AckIdentity | null;
  readonly sessionId: string;
  readonly sequence: number;
}

/**
 * Best-effort ack identity and correlation fields from an undecodable
 * payload: only fields that satisfy the stable-id contract are usable for
 * an ack; anything else cannot be acked and degrades to a plain bad request.
 */
function peekPayloadContext(payload: unknown): PayloadContext {
  const empty: PayloadContext = { identity: null, sessionId: "", sequence: 0 };
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return empty;
  }
  const record = payload as Record<string, unknown>;
  const batchId = stableIdSchema.safeParse(record["batchId"]);
  const idempotencyKey = stableIdSchema.safeParse(record["idempotencyKey"]);
  const sessionId = record["sessionId"];
  const sequence = record["sequence"];
  return {
    identity:
      batchId.success && idempotencyKey.success
        ? { batchId: batchId.data, idempotencyKey: idempotencyKey.data }
        : null,
    sessionId: typeof sessionId === "string" ? sessionId : "",
    sequence: typeof sequence === "number" && Number.isInteger(sequence) ? sequence : 0,
  };
}

function summarizeIssues(
  issues: ReadonlyArray<{ readonly path: ReadonlyArray<string | number>; readonly code: string }>,
): ContractIssueSummary[] {
  return issues.map((issue) => ({
    path: issue.path.length === 0 ? "<root>" : issue.path.map(String).join("/"),
    code: issue.code,
  }));
}

/* ------------------------------------------------------------------ */
/* Gateway                                                              */
/* ------------------------------------------------------------------ */

/** Create the capture ingestion gateway (pure policy + injected I/O). */
export function createCaptureGateway(deps: CaptureGatewayDeps): CaptureGateway {
  const { store, clock } = deps;

  const acceptedAck = (
    batch: SyncBatch,
    lastAcceptedSequence: number,
  ): SyncIngestResult => ({
    kind: "ack",
    ack: {
      contractVersion: SyncAckCodec.contractVersion,
      batchId: batch.batchId,
      idempotencyKey: batch.idempotencyKey,
      outcome: "ACCEPTED",
      lastAcceptedSequence,
      acknowledgedAt: clock(),
    },
    sessionId: batch.sessionId,
    sequence: batch.sequence,
  });

  const duplicateAck = (
    batch: SyncBatch,
    lastAcceptedSequence: number | null,
  ): SyncIngestResult => ({
    kind: "ack",
    ack: {
      contractVersion: SyncAckCodec.contractVersion,
      batchId: batch.batchId,
      idempotencyKey: batch.idempotencyKey,
      outcome: "DUPLICATE",
      ...(lastAcceptedSequence === null ? {} : { lastAcceptedSequence }),
      acknowledgedAt: clock(),
    },
    sessionId: batch.sessionId,
    sequence: batch.sequence,
  });

  const rejectedAck = (
    identity: AckIdentity,
    sessionId: string,
    sequence: number,
    reasonCode: SyncReasonCode,
    reasonDetail: string,
    resume?: { readonly lastAcceptedSequence?: number; readonly resumeFromSequence?: number },
  ): SyncIngestResult => ({
    kind: "ack",
    ack: {
      contractVersion: SyncAckCodec.contractVersion,
      batchId: identity.batchId,
      idempotencyKey: identity.idempotencyKey,
      outcome: "REJECTED",
      reasonCode,
      reasonDetail,
      ...(resume?.lastAcceptedSequence === undefined
        ? {}
        : { lastAcceptedSequence: resume.lastAcceptedSequence }),
      ...(resume?.resumeFromSequence === undefined
        ? {}
        : { resumeFromSequence: resume.resumeFromSequence }),
      acknowledgedAt: clock(),
    },
    sessionId,
    sequence,
  });

  /** Current last accepted sequence for the session a ledger record points at. */
  const lastAcceptedSequenceOf = async (
    record: StoredIdempotencyRecord,
  ): Promise<number | null> => {
    const session = await store.getSession(record.sessionId);
    return session === null ? record.sequence : session.lastAcceptedSequence;
  };

  const ingestAsset = async (
    declaredContentId: string,
    bytes: Uint8Array,
    mediaType: string,
  ): Promise<AssetIngestResult> => {
    // Content addressing: the identity IS the hash of the raw bytes; the
    // declared id is never trusted from the wire.
    const computed = sha256Hex(bytes);
    if (computed !== declaredContentId) {
      return {
        kind: "rejected",
        reasonCode: "CONTENT_ID_MISMATCH",
        reasonDetail: `computed sha-256 ${computed} does not match the declared content id`,
        declaredContentId,
      };
    }
    const outcome = await store.putAsset(declaredContentId, bytes, mediaType, clock());
    if (outcome.outcome === "COLLISION") {
      return {
        kind: "rejected",
        reasonCode: "CONTENT_COLLISION",
        reasonDetail:
          "content id is already stored with different bytes or a different media type; " +
          "stored records are immutable and are never rewritten",
        declaredContentId,
      };
    }
    return outcome.outcome === "STORED"
      ? { kind: "stored", asset: outcome.asset }
      : { kind: "duplicate", asset: outcome.asset };
  };

  /**
   * Verify the manifest against the immutable content store and append the
   * batch. Shared by the fresh-accept path and the interrupted-accept
   * completion path (ledger already written, batch record missing).
   */
  const acceptVerified = async (batch: SyncBatch): Promise<SyncIngestResult> => {
    const batchFingerprint = sha256Hex(canonicalJsonStringify(batch));
    const envelopeFingerprint = sha256Hex(canonicalJsonStringify(batch.envelope));
    const identity: AckIdentity = {
      batchId: batch.batchId,
      idempotencyKey: batch.idempotencyKey,
    };

    // Manifest verification: every entry needs an already-uploaded asset with
    // matching byteSize and mediaType.
    const session = await store.getSession(batch.sessionId);
    for (const entry of batch.manifest) {
      const asset = await store.getAsset(entry.contentId);
      if (asset === null) {
        return rejectedAck(
          identity,
          batch.sessionId,
          batch.sequence,
          "MANIFEST_MISMATCH",
          `manifest entry ${entry.contentId} has no uploaded asset`,
          session === null ? {} : { lastAcceptedSequence: session.lastAcceptedSequence },
        );
      }
      if (asset.byteSize !== entry.byteSize || asset.mediaType !== entry.mediaType) {
        return rejectedAck(
          identity,
          batch.sessionId,
          batch.sequence,
          "MANIFEST_MISMATCH",
          `manifest entry ${entry.contentId} does not match the stored asset ` +
            "(byteSize or mediaType differ)",
          session === null ? {} : { lastAcceptedSequence: session.lastAcceptedSequence },
        );
      }
    }

    // Accept: idempotency ledger first (put-if-absent detects races), then
    // the append-only batch record and the session projection.
    const now = clock();
    const raced = await store.putIdempotencyRecord({
      idempotencyKey: batch.idempotencyKey,
      batchId: batch.batchId,
      sessionId: batch.sessionId,
      sequence: batch.sequence,
      contentFingerprint: batchFingerprint,
    });
    if (raced !== null && raced.contentFingerprint !== batchFingerprint) {
      return rejectedAck(
        identity,
        batch.sessionId,
        batch.sequence,
        "IDEMPOTENCY_CONFLICT",
        "idempotency key is already recorded for different batch content",
        { lastAcceptedSequence: (await lastAcceptedSequenceOf(raced)) ?? undefined },
      );
    }
    if (raced !== null) {
      // Same key, same content, but the batch record is absent: an accept
      // interrupted between the ledger write and the append. Complete it.
      const recorded = await store.getBatchRecord(batch.sessionId, batch.sequence);
      if (recorded !== null && recorded.contentFingerprint === batchFingerprint) {
        const current = await store.getSession(batch.sessionId);
        return duplicateAck(batch, current?.lastAcceptedSequence ?? null);
      }
    }

    const input: AcceptBatchInput = {
      sessionId: batch.sessionId,
      batch,
      contentFingerprint: batchFingerprint,
      envelopeFingerprint,
      acceptedAt: now,
      timestamp: now,
    };
    const stored = await store.acceptBatch(input);
    return acceptedAck(batch, stored.lastAcceptedSequence);
  };

  const ingestSyncBatch = async (rawBody: string): Promise<SyncIngestResult> => {
    // 1. Parse: bodies that fail JSON parsing never reach validation.
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return {
        kind: "bad_request",
        error: "malformed_json",
        detail: "request body is not valid JSON",
      };
    }

    // 2. Strict decode + version gate (canonical validation for an internal
    //    pipeline; cross-major versions are typed errors, never coerced).
    let batch: SyncBatch;
    try {
      batch = decodeSyncBatchStrict(payload);
      // Nested same-major gate for the embedded envelope (the batch-level
      // decode only form-checks nested versions).
      decodeCaptureSessionEnvelopeStrict(batch.envelope);
    } catch (error) {
      if (error instanceof ContractVersionMismatchError) {
        const detail =
          `contract version mismatch: expected ${error.expected} (or same major), ` +
          `received ${error.received}`;
        const context = peekPayloadContext(payload);
        if (context.identity === null) {
          return { kind: "bad_request", error: "version_unsupported", detail };
        }
        return rejectedAck(
          context.identity,
          context.sessionId,
          context.sequence,
          "CONTRACT_VERSION_UNSUPPORTED",
          detail,
        );
      }
      if (error instanceof ContractDecodeError) {
        return {
          kind: "bad_request",
          error: "schema_invalid",
          detail: "request body does not satisfy the SyncBatch wire contract",
          issues: summarizeIssues(error.issues),
        };
      }
      throw error;
    }

    // 3. Internal consistency: the envelope must describe the batch's session.
    if (batch.envelope.sessionId !== batch.sessionId) {
      return rejectedAck(
        batch,
        batch.sessionId,
        batch.sequence,
        "SESSION_CONFLICT",
        "envelope.sessionId does not match the batch sessionId",
      );
    }

    // 4. Idempotency ledger.
    const batchFingerprint = sha256Hex(canonicalJsonStringify(batch));
    const existing = await store.getIdempotencyRecord(batch.idempotencyKey);
    if (existing !== null && existing.contentFingerprint !== batchFingerprint) {
      return rejectedAck(
        batch,
        batch.sessionId,
        batch.sequence,
        "IDEMPOTENCY_CONFLICT",
        "idempotency key is already recorded for different batch content",
        { lastAcceptedSequence: (await lastAcceptedSequenceOf(existing)) ?? undefined },
      );
    }
    if (existing !== null) {
      // Exact retry (same key, same content): idempotent — UNLESS the ledger
      // entry is an interrupted accept whose batch record never landed, in
      // which case the request falls through to the sequence gate and the
      // normal accept path (the put-if-absent ledger write is then a no-op).
      const recorded = await store.getBatchRecord(existing.sessionId, existing.sequence);
      if (recorded !== null && recorded.contentFingerprint === batchFingerprint) {
        const current = await store.getSession(existing.sessionId);
        return duplicateAck(batch, current?.lastAcceptedSequence ?? null);
      }
    }

    // 5. Sequence / replay gate for known sessions.
    const session = await store.getSession(batch.sessionId);
    if (session !== null) {
      const last = session.lastAcceptedSequence;
      if (batch.sequence > last + 1) {
        return rejectedAck(
          batch,
          batch.sessionId,
          batch.sequence,
          "SEQUENCE_GAP",
          `expected sequence ${last + 1}, received ${batch.sequence}`,
          { lastAcceptedSequence: last, resumeFromSequence: last + 1 },
        );
      }
      if (batch.sequence <= last) {
        const recorded = await store.getBatchRecord(batch.sessionId, batch.sequence);
        const envelopeFingerprint = sha256Hex(canonicalJsonStringify(batch.envelope));
        if (recorded !== null && recorded.envelopeFingerprint === envelopeFingerprint) {
          // Same envelope re-posted at an already-accepted sequence:
          // idempotent by the session's append/immutable semantics.
          return duplicateAck(batch, last);
        }
        return rejectedAck(
          batch,
          batch.sessionId,
          batch.sequence,
          "SESSION_CONFLICT",
          `sequence ${batch.sequence} was already accepted with different content`,
          { lastAcceptedSequence: last },
        );
      }
    }

    // 6./7. Manifest verification + accept.
    return acceptVerified(batch);
  };

  return {
    ingestAsset,
    ingestSyncBatch,
    getSession: (sessionId: string) => store.getSession(sessionId),
  };
}
