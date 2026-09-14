/**
 * CSV parser tests (AISE-011): delimiter sniffing, RFC 4180 quoted fields,
 * BOM/CRLF/CR handling, the empty-trailing-line rule, verbatim raw
 * preservation (quotes included) and sparse empty cells.
 */

import { describe, expect, test } from "bun:test";
import { parseCsv } from "./csv";
import type { BoqCell, BoqSheet } from "./model";

function sheetOf(text: string): BoqSheet {
  return parseCsv(new TextEncoder().encode(text)).sheets[0] as BoqSheet;
}

function cellsOf(sheet: BoqSheet, rowNumber: number): Record<string, BoqCell> {
  const row = sheet.rows.find((row) => row.rowNumber === rowNumber);
  const out: Record<string, BoqCell> = {};
  for (const cell of row?.cells ?? []) {
    out[cell.ref] = cell;
  }
  return out;
}

describe("csv delimiter sniffing", () => {
  test("semicolon vs comma vs tab", () => {
    expect(Object.keys(cellsOf(sheetOf("a;b;c\n1;2;3"), 1))).toEqual(["A1", "B1", "C1"]);
    expect(Object.keys(cellsOf(sheetOf("a,b,c\n1,2,3"), 1))).toEqual(["A1", "B1", "C1"]);
    expect(Object.keys(cellsOf(sheetOf("a\tb\tc\n1\t2\t3"), 1))).toEqual(["A1", "B1", "C1"]);
  });

  test("commas INSIDE quoted fields do not win over the real delimiter", () => {
    // Semicolon-delimited file whose quoted fields contain commas.
    const sheet = sheetOf('"x,y";z\n"1,2";3');
    expect(Object.keys(cellsOf(sheet, 1))).toEqual(["A1", "B1"]);
    expect(cellsOf(sheet, 1)["A1"]?.value).toBe("x,y");
  });

  test("comma wins over pipe when both appear as delimiters", () => {
    // Unquoted pipes in free text must not outvote the comma delimiter.
    const sheet = sheetOf("a|b,c|d\n1,2");
    expect(Object.keys(cellsOf(sheet, 1))).toEqual(["A1", "B1"]);
    expect(cellsOf(sheet, 1)["A1"]?.value).toBe("a|b");
  });

  test("no delimiter at all defaults to comma", () => {
    const sheet = sheetOf("single");
    expect(Object.keys(cellsOf(sheet, 1))).toEqual(["A1"]);
    expect(cellsOf(sheet, 1)["A1"]?.value).toBe("single");
  });
});

describe("csv quoted fields (RFC 4180)", () => {
  test("embedded commas, escaped quotes and newlines", () => {
    const sheet = sheetOf('"a,b","he said ""hi""","x\ny",z');
    const cells = cellsOf(sheet, 1);
    expect(cells["A1"]?.value).toBe("a,b");
    expect(cells["A1"]?.raw).toBe('"a,b"'); // raw keeps the quotes, verbatim
    expect(cells["B1"]?.value).toBe('he said "hi"');
    expect(cells["B1"]?.raw).toBe('"he said ""hi"""');
    expect(cells["C1"]?.value).toBe("x\ny"); // ONE cell, embedded newline
    expect(cells["C1"]?.raw).toBe('"x\ny"');
    expect(cells["D1"]?.value).toBe("z");
    // The embedded newline did NOT create a second row.
    expect(sheet.rows.length).toBe(1);
  });

  test("quoted empty field is an explicit empty string (present, not sparse)", () => {
    const sheet = sheetOf('"",a');
    const cells = cellsOf(sheet, 1);
    expect(cells["A1"]).toMatchObject({ type: "string", value: "", raw: '""' });
    expect(cells["B1"]?.value).toBe("a");
  });

  test("leading/trailing whitespace is preserved verbatim (no trimming)", () => {
    const sheet = sheetOf(" x ,y \n");
    const cells = cellsOf(sheet, 1);
    expect(cells["A1"]).toMatchObject({ value: " x ", raw: " x " });
    expect(cells["B1"]).toMatchObject({ value: "y ", raw: "y " });
  });

  test("numeric-looking values stay strings (interpretation is AISE-014)", () => {
    const cells = cellsOf(sheetOf("20400,8.5"), 1);
    expect(cells["A1"]).toMatchObject({ type: "string", value: "20400" });
    expect(cells["B1"]).toMatchObject({ type: "string", value: "8.5" });
  });
});

