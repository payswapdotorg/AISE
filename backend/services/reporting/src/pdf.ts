/**
 * Deterministic PDF 1.4 writer primitives (AISE-019).
 *
 * A minimal, dependency-free PDF producer for the site report:
 * the catalog/pages tree, A4 page objects with content streams,
 * the two base-14 Helvetica fonts (no embedding — WinAnsi
 * encoding), and a correct cross-reference table.
 *
 * Determinism (the acceptance core: "deterministic report
 * content"):
 * - fixed object numbering (catalog 1, pages 2, page objects,
 *   fonts, then content streams in page order);
 * - **no timestamps**: /CreationDate and /ModDate are omitted
 *   entirely (they are optional) — the document carries no
 *   wall-clock fact, so repeated renders are byte-identical
 *   (actual temporal facts live inside evidence records,
 *   verbatim);
 * - ASCII-only content (byte length = character count): every
 *   text string passes `pdfEscape`, which fails closed on
 *   non-ASCII input (the same discipline as the DXF/SPF
 *   serializers);
 * - fixed 2-decimal coordinate formatting.
 *
 * Authority: this module is a rendering primitive — it knows
 * nothing about models or evidence and adds no authority of
 * its own.
 */
import { ReportingError } from "./errors.js";

/** A4 portrait in PDF points (1/72 inch). */
export const A4_WIDTH = 595.28;
export const A4_HEIGHT = 841.89;

/** The body font size (pt). */
export const BODY_FONT_SIZE = 8.5;
/** The body line height (pt). */
export const BODY_LINE_HEIGHT = 11;
/** The page margin (pt). */
export const PAGE_MARGIN = 52;
/** The section header font size (pt). */
export const HEADER_FONT_SIZE = 11;
/** The title font size (pt). */
export const TITLE_FONT_SIZE = 15;

/** One page's content stream source (the operators, unescaped text pre-rendered). */
export interface PdfPageSpec {
  /** Page width in points (A4 unless a drawing demands otherwise). */
  readonly width: number;
  /** Page height in points. */
  readonly height: number;
  /** The content stream operators (ASCII-only, no trailing newline). */
  readonly content: string;
}

/** The produced PDF artifact. */
export interface PdfResult {
  /** The complete PDF text (ASCII-only). */
  readonly text: string;
  /** Exact byte length (ASCII-only, so the character count). */
  readonly byteLength: number;
  readonly pageCount: number;
}

/** Escapes a PDF literal string; fails closed on non-ASCII. */
export function pdfEscape(text: string): string {
  let out = "";
  for (const char of text) {
    const codePoint = char.charCodeAt(0);
    if (codePoint < 0x20 || codePoint > 0x7e) {
      throw new ReportingError(
        "TEXT_UNENCODABLE",
        `PDF text values must be printable ASCII: ${JSON.stringify(char)} (0x${codePoint.toString(16)})`,
        { details: { char, codePoint } },
      );
    }
    if (char === "(" || char === ")" || char === "\\") {
      out += `\\${char}`;
      continue;
    }
    out += char;
  }
  return out;
}

/** Fixed 2-decimal PDF real (deterministic, `-0` normalized, finite-checked). */
export function formatPdfReal(value: number): string {
  if (!Number.isFinite(value)) {
    throw new ReportingError(
      "NON_FINITE_INPUT",
      `a PDF coordinate is not finite: ${String(value)}`,
      { details: { value: String(value) } },
    );
  }
  let text = value.toFixed(2);
  if (text === "-0.00") {
    text = "0.00";
  }
  return text;
}

/**
 * Assembles the complete PDF document from page specs.
 *
 * Object layout (fixed): 1 = Catalog, 2 = Pages, 3 = F1 font,
 * 4 = F2 font, then one page object + one content stream per
 * page in order.
 */
export function buildPdf(pages: readonly PdfPageSpec[]): PdfResult {
  if (pages.length === 0) {
    throw new ReportingError("VALIDATION_FAILED", "a PDF needs at least one page", {
      details: { pages: 0 },
    });
  }
  const objects: string[] = [];
  const pageCount = pages.length;
  const pageFirst = 5;
  const kids = pages.map((_, index) => `${pageFirst + index * 2} 0 R`).join(" ");

  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
  for (const [index, page] of pages.entries()) {
    const pageRef = pageFirst + index * 2;
    const contentRef = pageRef + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatPdfReal(page.width)} ${formatPdfReal(page.height)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentRef} 0 R >>`,
    );
    objects.push(`<< /Length ${page.content.length} >>\nstream\n${page.content}\nendstream`);
  }

  // Header + objects with offsets.
  const parts: string[] = [];
  parts.push("%PDF-1.4\n");
  const offsets: number[] = [];
  let cursor = "%PDF-1.4\n".length;
  for (const [index, body] of objects.entries()) {
    offsets.push(cursor);
    const chunk = `${index + 1} 0 obj\n${body}\nendobj\n`;
    parts.push(chunk);
    cursor += chunk.length;
  }
  const xrefOffset = cursor;
  const xref: string[] = [];
  xref.push(`xref\n0 ${objects.length + 1}\n`);
  xref.push("0000000000 65535 f \n");
  for (const offset of offsets) {
    xref.push(`${offset.toString().padStart(10, "0")} 00000 n \n`);
  }
  parts.push(xref.join(""));
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const text = parts.join("");
  return { text, byteLength: text.length, pageCount };
}

// ---------------------------------------------------------------------------
// Content-stream operator builders (deterministic)
// ---------------------------------------------------------------------------

/** A text-showing operator run: `BT ... Tj ET`. */
export function pdfText(
  x: number,
  y: number,
  value: string,
  options: { readonly size?: number; readonly bold?: boolean; readonly gray?: number } = {},
): string {
  const size = options.size ?? BODY_FONT_SIZE;
  const font = options.bold ? "F2" : "F1";
  const gray = options.gray ?? 0;
  const g = gray >= 0 && gray <= 1 ? gray.toFixed(2) : "0.00";
  return `BT /${font} ${size} Tf ${g} g ${formatPdfReal(x)} ${formatPdfReal(y)} Td (${pdfEscape(value)}) Tj ET`;
}

/** A stroke line operator: `x1 y1 m x2 y2 l S`. */
export function pdfLine(x1: number, y1: number, x2: number, y2: number, options: { readonly gray?: number; readonly width?: number } = {}): string {
  const gray = options.gray ?? 0;
  const width = options.width ?? 0.5;
  return `${gray.toFixed(2)} G ${width.toFixed(2)} w ${formatPdfReal(x1)} ${formatPdfReal(y1)} m ${formatPdfReal(x2)} ${formatPdfReal(y2)} l S`;
}

/** A polyline operator: `m` then `l`s then `S`. */
export function pdfPolyline(points: readonly (readonly [number, number])[], options: { readonly gray?: number; readonly width?: number; readonly close?: boolean } = {}): string {
  if (points.length < 2) {
    throw new ReportingError("VALIDATION_FAILED", "a polyline needs at least two points", {
      details: { points: points.length },
    });
  }
  const gray = options.gray ?? 0;
  const width = options.width ?? 0.5;
  const [first, ...rest] = points;
  const ops = [`${formatPdfReal(first![0])} ${formatPdfReal(first![1])} m`];
  for (const point of rest) {
    ops.push(`${formatPdfReal(point[0])} ${formatPdfReal(point[1])} l`);
  }
  if (options.close) {
    ops.push("h");
  }
  return `${gray.toFixed(2)} G ${width.toFixed(2)} w ${ops.join(" ")} S`;
}
