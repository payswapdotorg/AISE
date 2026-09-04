/**
 * CRITICAL golden composition (AISE-014): the full
 * self-consistency QA chain over the real AISE-010 extraction,
 * AISE-011 ingestion, AISE-012 evidence linking and AISE-013
 * readiness computation of the exact golden room.
 *
 * Chain under test:
 *   AISE-010 extraction → AISE-011 ingestion → committed v1
 *     → QA v1: PASS at every profile (the extraction is
 *       internally consistent, honestly INFERRED)
 *     → review pass: v2 confirms the door existence and the
 *       roomHeight measurement citing the evidence
 *     → AISE-012 linking: LIDAR → all object existences; the
 *       survey measurement → roomHeight
 *     → AISE-013: readiness computed over v2 (READY at
 *       CRITICAL with a budget) → QA consumes the readiness
 *       record as context: PASS, pins verified
 *     → AC-063: retracting the roomHeight link → QA reports
 *       CONFIRMATION_INVALIDATED (the contradiction the
 *       retraction creates in the committed graph)
 *     → a stale readiness pin (v1 digest over v2 content) →
 *       READINESS_CONTEXT_MISMATCH
 *     → contradiction variants (geometry/topology/semantic/
 *       cross-object) surgically injected into hand-built
 *       graphs → each is detected by exactly its code
 *     → full replay is bit-identical (digests, reports, ids)
 *     → the canonical graph and the evidence mapping are
 *       unchanged through every QA operation (no second
 *       authority — digest-proven)
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import { ingestArchitecturalScene } from "@aise/backend-reality-model";
import { buildEvidenceService, type CaptureUploadReader, type CaptureUploadView, type EvidenceService } from "@aise/backend-evidence";
import { buildAssuranceService } from "@aise/backend-assurance";
import { createInMemoryAssuranceStore } from "@aise/backend-assurance";
import { loadConfig } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import {
  assembleModelGraph,
  evidenceRecord,
  listConfirmedAssertionSubjects,
  makeSpaceNode,
  propertyAssertion,
  graphContentDigest,
  type EvidenceSubject,
  type PropertyAssertion,
  type RealityModelGraph,
} from "@aise/engineering-model";
import { runModelQa } from "./runtime.js";

const MODEL = "model-golden-qa";
const PROJECT = "project-golden-qa";
const SPACE = "room-golden-qa";
const target = { modelId: MODEL, projectId: PROJECT, spaceId: SPACE };

const EVIDENCE_SESSION = "session-golden000001";
const EVIDENCE_ASSET = "asset-golden0000001";

const DEPTH_UPLOAD: CaptureUploadView = {
  projectId: PROJECT,
  sessionId: EVIDENCE_SESSION,
  assetId: EVIDENCE_ASSET,
  packageId: "package-golden00001",
  assetType: "DEPTH",
  receivedHash: "d".repeat(64),
  byteSize: 2048,
  acquisition: { capturedAt: "2026-09-01T09:30:00Z" },
};

const captureReader: CaptureUploadReader = {
  getUpload: (sessionId, assetId) =>
    sessionId === EVIDENCE_SESSION && assetId === EVIDENCE_ASSET ? DEPTH_UPLOAD : undefined,
};

function surveyMeasurement(height: number): ReturnType<typeof evidenceRecord> {
  return evidenceRecord({
    kind: "MEASUREMENT",
    source: {
      kind: "manual-measurement",
      value: height,
      unit: "m",
      method: "survey/total-station",
      measuredBy: "surveyor-bob",
      measuredAt: "2026-09-03T14:00:00Z",
    },
    recordedBy: "svc:evidence-ingest",
    recordedAt: "2026-09-04T10:00:00Z",
  });
}

function confirmedVersion(v1: RealityModelGraph, measurementId: string): RealityModelGraph {
  // Inputs (NOT pre-built objects): assembleModelGraph expects
  // RealityObjectInput records — passing built objects would drop
  // geometry (the input field is `structuredGeometry`, not `geometry`).
  const objects = v1.objects.map((object) => ({
    objectClass: object.objectClass,
    ...(object.name !== undefined ? { name: object.name } : {}),
    ...(object.geometry?.structured !== undefined ? { structuredGeometry: object.geometry.structured } : {}),
    properties: object.properties,
    epistemicState: object.objectClass === "DOOR" ? ("CONFIRMED" as const) : object.epistemicState,
    provenance: object.provenance,
  }));

  const space = v1.spaces[0]!;
  const roomHeight = (space.properties ?? []).find((assertion) => assertion.key === "roomHeight");
  const properties: PropertyAssertion[] = [];
  if (roomHeight !== undefined && roomHeight.quantity !== undefined) {
    properties.push(
      propertyAssertion({
        key: roomHeight.key,
        quantity: {
          value: 2.7,
          unit: "meter",
          uncertainty: { kind: "standard", u: 0.005 },
        },
        status: "CONFIRMED",
        kind: "measurement",
        evidenceRefs: [measurementId],
        verifiedBy: "user:site-engineer",
        verifiedAt: "2026-09-06T10:00:00Z",
      }),
    );
  }

  return assembleModelGraph({
    modelId: v1.modelId,
    projectId: v1.projectId,
    spaces: [
      makeSpaceNode({
        spaceId: space.spaceId,
        kind: space.kind,
        ...(space.name !== undefined ? { name: space.name } : {}),
        frame: space.frame,
        ...(properties.length > 0 ? { properties } : {}),
      }),
    ],
    objects,
    relationships: v1.relationships.map((relationship) => ({
      type: relationship.type,
      fromId: relationship.fromId,
      toId: relationship.toId,
    })),
  });
}

/** The structural shape QA consumes (an adapter view of the AISE-013 report). */
type ReadinessSummarySource = {
  taskId: string;
  verdict: "READY" | "NOT_READY";
  assuranceProfile: "LIGHT" | "STANDARD" | "HIGH_ASSURANCE" | "CRITICAL";
  modelId: string;
  version: number;
  graphDigest: string;
  mappingDigest: string;
};

