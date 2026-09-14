/**
 * Normalizer tests (AISE-014) — the full-document projection over a
 * BoqDocument constructed IN-TEST that mirrors the committed binary
 * fixture (sheet "Substructure", merged A1:F1 title, 7-column header,
 * units row + 3 item rows, TOTAL row), plus uncertainty discipline
 * (keyword flips), source immutability, numbers-never-touched, structural
 * boundaries and byte-level determinism.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import type { BoqCell, BoqDocument, BoqRow, BoqSheet } from "../model";
import type { BoqSection } from "../sections";
import { DICTIONARY_VERSION } from "./dictionaries";
import { normalizeBoqDocument } from "./normalizer";
import { NORMALIZER_ID, type NormalizedBoqView } from "./types";

/* ------------------------------------------------------------------ */
/* Fixture-mirroring document                                          */
/* ------------------------------------------------------------------ */

const IMPORT_ID = `ab`.repeat(32);

function makeCell(
  ref: string,
  value: string | number | null,
  type: BoqCell["type"],
  raw: string,
): BoqCell {
  return {
    ref,
    column: ref.replace(/[0-9]/g, ""),
    row: Number(ref.replace(/[A-Z]/g, "")),
    value,
    type,
    raw,
  };
}

function empty(ref: string): BoqCell {
  return makeCell(ref, null, "empty", "");
}

function stringCell(ref: string, value: string): BoqCell {
  return makeCell(ref, value, "string", value);
}

function numberCell(ref: string, value: number, raw: string): BoqCell {
  return makeCell(ref, value, "number", raw);
}

function row(rowNumber: number, cells: readonly BoqCell[]): BoqRow {
  return { rowNumber, cells };
}

/** Mirrors the committed fixture's detected section (see xlsx.test.ts). */
const FIXTURE_SECTION: BoqSection = {
  title: "BILL OF QUANTITIES - SUBSTRUCTURE",
  headerCells: ["A2", "B2", "C2", "D2", "E2", "F2", "G2"],
  itemRows: [3, 4, 5, 6],
  totalRows: [7],
  detection: {
    headerRowNumber: 2,
    headerNonEmptyCellCount: 7,
    titleCellRef: "A1",
    titleMergedRange: "A1:F1",
    totalMatches: [{ rowNumber: 7, cellRef: "A7", matchedText: "TOTAL", kind: "total" }],
  },
};

/** Mirrors the committed fixture's sheet exactly (cells, refs, raws). */
function fixtureSheet(): BoqSheet {
  return {
    name: "Substructure",
    dimension: "A1:G7",
    mergedRanges: ["A1:F1"],
    sections: [FIXTURE_SECTION],
    rows: [
      row(1, [
        stringCell("A1", "BILL OF QUANTITIES - SUBSTRUCTURE"),
        empty("B1"), empty("C1"), empty("D1"), empty("E1"), empty("F1"), empty("G1"),
      ]),
      row(2, [
        stringCell("A2", "Item"),
        stringCell("B2", "Description"),
        stringCell("C2", "Unit"),
        stringCell("D2", "Qty"),
        stringCell("E2", "Rate (GHS)"),
        stringCell("F2", "Amount (GHS)"),
        stringCell("G2", "Remarks"),
      ]),
      row(3, [stringCell("D3", "nos")]),
      row(4, [
        numberCell("A4", 1, "1.0"),
        stringCell("B4", "Concrete 25MPa foundation"),
        stringCell("C4", "m3"),
        numberCell("D4", 120, "120.0"),
        numberCell("E4", 450, "450.0"),
        numberCell("F4", 54000, "54000.0"),
        empty("G4"),
      ]),
      row(5, [
        numberCell("A5", 2, "2.0"),
        stringCell("B5", "Steel reinforcement Y12"),
        stringCell("C5", "kg"),
        numberCell("D5", 2400, "2400.0"),
        numberCell("E5", 8.5, "8.5"),
        numberCell("F5", 20400, "20400.0"),
        stringCell("G5", "incl. wastage 5%"),
      ]),
      row(6, [
        numberCell("A6", 3, "3.0"),
        stringCell("B6", "Formwork to footings"),
        stringCell("C6", "m2"),
        numberCell("D6", 85, "85.0"),
        numberCell("E6", 120, "120.0"),
        numberCell("F6", 10200, "10200.0"),
        empty("G6"),
      ]),
      row(7, [stringCell("A7", "TOTAL"), empty("B7"), empty("C7"), empty("D7"), empty("E7"), empty("F7"), numberCell("G7", 84600, "84600.0")]),
    ],
  };
}

