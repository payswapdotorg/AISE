/**
 * Site-report regression tests (AISE-019).
 *
 * Purity and honesty regressions: the composition path must
 * stay a deterministic pure function (no clock, no randomness,
 * no environment reads — source-scanned), canonical values must
 * render verbatim, and the honesty surfaces (absent evidence,
 * unknowns, limitations) must never silently disappear.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import { renderSiteReportPdf, siteReportOf, wrapReportText } from "./report.js";
import { pdfEscape } from "./pdf.js";

const TARGET = { modelId: "model-golden", projectId: "project-golden", spaceId: "room-golden" };

const SRC_DIR = path.join(import.meta.dirname, "..", "src");

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => path.join(SRC_DIR, file));
}

function goldenGraph() {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  return ingestArchitecturalScene(scene, TARGET).graph;
}

describe("deterministic composition discipline (source-scanned)", () => {
  it("production sources exist with the expected modules", () => {
    const files = sourceFiles().map((file) => path.basename(file));
    for (const file of ["report.ts", "pdf.ts"]) {
      expect(files).toContain(file);
    }
  });

  it("no Math.random / Date.now / new Date anywhere in production source", () => {
    for (const file of sourceFiles()) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not use Math.random`).not.toContain("Math.random");
      expect(content, `${file} must not use Date.now`).not.toContain("Date.now");
      expect(content, `${file} must not use new Date(`).not.toContain("new Date(");
    }
  });

  it("no environment or clock reads in the composition core (pure function discipline)", () => {
    for (const file of ["report.ts", "pdf.ts"]) {
      const content = readFileSync(path.join(SRC_DIR, file), "utf8");
      expect(content, `${file} must not read process.env`).not.toContain("process.env");
      expect(content, `${file} must not call Date.now`).not.toContain("Date.now");
      expect(content, `${file} must not construct new Date`).not.toContain("new Date(");
      // The composition imports only types + the projection from the
      // dependency — no runtime store handle, no mutation surface.
      expect(content).not.toContain("createInMemoryRealityModelStore");
      expect(content).not.toContain("commitModelVersion");
      expect(content).not.toContain("assembleModelGraph");
    }
  });

  it("the report consumes the canonical graph only (no reality-model runtime import)", () => {
    const content = readFileSync(path.join(SRC_DIR, "report.ts"), "utf8");
    expect(content).not.toContain("from \"@aise/backend-reality-model\"");
    expect(content).not.toContain("from \"@aise/backend-export-dxf\"");
  });
});

describe("frozen regression values (real chain)", () => {
  it("repeats byte-identically for the same chain build (report built twice, rendered twice)", () => {
    const graph = goldenGraph();
    const first = renderSiteReportPdf(siteReportOf(graph));
    const second = renderSiteReportPdf(siteReportOf(graph));
    expect(first.text).toBe(second.text);
    // Frozen structural shape (the AISE-017 regression precedent).
    expect(first.pageCount).toBe(second.pageCount);
    expect(first.text).toContain("%PDF-1.4");
    expect(first.text).toContain("AISE SITE REPORT");
  });

  it("renders canonical values verbatim (JS number rendering, never reformatted)", () => {
    const graph = goldenGraph();
    const report = siteReportOf(graph);
    const pdf = renderSiteReportPdf(report);
    const floor = graph.objects.find((object) => object.objectClass === "FLOOR")!;
    const width = floor.geometry!.structured!.width;
    // The exact canonical value string appears in the measurements table.
    expect(pdf.text).toContain(`${width.value} ${width.unit}`);
    expect(report.measurements.find((row) => row.objectClass === "FLOOR" && row.label === "length")!.value)
      .toBe(width.value);
  });

  it("never upgrades epistemic states (passthrough frozen at INFERRED for the golden v1 chain)", () => {
    const report = siteReportOf(goldenGraph());
    expect(report.status.overallEpistemic).toBe("INFERRED");
    expect(report.objects.every((row) => row.epistemic === "INFERRED")).toBe(true);
    const pdf = renderSiteReportPdf(report);
    expect(pdf.text).toContain("CONFIRMED 0, OBSERVED 0, INFERRED 8, PROPOSED 0");
  });

  it("no wall-clock timestamps anywhere in the PDF (determinism pin)", () => {
    const pdf = renderSiteReportPdf(siteReportOf(goldenGraph()));
    expect(pdf.text).not.toContain("/CreationDate");
    expect(pdf.text).not.toContain("/ModDate");
    // The only RFC 3339 timestamps come from evidence records (none here).
    expect((pdf.text.match(/\d{4}-\d{2}-\d{2}T/g) ?? []).length).toBe(0);
  });

  it("the absent-evidence surface stays honest (no fabricated evidence rows)", () => {
    const report = siteReportOf(goldenGraph());
    expect(report.evidenceRows).toHaveLength(0);
    const pdf = renderSiteReportPdf(report);
    expect(pdf.text).toContain(pdfEscape("(no evidence graph supplied - the report claims no evidence)"));
  });
});

describe("text wrap determinism", () => {
  it("wraps words and hard-splits over-long tokens", () => {
    expect(wrapReportText("alpha beta gamma", 11)).toEqual(["alpha beta", "gamma"]);
    expect(wrapReportText("supercalifragilistic", 5)).toEqual(["super", "calif", "ragil", "istic"]);
    expect(wrapReportText("", 10)).toEqual([]);
  });
});
