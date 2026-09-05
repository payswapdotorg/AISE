/**
 * Built-in DXF structural conformance validator (AISE-019).
 *
 * Parses the emitted DXF 2000 ASCII text and checks the profile
 * the serializer actually emits — the AISE-018 discipline of a
 * self-conformance check that is honest about its own scope:
 *
 * - this is a SUBSET-LEVEL structural validator for the emitted
 *   profile (sections, tables, entity shapes, XDATA, referential
 *   integrity of handles/layers/styles/appids), NOT a complete
 *   AutoCAD conformance authority — full external-tool
 *   conformance is not claimed anywhere by this package;
 * - it validates STRUCTURE, never geometry semantics (a wrong
 *   coordinate would still be well-formed — the projection and
 *   golden suites own coordinate truth);
 * - the runtime self-check calls it on every produced file, so
 *   the service never returns a file that fails its own
 *   validator.
 *
 * The checks mirror `dxf.ts` exactly (same order, same required
 * tables, same entity group patterns) — a mutation that breaks
 * either side is caught by the paired tests.
 */
import { ExportDxfError } from "./errors.js";

/** One parsed group-code pair. */
export interface DxfGroup {
  readonly code: number;
  readonly value: string;
  /** 1-based line number of the code line (diagnostics). */
  readonly line: number;
}

/** Validation statistics (observability; the checks are the truth). */
export interface DxfValidationStats {
  readonly sections: readonly string[];
  readonly tables: readonly string[];
  readonly layers: readonly string[];
  readonly appids: readonly string[];
  readonly styles: readonly string[];
  readonly entities: number;
  readonly entityTypes: Readonly<Record<string, number>>;
  readonly handles: number;
  readonly maxHandle: number;
  readonly xdataStrings: number;
}

/** The successful validation result. */
export interface DxfValidationResult {
  readonly ok: true;
  readonly stats: DxfValidationStats;
}

/** The required tables in the emitted profile (order matters). */
const REQUIRED_TABLES: readonly string[] = ["VPORT", "LTYPE", "LAYER", "STYLE", "APPID", "BLOCK_RECORD"];

const HEX_PATTERN = /^[0-9A-Fa-f]+$/;

/**
 * Parses the raw DXF text into group-code pairs.
 *
 * Fail-closed: unparseable code lines, trailing garbage, or
 * non-printable-ASCII values throw `ExportDxfError`.
 */
export function parseDxfGroups(text: string): DxfGroup[] {
  if (text.length === 0) {
    throw new ExportDxfError("DXF_INVALID", "DXF text is empty", { details: { stage: "parse" } });
  }
  const rawLines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  if (rawLines.length % 2 !== 1 || rawLines[rawLines.length - 1] !== "") {
    throw new ExportDxfError("DXF_INVALID", "DXF must consist of code/value line pairs plus one trailing newline", {
      details: { stage: "parse", lines: rawLines.length },
    });
  }
  const lines = rawLines.slice(0, -1);
  const groups: DxfGroup[] = [];
  for (let index = 0; index < lines.length; index += 2) {
    const codeLine = lines[index] ?? "";
    const valueLine = lines[index + 1] ?? "";
    if (!/^\d+$/.test(codeLine)) {
      throw new ExportDxfError("DXF_INVALID", `group code line is not a non-negative integer: ${codeLine}`, {
        details: { stage: "parse", line: index + 1, code: codeLine },
      });
    }
    for (const char of valueLine) {
      const codePoint = char.charCodeAt(0);
      if (codePoint < 0x20 || codePoint > 0x7e) {
        throw new ExportDxfError(
          "DXF_INVALID",
          `DXF value contains non-printable-ASCII: 0x${codePoint.toString(16)}`,
          { details: { stage: "parse", line: index + 2, codePoint } },
        );
      }
    }
    groups.push({ code: Number(codeLine), value: valueLine, line: index + 1 });
  }
  return groups;
}

