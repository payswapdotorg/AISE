/**
 * Capture ingestion store — persistence abstraction (AISE-004).
 *
 * Contract (spec/work-orders.md §004, spec/architecture-lock.md "Raw field
 * evidence is immutable"):
 *
 *  - The store is PERSISTENCE ONLY. It performs no ingestion policy: no
 *    content-address derivation decisions, no idempotency semantics beyond
 *    put-if-absent, no sequence rules, no readiness/reconstruction logic of
 *    any kind. All policy lives in `capture/gateway.ts`.
 *  - Asset bytes are IMMUTABLE: once written under a content address they are
 *    never modified or deleted. Re-putting byte-identical content is an
 *    idempotent no-op (DUPLICATE); a conflicting re-put (different bytes, or
 *    a different declared media type for the same bytes) is refused with
 *    COLLISION and the original record is retained verbatim — append-only
 *    stores never rewrite history (mirrors the AISE-002 LocalCaptureStore
 *    append-only discipline).
 *  - Sessions are append-semantics records: each accepted batch appends an
 *    immutable batch record file and updates the rebuildable session
 *    projection; prior batch records are never rewritten.
 *  - The interface exists so tests can run an in-memory implementation
 *    (`InMemoryCaptureStore`) with identical, deterministic behavior.
 *
 * File-system layout (`FsCaptureStore`, rooted at `AISE_DATA_DIR`, default
 * `./data`, resolved against the process working directory):
 *
 *   data/content/<first2>/<hash>                        immutable asset blob
 *   data/content/<first2>/<hash>.json                   asset metadata sidecar
 *   data/sessions/<sha256(sessionId)>/session.json      session projection
 *   data/sessions/<sha256(sessionId)>/batches/<seq8>-<sha256(batchId)>.json
 *                                                        immutable batch record
 *   data/idempotency/<sha256(idempotencyKey)>.json      idempotency ledger
 *
 * Opaque ids (sessionId, batchId, idempotencyKey) are hashed into filesystem-
 * safe names and stored verbatim inside the JSON records; `contentId` is
 * validated to be 64 lowercase hex before it is ever used in a path. All JSON
 * is written with the shared canonical JSON encoder, so identical state always
 * produces identical bytes.
 */

import { mkdirSync, promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  canonicalJsonStringify,
  type CaptureSessionEnvelope,
  type SyncBatch,
} from "@aise/shared-contracts";
import { bytesEqual, sha256Hex } from "../lib/hash";

/* ------------------------------------------------------------------ */
/* Stored record types                                                  */
/* ------------------------------------------------------------------ */

/** Immutable asset record (content address + size + media type). */
export interface StoredAsset {
  readonly contentId: string;
  readonly byteSize: number;
  readonly mediaType: string;
  readonly storedAt: string;
}

/** Projected manifest entry accumulated into a session's asset list. */
export interface SessionAssetEntry {
  readonly contentId: string;
  readonly byteSize: number;
  readonly mediaType: string;
}

/** Summary of one accepted batch, as kept in the session projection. */
export interface StoredBatch {
  readonly batchId: string;
  readonly sequence: number;
  readonly idempotencyKey: string;
  readonly contentFingerprint: string;
  readonly envelopeFingerprint: string;
  readonly acceptedAt: string;
}

/**
 * Immutable per-batch record: the verbatim decoded `SyncBatch` exactly as
 * accepted (envelope and manifest included) plus the derived fingerprints the
 * gateway uses for replay/conflict detection.
 */
export interface StoredBatchRecord {
  readonly batch: SyncBatch;
  readonly contentFingerprint: string;
  readonly envelopeFingerprint: string;
  readonly acceptedAt: string;
}

/**
 * Session projection: the LATEST accepted envelope (verbatim source
 * metadata), the accumulated asset list in first-appearance order, the
 * append-only batch history, and the sync state.
 */
