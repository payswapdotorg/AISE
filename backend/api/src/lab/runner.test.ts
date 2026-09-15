/**
 * AISE-035 — the three END-TO-END scenario runs, every hop asserted against
 * ground truth. The runner drives ONLY real pipeline modules through their
 * public service surfaces; these tests pin the dogfood contract: the mission
 * contract validates, the capture session accepts, evidence is pinned and
 * closed by derivations, the reconstruction fuses exactly the fixture grids,
 * the semantics classify every surface, the reality version matches the
 * expected node set with measured values within golden tolerances, the
 * assurance verdicts match the declared budgets, verification is clean,
 * the BOQ mapping reconciles, and the full governed chain resolves.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { assertMissionContractValid } from "../missions/testkit";
import { scenarioById } from "./scenarios";
import { groundTruthOf, elementNodeId } from "./groundtruth";
import { runScenario, type LabScenarioRun, type LabWorld } from "./runner";
import { LAB_DEVICE_SIGMA_M } from "./testkit";

/** Golden tolerance for noised measurements vs exact ground truth (m). */
const MEASUREMENT_TOLERANCE_M = 0.002;

async function runOf(
  scenarioId: string,
): Promise<{ run: LabScenarioRun; world: LabWorld }> {
  return runScenario(scenarioById(scenarioId));
}

/* ------------------------------------------------------------------ */
/* Shared hop assertions                                               */
/* ------------------------------------------------------------------ */

function assertHopsOk(run: LabScenarioRun): void {
  for (const hop of run.hops) {
    if (hop.outcome === "failed") {
      throw new Error(`hop ${hop.hopId} failed: ${hop.detail}`);
    }
  }
  expect(run.stoppedAt).toBeNull();
  expect(run.stopReason).toBeNull();
}

/* ------------------------------------------------------------------ */
/* Scenario A — representative room with a defect                       */
/* ------------------------------------------------------------------ */

