/**
 * HIGH_ASSURANCE golden site-report test (AISE-019).
 *
 * The full deterministic composition: golden capture points →
 * AISE-010 extraction → AISE-011 ingestion → AISE-019 site
 * report (+ the golden evidence recipe and the AISE-017 plan
 * projection) → the rendered PDF. Every pinned number is the
 * output of the REAL chain (no mocks, no shortcuts).
 *
 * Determinism pinning discipline (the AISE-017/018 golden
 * precedent): byte-identity is pinned against ONE chain build;
 * structure is pinned exactly (page count, sections, text
 * presence, xref integrity); no raw digests of freshly re-built
 * chains are pinned.
 *
 * Pins (REQ-013 acceptance over the canonical golden room):
 * - AC-120/121/122: the rendered PDF carries the metadata,
 *   status, measurements, epistemic distinction, evidence
 *   records and limitations;
 * - byte-stable deterministic renders (repeated renders of the
 *   same report document agree byte-for-byte) and the canonical
 *   graph unchanged by the report.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import {
  assembleEvidenceGraph,
  evidenceLink,
  evidenceRecord,
  linkRetraction,
  sha256Hex,
  type EvidenceGraph,
  type RealityModelGraph,
} from "@aise/engineering-model";
import { renderSiteReportPdf, siteReportOf } from "./report.js";
import { pdfEscape } from "./pdf.js";
import { toReportingError } from "./errors.js";

const TARGET = { modelId: "model-golden", projectId: "project-golden", spaceId: "room-golden" };

/** The single chain build the golden assertions pin against (AISE-022 discipline). */
const SCENE = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
const GRAPH: RealityModelGraph = ingestArchitecturalScene(SCENE, TARGET).graph;

function hashOf(seed: string): string {
  return sha256Hex(seed);
}

function goldenEvidence(): EvidenceGraph {
  const lidar = evidenceRecord({
    kind: "LIDAR",
    source: {
      kind: "capture",
      sessionId: "sess-golden",
      assetId: "asset-golden",
      packageId: "pkg-golden",
      assetType: "DEPTH",
      contentHash: hashOf("golden-lidar-asset"),
      byteSize: 2048,
      acquisition: { capturedAt: "2026-09-01T09:30:00Z", deviceRef: "device-1" },
    },
    recordedBy: "svc:golden-seed",
    recordedAt: "2026-09-01T09:35:00Z",
  });
  const survey = evidenceRecord({
    kind: "MEASUREMENT",
    source: {
      kind: "manual-measurement",
      value: 2.7,
      unit: "meter",
      method: "survey/total-station",
      measuredBy: "surveyor-bob",
      measuredAt: "2026-09-01T09:30:00Z",
    },
    recordedBy: "svc:golden-seed",
    recordedAt: "2026-09-01T09:36:00Z",
  });
  const observation = evidenceRecord({
    kind: "HUMAN_OBSERVATION",
    source: {
      kind: "human-observation",
      observer: "user:alice",
      observedAt: "2026-09-02T10:00:00Z",
      statement: "The door is visibly present",
    },
    recordedBy: "svc:golden-seed",
    recordedAt: "2026-09-02T10:05:00Z",
  });
  const door = GRAPH.objects.find((object) => object.objectClass === "DOOR")!;
  const links = [
    ...GRAPH.objects.map((object) =>
      evidenceLink({
        subject: { kind: "object-existence", modelId: TARGET.modelId, version: 1, objectId: object.objectId },
        evidenceId: lidar.evidenceId,
        linkedBy: "svc:golden-seed",
        linkedAt: "2026-09-03T13:01:00Z",
        method: "golden/seed-link",
      }),
    ),
    evidenceLink({
      subject: {
        kind: "space-property",
        modelId: TARGET.modelId,
        version: 1,
        spaceId: TARGET.spaceId,
        propertyKey: "roomHeight",
      },
      evidenceId: survey.evidenceId,
      linkedBy: "svc:golden-seed",
      linkedAt: "2026-09-03T13:02:00Z",
      method: "golden/seed-link",
    }),
    evidenceLink({
      subject: { kind: "object-existence", modelId: TARGET.modelId, version: 1, objectId: door.objectId },
      evidenceId: observation.evidenceId,
      linkedBy: "svc:golden-seed",
      linkedAt: "2026-09-03T13:03:00Z",
      method: "golden/seed-link",
    }),
  ];
  const retracted = links[links.length - 1]!;
  return assembleEvidenceGraph({
    projectId: TARGET.projectId,
    records: [lidar, survey, observation],
    evidenceRetractions: [],
    links,
    linkRetractions: [
      linkRetraction({
        linkId: retracted.linkId,
        retractedBy: "user:alice",
        retractedAt: "2026-09-03T14:00:00Z",
        reason: "observation was about a different door",
      }),
    ],
  });
}

