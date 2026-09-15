/**
 * Pg twins for the BOQ stores (PROD-005).
 *
 * `PgBoqStore` implements the EXACT `BoqStore` interface the Fs/InMemory
 * twins implement (boq/store.ts — read it before changing anything here):
 * content-addressed immutable source blobs (boq_sources) and timestamp-free
 * write-once import records (boq_documents). `PgNormalizationStore`
 * implements `NormalizationStore` (boq/normalization/store.ts): derived
 * views keyed by sha256(importId + dictionaryVersion) — the same
 * content-addressed key the Fs twin computes (`normalizationViewKey`,
 * imported so the two can never drift).
 *
 * Round-trip discipline: records are written as (record_key, payload jsonb,
 * canonical text) and read back from `canonical` VERBATIM — the byte-exact
 * `canonicalJsonStringify` output the Fs twin writes to disk. The mapping
 * stores use the same in-memory fallback as the Fs default wiring (mapping
 * is deliberately NOT persisted in either mode — BoqRouteOptions.mapping is
 * optional and the server default leaves it unset).
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { bytesEqual } from "../../lib/hash";
import { BoqError, type BoqRecord } from "../../boq/model";
import type { BoqStore, PutSourceOutcome, SourceSidecar } from "../../boq/store";
import {
  normalizationViewKey,
  type NormalizationStore,
} from "../../boq/normalization/store";
import type { NormalizedBoqView } from "../../boq/normalization/types";
import type { PgExecutor } from "../executor";
import { PG_TABLES } from "../sql";
import { parseCanonicalJson, RecordTable } from "./records";

const CONTENT_ID_PATTERN = /^[0-9a-f]{64}$/;

function assertContentId(contentId: string): void {
  if (!CONTENT_ID_PATTERN.test(contentId)) {
    throw new BoqError("boq:store", "content id must be 64 lowercase hex characters");
  }
}

/** Parse a stored record JSON defensively (typed error on garbage — the Fs discipline). */
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

/** Parse a stored view defensively (typed error on garbage or mismatch). */
function parseView(text: string, importId: string, dictionaryVersion: string): NormalizedBoqView {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BoqError("boq:normalization", `view for '${importId}' is not valid JSON`);
  }
  const view = value as NormalizedBoqView;
  if (view.importId !== importId || view.dictionaryVersion !== dictionaryVersion) {
    throw new BoqError("boq:normalization", `view for '${importId}' carries a mismatching identity`);
  }
  return view;
}

export class PgBoqStore implements BoqStore {
  private readonly sources: RecordTable;
  private readonly documents: RecordTable;

  constructor(private readonly executor: PgExecutor) {
    this.sources = new RecordTable(executor, PG_TABLES.boqSources);
    this.documents = new RecordTable(executor, PG_TABLES.boqDocuments);
  }

  async putSource(
    contentId: string,
    bytes: Uint8Array,
    sidecar: SourceSidecar,
  ): Promise<PutSourceOutcome> {
    assertContentId(contentId);
    const canonical = canonicalJsonStringify(sidecar);
    const outcome = await this.sources.insertBlobIfAbsent(contentId, canonical, bytes);
    if (!outcome.wrote) {
      // Immutable record: compare the incoming bytes against what is
      // actually stored before ever touching the table.
      const existing = await this.sources.selectBlob(contentId);
      if (existing === null || !bytesEqual(new Uint8Array(existing.bytes), bytes)) {
        throw new BoqError(
          "boq:store",
          `content collision for '${contentId}' — existing source retained`,
        );
      }
      return { kind: "duplicate" };
    }
    return { kind: "stored" };
  }

  async getSourceBytes(contentId: string): Promise<Uint8Array | null> {
    assertContentId(contentId);
    const row = await this.sources.selectBlob(contentId);
    return row === null ? null : new Uint8Array(row.bytes);
  }

  async getSidecar(contentId: string): Promise<SourceSidecar | null> {
    assertContentId(contentId);
    const canonical = await this.sources.selectCanonical(contentId);
    return canonical === null
      ? null
      : (parseCanonicalJson(canonical, "boq source sidecar") as SourceSidecar);
  }

  async putRecord(record: BoqRecord): Promise<void> {
    assertContentId(record.importId);
    const text = canonicalJsonStringify(record);
    const outcome = await this.documents.insertIfAbsent(record.importId, text);
    if (!outcome.wrote && outcome.canonical !== text) {
      // Write-once: identical records are no-ops; anything else is a bug in
      // the caller (the service only writes records it just derived).
      throw new BoqError(
        "boq:store",
        `record '${record.importId}' already exists with different content`,
      );
    }
  }

  async getRecord(importId: string): Promise<BoqRecord | null> {
    const text = await this.getRecordText(importId);
    return text === null ? null : parseRecord(text, importId);
  }

  async getRecordText(importId: string): Promise<string | null> {
    assertContentId(importId);
    return this.documents.selectCanonical(importId);
  }

  async listRecords(): Promise<BoqRecord[]> {
    const texts = await this.documents.listCanonical();
    const records = texts.map((text) => parseRecord(text, (JSON.parse(text) as BoqRecord).importId));
    // Deterministic order: sorted by the importId (the Fs twin's order).
    return records.sort((a, b) =>
      a.importId < b.importId ? -1 : a.importId > b.importId ? 1 : 0,
    );
  }
}

export class PgNormalizationStore implements NormalizationStore {
  private readonly views: RecordTable;

  constructor(executor: PgExecutor) {
    this.views = new RecordTable(executor, PG_TABLES.boqNormalizations);
  }

  async put(view: NormalizedBoqView): Promise<void> {
    if (!CONTENT_ID_PATTERN.test(view.importId)) {
      throw new BoqError("boq:normalization", "import id must be 64 lowercase hex characters");
    }
    const text = canonicalJsonStringify(view);
    const key = normalizationViewKey(view.importId, view.dictionaryVersion);
    const outcome = await this.views.insertIfAbsent(key, text);
    if (!outcome.wrote && outcome.canonical !== text) {
      // Write-once: identical views are no-ops (idempotent re-normalization);
      // anything else is a determinism bug in the caller and is refused.
      throw new BoqError(
        "boq:normalization",
        `view '${view.importId}'@${view.dictionaryVersion} already exists with different content`,
      );
    }
  }

  async get(importId: string, dictionaryVersion: string): Promise<NormalizedBoqView | null> {
    const text = await this.getText(importId, dictionaryVersion);
    return text === null ? null : parseView(text, importId, dictionaryVersion);
  }

  async getText(importId: string, dictionaryVersion: string): Promise<string | null> {
    if (!CONTENT_ID_PATTERN.test(importId)) {
      throw new BoqError("boq:normalization", "import id must be 64 lowercase hex characters");
    }
    return this.views.selectCanonical(normalizationViewKey(importId, dictionaryVersion));
  }
}
