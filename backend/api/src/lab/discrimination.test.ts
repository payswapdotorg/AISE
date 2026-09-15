/**
 * AISE-035 — the R17 discrimination matrix: deliberate degradations (a
 * corrupted capture input, a dropped evidence record, an injected geometry
 * error) MUST be detected and reported as their capability's failure class,
 * and AGGREGATE SCORING MAY NEVER HIDE A CRITICAL-CLASS REGRESSION.
 */

import { describe, expect, test } from "bun:test";
import { scenarioById } from "./scenarios";
import { runScenario } from "./runner";
import {
  aggregateHidingProof,
  computeRunMetrics,
  evaluateDiscriminationCase,
  evaluateLabGates,
} from "./metrics";
import { LAB_DISCRIMINATION_SPECS, runDogfoodReport } from "./report";

describe("lab discrimination matrix (R17 mutation evidence)", () => {
  test("case 1 — corrupted capture input: detected as reconstruction_input_incompatible", async () => {
    const spec = LAB_DISCRIMINATION_SPECS[0]!;
    const scenario = scenarioById(spec.scenarioId);
    const { run } = await runScenario(scenario, { degradations: spec.degradations });
    const metrics = computeRunMetrics(scenario, run);
    const discriminationCase = evaluateDiscriminationCase({
      caseId: spec.caseId,
      scenarioId: spec.scenarioId,
      degradation: spec.degradationLabel,
      failureClass: spec.failureClass,
      run,
      violations: evaluateLabGates(metrics),
    });
    expect(discriminationCase.detected).toBe(true);
    // The stop reason is the REAL depth fusion backend's typed refusal,
    // naming the corrupted evidence content id.
    expect(run.stopReason!.code).toBe("INPUT_INCOMPATIBLE");
    const corrupted = run.capture!.assets.find(
      (asset) => asset.assetId === spec.degradations.corruptedCaptureAssetId,
    )!;
    expect(run.stopReason!.detail).toContain(corrupted.contentId);
    // No reality version was minted from unusable input.
    expect(run.reality).toBeNull();
  });

  test("case 2 — dropped evidence record: detected as assurance_evidence_shortfall", async () => {
    const spec = LAB_DISCRIMINATION_SPECS[1]!;
    const scenario = scenarioById(spec.scenarioId);
    const { run } = await runScenario(scenario, { degradations: spec.degradations });
    const metrics = computeRunMetrics(scenario, run);
    const discriminationCase = evaluateDiscriminationCase({
      caseId: spec.caseId,
      scenarioId: spec.scenarioId,
      degradation: spec.degradationLabel,
      failureClass: spec.failureClass,
      run,
      violations: evaluateLabGates(metrics),
    });
    expect(discriminationCase.detected).toBe(true);
    // The failure class is the assurance engine's own typed shortfall on the
    // CRITICAL dimension — with the walk having fully completed.
    expect(run.capture!.walkCompleted).toBe(true);
    const dimension = run.assurance!.dimensions.find(
      (d) => d.dimensionId === "visual-condition-evidence",
    );
    expect(dimension).toMatchObject({
      critical: true,
      outcome: "not_satisfied",
      deficiencyCode: "evidence_count_shortfall",
    });
  });

  test("case 3 — injected geometry error: detected as geometry_gate_violation", async () => {
    const spec = LAB_DISCRIMINATION_SPECS[2]!;
    const scenario = scenarioById(spec.scenarioId);
    const { run } = await runScenario(scenario, { degradations: spec.degradations });
    const metrics = computeRunMetrics(scenario, run);
    const violations = evaluateLabGates(metrics);
    const discriminationCase = evaluateDiscriminationCase({
      caseId: spec.caseId,
      scenarioId: spec.scenarioId,
      degradation: spec.degradationLabel,
      failureClass: spec.failureClass,
      run,
      violations,
    });
    expect(discriminationCase.detected).toBe(true);
    // The run itself completed (a systematic error is not a pipeline stop)...
    expect(run.stoppedAt).toBeNull();
    // ...the pipeline is internally consistent (its OWN assurance verdict
    // stays READY_WITH_NOTES — σ cannot see a systematic offset)...
    expect(run.assurance!.readiness).toBe("READY_WITH_NOTES");
    // ...and the GOLDEN GATES catch exactly what assurance cannot:
    const dimensionViolations = violations.filter((v) => v.metric === "dimension_error");
    expect(dimensionViolations.length).toBeGreaterThanOrEqual(1);
    const widthViolation = dimensionViolations.find(
      (v) => v.subjectId === "dim:room-b:width",
    )!;
    expect(Math.abs(widthViolation.value - 0.15)).toBeLessThan(0.01);
    expect(widthViolation.critical).toBe(true);
    // Registration error trips on the displaced wall's plane.
    const registration = violations.filter(
      (v) => v.metric === "registration_error" && v.subjectId === "surface:room-b:wall-west",
    );
    expect(registration).toHaveLength(1);
    expect(Math.abs(registration[0]!.value - 0.15)).toBeLessThan(0.01);
    // Quantity error trips on room-b's floor takeoff.
    const quantity = violations.filter(
      (v) => v.metric === "quantity_error" && v.subjectId === "element:room-b:floor",
    );
    expect(quantity).toHaveLength(1);
    expect(quantity[0]!.value).toBeGreaterThan(0.02);
  });

  test("R17: the aggregate NEVER hides the critical regression (the proof record)", async () => {
    const spec = LAB_DISCRIMINATION_SPECS[2]!;
    const scenario = scenarioById(spec.scenarioId);
    const { run } = await runScenario(scenario, { degradations: spec.degradations });
    const metrics = computeRunMetrics(scenario, run);
    const proof = aggregateHidingProof(metrics);
    // BOTH informational aggregates sit under their gate thresholds...
    expect(proof.aggregateDimensionError!).toBeLessThan(0.02);
    expect(proof.aggregateQuantityError!).toBeLessThan(0.02);
    // ...while critical per-instance violations exist...
    expect(proof.criticalViolations.length).toBeGreaterThanOrEqual(3);
    // ...so the aggregate WOULD have hidden them — and the per-instance
    // gate evaluation is what catches the regression.
    expect(proof.hiddenByAggregates).toBe(true);
  });

  test("R17: a critical regression fails the overall report even among many passes", async () => {
    // The injected-geometry degradation on a BASELINE slot: most metric
    // instances pass, one family is critically wrong — the overall verdict
    // must be FAIL, never an average (the report-level R17 proof).
    const spec = LAB_DISCRIMINATION_SPECS[2]!;
    const report = await runDogfoodReport({
      baselineScenarioIds: [spec.scenarioId],
      baselineDegradationsByScenarioId: {
        [spec.scenarioId]: spec.degradations,
      },
      discriminationSpecs: [],
    });
    const totalInstances = report.baselineRuns[0]!.capabilities.reduce(
      (sum, capability) => sum + capability.metricInstanceCount,
      0,
    );
    expect(totalInstances).toBeGreaterThan(50); // many instances evaluated...
    expect(report.criticalViolations.length).toBeGreaterThanOrEqual(3); // ...few trip
    expect(report.overall).toBe("FAIL");
    // If the report gated on the MEAN it would pass: the per-instance
    // evaluation is what catches the regression.
    const dimensionViolations = report.criticalViolations.filter(
      (violation) => violation.metric === "dimension_error",
    );
    expect(dimensionViolations.length).toBeGreaterThanOrEqual(1);
  });

  test("every shipped discrimination case is detected in its failure class", async () => {
    const report = await runDogfoodReport();
    expect(report.discrimination).toHaveLength(3);
    for (const discriminationCase of report.discrimination) {
      expect(discriminationCase.detected).toBe(true);
      expect(discriminationCase.detail.length).toBeGreaterThan(10);
    }
  });
});

describe("lab discrimination: mutation instruments are never baselines", () => {
  test("the degradation labels document exactly what was broken", () => {
    expect(LAB_DISCRIMINATION_SPECS.map((spec) => spec.failureClass)).toEqual([
      "reconstruction_input_incompatible",
      "assurance_evidence_shortfall",
      "geometry_gate_violation",
    ]);
    for (const spec of LAB_DISCRIMINATION_SPECS) {
      expect(spec.degradationLabel.length).toBeGreaterThan(20);
    }
    const geometry = LAB_DISCRIMINATION_SPECS[2]!;
    expect(geometry.degradationLabel).toContain("0.15 m");
  });

  test("baseline runs of the same scenarios stay clean (no false positives)", async () => {
    for (const spec of LAB_DISCRIMINATION_SPECS) {
      const scenario = scenarioById(spec.scenarioId);
      const { run } = await runScenario(scenario);
      const metrics = computeRunMetrics(scenario, run);
      const violations = evaluateLabGates(metrics).filter((v) => v.critical);
      expect(violations).toHaveLength(0);
      expect(metrics.failures).toHaveLength(0);
    }
  });
});