/** A QA run's readiness-context adapter over a real AISE-013 report. */
function readinessContextOf(report: {
  taskId: string;
  verdict: "READY" | "NOT_READY";
  assuranceProfile: "LIGHT" | "STANDARD" | "HIGH_ASSURANCE" | "CRITICAL";
  modelId: string;
  version: number;
  graphDigest: string;
  mappingDigest: string;
}) {
  return { ...report };
}

interface Composition {
  v1: RealityModelGraph;
  v2: RealityModelGraph;
  evidence: EvidenceService;
  mappingDigest: string;
  measurementId: string;
  roomHeightSubject: EvidenceSubject;
  v2CriticalReport: ReadinessSummarySource;
  retractRoomHeight: () => void;
}

function compose(): Composition {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  const v1 = ingestArchitecturalScene(scene, target).graph;

  const configResult = loadConfig({ AISE_ENV: "test", AISE_LOG_LEVEL: "error" });
  if (!configResult.ok) {
    throw new Error("test config must load");
  }
  const config = configResult.config;

  const modelReader = {
    getModelGraph: (modelId: string, version: number) =>
      modelId === MODEL && version === 1 ? v1 : modelId === MODEL && version === 2 ? v2Holder.graph : undefined,
  };

  const evidence: EvidenceService = buildEvidenceService(
    config,
    createLogger({ level: "error", module: "evidence-qa-golden" }),
    {
      captureReader,
      modelReader,
      now: () => "2026-09-04T12:00:00Z",
    },
  );

  const v2 = confirmedVersion(v1, "pending");
  const v2Holder: { graph: RealityModelGraph } = { graph: v2 };

  // Register capture + survey evidence.
  const { record: lidar } = evidence.registerCaptureEvidence(
    PROJECT,
    { sessionId: EVIDENCE_SESSION, assetId: EVIDENCE_ASSET },
    { recordedBy: "svc:evidence-ingest" },
  );
  const survey = surveyMeasurement(2.7);
  evidence.registerEvidence(PROJECT, survey);
  const measurementId = survey.evidenceId;

  // v2 with real evidence ids.
  v2Holder.graph = confirmedVersion(v1, measurementId);

  // Link evidence.
  for (const object of v2Holder.graph.objects) {
    const subject: EvidenceSubject = {
      kind: "object-existence",
      modelId: MODEL,
      version: 2,
      objectId: object.objectId,
    };
    const link = evidence.linkEvidence(PROJECT, subject, lidar.evidenceId, {
      linkedBy: "svc:review-linker",
      method: "review/link-v1",
      linkedAt: "2026-09-06T11:00:00Z",
    });
    expect(link.status).toBe("added");
  }
  const roomHeightSubject = listConfirmedAssertionSubjects(v2Holder.graph, 2).find(
    (ref) => ref.subject.kind === "space-property" && ref.subject.propertyKey === "roomHeight",
  )!.subject;
  const heightLink = evidence.linkEvidence(PROJECT, roomHeightSubject, measurementId, {
    linkedBy: "svc:review-linker",
    method: "review/link-v1",
    linkedAt: "2026-09-06T11:01:00Z",
  });
  expect(heightLink.status).toBe("added");

  // AISE-013 readiness over v2.
  const assurance = buildAssuranceService(
    config,
    createLogger({ level: "error", module: "assurance-qa-golden" }),
    {
      modelReader,
      evidenceReader: { getMapping: (projectId: string) => evidence.snapshot(projectId) },
      store: createInMemoryAssuranceStore({ now: () => "2026-09-06T12:00:00Z" }),
    },
  );
  assurance.registerTaskProfile(PROJECT, {
    taskId: "task-comply",
    intent: "AS_BUILT",
    profile: "CRITICAL",
    description: "dimensional compliance verification",
    uncertaintyBudget: { lengthM: 0.05 },
  });
  const v2Assessment = assurance.assessModelVersion(PROJECT, {
    modelId: MODEL,
    version: 2,
    taskId: "task-comply",
    assessedBy: "svc:assurance",
  });

  return {
    v1,
    v2: v2Holder.graph,
    evidence,
    mappingDigest: evidence.snapshot(PROJECT)!.digest,
    measurementId,
    roomHeightSubject,
    v2CriticalReport: readinessContextOf(v2Assessment.report),
    retractRoomHeight: () => {
      const link = evidence.linksForSubject(PROJECT, roomHeightSubject).find(
        (candidate) => candidate.evidenceId === measurementId,
      );
      if (link === undefined) {
        throw new Error("roomHeight link must exist before retraction");
      }
      evidence.retractLink(PROJECT, link.linkId, {
        retractedBy: "svc:review-linker",
        reason: "review/retract-superseded",
        retractedAt: "2026-09-06T13:00:00Z",
      });
    },
  };
}

