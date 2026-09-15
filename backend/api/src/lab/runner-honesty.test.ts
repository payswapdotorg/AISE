/**
 * AISE-035 — honesty tests: capture completeness is the ASSURANCE ENGINE'S
 * call (a completed walk with an unsatisfied budget reports INCOMPLETE with
 * typed gaps — the Reality-specific rule), stopped runs report WHERE and WHY
 * (typed), and UNKNOWN/NOT_OBSERVED/OCCLUDED propagate honestly everywhere.
 * Also: byte-identical reruns and fixture/record purity.
 */

import { describe, expect, test } from "bun:test";
import { canonicalJsonStringify } from "@aise/shared-contracts";
import { scenarioById } from "./scenarios";
import { groundTruthOf } from "./groundtruth";
import { runScenario } from "./runner";
import { LAB_SCENARIOS } from "./scenarios";

describe("lab honesty: capture completeness is the assurance engine's call", () => {
  test("a COMPLETED WALK with a dropped evidence record is INCOMPLETE with the typed gap", async () => {
    const scenario = scenarioById("lab-room-104-defect");
    const { run } = await runScenario(scenario, {
      degradations: { droppedEvidenceAssetId: "photo:room-104:crack-2" },
    });
    // The walk itself finished: session closed, all hops but none stopped.
    expect(run.capture!.walkCompleted).toBe(true);
    expect(run.stoppedAt).toBeNull();
    for (const hop of run.hops) {
      expect(hop.outcome).not.toBe("failed");
    }
    // ... but the assurance engine says the budget is NOT satisfied.
    expect(run.assurance!.readiness).toBe("NOT_READY");
    expect(run.assurance!.captureCompleteness).toBe("INCOMPLETE");
    // The typed gap: the critical evidence-sufficiency shortfall.
    const dimension = run.assurance!.dimensions.find(
      (d) => d.dimensionId === "visual-condition-evidence",
    );
    expect(dimension).toMatchObject({
      critical: true,
      outcome: "not_satisfied",
      deficiencyCode: "evidence_count_shortfall",
    });
    // The assurance report's own gap record carries the remediation.
    expect(run.assurance!.gaps.length).toBeGreaterThan(0);
    const gap = run.assurance!.gaps.find((g) => g.dimensionId === "visual-condition-evidence");
    expect(gap).toBeDefined();
    expect(gap!.critical).toBe(true);
    // The dropped record is tracked, never silently swallowed.
    expect(run.evidence!.droppedContentIds).toHaveLength(1);
  });

  test("completeness follows the verdict, never the walk: baseline vs degraded", async () => {
    const scenario = scenarioById("lab-room-104-defect");
    const baseline = await runScenario(scenario);
    const degraded = await runScenario(scenario, {
      degradations: { droppedEvidenceAssetId: "photo:room-104:crack-2" },
    });
    // Identical walkCompleted=true in both runs...
    expect(baseline.run.capture!.walkCompleted).toBe(true);
    expect(degraded.run.capture!.walkCompleted).toBe(true);
    // ...but completeness differs exactly as the verdict differs.
    expect(baseline.run.assurance!.readiness).toBe("READY");
    expect(baseline.run.assurance!.captureCompleteness).toBe("COMPLETE");
    expect(degraded.run.assurance!.readiness).toBe("NOT_READY");
    expect(degraded.run.assurance!.captureCompleteness).toBe("INCOMPLETE");
  });

  test("dropping a PROVENANCE-CITED evidence record stops the run at reality (typed closure refusal)", async () => {
    // crack-1 is cited by the defect observation's provenance: losing its
    // registration is not a silent count change — the evidence service's
    // provenance-closure discipline refuses the link, the run stops at
    // reality with the typed code, and nothing downstream is fabricated.
    const scenario = scenarioById("lab-room-104-defect");
    const { run } = await runScenario(scenario, {
      degradations: { droppedEvidenceAssetId: "photo:room-104:crack-1" },
    });
    expect(run.stoppedAt).toBe("reality");
    expect(run.stopReason!.code).toBe("reality_versioning_failed");
    expect(run.stopReason!.detail).toContain("provenance_closure");
    expect(run.reality).toBeNull();
    expect(run.assurance).toBeNull();
    const downstream = run.hops.filter((hop) => hop.outcome === "notApplicable");
    expect(downstream.length).toBeGreaterThan(0);
  });

  test("READY_WITH_NOTES is COMPLETE (notes are not failures)", async () => {
    const { run } = await runScenario(scenarioById("lab-floor-gf-boq"));
    expect(run.assurance!.readiness).toBe("READY_WITH_NOTES");
    expect(run.assurance!.captureCompleteness).toBe("COMPLETE");
  });
});

