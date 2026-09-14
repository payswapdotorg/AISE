/**
 * CSV parser for BOQ ingestion (AISE-011) — RFC 4180-leaning, zero deps.
 *
 * Source preservation rules (the important part):
 *  - a UTF-8 BOM (EF BB BF) is stripped before decoding; the text is
 *    decoded as UTF-8 (replacement characters for invalid sequences —
 *    never a silent re-encode);
 *  - the delimiter is SNIFFED: `;` `,` TAB and `|` are counted OUTSIDE
 *    quoted fields across the first non-empty records (up to 10); the
 *    highest count wins, ties resolved in the order `,` `;` TAB `|`;
 *    no delimiter found at all -> `,`;
 *  - quoted fields follow RFC 4180: embedded delimiters, embedded CR/LF
 *    and doubled-quote escapes (`""` -> `"` inside quotes). `value` is
 *    the UNQUOTED content; `raw` is the EXACT source slice INCLUDING the
 *    quote characters;
 *  - line endings CR, LF and CRLF are all accepted; a terminator after
 *    the final field does NOT create an extra record (the "empty trailing
 *    line" rule);
 *  - all values stay STRINGS (type "string"): coercing "20400" to a
 *    number would be interpretation — that is AISE-014 normalization;
 *  - unquoted EMPTY fields are represented sparsely (the cell is ABSENT,
 *    exactly like a cell missing from XLSX XML); a QUOTED empty field
 *    (`""`) is an explicit empty string in the source and stays present
 *    as a "string" cell with value "" and raw `""`.
 *
 * Cells get SYNTHETIC A1-style refs (letter + 1-based row) so downstream
 * provenance is uniform with XLSX; the sheet name is the constant "csv"
 * and `dimension` is the computed extent (both clearly synthetic).
 */

import {
  type BoqCell,
  type BoqDocument,
  type BoqRow,
  type BoqSheet,
  colToLetters,
  makeCellRef,
} from "./model";
import { detectSections } from "./sections";

const CSV_SHEET_NAME = "csv";
const SNIFF_RECORD_LIMIT = 10;
const DELIMITER_CANDIDATES: readonly string[] = [",", ";", "\t", "|"];

/** One parsed field: the value plus the exact source slice. */
interface CsvField {
  readonly col: number;
  readonly value: string;
  readonly raw: string;
  readonly quoted: boolean;
}

/** Strip a UTF-8 BOM and decode; returns the decoded text. */
function decodeText(bytes: Uint8Array): string {
  const hasBom =
    bytes.length >= 3 && (bytes[0] ?? 0) === 0xef && (bytes[1] ?? 0) === 0xbb && (bytes[2] ?? 0) === 0xbf;
  return new TextDecoder().decode(hasBom ? bytes.subarray(3) : bytes);
}

/**
 * Count candidate delimiters outside quoted fields over the first
 * non-empty records. A "record" ends at a CR/LF outside quotes; records
 * with no characters at all (blank lines) are skipped for sniffing.
 */
function sniffDelimiter(text: string): string {
  const counts = new Map<string, number>();
  for (const candidate of DELIMITER_CANDIDATES) {
    counts.set(candidate, 0);
  }
  let records = 0;
  let inQuotes = false;
  let recordHasContent = false;
  for (let i = 0; i < text.length && records < SNIFF_RECORD_LIMIT; i += 1) {
    const ch = text[i] ?? "";
    if (inQuotes) {
      if (ch === '"') {
        if ((text[i + 1] ?? "") === '"') {
          i += 1; // escaped quote inside a quoted field
        } else {
          inQuotes = false;
        }
      }
      recordHasContent = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      recordHasContent = true;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && (text[i + 1] ?? "") === "\n") {
        i += 1;
      }
      if (recordHasContent) {
        records += 1;
        recordHasContent = false;
      }
      continue;
    }
    if (ch !== "") {
      recordHasContent = true;
    }
    const current = counts.get(ch);
    if (current !== undefined) {
      counts.set(ch, current + 1);
    }
  }
  let best = ",";
  let bestCount = -1;
  for (const candidate of DELIMITER_CANDIDATES) {
    const count = counts.get(candidate) ?? 0;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return bestCount <= 0 ? "," : best;
}

