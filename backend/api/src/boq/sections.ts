/**
 * Structural section detection for BOQ sheets (AISE-011).
 *
 * Detection is STRUCTURAL ONLY — shape, never meaning:
 *  - a HEADER row is the first row with >= 3 non-empty cells whose values
 *    are ALL strings (a merged banner row above it is the section TITLE);
 *  - a TOTAL row is a row whose FIRST non-empty cell text matches one of
 *    the explicit, commented matcher list below (English + the localized
 *    spellings named in the work order);
 *  - ITEM rows are the rows strictly between the header and the first
 *    total row; rows before the header (boilerplate) are never items.
 *
 * Every detection carries its evidence (matched text + cell refs). NO
 * semantic interpretation happens here: no unit parsing, no description
 * normalization, no numeric heuristics — that is AISE-014.
 */

import type { BoqRow, BoqSheet, BoqCell } from "./model";
import { firstNonEmptyCell, parseCellRef } from "./model";

/**
 * Total-row matchers. The list is deliberately explicit and structural:
 * text SHAPE, not meaning. Keep it in sync with the tests.
 */
const TOTAL_MATCHERS: readonly { kind: TotalKind; pattern: RegExp }[] = [
  // "TOTAL", "Total:", "total to date" — the canonical grand-total keyword.
  { kind: "total", pattern: /^total\b/i },
  // "Subtotal", "Sub-Total", "SUB TOTAL" — section sub-aggregation.
  { kind: "subtotal", pattern: /^sub[-\s]?total\b/i },
  // "Carried forward" / "Carrying Forward" — page/section carry.
  { kind: "carried_forward", pattern: /^carr(?:ied|ying)\s+forward\b/i },
  // "Brought forward" — page/section bring-back.
  { kind: "brought_forward", pattern: /^brought\s+forward\b/i },
];

export type TotalKind = "total" | "subtotal" | "carried_forward" | "brought_forward";

/** Evidence for one matched total row: the verbatim text and its cell. */
export interface TotalMatch {
  readonly rowNumber: number;
  readonly cellRef: string;
  /** VERBATIM cell text that matched (evidence — never normalized). */
  readonly matchedText: string;
  readonly kind: TotalKind;
}

/** Why this section was detected the way it was (evidence, not semantics). */
export interface SectionDetection {
  readonly headerRowNumber: number;
  /** Number of non-empty string cells that qualified the header row. */
  readonly headerNonEmptyCellCount: number;
  /** Cell ref of the merged title anchor above the header, when detected. */
  readonly titleCellRef: string | null;
  /** The merged range (verbatim A1 ref) that anchored the title row. */
  readonly titleMergedRange: string | null;
  readonly totalMatches: readonly TotalMatch[];
}

/** One detected section of a sheet. All members are refs/numbers — never copies. */
export interface BoqSection {
  /** Title text from the merged title row above the header; null when none. */
  readonly title: string | null;
  /** Cell refs of the detected header cells (in row order). */
  readonly headerCells: readonly string[];
  /** Row numbers of the item rows (between header and first total row). */
  readonly itemRows: readonly number[];
  /** Row numbers of ALL matched total rows after the header. */
  readonly totalRows: readonly number[];
  readonly detection: SectionDetection;
}

/** Classify a cell text against the matcher list; null when no match. */
export function matchTotalKeyword(text: string): TotalKind | null {
  for (const matcher of TOTAL_MATCHERS) {
    if (matcher.pattern.test(text)) {
      return matcher.kind;
    }
  }
  return null;
}

/* --- header qualification -------------------------------------------- */

/**
 * A header row: >= 3 non-empty cells, every non-empty cell a string value
 * (numeric rows — quantities/rates — can never qualify). Returns the
 * non-empty cells in row order, or null.
 */
function headerCellsOf(row: BoqRow): BoqCell[] | null {
  const nonEmpty = row.cells.filter((cell) => cell.type !== "empty" && cell.raw !== "");
  if (nonEmpty.length < 3 || nonEmpty.some((cell) => typeof cell.value !== "string")) {
    return null;
  }
  return nonEmpty;
}

/** Row has at least one non-empty cell (a data row candidate). */
function hasContent(row: BoqRow): boolean {
  return firstNonEmptyCell(row) !== null;
}

/* --- merged title row ------------------------------------------------- */

