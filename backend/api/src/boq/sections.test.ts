/**
 * Structural section detection tests (AISE-011): messy 2-row headers
 * (merged title row + column row), total keyword variants (case and
 * spelling), multi-section sheets, boilerplate exclusion, and the
 * provenance closure of every detected ref against the sheet.
 */

import { describe, expect, test } from "bun:test";
import { detectSections, matchTotalKeyword } from "./sections";
import { makeCellRef, parseCellRef, type BoqCell, type BoqRow, type BoqSheet } from "./model";

/* --- sheet builders (hand-built, no parsing involved) ---------------- */

function cell(ref: string, value: string | number | null): BoqCell {
  const pos = parseCellRef(ref, "test");
  const isEmpty = value === null;
  return {
    ref,
    column: ref.replace(/[0-9]+$/, ""),
    row: pos.row,
    value,
    type: isEmpty ? "empty" : typeof value === "number" ? "number" : "string",
    raw: isEmpty ? "" : String(value),
  };
}

function row(rowNumber: number, entries: Array<[string, string | number | null]>): BoqRow {
  return { rowNumber, cells: entries.map(([ref, value]) => cell(ref, value)) };
}

function sheet(rows: readonly BoqRow[], mergedRanges: string[] = [], name = "Test"): BoqSheet {
  return { name, dimension: null, rows, mergedRanges, sections: [] };
}

describe("total keyword matchers (explicit structural list)", () => {
  test("case-insensitive total and subtotal variants", () => {
    expect(matchTotalKeyword("TOTAL")).toBe("total");
    expect(matchTotalKeyword("Total")).toBe("total");
    expect(matchTotalKeyword("total to date")).toBe("total");
    expect(matchTotalKeyword("TOTAL:")).toBe("total");
    expect(matchTotalKeyword("Subtotal")).toBe("subtotal");
    expect(matchTotalKeyword("Sub-Total")).toBe("subtotal");
    expect(matchTotalKeyword("SUB TOTAL")).toBe("subtotal");
  });

  test("carry keywords", () => {
    expect(matchTotalKeyword("Carried forward")).toBe("carried_forward");
    expect(matchTotalKeyword("CARRYING FORWARD")).toBe("carried_forward");
    expect(matchTotalKeyword("Brought forward")).toBe("brought_forward");
  });

  test("non-matches stay unclassified (honest unknowns)", () => {
    expect(matchTotalKeyword("Totaling")).toBeNull(); // no word boundary
    expect(matchTotalKeyword("Montage")).toBeNull();
    expect(matchTotalKeyword("Total Qty")).toBe("total"); // boundary + qualifier
    expect(matchTotalKeyword("")).toBeNull();
    expect(matchTotalKeyword("124")).toBeNull();
  });
});

describe("messy headers: merged title row + column header row", () => {
  const messy = sheet(
    [
      // Row 1: merged banner (only the anchor A1 has text).
      row(1, [
        ["A1", "SECTION A — EARTHWORKS"],
        ["B1", null],
        ["C1", null],
      ]),
      // Row 2: the real column header (>= 3 non-empty string cells).
      row(2, [
        ["A2", "Item"],
        ["B2", "Description"],
        ["C2", "Amount"],
      ]),
      // Rows 3-4: items.
      row(3, [
        ["A3", 1],
        ["B3", "Excavation"],
        ["C3", 100],
      ]),
      row(4, [
        ["A4", 2],
        ["B4", "Backfill"],
        ["C4", 50],
      ]),
      // Row 5: total.
      row(5, [
        ["A5", "TOTAL"],
        ["C5", 150],
      ]),
    ],
    ["A1:C1"],
  );

  test("section title comes from the merged row above the header", () => {
    const sections = detectSections(messy);
    expect(sections.length).toBe(1);
    const section = sections[0]!;
    expect(section.title).toBe("SECTION A — EARTHWORKS");
    expect(section.headerCells).toEqual(["A2", "B2", "C2"]);
    expect(section.itemRows).toEqual([3, 4]);
    expect(section.totalRows).toEqual([5]);
    expect(section.detection.titleCellRef).toBe("A1");
    expect(section.detection.titleMergedRange).toBe("A1:C1");
    expect(section.detection.headerRowNumber).toBe(2);
    expect(section.detection.headerNonEmptyCellCount).toBe(3);
    expect(section.detection.totalMatches).toEqual([
      { rowNumber: 5, cellRef: "A5", matchedText: "TOTAL", kind: "total" },
    ]);
  });

  test("unmerged text row above the header yields NO title (structural only)", () => {
    const unmerged = sheet(messy.rows, []);
    const section = detectSections(unmerged)[0]!;
    expect(section.title).toBeNull();
    expect(section.detection.titleCellRef).toBeNull();
  });

  test("rows before the header (boilerplate) are never items", () => {
    const withBoilerplate = sheet([
      row(1, [["A1", "ACME CONSTRUCTION LTD"]]),
      row(2, [["A2", "Project: Mall"]]),
      row(3, [
        ["A3", "Item"],
        ["B3", "Description"],
        ["C3", "Amount"],
      ]),
      row(4, [
        ["A4", 1],
        ["C4", 10],
      ]),
      row(5, [
        ["A5", "Total"],
        ["C5", 10],
      ]),
    ]);
    const section = detectSections(withBoilerplate)[0]!;
    expect(section.detection.headerRowNumber).toBe(3);
    expect(section.itemRows).toEqual([4]);
    expect(section.totalRows).toEqual([5]);
  });
});

