/**
 * XLSX parser tests (AISE-011): the committed binary fixture end-to-end,
 * synthetic packages for the paths the fixture does not cover (rich-text
 * shared strings, formulas, cached strings, booleans, STORED zip entries)
 * and typed error paths for broken archives/XML.
 */

import { describe, expect, test } from "bun:test";
import { BoqParseError } from "./model";
import { parseXlsx } from "./xlsx";
import { buildXlsx, buildZip, fixtureBytes, text } from "./testkit";
import type { BoqCell, BoqSheet } from "./model";

function cellOf(sheet: BoqSheet, ref: string): BoqCell | undefined {
  return sheet.rows.flatMap((row) => row.cells).find((cell) => cell.ref === ref);
}

describe("xlsx fixture parse (source-preserving)", () => {
  test("sheet name, dimension, merged range and header row", async () => {
    const doc = parseXlsx(await fixtureBytes());
    expect(doc.sheets.length).toBe(1);
    const sheet = doc.sheets[0] as BoqSheet;
    expect(sheet.name).toBe("Substructure");
    expect(sheet.dimension).toBe("A1:G7");
    // Merged range preserved VERBATIM (source order).
    expect(sheet.mergedRanges).toEqual(["A1:F1"]);
    // Header row 2: exactly the 7 column headers from shared strings.
    const headerRow = sheet.rows.find((row) => row.rowNumber === 2);
    expect(headerRow?.cells.map((cell) => cell.value)).toEqual([
      "Item",
      "Description",
      "Unit",
      "Qty",
      "Rate (GHS)",
      "Amount (GHS)",
      "Remarks",
    ]);
    // Styled-but-empty cells of the merged title row EXIST in the source.
    const row1 = sheet.rows.find((row) => row.rowNumber === 1);
    expect(row1?.cells.map((cell) => `${cell.ref}:${cell.type}`)).toEqual([
      "A1:string",
      "B1:empty",
      "C1:empty",
      "D1:empty",
      "E1:empty",
      "F1:empty",
      "G1:empty",
    ]);
  });

  test("units row is sparse; 4 data rows with exact refs/values/raw", async () => {
    const sheet = parseXlsx(await fixtureBytes()).sheets[0] as BoqSheet;
    // Units row 3: ONLY D3 exists in the source — no fabricated cells.
    const row3 = sheet.rows.find((row) => row.rowNumber === 3);
    expect(row3?.cells.length).toBe(1);
    expect(row3?.cells[0]?.ref).toBe("D3");
    expect(row3?.cells[0]?.value).toBe("nos");
    // Data rows 4-6 (plus the units row) — F5 is the watched cell.
    const f5 = cellOf(sheet, "F5");
    expect(f5?.value).toBe(20400);
    expect(f5?.raw).toBe("20400.0"); // VERBATIM source text, not reformatted
    expect(f5?.type).toBe("number");
    expect(f5?.formula).toBeUndefined(); // no formulas in the fixture
    expect(cellOf(sheet, "A4")?.value).toBe(1);
    expect(cellOf(sheet, "B4")?.value).toBe("Concrete 25MPa foundation");
    expect(cellOf(sheet, "C4")?.value).toBe("m3");
    expect(cellOf(sheet, "D4")?.value).toBe(120);
    expect(cellOf(sheet, "F4")?.value).toBe(54000);
    expect(cellOf(sheet, "G5")?.value).toBe("incl. wastage 5%");
    expect(cellOf(sheet, "G7")?.value).toBe(84600);
    // Inline-string cells parsed (A1 title + B4 description).
    expect(cellOf(sheet, "A1")?.type).toBe("string");
    expect(cellOf(sheet, "B4")?.type).toBe("string");
    // No cell carries a formula anywhere in the fixture (t="n" path).
    const allCells = sheet.rows.flatMap((row) => row.cells);
    expect(allCells.filter((cell) => cell.formula !== undefined).length).toBe(0);
    expect(allCells.filter((cell) => cell.type === "formula_cached").length).toBe(0);
  });

  test("TOTAL row and section detected with header cell refs (evidence)", async () => {
    const sheet = parseXlsx(await fixtureBytes()).sheets[0] as BoqSheet;
    expect(sheet.sections.length).toBe(1);
    const section = sheet.sections[0]!;
    expect(section.title).toBe("BILL OF QUANTITIES - SUBSTRUCTURE");
    expect(section.headerCells).toEqual(["A2", "B2", "C2", "D2", "E2", "F2", "G2"]);
    expect(section.itemRows).toEqual([3, 4, 5, 6]); // 4 data rows incl. units
    expect(section.totalRows).toEqual([7]);
    expect(section.detection.headerRowNumber).toBe(2);
    expect(section.detection.headerNonEmptyCellCount).toBe(7);
    expect(section.detection.titleCellRef).toBe("A1");
    expect(section.detection.titleMergedRange).toBe("A1:F1");
    expect(section.detection.totalMatches).toEqual([
      { rowNumber: 7, cellRef: "A7", matchedText: "TOTAL", kind: "total" },
    ]);
  });

  test("provenance closure: every detected ref resolves to a real cell", async () => {
    const sheet = parseXlsx(await fixtureBytes()).sheets[0] as BoqSheet;
    const existingRefs = new Set(sheet.rows.flatMap((row) => row.cells.map((cell) => cell.ref)));
    const existingRows = new Set(sheet.rows.map((row) => row.rowNumber));
    for (const section of sheet.sections) {
      for (const ref of section.headerCells) {
        expect(existingRefs.has(ref)).toBe(true);
      }
      for (const rowNumber of section.itemRows) {
        expect(existingRows.has(rowNumber)).toBe(true);
      }
      for (const rowNumber of section.totalRows) {
        expect(existingRows.has(rowNumber)).toBe(true);
      }
      if (section.detection.titleCellRef !== null) {
        expect(existingRefs.has(section.detection.titleCellRef)).toBe(true);
      }
      for (const match of section.detection.totalMatches) {
        expect(existingRefs.has(match.cellRef)).toBe(true);
      }
    }
  });
});

