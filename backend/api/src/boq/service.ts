/**
 * BOQ ingestion service (AISE-011) — the policy engine over a `BoqStore`.
 *
 * Ingestion flow (source preservation FIRST, architecture-lock "BOQ Lens"):
 *
 *   1. importId = sha256(bytes) — the content hash IS the import identity,
 *      so re-importing identical bytes is inherently idempotent;
 *   2. if a record already exists for that importId, return it unchanged
 *      (no second source copy, no re-parse — the parse is a derived,
 *      re-computable projection);
 *   3. otherwise store the RAW bytes + sidecar (mediaType/byteSize/
 *      importedAt from the injected clock) BEFORE any parsing;
 *   4. parse by declared format: xlsx/csv -> document (structural section
 *      detection included); pdf -> status "unsupported_format" with the
 *      stable reason (honest unknown — text extraction is out of scope);
 *      a structurally broken file of a SUPPORTED format re-throws the
 *      typed `BoqParseError` (the bytes stay preserved; no fake outcome);
 *   5. persist the timestamp-free record (canonical JSON — byte-identical
 *      for identical bytes) and return the import envelope.
 *
 * Determinism: no wall clock (injected `clock`), no randomness; the record
 * contains no timestamps at all — `importedAt` lives in the sidecar only.
 *
 * First-wins media type: the source identity is the CONTENT; a re-import
 * of identical bytes with a different declared media type returns the
 * original record verbatim (append-only discipline — the bytes, not the
 * last header, are the source of truth; documented known limitation).
 */

import { sha256Hex } from "../lib/hash";
import { parseCsv } from "./csv";
import {
  type BoqFormat,
  type BoqImport,
  type BoqRecord,
  BoqParseError,
  PDF_UNSUPPORTED_REASON,
} from "./model";
import { parseXlsx } from "./xlsx";
import type { BoqStore } from "./store";

export interface BoqServiceOptions {
  readonly store: BoqStore;
  /** Injected clock (ISO timestamp) — deterministic in tests. */
  readonly clock: () => string;
}

export class BoqService {
  private readonly store: BoqStore;
  private readonly clock: () => string;

  constructor(options: BoqServiceOptions) {
    this.store = options.store;
    this.clock = options.clock;
  }

  /**
   * Ingest raw source bytes. Throws `BoqParseError` when a supported
   * format fails to parse (bytes remain preserved); never throws for the
   * unsupported-format (pdf) path.
   */
  async importSource(bytes: Uint8Array, mediaType: string, format: BoqFormat): Promise<BoqImport> {
    const importId = sha256Hex(bytes);

    // Idempotency: identical bytes -> identical importId -> existing record.
    const existing = await this.store.getRecord(importId);
    if (existing !== null) {
      return this.assembleImport(existing);
    }

    // Source preservation FIRST (blob + sidecar), before any parsing.
    const stored = await this.store.putSource(importId, bytes, {
      contentId: importId,
      mediaType,
      byteSize: bytes.length,
      importedAt: this.clock(),
    });

    let parse: BoqRecord["parse"];
    if (format === "xlsx") {
      const document = parseXlsx(bytes);
      parse = { status: "parsed", document };
    } else if (format === "csv") {
      const document = parseCsv(bytes);
      parse = { status: "parsed", document };
    } else {
      // Honest unknown for pdf: the source is stored; structured text
      // extraction is out of scope for AISE-011 (documented limitation).
      parse = { status: "unsupported_format", reason: PDF_UNSUPPORTED_REASON };
    }

    const record: BoqRecord = {
      importId,
      source: { contentId: importId, mediaType, byteSize: bytes.length },
      format,
      parse,
    };
    await this.store.putRecord(record);
    void stored; // "duplicate" can only occur for orphaned-but-preserved
    // sources (a previous import whose parse failed); the record write
    // below is what makes the import visible.
    return this.assembleImport(record);
  }

  /** Record + sidecar `importedAt` -> API import envelope. */
  private async assembleImport(record: BoqRecord): Promise<BoqImport> {
    const sidecar = await this.store.getSidecar(record.importId);
    return {
      importId: record.importId,
      source: {
        contentId: record.source.contentId,
        mediaType: record.source.mediaType,
        byteSize: record.source.byteSize,
        // Sidecar is written with the blob before parsing, so it always
        // exists for a recorded import; "" is the defensive fallback.
        importedAt: sidecar?.importedAt ?? "",
      },
      format: record.format,
      parse: record.parse,
    };
  }

  /** One import by id (import + document), or null when unknown. */
  async getImport(importId: string): Promise<BoqImport | null> {
    const record = await this.store.getRecord(importId);
    return record === null ? null : this.assembleImport(record);
  }

  /** All imports, ordered by importId. */
  async listImports(): Promise<BoqImport[]> {
    const imports: BoqImport[] = [];
    for (const record of await this.store.listRecords()) {
      imports.push(await this.assembleImport(record));
    }
    return imports;
  }

  /** Preserved raw bytes + original media type for a RECORDED import. */
  async getSource(importId: string): Promise<{ bytes: Uint8Array; mediaType: string } | null> {
    const record = await this.store.getRecord(importId);
    if (record === null) {
      return null;
    }
    const bytes = await this.store.getSourceBytes(importId);
    if (bytes === null) {
      throw new BoqParseError("boq:store", `preserved source for '${importId}' is missing`);
    }
    return { bytes, mediaType: record.source.mediaType };
  }
}
