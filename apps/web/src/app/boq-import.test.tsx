/**
 * PROD-034 — the BOQ IMPORT entry tests (issue #9 gap 2).
 *
 * The surfaces-create.test.tsx discipline: static renders of pure
 * projections + typed seam tests with stubbed transports. The
 * SOURCE-BOQ vs SOLUTION-BOQ separation, the honest demo notice, the
 * verbatim outcome/failure renders and the route-exact request shape are
 * all pinned.
 */

import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BoqImportPanelBody,
  type BoqImportOutcome,
} from "./surfaces/BoqImport";
import {
  BOQ_IMPORT_FORMATS,
  importBoqSourceLive,
  type FetchLike,
} from "./api";
import { DEMO_TASK_PROJECT_ID } from "./task-dataset";

const noop = () => {};

describe("PROD-034 gap 2 — the SOURCE vs SOLUTION BOQ separation is stated", () => {
  test("the panel labels the import as a SOURCE BOQ and separates the SOLUTION BOQ class", () => {
    const html = renderToStaticMarkup(
      <BoqImportPanelBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={true}
        format="csv"
        onFormat={noop}
        file={null}
        reading={false}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-boq-class="source"');
    expect(html).toContain("SOURCE BOQ");
    expect(html).toContain("never edited, never overwritten");
    expect(html).toContain('data-boq-class="solution"');
    expect(html).toContain("SOLUTION BOQ");
    expect(html).toContain("DERIVED projection from a declared validation snapshot");
    expect(html).toContain("never replaces a source BOQ");
    expect(html).toContain("the BOQ graph is not reality");
    // The solution class links to the Interactive Solution surface (its own
    // record class, its own surface — no merging).
    expect(html).toContain(`#/projects/${DEMO_TASK_PROJECT_ID}/solution`);
  });

  test("the declared-format selector carries the route's own vocabulary (incl. the honest PDF limit)", () => {
    expect(BOQ_IMPORT_FORMATS.map((entry) => entry.format)).toEqual(["csv", "xlsx", "pdf"]);
    const pdf = BOQ_IMPORT_FORMATS.find((entry) => entry.format === "pdf")!;
    expect(pdf.label).toContain("not parsed");
  });
});

describe("PROD-034 gap 2 — the import entry's explicit states", () => {
  test("demo mode disables submission with the honest never-fabricate notice", () => {
    const html = renderToStaticMarkup(
      <BoqImportPanelBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={true}
        format="csv"
        onFormat={noop}
        file={null}
        reading={false}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-demo-notice="true"');
    expect(html).toContain("the shell never fabricates writes");
    expect(html).toContain('data-submit-state="demo"');
  });

  test("a selected file renders its summary and enables the live submit", () => {
    const html = renderToStaticMarkup(
      <BoqImportPanelBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={false}
        format="xlsx"
        onFormat={noop}
        file={{ name: "erp-export.xlsx", byteSize: 4096 }}
        reading={false}
        submitting={false}
        outcome={null}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain("erp-export.xlsx");
    expect(html).toContain("4096 bytes");
    expect(html).toContain("declared format");
    expect(html).toContain('data-submit-state="ready"');
  });

  test("the imported outcome carries the verbatim fields + row count + the immutable note", () => {
    const outcome: BoqImportOutcome = {
      kind: "imported",
      record: {
        importId: "0f".repeat(32),
        format: "csv",
        mediaType: "text/csv",
        byteSize: 512,
        importedAt: "2026-01-15T10:00:00.000Z",
        parseStatus: "parsed",
        rowCount: 6,
        parseReason: null,
      },
      endpoint: "/v1/boq/imports?format=csv",
    };
    const html = renderToStaticMarkup(
      <BoqImportPanelBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={false}
        format="csv"
        onFormat={noop}
        file={{ name: "erp.csv", byteSize: 512 }}
        reading={false}
        submitting={false}
        outcome={outcome}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-outcome="imported"');
    expect(html).toContain("Source BOQ stored server-side.");
    expect(html).toContain("6 source rows");
    expect(html).toContain("stays immutable under its content id");
  });

  test("the PDF outcome states the honest stored-without-parsing status with the recorded reason", () => {
    const outcome: BoqImportOutcome = {
      kind: "imported",
      record: {
        importId: "1a".repeat(32),
        format: "pdf",
        mediaType: "application/pdf",
        byteSize: 2048,
        importedAt: "2026-01-15T10:05:00.000Z",
        parseStatus: "unsupported_format",
        rowCount: null,
        parseReason: "pdf sources are preserved but not parsed (known limitation)",
      },
      endpoint: "/v1/boq/imports?format=pdf",
    };
    const html = renderToStaticMarkup(
      <BoqImportPanelBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={false}
        format="pdf"
        onFormat={noop}
        file={{ name: "tender.pdf", byteSize: 2048 }}
        reading={false}
        submitting={false}
        outcome={outcome}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain("stored without parsing (unsupported_format)");
    expect(html).toContain("known limitation");
  });

  test("the typed parse failure renders verbatim with the preservation note", () => {
    const html = renderToStaticMarkup(
      <BoqImportPanelBody
        projectId={DEMO_TASK_PROJECT_ID}
        demo={false}
        format="xlsx"
        onFormat={noop}
        file={{ name: "broken.xlsx", byteSize: 128 }}
        reading={false}
        submitting={false}
        outcome={{
          kind: "failed",
          detail: "HTTP 422 — boq_parse_failed: sheet 1: dimension ref is not A1-style",
        }}
        onFileSelected={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('data-outcome="failed"');
    expect(html).toContain("The import was refused.");
    expect(html).toContain("boq_parse_failed");
    expect(html).toContain("the bytes stay stored and retrievable");
  });
});

describe("PROD-034 gap 2 — the import seam (typed, stubbed transport)", () => {
  const bytes = new Uint8Array([104, 101, 108, 108, 111]); // "hello"

  test("the request carries the format override, the canonical media type and the raw bytes", async () => {
    let seen: { input: string; init?: RequestInit } | null = null;
    const fetchImpl: FetchLike = async (input, init) => {
      seen = { input, init };
      return new Response(
        JSON.stringify({
          ok: true,
          import: {
            importId: "0f".repeat(32),
            source: {
              contentId: "0f".repeat(32),
              mediaType: "text/csv",
              byteSize: 5,
              importedAt: "2026-01-15T10:00:00.000Z",
            },
            format: "csv",
            parse: {
              status: "parsed",
              document: { sheets: [{ name: "Sheet1", rows: [{ rowNumber: 1 }, { rowNumber: 2 }] }] },
            },
          },
        }),
        { status: 200 },
      );
    };
    const result = await importBoqSourceLive(fetchImpl, bytes, "csv");
    expect(result.ok).toBe(true);
    expect(seen!.input).toBe("/v1/boq/imports?format=csv");
    expect(seen!.init?.method).toBe("POST");
    expect((seen!.init?.headers as Record<string, string>)["content-type"]).toBe("text/csv");
    expect(seen!.init?.body).toBe(bytes);
    if (result.ok) {
      expect(result.record.importId).toBe("0f".repeat(32));
      expect(result.record.parseStatus).toBe("parsed");
      expect(result.record.rowCount).toBe(2);
      expect(result.record.mediaType).toBe("text/csv");
    }
  });

  test("the PDF known-limit answer (stored, not parsed) is carried with its reason", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          import: {
            importId: "1a".repeat(32),
            source: {
              contentId: "1a".repeat(32),
              mediaType: "application/pdf",
              byteSize: 5,
              importedAt: "2026-01-15T10:05:00.000Z",
            },
            format: "pdf",
            parse: { status: "unsupported_format", reason: "pdf sources are preserved but not parsed" },
          },
        }),
        { status: 200 },
      );
    const result = await importBoqSourceLive(fetchImpl, bytes, "pdf");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.parseStatus).toBe("unsupported_format");
      expect(result.record.rowCount).toBeNull();
      expect(result.record.parseReason).toContain("preserved but not parsed");
    }
  });

  test("the 422 boq_parse_failed typed envelope surfaces code and detail", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: "boq_parse_failed",
          part: "sheet 1",
          detail: "dimension ref is not A1-style",
        }),
        { status: 422 },
      );
    const result = await importBoqSourceLive(fetchImpl, bytes, "xlsx");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("http");
      if (result.failure.kind === "http") {
        expect(result.failure.status).toBe(422);
        expect(result.failure.code).toBe("boq_parse_failed");
        expect(result.failure.reason).toContain("dimension ref");
      }
    }
  });

  test("a structurally invalid answer is the explicit invalid failure (never coerced)", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response(JSON.stringify({ ok: true, import: { importId: "" } }), { status: 200 });
    const result = await importBoqSourceLive(fetchImpl, bytes, "csv");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid");
      expect(result.failure.detail).toContain("importId must be a non-empty string");
    }
  });

  test("an unknown format is refused client-side (the seam never invents a media type)", async () => {
    const fetchImpl: FetchLike = async () => new Response("{}", { status: 200 });
    const result = await importBoqSourceLive(fetchImpl, bytes, "docx" as "csv");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.kind).toBe("invalid");
      expect(result.failure.detail).toContain("unknown BOQ import format");
    }
  });
});
