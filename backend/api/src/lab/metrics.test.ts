/**
 * AISE-035 — golden metrics + regression gate tests: per-capability metric
 * instances over the baseline runs are non-trivial and inside their gates;
 * the gate table is complete; evaluation is per-instance (never aggregate).
 */

import { describe, expect, test } from "bun:test";
import { scenarioById } from "./scenarios";
import { groundTruthOf } from "./groundtruth";
import { runScenario } from "./runner";
import {
  LAB_GATE_THRESHOLDS,
  LAB_METRIC_NAMES,
  aggregateHidingProof,
  computeRunMetrics,
  evaluateLabGates,
  labGateFor,
  type LabRunMetrics,
} from "./metrics";

async function metricsOf(scenarioId: string): Promise<LabRunMetrics> {
  const scenario = scenarioById(scenarioId);
  const { run } = await runScenario(scenario);
  return computeRunMetrics(scenario, run);
}

describe("lab golden metrics: baseline values are non-trivial and gated", () => {
  test("the gate table covers every metric name with documented rationales", () => {
    expect(LAB_GATE_THRESHOLDS).toHaveLength(LAB_METRIC_NAMES.length);
    for (const name of LAB_METRIC_NAMES) {
      const gate = labGateFor(name);
      expect(gate.rationale.length).toBeGreaterThan(10);
      expect(gate.threshold).toBeGreaterThanOrEqual(0);
    }
    // Exactly one non-critical gate (the documented administrative-notes one).
    expect(LAB_GATE_THRESHOLDS.filter((gate) => !gate.critical).map((gate) => gate.metric)).toEqual([
      "hierarchy_unlinked_gap_count",
    ]);
  });

  test("scenario A: every capability produces metric instances; all gates pass", async () => {
    const metrics = await metricsOf("lab-room-104-defect");
    expect(metrics.failures).toHaveLength(0);
    const violations = evaluateLabGates(metrics);
    // The only violation is the documented non-critical hierarchy note.
    expect(violations.map((v) => v.metric)).toEqual(["hierarchy_unlinked_gap_count"]);
    expect(violations[0]!.critical).toBe(false);
    // Non-trivial metric VALUES (not all-zero — the fixtures carry noise).
    const reconstruction = metrics.capabilities.find((c) => c.capability === "reconstruction")!;
    const rmsValues = reconstruction.instances.filter((i) => i.metric === "plane_fit_rms");
    expect(rmsValues.length).toBe(5);
    for (const instance of rmsValues) {
      expect(instance.value).toBeGreaterThan(0);
      expect(instance.value).toBeLessThan(0.001); // gate threshold
    }
    const registration = reconstruction.instances.filter((i) => i.metric === "registration_error");
    for (const instance of registration) {
      expect(instance.value).toBeGreaterThan(0);
      expect(instance.value).toBeLessThan(0.002); // gate threshold
    }
    const dimensions = reconstruction.instances.filter((i) => i.metric === "dimension_error");
    expect(dimensions).toHaveLength(2); // height + depth (width honestly absent)
    for (const instance of dimensions) {
      expect(Math.abs(instance.value)).toBeGreaterThan(1e-6);
      expect(Math.abs(instance.value)).toBeLessThan(0.02);
    }
  });

  test("scenario B: 18 plane fits, 9 dimensions, 3 node quantities — all gated", async () => {
    const metrics = await metricsOf("lab-floor-gf-boq");
    expect(evaluateLabGates(metrics)).toHaveLength(0); // no violations at all
    const reconstruction = metrics.capabilities.find((c) => c.capability === "reconstruction")!;
    expect(reconstruction.instances.filter((i) => i.metric === "plane_fit_rms")).toHaveLength(18);
    expect(reconstruction.instances.filter((i) => i.metric === "registration_error")).toHaveLength(18);
    expect(reconstruction.instances.filter((i) => i.metric === "dimension_error")).toHaveLength(9);
    const boq = metrics.capabilities.find((c) => c.capability === "boq_reconciliation")!;
    const quantity = boq.instances.filter((i) => i.metric === "quantity_error");
    expect(quantity).toHaveLength(3);
    for (const instance of quantity) {
      expect(instance.value).toBeLessThan(0.02);
      // The R17 disclosure rides every quantity instance's detail.
      expect(instance.detail).toContain("INFORMATIONAL aggregate NEVER gates");
    }
    // The scaffolding row's mapping-target metric pins the honest unmapped.
    const mapping = boq.instances.filter((i) => i.metric === "mapping_target_error");
    expect(mapping).toHaveLength(2);
    expect(mapping.every((i) => i.value === 0)).toBe(true);
  });

  test("scenario C: change-detection fidelity and lineage completeness gate at 0", async () => {
    const metrics = await metricsOf("lab-room-204-repair");
    expect(evaluateLabGates(metrics)).toHaveLength(0);
    const changeDetection = metrics.capabilities.find((c) => c.capability === "change_detection")!;
    const fidelity = changeDetection.instances.find((i) => i.metric === "change_detection_fidelity")!;
    expect(fidelity.value).toBe(0);
    const lineage = metrics.capabilities.find((c) => c.capability === "intervention_lineage")!;
    const completeness = lineage.instances.find(
      (i) => i.metric === "lineage_completeness_error",
    )!;
    expect(completeness.value).toBe(0);
    // Post-work readiness/completeness metrics exist and pass.
    const assurance = metrics.capabilities.find((c) => c.capability === "assurance_readiness")!;
    expect(
      assurance.instances.filter((i) => i.metric === "readiness_verdict_error"),
    ).toHaveLength(2);
    expect(assurance.instances.every((i) => i.value === 0)).toBe(true);
  });

  test("a stopped run yields explicit capability failures, never silent zeros", async () => {
    const scenario = scenarioById("lab-room-104-defect");
    const { run } = await runScenario(scenario, {
      degradations: { corruptedCaptureAssetId: "depth:surface:room-104:ceiling" },
    });
    const metrics = computeRunMetrics(scenario, run);
    // The reconstruction capability failed typed; every downstream capability
    // carries an explicit ABSENT failure — no metric instances, no zeros.
    const failureByCapability = new Map(
      metrics.failures.map((failure) => [failure.capability, failure] as const),
    );
    expect(failureByCapability.get("reconstruction")!.code).toBe("INPUT_INCOMPATIBLE");
    for (const capability of [
      "semantic_classification",
      "reality_modeling",
      "assurance_readiness",
      "verification",
    ] as const) {
      const failure = failureByCapability.get(capability);
      expect(failure).toBeDefined();
      expect(failure!.code).toBe(
        capability === "semantic_classification"
          ? "SEMANTICS_ABSENT"
          : capability === "reality_modeling"
            ? "REALITY_ABSENT"
            : capability === "assurance_readiness"
              ? "ASSURANCE_ABSENT"
              : "VERIFICATION_ABSENT",
      );
    }
    // The runner's own hops agree (stopped at reconstruction).
    expect(run.stoppedAt).toBe("reconstruction");
  });

  test("the dropped-evidence degradation trips the registration deficit gate", async () => {
    const scenario = scenarioById("lab-room-104-defect");
    const { run } = await runScenario(scenario, {
      degradations: { droppedEvidenceAssetId: "photo:room-104:crack-2" },
    });
    const metrics = computeRunMetrics(scenario, run);
    const violations = evaluateLabGates(metrics);
    const deficit = violations.find((v) => v.metric === "evidence_registration_deficit");
    expect(deficit).toBeDefined();
    expect(deficit!.critical).toBe(true);
    expect(deficit!.value).toBe(1);
    // The readiness/completeness metrics ALSO trip (the verdict changed).
    expect(
      violations.filter((v) => v.metric === "readiness_verdict_error").length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      violations.filter((v) => v.metric === "capture_completeness_error").length,
    ).toBeGreaterThanOrEqual(1);
  });

  test("aggregate metrics are informational: the hiding proof over the clean baseline", async () => {
    const metrics = await metricsOf("lab-floor-gf-boq");
    const proof = aggregateHidingProof(metrics);
    // Clean baseline: no critical violations, nothing to hide.
    expect(proof.criticalViolations).toHaveLength(0);
    expect(proof.hiddenByAggregates).toBe(false);
    // Aggregates exist for the gated metric families.
    expect(proof.aggregateDimensionError).not.toBeNull();
    expect(proof.aggregateQuantityError).not.toBeNull();
  });
});

describe("lab ground-truth coverage of every capability", () => {
  test("every capability has metrics or an explicit failure on every baseline", async () => {
    for (const scenarioId of [
      "lab-room-104-defect",
      "lab-floor-gf-boq",
      "lab-room-204-repair",
    ]) {
      const metrics = await metricsOf(scenarioId);
      const covered = new Set(metrics.capabilities.map((c) => c.capability));
      for (const capability of [
        "reconstruction",
        "semantic_classification",
        "reality_modeling",
        "assurance_readiness",
        "verification",
        "evidence_provenance",
      ] as const) {
        expect(covered.has(capability)).toBe(true);
      }
      // BOQ/change-detection/lineage coverage follows the scenario's shape.
      const truth = groundTruthOf(scenarioById(scenarioId));
      if (truth.boq !== null) {
        expect(covered.has("boq_reconciliation")).toBe(true);
      }
    }
  });
});
