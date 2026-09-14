/**
 * BOQ ingestion store — persistence abstraction (AISE-011).
 *
 * Contract (mirrors the AISE-004 capture-store discipline; policy lives in
 * `boq/service.ts`, this module is PERSISTENCE ONLY):
 *
 *  - Source bytes are IMMUTABLE and content-addressed: once written under
 *    `sources/<first2>/<hash>` they are never modified or deleted. A
 *    re-put of byte-identical content is an idempotent no-op (DUPLICATE);
 *    the (practically impossible) same-address-different-bytes case is
 *    refused as a COLLISION with the original retained verbatim.
 *  - The sidecar `sources/<first2>/<hash>.json` records mediaType/byteSize/
 *    importedAt and is written BEFORE parsing — source preservation comes
 *    first, the parse is a derived projection.
 *  - Import records (timestamp-free: NO importedAt inside — the document
 *    must be byte-identical for identical bytes) live under
 *    `documents/<sha256(importId)>.json` as canonical JSON
 *    (`canonicalJsonStringify` from @aise/shared-contracts), so identical
 *    state always produces identical bytes.
 *  - `InMemoryBoqStore` is the deterministic twin used by tests.
 *
 * File-system layout (`FsBoqStore`, constructed with the API dataDir; the
 * module creates the `boq/` subtree itself — no config.ts involvement):
 *
 *   <dataDir>/boq/sources/<first2>/<hash>                immutable source blob
 *   <dataDir>/boq/sources/<first2>/<hash>.json           source sidecar
 *   <dataDir>/boq/documents/<sha256(importId)>.json      import record
 */

import { existsSync, mkdirSync, promises as fs, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { bytesEqual, sha256Hex } from "../lib/hash";
import { type BoqRecord, BoqError } from "./model";

/** Sidecar record for one preserved source. */
export interface SourceSidecar {
  readonly contentId: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly importedAt: string;
}

/** Result of storing source bytes. */
export type PutSourceOutcome = { kind: "stored" } | { kind: "duplicate" };

export interface BoqStore {
  /** Content-addressed put of raw bytes + sidecar (idempotent). */
  putSource(contentId: string, bytes: Uint8Array, sidecar: SourceSidecar): Promise<PutSourceOutcome>;
  /** Raw preserved bytes by content id, or null. */
  getSourceBytes(contentId: string): Promise<Uint8Array | null>;
  /** Sidecar by content id, or null. */
  getSidecar(contentId: string): Promise<SourceSidecar | null>;
  /** Persist a timestamp-free import record (canonical JSON, write-once). */
  putRecord(record: BoqRecord): Promise<void>;
  /** Stored record by importId, or null. */
  getRecord(importId: string): Promise<BoqRecord | null>;
  /** Canonical serialized record text (byte-comparable across stores). */
  getRecordText(importId: string): Promise<string | null>;
  /** All records, ordered by importId (deterministic listing). */
  listRecords(): Promise<BoqRecord[]>;
}

/** Validate a 64-hex content id before it is used in any path. */
function assertContentId(contentId: string): void {
  if (!/^[0-9a-f]{64}$/.test(contentId)) {
    throw new BoqError("boq:store", "content id must be 64 lowercase hex characters");
  }
}

/** Parse a stored record JSON defensively (typed error on garbage). */
function parseRecord(text: string, importId: string): BoqRecord {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BoqError("boq:store", `record '${importId}' is not valid JSON`);
  }
  const record = value as BoqRecord;
  if (record.importId !== importId) {
    throw new BoqError("boq:store", `record '${importId}' carries a mismatching importId`);
  }
  return record;
}

/* ------------------------------------------------------------------ */
/* File-system implementation                                          */
/* ------------------------------------------------------------------ */

export class FsBoqStore implements BoqStore {
  private readonly sourcesDir: string;
  private readonly documentsDir: string;

  /** Fail fast when the `boq/` subtree cannot be created (mirrors capture). */
  constructor(dataDir: string) {
    const root = join(dataDir, "boq");
    this.sourcesDir = join(root, "sources");
    this.documentsDir = join(root, "documents");
    mkdirSync(this.sourcesDir, { recursive: true });
    mkdirSync(this.documentsDir, { recursive: true });
  }

  private blobPath(contentId: string): string {
    return join(this.sourcesDir, contentId.slice(0, 2), contentId);
  }

  private sidecarPath(contentId: string): string {
    return `${this.blobPath(contentId)}.json`;
  }

  private recordPath(importId: string): string {
    return join(this.documentsDir, `${sha256Hex(importId)}.json`);
  }