const golden = compose();

describe("the golden composition (AISE-004 → 010 → 011 → 012 → 013 → 014)", () => {
  it("v1 (the raw extraction) is QA-PASS at every profile — internally consistent, honestly INFERRED", () => {
    for (const profile of ["LIGHT", "STANDARD", "HIGH_ASSURANCE", "CRITICAL"] as const) {
      const report = runModelQa({ graph: golden.v1, version: 1, profile });
      expect(report.outcome, `profile ${profile}`).toBe("PASS");
      expect(report.counts.total).toBe(0);
      expect(report.modelDigest).toBe(golden.v1.digest);
    }
  });

  it("v2 (reviewed: confirmations, links, measurement) is QA-PASS with the readiness context pinned", () => {
    const mapping = golden.evidence.snapshot(PROJECT)!;
    const report = runModelQa({
      graph: golden.v2,
      version: 2,
      profile: "CRITICAL",
      mapping,
      readiness: golden.v2CriticalReport,
    });
    expect(report.outcome).toBe("PASS");
    expect(report.counts.total).toBe(0);
    expect(report.mappingDigest).toBe(mapping.digest);
    expect(report.readiness?.verdict).toBe("READY");
  });

  it("AC-063: retracting the roomHeight link surfaces as CONFIRMATION_INVALIDATED (the committed graph contradicts its own evidence state)", () => {
    // Retract on a dedicated composition (destructive).
    const local = compose();
    local.retractRoomHeight();
    const mapping = local.evidence.snapshot(PROJECT)!;
    const report = runModelQa({ graph: local.v2, version: 2, profile: "CRITICAL", mapping });
    expect(report.outcome).toBe("CONTRADICTION");
    const finding = report.findings.find((f) => f.code === "CONFIRMATION_INVALIDATED");
    expect(finding).toBeDefined();
    expect(finding!.outcome).toBe("CONTRADICTION");
    expect(finding!.blocking).toBe(true);
    expect(finding!.epistemic?.assertionStatus).toBe("CONFIRMED");
  });

  it("a stale readiness pin (v1 readiness over v2 content) is READINESS_CONTEXT_MISMATCH", () => {
    const mapping = golden.evidence.snapshot(PROJECT)!;
    const stale = { ...golden.v2CriticalReport, graphDigest: golden.v1.digest };
    const report = runModelQa({ graph: golden.v2, version: 2, profile: "CRITICAL", mapping, readiness: stale });
    expect(report.findings.map((f) => f.code)).toContain("READINESS_CONTEXT_MISMATCH");
  });

  it("QA never mutates the canonical graph or the evidence mapping (no second authority — digest-proven)", () => {
    const v1Digest = golden.v1.digest;
    const v2Digest = golden.v2.digest;
    const mappingBefore = golden.evidence.snapshot(PROJECT)!.digest;
    runModelQa({ graph: golden.v1, version: 1, profile: "CRITICAL" });
    runModelQa({ graph: golden.v2, version: 2, profile: "CRITICAL", mapping: golden.evidence.snapshot(PROJECT)! });
    const reDerivedV1 = graphContentDigest(golden.v1.modelId, golden.v1.projectId, golden.v1.spaces, golden.v1.objects, golden.v1.relationships);
    const reDerivedV2 = graphContentDigest(golden.v2.modelId, golden.v2.projectId, golden.v2.spaces, golden.v2.objects, golden.v2.relationships);
    expect(reDerivedV1).toBe(v1Digest);
    expect(reDerivedV2).toBe(v2Digest);
    expect(golden.evidence.snapshot(PROJECT)!.digest).toBe(mappingBefore);
  });

  it("full replay is bit-identical (digests, reports, ids)", () => {
    const mapping = golden.evidence.snapshot(PROJECT)!;
    const r1 = runModelQa({ graph: golden.v2, version: 2, profile: "CRITICAL", mapping, readiness: golden.v2CriticalReport });
    const r2 = runModelQa({ graph: golden.v2, version: 2, profile: "CRITICAL", mapping, readiness: golden.v2CriticalReport });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    // and the whole composition replays identically:
    const replay = compose();
    const replayReport = runModelQa({
      graph: replay.v2,
      version: 2,
      profile: "CRITICAL",
      mapping: replay.evidence.snapshot(PROJECT)!,
      readiness: replay.v2CriticalReport,
    });
    expect(replayReport.digest).toBe(r1.digest);
    expect(replayReport.reportId).toBe(r1.reportId);
  });

  it("the AISE-013 report pins exactly the content QA observes (structural compatibility of the context adapter)", () => {
    expect(golden.v2CriticalReport.modelId).toBe(golden.v2.modelId);
    expect(golden.v2CriticalReport.version).toBe(2);
    expect(golden.v2CriticalReport.graphDigest).toBe(golden.v2.digest);
    expect(golden.v2CriticalReport.mappingDigest).toBe(golden.mappingDigest);
    expect(golden.v2CriticalReport.verdict).toBe("READY");
  });
});

