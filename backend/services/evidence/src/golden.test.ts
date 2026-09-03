/**
 * CRITICAL golden composition: the full evidence chain over the
 * real AISE-010 extraction and AISE-011 ingestion of the exact
 * golden room.
 *
 * Chain under test:
 *   AISE-004 boundary view (capture upload, server-computed hash)
 *     → AISE-012 capture adapter (content-pinned LIDAR record)
 *     → AISE-010 extraction → AISE-011 ingestion → committed v1
 *     → review confirmation: v2 commits CONFIRMED content citing
 *       the registered evidence (the honest review flow)
 *     → AISE-012 linking + the AC-062/AC-063 validity projection
 *     → retraction invalidates; deliberate re-attachment restores;
 *       canonical graphs never change (no second authority).
 *
 * Determinism is proven end-to-end: the entire composition is
 * rebuilt from scratch and every digest and report is
 * bit-identical.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints, roomGroundTruth } from "@aise/backend-semantics/fixtures/golden";
import { createInMemoryRealityModelStore, ingestArchitecturalScene } from "@aise/backend-reality-model";
import { loadConfig } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import {
  assembleModelGraph,
  evidenceRecord,
  listConfirmedAssertionSubjects,
  makeRealityObject,
  makeSpaceNode,
  modelProvenance,
  propertyAssertion,
  validateEvidenceGraph,
  type PropertyAssertion,
  type RealityModelGraph,
  type RealityObject,
} from "@aise/engineering-model";
import type { CaptureUploadReader, CaptureUploadView } from "./capture.js";
import { buildEvidenceService, type EvidenceService } from "./runtime.js";
import type { ModelGraphReader } from "./store.js";

const MODEL = "model-golden";
const PROJECT = "project-golden";
const SPACE = "room-golden";
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

/** The survey measurement of the room height (manual evidence). */
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

/**
 * The review pass: v1's committed content with the door existence
 * and the roomHeight measurement CONFIRMED against the registered
 * evidence (the flow AISE-016 will own; here it is exercised
 * through the public model constructors only).
 */
