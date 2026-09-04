/**
 * CRITICAL golden composition: the full readiness chain over the
 * real AISE-010 extraction, AISE-011 ingestion, and AISE-012
 * evidence linking of the exact golden room.
 *
 * Chain under test:
 *   AISE-004 boundary view (capture upload, server-computed hash)
 *     → AISE-012 capture adapter (content-pinned LIDAR record)
 *     → AISE-010 extraction → AISE-011 ingestion → committed v1
 *       (all INFERRED, no evidence mapping)
 *       → AISE-013: v1 is READY for LIGHT exploration, NOT_READY
 *         for STANDARD documentation and CRITICAL compliance
 *         (honest task-specific grading of a raw extraction)
 *     → review pass: v2 commits CONFIRMED content (door
 *       existence; roomHeight as a CONFIRMED measurement carrying
 *       the survey's standard uncertainty) citing the evidence
 *     → AISE-012 linking: the LIDAR scan supports all 8 object
 *       existences, the survey measurement supports roomHeight
 *       → AISE-013: v2 is READY at every profile including
 *         CRITICAL with a declared accuracy budget
 *     → AC-063 → readiness: retracting the roomHeight link
 *       invalidates the confirmation; re-assessment flips v2
 *       CRITICAL to NOT_READY; history appends, the stale record
 *       is flagged; deliberate re-attachment restores readiness
 *     → a tighter budget than the survey uncertainty flips v2 to
 *       NOT_READY (task-specific accuracy, architecture §2.5)
 *     → the canonical graphs and the evidence mapping never
 *       change through any assurance operation (no second
 *       authority), and the composition is deterministic.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints, roomGroundTruth } from "@aise/backend-semantics/fixtures/golden";
import {
  createInMemoryRealityModelStore,
  ingestArchitecturalScene,
} from "@aise/backend-reality-model";
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
  type EvidenceSubject,
  type PropertyAssertion,
  type RealityModelGraph,
  type RealityObject,
} from "@aise/engineering-model";
import {
  buildEvidenceService,
  type CaptureUploadReader,
  type CaptureUploadView,
  type EvidenceService,
} from "@aise/backend-evidence";
import { buildAssuranceService } from "./runtime.js";
import { createInMemoryAssuranceStore } from "./store.js";
import { readinessReportDigest } from "./readiness.js";

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

/** The survey measurement of the room height (manual evidence, total station). */
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
 * evidence. The confirmed roomHeight carries the survey's stated
 * standard uncertainty (1σ = 5 mm) — the honest
 * AISE-009→011→012→013 uncertainty path: the estimate is
 * confirmed by a direct measurement that carries uncertainty.
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

/**
 * Runs the entire composition from scratch and returns every
 * artifact the assertions below pin. Deterministic: two runs of
 * this function produce bit-identical digests and reports.
 * Destructive tests rebuild their own pristine composition.
 */
