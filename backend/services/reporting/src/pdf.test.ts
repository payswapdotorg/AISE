/**
 * PDF writer unit tests (AISE-019).
 *
 * Writer-contract tests: escaping, structure, xref correctness,
 * determinism (no timestamps), and fail-closed refusals.
 */
import { describe, expect, it } from "vitest";
import { buildPdf, pdfEscape, pdfLine, pdfPolyline, pdfText, A4_WIDTH, A4_HEIGHT } from "./pdf.js";
import { toReportingError } from "./errors.js";

function capture(action: () => unknown): ReturnType<typeof toReportingError> {
  try {
    action();
  } catch (error) {
    return toReportingError(error);
  }
  return null;
}

describe("pdfEscape", () => {
  it("escapes the PDF literal-string specials", () => {
    expect(pdfEscape("plain")).toBe("plain");
    expect(pdfEscape("(parens)")).toBe("\\(parens\\)");
    expect(pdfEscape("back\\slash")).toBe("back\\\\slash");
  });

  it("fails closed on non-ASCII input", () => {
    const error = capture(() => pdfEscape("wäll"));
    expect(error?.code).toBe("TEXT_UNENCODABLE");
    expect(error?.retryable).toBe(false);
  });

  it("fails closed on control characters", () => {
    const error = capture(() => pdfEscape("line\nbreak"));
    expect(error?.code).toBe("TEXT_UNENCODABLE");
  });
});

describe("content operators", () => {
  it("renders text runs with the font, gray and position", () => {
    expect(pdfText(10, 20, "Hello", { size: 12, bold: true })).toBe("BT /F2 12 Tf 0.00 g 10.00 20.00 Td (Hello) Tj ET");
    expect(pdfText(10, 20, "x")).toBe("BT /F1 8.5 Tf 0.00 g 10.00 20.00 Td (x) Tj ET");
  });

  it("renders lines and polylines with fixed 2-decimal coordinates", () => {
    expect(pdfLine(0, 0, 100, 50)).toBe("0.00 G 0.50 w 0.00 0.00 m 100.00 50.00 l S");
    expect(pdfPolyline([[0, 0], [10, 0], [10, 10]], { close: true })).toBe("0.00 G 0.50 w 0.00 0.00 m 10.00 0.00 l 10.00 10.00 l h S");
  });

  it("normalizes -0.00 and fails closed on non-finite coordinates", () => {
    expect(pdfLine(-0, -0, 1, 1)).toBe("0.00 G 0.50 w 0.00 0.00 m 1.00 1.00 l S");
    const error = capture(() => pdfLine(Number.NaN, 0, 1, 1));
    expect(error?.code).toBe("NON_FINITE_INPUT");
  });

  it("rejects degenerate polylines", () => {
    const error = capture(() => pdfPolyline([[0, 0]]));
    expect(error?.code).toBe("VALIDATION_FAILED");
  });
});

describe("buildPdf", () => {
  const pages = [
    { width: A4_WIDTH, height: A4_HEIGHT, content: pdfText(52, 700, "Page one") },
    { width: A4_WIDTH, height: A4_HEIGHT, content: pdfText(52, 700, "Page two") },
  ];

  it("assembles a valid PDF skeleton (header, xref, trailer, EOF)", () => {
    const pdf = buildPdf(pages);
    expect(pdf.text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf.pageCount).toBe(2);
    expect(pdf.byteLength).toBe(pdf.text.length);
    // Catalog, pages tree, two fonts, two pages + two streams.
    expect((pdf.text.match(/\d+ 0 obj/g) ?? []).length).toBe(8);
    expect(pdf.text).toContain("/Type /Catalog");
    expect(pdf.text).toContain("/Count 2");
    expect(pdf.text).toContain("/BaseFont /Helvetica");
    expect(pdf.text).toContain("/BaseFont /Helvetica-Bold");
    expect(pdf.text).toContain("/MediaBox [0 0 595.28 841.89]");
  });

  it("computes the xref offsets byte-exactly (ASCII-only document)", () => {
    const pdf = buildPdf(pages);
    const xrefMatch = /xref\n0 \d+\n/.exec(pdf.text);
    expect(xrefMatch).not.toBeNull();
    // Every xref entry must point at "N 0 obj".
    const entries = [...pdf.text.matchAll(/(\d{10}) 00000 n /g)].map((match) => Number(match[1]));
    expect(entries.length).toBe(8);
    for (const offset of entries) {
      expect(pdf.text.slice(offset, offset + 8)).toMatch(/^\d 0 obj/);
    }
    const startxref = /startxref\n(\d+)\n/.exec(pdf.text);
    expect(startxref).not.toBeNull();
    const xrefOffset = Number(startxref![1]);
    expect(pdf.text.slice(xrefOffset, xrefOffset + 4)).toBe("xref");
  });

  it("declares the exact stream lengths", () => {
    const pdf = buildPdf([{ width: A4_WIDTH, height: A4_HEIGHT, content: "0.00 G 1.00 w 0 0 m 10 0 l S" }]);
    const lengthMatch = /\/Length (\d+) >>\nstream\n/.exec(pdf.text);
    expect(lengthMatch).not.toBeNull();
    const declared = Number(lengthMatch![1]);
    const streamMatch = /stream\n([\s\S]*?)\nendstream/.exec(pdf.text);
    expect(streamMatch).not.toBeNull();
    expect(streamMatch![1]!.length).toBe(declared);
  });

  it("embeds NO wall-clock timestamps (deterministic renders)", () => {
    const pdf = buildPdf(pages);
    expect(pdf.text).not.toContain("/CreationDate");
    expect(pdf.text).not.toContain("/ModDate");
    expect(pdf.text).not.toContain("/ID");
    expect(pdf.text).not.toContain("/Producer");
  });

  it("is byte-stable across repeated builds", () => {
    expect(buildPdf(pages).text).toBe(buildPdf(pages).text);
  });

  it("rejects an empty page set", () => {
    const error = capture(() => buildPdf([]));
    expect(error?.code).toBe("VALIDATION_FAILED");
  });
});