/**
 * Title detection for the row ABOVE the header: a merged range whose top
 * row is that row and which spans >= 2 columns. The title text is the
 * first non-empty cell of that row (the merge anchor). Purely structural:
 * no merge evidence -> no title (null), even if the row has text.
 */
function titleOf(sheet: BoqSheet, titleRowNumber: number): { title: string; cellRef: string; mergedRange: string } | null {
  const titleRow = sheet.rows.find((row) => row.rowNumber === titleRowNumber);
  if (titleRow === undefined) {
    return null;
  }
  const anchor = firstNonEmptyCell(titleRow);
  if (anchor === null) {
    return null;
  }
  for (const range of sheet.mergedRanges) {
    const bounds = parseRange(range);
    if (bounds === null) {
      continue; // verbatim ranges that are not simple A1:B2 are ignored
    }
    if (bounds.top === titleRowNumber && bounds.right > bounds.left) {
      return { title: String(anchor.value), cellRef: anchor.ref, mergedRange: range };
    }
  }
  return null;
}

/** Parse "A1:F1" into column/row bounds; null for anything malformed. */
function parseRange(range: string): { left: number; right: number; top: number; bottom: number } | null {
  const parts = range.split(":");
  if (parts.length !== 2) {
    return null;
  }
  try {
    const topLeft = parseCellRef(parts[0] ?? "", "boq:sections");
    const bottomRight = parseCellRef(parts[1] ?? "", "boq:sections");
    return {
      left: Math.min(topLeft.col, bottomRight.col),
      right: Math.max(topLeft.col, bottomRight.col),
      top: Math.min(topLeft.row, bottomRight.row),
      bottom: Math.max(topLeft.row, bottomRight.row),
    };
  } catch {
    return null;
  }
}

/* --- section scan ------------------------------------------------------ */

/**
 * Detect all sections of one sheet (deterministic, single pass):
 * scan rows in order; a qualified header row starts a section; items run
 * until the first matched total row; every later matched total row of the
 * same section is collected; a NEW qualified header row after a section's
 * first total starts the next section. Rows before the first header are
 * boilerplate and are never classified.
 */
export function detectSections(sheet: BoqSheet): BoqSection[] {
  const sections: BoqSection[] = [];
  let current: {
    headerRowNumber: number;
    headerCells: string[];
    headerNonEmptyCellCount: number;
    itemRows: number[];
    totalMatches: TotalMatch[];
    firstTotalSeen: boolean;
  } | null = null;

  const closeCurrent = (): void => {
    if (current === null) {
      return;
    }
    const title = titleOf(sheet, current.headerRowNumber - 1);
    sections.push({
      title: title?.title ?? null,
      headerCells: current.headerCells,
      itemRows: current.itemRows,
      totalRows: current.totalMatches.map((match) => match.rowNumber),
      detection: {
        headerRowNumber: current.headerRowNumber,
        headerNonEmptyCellCount: current.headerNonEmptyCellCount,
        titleCellRef: title?.cellRef ?? null,
        titleMergedRange: title?.mergedRange ?? null,
        totalMatches: current.totalMatches,
      },
    });
    current = null;
  };

  for (const row of sheet.rows) {
    const anchor = firstNonEmptyCell(row);
    if (anchor !== null) {
      const totalKind = matchTotalKeyword(String(anchor.value));
      if (totalKind !== null && current !== null) {
        // A matched total row belongs to the open section.
        current.totalMatches.push({
          rowNumber: row.rowNumber,
          cellRef: anchor.ref,
          matchedText: String(anchor.value),
          kind: totalKind,
        });
        current.firstTotalSeen = true;
        continue;
      }
      const header = headerCellsOf(row);
      if (
        header !== null &&
        totalKind === null &&
        (current === null || current.firstTotalSeen)
      ) {
        // A qualified header row (first one, or the next section's) opens a
        // section. A total-keyword row can never open a section — the
        // `totalKind === null` guard keeps the two classifications disjoint.
        closeCurrent();
        current = {
          headerRowNumber: row.rowNumber,
          headerCells: header.map((cell) => cell.ref),
          headerNonEmptyCellCount: header.length,
          itemRows: [],
          totalMatches: [],
          firstTotalSeen: false,
        };
        continue;
      }
    }
    if (current !== null && !current.firstTotalSeen && hasContent(row)) {
      // Data row between the header and the first total row -> item.
      current.itemRows.push(row.rowNumber);
    }
  }
  closeCurrent();
  return sections;
}
