/**
 * CRITICAL golden composition: the full rules chain over the
 * real AISE-010 extraction, AISE-011 ingestion, AISE-012
 * evidence linking, and AISE-013 readiness of the exact golden
 * room.
 *
 * Chain under test:
 *   AISE-004 boundary view (capture upload, server-computed hash)
 *     → AISE-012 capture adapter (content-pinned LIDAR record)
 *     → AISE-010 extraction → AISE-011 ingestion → committed v1
 *       (all INFERRED, no evidence mapping)
 *       → AISE-021: v1 rules at LIGHT pass point-wise (the
 *         estimate satisfies the bound); v1 at CRITICAL is
 *         honestly UNKNOWN behind the readiness gate (the raw
 *         extraction is NOT_READY / unassessed for compliance)
 *     → review pass: v2 commits the CONFIRMED roomHeight
 *       measurement (2.7 m ± 5 mm) citing the survey evidence
 *     → AISE-012 linking: the LIDAR scan supports all 8 object
 *       existences, the survey measurement supports roomHeight
 *     → AISE-013: v2 is READY at CRITICAL with a declared budget
 *     → AISE-021: v2 at CRITICAL — the gate is satisfied, the
 *       measurement's uncertainty interval [2.695, 2.705]:
 *         · MINIMUM 2.5 m → PASS (established, supported)
 *         · MINIMUM 2.71 m → FAIL (entirely outside)
 *         · MINIMUM 2.70 m → UNKNOWN (the straddle: the band
 *           overlaps the bound — never a lucky PASS)
 *     → spec rule: roomHeight must be CONFIRMED + measured —
 *       v1 FAILs (INFERRED), v2 PASSes
 *     → AC-063: retracting the roomHeight link flips readiness
 *       to NOT_READY and the rules report honestly — the stale
 *       READY report is RULE_READINESS_STALE, the fresh
 *       NOT_READY report is RULE_READINESS_NOT_READY, and the
 *       evidence gate alone is RULE_NO_EVIDENCE_SUPPORT
 *     → the canonical graphs and the evidence mapping never
 *       change through any rules operation (no second
 *       authority), and the composition is deterministic.
 */
import { describe, expect, it } from "vitest";
import { extractArchitecturalScene } from "@aise/backend-semantics";
import { exactRoomPoints } from "@aise/backend-semantics/fixtures/golden";
import {
  ingestArchitecturalScene,
} from "@aise/backend-reality-model";
import { loadConfig } from "@aise/backend-config";
import { createLogger } from "@aise/backend-logging";
import {
  assembleModelGraph,
  evidenceRecord,
  listConfirmedAssertionSubjects,
  makeSpaceNode,
  propertyAssertion,
  type EvidenceSubject,
  type PropertyAssertion,
  type RealityModelGraph,
} from "@aise/engineering-model";
import {
  buildEvidenceService,
  type CaptureUploadReader,
  type CaptureUploadView,
  type EvidenceService,
} from "@aise/backend-evidence";
import { buildAssuranceService } from "@aise/backend-assurance";
import { createInMemoryAssuranceStore } from "@aise/backend-assurance";
import { ruleSet } from "./rule.js";
import { runRuleEvaluation } from "./runtime.js";

const MODEL = "model-rules-golden";
const PROJECT = "project-rules-golden";
const SPACE = "room-rules-golden";
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
  // RealityObjectInput records (the AISE-014 lesson).
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

/** The readiness-context adapter view of a real AISE-013 report. */
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
  v1NotReadyReport: ReturnType<typeof readinessContextOf>;
  v2ReadyReport: ReturnType<typeof readinessContextOf>;
  retractRoomHeight: () => void;
  reassessV2: () => ReturnType<typeof readinessContextOf>;
}