/**
 * Validates the complete emitted profile. Throws typed
 * `ExportDxfError` (code `DXF_INVALID`) on the FIRST violation,
 * with the failing line and context in `details`.
 */
export function validateDxf(text: string): DxfValidationResult {
  const groups = parseDxfGroups(text);
  const cursor = new Cursor(groups);

  // --- File structure: SECTION...ENDSEC sequence, then EOF --------
  const sections: string[] = [];
  const layerNames: string[] = [];
  const appids: string[] = [];
  const styles: string[] = [];
  const tableNames: string[] = [];
  const entityTypes: Record<string, number> = {};
  const handles = new Set<string>();
  let entities = 0;
  let xdataStrings = 0;
  let maxHandle = 0;
  let header: { acadver?: string; insunits?: number; measurement?: number; handseed?: string } = {};
  const blockNames: string[] = [];

  // Leading 999 comments (file-level provenance) are legal and skipped.

  const last = groups[groups.length - 1];
  if (last === undefined || last.code !== 0 || last.value !== "EOF") {
    throw new ExportDxfError("DXF_INVALID", "DXF must end with the 0/EOF pair", {
      details: { stage: "structure", last: last === undefined ? "(none)" : `${last.code}/${last.value}` },
    });
  }

  while (true) {
    const group = cursor.peek();
    if (group === undefined) {
      break;
    }
    if (group.code === 999) {
      cursor.next();
      continue;
    }
    if (group.code === 0 && group.value === "EOF") {
      break;
    }
    cursor.expectPair(0, "SECTION", "structure");
    const name = cursor.expectCode(2, "section name");
    sections.push(name.value);
    if (name.value === "HEADER") {
      header = validateHeader(cursor);
    } else if (name.value === "TABLES") {
      validateTables(cursor, { tableNames, layerNames, appids, styles, handles, noteMax: (h) => (maxHandle = Math.max(maxHandle, h)) });
    } else if (name.value === "BLOCKS") {
      validateBlocks(cursor, blockNames, handles, (h) => (maxHandle = Math.max(maxHandle, h)));
    } else if (name.value === "ENTITIES") {
      const result = validateEntities(cursor, {
        layerNames,
        styles,
        appids,
        handles,
        noteMax: (h) => (maxHandle = Math.max(maxHandle, h)),
      });
      entities = result.entities;
      xdataStrings = result.xdataStrings;
      Object.assign(entityTypes, result.entityTypes);
    } else {
      throw new ExportDxfError("DXF_INVALID", `unexpected section: ${name.value}`, {
        details: { stage: "structure", section: name.value, line: name.line },
      });
    }
  }

  // --- Post-conditions --------------------------------------------
  const requiredSections = ["HEADER", "TABLES", "BLOCKS", "ENTITIES"];
  for (const required of requiredSections) {
    if (!sections.includes(required)) {
      throw new ExportDxfError("DXF_INVALID", `required section missing: ${required}`, {
        details: { stage: "structure", sections },
      });
    }
  }
  for (const required of REQUIRED_TABLES) {
    if (!tableNames.includes(required)) {
      throw new ExportDxfError("DXF_INVALID", `required table missing: ${required}`, {
        details: { stage: "tables", tables: tableNames },
      });
    }
  }
  if (header.acadver !== "AC1015") {
    throw new ExportDxfError("DXF_INVALID", `$ACADVER must be AC1015: ${String(header.acadver)}`, {
      details: { stage: "header", acadver: String(header.acadver) },
    });
  }
  if (header.insunits === undefined || !Number.isInteger(header.insunits) || header.insunits < 0) {
    throw new ExportDxfError("DXF_INVALID", `$INSUNITS must be a non-negative integer: ${String(header.insunits)}`, {
      details: { stage: "header", insunits: String(header.insunits) },
    });
  }
  if (header.measurement !== 0 && header.measurement !== 1) {
    throw new ExportDxfError("DXF_INVALID", `$MEASUREMENT must be 0 or 1: ${String(header.measurement)}`, {
      details: { stage: "header", measurement: String(header.measurement) },
    });
  }
  if (header.handseed === undefined || !HEX_PATTERN.test(header.handseed)) {
    throw new ExportDxfError("DXF_INVALID", `$HANDSEED must be a hex string: ${String(header.handseed)}`, {
      details: { stage: "header", handseed: String(header.handseed) },
    });
  }
  const handseedValue = parseInt(header.handseed, 16);
  if (maxHandle >= handseedValue) {
    throw new ExportDxfError("DXF_INVALID", `$HANDSEED must exceed every used handle: ${header.handseed} <= ${maxHandle.toString(16).toUpperCase()}`, {
      details: { stage: "header", handseed: header.handseed, maxHandle: maxHandle.toString(16).toUpperCase() },
    });
  }
  for (const required of ["*Model_Space", "*Paper_Space"]) {
    if (!blockNames.includes(required)) {
      throw new ExportDxfError("DXF_INVALID", `required block missing: ${required}`, {
        details: { stage: "blocks", blocks: blockNames },
      });
    }
  }
  if (!appids.includes("AISE") || !appids.includes("ACAD")) {
    throw new ExportDxfError("DXF_INVALID", "APPID table must register ACAD and AISE", {
      details: { stage: "tables", appids },
    });
  }
  if (!styles.includes("STANDARD")) {
    throw new ExportDxfError("DXF_INVALID", "STYLE table must define STANDARD", {
      details: { stage: "tables", styles },
    });
  }

  return {
    ok: true,
    stats: {
      sections: Object.freeze(sections),
      tables: Object.freeze(tableNames),
      layers: Object.freeze(layerNames),
      appids: Object.freeze(appids),
      styles: Object.freeze(styles),
      entities,
      entityTypes: Object.freeze(entityTypes),
      handles: handles.size,
      maxHandle,
      xdataStrings,
    },
  };
}