describe("lab honesty: stopped runs report where and why (typed)", () => {
  test("a corrupted capture input stops the run at reconstruction with the typed code", async () => {
    const scenario = scenarioById("lab-room-104-defect");
    const { run } = await runScenario(scenario, {
      degradations: { corruptedCaptureAssetId: "depth:surface:room-104:ceiling" },
    });
    expect(run.stoppedAt).toBe("reconstruction");
    expect(run.stopReason).not.toBeNull();
    expect(run.stopReason!.code).toBe("INPUT_INCOMPATIBLE");
    // The typed detail names the offending evidence id.
    const ceiling = run.capture!.assets.find((a) => a.assetId === "depth:surface:room-104:ceiling")!;
    expect(run.stopReason!.detail).toContain(ceiling.contentId);
    // Downstream hops are explicitly notApplicable — never silently absent.
    const downstream = run.hops.filter(
      (hop) => LAB_ORDER.indexOf(hop.hopId) > LAB_ORDER.indexOf("reconstruction"),
    );
    expect(downstream.length).toBeGreaterThan(0);
    for (const hop of downstream) {
      expect(hop.outcome).toBe("notApplicable");
      expect(hop.detail).toContain("the run stopped at \"reconstruction\"");
    }
    // The reconstruction hop itself recorded the failure.
    const reconstructionHop = run.hops.find((h) => h.hopId === "reconstruction")!;
    expect(reconstructionHop.outcome).toBe("failed");
    // Upstream hops are unaffected (mission/capture/evidence completed).
    for (const hopId of ["mission", "capture", "evidence"] as const) {
      expect(run.hops.find((h) => h.hopId === hopId)!.outcome).toBe("ok");
    }
    // No reality version was minted; no assurance verdict exists — and the
    // run record says so honestly (null, not a fabricated default).
    expect(run.reality).toBeNull();
    expect(run.assurance).toBeNull();
  });
});

const LAB_ORDER = [
  "mission",
  "capture",
  "evidence",
  "reconstruction",
  "semantics",
  "reality",
  "assurance",
  "verification",
  "gaps",
  "boq",
  "case",
  "intervention",
  "impact",
  "execution",
  "postWork",
  "changedetection",
  "outcome",
  "lineage",
] as const;

describe("lab honesty: UNKNOWN / NOT_OBSERVED / OCCLUDED propagation", () => {
  test("the occluded wall never becomes a node, a dimension, or a fabrication", async () => {
    const scenario = scenarioById("lab-room-104-defect");
    const { run, world } = await runScenario(scenario);
    const truth = groundTruthOf(scenario);
    // Not modeled (OCCLUDED is not absence — it is declared and echoed).
    expect(run.reality!.nodeIds).not.toContain("element:room-104:wall-east");
    // Echoed in the run record, verbatim from ground truth.
    const occluded = run.notObserved.find(
      (entry) => entry.subjectId === "surface:room-104:wall-east",
    );
    expect(occluded).toMatchObject({ status: "OCCLUDED" });
    expect(occluded!.detail).toContain("cabinetry");
    // The knock-on NOT_OBSERVED: room width is unmeasurable, never guessed.
    const width = run.notObserved.find(
      (entry) => entry.subjectId === "node:space:room-104:room.width",
    );
    expect(width).toMatchObject({ status: "NOT_OBSERVED" });
    expect(run.measurements.find((m) => m.propertyKey === "room.width")).toBeUndefined();
    const version = await world.realityStore.getVersion(scenario.projectId);
    const space = version!.nodes.find((n) => n.nodeId === "node:space:room-104")!;
    expect(space.properties.find((p) => p.key === "room.width")).toBeUndefined();
    // The gap analysis carries the OCCLUDED subject as a typed gap.
    expect(run.gaps!.annotationEcho).toEqual([
      { targetNodeId: "element:room-104:wall-east", observationStatus: "OCCLUDED" },
    ]);
    // Ground truth declared all of it first.
    expect(truth.notObserved.length).toBeGreaterThanOrEqual(3);
  });

  test("the defect depth stays UNKNOWN: no fabricated property anywhere", async () => {
    const scenario = scenarioById("lab-room-204-repair");
    const { run, world } = await runScenario(scenario);
    // Echoed from ground truth.
    expect(
      run.notObserved.find((entry) => entry.status === "UNKNOWN" && entry.detail.includes("depth")),
    ).toBeDefined();
    // Never asserted on the wall node in either version.
    for (const versionId of ["v002", "v003"]) {
      const version = await world.realityStore.getVersion(scenario.projectId, versionId);
      const wall = version!.nodes.find((n) => n.nodeId === "element:room-204:wall-south")!;
      expect(wall.properties.find((p) => p.key === "defect.depth")).toBeUndefined();
    }
    // And never in the case's observation (the statement cites the measured
    // width only; there is no defect.depth assertion anywhere).
    const observation = run.caseRecord!.record.observations[0]!;
    expect(observation.statement).toContain("width");
    expect(observation.statement).not.toContain("depth");
    expect(observation.measurementRefs).toEqual(["meas:crack-width:card"]);
  });

  test("post-work honesty: the filled crack's width is absent, not zero", async () => {
    const { run, world } = await runScenario(scenarioById("lab-room-204-repair"));
    const v003 = await world.realityStore.getVersion(
      scenarioById("lab-room-204-repair").projectId,
      "v003",
    );
    const wall = v003!.nodes.find((n) => n.nodeId === "element:room-204:wall-south")!;
    expect(wall.properties.find((p) => p.key === "defect.width")).toBeUndefined();
    // The change report honestly records the removal (never a silent drop).
    expect(run.changedetection!.findings).toContainEqual({
      code: "PROPERTY_REMOVED",
      nodeId: "element:room-204:wall-south",
      key: "defect.width",
    });
  });
});