describe("golden contradiction variants (one surgical contradiction each)", () => {
  const v2 = golden.v2;

  function variant(mutate: (draft: {
    modelId: string;
    projectId: string;
    spaces: Array<Record<string, unknown>>;
    objects: Array<Record<string, unknown>>;
    relationships: Array<Record<string, unknown>>;
  }) => void): RealityModelGraph {
    const draft = JSON.parse(JSON.stringify(v2)) as Parameters<typeof mutate>[0];
    mutate(draft);
    const spaces = draft.spaces as never;
    const objects = draft.objects as never;
    const relationships = draft.relationships as never;
    const digest = graphContentDigest(draft.modelId, draft.projectId, spaces, objects, relationships);
    const graph = { ...draft, digest } as unknown as RealityModelGraph;
    return deepFreeze(graph);
  }

  function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === "object") {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        deepFreeze((value as Record<string, unknown>)[key]);
      }
      Object.freeze(value);
    }
    return value;
  }

  it("GEOMETRY_EXTENTS_MISMATCH: a tampered wall width", () => {
    const graph = variant((draft) => {
      const wall = draft.objects.find((object) => object.objectClass === "WALL") as {
        geometry: { structured: { width: { value: number } } };
      };
      wall.geometry.structured.width.value = 6;
    });
    const report = runModelQa({ graph, version: 2, profile: "CRITICAL" });
    expect(report.findings.map((f) => f.code)).toContain("GEOMETRY_EXTENTS_MISMATCH");
    expect(report.outcome).toBe("CONTRADICTION");
  });

  it("TOPOLOGY MULTI_CONTAINER: the door claimed by a second space", () => {
    const graph = variant((draft) => {
      const door = draft.objects.find((object) => object.objectClass === "DOOR") as { objectId: string };
      const space = draft.spaces[0]!;
      const secondRoom = { ...space, spaceId: "room-golden-qa-b" };
      draft.spaces.push(secondRoom);
      draft.relationships.push({ type: "CONTAINS", fromId: "room-golden-qa-b", toId: door.objectId, relationId: "rel-golden-x1" });
    });
    const report = runModelQa({ graph, version: 2, profile: "CRITICAL" });
    expect(report.findings.map((f) => f.code)).toContain("MULTI_CONTAINER");
  });

  it("SEMANTIC KIND_FIELD_INCOMPATIBLE: the door gains a sill height", () => {
    const graph = variant((draft) => {
      const door = draft.objects.find((object) => object.objectClass === "DOOR") as {
        geometry: { structured: { sillHeight?: unknown } };
      };
      door.geometry.structured.sillHeight = { value: 0.4, unit: "meter" };
    });
    const report = runModelQa({ graph, version: 2, profile: "CRITICAL" });
    expect(report.findings.map((f) => f.code)).toContain("KIND_FIELD_INCOMPATIBLE");
  });

  it("CROSS_OBJECT OVERLAP_FORBIDDEN: a duplicated overlapping wall", () => {
    const graph = variant((draft) => {
      const wall = draft.objects.find((object) => object.objectClass === "WALL") as Record<string, unknown>;
      const overlapping = JSON.parse(JSON.stringify({ ...wall, objectId: "wall-golden-dup", contentHash: "e".repeat(64) })) as Record<string, unknown>;
      const geometry = overlapping.geometry as { structured: { rectangle: { uMin: number; uMax: number } } };
      geometry.structured.rectangle.uMin += 0.5; // overlap, not identical
      draft.objects.push(overlapping);
      draft.relationships.push({
        type: "CONTAINS",
        fromId: draft.spaces[0]!.spaceId,
        toId: overlapping.objectId as string,
        relationId: "rel-golden-x2",
      });
    });
    const report = runModelQa({ graph, version: 2, profile: "CRITICAL" });
    expect(report.findings.map((f) => f.code)).toContain("OVERLAP_FORBIDDEN");
  });

  it("GEOMETRY INVALID: a degenerate floor rectangle (constructor-bypassed, digest-pinnable)", () => {
    // (Non-finite content cannot be digest-pinned at all — the canonical
    // serializer rejects it — so the reachable structural violation is a
    // degenerate rectangle.)
    const graph = variant((draft) => {
      const floor = draft.objects.find((object) => object.objectClass === "FLOOR") as {
        geometry: { structured: { rectangle: { uMin: number; uMax: number } } };
      };
      floor.geometry.structured.rectangle.uMax = floor.geometry.structured.rectangle.uMin;
    });
    const report = runModelQa({ graph, version: 2, profile: "CRITICAL" });
    expect(report.findings.map((f) => f.code)).toContain("GEOMETRY_INVALID");
  });

  it("EPISTEMIC EPISTEMIC_UPGRADE_VIOLATION: the wall upgraded to OBSERVED over INFERRED assets", () => {
    const graph = variant((draft) => {
      const wall = draft.objects.find((object) => object.objectClass === "WALL") as {
        geometry: { assetRefs?: Array<Record<string, unknown>> };
        epistemicState: string;
      };
      wall.geometry.assetRefs = [
        { kind: "point-cloud", contentHash: "9".repeat(64), pointCount: 4000, epistemic: "INFERRED" },
      ];
      wall.epistemicState = "OBSERVED";
    });
    const report = runModelQa({ graph, version: 2, profile: "CRITICAL" });
    expect(report.findings.map((f) => f.code)).toContain("EPISTEMIC_UPGRADE_VIOLATION");
  });

  it("every variant keeps the graph digest honest (the boundary accepts them — findings, not input errors)", () => {
    const graph = variant(() => {});
    expect(graph.digest).toBe(v2.digest);
  });
});