// ---------------------------------------------------------------------------
// Section validators
// ---------------------------------------------------------------------------

function validateHeader(cursor: Cursor): { acadver?: string; insunits?: number; measurement?: number; handseed?: string } {
  let acadver: string | undefined;
  let insunits: number | undefined;
  let measurement: number | undefined;
  let handseed: string | undefined;
  let sawEndsec = false;
  while (true) {
    const group = cursor.peek();
    if (group === undefined) {
      break;
    }
    if (group.code === 0 && group.value === "ENDSEC") {
      cursor.next();
      sawEndsec = true;
      break;
    }
    if (group.code === 9) {
      const variable = cursor.next().value;
      const value = cursor.next();
      switch (variable) {
        case "$ACADVER":
          acadver = value.value;
          break;
        case "$INSUNITS":
          insunits = integerOf(value);
          break;
        case "$MEASUREMENT":
          measurement = integerOf(value);
          break;
        case "$HANDSEED":
          handseed = value.value;
          break;
        default:
          break; // comments/other variables tolerated
      }
      continue;
    }
    // 999 comments are tolerated anywhere in the header.
    if (group.code === 999) {
      cursor.next();
      continue;
    }
    throw new ExportDxfError("DXF_INVALID", `unexpected group in HEADER: ${group.code}/${group.value}`, {
      details: { stage: "header", line: group.line },
    });
  }
  if (!sawEndsec) {
    throw new ExportDxfError("DXF_INVALID", "HEADER section not closed with ENDSEC", {
      details: { stage: "header" },
    });
  }
  return { acadver, insunits, measurement, handseed };
}

interface TableContext {
  readonly tableNames: string[];
  readonly layerNames: string[];
  readonly appids: string[];
  readonly styles: string[];
  readonly handles: Set<string>;
  readonly noteMax: (handle: number) => void;
}

