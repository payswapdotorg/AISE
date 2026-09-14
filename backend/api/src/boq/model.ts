/**
 * BOQ Lens domain model (AISE-011) — source-preserving ingestion types.
 *
 * Contract (spec/work-orders.md §011; spec/architecture-lock.md "BOQ Lens";
 * spec/requirements.md R8):
 *
 *  - The ORIGINAL source wording is preserved exactly: every cell keeps a
 *    VERBATIM `raw` text slice (including leading/trailing whitespace and,
 *    for CSV quoted fields, the quote characters themselves). Formatting and
 *    interpretation are FORBIDDEN here — semantic normalization is AISE-014.
 *  - The parse result is a DERIVED, re-computable projection of the stored
 *    bytes: same bytes -> same importId (sha-256 content address) -> a
 *    byte-identical document (canonical JSON, no timestamps inside).
 *  - Structural detection (headers/items/totals) is shape-based only and
 *    every detection carries its evidence (matched text + cell refs).
 *
 * Known model limitations (deliberate, documented in the work order):
 *  - PDF sources are stored and registered with `unsupported_format` +
 *    explicit reason; text extraction is out of scope for AISE-011.
 *  - XLSX support is a bounded subset (see zip.ts / xlsx.ts headers).
 */

import type { BoqSection } from "./sections";

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/**
 * Base typed BOQ error. `part` names the FAILING STRUCTURE (e.g.
 * "zip:end-of-central-directory", "xml:xl/worksheets/sheet1.xml",
 * "xlsx:shared-strings", "boq:store") so callers and tests can assert
 * exactly which layer rejected the input. Never carries source bytes.
 */
export class BoqError extends Error {
  constructor(
    readonly part: string,
    readonly detail: string,
  ) {
    super(`${part}: ${detail}`);
    this.name = "BoqError";
  }
}

/** Typed parse error (a BoqError raised by a parser layer). */
export class BoqParseError extends BoqError {
  constructor(part: string, detail: string) {
    super(part, detail);
    this.name = "BoqParseError";
  }
}

/* ------------------------------------------------------------------ */
/* Document model (verbatim-preserving)                                */
/* ------------------------------------------------------------------ */

/** A single cell exactly as found in the source, plus its provenance ref. */
export interface BoqCell {
  /** A1-style cell reference, e.g. "B4" (synthetic for CSV rows). */
  readonly ref: string;
  /** Column letters of `ref`, e.g. "B". */
  readonly column: string;
  /** Row number of `ref`, e.g. 4. */
  readonly row: number;
  /** Value as sourced: number for numeric cells, string otherwise, null when empty. */
  readonly value: string | number | null;
  /**
   * Structural value kind. `formula_cached` = the cell carries a cached
   * formula result (`<f>` present in XLSX, or `t="str"`). CSV cells are
   * always `string` — numeric coercion is AISE-014 normalization, not
   * ingestion.
   */
  readonly type: "number" | "string" | "formula_cached" | "empty";
  /** VERBATIM source text of the value (whitespace and quotes untouched). */
  readonly raw: string;
  /** Formula text when the source cell carries one (XLSX `<f>` content). */
  readonly formula?: string;
}

/** One row of a sheet. Cells absent from the source are absent here. */
export interface BoqRow {
  readonly rowNumber: number;
  readonly cells: readonly BoqCell[];
}

/**
 * One worksheet. `sections` is the derived structural projection (headers,
 * items, totals) — recomputed from the rows alone, never stored semantics.
 */
export interface BoqSheet {
  readonly name: string;
  /** `<dimension ref="...">` verbatim; computed extent for CSV; null when absent. */
  readonly dimension: string | null;
  readonly rows: readonly BoqRow[];
  /** Merged cell ranges as A1-style refs, VERBATIM source order (XLSX only). */
  readonly mergedRanges: readonly string[];
  readonly sections: readonly BoqSection[];
}

/** Parsed spreadsheet: one sheet per worksheet / one synthetic sheet for CSV. */
export interface BoqDocument {
  readonly sheets: readonly BoqSheet[];
}

/* ------------------------------------------------------------------ */
/* Import envelope                                                     */
/* ------------------------------------------------------------------ */

/** Supported ingestion formats. `pdf` is stored-but-not-parsed (honest unknown). */
export type BoqFormat = "xlsx" | "csv" | "pdf";

/**
 * Outcome of parsing a stored source. Only two statuses exist by design:
 * `parsed` (document present) and `unsupported_format` (source preserved,
 * reason recorded — the PDF known limitation). Structurally broken files
 * of a SUPPORTED format raise `BoqParseError` instead of a fake outcome.
 */
export interface ParseOutcome {
  readonly status: "parsed" | "unsupported_format";
  readonly document?: BoqDocument;
  readonly reason?: string;
}

/** The timestamp-free record persisted under `documents/` (canonical JSON). */
export interface BoqRecord {
  /** Content hash of the source bytes — the import identity. */
  readonly importId: string;
  readonly source: {
    readonly contentId: string;
    readonly mediaType: string;
    readonly byteSize: number;
  };
  readonly format: BoqFormat;
  readonly parse: ParseOutcome;
}

/** The API-facing import: record + `importedAt` injected from the sidecar. */
export interface BoqImport {
  readonly importId: string;
  readonly source: {
    readonly contentId: string;
    readonly mediaType: string;
    readonly byteSize: number;
    readonly importedAt: string;
  };
  readonly format: BoqFormat;
  readonly parse: ParseOutcome;
}

/** Stable machine-readable reason recorded for un-parsed PDF sources. */
export const PDF_UNSUPPORTED_REASON =
  "pdf_text_extraction_not_implemented: source bytes are preserved verbatim; " +
  "structured PDF text extraction is out of scope for AISE-011 (see known limitations)";

/* ------------------------------------------------------------------ */
/* A1-ref helpers (column letters <-> index)                           */
/* ------------------------------------------------------------------ */

const REF_PATTERN = /^([A-Z]+)([1-9][0-9]*)$/;

/** 1 -> "A", 26 -> "Z", 27 -> "AA". Throws BoqParseError on out-of-range. */
export function colToLetters(column: number, part: string): string {
  if (!Number.isInteger(column) || column < 1 || column > 16384) {
    throw new BoqParseError(part, `invalid column index ${column}`);
  }
  let remaining = column;
  let letters = "";
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return letters;
}

/** "B4" -> { col: 2, row: 4 }. Throws BoqParseError naming `part` on garbage. */
export function parseCellRef(ref: string, part: string): { col: number; row: number } {
  const match = REF_PATTERN.exec(ref);
  if (match === null) {
    throw new BoqParseError(part, `malformed cell ref '${ref}'`);
  }
  const letters = match[1] ?? "";
  let col = 0;
  for (const ch of letters) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return { col, row: Number.parseInt(match[2] ?? "0", 10) };
}

/** { col: 2, row: 4 } -> "B4". */
export function makeCellRef(column: number, row: number, part: string): string {
  return `${colToLetters(column, part)}${row}`;
}

/** First non-empty (value !== null && raw !== "") cell of a row, or null. */
export function firstNonEmptyCell(row: BoqRow): BoqCell | null {
  for (const cell of row.cells) {
    if (cell.type !== "empty" && cell.raw !== "") {
      return cell;
    }
  }
  return null;
}