  async putSource(contentId: string, bytes: Uint8Array, sidecar: SourceSidecar): Promise<PutSourceOutcome> {
    assertContentId(contentId);
    const blob = this.blobPath(contentId);
    if (existsSync(blob)) {
      const existing = new Uint8Array(await fs.readFile(blob));
      if (!bytesEqual(existing, bytes)) {
        throw new BoqError("boq:store", `content collision for '${contentId}' — existing source retained`);
      }
      return { kind: "duplicate" };
    }
    await fs.mkdir(dirname(blob), { recursive: true });
    await fs.writeFile(blob, bytes);
    await fs.writeFile(this.sidecarPath(contentId), canonicalJsonStringify(sidecar));
    return { kind: "stored" };
  }

  async getSourceBytes(contentId: string): Promise<Uint8Array | null> {
    assertContentId(contentId);
    try {
      return new Uint8Array(await fs.readFile(this.blobPath(contentId)));
    } catch {
      return null;
    }
  }

  async getSidecar(contentId: string): Promise<SourceSidecar | null> {
    assertContentId(contentId);
    try {
      return JSON.parse(await fs.readFile(this.sidecarPath(contentId), "utf8")) as SourceSidecar;
    } catch {
      return null;
    }
  }

  async putRecord(record: BoqRecord): Promise<void> {
    assertContentId(record.importId);
    const path = this.recordPath(record.importId);
    const text = canonicalJsonStringify(record);
    if (existsSync(path)) {
      // Write-once: identical records are no-ops; anything else is a bug in
      // the caller (the service only writes records it just derived).
      const existing = await fs.readFile(path, "utf8");
      if (existing !== text) {
        throw new BoqError("boq:store", `record '${record.importId}' already exists with different content`);
      }
      return;
    }
    await fs.writeFile(path, text);
  }

  async getRecord(importId: string): Promise<BoqRecord | null> {
    const text = await this.getRecordText(importId);
    return text === null ? null : parseRecord(text, importId);
  }

  async getRecordText(importId: string): Promise<string | null> {
    assertContentId(importId);
    try {
      return await fs.readFile(this.recordPath(importId), "utf8");
    } catch {
      return null;
    }
  }

  async listRecords(): Promise<BoqRecord[]> {
    const records: BoqRecord[] = [];
    let names: string[];
    try {
      names = readdirSync(this.documentsDir);
    } catch {
      return records;
    }
    // Deterministic order: sorted by the importId INSIDE each record.
    for (const name of [...names].sort()) {
      if (!name.endsWith(".json")) {
        continue;
      }
      const text = await fs.readFile(join(this.documentsDir, name), "utf8");
      const parsed = JSON.parse(text) as BoqRecord;
      records.push(parsed);
    }
    return records.sort((a, b) => (a.importId < b.importId ? -1 : a.importId > b.importId ? 1 : 0));
  }
}

/* ------------------------------------------------------------------ */
/* In-memory twin (tests)                                              */
/* ------------------------------------------------------------------ */

export class InMemoryBoqStore implements BoqStore {
  private readonly sources = new Map<string, { bytes: Uint8Array; sidecar: SourceSidecar }>();
  private readonly records = new Map<string, string>();

  async putSource(contentId: string, bytes: Uint8Array, sidecar: SourceSidecar): Promise<PutSourceOutcome> {
    assertContentId(contentId);
    const existing = this.sources.get(contentId);
    if (existing !== undefined) {
      if (!bytesEqual(existing.bytes, bytes)) {
        throw new BoqError("boq:store", `content collision for '${contentId}' — existing source retained`);
      }
      return { kind: "duplicate" };
    }
    this.sources.set(contentId, { bytes: new Uint8Array(bytes), sidecar });
    return { kind: "stored" };
  }

  async getSourceBytes(contentId: string): Promise<Uint8Array | null> {
    return this.sources.get(contentId)?.bytes ?? null;
  }

  async getSidecar(contentId: string): Promise<SourceSidecar | null> {
    return this.sources.get(contentId)?.sidecar ?? null;
  }

  async putRecord(record: BoqRecord): Promise<void> {
    assertContentId(record.importId);
    const text = canonicalJsonStringify(record);
    const existing = this.records.get(record.importId);
    if (existing !== undefined && existing !== text) {
      throw new BoqError("boq:store", `record '${record.importId}' already exists with different content`);
    }
    this.records.set(record.importId, text);
  }

  async getRecord(importId: string): Promise<BoqRecord | null> {
    const text = await this.getRecordText(importId);
    return text === null ? null : parseRecord(text, importId);
  }

  async getRecordText(importId: string): Promise<string | null> {
    return this.records.get(importId) ?? null;
  }

  async listRecords(): Promise<BoqRecord[]> {
    const records: BoqRecord[] = [];
    for (const importId of [...this.records.keys()].sort()) {
      const text = this.records.get(importId) ?? "null";
      records.push(parseRecord(text, importId));
    }
    return records;
  }
}