export interface StoredSession {
  readonly sessionId: string;
  readonly envelope: CaptureSessionEnvelope;
  readonly assets: ReadonlyArray<SessionAssetEntry>;
  readonly batches: ReadonlyArray<StoredBatch>;
  readonly lastAcceptedSequence: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Idempotency ledger record: one idempotency key, ever. */
export interface StoredIdempotencyRecord {
  readonly idempotencyKey: string;
  readonly batchId: string;
  readonly sessionId: string;
  readonly sequence: number;
  readonly contentFingerprint: string;
}

/** Input for the atomic "accept this batch" append. */
export interface AcceptBatchInput {
  readonly sessionId: string;
  readonly batch: SyncBatch;
  readonly contentFingerprint: string;
  readonly envelopeFingerprint: string;
  readonly acceptedAt: string;
  /** Session createdAt/updatedAt stamp (gateway-owned clock). */
  readonly timestamp: string;
}

/** Outcome of storing content-addressed asset bytes. */
export type AssetPutOutcome =
  | { readonly outcome: "STORED"; readonly asset: StoredAsset }
  | { readonly outcome: "DUPLICATE"; readonly asset: StoredAsset }
  | { readonly outcome: "COLLISION"; readonly existing: StoredAsset };

/* ------------------------------------------------------------------ */
/* Store interface                                                      */
/* ------------------------------------------------------------------ */

/**
 * Persistence boundary for the capture ingestion gateway. Implementations
 * MUST be deterministic given the same call sequence and MUST NOT implement
 * ingestion policy (see module header).
 */
export interface CaptureStore {
  /** Metadata of the stored asset, or null when never stored. */
  getAsset(contentId: string): Promise<StoredAsset | null>;
  /** A copy of the stored immutable bytes, or null when never stored. */
  readAssetBytes(contentId: string): Promise<Uint8Array | null>;
  /** Store immutable content-addressed bytes (idempotent; refuses conflicts). */
  putAsset(
    contentId: string,
    bytes: Uint8Array,
    mediaType: string,
    storedAt: string,
  ): Promise<AssetPutOutcome>;
  /** Session projection, or null when no batch was ever accepted. */
  getSession(sessionId: string): Promise<StoredSession | null>;
  /** The immutable full batch record accepted at `sequence`, or null. */
  getBatchRecord(sessionId: string, sequence: number): Promise<StoredBatchRecord | null>;
  /**
   * Record an idempotency key. Returns the EXISTING record when the key is
   * already taken (put-if-absent; never overwrites), null when newly written.
   */
  putIdempotencyRecord(
    record: StoredIdempotencyRecord,
  ): Promise<StoredIdempotencyRecord | null>;
  /** The record for an idempotency key, or null when unknown. */
  getIdempotencyRecord(idempotencyKey: string): Promise<StoredIdempotencyRecord | null>;
  /** Append an accepted batch and upsert the session projection. */
  acceptBatch(input: AcceptBatchInput): Promise<StoredSession>;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                       */
/* ------------------------------------------------------------------ */

const CONTENT_ID_PATTERN = /^[0-9a-f]{64}$/;

function assertContentId(contentId: string): void {
  if (!CONTENT_ID_PATTERN.test(contentId)) {
    throw new Error("store: content id must be 64 lowercase hex characters");
  }
}

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

/* ------------------------------------------------------------------ */
/* In-memory implementation                                             */
/* ------------------------------------------------------------------ */

interface MemoryAsset {
  readonly bytes: Uint8Array;
  readonly meta: StoredAsset;
}

/** Deterministic in-memory CaptureStore (tests, embedded scenarios). */
export class InMemoryCaptureStore implements CaptureStore {
  private readonly assets = new Map<string, MemoryAsset>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly batchRecords = new Map<string, StoredBatchRecord[]>();
  private readonly idempotency = new Map<string, StoredIdempotencyRecord>();

  async getAsset(contentId: string): Promise<StoredAsset | null> {
    return this.assets.get(contentId)?.meta ?? null;
  }

  async readAssetBytes(contentId: string): Promise<Uint8Array | null> {
    const asset = this.assets.get(contentId);
    return asset === undefined ? null : new Uint8Array(asset.bytes);
  }

  async putAsset(
    contentId: string,
    bytes: Uint8Array,
    mediaType: string,
    storedAt: string,
  ): Promise<AssetPutOutcome> {
    assertContentId(contentId);
    const existing = this.assets.get(contentId);
    if (existing !== undefined) {
      if (bytesEqual(existing.bytes, bytes) && existing.meta.mediaType === mediaType) {
        return { outcome: "DUPLICATE", asset: existing.meta };
      }
      return { outcome: "COLLISION", existing: existing.meta };
    }
    const meta: StoredAsset = {
      contentId,
      byteSize: bytes.length,
      mediaType,
      storedAt,
    };
    this.assets.set(contentId, { bytes: new Uint8Array(bytes), meta });
    return { outcome: "STORED", asset: meta };
  }

  async getSession(sessionId: string): Promise<StoredSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async getBatchRecord(
    sessionId: string,
    sequence: number,
  ): Promise<StoredBatchRecord | null> {
    const records = this.batchRecords.get(sessionId);
    if (records === undefined) {
      return null;
    }
    return records.find((record) => record.batch.sequence === sequence) ?? null;
  }

  async putIdempotencyRecord(
    record: StoredIdempotencyRecord,
  ): Promise<StoredIdempotencyRecord | null> {
    const existing = this.idempotency.get(record.idempotencyKey);
    if (existing !== undefined) {
      return existing;
    }
    this.idempotency.set(record.idempotencyKey, record);
    return null;
  }

  async getIdempotencyRecord(
    idempotencyKey: string,
  ): Promise<StoredIdempotencyRecord | null> {
    return this.idempotency.get(idempotencyKey) ?? null;
  }