function compose() {
  // --- AISE-010 extraction (the exact golden room) ------------------------
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });

  // --- AISE-011 ingestion + versioned persistence -------------------------
  const realityStore = createInMemoryRealityModelStore({ now: () => "2026-09-06T09:00:00Z" });
  realityStore.createModel({ modelId: MODEL, projectId: PROJECT });
  const v1 = ingestArchitecturalScene(scene, target).graph;
  const sceneProducer = modelProvenance("model/version-commit-v1", { sceneId: scene.sceneId }, [
    { kind: "scene", sceneId: scene.sceneId, contentHash: scene.contentHash, epistemic: scene.epistemicState },
  ]);
  const commitV1 = realityStore.commitModelVersion(MODEL, v1, sceneProducer);
  expect(commitV1.status).toBe("committed");
  expect(commitV1.version).toBe(1);

  // --- Shared boundary adapters ---------------------------------------------
  const modelReader = {
    getModelGraph: (modelId: string, version: number) => realityStore.getVersion(modelId, version)?.graph,
  };
  const configResult = loadConfig({ AISE_ENV: "test", AISE_LOG_LEVEL: "error" });
  if (!configResult.ok) {
    throw new Error("test config must load");
  }
  const config = configResult.config;

  // --- AISE-012 evidence service wired to both boundaries -------------------
  const evidence: EvidenceService = buildEvidenceService(
    config,
    createLogger({ level: "error", module: "evidence-golden" }),
    {
      captureReader,
      modelReader,
      now: () => "2026-09-04T12:00:00Z",
    },
  );

  // --- AISE-013 assurance service over both boundaries -----------------------
  const assurance = buildAssuranceService(config, createLogger({ level: "error", module: "assurance-golden" }), {
    modelReader,
    evidenceReader: { getMapping: (projectId: string) => evidence.snapshot(projectId) },
    store: createInMemoryAssuranceStore({ now: () => "2026-09-06T12:00:00Z" }),
  });
  assurance.registerTaskProfile(PROJECT, {
    taskId: "task-explore",
    intent: "INSPECTION",
    profile: "LIGHT",
    description: "site exploration and visualization",
  });
  assurance.registerTaskProfile(PROJECT, {
    taskId: "task-document",
    intent: "MAINTENANCE",
    profile: "STANDARD",
    description: "general documentation and space planning",
  });
  assurance.registerTaskProfile(PROJECT, {
    taskId: "task-comply",
    intent: "AS_BUILT",
    profile: "CRITICAL",
    description: "dimensional compliance verification",
    uncertaintyBudget: { lengthM: 0.05 },
  });

  // --- v1 assessments (raw extraction: NO evidence mapping at all) ----------
  const v1Light = assurance.assessModelVersion(PROJECT, {
    modelId: MODEL,
    version: 1,
    taskId: "task-explore",
    assessedBy: "svc:assurance",
  });
  const v1Standard = assurance.assessModelVersion(PROJECT, {
    modelId: MODEL,
    version: 1,
    taskId: "task-document",
    assessedBy: "svc:assurance",
  });
  const v1Critical = assurance.assessModelVersion(PROJECT, {
    modelId: MODEL,
    version: 1,
    taskId: "task-comply",
    assessedBy: "svc:assurance",
  });

  // --- Evidence registration (capture-bound LIDAR + manual survey) ---------
  const { record: lidar } = evidence.registerCaptureEvidence(
    PROJECT,
    { sessionId: EVIDENCE_SESSION, assetId: EVIDENCE_ASSET },
    { recordedBy: "svc:evidence-ingest" },
  );
  const survey = surveyMeasurement(2.7);
  evidence.registerEvidence(PROJECT, survey);
  const measurementId = survey.evidenceId;

  // --- The review pass: v2 confirms content citing the evidence ------------
  const v2 = confirmedVersion(v1, measurementId);
  const reviewProducer = modelProvenance(
    "model/review-confirm-v1",
    { sceneId: scene.sceneId, evidenceIds: `${lidar.evidenceId},${measurementId}` },
    [{ kind: "scene", sceneId: scene.sceneId, contentHash: scene.contentHash, epistemic: scene.epistemicState }],
  );
  const commitV2 = realityStore.commitModelVersion(MODEL, v2, reviewProducer);
  expect(commitV2.status).toBe("committed");
  expect(commitV2.version).toBe(2);

  // --- Link the LIDAR scan to every object existence of v2 ------------------
  // (One capture source supports many subjects — the extraction
  // derived all objects from this single scan; AISE-016 review
  // links at scale through exactly this path.)
  for (const object of v2.objects) {
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
  // The survey measurement supports the confirmed roomHeight.
  const roomHeightSubject = listConfirmedAssertionSubjects(v2, 2).find(
    (ref) => ref.subject.kind === "space-property" && ref.subject.propertyKey === "roomHeight",
  )!.subject;
  const heightLink = evidence.linkEvidence(PROJECT, roomHeightSubject, measurementId, {
    linkedBy: "svc:review-linker",
    method: "review/link-v1",
    linkedAt: "2026-09-06T11:01:00Z",
  });
  expect(heightLink.status).toBe("added");

  // --- v2 assessments (reviewed: full linking, measured, budgeted) ----------
  const v2Light = assurance.assessModelVersion(PROJECT, {
    modelId: MODEL,
    version: 2,
    taskId: "task-explore",
    assessedBy: "svc:assurance",
  });
  const v2Standard = assurance.assessModelVersion(PROJECT, {
    modelId: MODEL,
    version: 2,
    taskId: "task-document",
    assessedBy: "svc:assurance",
  });
  const v2Critical = assurance.assessModelVersion(PROJECT, {
    modelId: MODEL,
    version: 2,
    taskId: "task-comply",
    assessedBy: "svc:assurance",
  });

  return {
    scene,
    realityStore,
    evidence,
    assurance,
    lidar,
    survey,
    measurementId,
    roomHeightSubject,
    v1Light,
    v1Standard,
    v1Critical,
    v2Light,
    v2Standard,
    v2Critical,
    v1Digest: v1.digest,
    v2Digest: v2.digest,
    mappingDigest: evidence.snapshot(PROJECT)!.digest,
  };
}

