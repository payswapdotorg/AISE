/**
 * The deterministic DXF 2000 (AC1015) serialization (AISE-019).
 *
 * REQ-011 acceptance (AC-101/102/103) over the canonical 2D plan
 * document (AISE-017, the declared dependency):
 *
 * - **AC-101 plan exports to DXF** — the plan/elevation vector
 *   primitives are emitted as structured CAD entities: closed
 *   `LWPOLYLINE` for polygons, `LINE` for segments — real
 *   geometry in the model's declared frame unit, never a raster
 *   or approximation. Oblique/unprojected objects are listed as
 *   TEXT notes with their honest reasons (the AISE-017
 *   fail-closed-display discipline, carried into CAD).
 * - **AC-102 stable identifiers / property mapping** — every
 *   entity carries the source object identity, class, name,
 *   content hash, epistemic state (PASSTHROUGH — never
 *   upgraded), canonical quantities VERBATIM (value, unit,
 *   uncertainty — never recomputed from coordinates) and the
 *   provenance chain as XDATA under the registered APPID
 *   `AISE`; deterministic sequential handles make the mapping
 *   stable across re-exports.
 * - **AC-103 derived state only** — a pure function of the
 *   immutable plan document: stores nothing, mutates nothing,
 *   fabricates no geometry, upgrades no epistemic state.
 *
 * DXF profile choice (documented, deliberate): **DXF 2000
 * (AC1015) ASCII** — `$INSUNITS` gives an explicit, standardized
 * unit declaration (the acceptance: "units ... preserved"),
 * mandatory handles give stable identifiers, `LWPOLYLINE` gives
 * native closed polygon entities, and XDATA gives the
 * machine-readable property mapping. Older R12 ASCII (AC1009)
 * is NOT emitted (a declared v1 limitation: one profile, kept
 * honest and byte-stable, beats two drifting ones).
 *
 * Determinism: fixed canonical number formatting (6 decimals,
 * `-0` normalized), canonical entity order (the document's own
 * primitive order, then meta/limitations/unprojected text
 * blocks), deterministic sequential handles from a fixed seed,
 * fixed layout rules for text blocks derived from the drawing
 * extents. No clock, no randomness, no environment reads in the
 * serialization path (source-scanned and tested). Two exports
 * of the same plan document are byte-identical.
 *
 * Authority discipline (architecture-lock: "The Export layer
 * consumes the Reality Graph; it does not become a second
 * source of truth"): this module consumes the ALREADY-DERIVED
 * plan document — it is a serialization layer one step further
 * from the canonical graph, adding no authority of its own.
 */
import type { ModelLengthUnit, ModelUncertainty } from "@aise/engineering-model";
import type {
  Plan2dDocument,
  Primitive2d,
  Primitive2dProvenance,
  Quantity2dView,
} from "@aise/backend-export-2d";
import { ExportDxfError } from "./errors.js";

/** The registered application identity used for all AISE XDATA. */
export const AISE_APPID = "AISE";

/** The emitted DXF version marker (DXF 2000). */
export const DXF_ACADVER = "AC1015";

/** DXF $INSUNITS codes for the frozen model length vocabulary. */
export const INSUNITS_OF: Readonly<Record<ModelLengthUnit, number>> = Object.freeze({
  inch: 1,
  foot: 2,
  millimeter: 4,
  centimeter: 5,
  meter: 6,
});

/** Fixed decimal places for every emitted real (byte stability). */
const REAL_DECIMALS = 6;

/**
 * Deterministic display-transliteration map for the ASCII DXF
 * profile — DISPLAY PROSE ONLY (TEXT entities and 999 comments).
 * Machine-readable XDATA values are NEVER rewritten: they fail
 * closed on unencodable data instead (data fidelity beats
 * display plausibility). Typography maps 1:1 to ASCII
 * equivalents; any unmappable character fails closed.
 */
const DISPLAY_ASCII_MAP: Readonly<Record<string, string>> = Object.freeze({
  "\u2014": "-", // em dash
  "\u2013": "-", // en dash
  "\u2212": "-", // minus sign
  "\u00b1": "+/-", // plus-minus
  "\u00b0": "deg", // degree sign
  "\u00d7": "x", // multiplication sign
  "\u00b7": ".", // middle dot
  "\u22a5": "perp", // perpendicular
  "\u2192": "->", // rightwards arrow
  "\u2018": "'", // left single quote
  "\u2019": "'", // right single quote
  "\u201c": '"', // left double quote
  "\u201d": '"', // right double quote
  "\u2026": "...", // ellipsis
});

