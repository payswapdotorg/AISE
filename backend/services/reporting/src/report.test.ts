/**
 * Site-report content unit tests (AISE-019).
 *
 * Content-contract tests over the REAL chain golden graph with
 * the golden evidence recipe (the AISE-018 discipline: LIDAR
 * coverage + survey height + one retracted observation):
 * AC-120 metadata, AC-121 measurements/status/issues/images,
 * AC-122 epistemic distinction, evidence source links, and the
 * fail-closed contract.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import {
  assembleEvidenceGraph,
  assembleModelGraph,
  evidenceLink,
  evidenceRecord,
  linkRetraction,
  makeRealityObject,
  modelProvenance,
  propertyAssertion,
  sha256Hex,
  type EvidenceGraph,
  type RealityModelGraph,
  type RealityObjectInput,
  type StructuredPlanarGeometryInput,
} from "@aise/engineering-model";
import { renderSiteReportPdf, siteReportOf, SITE_REPORT_LIMITATIONS } from "./report.js";
import { toReportingError } from "./errors.js";

const TARGET = { modelId: "model-golden", projectId: "project-golden", spaceId: "room-golden" };

function goldenGraph(): RealityModelGraph {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  return ingestArchitecturalScene(scene, TARGET).graph;
}

function hashOf(seed: string): string {
  return sha256Hex(seed);
}

/** The golden evidence recipe (mirrors the AISE-018 golden suite). */
function goldenEvidence(graph: RealityModelGraph): EvidenceGraph {
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

  const door = graph.objects.find((object) => object.objectClass === "DOOR")!;
  const links = [
    ...graph.objects.map((object) =>
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

describe("site report content (real chain, with evidence)", () => {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  const graph = ingestArchitecturalScene(scene, TARGET).graph;
  const evidence = goldenEvidence(graph);
  const report = siteReportOf(graph, { version: 1, evidence });

  it("carries the project/capture metadata (AC-120)", () => {
    expect(report.model.modelId).toBe("model-golden");
    expect(report.model.projectId).toBe("project-golden");
    expect(report.model.version).toBe(1);
    expect(report.model.graphDigest).toBe(graph.digest);
    expect(report.model.unit).toBe("meter");
    expect(report.model.spaces).toEqual([{ spaceId: "room-golden", kind: "ROOM" }]);
    // Capture references are the content-pinned provenance inputs (the
    // scene pin + the upstream extraction object pins).
    expect(report.capture.length).toBeGreaterThan(0);
    const sceneRef = report.capture.find((row) => row.kind === "scene");
    expect(sceneRef).toBeDefined();
    expect(sceneRef!.id).toBe(scene.sceneId);
    expect(sceneRef!.contentHash).toBe(scene.contentHash);
  });

  it("computes the model status honestly (weakest link + counts, AC-121)", () => {
    expect(report.status.overallEpistemic).toBe("INFERRED");
    expect(report.status.objects).toBe(8);
    expect(report.status.byState.INFERRED).toBe(8);
    expect(report.status.byState.CONFIRMED).toBe(0);
    expect(report.status.byClass).toEqual({ WALL: 4, FLOOR: 1, CEILING: 1, DOOR: 1, WINDOW: 1 });
    expect(report.status.evidence.live).toBe(9); // 8 LIDAR + 1 survey
    expect(report.status.evidence.linkRetracted).toBe(1);
    expect(report.status.evidence.recordRetracted).toBe(0);
    expect(report.status.plan).toEqual({ projected: 8, unprojected: 0 });
  });

  it("carries the canonical measurements VERBATIM (AC-121, never recomputed)", () => {
    expect(report.counts.measurements).toBeGreaterThan(0);
    const floorLength = report.measurements.find(
      (row) => row.objectClass === "FLOOR" && row.label === "length",
    )!;
    expect(floorLength.value).toBeCloseTo(4, 6);
    expect(floorLength.unit).toBe("meter");
    expect(floorLength.kind).toBe("geometry");
    // The verbatim value round-trips exactly (no formatting drift).
    expect(floorLength.value).toBe(graph.objects.find((object) => object.objectClass === "FLOOR")!.geometry!.structured!.width.value);
    // Every golden measurement is a geometry quantity (the chain asserts
    // no property assertions — absence surfaces honestly).
    expect(report.measurements.every((row) => row.kind === "geometry")).toBe(true);
  });

  it("distinguishes confirmed facts from inference (AC-122, epistemic badges)", () => {
    expect(report.objects).toHaveLength(8);
    for (const row of report.objects) {
      expect(["OBSERVED", "INFERRED", "CONFIRMED", "PROPOSED"]).toContain(row.epistemic);
    }
    // The golden v1 chain is all INFERRED (passthrough — never upgraded).
    expect(report.objects.every((row) => row.epistemic === "INFERRED")).toBe(true);
  });

  it("surfaces evidence records with their source links and honest statuses", () => {
    expect(report.evidenceRows).toHaveLength(10);
    const live = report.evidenceRows.filter((row) => row.status === "LIVE");
    expect(live).toHaveLength(9);
    const retracted = report.evidenceRows.filter((row) => row.status === "LINK_RETRACTED");
    expect(retracted).toHaveLength(1);
    expect(retracted[0]!.kind).toBe("HUMAN_OBSERVATION");
    expect(retracted[0]!.subject).toContain("object-existence");
    // Source links preserved: capture pins, measurement method, observation statement.
    const lidarRow = report.evidenceRows.find((row) => row.kind === "LIDAR")!;
    expect(lidarRow.source).toContain("capture sess-golden/asset-golden");
    expect(lidarRow.source).toContain("2048 bytes");
    expect(lidarRow.source).toContain("hash " + hashOf("golden-lidar-asset").slice(0, 12));
    const surveyRow = report.evidenceRows.find((row) => row.kind === "MEASUREMENT")!;
    expect(surveyRow.source).toContain("manual-measurement 2.7 meter by surveyor-bob");
    expect(surveyRow.recordedAt).toBe("2026-09-01T09:36:00Z");
  });

  it("lists the retracted evidence as an honest issue (never silently dropped)", () => {
    const retractedIssues = report.issues.filter((issue) => issue.kind === "retracted-evidence");
    expect(retractedIssues).toHaveLength(1);
    expect(retractedIssues[0]!.detail).toContain("link-retracted");
  });

  it("declares asset references honestly when the chain carries none (absence is honest)", () => {
    // The golden chain carries no geometry asset references — the
    // report says so instead of inventing references (the synthetic
    // suite below covers the present-assets path).
    expect(report.imageRefs).toHaveLength(0);
  });

  it("includes the AISE-017 plan document and embeds both limitation sets", () => {
    expect(report.plan).toBeDefined();
    expect(report.plan!.counts.projected).toBe(8);
    expect(report.limitations).toEqual(SITE_REPORT_LIMITATIONS);
    expect(report.limitations.length).toBe(7);
  });
});

describe("site report fail-closed contract", () => {
  it("requires a version when an evidence graph is supplied (version-pinned subjects)", () => {
    const graph = goldenGraph();
    const error = capture(() => siteReportOf(graph, { evidence: goldenEvidence(graph) }));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details.field).toBe("version");
  });

  it("rejects a non-positive version", () => {
    const error = capture(() => siteReportOf(goldenGraph(), { version: 0 }));
    expect(error?.code).toBe("VALIDATION_FAILED");
  });

  it("omits evidence entirely when none is supplied (absence is honest)", () => {
    const report = siteReportOf(goldenGraph());
    expect(report.evidenceRows).toHaveLength(0);
    expect(report.status.evidence.live).toBe(0);
    expect(report.objects.every((row) => row.evidence.length === 0)).toBe(true);
  });

  it("can exclude the plan drawing (includePlan: false)", () => {
    const report = siteReportOf(goldenGraph(), { includePlan: false });
    expect(report.plan).toBeUndefined();
    expect(report.status.plan).toBeUndefined();
  });

  it("does not mutate the graph (derived state, no canonical authority change)", () => {
    const graph = goldenGraph();
    const before = JSON.stringify(graph);
    siteReportOf(graph, { version: 1, evidence: goldenEvidence(graph) });
    expect(JSON.stringify(graph)).toBe(before);
  });
});

// --- synthetic graph: property assertions, asset refs, unprojected issues ----

function synthHash(seed: string): string {
  return seed.padEnd(64, "0").slice(0, 64).replace(/[^0-9a-f]/g, "1");
}

function synthRectangle(
  frame: { planePoint: { x: number; y: number; z: number }; axisU: { x: number; y: number; z: number }; axisV: { x: number; y: number; z: number } },
  bounds: { uMin: number; uMax: number; vMin: number; vMax: number },
) {
  const at = (u: number, v: number) => ({
    x: frame.planePoint.x + frame.axisU.x * u + frame.axisV.x * v,
    y: frame.planePoint.y + frame.axisU.y * u + frame.axisV.y * v,
    z: frame.planePoint.z + frame.axisU.z * u + frame.axisV.z * v,
  });
  const { uMin, uMax, vMin, vMax } = bounds;
  return {
    uMin, uMax, vMin, vMax,
    center: at((uMin + uMax) / 2, (vMin + vMax) / 2),
    corners: [at(uMin, vMin), at(uMax, vMin), at(uMax, vMax), at(uMin, vMax)],
  };
}

/** A horizontal floor 4 x 3 m at z = 0. */
function synthFloorGeometry(): StructuredPlanarGeometryInput {
  const frame = {
    planePoint: { x: 2, y: 1.5, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    axisU: { x: 1, y: 0, z: 0 },
    axisV: { x: 0, y: 1, z: 0 },
  };
  return {
    shape: "planar-rectangle",
    frame,
    rectangle: synthRectangle(frame, { uMin: -2, uMax: 2, vMin: -1.5, vMax: 1.5 }),
    width: { value: 4, unit: "meter", uncertainty: { kind: "standard", u: 0.02 } },
    height: { value: 3, unit: "meter" },
    area: { value: 12, unit: "square_meter" },
    elevation: { value: 0, unit: "meter" },
    quality: { pointCount: 4000, residualRms: 0.004, residualMaxAbs: 0.012 },
  };
}

function synthProvenance(seed: string) {
  return modelProvenance("test/reporting", { fixture: seed }, [
    {
      kind: "object",
      serviceId: "test.semantics",
      method: "test/extraction",
      objectId: `obj-${seed}`,
      contentHash: synthHash(seed),
      epistemic: "INFERRED",
    },
  ]);
}

const SYNTH_MODEL = "model-synth-report";
const SYNTH_SPACE = "room-synth-report";

function synthGraph(inputs: readonly RealityObjectInput[]): ReturnType<typeof assembleModelGraph> {
  const relationships = inputs.map((input) => {
    const objectId = makeRealityObject(SYNTH_MODEL, input).objectId;
    return { type: "CONTAINS" as const, fromId: SYNTH_SPACE, toId: objectId };
  });
  return assembleModelGraph({
    modelId: SYNTH_MODEL,
    projectId: "project-synth-report",
    spaces: [{ spaceId: SYNTH_SPACE, kind: "ROOM", frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" } }],
    objects: inputs,
    relationships,
  });
}

describe("site report content (synthetic graph: properties, assets, issues)", () => {
  const graph = synthGraph([
    {
      objectClass: "FLOOR",
      structuredGeometry: synthFloorGeometry(),
      epistemicState: "INFERRED",
      provenance: synthProvenance("floor"),
      properties: [
        propertyAssertion({
          key: "roomHeight",
          quantity: { value: 2.7, unit: "meter", uncertainty: { kind: "expanded", U: 0.1, coverageFactor: 2 } },
          status: "CONFIRMED",
          kind: "measurement",
          evidenceRefs: ["evd-synth-1"],
          method: "survey/total-station",
          verifiedBy: "svc:verification-1",
          verifiedAt: "2026-09-02T11:00:00Z",
        }),
      ],
    },
    {
      objectClass: "WALL",
      assetRefs: [{ kind: "point-cloud", contentHash: synthHash("wall-cloud"), pointCount: 50, epistemic: "INFERRED" }],
      epistemicState: "OBSERVED",
      provenance: synthProvenance("wall"),
    },
  ]);

  it("carries property assertions as measurement rows with their OWN status (AC-122)", () => {
    const report = siteReportOf(graph);
    const propertyRow = report.measurements.find((row) => row.label === "roomHeight")!;
    expect(propertyRow.kind).toBe("property");
    expect(propertyRow.value).toBe(2.7);
    expect(propertyRow.unit).toBe("meter");
    expect(propertyRow.status).toBe("CONFIRMED"); // the assertion's status, not the object's
    expect(propertyRow.measurementKind).toBe("measurement");
    expect(propertyRow.uncertainty).toBe("+/- U(k=2) 0.1");
  });

  it("references geometry assets honestly (content hash + point count, not embedded)", () => {
    const report = siteReportOf(graph);
    expect(report.imageRefs).toHaveLength(1);
    const ref = report.imageRefs[0]!;
    expect(ref.kind).toBe("point-cloud");
    expect(ref.contentHash).toBe(synthHash("wall-cloud"));
    expect(ref.pointCount).toBe(50);
    expect(ref.note).toContain("referenced by content hash, not embedded");
  });

  it("lists the asset-only object as an honest unprojected issue (AC-121/AC-122)", () => {
    const report = siteReportOf(graph);
    const issue = report.issues.find((entry) => entry.kind === "unprojected-object");
    expect(issue).toBeDefined();
    expect(issue!.detail).toContain("asset-only-geometry");
    const wallRow = report.objects.find((row) => row.objectClass === "WALL")!;
    expect(wallRow.epistemic).toBe("OBSERVED");
    // Mixed states stay distinct: CONFIRMED property vs OBSERVED wall vs
    // INFERRED floor — nothing is collapsed.
    expect(report.status.overallEpistemic).toBe("INFERRED");
    expect(report.status.byState.OBSERVED).toBe(1);
    expect(report.status.byState.INFERRED).toBe(1);
  });

  it("carries the geometric uncertainty VERBATIM (standard kind preserved)", () => {
    const report = siteReportOf(graph);
    const floorLength = report.measurements.find(
      (row) => row.objectClass === "FLOOR" && row.label === "length",
    )!;
    expect(floorLength.uncertainty).toBe("+/- 1sigma 0.02");
  });
});

describe("verbatim precision discrimination (the mutation-harness teeth)", () => {
  it("round-trips sub-decimal measurement values EXACTLY (no display reformatting)", () => {
    const graph = synthGraph([
      {
        objectClass: "FLOOR",
        structuredGeometry: (() => {
          const frame = {
            planePoint: { x: 1.17283945, y: 0.5, z: 0 },
            normal: { x: 0, y: 0, z: 1 },
            axisU: { x: 1, y: 0, z: 0 },
            axisV: { x: 0, y: 1, z: 0 },
          };
          return {
            shape: "planar-rectangle" as const,
            frame,
            rectangle: synthRectangle(frame, { uMin: -1.17283945, uMax: 1.17283945, vMin: -0.5, vMax: 0.5 }),
            width: { value: 2.345678912, unit: "meter" as const },
            height: { value: 1, unit: "meter" as const },
            area: { value: 2.345678912, unit: "square_meter" as const },
            elevation: { value: 0, unit: "meter" as const },
            quality: { pointCount: 100, residualRms: 0.01, residualMaxAbs: 0.03 },
          };
        })(),
        epistemicState: "INFERRED",
        provenance: synthProvenance("precise"),
      },
    ]);
    const report = siteReportOf(graph);
    const row = report.measurements.find((row) => row.label === "length")!;
    // The sub-decimal precision survives the composition EXACTLY.
    expect(row.value).toBe(2.345678912);
    const pdf = renderSiteReportPdf(report);
    expect(pdf.text).toContain("2.345678912 meter");
  });

  it("carries the retracted evidence status INTO the object inventory row (per-object badges)", () => {
    const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
    const graph = ingestArchitecturalScene(scene, TARGET).graph;
    const evidence = goldenEvidence(graph);
    const report = siteReportOf(graph, { version: 1, evidence });
    const door = graph.objects.find((object) => object.objectClass === "DOOR")!;
    const doorRow = report.objects.find((row) => row.objectId === door.objectId)!;
    // The door carries BOTH the LIVE LIDAR link and the LINK_RETRACTED
    // observation link — statuses visible per object, never collapsed.
    const statuses = doorRow.evidence.map((entry) => entry.status).sort();
    expect(statuses).toEqual(["LINK_RETRACTED", "LIVE"]);
  });
});