describe("lab determinism + purity", () => {
  test("byte-identical reruns: scenario A run records canonicalize identically", async () => {
    const scenario = scenarioById("lab-room-104-defect");
    const first = await runScenario(scenario);
    const second = await runScenario(scenario);
    expect(canonicalJsonStringify(second.run)).toBe(canonicalJsonStringify(first.run));
  });

  test("byte-identical reruns: scenario C (the full governed chain) canonicalizes identically", async () => {
    const scenario = scenarioById("lab-room-204-repair");
    const first = await runScenario(scenario);
    const second = await runScenario(scenario);
    expect(canonicalJsonStringify(second.run)).toBe(canonicalJsonStringify(first.run));
  });

  test("byte-identical reruns: degraded runs canonicalize identically too", async () => {
    const scenario = scenarioById("lab-room-104-defect");
    const degradations = { droppedEvidenceAssetId: "photo:room-104:crack-2" };
    const first = await runScenario(scenario, { degradations });
    const second = await runScenario(scenario, { degradations });
    expect(canonicalJsonStringify(second.run)).toBe(canonicalJsonStringify(first.run));
  });

  test("purity: running scenarios leaves the frozen fixtures byte-identical", async () => {
    const before = canonicalJsonStringify(LAB_SCENARIOS);
    await runScenario(scenarioById("lab-room-104-defect"));
    await runScenario(scenarioById("lab-floor-gf-boq"));
    await runScenario(scenarioById("lab-room-204-repair"), {
      degradations: { corruptedCaptureAssetId: "depth:surface:room-204:floor" },
    });
    expect(canonicalJsonStringify(LAB_SCENARIOS)).toBe(before);
    // The memoized ground truths are frozen as well.
    expect(() => {
      const truth = groundTruthOf(scenarioById("lab-floor-gf-boq"));
      (truth.surfaces as unknown as unknown[]).length = 0;
    }).toThrow();
  });

  test("purity: real-authority records are identical before and after a rerun", async () => {
    // The evidence read views (the real authority's records) of a first run
    // must be byte-identical to the second run's — the rerun neither mutates
    // nor drifts any authority record.
    const scenario = scenarioById("lab-room-104-defect");
    const first = await runScenario(scenario);
    const firstViews: string[] = [];
    for (const contentId of first.run.evidence!.registeredContentIds) {
      const view = await first.world.evidenceService.getEvidence(contentId);
      firstViews.push(canonicalJsonStringify(view));
    }
    const second = await runScenario(scenario);
    const secondViews: string[] = [];
    for (const contentId of second.run.evidence!.registeredContentIds) {
      const view = await second.world.evidenceService.getEvidence(contentId);
      secondViews.push(canonicalJsonStringify(view));
    }
    expect(secondViews).toEqual(firstViews);
  });
});