describe("xlsx synthetic packages (paths the fixture lacks)", () => {
  test("rich-text shared strings concatenate run texts", () => {
    const doc = parseXlsx(
      buildXlsx({
        sharedStrings:
          '<sst count="2" uniqueCount="2"><si><t>Plain</t></si><si><r><t>Rich </t></r><r><t>Text</t></r></si></sst>',
        worksheet:
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
          "</sheetData></worksheet>",
      }),
    );
    const sheet = doc.sheets[0] as BoqSheet;
    expect(cellOf(sheet, "A1")?.value).toBe("Plain");
    expect(cellOf(sheet, "B1")?.value).toBe("Rich Text");
    expect(cellOf(sheet, "B1")?.raw).toBe("Rich Text");
  });

  test("formulas are captured verbatim with cached values", () => {
    const doc = parseXlsx(
      buildXlsx({
        worksheet:
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="1"><c r="A1"><v>2</v></c><c r="B1"><f>A1*20400</f><v>40800</v></c></row>' +
          '<row r="2"><c r="A2" t="str"><f>"tot"&amp;1</f><v>tot1</v></c></row>' +
          '<row r="3"><c r="A3"><f>NA()</f></c></row>' +
          "</sheetData></worksheet>",
      }),
    );
    const sheet = doc.sheets[0] as BoqSheet;
    const b1 = cellOf(sheet, "B1");
    expect(b1?.type).toBe("formula_cached");
    expect(b1?.value).toBe(40800);
    expect(b1?.raw).toBe("40800");
    expect(b1?.formula).toBe("A1*20400");
    const a2 = cellOf(sheet, "A2");
    expect(a2?.type).toBe("formula_cached");
    expect(a2?.value).toBe("tot1");
    expect(a2?.formula).toBe('"tot"&1'); // entity decoded
    // Formula with no cached value: null value, formula kept.
    const a3 = cellOf(sheet, "A3");
    expect(a3?.type).toBe("formula_cached");
    expect(a3?.value).toBeNull();
    expect(a3?.formula).toBe("NA()");
  });

  test("boolean cells keep the raw v text (no TRUE/FALSE interpretation)", () => {
    const doc = parseXlsx(
      buildXlsx({
        worksheet:
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
          '<row r="1"><c r="A1" t="b"><v>1</v></c><c r="B1" t="b"><v>0</v></c></row>' +
          "</sheetData></worksheet>",
      }),
    );
    const sheet = doc.sheets[0] as BoqSheet;
    expect(cellOf(sheet, "A1")).toMatchObject({ type: "string", value: "1", raw: "1" });
    expect(cellOf(sheet, "B1")).toMatchObject({ type: "string", value: "0", raw: "0" });
  });

  test("STORED (method 0) zip entries are read like DEFLATE ones", () => {
    const doc = parseXlsx(
      buildZip([
        {
          name: "[Content_Types].xml",
          method: 0, // stored, not deflated
          data: text(
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
          ),
        },
        {
          name: "xl/workbook.xml",
          data: text(
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Stored" sheetId="1" r:id="rId1"/></sheets></workbook>',
          ),
        },
        {
          name: "xl/worksheets/sheet1.xml",
          method: 0,
          data: text(
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>',
          ),
        },
        // No rels part: the fallback conventional worksheet path applies.
      ]),
    );
    const sheet = doc.sheets[0] as BoqSheet;
    expect(sheet.name).toBe("Stored");
    expect(cellOf(sheet, "A1")?.value).toBe(7);
  });
});

