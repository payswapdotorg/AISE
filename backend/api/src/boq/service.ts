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
  type BoqCell,
  type BoqRow,
  type BoqSheet,
  BoqParseError,
  PDF_UNSUPPORTED_REASON,
} from "./model";
import { entryIdOf } from "./mapping/matcher";
import type { BoqMapping, MappingEntry } from "./mapping/model";
import type { NormalizedBoqView, ItemInterpretation } from "./normalization/types";
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

/* ------------------------------------------------------------------ */
/* PROD-010 — the BOQ Lens joined view (GET /v1/boq/imports/:id/lens)  */
/* ------------------------------------------------------------------ */

/**
 * The joined lens input the frozen BOQ Lens workspace consumes
 * (apps/web/src/boqlens model.ts — a STRUCTURAL MIRROR defined here on the
 * server side; a serialized `BoqLensInputView` satisfies the web types
 * as-is). Everything is READ-ONLY DISPLAY DATA assembled from three
 * untouched sources: the verbatim imported document (AISE-011), its stored
 * derived interpretation (AISE-014) and the latest stored mapping version
 * (AISE-017). NOTHING here writes, re-parses or re-interprets a source.
 */
export interface BoqLensNumericCell {
  readonly cellRef: string | null;
  readonly value: number;
}

export interface BoqLensItemView {
  readonly itemId: string;
  readonly rowNumber: number;
  readonly sectionTitle: string | null;
  readonly originalText: string;
  readonly descriptionCellRef: string | null;
  readonly unitCellRef: string | null;
  readonly unitText: string | null;
  readonly currency: string;
  readonly quantity: BoqLensNumericCell | null;
  readonly rate: BoqLensNumericCell | null;
  readonly amount: BoqLensNumericCell | null;
  readonly interpretation?: ItemInterpretation;
  readonly mapping?: MappingEntry;
}

export interface BoqLensInputView {
  readonly importId: string;
  readonly sourceName: string;
  readonly dictionaryVersion: string | null;
  readonly mappingVersion: number | null;
  readonly sourceCellRefs: readonly string[];
  readonly items: readonly BoqLensItemView[];
}

/**
 * ISO 4217 "no currency" — the honest per-row currency when the source
 * states none in its rate/amount headers. NEVER a guessed real currency.
 */
export const BOQ_LENS_NO_CURRENCY = "XXX";

/** Header label patterns that anchor the numeric column roles (structural). */
const QUANTITY_HEADER_PATTERN = /\b(?:qty|quantity)\b/i;
const RATE_HEADER_PATTERN = /\b(?:rate|price)\b/i;
const AMOUNT_HEADER_PATTERN = /\b(?:amount|total)\b/i;
/** A parenthesized ISO-4217-style token in a rate/amount header, e.g. "Rate (GHS)". */
const CURRENCY_HEADER_PATTERN = /\(([A-Z]{3})\)/;
/**
 * Strict decimal text for the CSV string-cell case: optional sign, digits,
 * optional single fractional part — NO thousands separators, NO currency
 * symbols, NO exponent. Anything else stays null (no interpretation).
 */
const STRICT_DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;

/** The numeric value of a cell when it is unambiguously numeric, else null. */
function numericValueOf(cell: BoqCell | null): number | null {
  if (cell === null || cell.type === "empty" || cell.raw === "") {
    return null;
  }
  if (typeof cell.value === "number" && Number.isFinite(cell.value)) {
    return cell.value;
  }
  if (typeof cell.value === "string" && STRICT_DECIMAL_PATTERN.test(cell.value.trim())) {
    return Number(cell.value.trim());
  }
  return null;
}

/** Sheet-qualified source ref, e.g. "Finishes!B4" (the pipeline's convention). */
function lensSourceRef(sheet: string, cell: BoqCell): string {
  return `${sheet}!${cell.ref}`;
}

/** One section's detected numeric roles (structural, evidence = header text). */
interface NumericRoles {
  readonly quantityColumn: string | null;
  readonly rateColumn: string | null;
  readonly amountColumn: string | null;
  readonly currency: string;
}

function detectNumericRoles(sheet: BoqSheet, headerRowNumber: number, headerRefs: readonly string[]): NumericRoles {
  const headerRow: BoqRow | undefined = sheet.rows.find((row) => row.rowNumber === headerRowNumber);
  let quantityColumn: string | null = null;
  let rateColumn: string | null = null;
  let amountColumn: string | null = null;
  let currency: string | null = null;
  if (headerRow !== undefined) {
    for (const ref of headerRefs) {
      const cell = headerRow.cells.find((candidate) => candidate.ref === ref);
      if (cell === undefined || typeof cell.value !== "string" || cell.value === "") {
        continue;
      }
      if (quantityColumn === null && QUANTITY_HEADER_PATTERN.test(cell.value)) {
        quantityColumn = cell.column;
      }
      if (rateColumn === null && RATE_HEADER_PATTERN.test(cell.value)) {
        rateColumn = cell.column;
        currency ??= CURRENCY_HEADER_PATTERN.exec(cell.value)?.[1] ?? null;
      }
      if (amountColumn === null && AMOUNT_HEADER_PATTERN.test(cell.value)) {
        amountColumn = cell.column;
        currency ??= CURRENCY_HEADER_PATTERN.exec(cell.value)?.[1] ?? null;
      }
    }
  }
  return {
    quantityColumn,
    rateColumn,
    amountColumn,
    // Honest absence: "XXX" is the ISO 4217 no-currency code, never a guess.
    currency: currency ?? BOQ_LENS_NO_CURRENCY,
  };
}