function validateTables(cursor: Cursor, context: TableContext): void {
  while (true) {
    const group = cursor.peek();
    if (group === undefined) {
      throw new ExportDxfError("DXF_INVALID", "TABLES section not closed with ENDSEC", {
        details: { stage: "tables" },
      });
    }
    if (group.code === 0 && group.value === "ENDSEC") {
      cursor.next();
      return;
    }
    cursor.expectPair(0, "TABLE", "tables");
    const name = cursor.expectCode(2, "table name");
    context.tableNames.push(name.value);
    const tableHandle = cursor.expectCode(5, "table handle");
    noteHandle(tableHandle.value, context);
    cursor.expectCode(100, "AcDbSymbolTable", "table subclass");
    const count = integerOf(cursor.expectCode(70, "table entry count"));
    let entries = 0;
    while (true) {
      const entry = cursor.peek();
      if (entry === undefined) {
        throw new ExportDxfError("DXF_INVALID", `table ${name.value} not closed with ENDTAB`, {
          details: { stage: "tables", table: name.value },
        });
      }
      if (entry.code === 0 && entry.value === "ENDTAB") {
        cursor.next();
        break;
      }
      if (entry.code !== 0) {
        throw new ExportDxfError("DXF_INVALID", `table entry must start with 0/<TYPE>: ${entry.code}/${entry.value}`, {
          details: { stage: "tables", table: name.value, line: entry.line },
        });
      }
      entries += validateTableEntry(cursor, name.value, context);
    }
    if (entries !== count) {
      throw new ExportDxfError("DXF_INVALID", `table ${name.value} declares ${count} entries but carries ${entries}`, {
        details: { stage: "tables", table: name.value, declared: count, actual: entries },
      });
    }
  }
}

/** Validates one table entry; returns 1 (one entry consumed). */
function validateTableEntry(cursor: Cursor, table: string, context: TableContext): number {
  const type = cursor.expectCode(0, "entry type", table);
  const entryType = type.value;
  const handle = cursor.expectCode(5, "entry handle", `${table}/${entryType}`);
  noteHandle(handle.value, context);
  cursor.expectCode(100, "AcDbSymbolTableRecord", `${table}/${entryType}`);
  // The second subclass marker is type-specific (AcDb*TableRecord / AcDbRegAppTableRecord).
  const subclass = cursor.expectCode(100, "entry subclass", `${table}/${entryType}`);
  if (!subclass.value.startsWith("AcDb")) {
    throw new ExportDxfError("DXF_INVALID", `entry subclass must be an AcDb* marker: ${subclass.value}`, {
      details: { stage: "tables", table, entryType, subclass: subclass.value },
    });
  }
  const name = cursor.expectCode(2, "entry name", `${table}/${entryType}`);
  if (name.value.length === 0) {
    throw new ExportDxfError("DXF_INVALID", `entry name must be non-empty in ${table}`, {
      details: { stage: "tables", table, entryType },
    });
  }
  switch (table) {
    case "LAYER": {
      if (context.layerNames.includes(name.value)) {
        throw new ExportDxfError("DXF_INVALID", `duplicate layer name: ${name.value}`, {
          details: { stage: "tables", layer: name.value },
        });
      }
      context.layerNames.push(name.value);
      break;
    }
    case "APPID":
      context.appids.push(name.value);
      break;
    case "STYLE":
      context.styles.push(name.value);
      break;
    default:
      break;
  }
  // Consume the remaining groups of this entry up to the next 0 group.
  while (true) {
    const group = cursor.peek();
    if (group === undefined || group.code === 0) {
      return 1;
    }
    cursor.next();
  }
}

interface BlocksContext {
  noteMax: (handle: number) => void;
}

