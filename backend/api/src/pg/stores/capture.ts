/**
 * Pg twin for the capture store (PROD-005).
 *
 * `PgCaptureStore` implements the EXACT `CaptureStore` interface the Fs and
 * In-memory twins implement (capture/store.ts — read it before changing
 * anything here): immutable content-addressed asset blobs, a session
 * PROJECTION rebuilt on every accepted batch (the batches themselves are
 * immutable append-only records), and a put-if-absent idempotency ledger.
 *
 * Table mapping (v001):
 *   capture_assets      (record_key = contentId) — blob record: payload =
 *                       the canonical StoredAsset sidecar, bytes = the blob;
 *   capture_sessions    (record_key = sessionId) — the session projection,
 *                       whole-record UPSERT (the projection is rebuildable,
 *                       exactly like the Fs session.json rewrite);
 *   capture_batches     (session_id, sequence) — the immutable batch
 *                       records (upsert keyed on the natural pair);
 *   capture_idempotency (record_key = idempotencyKey) — put-if-absent.
 *
 * `acceptBatch` runs in ONE transaction (executor JOIN semantics make it
 * safe under an ambient seed transaction too): the batch record and the
 * rebuilt session projection commit together or not at all.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { bytesEqual } from "../../lib/hash";
import type {
  AcceptBatchInput,
  AssetPutOutcome,
  CaptureStore,
  SessionAssetEntry,
  StoredAsset,
  StoredBatch,
  StoredBatchRecord,
  StoredIdempotencyRecord,
  StoredSession,
} from "../../capture/store";
import type { PgExecutor } from "../executor";
import {
  selectCaptureBatchSql,
  upsertCaptureBatchSql,
  PG_TABLES,
} from "../sql";
import { parseCanonicalJson, RecordTable } from "./records";

const CONTENT_ID_PATTERN = /^[0-9a-f]{64}$/;

function assertContentId(contentId: string): void {
  if (!CONTENT_ID_PATTERN.test(contentId)) {
    throw new Error("store: content id must be 64 lowercase hex characters");
  }
}

/** Batch summary for the session projection (mirrors capture/store.ts). */
function batchSummary(record: StoredBatchRecord): StoredBatch {
  return {
    batchId: record.batch.batchId,
    sequence: record.batch.sequence,
    idempotencyKey: record.batch.idempotencyKey,
    contentFingerprint: record.contentFingerprint,
    envelopeFingerprint: record.envelopeFingerprint,
    acceptedAt: record.acceptedAt,
  };
}

/** Merge manifest entries into the accumulated asset list (first wins). */
function mergeAssetEntries(
  existing: ReadonlyArray<SessionAssetEntry>,
  additions: ReadonlyArray<SessionAssetEntry>,
): SessionAssetEntry[] {
  const merged: SessionAssetEntry[] = [...existing];
  const seen = new Set(merged.map((entry) => entry.contentId));
  for (const entry of additions) {
    if (!seen.has(entry.contentId)) {
      seen.add(entry.contentId);
      merged.push(entry);
    }
  }
  return merged;
}

/** Parse stored canonical text as a record (typed error on garbage). */
function parseRecordText<T>(text: string, context: string): T {
  return parseCanonicalJson(text, context) as T;
}

export class PgCaptureStore implements CaptureStore {
  private readonly assets: RecordTable;
  private readonly sessions: RecordTable;
  private readonly idempotency: RecordTable;

  constructor(private readonly executor: PgExecutor) {
    this.assets = new RecordTable(executor, PG_TABLES.captureAssets);
    this.sessions = new RecordTable(executor, PG_TABLES.captureSessions);
    this.idempotency = new RecordTable(executor, PG_TABLES.captureIdempotency);
  }

  async getAsset(contentId: string): Promise<StoredAsset | null> {
    assertContentId(contentId);
    const canonical = await this.assets.selectCanonical(contentId);
    return canonical === null
      ? null
      : parseRecordText<StoredAsset>(canonical, "capture asset sidecar");
  }

  async readAssetBytes(contentId: string): Promise<Uint8Array | null> {
    assertContentId(contentId);
    const row = await this.assets.selectBlob(contentId);
    return row === null ? null : new Uint8Array(row.bytes);
  }