/**
 * Split the text into records of fields, preserving exact source slices.
 * A trailing record terminator never yields an extra empty record. Blank
 * interior lines yield a record with zero fields (kept — they exist in
 * the source; no fabrication either way).
 */
function parseRecords(text: string, delimiter: string): CsvField[][] {
  const records: CsvField[][] = [];
  let fields: CsvField[] = [];
  let col = 1;
  let rawStart = 0;
  let valueStart = 0;
  let quoteEnd = -1;
  let quoted = false;
  let inQuotes = false;
  /** The CURRENT field has begun (opening quote or content seen). */
  let fieldStarted = false;
  /** The current record has any content or field boundary. */
  let recordStarted = false;

  const pushField = (endExclusive: number): void => {
    const raw = text.slice(rawStart, endExclusive);
    if (quoted) {
      // Value: between the quotes, doubled quotes collapsed. The raw slice
      // keeps everything verbatim, including both quote characters.
      const valueEnd = quoteEnd >= 0 ? quoteEnd : endExclusive;
      fields.push({
        col,
        value: text.slice(valueStart, valueEnd).replace(/""/g, '"'),
        raw,
        quoted,
      });
    } else if (raw !== "") {
      // Unquoted empty fields are absent (sparse representation).
      fields.push({ col, value: raw, raw, quoted });
    }
    col += 1;
  };

  const resetField = (nextStart: number): void => {
    rawStart = nextStart;
    valueStart = nextStart;
    quoteEnd = -1;
    quoted = false;
    fieldStarted = false;
  };

  const resetRecord = (nextStart: number): void => {
    fields = [];
    col = 1;
    resetField(nextStart);
    recordStarted = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (inQuotes) {
      if (ch === '"') {
        if ((text[i + 1] ?? "") === '"') {
          i += 1; // escaped quote — both chars stay in the raw/value slices
        } else {
          inQuotes = false;
          quoteEnd = i;
        }
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      // Opening quote of a (quoted) field.
      quoted = true;
      inQuotes = true;
      valueStart = i + 1;
      fieldStarted = true;
      recordStarted = true;
      continue;
    }
    if (ch === delimiter) {
      pushField(i);
      resetField(i + 1);
      recordStarted = true; // a field boundary exists even for empty fields
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      pushField(i);
      if (ch === "\r" && (text[i + 1] ?? "") === "\n") {
        i += 1;
      }
      // Terminator: close the record. A record that had any content or
      // field boundary is emitted; the empty string after the FINAL
      // terminator is not a record (RFC 4180 "empty trailing line" rule —
      // handled by recordStarted being false here for pure terminators).
      records.push(fields);
      resetRecord(i + 1);
      continue;
    }
    fieldStarted = true;
    recordStarted = true;
  }
  // Trailing field(s) without a terminator.
  if (recordStarted) {
    pushField(text.length);
    records.push(fields);
  }
  return records;
}

/** Parse CSV bytes into a single-sheet BoqDocument with synthetic refs. */
export function parseCsv(bytes: Uint8Array): BoqDocument {
  const text = decodeText(bytes);
  const delimiter = sniffDelimiter(text);
  const records = parseRecords(text, delimiter);

  const rows: BoqRow[] = [];
  let maxCol = 0;
  for (let rowIndex = 0; rowIndex < records.length; rowIndex += 1) {
    const rowNumber = rowIndex + 1;
    const cells: BoqCell[] = [];
    for (const field of records[rowIndex] ?? []) {
      const column = colToLetters(field.col, "csv:cells");
      cells.push({
        ref: makeCellRef(field.col, rowNumber, "csv:cells"),
        column,
        row: rowNumber,
        value: field.value,
        type: "string",
        raw: field.raw,
      });
      maxCol = Math.max(maxCol, field.col);
    }
    rows.push({ rowNumber, cells });
  }
  const dimension =
    rows.length === 0 ? null : `${colToLetters(1, "csv:dimension")}${1}:${colToLetters(maxCol || 1, "csv:dimension")}${rows.length}`;
  const sheet: BoqSheet = {
    name: CSV_SHEET_NAME,
    dimension,
    rows,
    mergedRanges: [],
    sections: [],
  };
  return { sheets: [{ ...sheet, sections: detectSections(sheet) }] };
}