function confirmedVersion(v1: RealityModelGraph, measurementId: string): RealityModelGraph {
  const objects: readonly RealityObject[] = v1.objects.map((object) =>
    makeRealityObject(v1.modelId, {
      objectClass: object.objectClass,
      name: object.name,
      ...(object.geometry?.structured !== undefined ? { structuredGeometry: object.geometry.structured } : {}),
      properties: object.properties,
      epistemicState: object.objectClass === "DOOR" ? "CONFIRMED" : object.epistemicState,
      provenance: object.provenance,
    }),
  );

  const space = v1.spaces[0]!;
  const roomHeight = (space.properties ?? []).find((assertion) => assertion.key === "roomHeight");
  const properties: PropertyAssertion[] = [];
  if (roomHeight !== undefined) {
    properties.push(
      propertyAssertion({
        key: roomHeight.key,
        quantity: roomHeight.quantity,
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

/**
 * Runs the entire composition from scratch and returns every
 * artifact the assertions below pin. Deterministic: two runs of
 * this function produce bit-identical digests and reports.
 */
function compose() {
  // --- AISE-010 extraction (the exact golden room) ------------------------
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });

  // --- AISE-011 ingestion + versioned persistence -------------------------
  const realityStore = createInMemoryRealityModelStore({
    now: () => "2026-09-06T09:00:00Z",
  });
  realityStore.createModel({ modelId: MODEL, projectId: PROJECT });
  const v1 = ingestArchitecturalScene(scene, target).graph;
  const sceneProducer = modelProvenance("model/version-commit-v1", { sceneId: scene.sceneId }, [
    { kind: "scene", sceneId: scene.sceneId, contentHash: scene.contentHash, epistemic: scene.epistemicState },
  ]);
  const commitV1 = realityStore.commitModelVersion(MODEL, v1, sceneProducer);
  expect(commitV1.status).toBe("committed");
  expect(commitV1.version).toBe(1);

  // --- AISE-012 service wired to both boundaries ---------------------------
  const modelReader: ModelGraphReader = {
    getModelGraph: (modelId, version) => realityStore.getVersion(modelId, version)?.graph,
  };
  const configResult = loadConfig({ AISE_ENV: "test", AISE_LOG_LEVEL: "error" });
  if (!configResult.ok) {
    throw new Error("test config must load");
  }
  const service: EvidenceService = buildEvidenceService(
    configResult.config,
    createLogger({ level: "error", module: "evidence-golden" }),
    {
      captureReader,
      modelReader,
      now: () => "2026-09-04T12:00:00Z",
    },
  );

  // --- Evidence registration (capture-bound + manual survey) --------------
  const { record: lidar } = service.registerCaptureEvidence(
    PROJECT,
    { sessionId: EVIDENCE_SESSION, assetId: EVIDENCE_ASSET },
    { recordedBy: "svc:evidence-ingest" },
  );
  const roomHeightV1 = (v1.spaces[0]!.properties ?? []).find((p) => p.key === "roomHeight");
  const measuredHeight = roomHeightV1?.quantity !== undefined ? roomHeightV1.quantity.value : 3.0;
  const measurement = surveyMeasurement(measuredHeight);
  service.registerEvidence(PROJECT, measurement);

  // --- The review pass: v2 confirms content citing the evidence ------------
  const v2 = confirmedVersion(v1, measurement.evidenceId);
  const reviewProducer = modelProvenance(
    "model/review-confirm-v1",
    { sceneId: scene.sceneId, evidenceIds: `${lidar.evidenceId},${measurement.evidenceId}` },
    [
      { kind: "scene", sceneId: scene.sceneId, contentHash: scene.contentHash, epistemic: scene.epistemicState },
    ],
  );
  const commitV2 = realityStore.commitModelVersion(MODEL, v2, reviewProducer);
  expect(commitV2.status).toBe("committed");
  expect(commitV2.version).toBe(2);

  // --- Link the CONFIRMED subjects of v2 ----------------------------------
  const confirmed = listConfirmedAssertionSubjects(v2, 2);
  const doorRef = confirmed.find((ref) => ref.subject.kind === "object-existence" && ref.description.includes("DOOR"))!;
  const doorSubject = doorRef.subject;
  const roomHeightSubject = confirmed.find(
    (ref) => ref.subject.kind === "space-property" && ref.subject.propertyKey === "roomHeight",
  )!.subject;
  const doorLink = service.linkEvidence(PROJECT, doorSubject, lidar.evidenceId, {
    linkedBy: "svc:review-linker",
    method: "review/link-v1",
    linkedAt: "2026-09-06T11:00:00Z",
  });
  const heightLink = service.linkEvidence(PROJECT, roomHeightSubject, measurement.evidenceId, {
    linkedBy: "svc:review-linker",
    method: "review/link-v1",
    linkedAt: "2026-09-06T11:01:00Z",
  });
  expect(doorLink.status).toBe("added");
  expect(heightLink.status).toBe("added");

  return {
    scene,
    realityStore,
    service,
    lidar,
    measurement,
    doorSubject,
    roomHeightSubject,
    v1Digest: v1.digest,
    v2Digest: v2.digest,
    snapshot: service.snapshot(PROJECT)!,
    validity: service.computeVersionValidity(MODEL, 2),
  };
}

const golden = compose();

describe("the golden composition (AISE-004 → 010 → 011 → 012)", () => {
  it("extracts, ingests, and commits the golden room at the ground-truth shape", () => {
    // The extraction and ingestion are pinned by the AISE-010/011
    // golden suites; here we assert the composition carries the
    // same ground truth into the evidence-bearing version.
    const v2 = golden.realityStore.getVersion(MODEL, 2)!.graph;
    expect(v2.objects).toHaveLength(golden.scene.objects.length);
    expect(v2.objects.filter((object) => object.objectClass === "WALL").length).toBe(
      roomGroundTruth.objectCounts.walls,
    );
    expect(v2.objects.filter((object) => object.objectClass === "DOOR")).toHaveLength(
      roomGroundTruth.objectCounts.doors,
    );
  });

  it("registers capture-bound LIDAR evidence pinned to the ingestion hash", () => {
    expect(golden.lidar.kind).toBe("LIDAR");
    expect((golden.lidar.source as { contentHash: string }).contentHash).toBe(DEPTH_UPLOAD.receivedHash);
    const stored = golden.service.getEvidence(PROJECT, golden.lidar.evidenceId);
    expect(stored?.record).toEqual(golden.lidar);
  });

  it("the mapping snapshot validates at the persistence boundary", () => {
    expect(() => validateEvidenceGraph(golden.snapshot)).not.toThrow();
    expect(golden.snapshot.records).toHaveLength(2);
    expect(golden.snapshot.links).toHaveLength(2);
  });
});

describe("the validity projection over the golden chain (AC-062 / AC-063)", () => {
  it("v1 (all INFERRED): zero confirmed assertions — no false grading", () => {
    const report = golden.service.computeVersionValidity(MODEL, 1);
    expect(report.confirmedAssertionCount).toBe(0);
    expect(report.entries).toHaveLength(0);
  });

  it("v2 (review-confirmed): every CONFIRMED assertion is VALID", () => {
    const report = golden.validity;
    expect(report.confirmedAssertionCount).toBe(2); // door existence + roomHeight
    expect(report.validCount).toBe(2);
    expect(report.invalidatedCount).toBe(0);
    expect(report.graphDigest).toBe(golden.v2Digest);
    const roomHeight = report.entries.find((entry) => entry.subject.propertyKey === "roomHeight")!;
    expect(roomHeight.citedEvidenceRefs).toEqual([golden.measurement.evidenceId]);
    expect(roomHeight.liveSupportingEvidence).toEqual([golden.measurement.evidenceId]);
  });

  it("retracting the roomHeight LINK invalidates the measurement (AC-063)", () => {
    const { service, roomHeightSubject, measurement } = golden;
    const links = service.linksForSubject(PROJECT, roomHeightSubject);
    expect(links).toHaveLength(1);
    const result = service.retractLink(PROJECT, links[0]!.linkId, {
      retractedBy: "user:site-engineer",
      reason: "measurement flagged at review",
      retractedAt: "2026-09-07T09:00:00Z",
    });
    expect(result.status).toBe("retracted");

    const report = service.computeVersionValidity(MODEL, 2);
    const roomHeight = report.entries.find((entry) => entry.subject.propertyKey === "roomHeight")!;
    expect(roomHeight.valid).toBe(false);
    expect(roomHeight.invalidationReasons).toContain("NO_LIVE_SUPPORT");
    expect(roomHeight.invalidationReasons).toContain("UNMAPPED_CITATION");
    expect(roomHeight.citedEvidenceRefs).toEqual([measurement.evidenceId]);
    // The door survives.
    expect(report.entries.find((entry) => entry.subject.kind === "object-existence")!.valid).toBe(true);

    // A deliberate re-attachment is a NEW event; validity returns.
    const reattached = service.linkEvidence(PROJECT, roomHeightSubject, measurement.evidenceId, {
      linkedBy: "svc:review-linker",
      method: "review/link-v1",
      linkedAt: "2026-09-07T10:00:00Z",
    });
    expect(reattached.status).toBe("added");
    const after = service.computeVersionValidity(MODEL, 2);
    expect(after.validCount).toBe(2);
    expect(after.invalidatedCount).toBe(0);
    // History preserved: the retracted link and the re-attachment
    // are both in the mapping.
    const counts = service.snapshot(PROJECT)!;
    expect(counts.links).toHaveLength(3);
    expect(counts.linkRetractions).toHaveLength(1);
  });

  it("retracting the LIDAR EVIDENCE invalidates the door existence", () => {
    // Rebuild a pristine composition (the previous test retraced a link).
    const fresh = compose();
    const result = fresh.service.retractEvidence(PROJECT, fresh.lidar.evidenceId, {
      retractedBy: "user:site-engineer",
      reason: "source retracted upstream",
      retractedAt: "2026-09-07T09:00:00Z",
    });
    expect(result.status).toBe("retracted");
    const report = fresh.service.computeVersionValidity(MODEL, 2);
    const door = report.entries.find((entry) => entry.subject.kind === "object-existence")!;
    expect(door.valid).toBe(false);
    expect(door.retractedSupportingEvidence).toEqual([fresh.lidar.evidenceId]);
    const roomHeight = report.entries.find((entry) => entry.subject.propertyKey === "roomHeight")!;
    expect(roomHeight.valid).toBe(true);
    // The evidence record itself remains discoverable (history).
    expect(fresh.service.getEvidence(PROJECT, fresh.lidar.evidenceId)?.retraction?.reason).toBe(
      "source retracted upstream",
    );
  });

  it("the canonical graphs never change through evidence operations (no second authority)", () => {
    const fresh = compose();
    const beforeV1 = fresh.realityStore.getVersion(MODEL, 1)!.record;
    const beforeV2 = fresh.realityStore.getVersion(MODEL, 2)!.record;
    // Exercise every mutating evidence operation.
    const links = fresh.service.listLinks(PROJECT);
    fresh.service.retractLink(PROJECT, links[0]!.link.linkId, {
      retractedBy: "u",
      reason: "r",
      retractedAt: "2026-09-07T09:00:00Z",
    });
    fresh.service.retractEvidence(PROJECT, fresh.measurement.evidenceId, {
      retractedBy: "u",
      reason: "r",
      retractedAt: "2026-09-07T09:00:00Z",
    });
    fresh.service.computeVersionValidity(MODEL, 2);
    fresh.service.evidenceCoverage(MODEL, 2);
    expect(fresh.realityStore.getVersion(MODEL, 1)!.record.digest).toBe(beforeV1.digest);
    expect(fresh.realityStore.getVersion(MODEL, 2)!.record.digest).toBe(beforeV2.digest);
    expect(fresh.v1Digest).toBe(golden.v1Digest);
    expect(fresh.v2Digest).toBe(golden.v2Digest);
  });
});

describe("coverage and determinism", () => {
  it("evidenceCoverage reports per-entity completeness for v2", () => {
    const coverage = golden.service.evidenceCoverage(MODEL, 2);
    expect(coverage.summary.entityCount).toBe(golden.scene.objects.length + 1); // objects + room
    expect(coverage.summary.confirmedCount).toBe(2);
    expect(coverage.summary.confirmedValid).toBe(2);
    const room = coverage.entities.find((entity) => entity.entityId === SPACE)!;
    expect(room.entityKind).toBe("space");
    expect(room.assertionCount).toBe(1);
    expect(room.assertionsWithSupport).toBe(1);
  });

  it("the whole composition is deterministic (bit-identical digests and reports)", () => {
    const replay = compose();
    expect(replay.v1Digest).toBe(golden.v1Digest);
    expect(replay.v2Digest).toBe(golden.v2Digest);
    expect(replay.snapshot.digest).toBe(golden.snapshot.digest);
    expect(replay.lidar.evidenceId).toBe(golden.lidar.evidenceId);
    expect(replay.measurement.evidenceId).toBe(golden.measurement.evidenceId);
    expect(replay.validity).toEqual(golden.validity);
  });
});