describe("xlsx error paths (typed, part-named)", () => {
  test("truncated fixture: EOCD record not found", async () => {
    const bytes = await fixtureBytes();
    for (const cut of [0, 30, 500, 2000, 2360]) {
      try {
        parseXlsx(bytes.slice(0, cut));
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(BoqParseError);
        const part = (error as BoqParseError).part;
        expect(part.startsWith("zip:")).toBe(true);
      }
    }
  });

  test("not-a-zip bytes are rejected by the zip layer", () => {
    expect(() => parseXlsx(new Uint8Array(256).fill(0))).toThrow();
    try {
      parseXlsx(text("PKPKPK not a zip at all"));
      expect.unreachable();
    } catch (error) {
      expect((error as BoqParseError).part).toBe("zip:end-of-central-directory");
    }
  });

  test("malformed worksheet XML names the failing part", () => {
    // The closing </worksheet> tag is removed -> unclosed element.
    const broken =
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>';
    try {
      parseXlsx(buildXlsx({ worksheet: broken }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BoqParseError);
      expect((error as BoqParseError).part).toBe("xml:xl/worksheets/sheet1.xml");
      expect((error as BoqParseError).detail).toContain("unclosed");
    }
  });

  test("mismatched closing tag is named", () => {
    const broken =
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData></rows></sheetData></worksheet>';
    try {
      parseXlsx(buildXlsx({ worksheet: broken }));
      expect.unreachable();
    } catch (error) {
      expect((error as BoqParseError).part).toBe("xml:xl/worksheets/sheet1.xml");
      expect((error as BoqParseError).detail).toContain("mismatched");
    }
  });

  test("missing [Content_Types].xml and missing workbook are typed errors", () => {
    try {
      parseXlsx(buildZip([{ name: "unrelated.txt", data: text("x") }]));
      expect.unreachable();
    } catch (error) {
      expect((error as BoqParseError).part).toBe("xlsx:package");
      expect((error as BoqParseError).detail).toContain("[Content_Types].xml");
    }
    try {
      parseXlsx(
        buildZip([
          {
            name: "[Content_Types].xml",
            data: text(
              '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
            ),
          },
        ]),
      );
      expect.unreachable();
    } catch (error) {
      expect((error as BoqParseError).part).toBe("xlsx:workbook");
    }
  });

  test("shared string index out of range names the cell", () => {
    const worksheet =
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="C7" t="s"><v>99</v></c></row></sheetData></worksheet>';
    try {
      parseXlsx(buildXlsx({ worksheet, sharedStrings: "<sst><si><t>only</t></si></sst>" }));
      expect.unreachable();
    } catch (error) {
      expect((error as BoqParseError).detail).toContain("C7");
    }
  });

  test("non-numeric <v> for type n names the cell", () => {
    const worksheet =
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="B2"><v>abc</v></c></row></sheetData></worksheet>';
    try {
      parseXlsx(buildXlsx({ worksheet }));
      expect.unreachable();
    } catch (error) {
      expect((error as BoqParseError).detail).toContain("B2");
    }
  });

  test("unsupported cell type is a typed error", () => {
    const worksheet =
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      '<row r="1"><c r="A1" t="e"><v>#REF!</v></c></row></sheetData></worksheet>';
    try {
      parseXlsx(buildXlsx({ worksheet }));
      expect.unreachable();
    } catch (error) {
      expect((error as BoqParseError).detail).toContain("A1");
      expect((error as BoqParseError).detail).toContain("'e'");
    }
  });
});