const golden = compose();

describe("the golden composition (AISE-004 → 010 → 011 → 012 → 013)", () => {
  it("extracts, ingests, and commits the golden room at the ground-truth shape", () => {
    const v2 = golden.realityStore.getVersion(MODEL, 2)!.graph;
    expect(v2.objects).toHaveLength(golden.scene.objects.length);
    expect(v2.objects.filter((object) => object.objectClass === "WALL").length).toBe(
      roomGroundTruth.objectCounts.walls,
    );
    expect(v2.objects.filter((object) => object.objectClass === "DOOR")).toHaveLength(
      roomGroundTruth.objectCounts.doors,
    );
  });

  it("v1 (raw extraction, no mapping) is READY for LIGHT exploration only", () => {
    expect(golden.v1Light.report.verdict).toBe("READY");
    expect(golden.v1Light.report.blockingDimensions).toEqual([]);
    // The advisory dimensions honestly report the raw state.
    const coverage = golden.v1Light.report.dimensions.find(
      (dimension) => dimension.dimension === "evidence-coverage",
    )!;
    expect(coverage.findings.some((finding) => finding.code === "NO_EVIDENCE_MAPPING")).toBe(true);
    expect(golden.v1Light.report.assertionTotals.withSupport).toBe(0);
  });

  it("v1 is NOT_READY for STANDARD documentation (zero evidence coverage)", () => {
    expect(golden.v1Standard.report.verdict).toBe("NOT_READY");
    expect(golden.v1Standard.report.blockingDimensions).toEqual(["evidence-coverage"]);
  });

  it("v1 is NOT_READY for CRITICAL compliance (coverage, no measurement, unevaluable budget)", () => {
    const report = golden.v1Critical.report;
    expect(report.verdict).toBe("NOT_READY");
    expect(report.blockingDimensions).toContain("evidence-coverage");
    expect(report.blockingDimensions).toContain("measurement-uncertainty");
    expect(report.blockingDimensions).toContain("uncertainty-budget");
    const measurement = report.dimensions.find(
      (dimension) => dimension.dimension === "measurement-uncertainty",
    )!;
    expect(measurement.findings.some((finding) => finding.code === "NO_MEASUREMENTS")).toBe(true);
  });

  it("v2 (reviewed: full linking, confirmed measurement with uncertainty) is READY at every profile", () => {
    expect(golden.v2Light.report.verdict).toBe("READY");
    expect(golden.v2Standard.report.verdict).toBe("READY");
    expect(golden.v2Critical.report.verdict).toBe("READY");
    expect(golden.v2Critical.report.blockingDimensions).toEqual([]);
    expect(golden.v2Critical.report.assertionTotals).toEqual({
      assertions: 9,
      withSupport: 9,
      confirmed: 2,
      confirmedValid: 2,
      confirmedInvalidated: 0,
      measurements: 1,
      measurementsWithUncertainty: 1,
      proposedAssertions: 0,
      proposedObjects: 0,
      confidenceBearing: 0,
    });
    const coverage = golden.v2Critical.report.dimensions.find(
      (dimension) => dimension.dimension === "evidence-coverage",
    )!;
    expect(coverage).toMatchObject({ coverageRatio: 1, verdict: "PASS", required: true });
    const budget = golden.v2Critical.report.dimensions.find(
      (dimension) => dimension.dimension === "uncertainty-budget",
    )!;
    expect(budget).toMatchObject({ verdict: "PASS", evaluatedCount: 1, exceededCount: 0, unevaluableCount: 0 });
  });

  it("the confirmed roomHeight measurement is evaluated against the CRITICAL budget in SI", () => {
    const budget = golden.v2Critical.report.dimensions.find(
      (dimension) => dimension.dimension === "uncertainty-budget",
    )!;
    if (budget.dimension !== "uncertainty-budget") {
      throw new Error("unreachable");
    }
    const evaluation = budget.evaluations[0]!;
    expect(evaluation.siValue).toBeCloseTo(0.005, 15);
    expect(evaluation.siUnit).toBe("meter");
    expect(evaluation.bound).toBe(0.05);
    expect(evaluation.exceeded).toBe(false);
    expect(evaluation.subjectDescription).toContain("roomHeight");
  });

  it("AC-063 → readiness: retracting the roomHeight link flips v2 CRITICAL to NOT_READY", () => {
    // Pristine composition: this test mutates the evidence mapping.
    const fresh = compose();
    const { evidence, assurance, roomHeightSubject, measurementId } = fresh;
    const links = evidence.linksForSubject(PROJECT, roomHeightSubject);
    expect(links).toHaveLength(1);
    const retraction = evidence.retractLink(PROJECT, links[0]!.linkId, {
      retractedBy: "user:site-engineer",
      reason: "measurement flagged at review",
      retractedAt: "2026-09-07T09:00:00Z",
    });
    expect(retraction.status).toBe("retracted");

    // Re-assessment: the mapping state changed → a NEW record is
    // appended (history preserved, nothing overwritten).
    const before = assurance.assessmentHistory(PROJECT, { modelId: MODEL, version: 2, taskId: "task-comply" });
    const recheck = assurance.assessModelVersion(PROJECT, {
      modelId: MODEL,
      version: 2,
      taskId: "task-comply",
      assessedBy: "svc:assurance",
    });
    expect(recheck.status).toBe("recorded");
    expect(assurance.assessmentHistory(PROJECT, { modelId: MODEL, version: 2, taskId: "task-comply" })).toHaveLength(
      before.length + 1,
    );
    expect(recheck.report.verdict).toBe("NOT_READY");
    expect(recheck.report.blockingDimensions).toContain("evidence-coverage");
    expect(recheck.report.blockingDimensions).toContain("confirmed-validity");

    // The invalidation finding names the subject and the reason.
    const validity = recheck.report.dimensions.find(
      (dimension) => dimension.dimension === "confirmed-validity",
    )!;
    const invalidation = validity.findings.find((finding) => finding.code === "INVALIDATED_CONFIRMATION")!;
    expect(invalidation.subjectDescription).toContain("roomHeight");
    expect(invalidation.detail).toContain("NO_LIVE_SUPPORT");
    expect(invalidation.detail).toContain(measurementId);

    // The latest record is current; the earlier READY record is
    // now stale (the mapping moved on) and remains discoverable.
    const latest = assurance.latestAssessment(PROJECT, MODEL, 2, "task-comply")!;
    expect(latest.stale).toBe(false);
    expect(latest.record.reportDigest).toBe(recheck.record.reportDigest);
    const history = assurance.assessmentHistory(PROJECT, { modelId: MODEL, version: 2, taskId: "task-comply" });
    expect(history[0]!.report.verdict).toBe("READY");

    // Deliberate re-attachment is a NEW link event; readiness returns.
    evidence.linkEvidence(PROJECT, roomHeightSubject, measurementId, {
      linkedBy: "svc:review-linker",
      method: "review/link-v1",
      linkedAt: "2026-09-07T10:00:00Z",
    });
    const restored = assurance.assessModelVersion(PROJECT, {
      modelId: MODEL,
      version: 2,
      taskId: "task-comply",
      assessedBy: "svc:assurance",
    });
    expect(restored.report.verdict).toBe("READY");
  });

  it("a tighter task budget than the survey uncertainty flips v2 CRITICAL to NOT_READY", () => {
    const fresh = compose();
    const register = fresh.assurance.registerTaskProfile(PROJECT, {
      taskId: "task-comply-tight",
      intent: "AS_BUILT",
      profile: "CRITICAL",
      uncertaintyBudget: { lengthM: 0.001 }, // 1 mm — tighter than the 5 mm survey σ
    });
    expect(register.status).toBe("created");
    const tight = fresh.assurance.assessModelVersion(PROJECT, {
      modelId: MODEL,
      version: 2,
      taskId: "task-comply-tight",
      assessedBy: "svc:assurance",
    });
    const budget = tight.report.dimensions.find((dimension) => dimension.dimension === "uncertainty-budget")!;
    expect(budget.findings.some((finding) => finding.code === "BUDGET_EXCEEDED")).toBe(true);
    expect(tight.report.verdict).toBe("NOT_READY");
    expect(tight.report.blockingDimensions).toContain("uncertainty-budget");
  });

  it("profiles are immutable and idempotent at the boundary", () => {
    const { assurance } = golden;
    const again = assurance.registerTaskProfile(PROJECT, {
      taskId: "task-comply",
      intent: "AS_BUILT",
      profile: "CRITICAL",
      description: "dimensional compliance verification",
      uncertaintyBudget: { lengthM: 0.05 },
    });
    expect(again.status).toBe("exists_identical");
    const conflicting = assurance.registerTaskProfile(PROJECT, {
      taskId: "task-comply",
      intent: "AS_BUILT",
      profile: "CRITICAL",
      uncertaintyBudget: { lengthM: 0.9 },
    });
    expect(conflicting.status).toBe("exists_conflict");
    // The original binding is preserved.
    expect(assurance.getTaskProfile(PROJECT, "task-comply")?.uncertaintyBudget?.lengthM).toBe(0.05);
  });

  it("assessment of unchanged inputs is idempotent (retry discipline)", () => {
    const fresh = compose();
    const retry = fresh.assurance.assessModelVersion(PROJECT, {
      modelId: MODEL,
      version: 2,
      taskId: "task-explore",
      assessedBy: "svc:retry",
    });
    expect(retry.status).toBe("already_present");
    expect(retry.record.reportDigest).toBe(fresh.v2Light.record.reportDigest);
    expect(
      fresh.assurance.assessmentHistory(PROJECT, { modelId: MODEL, version: 2, taskId: "task-explore" }),
    ).toHaveLength(1);
  });

  it("the canonical graphs and the evidence mapping never change through assurance operations (no second authority)", () => {
    const { realityStore, evidence, v1Digest, v2Digest, mappingDigest } = golden;
    // compose() exercised registration, assessment, history, and
    // staleness reads; the pinned digests are untouched.
    expect(realityStore.getVersion(MODEL, 1)!.record.digest).toBe(v1Digest);
    expect(realityStore.getVersion(MODEL, 2)!.record.digest).toBe(v2Digest);
    expect(evidence.snapshot(PROJECT)!.digest).toBe(mappingDigest);
    // The graphs' own content was never written by assurance.
    const v2 = realityStore.getVersion(MODEL, 2)!.graph;
    expect(v2.objects.filter((object) => object.epistemicState === "CONFIRMED")).toHaveLength(1); // only the door
    const space = v2.spaces.find((node) => node.spaceId === SPACE)!;
    const roomHeight = (space.properties ?? []).find((assertion) => assertion.key === "roomHeight")!;
    expect(roomHeight.status).toBe("CONFIRMED");
    expect(roomHeight.quantity?.uncertainty).toEqual({ kind: "standard", u: 0.005 });
  });

  it("the whole composition is deterministic (bit-identical digests and reports)", () => {
    const replay = compose();
    expect(replay.v1Digest).toBe(golden.v1Digest);
    expect(replay.v2Digest).toBe(golden.v2Digest);
    expect(replay.mappingDigest).toBe(golden.mappingDigest);
    expect(replay.lidar.evidenceId).toBe(golden.lidar.evidenceId);
    expect(replay.measurementId).toBe(golden.measurementId);
    expect(readinessReportDigest(replay.v1Light.report)).toBe(readinessReportDigest(golden.v1Light.report));
    expect(readinessReportDigest(replay.v1Standard.report)).toBe(readinessReportDigest(golden.v1Standard.report));
    expect(readinessReportDigest(replay.v1Critical.report)).toBe(readinessReportDigest(golden.v1Critical.report));
    expect(readinessReportDigest(replay.v2Critical.report)).toBe(readinessReportDigest(golden.v2Critical.report));
    expect(replay.v2Critical.record.assessmentId).toBe(golden.v2Critical.record.assessmentId);
  });
});