/** The (sheet, row) -> numeric-roles index over every detected section. */
function numericRolesByRow(doc: NonNullable<BoqImport["parse"]["document"]>): Map<string, NumericRoles> {
  const index = new Map<string, NumericRoles>();
  for (const sheet of doc.sheets) {
    for (const section of sheet.sections) {
      const roles = detectNumericRoles(sheet, section.detection.headerRowNumber, section.headerCells);
      for (const rowNumber of section.itemRows) {
        index.set(`${sheet.name}|${rowNumber}`, roles);
      }
    }
  }
  return index;
}

/** The sheet name an item interpretation's anchor source ref points into. */
function sheetOfItem(item: ItemInterpretation): string {
  const anchor = item.description?.sourceRefs[0] ?? item.unit?.sourceRefs[0] ?? "";
  return anchor.includes("!") ? (anchor.split("!")[0] ?? "") : "";
}

/**
 * Assemble the joined lens input (PROD-010). PURE: reads the passed import
 * envelope, derived view and latest mapping; writes nothing; deterministic
 * (no clock, no randomness — the mapping's own recordedAt rides along
 * verbatim inside its entries). The router owns existence/409 decisions;
 * this function only joins.
 */
export function assembleBoqLensInput(input: {
  readonly imported: BoqImport;
  readonly view: NormalizedBoqView;
  readonly mapping: BoqMapping | null;
}): BoqLensInputView {
  const { imported, view, mapping } = input;
  const doc = imported.parse.document;

  // The provenance-resolution universe: every non-empty source cell in the
  // document, sheet-qualified, in document order (R8: every cited ref must
  // be a member or the lens health check reports fabricated provenance).
  const sourceCellRefs: string[] = [];
  const rowsBySheet = new Map<string, Map<number, BoqRow>>();
  if (doc !== undefined) {
    for (const sheet of doc.sheets) {
      const rowsByNumber = new Map<number, BoqRow>();
      for (const row of sheet.rows) {
        rowsByNumber.set(row.rowNumber, row);
        for (const cell of row.cells) {
          if (cell.type !== "empty" && cell.raw !== "") {
            sourceCellRefs.push(lensSourceRef(sheet.name, cell));
          }
        }
      }
      rowsBySheet.set(sheet.name, rowsByNumber);
    }
  }
  const numericRoles = doc === undefined ? new Map<string, NumericRoles>() : numericRolesByRow(doc);
  const entriesByItem = new Map<string, MappingEntry>();
  if (mapping !== null) {
    for (const entry of mapping.entries) {
      entriesByItem.set(entry.entryId, entry);
    }
  }

  const items: BoqLensItemView[] = [];
  for (const item of view.perItem) {
    const sheetName = sheetOfItem(item);
    const row = rowsBySheet.get(sheetName)?.get(item.rowNumber);
    const roles = numericRoles.get(`${sheetName}|${item.rowNumber}`);
    const numericFor = (column: string | null): BoqLensNumericCell | null => {
      if (row === undefined || column === null || roles === undefined) {
        return null;
      }
      const cell = row.cells.find((candidate) => candidate.column === column) ?? null;
      const value = numericValueOf(cell);
      return value === null
        ? null
        : { cellRef: cell === null ? null : lensSourceRef(sheetName, cell), value };
    };
    const itemId = entryIdOf(item);
    const entry = entriesByItem.get(itemId);
    items.push({
      itemId,
      rowNumber: item.rowNumber,
      sectionTitle: item.sectionTitle,
      originalText: item.description?.originalText ?? item.unit?.originalText ?? "",
      descriptionCellRef: item.description?.sourceRefs[0] ?? null,
      unitCellRef: item.unit?.sourceRefs[0] ?? null,
      unitText: item.unit?.originalText ?? null,
      currency: roles?.currency ?? BOQ_LENS_NO_CURRENCY,
      quantity: numericFor(roles?.quantityColumn ?? null),
      rate: numericFor(roles?.rateColumn ?? null),
      amount: numericFor(roles?.amountColumn ?? null),
      interpretation: item,
      ...(entry === undefined ? {} : { mapping: entry }),
    });
  }

  return {
    importId: imported.importId,
    // Honest derived label (the import envelope carries no filename — the
    // format and content address ARE the recorded source facts).
    sourceName: `boq-import.${imported.format}`,
    dictionaryVersion: view.dictionaryVersion,
    mappingVersion: mapping === null ? null : mapping.version,
    sourceCellRefs,
    items,
  };
}