function validateBlocks(cursor: Cursor, blockNames: string[], handles: Set<string>, noteMax: (h: number) => void): void {
  const context: BlocksContext = { noteMax };
  void context;
  while (true) {
    const group = cursor.peek();
    if (group === undefined) {
      throw new ExportDxfError("DXF_INVALID", "BLOCKS section not closed with ENDSEC", {
        details: { stage: "blocks" },
      });
    }
    if (group.code === 0 && group.value === "ENDSEC") {
      cursor.next();
      return;
    }
    cursor.expectPair(0, "BLOCK", "blocks");
    const handle = cursor.expectCode(5, "block handle");
    noteHandle(handle.value, { handles, noteMax });
    let name: string | undefined;
    let depth = 0;
    // Consume until the paired ENDBLK.
    while (true) {
      const inner = cursor.peek();
      if (inner === undefined) {
        throw new ExportDxfError("DXF_INVALID", "BLOCK not closed with ENDBLK", {
          details: { stage: "blocks", block: name ?? "?" },
        });
      }
      if (inner.code === 2 && name === undefined) {
        name = cursor.next().value;
        blockNames.push(name);
        continue;
      }
      if (inner.code === 0 && inner.value === "ENDBLK") {
        cursor.next();
        depth += 1;
        const endHandle = cursor.expectCode(5, "endblk handle");
        noteHandle(endHandle.value, { handles, noteMax });
        // Consume the remaining ENDBLK groups (subclass markers, layer)
        // up to the next 0 group.
        while (true) {
          const tail = cursor.peek();
          if (tail === undefined || tail.code === 0) {
            break;
          }
          cursor.next();
        }
        break;
      }
      cursor.next();
    }
    if (depth !== 1) {
      throw new ExportDxfError("INTERNAL_ERROR", "unreachable ENDBLK depth", {});
    }
  }
}

interface EntityContext {
  readonly layerNames: readonly string[];
  readonly styles: readonly string[];
  readonly appids: readonly string[];
  readonly handles: Set<string>;
  readonly noteMax: (handle: number) => void;
}

function validateEntities(
  cursor: Cursor,
  context: EntityContext,
): { entities: number; xdataStrings: number; entityTypes: Record<string, number> } {
  const entityTypes: Record<string, number> = {};
  let entities = 0;
  let xdataStrings = 0;
  while (true) {
    const group = cursor.peek();
    if (group === undefined) {
      throw new ExportDxfError("DXF_INVALID", "ENTITIES section not closed with ENDSEC", {
        details: { stage: "entities" },
      });
    }
    if (group.code === 0 && group.value === "ENDSEC") {
      cursor.next();
      return { entities, xdataStrings, entityTypes };
    }
    if (group.code !== 0) {
      throw new ExportDxfError("DXF_INVALID", `entity must start with 0/<TYPE>: ${group.code}/${group.value}`, {
        details: { stage: "entities", line: group.line },
      });
    }
    const type = cursor.next().value;
    entities += 1;
    entityTypes[type] = (entityTypes[type] ?? 0) + 1;
    const handle = cursor.expectCode(5, `${type} handle`);
    noteHandle(handle.value, context);
    cursor.expectCode(100, "AcDbEntity", type);
    const layer = cursor.expectCode(8, `${type} layer`);
    if (!context.layerNames.includes(layer.value)) {
      throw new ExportDxfError("DXF_INVALID", `entity references an undeclared layer: ${layer.value}`, {
        details: { stage: "entities", type, layer: layer.value, line: layer.line },
      });
    }
    xdataStrings += validateEntityBody(cursor, type, context);
  }
}

/**
 * Validates one entity body (after 0/TYPE, 5, 100 AcDbEntity, 8).
 * Returns the XDATA string count.
 */