  async putAsset(
    contentId: string,
    bytes: Uint8Array,
    mediaType: string,
    storedAt: string,
  ): Promise<AssetPutOutcome> {
    assertContentId(contentId);
    const asset: StoredAsset = {
      contentId,
      byteSize: bytes.length,
      mediaType,
      storedAt,
    };
    const canonical = canonicalJsonStringify(asset);
    const outcome = await this.assets.insertBlobIfAbsent(contentId, canonical, bytes);
    if (outcome.wrote) {
      return { outcome: "STORED", asset };
    }
    // Immutable record: compare incoming bytes AND the stored sidecar before
    // ever touching the row (the Fs/InMemory twins compare bytes + media type).
    const existing = await this.assets.selectBlob(contentId);
    if (existing === null) {
      throw new Error("pg: capture asset row disappeared mid-put (read-back null)");
    }
    const existingAsset = parseRecordText<StoredAsset>(
      existing.canonical,
      "capture asset sidecar",
    );
    if (bytesEqual(new Uint8Array(existing.bytes), bytes) && existingAsset.mediaType === mediaType) {
      return { outcome: "DUPLICATE", asset: existingAsset };
    }
    return { outcome: "COLLISION", existing: existingAsset };
  }

  async getSession(sessionId: string): Promise<StoredSession | null> {
    const canonical = await this.sessions.selectCanonical(sessionId);
    return canonical === null
      ? null
      : parseRecordText<StoredSession>(canonical, "capture session projection");
  }

  async getBatchRecord(sessionId: string, sequence: number): Promise<StoredBatchRecord | null> {
    const rows = await this.executor.execute<{ canonical: string }>(selectCaptureBatchSql(), [
      sessionId,
      sequence,
    ]);
    const row = rows[0];
    return row === undefined
      ? null
      : parseRecordText<StoredBatchRecord>(row.canonical, "capture batch record");
  }

  async putIdempotencyRecord(
    record: StoredIdempotencyRecord,
  ): Promise<StoredIdempotencyRecord | null> {
    const canonical = canonicalJsonStringify(record);
    const outcome = await this.idempotency.insertIfAbsent(record.idempotencyKey, canonical);
    if (outcome.wrote) {
      return null; // newly written
    }
    return parseRecordText<StoredIdempotencyRecord>(
      outcome.canonical,
      "capture idempotency record",
    );
  }

  async getIdempotencyRecord(idempotencyKey: string): Promise<StoredIdempotencyRecord | null> {
    const canonical = await this.idempotency.selectCanonical(idempotencyKey);
    return canonical === null
      ? null
      : parseRecordText<StoredIdempotencyRecord>(canonical, "capture idempotency record");
  }

  async acceptBatch(input: AcceptBatchInput): Promise<StoredSession> {
    return this.executor.transaction(async () => {
      const previousText = await this.sessions.selectCanonical(input.sessionId);
      const previous =
        previousText === null
          ? null
          : parseRecordText<StoredSession>(previousText, "capture session projection");
      const record: StoredBatchRecord = {
        batch: input.batch,
        contentFingerprint: input.contentFingerprint,
        envelopeFingerprint: input.envelopeFingerprint,
        acceptedAt: input.acceptedAt,
      };
      const manifestEntries: SessionAssetEntry[] = input.batch.manifest.map((entry) => ({
        contentId: entry.contentId,
        byteSize: entry.byteSize,
        mediaType: entry.mediaType,
      }));
      const session: StoredSession = {
        sessionId: input.sessionId,
        envelope: input.batch.envelope,
        assets: mergeAssetEntries(previous?.assets ?? [], manifestEntries),
        batches: [...(previous?.batches ?? []), batchSummary(record)],
        lastAcceptedSequence: input.batch.sequence,
        createdAt: previous?.createdAt ?? input.timestamp,
        updatedAt: input.timestamp,
      };
      await this.executor.execute(upsertCaptureBatchSql(), [
        input.sessionId,
        input.batch.sequence,
        input.batch.batchId,
        canonicalJsonStringify(record),
        canonicalJsonStringify(record),
      ]);
      await this.sessions.upsert(input.sessionId, canonicalJsonStringify(session));
      return session;
    });
  }
}
