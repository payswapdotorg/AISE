/**
 * Evidence-service composition tests: bounded registration,
 * boundary-verifying store injection, the link/retract flow, the
 * validity projection, and the no-second-canonical-authority
 * guarantee (the committed graph's digest never changes through
 * evidence operations).
 */
import { describe, expect, it } from "vitest";
import { loadConfig } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import {
  assembleModelGraph,
  evidenceRecord,
  makeRealityObject,
  makeSpaceNode,
  modelProvenance,
  propertyAssertion,
  validateEvidenceGraph,
  type EvidenceRecord,
  type EvidenceSubject,
  type RealityModelGraph,
} from "@aise/engineering-model";
import { EvidenceServiceError } from "./errors.js";
import type { CaptureUploadReader, CaptureUploadView } from "./capture.js";
import {
  buildEvidenceService,
  DEFAULT_MAX_EVIDENCE_LINKS,
  DEFAULT_MAX_EVIDENCE_RECORDS,
  type EvidenceService,
} from "./runtime.js";
import type { ModelGraphReader } from "./store.js";

const MODEL = "model-runtime";
const PROJECT = "project-runtime";
const SPACE = "room-runtime";
const EVIDENCE_SESSION = "session-runtime00001";
const EVIDENCE_ASSET = "asset-runtime000001";

const UPLOAD: CaptureUploadView = {
  projectId: PROJECT,
  sessionId: EVIDENCE_SESSION,
  assetId: EVIDENCE_ASSET,
  packageId: "package-runtime0001",
  assetType: "DEPTH",
  receivedHash: "d".repeat(64),
  byteSize: 2048,
  acquisition: { capturedAt: "2026-09-01T09:30:00Z" },
};

const captureReader: CaptureUploadReader = {
  getUpload: (sessionId, assetId) =>
    sessionId === EVIDENCE_SESSION && assetId === EVIDENCE_ASSET ? UPLOAD : undefined,
};

// ---------------------------------------------------------------------------
// The compact CONFIRMED graph (public constructors only): a wall
// (INFERRED) with a CONFIRMED fireRating citing the LIDAR record,
// a CONFIRMED door, and a room with a CONFIRMED roomHeight citing
// the survey measurement.
// ---------------------------------------------------------------------------

function quantity(value: number, u: number) {
  return { value, unit: "meter" as const, uncertainty: { kind: "standard" as const, u } };
}

const PLANAR_GEOMETRY = {
  shape: "planar-rectangle" as const,
  frame: {
    planePoint: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    axisU: { x: 1, y: 0, z: 0 },
    axisV: { x: 0, y: 1, z: 0 },
  },
  rectangle: {
    uMin: 0,
    uMax: 4,
    vMin: 0,
    vMax: 2.7,
    center: { x: 2, y: 1.35, z: 0 },
    corners: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
      { x: 4, y: 2.7, z: 0 },
      { x: 0, y: 2.7, z: 0 },
    ],
  },
  width: quantity(4, 0.02),
  height: quantity(2.7, 0.02),
  area: { value: 10.8, unit: "square_meter" as const, uncertainty: { kind: "standard" as const, u: 0.1 } },
  quality: { pointCount: 400, residualRms: 0.005, residualMaxAbs: 0.02 },
};

const PROVENANCE = modelProvenance("review/confirm-v1", { source: "runtime-test" }, [
  {
    kind: "object",
    serviceId: "svc:test-reconstruction",
    method: "cluster/plane-fit-v1",
    objectId: "obj-runtime-source01",
    contentHash: "b".repeat(64),
    epistemic: "INFERRED",
  },
  { kind: "scene", sceneId: "scene-runtime00001", contentHash: "a".repeat(64), epistemic: "CONFIRMED" },
]);

function confirmedGraph(lidarId: string, measurementId: string): RealityModelGraph {
  const wall = makeRealityObject(MODEL, {
    objectClass: "WALL",
    structuredGeometry: PLANAR_GEOMETRY,
    properties: [
      propertyAssertion({
        key: "fireRating",
        quantity: quantity(60, 0.5),
        status: "CONFIRMED",
        kind: "measurement",
        evidenceRefs: [lidarId],
        verifiedBy: "user:site-engineer",
        verifiedAt: "2026-09-06T10:00:00Z",
      }),
    ],
    epistemicState: "INFERRED",
    provenance: PROVENANCE,
  });
  const door = makeRealityObject(MODEL, {
    objectClass: "DOOR",
    structuredGeometry: PLANAR_GEOMETRY,
    properties: [],
    epistemicState: "CONFIRMED",
    provenance: PROVENANCE,
  });
  const space = makeSpaceNode({
    spaceId: SPACE,
    kind: "ROOM",
    frame: { up: { x: 0, y: 0, z: 1 }, unit: "meter" },
    properties: [
      propertyAssertion({
        key: "roomHeight",
        quantity: quantity(3.0, 0.005),
        status: "CONFIRMED",
        kind: "measurement",
        evidenceRefs: [measurementId],
        verifiedBy: "user:site-engineer",
        verifiedAt: "2026-09-06T10:00:00Z",
      }),
    ],
  });
  return assembleModelGraph({
    modelId: MODEL,
    projectId: PROJECT,
    spaces: [space],
    objects: [wall, door],
    relationships: [
      { type: "CONTAINS", fromId: SPACE, toId: wall.objectId },
      { type: "CONTAINS", fromId: SPACE, toId: door.objectId },
      { type: "OPENING_IN", fromId: door.objectId, toId: wall.objectId },
    ],
  });
}