function validateEntityBody(cursor: Cursor, type: string, context: EntityContext): number {
  let vertices = 0;
  let declaredVertices: number | undefined;
  let closedFlag: number | undefined;
  let sawLineSubclass = false;
  let startCount = 0;
  let textValue: string | undefined;
  let textHeight: number | undefined;
  let styleName: string | undefined;
  let xdataStrings = 0;
  let inXdata = false;
  let xdataApp: string | undefined;

  while (true) {
    const group = cursor.peek();
    if (group === undefined || group.code === 0) {
      break;
    }
    const { code, value } = cursor.next();
    if (inXdata) {
      if (code === 1000) {
        if (value.length > 255) {
          throw new ExportDxfError("DXF_INVALID", "XDATA 1000 string exceeds 255 bytes", {
            details: { stage: "entities", type, line: group.line, length: value.length },
          });
        }
        xdataStrings += 1;
        continue;
      }
      if (code === 1001) {
        xdataApp = value;
        if (!context.appids.includes(value)) {
          throw new ExportDxfError("DXF_INVALID", `XDATA references an unregistered APPID: ${value}`, {
            details: { stage: "entities", type, appid: value, line: group.line },
          });
        }
        continue;
      }
      inXdata = false; // any other code ends the XDATA block
    }
    switch (code) {
      case 100:
        if (value === "AcDbLine" || value === "AcDbPolyline" || value === "AcDbText") {
          sawLineSubclass = true;
        }
        break;
      case 90:
        declaredVertices = integerOf({ code, value, line: group.line });
        break;
      case 70:
        closedFlag = integerOf({ code, value, line: group.line });
        break;
      case 10:
        vertices += 1;
        finiteRealOf(value, group.line, type);
        break;
      case 20:
        finiteRealOf(value, group.line, type);
        break;
      case 11:
        startCount += 1;
        finiteRealOf(value, group.line, type);
        break;
      case 21:
      case 30:
      case 31:
        finiteRealOf(value, group.line, type);
        break;
      case 1:
        textValue = value;
        if (value.length > 255) {
          throw new ExportDxfError("DXF_INVALID", "TEXT value exceeds 255 bytes", {
            details: { stage: "entities", type, line: group.line, length: value.length },
          });
        }
        break;
      case 40:
        textHeight = finiteRealOf(value, group.line, type);
        break;
      case 7:
        styleName = value;
        if (!context.styles.includes(value)) {
          throw new ExportDxfError("DXF_INVALID", `TEXT references an undeclared style: ${value}`, {
            details: { stage: "entities", type, style: value, line: group.line },
          });
        }
        break;
      case 1001:
        inXdata = true;
        xdataApp = value;
        if (!context.appids.includes(value)) {
          throw new ExportDxfError("DXF_INVALID", `XDATA references an unregistered APPID: ${value}`, {
            details: { stage: "entities", type, appid: value, line: group.line },
          });
        }
        break;
      default:
        break; // tolerated (color, rotation, flags, …)
    }
  }
  void xdataApp;

  switch (type) {
    case "LWPOLYLINE": {
      if (!sawLineSubclass) {
        throw new ExportDxfError("DXF_INVALID", "LWPOLYLINE missing AcDbPolyline subclass marker", {
          details: { stage: "entities", type },
        });
      }
      if (declaredVertices === undefined || declaredVertices !== vertices) {
        throw new ExportDxfError("DXF_INVALID", `LWPOLYLINE 90 count must equal its 10/20 vertex pairs: ${String(declaredVertices)} vs ${vertices}`, {
          details: { stage: "entities", type, declared: String(declaredVertices), actual: vertices },
        });
      }
      if (vertices < 2) {
        throw new ExportDxfError("DXF_INVALID", "LWPOLYLINE must carry at least 2 vertices", {
          details: { stage: "entities", type, vertices },
        });
      }
      if (closedFlag !== 0 && closedFlag !== 1) {
        throw new ExportDxfError("DXF_INVALID", `LWPOLYLINE 70 flag must be 0 or 1: ${String(closedFlag)}`, {
          details: { stage: "entities", type, flag: String(closedFlag) },
        });
      }
      break;
    }
    case "LINE": {
      if (!sawLineSubclass) {
        throw new ExportDxfError("DXF_INVALID", "LINE missing AcDbLine subclass marker", {
          details: { stage: "entities", type },
        });
      }
      if (startCount < 1) {
        throw new ExportDxfError("DXF_INVALID", "LINE missing its 11/21 endpoint groups", {
          details: { stage: "entities", type },
        });
      }
      break;
    }
    case "TEXT": {
      if (!sawLineSubclass) {
        throw new ExportDxfError("DXF_INVALID", "TEXT missing AcDbText subclass marker", {
          details: { stage: "entities", type },
        });
      }
      if (textValue === undefined || textValue.length === 0) {
        throw new ExportDxfError("DXF_INVALID", "TEXT missing its 1 value", {
          details: { stage: "entities", type },
        });
      }
      if (textHeight === undefined || !(textHeight > 0)) {
        throw new ExportDxfError("DXF_INVALID", `TEXT 40 height must be positive: ${String(textHeight)}`, {
          details: { stage: "entities", type, height: String(textHeight) },
        });
      }
      if (styleName !== undefined && !context.styles.includes(styleName)) {
        throw new ExportDxfError("DXF_INVALID", `TEXT references an undeclared style: ${styleName}`, {
          details: { stage: "entities", type, style: styleName },
        });
      }
      break;
    }
    default:
      // Unknown entity types are tolerated structurally (the profile
      // emits only the three types above; the counter surfaces them).
      break;
  }
  return xdataStrings;
}

