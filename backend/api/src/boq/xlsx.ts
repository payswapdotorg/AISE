/**
 * XLSX parser for BOQ ingestion (AISE-011) — zero npm dependencies.
 *
 * Reads the ECMA-376 bounded subset produced by common spreadsheet writers:
 *
 *   [Content_Types].xml   -> workbook part path (Override …/sheet.main+xml)
 *   xl/workbook.xml       -> sheet list (name + r:id), source order
 *   xl/_rels/workbook.xml.rels -> rId -> worksheet / sharedStrings targets
 *   xl/sharedStrings.xml  -> <si><t>…</t></si> AND rich-text runs
 *                            <si><r><t>a</t></r><r><t>b</t></r></si>
 *                            (run texts concatenated in document order)
 *   xl/worksheets/sheetN.xml -> dimension, sparse rows/cells, formulas,
 *                            inline strings, merged cell ranges
 *
 * Cell typing (source-preserving; NO interpretation):
 *   t="s"          shared string            -> type "string", value/raw = text
 *   t="inlineStr"  <is><t>…</t></is>        -> type "string", value/raw = text
 *   t="str"        formula-cached string    -> type "formula_cached"
 *   t="b"          boolean                  -> type "string", value/raw = the
 *                  VERBATIM <v> text ("1"/"0") — TRUE/FALSE would be an
 *                  interpretation; none is performed here
 *   t absent/"n"   number                   -> type "number", value = Number(<v>)
 *   <f> present                             -> type "formula_cached",
 *                  formula = <f> text (array/shared formula refs are NOT
 *                  reconstructed — only this cell's formula text is kept)
 *
 * Namespace prefixes are never resolved (see xml.ts); rows stay SPARSE
 * (cells missing from the XML are absent from the model, never fabricated);
 * merged ranges are preserved verbatim in source order; `dimension` is the
 * ref attribute verbatim. Any structural malformation raises a typed
 * `BoqParseError` naming the failing part ("xlsx:…" / "xml:…").
 */

import { readZipArchive, type ZipEntry } from "./zip";
import { attr, attrByLocal, childElements, findDescendant, localName, parseXml } from "./xml";
import {
  type BoqCell,
  BoqParseError,
  type BoqDocument,
  type BoqRow,
  type BoqSheet,
  makeCellRef,
  parseCellRef,
} from "./model";
import { detectSections } from "./sections";

const WORKBOOK_MAIN_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
const SHARED_STRINGS_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml";
const WORKSHEET_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const SHARED_STRINGS_REL_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings";

/** Decode entry bytes as UTF-8 XML text and parse, naming the entry on failure. */
function parseEntryXml(entries: Map<string, ZipEntry>, name: string): ReturnType<typeof parseXml> {
  const entry = entries.get(name);
  if (entry === undefined) {
    throw new BoqParseError("xlsx:package", `required part '${name}' is missing from the archive`);
  }
  return parseXml(new TextDecoder().decode(entry.data), name);
}

/** Join path segments, dropping empties ("xl", "_rels", "x.rels") -> "xl/_rels/x.rels". */
function joinPath(...segments: string[]): string {
  return segments.filter((segment) => segment !== "").join("/");
}

/** Resolve a rel target relative to the workbook part directory ("xl/…"). */
function resolveRelTarget(baseDir: string, target: string): string {
  const segments = [...baseDir.split("/"), ...target.split("/")];
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/");
}