  async acceptBatch(input: AcceptBatchInput): Promise<StoredSession> {
    const previous = this.sessions.get(input.sessionId);
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
    const records = this.batchRecords.get(input.sessionId) ?? [];
    records.push(record);
    this.batchRecords.set(input.sessionId, records);
    this.sessions.set(input.sessionId, session);
    return session;
  }
}

/* ------------------------------------------------------------------ */
/* File-system implementation                                           */
/* ------------------------------------------------------------------ */

function sequenceFileName(sequence: number, batchId: string): string {
  const seqHex = sequence.toString(16).padStart(8, "0");
  return `${seqHex}-${sha256Hex(batchId)}.json`;
}

/**
 * File-system-backed CaptureStore rooted at `dataDir` (created on
 * construction; unwritable roots fail fast with a thrown Error so `main.ts`
 * can refuse to start). See the module header for the layout.
 */
export class FsCaptureStore implements CaptureStore {
  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(dataDir);
    for (const directory of ["content", "sessions", "idempotency"]) {
      mkdirSync(join(this.root, directory), { recursive: true });
    }
  }

  /** Absolute path of the immutable blob for a content id. */
  contentBlobPath(contentId: string): string {
    assertContentId(contentId);
    return join(this.root, "content", contentId.slice(0, 2), contentId);
  }

  /** Absolute path of the asset metadata sidecar for a content id. */
  contentMetaPath(contentId: string): string {
    return `${this.contentBlobPath(contentId)}.json`;
  }

  private sessionDir(sessionId: string): string {
    return join(this.root, "sessions", sha256Hex(sessionId));
  }

  private sessionPath(sessionId: string): string {
    return join(this.sessionDir(sessionId), "session.json");
  }

  private batchPath(sessionId: string, sequence: number, batchId: string): string {
    return join(
      this.sessionDir(sessionId),
      "batches",
      sequenceFileName(sequence, batchId),
    );
  }

  private idempotencyPath(idempotencyKey: string): string {
    return join(this.root, "idempotency", `${sha256Hex(idempotencyKey)}.json`);
  }

  async getAsset(contentId: string): Promise<StoredAsset | null> {
    return readJsonFile<StoredAsset>(this.contentMetaPath(contentId));
  }

  async readAssetBytes(contentId: string): Promise<Uint8Array | null> {
    try {
      const buffer = await fs.readFile(this.contentBlobPath(contentId));
      return new Uint8Array(buffer);
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async putAsset(
    contentId: string,
    bytes: Uint8Array,
    mediaType: string,
    storedAt: string,
  ): Promise<AssetPutOutcome> {
    const metaPath = this.contentMetaPath(contentId);
    const blobPath = this.contentBlobPath(contentId);
    const existing = await readJsonFile<StoredAsset>(metaPath);
    if (existing !== null) {
      // Immutable record: compare the incoming bytes against what is actually
      // stored before ever touching the filesystem.
      const existingBytes = await this.readAssetBytes(contentId);
      if (
        existingBytes !== null &&
        bytesEqual(existingBytes, bytes) &&
        existing.mediaType === mediaType
      ) {
        return { outcome: "DUPLICATE", asset: existing };
      }
      return { outcome: "COLLISION", existing };
    }
    await fs.mkdir(dirname(blobPath), { recursive: true });
    await fs.writeFile(blobPath, bytes);
    const asset: StoredAsset = {
      contentId,
      byteSize: bytes.length,
      mediaType,
      storedAt,
    };
    await writeJsonFile(metaPath, asset);
    return { outcome: "STORED", asset };
  }

  async getSession(sessionId: string): Promise<StoredSession | null> {
    return readJsonFile<StoredSession>(this.sessionPath(sessionId));
  }

  async getBatchRecord(
    sessionId: string,
    sequence: number,
  ): Promise<StoredBatchRecord | null> {
    const session = await this.getSession(sessionId);
    const record = session?.batches.find((batch) => batch.sequence === sequence);
    if (record === undefined || record === null) {
      return null;
    }
    const batchFile = await fs.readFile(
      this.batchPath(sessionId, sequence, record.batchId),
      "utf8",
    );
    return JSON.parse(batchFile) as StoredBatchRecord;
  }

  async putIdempotencyRecord(
    record: StoredIdempotencyRecord,
  ): Promise<StoredIdempotencyRecord | null> {
    const path = this.idempotencyPath(record.idempotencyKey);
    const existing = await readJsonFile<StoredIdempotencyRecord>(path);
    if (existing !== null) {
      return existing;
    }
    await writeJsonFile(path, record);
    return null;
  }

  async getIdempotencyRecord(
    idempotencyKey: string,
  ): Promise<StoredIdempotencyRecord | null> {
    return readJsonFile<StoredIdempotencyRecord>(this.idempotencyPath(idempotencyKey));
  }

  async acceptBatch(input: AcceptBatchInput): Promise<StoredSession> {
    const previous = await this.getSession(input.sessionId);
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
    // Append the immutable batch record first, then the rebuildable
    // projection: a crash between the two leaves an orphan batch file, never
    // a session record that claims an unrecorded batch.
    await writeJsonFile(
      this.batchPath(input.sessionId, input.batch.sequence, input.batch.batchId),
      record,
    );
    await writeJsonFile(this.sessionPath(input.sessionId), session);
    return session;
  }
}

/* ------------------------------------------------------------------ */
/* JSON file helpers                                                    */
/* ------------------------------------------------------------------ */

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const text = await fs.readFile(path, "utf8");
    return JSON.parse(text) as T;
  } catch (error) {
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, canonicalJsonStringify(value));
}