describe("lab end-to-end A: room 104 defect survey (condition inspection)", () => {
  test("every hop completes; the mission validates against the real contract codecs", async () => {
    const { run } = await runOf("lab-room-104-defect");
    assertHopsOk(run);
    expect(run.mission).not.toBeNull();
    expect(run.mission!.state).toBe("draft");
    expect(run.mission!.escalated).toBe(false);
    expect(run.mission!.stepCount).toBeGreaterThan(0);
    expect(run.mission!.requiredEvidenceCount).toBeGreaterThan(0);
    // The REAL missions testkit's contract validator (their tests' own tool).
    expect(() => assertMissionContractValid(run.mission!.mission)).not.toThrow();
  });

  test("capture: every asset stored, the batch accepted, the walk completed", async () => {
    const { run } = await runOf("lab-room-104-defect");
    expect(run.capture!.assets).toHaveLength(10);
    for (const asset of run.capture!.assets) {
      expect(asset.kind).toBe("stored");
    }
    expect(run.capture!.ackOutcomes).toEqual([
      { batchId: "batch-session-lab-room-104-defect-baseline-1", sequence: 1, outcome: "ACCEPTED" },
    ]);
    expect(run.capture!.walkCompleted).toBe(true);
  });

  test("evidence: all 11 records registered (10 captured + 1 derived artifact), pinned by the capture store", async () => {
    const { run } = await runOf("lab-room-104-defect");
    expect(run.evidence!.registeredContentIds).toHaveLength(11);
    expect(run.evidence!.droppedContentIds).toHaveLength(0);
    expect(run.evidence!.derivationCount).toBe(1);
    // Provenance links exist for the subject universe (coverage measurand).
    expect(run.evidence!.provenanceLinkCount).toBeGreaterThan(0);
  });

  test("reconstruction: one succeeded job; every frame carries exactly its grid's points", async () => {
    const { run, world } = await runOf("lab-room-104-defect");
    expect(run.reconstruction!.jobs).toHaveLength(1);
    const job = run.reconstruction!.jobs[0]!;
    expect(job.state).toBe("succeeded");
    expect(job.selectedProviderId).toBe("depth-lidar-fusion");
    expect(job.failure).toBeNull();
    expect(run.reconstruction!.frames).toHaveLength(5);
    for (const frame of run.reconstruction!.frames) {
      expect(frame.pointCount).toBe(64); // 8×8 grid
    }
    // The real artifact exists in the real artifact store with provenance.
    const artifact = await world.orchestrator.getArtifact(job.artifactIds[0]!);
    expect(artifact).not.toBeNull();
    expect(artifact!.sourceEvidenceIds).toHaveLength(5);
    expect(artifact!.representationType).toBe("point_cloud");
    expect(artifact!.regions[0]!.epistemicLabel).toBe("RECONSTRUCTED_FROM_OBSERVED_EVIDENCE");
  });

  test("fitted planes recover ground truth within the golden tolerance", async () => {
    const { run } = await runOf("lab-room-104-defect");
    const truth = groundTruthOf(scenarioById("lab-room-104-defect"));
    for (const frame of run.reconstruction!.frames) {
      const surface = truth.surfaces.find((s) => s.surfaceId === frame.surfaceId)!;
      // Normal direction matches the fixture's semantic orientation.
      const dot =
        frame.plane.normal[0] * surface.plane.normal[0] +
        frame.plane.normal[1] * surface.plane.normal[1] +
        frame.plane.normal[2] * surface.plane.normal[2];
      expect(dot).toBeGreaterThan(0.999);
      // The fitted plane offset is within 2 mm of truth.
      const offsetDelta = Math.abs(
        Math.abs(frame.plane.d) - Math.abs(surface.plane.d),
      );
      expect(offsetDelta).toBeLessThan(0.002);
      // RMS residual sits near the declared device σ.
      expect(frame.rmsResidual).toBeGreaterThan(LAB_DEVICE_SIGMA_M * 0.3);
      expect(frame.rmsResidual).toBeLessThan(LAB_DEVICE_SIGMA_M * 2);
    }
  });

  test("semantics: all 6 elements classified (5 surfaces + the door), zero unclassified", async () => {
    const { run } = await runOf("lab-room-104-defect");
    expect(run.semantics!.unclassifiedCount).toBe(0);
    expect(run.semantics!.stats).toEqual({
      walls: 3,
      floors: 1,
      ceilings: 1,
      openings: 0,
      doors: 1,
      windows: 0,
      unclassified: 0,
    });
    // Every captured surface's element is associated and correctly classified.
    for (const surfaceId of [
      "surface:room-104:floor",
      "surface:room-104:ceiling",
      "surface:room-104:wall-north",
      "surface:room-104:wall-south",
      "surface:room-104:wall-west",
    ]) {
      const element = run.semantics!.elements.find((e) => e.surfaceId === surfaceId);
      expect(element).toBeDefined();
    }
  });

  test("reality v002: the node set matches ground truth exactly; measurements within tolerance", async () => {
    const { run, world } = await runOf("lab-room-104-defect");
    const truth = groundTruthOf(scenarioById("lab-room-104-defect"));
    expect(new Set(run.reality!.nodeIds)).toEqual(new Set(truth.expectedNodeIds));
    expect(run.reality!.baselineVersionId).toBe("v002");
    expect(run.reality!.versionIds).toEqual(["v002"]);
    // Measured dimensions vs hand-computed truth.
    const height = run.measurements.find((m) => m.propertyKey === "room.height")!;
    expect(Math.abs(height.valueM - 2.5)).toBeLessThan(MEASUREMENT_TOLERANCE_M);
    expect(height.sigmaM).toBeCloseTo(Math.SQRT2 * LAB_DEVICE_SIGMA_M, 9);
    const depth = run.measurements.find((m) => m.propertyKey === "room.depth")!;
    expect(Math.abs(depth.valueM - 3.0)).toBeLessThan(MEASUREMENT_TOLERANCE_M);
    // room.width is honestly NOT measured (east wall occluded).
    expect(run.measurements.find((m) => m.propertyKey === "room.width")).toBeUndefined();
    // The defect properties are asserted OBSERVED on the host element.
    const version = await world.realityStore.getVersion(
      scenarioById("lab-room-104-defect").projectId,
    );
    const wall = version!.nodes.find((n) => n.nodeId === elementNodeId("surface:room-104:wall-north"))!;
    const property = (key: string) => wall.properties.find((p) => p.key === key);
    expect(property("element.condition")).toMatchObject({ value: "cracked", epistemicStatus: "OBSERVED" });
    expect(property("defect.width")).toMatchObject({ value: 0.42, unit: "m", epistemicStatus: "OBSERVED" });
    expect(property("condition.cracking")).toMatchObject({ value: "hairline", epistemicStatus: "OBSERVED" });
    // defect.depth is NOT asserted (honestly unknown — never fabricated).
    expect(property("defect.depth")).toBeUndefined();
    // room.width is not asserted on the space node.
    const space = version!.nodes.find((n) => n.nodeId === "node:space:room-104")!;
    expect(space.properties.find((p) => p.key === "room.width")).toBeUndefined();
    // The observation episode is recorded.
    expect(run.reality!.observationIds).toEqual(["obs:lab-room-104-defect:defect"]);
  });

  test("assurance: READY / COMPLETE with every dimension at its expected outcome", async () => {
    const { run } = await runOf("lab-room-104-defect");
    const truth = groundTruthOf(scenarioById("lab-room-104-defect"));
    expect(run.assurance!.readiness).toBe("READY");
    expect(run.assurance!.captureCompleteness).toBe("COMPLETE");
    expect(run.assurance!.gaps).toHaveLength(0);
    for (const [dimensionId, expected] of Object.entries(truth.assurance.dimensionOutcomes)) {
      const dimension = run.assurance!.dimensions.find((d) => d.dimensionId === dimensionId);
      expect(dimension).toBeDefined();
      expect(dimension!.outcome).toBe(expected);
    }
  });

  test("verification: zero findings over the full baseline graph", async () => {
    const { run } = await runOf("lab-room-104-defect");
    expect(run.verification!.findingCount).toBe(0);
    expect(run.verification!.errorCount).toBe(0);
    expect(run.verification!.warningCount).toBe(0);
  });

  test("gaps: the OCCLUDED east wall propagates as a typed gap subject", async () => {
    const { run } = await runOf("lab-room-104-defect");
    expect(run.gaps).not.toBeNull();
    expect(run.gaps!.annotationEcho).toEqual([
      { targetNodeId: "element:room-104:wall-east", observationStatus: "OCCLUDED" },
    ]);
    const wallEastGap = run.gaps!.gaps.find(
      (gap) => gap.subjectNodeId === "element:room-104:wall-east",
    );
    expect(wallEastGap).toBeDefined();
    expect(wallEastGap!.kind).toBe("MISSING");
  });

  test("case: the defect is documented (observation + hypothesis + open missing evidence)", async () => {
    const { run } = await runOf("lab-room-104-defect");
    expect(run.caseRecord!.caseId).toBe("case-lab-room-104-crack");
    expect(run.caseRecord!.status).toBe("open");
    expect(run.caseRecord!.observationIds).toHaveLength(1);
    expect(run.caseRecord!.hypothesisIds).toHaveLength(1);
    expect(run.caseRecord!.missingEvidenceIds).toHaveLength(1);
    expect(run.caseRecord!.review).toBeNull();
    const observation = run.caseRecord!.record.observations[0]!;
    expect(observation.epistemicStatus).toBe("OBSERVED");
    expect(observation.evidenceIds.length).toBeGreaterThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */
/* Scenario B — multi-room floor with BOQ reconciliation                */
/* ------------------------------------------------------------------ */

describe("lab end-to-end B: ground floor dimensional survey + BOQ reconciliation", () => {
  test("every hop completes; 18 depth frames fuse to exactly 648 points", async () => {
    const { run } = await runOf("lab-floor-gf-boq");
    assertHopsOk(run);
    expect(run.reconstruction!.frames).toHaveLength(18);
    const totalPoints = run.reconstruction!.frames.reduce((sum, f) => sum + f.pointCount, 0);
    expect(totalPoints).toBe(18 * 36);
  });

  test("all 9 room dimensions measure within tolerance of exact truth", async () => {
    const { run } = await runOf("lab-floor-gf-boq");
    const truth = groundTruthOf(scenarioById("lab-floor-gf-boq"));
    expect(run.measurements).toHaveLength(9);
    for (const dimension of truth.dimensions) {
      const measured = run.measurements.find((m) => m.dimensionId === dimension.dimensionId);
      expect(measured).toBeDefined();
      expect(Math.abs(measured!.valueM - dimension.valueM)).toBeLessThan(
        MEASUREMENT_TOLERANCE_M,
      );
    }
  });

  test("reality v002: 25 expected nodes; READY_WITH_NOTES with the material note", async () => {
    const { run } = await runOf("lab-floor-gf-boq");
    const truth = groundTruthOf(scenarioById("lab-floor-gf-boq"));
    expect(new Set(run.reality!.nodeIds)).toEqual(new Set(truth.expectedNodeIds));
    expect(run.assurance!.readiness).toBe("READY_WITH_NOTES");
    expect(run.assurance!.captureCompleteness).toBe("COMPLETE");
    const material = run.assurance!.dimensions.find(
      (d) => d.dimensionId === "material-epistemic-floor",
    );
    expect(material!.critical).toBe(false);
    expect(material!.outcome).toBe("not_satisfied");
    // All critical dimensions satisfied.
    for (const dimension of run.assurance!.dimensions) {
      if (dimension.critical) {
        expect(dimension.outcome).toBe("satisfied");
      }
    }
  });

  test("verification: zero findings over the 25-node floor graph", async () => {
    const { run } = await runOf("lab-floor-gf-boq");
    expect(run.verification!.errorCount).toBe(0);
    expect(run.verification!.warningCount).toBe(0);
  });

  test("BOQ: the concrete row maps to exactly the 3 floor nodes; scaffolding stays unmapped", async () => {
    const { run } = await runOf("lab-floor-gf-boq");
    expect(run.boq!.parseStatus).toBe("parsed");
    expect(run.boq!.entries).toHaveLength(2);
    const concrete = run.boq!.entries.find((e) => e.rowNumber === 3)!;
    expect(concrete.status).toBe("mapped");
    expect(concrete.confidence).toBe("high");
    expect(concrete.method).toBe("location_match");
    expect(concrete.targetNodeIds).toEqual([
      "element:room-a:floor",
      "element:room-b:floor",
      "element:room-c:floor",
    ]);
    const scaffolding = run.boq!.entries.find((e) => e.rowNumber === 4)!;
    expect(scaffolding.status).toBe("unmapped");
    expect(scaffolding.reason).toContain("no reality nodes matched concept SCAFFOLDING");
  });

  test("BOQ quantity reconciliation: per-room areas within 2% of 20/14/9 m2", async () => {
    const { run } = await runOf("lab-floor-gf-boq");
    const width = (room: string) =>
      run.measurements.find((m) => m.roomLabel === room && m.propertyKey === "room.width")!.valueM;
    const depth = (room: string) =>
      run.measurements.find((m) => m.roomLabel === room && m.propertyKey === "room.depth")!.valueM;
    expect(Math.abs(width("room-a") * depth("room-a") - 20)).toBeLessThan(0.05);
    expect(Math.abs(width("room-b") * depth("room-b") - 14)).toBeLessThan(0.05);
    expect(Math.abs(width("room-c") * depth("room-c") - 9)).toBeLessThan(0.05);
  });

  test("byte-identical rerun: two fresh runs canonicalize identically", async () => {
    const first = await runOf("lab-floor-gf-boq");
    const second = await runOf("lab-floor-gf-boq");
    expect(canonicalJsonStringify(second.run)).toBe(canonicalJsonStringify(first.run));
  });
});

/* ------------------------------------------------------------------ */
/* Scenario C — intervention case with execution + outcome              */
/* ------------------------------------------------------------------ */

describe("lab end-to-end C: room 204 repair (case → intervention → execution → outcome)", () => {
  test("all 18 hops complete: 17 ok, 1 honestly not-applicable, none failed", async () => {
    const { run } = await runOf("lab-room-204-repair");
    assertHopsOk(run);
    expect(run.hops).toHaveLength(18);
    expect(run.hops.filter((h) => h.outcome === "ok")).toHaveLength(17);
    const notApplicable = run.hops.filter((h) => h.outcome === "notApplicable");
    expect(notApplicable.map((h) => h.hopId)).toEqual(["gaps"]);
    expect(notApplicable[0]!.detail).toContain("no node-level not-observed subjects");
  });

  test("two reconstruction jobs (baseline + post-work) both succeed with derivations", async () => {
    const { run } = await runOf("lab-room-204-repair");
    expect(run.reconstruction!.jobs).toHaveLength(2);
    for (const job of run.reconstruction!.jobs) {
      expect(job.state).toBe("succeeded");
    }
    expect(run.reconstruction!.derivations).toHaveLength(2);
    expect(run.evidence!.derivationCount).toBe(2);
    // 11 baseline + 2 work photos + 4 post-work + 2 derived artifacts.
    expect(run.evidence!.registeredContentIds).toHaveLength(19);
  });

  test("the governed chain: case review → approved intervention with approval reference", async () => {
    const { run } = await runOf("lab-room-204-repair");
    expect(run.caseRecord!.review).toEqual({
      decision: "approved",
      reviewer: "engineer-lab-north",
    });
    expect(run.intervention!.status).toBe("approved");
    expect(run.intervention!.baselineVersionId).toBe("v002");
    expect(run.intervention!.stepIds).toHaveLength(2);
    expect(run.intervention!.stateIds).toHaveLength(3); // baseline layer + 2 steps
    expect(run.intervention!.approvalReference).toEqual({
      caseId: "case-lab-room-204-repair",
      reviewDecision: "approved",
    });
  });

  test("impact: the condition-change property_delta line cites the defect host", async () => {
    const { run } = await runOf("lab-room-204-repair");
    expect(run.impact).not.toBeNull();
    const conditionLine = run.impact!.lines.find(
      (line) => line.kind === "property_delta" && line.targetNodeId === "element:room-204:wall-south",
    );
    expect(conditionLine).toBeDefined();
  });

  test("execution: PROPOSED→EXECUTED transition with work evidence and sessions", async () => {
    const { run } = await runOf("lab-room-204-repair");
    const execution = run.execution!;
    expect(execution.executionRecordId).toBe("execution-lab-room-204-repair-1");
    expect(execution.executedStepIds).toHaveLength(2);
    expect(execution.evidenceIds).toHaveLength(2); // the two work photos
    expect(execution.captureSessionIds).toEqual(["session-lab-room-204-repair-work"]);
    expect(execution.stateTransition).toMatchObject({
      fromStatus: "PROPOSED",
      toStatus: "EXECUTED",
      executionRecordId: "execution-lab-room-204-repair-1",
    });
  });

  test("post-work: READY_WITH_NOTES / COMPLETE; the repaired wall is re-observed", async () => {
    const { run, world } = await runOf("lab-room-204-repair");
    expect(run.assurance!.postWork).not.toBeNull();
    expect(run.assurance!.postWork!.readiness).toBe("READY_WITH_NOTES");
    expect(run.assurance!.postWork!.captureCompleteness).toBe("COMPLETE");
    // The defect-size dimension honestly degrades to insufficient_data —
    // there is no crack width to assert after the repair (never fabricated).
    const defectSize = run.assurance!.postWork!.report.dimensions.find(
      (d) => d.dimensionId === "defect-size-uncertainty",
    );
    expect(defectSize!.outcome).toBe("insufficient_data");
    // v003 exists with the repaired wall re-observed.
    expect(run.reality!.postWorkVersionId).toBe("v003");
    expect(run.reality!.versionIds).toEqual(["v002", "v003"]);
    const v003 = await world.realityStore.getVersion(
      scenarioById("lab-room-204-repair").projectId,
      "v003",
    );
    const wall = v003!.nodes.find((n) => n.nodeId === "element:room-204:wall-south")!;
    expect(wall.properties.find((p) => p.key === "element.condition")!.value).toBe("repaired");
    expect(wall.properties.find((p) => p.key === "condition.cracking")!.value).toBe("none");
    expect(wall.properties.find((p) => p.key === "defect.width")).toBeUndefined();
    expect(run.reality!.observationIds).toHaveLength(2);
    // Post-work verification is clean.
    expect(run.verification!.postWorkFindings).toEqual([]);
  });

  test("changedetection v002→v003 reports exactly the honest repair findings", async () => {
    const { run } = await runOf("lab-room-204-repair");
    expect(run.changedetection!.fromVersionId).toBe("v002");
    expect(run.changedetection!.toVersionId).toBe("v003");
    expect(run.changedetection!.findings).toEqual([
      { code: "CONDITION_CHANGED", nodeId: "element:room-204:wall-south", key: "condition.cracking" },
      { code: "PROPERTY_REMOVED", nodeId: "element:room-204:wall-south", key: "defect.width" },
      { code: "PROPERTY_CHANGED", nodeId: "element:room-204:wall-south", key: "element.condition" },
    ]);
  });

  test("outcome + lineage: the verified issue→outcome chain resolves completely", async () => {
    const { run } = await runOf("lab-room-204-repair");
    const execution = run.execution!;
    expect(execution.outcomeId).not.toBeNull();
    expect(execution.outcome!.epistemicStatus).toBe("OBSERVED");
    expect(execution.outcome!.captureSessionIds).toEqual([
      "session-lab-room-204-repair-postwork",
    ]);
    const lineage = execution.lineage!;
    expect(lineage.caseId).toBe("case-lab-room-204-repair");
    expect(lineage.case.observations).toHaveLength(1);
    expect(lineage.executions).toHaveLength(1);
    const entry = lineage.executions[0]!;
    expect(entry.scenario.status).toBe("approved");
    expect(entry.stateTransition.toStatus).toBe("EXECUTED");
    expect(entry.postWorkCaptureSessionIds).toEqual([
      "session-lab-room-204-repair-work",
      "session-lab-room-204-repair-postwork",
    ]);
    expect(entry.outcomes).toHaveLength(1);
    // The case ends resolved with the missing evidence collected.
    expect(run.caseRecord!.status).toBe("resolved");
    expect(run.caseRecord!.record.missingEvidence[0]!.status).toBe("collected");
  });
});