function compose(): Composition {
  const scene = extractArchitecturalScene({ points: exactRoomPoints(), unit: "meter" });
  const v1 = ingestArchitecturalScene(scene, target).graph;

  const configResult = loadConfig({ AISE_ENV: "test", AISE_LOG_LEVEL: "error" });
  if (!configResult.ok) {
    throw new Error("test config must load");
  }
  const config = configResult.config;

  const v2 = confirmedVersion(v1, "pending");
  const v2Holder: { graph: RealityModelGraph } = { graph: v2 };

  const modelReader = {
    getModelGraph: (modelId: string, version: number) =>
      modelId === MODEL && version === 1 ? v1 : modelId === MODEL && version === 2 ? v2Holder.graph : undefined,
  };

  const evidence: EvidenceService = buildEvidenceService(
    config,
    createLogger({ level: "error", module: "evidence-rules-golden" }),
    {
      captureReader,
      modelReader,
      now: () => "2026-09-04T12:00:00Z",
    },
  );

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

  // AISE-013 readiness over v1 and v2.
  const assurance = buildAssuranceService(
    config,
    createLogger({ level: "error", module: "assurance-rules-golden" }),
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
  const v1Assessment = assurance.assessModelVersion(PROJECT, {
    modelId: MODEL,
    version: 1,
    taskId: "task-comply",
    assessedBy: "svc:assurance",
  });
  const v2Assessment = assurance.assessModelVersion(PROJECT, {
    modelId: MODEL,
    version: 2,
    taskId: "task-comply",
    assessedBy: "svc:assurance",
  });
  expect(v1Assessment.report.verdict).toBe("NOT_READY");
  expect(v2Assessment.report.verdict).toBe("READY");

  return {
    v1,
    v2: v2Holder.graph,
    evidence,
    mappingDigest: evidence.snapshot(PROJECT)!.digest,
    measurementId,
    v1NotReadyReport: readinessContextOf(v1Assessment.report),
    v2ReadyReport: readinessContextOf(v2Assessment.report),
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
    reassessV2: () => {
      const reassessment = assurance.assessModelVersion(PROJECT, {
        modelId: MODEL,
        version: 2,
        taskId: "task-comply",
        assessedBy: "svc:assurance",
      });
      return readinessContextOf(reassessment.report);
    },
  };
}

const golden = compose();

/** The compliance rule set (CRITICAL, readiness-gated — construction refuses otherwise). */
function complianceSet(boundValue: number) {
  return ruleSet({
    rulesetId: `set-compliance-${boundValue}`,
    profile: "CRITICAL",
    readinessGate: { profile: "CRITICAL" },
    rules: [
      {
        ruleId: "rule-room-height-minimum",
        kind: "DIMENSION" as const,
        subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "roomHeight" },
        operator: "MINIMUM" as const,
        bound: { value: boundValue, unit: "meter" as const },
      },
    ],
  });
}

const LIGHT_SET = ruleSet({
  rulesetId: "set-light-height",
  profile: "LIGHT",
  rules: [
    {
      ruleId: "rule-room-height-minimum",
      kind: "DIMENSION" as const,
      subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "roomHeight" },
      operator: "MINIMUM" as const,
      bound: { value: 2.5, unit: "meter" as const },
    },
  ],
});