/** Parse [Content_Types].xml -> Override/Default content types by part name. */
function contentTypes(entries: Map<string, ZipEntry>): Map<string, string> {
  const root = parseEntryXml(entries, "[Content_Types].xml");
  const overrides = new Map<string, string>();
  for (const override of childElements(root, "Override")) {
    const partName = attr(override, "PartName");
    const contentType = attr(override, "ContentType");
    if (partName !== undefined && contentType !== undefined) {
      overrides.set(partName.replace(/^\//, ""), contentType);
    }
  }
  return overrides;
}

/** Parse a .rels part into Id -> { target, type }. */
function parseRels(relsRoot: ReturnType<typeof parseXml>): Map<string, { target: string; type: string }> {
  const rels = new Map<string, { target: string; type: string }>();
  for (const rel of childElements(relsRoot, "Relationship")) {
    const id = attr(rel, "Id");
    const target = attr(rel, "Target");
    const type = attr(rel, "Type");
    if (id !== undefined && target !== undefined && type !== undefined) {
      rels.set(id, { target, type });
    }
  }
  return rels;
}

/**
 * Shared strings: each <si> is either plain (<t>text</t>) or rich text
 * (<r><t>run</t></r>…); run texts are CONCATENATED in document order
 * (whitespace inside runs is preserved verbatim — xml:space respected by
 * never trimming anywhere in this parser).
 */
function parseSharedStrings(entries: Map<string, ZipEntry>, name: string): string[] {
  const root = parseEntryXml(entries, name);
  const strings: string[] = [];
  for (const si of childElements(root, "si")) {
    let text = "";
    for (const child of si.children) {
      if (localName(child.name) === "t") {
        text += child.text;
      } else if (localName(child.name) === "r") {
        for (const runPart of child.children) {
          if (localName(runPart.name) === "t") {
            text += runPart.text;
          }
        }
      }
    }
    strings.push(text);
  }
  return strings;
}

/* --- worksheet parsing ------------------------------------------------- */

function worksheetPart(name: string): string {
  return `xlsx:worksheet(${name})`;
}

function buildCell(
  cellNode: ReturnType<typeof parseXml>,
  shared: readonly string[],
  fallbackRow: number,
  fallbackCol: number,
): BoqCell {
  const part = worksheetPart("cells");
  const rawRef = attr(cellNode, "r");
  const pos = rawRef !== undefined ? parseCellRef(rawRef, part) : { col: fallbackCol, row: fallbackRow };
  const ref = rawRef ?? makeCellRef(pos.col, pos.row, part);
  const t = attr(cellNode, "t");
  const vNode = childElements(cellNode, "v")[0];
  const fNode = childElements(cellNode, "f")[0];
  const isNode = childElements(cellNode, "is")[0];
  const formula = fNode === undefined ? undefined : fNode.text;
  const rawV = vNode === undefined ? undefined : vNode.text;

  const finish = (
    type: BoqCell["type"],
    value: string | number | null,
    raw: string,
  ): BoqCell => ({
    ref,
    column: ref.replace(/[0-9]+$/, ""),
    row: pos.row,
    value,
    type,
    raw,
    ...(formula === undefined ? {} : { formula }),
  });

  if (isNode !== undefined) {
    // Inline string: <is><t>…</t></is> (possibly split over runs — rare but
    // tolerated by concatenating all <t> descendants of <is>).
    let text = "";
    for (const child of isNode.children) {
      if (localName(child.name) === "t") {
        text += child.text;
      }
    }
    return finish("string", text, text);
  }
  if (t === "s") {
    if (rawV === undefined) {
      return finish("empty", null, "");
    }
    const index = Number.parseInt(rawV, 10);
    if (!Number.isInteger(index) || index < 0 || index >= shared.length) {
      throw new BoqParseError(part, `cell '${ref}' references shared string ${rawV} out of range`);
    }
    const text = shared[index] ?? "";
    return finish("string", text, text);
  }
  if (t === "b") {
    // Boolean: the raw <v> text ("0"/"1") is preserved WITHOUT translating
    // to TRUE/FALSE — that would be interpretation (see module header).
    return finish("string", rawV ?? null, rawV ?? "");
  }
  if (t === "str") {
    // Formula-cached string result.
    return finish("formula_cached", rawV ?? null, rawV ?? "");
  }
  if (t !== undefined && t !== "n") {
    throw new BoqParseError(part, `cell '${ref}' has unsupported type '${t}'`);
  }
  if (rawV === undefined) {
    // Empty (possibly styled) cell that exists in the source.
    return finish(formula === undefined ? "empty" : "formula_cached", null, "");
  }
  const numeric = Number(rawV);
  if (!Number.isFinite(numeric)) {
    throw new BoqParseError(part, `cell '${ref}' has non-numeric <v> '${rawV}' for type n`);
  }
  return finish(formula === undefined ? "number" : "formula_cached", numeric, rawV);
}

function parseWorksheet(name: string, xmlText: string, shared: readonly string[]): BoqSheet {
  const root = parseXml(xmlText, name);
  const dimensionNode = findDescendant(root, "dimension");
  const dimension = dimensionNode === null ? null : (attr(dimensionNode, "ref") ?? null);
  const sheetData = findDescendant(root, "sheetData");
  const rows: BoqRow[] = [];
  if (sheetData !== null) {
    let implicitRow = 0;
    for (const rowNode of childElements(sheetData, "row")) {
      const rAttr = attr(rowNode, "r");
      let rowNumber: number;
      if (rAttr !== undefined && /^\d+$/.test(rAttr)) {
        rowNumber = Number.parseInt(rAttr, 10);
      } else {
        rowNumber = implicitRow + 1; // tolerate rows without an r attribute
      }
      implicitRow = rowNumber;
      let implicitCol = 0;
      const cells: BoqCell[] = [];
      for (const cellNode of childElements(rowNode, "c")) {
        implicitCol += 1;
        cells.push(buildCell(cellNode, shared, rowNumber, implicitCol));
      }
      // Cells are stored in SOURCE order (SpreadsheetML is column-ascending
      // by convention); refs are never re-sorted, only verified to exist.
      rows.push({ rowNumber, cells });
    }
  }
  const mergedRanges: string[] = [];
  const mergeCells = findDescendant(root, "mergeCells");
  if (mergeCells !== null) {
    for (const mergeCell of childElements(mergeCells, "mergeCell")) {
      const range = attr(mergeCell, "ref");
      if (range !== undefined) {
        mergedRanges.push(range); // verbatim, source order
      }
    }
  }
  return { name, dimension, rows, mergedRanges, sections: [] };
}

/* --- workbook orchestration -------------------------------------------- */

/** Parse XLSX bytes into a BoqDocument (worksheets in workbook order). */
export function parseXlsx(bytes: Uint8Array): BoqDocument {
  const entries = readZipArchive(bytes);
  const types = contentTypes(entries);

  // Workbook part: from the …main+xml Override, else the conventional path.
  let workbookPath: string | null = null;
  for (const [partName, contentType] of types) {
    if (contentType === WORKBOOK_MAIN_CONTENT_TYPE) {
      workbookPath = partName;
      break;
    }
  }
  if (workbookPath === null && entries.has("xl/workbook.xml")) {
    workbookPath = "xl/workbook.xml";
  }
  if (workbookPath === null) {
    throw new BoqParseError("xlsx:workbook", "no workbook part found ([Content_Types].xml has no …main+xml override)");
  }
  const workbookDir = workbookPath.split("/").slice(0, -1).join("/");
  const workbookRoot = parseEntryXml(entries, workbookPath);
  const sheetsNode = findDescendant(workbookRoot, "sheets");
  if (sheetsNode === null) {
    throw new BoqParseError("xlsx:workbook", "workbook has no <sheets> element");
  }

  // Workbook rels: rId -> target (worksheets, shared strings).
  const relsPath = joinPath(workbookDir, "_rels", workbookPath.split("/").pop() ?? "");
  const rels = entries.has(relsPath)
    ? parseRels(parseEntryXml(entries, relsPath))
    : new Map<string, { target: string; type: string }>();

  // Shared strings: via rel type, via content-type override, else the
  // conventional path — whichever the archive actually contains.
  let sharedStringsPath: string | null = null;
  for (const rel of rels.values()) {
    if (rel.type === SHARED_STRINGS_REL_TYPE) {
      sharedStringsPath = resolveRelTarget(workbookDir, rel.target);
      break;
    }
  }
  if (sharedStringsPath === null) {
    for (const [partName, contentType] of types) {
      if (contentType === SHARED_STRINGS_CONTENT_TYPE) {
        sharedStringsPath = partName;
        break;
      }
    }
  }
  if (sharedStringsPath === null && entries.has("xl/sharedStrings.xml")) {
    sharedStringsPath = "xl/sharedStrings.xml";
  }
  const shared = sharedStringsPath === null ? [] : parseSharedStrings(entries, sharedStringsPath);

  // Worksheets: sheet order is the workbook's <sheet> order.
  const sheets: BoqSheet[] = [];
  for (const sheetNode of childElements(sheetsNode, "sheet")) {
    const name = attr(sheetNode, "name");
    if (name === undefined) {
      throw new BoqParseError("xlsx:workbook", "sheet entry has no name attribute");
    }
    // r:id — attribute may carry any prefix; match by local name "id".
    const rid = attr(sheetNode, "r:id") ?? attrByLocal(sheetNode, "id");
    let target: string | null = null;
    if (rid !== undefined) {
      const rel = rels.get(rid);
      if (rel !== undefined && rel.type === WORKSHEET_REL_TYPE) {
        target = resolveRelTarget(workbookDir, rel.target);
      }
    }
    if (target === null) {
      // Fallback: conventional path with the sheetId ordinal (1-based).
      const sheetId = attr(sheetNode, "sheetId") ?? String(sheets.length + 1);
      const fallback = `xl/worksheets/sheet${sheetId}.xml`;
      if (entries.has(fallback)) {
        target = fallback;
      }
    }
    if (target === null) {
      throw new BoqParseError(
        "xlsx:workbook-rels",
        `worksheet part for sheet '${name}' (r:id '${rid ?? "none"}') not found`,
      );
    }
    const targetData = entries.get(target);
    if (targetData === undefined) {
      throw new BoqParseError("xlsx:package", `worksheet part '${target}' for sheet '${name}' is missing from the archive`);
    }
    const xmlText = new TextDecoder().decode(targetData.data);
    const sheet = parseWorksheet(target, xmlText, shared);
    sheets.push({ ...sheet, name, sections: detectSections({ ...sheet, name }) });
  }
  return { sheets };
}