// ---------------------------------------------------------------------------
// Cursor + shared coercions
// ---------------------------------------------------------------------------

class Cursor {
  private index = 0;

  constructor(private readonly groups: readonly DxfGroup[]) {}

  peek(): DxfGroup | undefined {
    return this.groups[this.index];
  }

  next(): DxfGroup {
    const group = this.groups[this.index];
    if (group === undefined) {
      throw new ExportDxfError("DXF_INVALID", "unexpected end of groups", {
        details: { stage: "cursor" },
      });
    }
    this.index += 1;
    return group;
  }

  expectCode(code: number, what: string, context: string = "structure"): DxfGroup {
    const group = this.next();
    if (group.code !== code) {
      throw new ExportDxfError("DXF_INVALID", `expected ${code} (${what}) in ${context}, got ${group.code}/${group.value}`, {
        details: { stage: context, expected: code, what, got: `${group.code}/${group.value}`, line: group.line },
      });
    }
    return group;
  }

  expectPair(code: number, value: string, context: string): DxfGroup {
    const group = this.next();
    if (group.code !== code || group.value !== value) {
      throw new ExportDxfError("DXF_INVALID", `expected ${code}/${value} in ${context}, got ${group.code}/${group.value}`, {
        details: { stage: context, expected: `${code}/${value}`, got: `${group.code}/${group.value}`, line: group.line },
      });
    }
    return group;
  }
}

function integerOf(group: DxfGroup): number {
  if (!/^-?\d+$/.test(group.value)) {
    throw new ExportDxfError("DXF_INVALID", `expected an integer value, got: ${group.value}`, {
      details: { stage: "coercion", line: group.line, value: group.value },
    });
  }
  return Number(group.value);
}

function finiteRealOf(value: string, line: number, type: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ExportDxfError("DXF_INVALID", `${type} carries a non-finite real: ${value}`, {
      details: { stage: "coercion", line, value, type },
    });
  }
  return parsed;
}

function noteHandle(handle: string, context: { handles: Set<string>; noteMax: (h: number) => void }): void {
  if (!HEX_PATTERN.test(handle) || handle.length === 0) {
    throw new ExportDxfError("DXF_INVALID", `handle must be a non-empty hex string: ${handle}`, {
      details: { stage: "handles", handle },
    });
  }
  if (context.handles.has(handle)) {
    throw new ExportDxfError("DXF_INVALID", `duplicate handle: ${handle}`, {
      details: { stage: "handles", handle },
    });
  }
  context.handles.add(handle);
  const value = parseInt(handle, 16);
  if (Number.isFinite(value)) {
    context.noteMax(value);
  }
}