function doorIdOf(graph: RealityModelGraph): string {
  return graph.objects.find((object) => object.objectClass === "DOOR")!.objectId;
}

function wallIdOf(graph: RealityModelGraph): string {
  return graph.objects.find((object) => object.objectClass === "WALL")!.objectId;
}

// ---------------------------------------------------------------------------
// Service wiring
// ---------------------------------------------------------------------------

/** The committed graph served to the service (set after registration). */
let committed: RealityModelGraph | undefined;
const modelReader: ModelGraphReader = {
  getModelGraph: (modelId, version) => (modelId === MODEL && version === 1 ? committed : undefined),
};

let tick = 0;
function buildService(options?: {
  maxEvidenceRecords?: number;
  maxEvidenceLinks?: number;
  modelReader?: ModelGraphReader;
  captureReader?: CaptureUploadReader;
}): EvidenceService {
  const configResult = loadConfig({ AISE_ENV: "test", AISE_LOG_LEVEL: "error" });
  if (!configResult.ok) {
    throw new Error("test config must load");
  }
  tick = 0;
  return buildEvidenceService(configResult.config, createLogger({ level: "error", module: "evidence-test" }), {
    now: () => {
      tick += 1;
      return `2026-09-04T12:${String(tick).padStart(2, "0")}:00Z`;
    },
    ...(options?.modelReader !== undefined ? { modelReader: options.modelReader } : {}),
    ...(options?.captureReader !== undefined ? { captureReader: options.captureReader } : {}),
    ...(options?.maxEvidenceRecords !== undefined ? { maxEvidenceRecords: options.maxEvidenceRecords } : {}),
    ...(options?.maxEvidenceLinks !== undefined ? { maxEvidenceLinks: options.maxEvidenceLinks } : {}),
  });
}

function measurementRecord(value = 3.0): EvidenceRecord {
  return evidenceRecord({
    kind: "MEASUREMENT",
    source: {
      kind: "manual-measurement",
      value,
      unit: "m",
      method: "survey/total-station",
      measuredBy: "surveyor-bob",
      measuredAt: "2026-09-03T14:00:00Z",
    },
    recordedBy: "svc:evidence-ingest",
    recordedAt: "2026-09-04T10:00:00Z",
  });
}

function errorOf(action: () => unknown): EvidenceServiceError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(EvidenceServiceError);
    return error as EvidenceServiceError;
  }
  throw new Error("expected the action to throw");
}

/**
 * The happy-path composition: register the standard evidence, commit
 * the CONFIRMED graph citing both records, link every CONFIRMED
 * subject, and return the wired service.
 */
function stockedService() {
  const service = buildService({ modelReader, captureReader });
  const { record: lidar } = service.registerCaptureEvidence(
    PROJECT,
    { sessionId: EVIDENCE_SESSION, assetId: EVIDENCE_ASSET },
    { recordedBy: "svc:evidence-ingest" },
  );
  const measurement = measurementRecord();
  service.registerEvidence(PROJECT, measurement);
  committed = confirmedGraph(lidar.evidenceId, measurement.evidenceId);
  const doorSubject: EvidenceSubject = { kind: "object-existence", modelId: MODEL, version: 1, objectId: doorIdOf(committed) };
  const fireRatingSubject: EvidenceSubject = { kind: "object-property", modelId: MODEL, version: 1, objectId: wallIdOf(committed), propertyKey: "fireRating" };
  const roomHeightSubject: EvidenceSubject = { kind: "space-property", modelId: MODEL, version: 1, spaceId: SPACE, propertyKey: "roomHeight" };
  service.linkEvidence(PROJECT, doorSubject, lidar.evidenceId, { linkedBy: "svc:review-linker", linkedAt: "2026-09-04T12:30:00Z" });
  service.linkEvidence(PROJECT, fireRatingSubject, lidar.evidenceId, { linkedBy: "svc:review-linker", linkedAt: "2026-09-04T12:31:00Z" });
  service.linkEvidence(PROJECT, roomHeightSubject, measurement.evidenceId, { linkedBy: "svc:review-linker", linkedAt: "2026-09-04T12:32:00Z" });
  return { service, lidar, measurement, doorSubject, fireRatingSubject, roomHeightSubject };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildEvidenceService", () => {
  it("builds with bounded-compute defaults", () => {
    const service = buildService();
    expect(service.limits.maxEvidenceRecords).toBe(DEFAULT_MAX_EVIDENCE_RECORDS);
    expect(service.limits.maxEvidenceLinks).toBe(DEFAULT_MAX_EVIDENCE_LINKS);
    expect(DEFAULT_MAX_EVIDENCE_RECORDS).toBeGreaterThan(0);
    expect(DEFAULT_MAX_EVIDENCE_LINKS).toBeGreaterThan(0);
  });

  it("rejects invalid bounds (fail closed)", () => {
    expect(() => buildService({ maxEvidenceRecords: 0 })).toThrow(EvidenceServiceError);
    expect(() => buildService({ maxEvidenceLinks: 0 })).toThrow(EvidenceServiceError);
  });
});