describe("the golden composition (AISE-004 → 010 → 011 → 012 → 013 → 021)", () => {
  it("v1 (raw extraction) rules at LIGHT: the estimate satisfies the bound point-wise", () => {
    const report = runRuleEvaluation({ graph: golden.v1, version: 1, profile: "LIGHT", ruleset: LIGHT_SET });
    expect(report.outcome).toBe("PASS");
    expect(report.results[0]!.outcome).toBe("PASS");
    expect(report.modelDigest).toBe(golden.v1.digest);
    expect(report.mappingDigest).toBeUndefined();
    expect(report.readiness).toBeUndefined();
  });

  it("v1 at CRITICAL without a readiness context: RULE_READINESS_MISSING (honest, fail-closed)", () => {
    const report = runRuleEvaluation({
      graph: golden.v1,
      version: 1,
      profile: "CRITICAL",
      ruleset: complianceSet(2.5),
    });
    expect(report.outcome).toBe("UNKNOWN");
    expect(report.results[0]!.code).toBe("RULE_READINESS_MISSING");
  });

  it("v1 at CRITICAL with its real NOT_READY readiness report: RULE_READINESS_NOT_READY", () => {
    // The v1 assessment was computed against the project's
    // current mapping (all links) — the rule run passes the same
    // mapping so the content pins match and the VERDICT is what
    // the gate reports.
    const report = runRuleEvaluation({
      graph: golden.v1,
      version: 1,
      profile: "CRITICAL",
      ruleset: complianceSet(2.5),
      mapping: golden.evidence.snapshot(PROJECT)!,
      readiness: golden.v1NotReadyReport,
    });
    expect(report.outcome).toBe("UNKNOWN");
    expect(report.results[0]!.code).toBe("RULE_READINESS_NOT_READY");
    expect(report.readiness?.verdict).toBe("NOT_READY");
  });

  it("v2 at CRITICAL, gate satisfied: the measured interval PASSES with evidence and readiness pinned", () => {
    const mapping = golden.evidence.snapshot(PROJECT)!;
    const report = runRuleEvaluation({
      graph: golden.v2,
      version: 2,
      profile: "CRITICAL",
      ruleset: complianceSet(2.5),
      mapping,
      readiness: golden.v2ReadyReport,
    });
    expect(report.outcome).toBe("PASS");
    expect(report.results[0]!.outcome).toBe("PASS");
    expect(report.results[0]!.evidenceRefs).toContain(golden.measurementId);
    expect(report.results[0]!.epistemic?.assertionStatus).toBe("CONFIRMED");
    expect(report.readiness?.verdict).toBe("READY");
    expect(report.mappingDigest).toBe(mapping.digest);
    expect(report.modelDigest).toBe(golden.v2.digest);
  });

  it("v2 at CRITICAL: MINIMUM 2.71 m FAILs (the interval [2.695, 2.705] is entirely below)", () => {
    const mapping = golden.evidence.snapshot(PROJECT)!;
    const report = runRuleEvaluation({
      graph: golden.v2,
      version: 2,
      profile: "CRITICAL",
      ruleset: complianceSet(2.71),
      mapping,
      readiness: golden.v2ReadyReport,
    });
    expect(report.outcome).toBe("FAIL");
    expect(report.results[0]!.code).toBe("RULE_NOT_SATISFIED");
  });

  it("THE STRADDLE: MINIMUM 2.70 m is UNKNOWN — the band overlaps the bound, never a lucky PASS", () => {
    const mapping = golden.evidence.snapshot(PROJECT)!;
    const report = runRuleEvaluation({
      graph: golden.v2,
      version: 2,
      profile: "CRITICAL",
      ruleset: complianceSet(2.7),
      mapping,
      readiness: golden.v2ReadyReport,
    });
    expect(report.outcome).toBe("UNKNOWN");
    expect(report.results[0]!.code).toBe("RULE_INDETERMINATE");
    expect(report.results[0]!.detail).toContain("straddles");
  });

  it("the spec rule: roomHeight must be CONFIRMED and measured — v1 FAILs, v2 PASSES", () => {
    const specRuleSet = (profile: "LIGHT" | "CRITICAL") =>
      ruleSet({
        rulesetId: `set-spec-golden-${profile}`,
        profile,
        ...(profile === "CRITICAL" ? { readinessGate: { profile: "CRITICAL" } } : {}),
        rules: [
          {
            ruleId: "rule-room-height-confirmed-measurement",
            kind: "SPECIFICATION" as const,
            subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "roomHeight" },
            requiredStatus: "CONFIRMED" as const,
            requireMeasurement: true,
          },
        ],
      });

    const v1 = runRuleEvaluation({
      graph: golden.v1,
      version: 1,
      profile: "LIGHT",
      ruleset: specRuleSet("LIGHT"),
    });
    expect(v1.outcome).toBe("FAIL");
    expect(v1.results[0]!.code).toBe("RULE_SPEC_NOT_MET");
    expect(v1.results[0]!.actual).toContain("INFERRED");

    const mapping = golden.evidence.snapshot(PROJECT)!;
    const v2 = runRuleEvaluation({
      graph: golden.v2,
      version: 2,
      profile: "CRITICAL",
      ruleset: specRuleSet("CRITICAL"),
      mapping,
      readiness: golden.v2ReadyReport,
    });
    expect(v2.outcome).toBe("PASS");
    expect(v2.results[0]!.epistemic?.assertionStatus).toBe("CONFIRMED");
  });

  it("AC-063 → rules: retracting the roomHeight link makes every honest path refuse PASS", () => {
    // Destructive: dedicated composition.
    const local = compose();
    local.retractRoomHeight();
    const mapping = local.evidence.snapshot(PROJECT)!;

    // (a) the stale READY report pins the pre-retraction mapping.
    const stale = runRuleEvaluation({
      graph: local.v2,
      version: 2,
      profile: "CRITICAL",
      ruleset: complianceSet(2.5),
      mapping,
      readiness: local.v2ReadyReport,
    });
    expect(stale.results[0]!.code).toBe("RULE_READINESS_STALE");

    // (b) a fresh re-assessment is NOT_READY; the gate reports it.
    const fresh = local.reassessV2();
    expect(fresh.verdict).toBe("NOT_READY");
    const notReady = runRuleEvaluation({
      graph: local.v2,
      version: 2,
      profile: "CRITICAL",
      ruleset: complianceSet(2.5),
      mapping,
      readiness: fresh,
    });
    expect(notReady.results[0]!.code).toBe("RULE_READINESS_NOT_READY");

    // (c) the evidence gate alone (HIGH_ASSURANCE, no readiness
    // gate): the CONFIRMED assertion lost its live support.
    const highSet = ruleSet({
      rulesetId: "set-high-nogate",
      profile: "HIGH_ASSURANCE",
      rules: [
        {
          ruleId: "rule-room-height-minimum",
          kind: "DIMENSION" as const,
          subject: { type: "space-property" as const, spaceId: SPACE, propertyKey: "roomHeight" },
          operator: "MINIMUM" as const,
          bound: { value: 2.5, unit: "meter" as const },
        },
      ],
    });
    const unsupported = runRuleEvaluation({
      graph: local.v2,
      version: 2,
      profile: "HIGH_ASSURANCE",
      ruleset: highSet,
      mapping,
    });
    expect(unsupported.results[0]!.code).toBe("RULE_NO_EVIDENCE_SUPPORT");
  });

  it("the whole composition is deterministic (bit-identical reports on replay)", () => {
    const replay = compose();
    const mapping = golden.evidence.snapshot(PROJECT)!;
    const replayMapping = replay.evidence.snapshot(PROJECT)!;
    expect(replayMapping.digest).toBe(golden.mappingDigest);
    expect(replay.v1.digest).toBe(golden.v1.digest);
    expect(replay.v2.digest).toBe(golden.v2.digest);
    expect(replay.measurementId).toBe(golden.measurementId);

    const a = runRuleEvaluation({
      graph: golden.v2,
      version: 2,
      profile: "CRITICAL",
      ruleset: complianceSet(2.5),
      mapping,
      readiness: golden.v2ReadyReport,
    });
    const b = runRuleEvaluation({
      graph: replay.v2,
      version: 2,
      profile: "CRITICAL",
      ruleset: complianceSet(2.5),
      mapping: replayMapping,
      readiness: replay.v2ReadyReport,
    });
    expect(a).toEqual(b);
    expect(a.digest).toBe(b.digest);
    expect(a.reportId).toBe(b.reportId);
  });

  it("no second authority: rule runs leave the canonical digests bit-identical", () => {
    const mapping = golden.evidence.snapshot(PROJECT)!;
    runRuleEvaluation({
      graph: golden.v1,
      version: 1,
      profile: "LIGHT",
      ruleset: LIGHT_SET,
    });
    runRuleEvaluation({
      graph: golden.v2,
      version: 2,
      profile: "CRITICAL",
      ruleset: complianceSet(2.5),
      mapping,
      readiness: golden.v2ReadyReport,
    });
    expect(golden.v1.digest).toBe(compose().v1.digest);
    expect(golden.v2.digest).toBe(compose().v2.digest);
    expect(golden.evidence.snapshot(PROJECT)!.digest).toBe(golden.mappingDigest);
  });
});