function fixtureDoc(): BoqDocument {
  return { sheets: [fixtureSheet()] };
}

/** The fixture sheet with one description cell replaced (mutation tests). */
function docWithDescription(rowNumber: number, value: string): BoqDocument {
  const sheet = fixtureSheet();
  const target = sheet.rows.find((r) => r.rowNumber === rowNumber);
  if (target === undefined) {
    throw new Error("no such row");
  }
  const cells = target.cells.map((c) =>
    c.ref === `B${rowNumber}` ? stringCell(`B${rowNumber}`, value) : c,
  );
  const patched: BoqRow = { rowNumber, cells };
  return {
    sheets: [
      { ...sheet, rows: sheet.rows.map((r) => (r.rowNumber === rowNumber ? patched : r)) },
    ],
  };
}

/** The fixture sheet with one unit cell replaced (mutation tests). */
function docWithUnit(rowNumber: number, value: string): BoqDocument {
  const sheet = fixtureSheet();
  const target = sheet.rows.find((r) => r.rowNumber === rowNumber);
  if (target === undefined) {
    throw new Error("no such row");
  }
  const cells = target.cells.map((c) => (c.ref === `C${rowNumber}` ? stringCell(`C${rowNumber}`, value) : c));
  const patched: BoqRow = { rowNumber, cells };
  return {
    sheets: [{ ...sheet, rows: sheet.rows.map((r) => (r.rowNumber === rowNumber ? patched : r)) }],
  };
}

/* ------------------------------------------------------------------ */
/* Full-document projection                                            */
/* ------------------------------------------------------------------ */