function capture(action: () => unknown): ReturnType<typeof toReportingError> {
  try {
    action();
  } catch (error) {
    return toReportingError(error);
  }
  return null;
}

describe("golden site report PDF (real chain, with evidence)", () => {
  const report = siteReportOf(GRAPH, { version: 1, evidence: goldenEvidence() });
  const pdf = renderSiteReportPdf(report);

  it("renders a structurally valid PDF (header, xref, EOF, page count)", () => {
    expect(pdf.text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf.pageCount).toBeGreaterThanOrEqual(3); // content + plan drawing + limitations
    expect(pdf.byteLength).toBe(pdf.text.length);
    // The xref offsets are byte-exact.
    const entries = [...pdf.text.matchAll(/(\d{10}) 00000 n /g)].map((match) => Number(match[1]));
    expect(entries.length).toBe(pdf.pageCount * 2 + 4);
    for (const offset of entries) {
      expect(pdf.text.slice(offset, offset + 12)).toMatch(/^\d+ 0 obj/);
    }
  });

  it("carries the report content sections (AC-120/121/122)", () => {
    expect(pdf.text).toContain("AISE SITE REPORT");
    expect(pdf.text).toContain("Project and capture metadata");
    expect(pdf.text).toContain("project: project-golden");
    expect(pdf.text).toContain(pdfEscape("model: model-golden (version 1)"));
    expect(pdf.text).toContain(`graph digest: ${GRAPH.digest}`);
    expect(pdf.text).toContain("Model status");
    expect(pdf.text).toContain(pdfEscape("overall epistemic state (weakest link): INFERRED"));
    expect(pdf.text).toContain(pdfEscape("Measurements (canonical quantities, verbatim)"));
    expect(pdf.text).toContain(pdfEscape("Object inventory (epistemic state per object)"));
    expect(pdf.text).toContain(pdfEscape("Evidence records (source links preserved)"));
    expect(pdf.text).toContain("Issues");
    expect(pdf.text).toContain("Images and capture assets");
    expect(pdf.text).toContain(pdfEscape("Plan drawing (AISE-017 projection, presentation-scaled)"));
    expect(pdf.text).toContain("Limitations");
  });

  it("carries the evidence records with source links and honest statuses", () => {
    expect(pdf.text).toContain(pdfEscape("capture sess-golden/asset-golden (DEPTH, 2048 bytes"));
    expect(pdf.text).toContain("manual-measurement 2.7 meter by surveyor-bob");
    expect(pdf.text).toContain("[LINK_RETRACTED]");
    expect(pdf.text).toContain("The door is visibly present");
  });

  it("distinguishes epistemic states in the rendered inventory (AC-122)", () => {
    // All eight golden objects render with the INFERRED badge.
    expect((pdf.text.match(/INFERRED/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(pdf.text).toContain("CONFIRMED 0, OBSERVED 0, INFERRED 8, PROPOSED 0");
  });

  it("renders the plan drawing with the honest scale note (not a measurement)", () => {
    expect(pdf.text).toContain("scale bar:");
    expect(pdf.text).toContain(pdfEscape("(presentation scaling only - not a measurement)"));
    expect(pdf.text).toContain("drawing scale:");
  });

  it("embeds both limitation sets (report + AISE-017 projection)", () => {
    expect(pdf.text).toContain(pdfEscape("site report limitations (AISE-019):"));
    expect(pdf.text).toContain(pdfEscape("plan projection limitations (AISE-017, verbatim):"));
  });

  it("is byte-stable: repeated renders agree byte-for-byte", () => {
    const second = renderSiteReportPdf(report);
    expect(second.text).toBe(pdf.text);
    expect(second.byteLength).toBe(pdf.byteLength);
  });

  it("does not mutate the canonical graph (derived state only)", () => {
    const before = JSON.stringify(GRAPH);
    siteReportOf(GRAPH, { version: 1, evidence: goldenEvidence() });
    renderSiteReportPdf(report);
    expect(JSON.stringify(GRAPH)).toBe(before);
  });

  it("transliterates the limitation prose deterministically (ASCII PDF profile)", () => {
    // The AISE-017 limitation prose carries em-dashes and "+-10deg" style
    // typography: the PDF profile transliterates them.
    expect(pdf.text).toContain("outside the +/-10deg alignment tolerance");
    expect(() => capture(() => pdf.text.includes("\u2014"))).not.toThrow();
    expect(pdf.text).not.toContain("\u2014");
  });
});