describe("registerCaptureEvidence", () => {
  it("registers from the reader view and reports idempotent replay", () => {
    const service = buildService({ captureReader });
    const first = service.registerCaptureEvidence(
      PROJECT,
      { sessionId: EVIDENCE_SESSION, assetId: EVIDENCE_ASSET },
      { recordedBy: "svc:ingest" },
    );
    expect(first.result.status).toBe("created");
    expect(first.record.kind).toBe("LIDAR");
    const second = service.registerCaptureEvidence(
      PROJECT,
      { sessionId: EVIDENCE_SESSION, assetId: EVIDENCE_ASSET },
      { recordedBy: "svc:ingest" },
    );
    expect(second.result.status).toBe("exists_identical");
    expect(second.record.evidenceId).toBe(first.record.evidenceId);
  });

  it("fails closed without a capture reader", () => {
    const service = buildService();
    expect(
      errorOf(() =>
        service.registerCaptureEvidence(PROJECT, { sessionId: EVIDENCE_SESSION, assetId: EVIDENCE_ASSET }, { recordedBy: "svc:ingest" }),
      ).code,
    ).toBe("CAPTURE_UPLOAD_NOT_FOUND");
  });

  it("fails closed for unknown uploads", () => {
    const service = buildService({ captureReader });
    expect(
      errorOf(() =>
        service.registerCaptureEvidence(PROJECT, { sessionId: "session-unknown00001", assetId: EVIDENCE_ASSET }, { recordedBy: "svc:ingest" }),
      ).code,
    ).toBe("CAPTURE_UPLOAD_NOT_FOUND");
  });

  it("fails closed across the project boundary", () => {
    const service = buildService({ captureReader });
    expect(
      errorOf(() =>
        service.registerCaptureEvidence("project-other", { sessionId: EVIDENCE_SESSION, assetId: EVIDENCE_ASSET }, { recordedBy: "svc:ingest" }),
      ).code,
    ).toBe("PROJECT_MISMATCH");
  });
});

describe("the validity projection (AC-062 / AC-063)", () => {
  it("VALID: every CONFIRMED assertion covered by live support", () => {
    const { service } = stockedService();
    const report = service.computeVersionValidity(MODEL, 1);
    expect(report.confirmedAssertionCount).toBe(3);
    expect(report.validCount).toBe(3);
    expect(report.invalidatedCount).toBe(0);
    expect(report.graphDigest).toBe(committed!.digest);
  });

  it("INVALIDATED: no mapping at all (verified assertions without provenance)", () => {
    const service = buildService({ modelReader });
    committed = confirmedGraph("ev-1111111111111111", "ev-2222222222222222");
    const report = service.computeVersionValidity(MODEL, 1);
    expect(report.validCount).toBe(0);
    expect(report.invalidatedCount).toBe(3);
    for (const entry of report.entries) {
      expect(entry.invalidationReasons).toContain("NO_LIVE_SUPPORT");
    }
  });

  it("retracting the LINK flips the projection to INVALIDATED (AC-063)", () => {
    const { service, fireRatingSubject } = stockedService();
    const digestBefore = committed!.digest;
    const links = service.linksForSubject(PROJECT, fireRatingSubject);
    expect(links).toHaveLength(1);
    const result = service.retractLink(PROJECT, links[0]!.linkId, {
      retractedBy: "user:reviewer",
      reason: "support removed at review",
      retractedAt: "2026-09-04T13:00:00Z",
    });
    expect(result.status).toBe("retracted");
    const report = service.computeVersionValidity(MODEL, 1);
    const fireRating = report.entries.find((entry) => entry.subject.propertyKey === "fireRating")!;
    expect(fireRating.valid).toBe(false);
    expect(fireRating.invalidationReasons).toContain("NO_LIVE_SUPPORT");
    expect(fireRating.invalidationReasons).toContain("UNMAPPED_CITATION");
    // The canonical graph never changed — no second authority.
    expect(committed!.digest).toBe(digestBefore);
  });

  it("retracting the EVIDENCE invalidates every supported assertion", () => {
    const { service, lidar } = stockedService();
    const digestBefore = committed!.digest;
    const result = service.retractEvidence(PROJECT, lidar.evidenceId, {
      retractedBy: "user:reviewer",
      reason: "source retracted upstream",
    });
    expect(result.status).toBe("retracted");
    const report = service.computeVersionValidity(MODEL, 1);
    const door = report.entries.find((entry) => entry.subject.kind === "object-existence")!;
    expect(door.valid).toBe(false);
    expect(door.retractedSupportingEvidence).toEqual([lidar.evidenceId]);
    const roomHeight = report.entries.find((entry) => entry.subject.propertyKey === "roomHeight")!;
    expect(roomHeight.valid).toBe(true);
    expect(committed!.digest).toBe(digestBefore);
  });

  it("fails closed without a model reader and for unknown versions", () => {
    const service = buildService();
    expect(errorOf(() => service.computeVersionValidity(MODEL, 1)).code).toBe("MODEL_VERSION_NOT_FOUND");
    const { service: wired } = stockedService();
    expect(errorOf(() => wired.computeVersionValidity(MODEL, 9)).code).toBe("MODEL_VERSION_NOT_FOUND");
  });
});