describe("normalizeBoqDocument over the fixture-mirroring document", () => {
  test("view identity, column roles and per-item interpretations", () => {
    const view = normalizeBoqDocument(fixtureDoc(), IMPORT_ID);
    expect(view.importId).toBe(IMPORT_ID);
    expect(view.dictionaryVersion).toBe(DICTIONARY_VERSION);
    expect(view.generatedBy).toBe(NORMALIZER_ID);

    // Column roles derived from the detected header cells (B2/C2 anchors).
    expect(view.columnRoles).toHaveLength(1);
    expect(view.columnRoles[0]).toEqual({
      sheet: "Substructure",
      sectionTitle: "BILL OF QUANTITIES - SUBSTRUCTURE",
      headerRowNumber: 2,
      descriptionColumn: "B",
      descriptionHeaderRef: "B2",
      unitColumn: "C",
      unitHeaderRef: "C2",
    });

    // The units row (row 3: only "nos" in the Qty column) has nothing to
    // interpret; rows 4-6 carry description + unit readings.
    expect(view.perItem.map((item) => item.rowNumber)).toEqual([4, 5, 6]);
    expect(view.perItem.map((item) => item.sectionTitle)).toEqual([
      "BILL OF QUANTITIES - SUBSTRUCTURE",
      "BILL OF QUANTITIES - SUBSTRUCTURE",
      "BILL OF QUANTITIES - SUBSTRUCTURE",
    ]);

    const concepts = view.perItem.map((item) => item.description?.conceptCode);
    expect(concepts).toEqual(["CONCRETE_WORK", "REINFORCEMENT", "FORMWORK"]);
    const units = view.perItem.map((item) => item.unit?.unitCode);
    expect(units).toEqual(["m3", "kg", "m2"]);

    // Description readings: original wording preserved, keyword evidence.
    const first = view.perItem[0]?.description;
    expect(first?.originalText).toBe("Concrete 25MPa foundation");
    expect(first?.normalizedText).toBe("Concrete 25MPa foundation");
    expect(first?.method).toBe("dictionary_exact");
    expect(first?.confidence).toBe("high");
    expect(first?.sourceRefs).toEqual(["Substructure!B4"]);
    expect(first?.notes).toContain("concept matched on keyword 'Concrete'");

    // Unit readings are exact canonical hits with verbatim originalText.
    expect(view.perItem[0]?.unit?.originalText).toBe("m3");
    expect(view.perItem[0]?.unit?.method).toBe("dictionary_exact");
    expect(view.perItem[0]?.unit?.sourceRefs).toEqual(["Substructure!C4"]);

    // Flat interpretation list: description then unit, per item, in order.
    expect(view.interpretations.map((i) => i.sourceRefs[0])).toEqual([
      "Substructure!B4",
      "Substructure!C4",
      "Substructure!B5",
      "Substructure!C5",
      "Substructure!B6",
      "Substructure!C6",
    ]);
  });

  test("stats: 4 item rows examined, 1 without interpretable cells, 3+3 resolved", () => {
    const view = normalizeBoqDocument(fixtureDoc(), IMPORT_ID);
    expect(view.stats).toEqual({
      totalItems: 4,
      rowsWithoutInterpretableCells: 1,
      resolvedConcepts: 3,
      unresolvedConcepts: 0,
      ambiguousDescriptions: 0,
      resolvedUnits: 3,
      unresolvedUnits: 0,
    });
  });

  test("TOTAL row is NOT normalized as an item (structural boundary respected)", () => {
    const view = normalizeBoqDocument(fixtureDoc(), IMPORT_ID);
    const referencedRows = new Set(
      view.interpretations.flatMap((i) => i.sourceRefs.map((ref) => Number(ref.split("!")[1]?.replace(/[A-Z]/g, "")))),
    );
    expect(referencedRows.has(7)).toBe(false); // TOTAL row 7 untouched
    expect(view.perItem.some((item) => item.rowNumber === 7)).toBe(false);
    // Header row and title row are not item readings either.
    expect(referencedRows.has(1)).toBe(false);
    expect(referencedRows.has(2)).toBe(false);
  });

  test("NUMBERS ARE NEVER TOUCHED: every interpretation references the description/unit columns only", () => {
    const view = normalizeBoqDocument(fixtureDoc(), IMPORT_ID);
    expect(view.interpretations.length).toBeGreaterThan(0);
    for (const interpretation of view.interpretations) {
      for (const ref of interpretation.sourceRefs) {
        expect(ref).toMatch(/^Substructure![BC][0-9]+$/);
      }
    }
    // No numeric cell's raw text ever becomes an interpretation originalText.
    const numericRaws = new Set(["120.0", "450.0", "54000.0", "2400.0", "8.5", "20400.0", "85.0", "10200.0", "84600.0", "1.0", "2.0", "3.0"]);
    for (const interpretation of view.interpretations) {
      expect(numericRaws.has(interpretation.originalText)).toBe(false);
    }
  });

  test("source immutability: the BoqDocument's canonical JSON bytes are unchanged", () => {
    const doc = fixtureDoc();
    const before = canonicalJsonStringify(doc);
    normalizeBoqDocument(doc, IMPORT_ID);
    const after = canonicalJsonStringify(doc);
    expect(after).toBe(before);
  });

  test("determinism: two runs produce byte-identical canonical views", () => {
    const first = canonicalJsonStringify(normalizeBoqDocument(fixtureDoc(), IMPORT_ID));
    const second = canonicalJsonStringify(normalizeBoqDocument(fixtureDoc(), IMPORT_ID));
    expect(first).toBe(second);
  });
});

/* ------------------------------------------------------------------ */
/* Uncertainty discipline (mutation / discrimination)                  */
/* ------------------------------------------------------------------ */