/**
 * Transliterates display prose to the ASCII profile (fixed map,
 * deterministic; unmappable characters fail closed).
 */
function toAsciiDisplay(text: string): string {
  let out = "";
  for (const char of text) {
    const codePoint = char.charCodeAt(0);
    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      out += char;
      continue;
    }
    const mapped = DISPLAY_ASCII_MAP[char];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    throw new ExportDxfError(
      "TEXT_UNENCODABLE",
      `DXF display text contains an unmappable non-ASCII character: ${JSON.stringify(char)} (0x${codePoint.toString(16)})`,
      { details: { char, codePoint, stage: "display" } },
    );
  }
  return out;
}

/** Fixed text wrap width (characters) for TEXT entity values. */
const TEXT_WRAP_WIDTH = 110;

/** Maximum bytes of one XDATA 1000 string (the DXF profile limit, minus key overhead). */
const XDATA_MAX = 250;

/** Fixed layer colors (ACI) per geometry/meta layer. */
const LAYER_COLOR: Readonly<Record<string, number>> = Object.freeze({
  WALL: 7,
  FLOOR: 8,
  CEILING: 8,
  DOOR: 2,
  WINDOW: 4,
  "AISE-META": 8,
  "AISE-LIMITS": 8,
  "AISE-UNPROJECTED": 1,
});

/** Meta/limitation/unprojected text layers (always emitted). */
const META_LAYERS: readonly string[] = Object.freeze(["AISE-META", "AISE-LIMITS", "AISE-UNPROJECTED"]);

/** First handle value (hex 100 = 256): fixed seed, deterministic. */
const FIRST_HANDLE = 0x100;

/** Canonical layout factors (fractions of the drawing span). */
const TEXT_HEIGHT_FACTOR = 1 / 100;
const LINE_HEIGHT_FACTOR = 2.0;
const MARGIN_FACTOR = 1 / 10;

/** One placed text line (meta/limitations/unprojected blocks). */
interface TextLine {
  readonly layer: string;
  readonly value: string;
  readonly x: number;
  readonly y: number;
  readonly height: number;
}

/** The deterministic drawing layout derived from the primitive extents. */
interface DrawingLayout {
  readonly minX: number;
  readonly minY: number;
  readonly textHeight: number;
  readonly lineHeight: number;
  readonly margin: number;
}

/** The deterministic DXF export artifact. */
export interface DxfExportResult {
  readonly kind: "dxf-export";
  readonly modelId: string;
  readonly projectId: string;
  /** The digest of the exact graph the plan document was projected from. */
  readonly graphDigest: string;
  readonly viewKind: "plan" | "elevation";
  /** The model frame unit — the coordinate unit of every emitted point. */
  readonly unit: ModelLengthUnit;
  /** The emitted $INSUNITS code (the standardized declaration of `unit`). */
  readonly insunits: number;
  /** 1 = metric, 0 = imperial — the $MEASUREMENT header value. */
  readonly measurement: number;
  /** The complete ASCII DXF text (CRLF line endings, ASCII-only). */
  readonly text: string;
  /** Exact byte length (ASCII-only, so the character count including CRLF). */
  readonly byteLength: number;
  readonly counts: {
    readonly primitives: number;
    readonly polylines: number;
    readonly lines: number;
    readonly textEntities: number;
    readonly xdataStrings: number;
    readonly handles: number;
    readonly layers: number;
  };
}

/**
 * Serializes one deterministic 2D plan document into a
 * byte-stable DXF 2000 ASCII drawing.
 *
 * Fail-closed contract: any value the profile cannot encode
 * honestly (non-finite coordinate, unencodable text, unknown
 * frame unit) throws `ExportDxfError` BEFORE output — never a
 * coerced, plausible-looking drawing.
 */