describe("csv line endings and BOM", () => {
  test("UTF-8 BOM is stripped", () => {
    const sheet = sheetOf("\uFEFFa,b");
    expect(cellsOf(sheet, 1)["A1"]?.value).toBe("a");
    expect(cellsOf(sheet, 1)["A1"]?.raw).toBe("a");
  });

  test("CRLF and CR-only line endings both split records", () => {
    expect(sheetOf("a,b\r\nc,d\r\n").rows.map((row) => row.rowNumber)).toEqual([1, 2]);
    expect(sheetOf("a,b\rc,d").rows.map((row) => row.rowNumber)).toEqual([1, 2]);
    expect(cellsOf(sheetOf("a,b\r\nc,d"), 2)["B2"]?.value).toBe("d");
  });

  test("final terminator does not create an empty trailing row", () => {
    const sheet = sheetOf("a,b\nc,d\n");
    expect(sheet.rows.length).toBe(2);
    expect(cellsOf(sheet, 2)["A2"]?.value).toBe("c");
  });

  test("interior blank line is kept as a zero-cell row (source-faithful)", () => {
    const sheet = sheetOf("a,b\n\nc,d");
    expect(sheet.rows.length).toBe(3);
    expect(sheet.rows[1]?.cells.length).toBe(0);
  });
});

describe("csv sparse representation and synthetic refs", () => {
  test("unquoted empty cells are ABSENT, not fabricated", () => {
    const sheet = sheetOf("a,,c\n1,2,\n");
    const row1 = cellsOf(sheet, 1);
    const row2 = cellsOf(sheet, 2);
    expect(Object.keys(row1)).toEqual(["A1", "C1"]); // B1 absent
    expect(row1["C1"]?.ref).toBe("C1");
    expect(Object.keys(row2)).toEqual(["A2", "B2"]); // C2 absent (trailing empty)
  });

  test("refs are A1-style so provenance is uniform with XLSX", () => {
    const sheet = sheetOf("h1;h2;h3\nx;y;z");
    expect(cellsOf(sheet, 2)["C2"]).toMatchObject({ ref: "C2", column: "C", row: 2 });
  });

  test("dimension is the computed sheet extent", () => {
    expect(sheetOf("a,b\nc,d").dimension).toBe("A1:B2");
    expect(sheetOf("a;b;c").dimension).toBe("A1:C1");
    expect(sheetOf("").dimension).toBeNull();
    expect(sheetOf("").rows.length).toBe(0);
  });

  test("structural detection works on CSV too (header/items/total)", () => {
    const sheet = sheetOf("Item;Description;Amount\n1;Dig;10\n2;Pour;20\nTOTAL;;30");
    expect(sheet.sections.length).toBe(1);
    const section = sheet.sections[0]!;
    expect(section.headerCells).toEqual(["A1", "B1", "C1"]);
    expect(section.itemRows).toEqual([2, 3]);
    expect(section.totalRows).toEqual([4]);
    expect(section.detection.totalMatches[0]?.matchedText).toBe("TOTAL");
  });

  test("boilerplate rows before the header are not items", () => {
    const sheet = sheetOf("ACME CONSTRUCTION LTD\nBOQ Rev C\n\nItem,Qty,Rate\nA,1,2\nTotal,,3");
    const section = sheet.sections[0]!;
    expect(section.itemRows).toEqual([5]);
    expect(section.detection.headerRowNumber).toBe(4);
  });
});