describe("uncertainty discipline: keyword flips change the outcome or drop to unresolved", () => {
  test("flipping the description keyword flips the conceptCode (no silent default)", () => {
    const concrete = normalizeBoqDocument(fixtureDoc(), IMPORT_ID);
    const blockwork = normalizeBoqDocument(docWithDescription(4, "Blockwork 225mm wall"), IMPORT_ID);
    expect(concrete.perItem[0]?.description?.conceptCode).toBe("CONCRETE_WORK");
    expect(blockwork.perItem[0]?.description?.conceptCode).toBe("MASONRY");
  });

  test("removing the keyword drops to unresolved — recorded, never defaulted", () => {
    const view = normalizeBoqDocument(docWithDescription(4, "Xyzzy works package"), IMPORT_ID);
    const description = view.perItem[0]?.description;
    expect(description?.conceptCode).toBeUndefined();
    expect(description?.confidence).toBe("uncertain");
    expect(description?.method).toBe("unresolved");
    expect(description?.notes).toContain("no concept keyword matched");
    expect(view.stats.unresolvedConcepts).toBe(1);
    expect(view.stats.resolvedConcepts).toBe(2);
  });

  test("ambiguous description records alternatives AND counts as unresolved", () => {
    const view = normalizeBoqDocument(docWithDescription(4, "steel work"), IMPORT_ID);
    const description = view.perItem[0]?.description;
    expect(description?.conceptCode).toBeUndefined();
    expect(description?.confidence).toBe("uncertain");
    const codes = (description?.alternatives ?? []).map((a) => a.code).sort();
    expect(codes).toEqual(["REINFORCEMENT", "STEELWORK"]);
    expect(view.stats.ambiguousDescriptions).toBe(1);
    // Ambiguous descriptions are unresolved classifications (documented).
    expect(view.stats.unresolvedConcepts).toBe(1);
    expect(view.stats.resolvedConcepts).toBe(2);
  });

  test("flipping a unit to a near miss drops it to unresolved with alternatives", () => {
    const view = normalizeBoqDocument(docWithUnit(4, "m33"), IMPORT_ID);
    const unit = view.perItem[0]?.unit;
    expect(unit?.unitCode).toBeUndefined();
    expect(unit?.method).toBe("unresolved");
    expect(unit?.confidence).toBe("uncertain");
    expect(unit?.alternatives?.[0]).toEqual({ code: "m3", reason: "edit distance 1 from 'm3'" });
    expect(view.stats.unresolvedUnits).toBe(1);
    expect(view.stats.resolvedUnits).toBe(2);
  });

  test("a description-only row still records its unit-less reading honestly", () => {
    // Row 4's unit cell removed entirely: description present, unit null.
    const sheet = fixtureSheet();
    const target = sheet.rows.find((r) => r.rowNumber === 4);
    if (target === undefined) {
      throw new Error("no such row");
    }
    const cells = target.cells.filter((c) => c.ref !== "C4");
    const doc: BoqDocument = {
      sheets: [{ ...sheet, rows: sheet.rows.map((r) => (r.rowNumber === 4 ? { rowNumber: 4, cells } : r)) }],
    };
    const view = normalizeBoqDocument(doc, IMPORT_ID);
    expect(view.perItem[0]?.description?.conceptCode).toBe("CONCRETE_WORK");
    expect(view.perItem[0]?.unit).toBeNull();
    expect(view.stats.resolvedUnits).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* Multi-section / multi-sheet projection and role misses              */
/* ------------------------------------------------------------------ */

describe("multi-section and multi-sheet documents", () => {
  function secondSheetSection(headerHasRoles: boolean): BoqSheet {
    const headerRow = headerHasRoles
      ? row(2, [
          stringCell("A2", "Item"),
          stringCell("B2", "Description"),
          stringCell("C2", "Unit"),
          stringCell("D2", "Qty"),
        ])
      : row(2, [
          stringCell("A2", "Ref"),
          stringCell("B2", "Works"),
          stringCell("C2", "Measure"),
          stringCell("D2", "Value"),
        ]);
    const section: BoqSection = {
      title: null,
      headerCells: ["A2", "B2", "C2", "D2"],
      itemRows: [3, 4],
      totalRows: [5],
      detection: {
        headerRowNumber: 2,
        headerNonEmptyCellCount: 4,
        titleCellRef: null,
        titleMergedRange: null,
        totalMatches: [{ rowNumber: 5, cellRef: "A5", matchedText: "Sub-Total", kind: "subtotal" }],
      },
    };
    return {
      name: "Superstructure",
      dimension: "A1:D5",
      mergedRanges: [],
      sections: [section],
      rows: [
        headerRow,
        row(3, [
          stringCell("A3", "1"),
          stringCell("B3", "Emulsion paint to walls"),
          stringCell("C3", "m2"),
          numberCell("D3", 20, "20.0"),
        ]),
        row(4, [
          stringCell("A4", "2"),
          stringCell("B4", "Hardwood door frame"),
          stringCell("C4", "nr"),
          numberCell("D4", 6, "6.0"),
        ]),
        row(5, [stringCell("A5", "Sub-Total"), numberCell("D5", 26, "26.0")]),
      ],
    };
  }

  test("sheets project in document order; per-section roles recorded; totals excluded", () => {
    const doc: BoqDocument = { sheets: [fixtureSheet(), secondSheetSection(true)] };
    const view = normalizeBoqDocument(doc, IMPORT_ID);
    expect(view.columnRoles.map((role) => role.sheet)).toEqual(["Substructure", "Superstructure"]);
    expect(view.columnRoles[1]?.sectionTitle).toBeNull();
    expect(view.columnRoles[1]?.descriptionColumn).toBe("B");
    expect(view.columnRoles[1]?.unitColumn).toBe("C");
    expect(view.perItem.map((item) => item.rowNumber)).toEqual([4, 5, 6, 3, 4]);
    expect(view.perItem[3]?.description?.conceptCode).toBe("PAINTING");
    expect(view.perItem[3]?.unit?.unitCode).toBe("m2");
    expect(view.perItem[4]?.description?.conceptCode).toBe("DOORS_WINDOWS");
    expect(view.perItem[4]?.unit?.unitCode).toBe("nr");
    expect(view.stats.totalItems).toBe(6);
    expect(view.stats.resolvedConcepts).toBe(5);
    // Sub-Total row 5 of sheet 2 is a total row — never an item reading of
    // the Superstructure sheet (row 5 of sheet 1 is a legitimate item).
    const superstructureRows = view.interpretations
      .flatMap((i) => i.sourceRefs)
      .filter((ref) => ref.startsWith("Superstructure!"))
      .map((ref) => Number(ref.split("!")[1]?.replace(/[A-Z]/g, "")));
    expect(superstructureRows).toEqual([3, 3, 4, 4]);
    expect(superstructureRows).not.toContain(5);
  });

  test("a section whose headers name NO description/unit column projects nothing (honest miss)", () => {
    const doc: BoqDocument = { sheets: [secondSheetSection(false)] };
    const view = normalizeBoqDocument(doc, IMPORT_ID);
    expect(view.columnRoles[0]?.descriptionColumn).toBeNull();
    expect(view.columnRoles[0]?.descriptionHeaderRef).toBeNull();
    expect(view.columnRoles[0]?.unitColumn).toBeNull();
    expect(view.columnRoles[0]?.unitHeaderRef).toBeNull();
    expect(view.interpretations).toHaveLength(0);
    expect(view.perItem).toHaveLength(0);
    expect(view.stats.totalItems).toBe(2);
    expect(view.stats.rowsWithoutInterpretableCells).toBe(2);
  });

  test("determinism holds across multi-sheet documents too", () => {
    const doc: BoqDocument = { sheets: [fixtureSheet(), secondSheetSection(true)] };
    const first: NormalizedBoqView = normalizeBoqDocument(doc, IMPORT_ID);
    const second: NormalizedBoqView = normalizeBoqDocument(doc, IMPORT_ID);
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
  });
});