describe("multi-section sheets and post-total rows", () => {
  const multi = sheet([
    row(1, [
      ["A1", "Item"],
      ["B1", "Qty"],
      ["C1", "Rate"],
    ]),
    row(2, [
      ["A2", 1],
        ["B2", 5],
        ["C2", 10],
    ]),
    row(3, [
      ["A3", "Sub-Total"],
      ["C3", 50],
    ]),
    // Row 4: carry rows belong to section 1 as totals.
    row(4, [
      ["A4", "Carried forward"],
      ["C4", 50],
    ]),
    // Row 5: next section header (a fresh >= 3-string row after a total).
    row(5, [
      ["A5", "Item"],
      ["B5", "Qty"],
      ["C5", "Rate"],
    ]),
    row(6, [
      ["A6", 2],
      ["B6", 1],
      ["C6", 20],
    ]),
    row(7, [
      ["A7", "Brought forward"],
      ["C7", 50],
    ]),
    row(8, [
      ["A8", "TOTAL"],
      ["C8", 70],
    ]),
    // Row 9: notes AFTER the final total — not an item (no interpretation).
    row(9, [["A9", "Notes: verify on site"]]),
  ]);

  test("two sections; carries and subtotals classified; notes not items", () => {
    const sections = detectSections(multi);
    expect(sections.length).toBe(2);
    const [first, second] = sections as [typeof sections[0], typeof sections[0]];
    expect(first!.itemRows).toEqual([2]);
    expect(first!.totalRows).toEqual([3, 4]);
    expect(first!.detection.totalMatches.map((match) => match.kind)).toEqual([
      "subtotal",
      "carried_forward",
    ]);
    expect(second!.detection.headerRowNumber).toBe(5);
    expect(second!.itemRows).toEqual([6]);
    expect(second!.totalRows).toEqual([7, 8]);
    expect(second!.detection.totalMatches.map((match) => match.kind)).toEqual([
      "brought_forward",
      "total",
    ]);
    // Row 9 (after the final total) is unclassified — it is NOT an item.
    expect(second!.itemRows).not.toContain(9);
  });

  test("no qualified header means no sections (honest none)", () => {
    const narrow = sheet([
      row(1, [["A1", "only"], ["B1", "two"]]),
      row(2, [["A2", "TOTAL"]]),
    ]);
    expect(detectSections(narrow)).toEqual([]);
  });

  test("a numeric column row cannot qualify as header", () => {
    const numeric = sheet([
      row(1, [
        ["A1", 1],
        ["B1", 2],
        ["C1", 3],
      ]),
      row(2, [
        ["A2", "Item"],
        ["B2", "Qty"],
        ["C2", "Rate"],
      ]),
      row(3, [
        ["A3", "TOTAL"],
      ]),
    ]);
    const sections = detectSections(numeric);
    expect(sections.length).toBe(1);
    expect(sections[0]!.detection.headerRowNumber).toBe(2);
  });
});

describe("provenance closure (hand-built sheets)", () => {
  test("every header/item/total ref resolves to an existing cell/row", () => {
    const messy = sheet(
      [
        row(1, [["A1", "T"], ["B1", null]]),
        row(2, [["A2", "a"], ["B2", "b"], ["C2", "c"]]),
        row(3, [["A3", "x"], ["B3", "y"]]),
        row(4, [["A4", "Subtotal"], ["B4", 9]]),
      ],
      ["A1:B1"],
    );
    const refs = new Set(messy.rows.flatMap((r) => r.cells.map((c) => c.ref)));
    const rowNumbers = new Set(messy.rows.map((r) => r.rowNumber));
    for (const section of detectSections(messy)) {
      for (const ref of section.headerCells) {
        expect(refs.has(ref)).toBe(true);
      }
      for (const rowNumber of section.itemRows) {
        expect(rowNumbers.has(rowNumber)).toBe(true);
      }
      for (const rowNumber of section.totalRows) {
        expect(rowNumbers.has(rowNumber)).toBe(true);
      }
      for (const match of section.detection.totalMatches) {
        expect(refs.has(match.cellRef)).toBe(true);
        // matchedText is the VERBATIM cell text (evidence).
        const matchCell = messy.rows
          .flatMap((r) => r.cells)
          .find((c) => c.ref === match.cellRef);
        expect(matchCell?.raw).toBe(match.matchedText);
      }
    }
  });

  test("makeCellRef/parseCellRef round-trip", () => {
    for (const [ref, col, rowNumber] of [
      ["A1", 1, 1],
      ["Z9", 26, 9],
      ["AA10", 27, 10],
      ["ZZ100", 702, 100],
    ] as const) {
      expect(makeCellRef(col, rowNumber, "test")).toBe(ref);
      expect(parseCellRef(ref, "test")).toEqual({ col, row: rowNumber });
    }
  });
});