export function dxfOf(document: Plan2dDocument): DxfExportResult {
  const unitCode = INSUNITS_OF[document.unit];
  if (unitCode === undefined) {
    throw new ExportDxfError(
      "UNIT_UNMAPPABLE",
      `the document's frame unit has no $INSUNITS mapping: ${document.unit}`,
      { details: { unit: document.unit } },
    );
  }
  const measurement = measurementSystemOf(document.unit);

  const layers = layersOf(document);
  const layout = layoutOf(document);
  const out = new Writer();
  let handles = 0;
  const nextHandle = (): string => {
    handles += 1;
    return (FIRST_HANDLE + handles - 1).toString(16).toUpperCase();
  };

  emitHeader(out, document, unitCode, measurement);
  emitTables(out, layers, nextHandle);
  emitBlocks(out, nextHandle);
  out.pair(0, "SECTION");
  out.pair(2, "ENTITIES");

  let polylines = 0;
  let lines = 0;
  let textEntities = 0;
  let xdataStrings = 0;

  for (const primitive of document.primitives) {
    const handle = nextHandle();
    if (primitive.kind === "polygon") {
      emitPolyline(out, handle, primitive);
      polylines += 1;
    } else {
      emitLine(out, handle, primitive);
      lines += 1;
    }
    xdataStrings += emitXdata(out, primitive);
  }

  for (const line of metaTextOf(document, layout)) {
    emitText(out, nextHandle(), line);
    textEntities += 1;
  }
  for (const line of limitationTextOf(document, layout)) {
    emitText(out, nextHandle(), line);
    textEntities += 1;
  }
  for (const line of unprojectedTextOf(document, layout)) {
    emitText(out, nextHandle(), line);
    textEntities += 1;
  }

  out.pair(0, "ENDSEC");
  out.pair(0, "EOF");

  // $HANDSEED = the next available handle (strictly above every used handle).
  const text = out.finish((FIRST_HANDLE + handles).toString(16).toUpperCase());
  return {
    kind: "dxf-export",
    modelId: document.modelId,
    projectId: document.projectId,
    graphDigest: document.graphDigest,
    viewKind: document.view.kind,
    unit: document.unit,
    insunits: unitCode,
    measurement,
    text,
    byteLength: text.length,
    counts: {
      primitives: document.counts.projected,
      polylines,
      lines,
      textEntities,
      xdataStrings,
      handles,
      layers: layers.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Writer — the sequential group-code emitter (CRLF, ASCII-only)
// ---------------------------------------------------------------------------

/**
 * Buffers group-code pairs as ASCII lines with CRLF endings.
 * `finish` substitutes the `$HANDSEED` placeholder (the header
 * is emitted before the final handle count is known) and returns
 * the byte-stable text.
 */
class Writer {
  private readonly codes: number[] = [];
  private readonly values: string[] = [];

  pair(code: number, value: string): void {
    for (const char of value) {
      const codePoint = char.charCodeAt(0);
      if (codePoint < 0x20 || codePoint > 0x7e) {
        throw new ExportDxfError(
          "TEXT_UNENCODABLE",
          `DXF text values must be printable ASCII: ${JSON.stringify(char)} (0x${codePoint.toString(16)})`,
          { details: { char, codePoint } },
        );
      }
    }
    this.codes.push(code);
    this.values.push(value);
  }

  finish(handseed: string): string {
    const parts: string[] = [];
    for (let index = 0; index < this.codes.length; index += 1) {
      parts.push(String(this.codes[index]));
      parts.push(this.values[index] as string);
    }
    // Patch the $HANDSEED placeholder line in place (it is the only
    // occurrence of the marker — emitted once by emitHeader).
    const placeholderIndex = parts.indexOf("__HANDSEED__");
    if (placeholderIndex === -1) {
      throw new ExportDxfError("INTERNAL_ERROR", "$HANDSEED placeholder missing during DXF assembly", {
        details: { stage: "finish" },
      });
    }
    parts[placeholderIndex] = handseed;
    return `${parts.join("\r\n")}\r\n`;
  }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function emitHeader(out: Writer, document: Plan2dDocument, insunits: number, measurement: number): void {
  out.pair(999, "AISE deterministic DXF export - derived state, not a canonical model authority");
  out.pair(999, toAsciiDisplay(`modelId=${document.modelId}`));
  out.pair(999, toAsciiDisplay(`projectId=${document.projectId}`));
  out.pair(999, toAsciiDisplay(`graphDigest=${document.graphDigest}`));
  out.pair(999, toAsciiDisplay(`view=${document.view.kind} (e1=(${vec(document.view.basis.e1)}), e2=(${vec(document.view.basis.e2)}))`));
  out.pair(999, toAsciiDisplay(`frameUnit=${document.unit} ($INSUNITS=${insunits})`));
  out.pair(999, toAsciiDisplay(`counts: objects=${document.counts.objects} projected=${document.counts.projected} unprojected=${document.counts.unprojected}`));

  out.pair(0, "SECTION");
  out.pair(2, "HEADER");
  out.pair(9, "$ACADVER");
  out.pair(1, DXF_ACADVER);
  out.pair(9, "$INSUNITS");
  out.pair(70, String(insunits));
  out.pair(9, "$MEASUREMENT");
  out.pair(70, String(measurement));
  out.pair(9, "$HANDSEED");
  out.pair(5, "__HANDSEED__");
  out.pair(0, "ENDSEC");
}

function emitTables(out: Writer, layers: readonly string[], nextHandle: () => string): void {
  out.pair(0, "SECTION");
  out.pair(2, "TABLES");

  // VPORT — one *Active record.
  out.pair(0, "TABLE");
  out.pair(2, "VPORT");
  out.pair(5, nextHandle());
  out.pair(100, "AcDbSymbolTable");
  out.pair(70, "1");
  out.pair(0, "VPORT");
  out.pair(5, nextHandle());
  out.pair(100, "AcDbSymbolTableRecord");
  out.pair(100, "AcDbViewportTableRecord");
  out.pair(2, "*Active");
  out.pair(70, "0");
  out.pair(10, "0.0");
  out.pair(20, "0.0");
  out.pair(30, "0.0");
  out.pair(40, "1.0");
  out.pair(41, "1.0");
  out.pair(71, "0");
  out.pair(72, "100");
  out.pair(73, "1");
  out.pair(74, "3");
  out.pair(75, "0");
  out.pair(76, "1");
  out.pair(77, "0");
  out.pair(78, "0");
  out.pair(0, "ENDTAB");

  // LTYPE — ByBlock, ByLayer, CONTINUOUS.
  out.pair(0, "TABLE");
  out.pair(2, "LTYPE");
  out.pair(5, nextHandle());
  out.pair(100, "AcDbSymbolTable");
  out.pair(70, "3");
  for (const [name, description] of [
    ["ByBlock", ""] as const,
    ["ByLayer", ""] as const,
    ["CONTINUOUS", "Solid line"] as const,
  ]) {
    out.pair(0, "LTYPE");
    out.pair(5, nextHandle());
    out.pair(100, "AcDbSymbolTableRecord");
    out.pair(100, "AcDbLinetypeTableRecord");
    out.pair(2, name);
    out.pair(70, "0");
    out.pair(3, description);
    out.pair(72, "65");
    out.pair(73, "0");
    out.pair(40, "0.0");
  }
  out.pair(0, "ENDTAB");

  // LAYER — one record per emitted layer, fixed colors.
  out.pair(0, "TABLE");
  out.pair(2, "LAYER");
  out.pair(5, nextHandle());
  out.pair(100, "AcDbSymbolTable");
  out.pair(70, String(layers.length));
  for (const layer of layers) {
    out.pair(0, "LAYER");
    out.pair(5, nextHandle());
    out.pair(100, "AcDbSymbolTableRecord");
    out.pair(100, "AcDbLayerTableRecord");
    out.pair(2, layer);
    out.pair(70, "0");
    out.pair(62, String(LAYER_COLOR[layer] ?? 7));
    out.pair(6, "CONTINUOUS");
  }
  out.pair(0, "ENDTAB");

  // STYLE — STANDARD (referenced by every TEXT entity).
  out.pair(0, "TABLE");
  out.pair(2, "STYLE");
  out.pair(5, nextHandle());
  out.pair(100, "AcDbSymbolTable");
  out.pair(70, "1");
  out.pair(0, "STYLE");
  out.pair(5, nextHandle());
  out.pair(100, "AcDbSymbolTableRecord");
  out.pair(100, "AcDbTextStyleTableRecord");
  out.pair(2, "STANDARD");
  out.pair(70, "0");
  out.pair(40, "0.0");
  out.pair(41, "1.0");
  out.pair(50, "0.0");
  out.pair(71, "0");
  out.pair(42, "2.5");
  out.pair(3, "txt.shx");
  out.pair(4, "");
  out.pair(0, "ENDTAB");

  // APPID — ACAD (required) + AISE (the XDATA application).
  out.pair(0, "TABLE");
  out.pair(2, "APPID");
  out.pair(5, nextHandle());
  out.pair(100, "AcDbSymbolTable");
  out.pair(70, "2");
  for (const appid of ["ACAD", AISE_APPID]) {
    out.pair(0, "APPID");
    out.pair(5, nextHandle());
    out.pair(100, "AcDbSymbolTableRecord");
    out.pair(100, "AcDbRegAppTableRecord");
    out.pair(2, appid);
    out.pair(70, "0");
  }
  out.pair(0, "ENDTAB");

  // BLOCK_RECORD — *Model_Space + *Paper_Space.
  out.pair(0, "TABLE");
  out.pair(2, "BLOCK_RECORD");
  out.pair(5, nextHandle());
  out.pair(100, "AcDbSymbolTable");
  out.pair(70, "2");
  for (const record of ["*Model_Space", "*Paper_Space"]) {
    out.pair(0, "BLOCK_RECORD");
    out.pair(5, nextHandle());
    out.pair(100, "AcDbSymbolTableRecord");
    out.pair(100, "AcDbBlockTableRecord");
    out.pair(2, record);
    out.pair(70, "0");
  }
  out.pair(0, "ENDTAB");

  out.pair(0, "ENDSEC");
}

function emitBlocks(out: Writer, nextHandle: () => string): void {
  out.pair(0, "SECTION");
  out.pair(2, "BLOCKS");
  for (const name of ["*Model_Space", "*Paper_Space"]) {
    const begin = nextHandle();
    const end = nextHandle();
    out.pair(0, "BLOCK");
    out.pair(5, begin);
    out.pair(100, "AcDbEntity");
    out.pair(8, "0");
    out.pair(100, "AcDbBlockBegin");
    out.pair(2, name);
    out.pair(70, "0");
    out.pair(10, "0.0");
    out.pair(20, "0.0");
    out.pair(30, "0.0");
    out.pair(3, name);
    out.pair(1, "");
    out.pair(0, "ENDBLK");
    out.pair(5, end);
    out.pair(100, "AcDbEntity");
    out.pair(8, "0");
    out.pair(100, "AcDbBlockEnd");
  }
  out.pair(0, "ENDSEC");
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

function emitPolyline(out: Writer, handle: string, primitive: Primitive2d & { kind: "polygon" }): void {
  const layer = primitive.source.objectClass;
  out.pair(0, "LWPOLYLINE");
  out.pair(5, handle);
  out.pair(100, "AcDbEntity");
  out.pair(8, layer);
  out.pair(100, "AcDbPolyline");
  out.pair(90, String(primitive.points.length));
  out.pair(70, "1"); // closed
  for (const point of primitive.points) {
    out.pair(10, formatReal(point[0]));
    out.pair(20, formatReal(point[1]));
  }
}

function emitLine(out: Writer, handle: string, primitive: Primitive2d & { kind: "segment" }): void {
  const layer = primitive.source.objectClass;
  out.pair(0, "LINE");
  out.pair(5, handle);
  out.pair(100, "AcDbEntity");
  out.pair(8, layer);
  out.pair(100, "AcDbLine");
  out.pair(10, formatReal(primitive.start[0]));
  out.pair(20, formatReal(primitive.start[1]));
  out.pair(30, formatReal(0));
  out.pair(11, formatReal(primitive.end[0]));
  out.pair(21, formatReal(primitive.end[1]));
  out.pair(31, formatReal(0));
}

function emitText(out: Writer, handle: string, line: TextLine): void {
  out.pair(0, "TEXT");
  out.pair(5, handle);
  out.pair(100, "AcDbEntity");
  out.pair(8, line.layer);
  out.pair(100, "AcDbText");
  out.pair(1, toAsciiDisplay(line.value));
  out.pair(7, "STANDARD");
  out.pair(10, formatReal(line.x));
  out.pair(20, formatReal(line.y));
  out.pair(30, formatReal(0));
  out.pair(40, formatReal(line.height));
  out.pair(50, "0.0");
}

/** Emits the AISE XDATA block for one primitive; returns the emitted string count. */
function emitXdata(out: Writer, primitive: Primitive2d): number {
  const source = primitive.source;
  const pairs: [string, string][] = [
    ["primitiveId", primitive.primitiveId],
    ["objectId", source.objectId],
    ["objectClass", source.objectClass],
    ...(source.name !== undefined ? ([["name", source.name]] as [string, string][]) : []),
    ["contentHash", source.contentHash],
    ["epistemic", source.epistemic],
    ...quantityPairs("length", primitive.dimensions.length),
    ...quantityPairs("height", primitive.dimensions.height),
    ...quantityPairs("area", primitive.dimensions.area),
    ...quantityPairs("elevation", primitive.dimensions.elevation),
    ...quantityPairs("sill", primitive.dimensions.sill),
    ...quantityPairs("head", primitive.dimensions.head),
    ["provenance.service", `${source.provenance.serviceId}`],
    ["provenance.method", `${source.provenance.method}@${source.provenance.methodVersion}`],
    ...provenanceInputPairs(source.provenance),
  ];
  out.pair(1001, AISE_APPID);
  let count = 0;
  for (const [key, value] of pairs) {
    for (const chunk of splitXdata(`${key}=${value}`)) {
      out.pair(1000, chunk);
      count += 1;
    }
  }
  return count;
}

/** One canonical quantity as a verbatim XDATA pair (value, unit, uncertainty). */
function quantityPairs(label: string, quantity: Quantity2dView | undefined): [string, string][] {
  if (quantity === undefined) {
    return [];
  }
  const uncertainty =
    quantity.uncertainty !== undefined ? ` ${formatUncertainty(quantity.uncertainty)}` : "";
  return [[`quantity.${label}`, `${formatReal(quantity.value)} ${quantity.unit}${uncertainty}`]];
}

/** The uncertainty, verbatim-formatted (kind preserved, never converted across kinds). */
function formatUncertainty(uncertainty: ModelUncertainty): string {
  switch (uncertainty.kind) {
    case "standard":
      return `+/- 1sigma ${formatReal(uncertainty.u)}`;
    case "expanded":
      return `+/- U(k=${formatReal(uncertainty.coverageFactor)}) ${formatReal(uncertainty.U)}`;
    case "tolerance":
      return `+/- tol [${formatReal(uncertainty.lowerOffset)},${formatReal(uncertainty.upperOffset)}]`;
  }
}

/** Provenance inputs: one XDATA pair each, verbatim order. */
function provenanceInputPairs(provenance: Primitive2dProvenance): [string, string][] {
  return provenance.inputs.map(
    (input, index) =>
      [`provenance.input[${index}]`, `${input.kind}:${input.id}:${input.epistemic}:${input.contentHash}`] as [
        string,
        string,
      ],
  );
}

/** Splits one key=value string into ≤ XDATA_MAX chunks with `.cont` continuation keys. */
function splitXdata(text: string): string[] {
  if (text.length <= XDATA_MAX) {
    return [text];
  }
  const eq = text.indexOf("=");
  const key = eq === -1 ? "value" : text.slice(0, eq);
  const value = eq === -1 ? text : text.slice(eq + 1);
  const chunks: string[] = [];
  let remaining = value;
  const takeFirst = XDATA_MAX - key.length - 1;
  chunks.push(`${key}=${remaining.slice(0, takeFirst)}`);
  remaining = remaining.slice(takeFirst);
  while (remaining.length > 0) {
    const contKey = `${key}.cont`;
    const take = Math.max(XDATA_MAX - contKey.length - 1, 1);
    chunks.push(`${contKey}=${remaining.slice(0, take)}`);
    remaining = remaining.slice(take);
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Text blocks (meta / limitations / unprojected) — deterministic layout
// ---------------------------------------------------------------------------

function layoutOf(document: Plan2dDocument): DrawingLayout {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const primitive of document.primitives) {
    const points = primitive.kind === "polygon" ? primitive.points : [primitive.start, primitive.end];
    for (const point of points) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    }
  }
  if (!Number.isFinite(minX)) {
    // No projected geometry: the honest empty drawing — unit box.
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  return {
    minX,
    minY,
    textHeight: span * TEXT_HEIGHT_FACTOR,
    lineHeight: span * TEXT_HEIGHT_FACTOR * LINE_HEIGHT_FACTOR,
    margin: span * MARGIN_FACTOR,
  };
}

/** The meta text block (model identity, digest anchoring, view, unit) — ABOVE the drawing. */
function metaTextOf(document: Plan2dDocument, layout: DrawingLayout): TextLine[] {
  const lines = [
    `AISE ${document.view.kind.toUpperCase()} EXPORT (derived state - not a canonical model authority)`,
    `modelId=${document.modelId} projectId=${document.projectId}`,
    `graphDigest=${document.graphDigest}`,
    `frameUnit=${document.unit} (DXF $INSUNITS=${INSUNITS_OF[document.unit]})`,
    `objects=${document.counts.objects} projected=${document.counts.projected} unprojected=${document.counts.unprojected}`,
  ];
  const wrapped = lines.flatMap((line) => wrapText(line, TEXT_WRAP_WIDTH));
  return wrapped.map((value, index) => ({
    layer: "AISE-META",
    value,
    x: layout.minX,
    y: layout.minY + layout.margin + (wrapped.length - index) * layout.lineHeight,
    height: layout.textHeight,
  }));
}

/** The limitations text block — BELOW the drawing (honest display, never hidden). */
function limitationTextOf(document: Plan2dDocument, layout: DrawingLayout): TextLine[] {
  const lines = document.limitations.flatMap((limitation, index) => [
    `AISE-017 PROJECTION LIMITATION ${index + 1}:`,
    ...wrapText(limitation, TEXT_WRAP_WIDTH),
  ]);
  return lines.map((value, index) => ({
    layer: "AISE-LIMITS",
    value,
    x: layout.minX,
    y: layout.minY - layout.margin - (index + 1) * layout.lineHeight,
    height: layout.textHeight,
  }));
}

/** The unprojected objects text block — BELOW the limitations (honest refusal list). */
function unprojectedTextOf(document: Plan2dDocument, layout: DrawingLayout): TextLine[] {
  const lines = document.unprojected.flatMap((entry, index) => [
    `UNPROJECTED ${index + 1} [${entry.reason}]:`,
    ...wrapText(
      `${entry.source.objectId} (${entry.source.objectClass}, ${entry.source.epistemic}, hash ${entry.source.contentHash})`,
      TEXT_WRAP_WIDTH,
    ),
  ]);
  return lines.map((value, index) => ({
    layer: "AISE-UNPROJECTED",
    value,
    x: layout.minX,
    y: layout.minY - layout.margin - (index + 1) * layout.lineHeight,
    height: layout.textHeight,
  }));
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** The layer set: object classes in document order + the fixed meta layers. */
function layersOf(document: Plan2dDocument): string[] {
  const seen = new Set<string>();
  for (const primitive of document.primitives) {
    seen.add(primitive.source.objectClass);
  }
  return [...seen, ...META_LAYERS];
}

/** 1 = metric family, 0 = imperial — the $MEASUREMENT value. */
function measurementSystemOf(unit: ModelLengthUnit): number {
  return unit === "inch" || unit === "foot" ? 0 : 1;
}

/** Canonical DXF real: fixed 6 decimals, `-0` normalized, finite-checked. */
function formatReal(value: number): string {
  if (!Number.isFinite(value)) {
    throw new ExportDxfError(
      "NON_FINITE_INPUT",
      `a coordinate/quantity value is not finite: ${String(value)}`,
      { details: { value: String(value) } },
    );
  }
  let text = value.toFixed(REAL_DECIMALS);
  if (text === `-${(0).toFixed(REAL_DECIMALS)}`) {
    text = text.slice(1); // -0.000000 → 0.000000
  }
  return text;
}

/** Deterministic greedy word wrap (long words hard-split at the width). */
export function wrapText(text: string, width: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > width) {
      if (current !== "") {
        lines.push(current);
        current = "";
      }
      let remaining = word;
      while (remaining.length > width) {
        lines.push(remaining.slice(0, width));
        remaining = remaining.slice(width);
      }
      current = remaining;
      continue;
    }
    if (current === "") {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") {
    lines.push(current);
  }
  return lines;
}

/** A compact vector rendering for the meta comment. */
function vec(v: { readonly x: number; readonly y: number; readonly z: number }): string {
  return `${v.x},${v.y},${v.z}`;
}