describe("bounded compute (the store's enemy is unbounded growth)", () => {
  it("rejects registration beyond the record bound", () => {
    const service = buildService({ modelReader, captureReader, maxEvidenceRecords: 1 });
    service.registerEvidence(PROJECT, measurementRecord(3.0));
    const error = errorOf(() => service.registerEvidence(PROJECT, measurementRecord(3.1)));
    expect(error.code).toBe("BOUNDS_EXCEEDED");
  });

  it("rejects linking beyond the link bound", () => {
    const service = buildService({ modelReader, maxEvidenceLinks: 1 });
    const measurement = measurementRecord();
    service.registerEvidence(PROJECT, measurement);
    committed = confirmedGraph("ev-1111111111111111", measurement.evidenceId);
    const doorId = doorIdOf(committed);
    service.linkEvidence(
      PROJECT,
      { kind: "object-existence", modelId: MODEL, version: 1, objectId: doorId },
      measurement.evidenceId,
      { linkedBy: "svc:review", linkedAt: "2026-09-04T12:30:00Z" },
    );
    const error = errorOf(() =>
      service.linkEvidence(
        PROJECT,
        { kind: "space-property", modelId: MODEL, version: 1, spaceId: SPACE, propertyKey: "roomHeight" },
        measurement.evidenceId,
        { linkedBy: "svc:review", linkedAt: "2026-09-04T12:31:00Z" },
      ),
    );
    expect(error.code).toBe("BOUNDS_EXCEEDED");
  });
});

describe("derived read views (coverage and bundles)", () => {
  it("evidenceCoverage summarizes per-entity completeness", () => {
    const { service } = stockedService();
    const coverage = service.evidenceCoverage(MODEL, 1);
    expect(coverage.modelId).toBe(MODEL);
    expect(coverage.summary.entityCount).toBe(3); // room + wall + door
    expect(coverage.summary.confirmedCount).toBe(3);
    expect(coverage.summary.confirmedValid).toBe(3);
    const room = coverage.entities.find((entity) => entity.entityId === SPACE)!;
    expect(room.entityKind).toBe("space");
    expect(room.confirmedCount).toBe(1);
    expect(room.confirmedValid).toBe(1);
  });

  it("evidenceBundle reports live evidence per assertion subject", () => {
    const { service, lidar } = stockedService();
    const doorId = doorIdOf(committed!);
    const doorBundle = service.evidenceBundle(MODEL, 1, doorId);
    expect(doorBundle.length).toBeGreaterThanOrEqual(1);
    const existence = doorBundle.find((entry) => entry.subject.kind === "object-existence")!;
    expect(existence.evidence.map((record) => record.evidenceId)).toEqual([lidar.evidenceId]);
  });
});

describe("the mapping snapshot (persistence boundary)", () => {
  it("snapshot validates as an honestly assembled graph", () => {
    const { service } = stockedService();
    const snapshot = service.snapshot(PROJECT)!;
    expect(() => validateEvidenceGraph(snapshot)).not.toThrow();
    expect(snapshot.records).toHaveLength(2);
    expect(snapshot.links).toHaveLength(3);
  });

  it("snapshot is undefined for empty projects (nothing asserted)", () => {
    const service = buildService();
    expect(service.snapshot("project-empty")).toBeUndefined();
  });
});
