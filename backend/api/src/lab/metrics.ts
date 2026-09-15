/**
 * AISE-035 — Physical Reality Lab metrics: per-capability golden metrics,
 * versioned regression gates and the discrimination matrix (R17).
 *
 * GATE RULE (exact, mirroring the AISE-019 benchmark discipline): a metric
 * instance violates its gate iff `Math.abs(value) > threshold` (STRICT).
 * Gates evaluate PER-INSTANCE values — never the informational aggregates:
 * an aggregate may sit under every threshold while one critical instance
 * trips, and the report STILL fails (aggregate pass/fail may NEVER hide a
 * critical-class regression — R17).
 *
 * Failure entries: a capability whose hop failed (e.g. reconstruction under
 * a corrupted capture input) contributes an explicit failure entry and NO
 * metric instances — absence is a loud record, never a silently skipped row.
 *
 * Threshold rationale: every threshold is anchored to the lab device's
 * declared 1σ (LAB_DEVICE_SIGMA_M = 0.0002 m) with engineering headroom, or
 * to an exactness requirement (0) where ground truth pins an exact set
 * (node ids, mapping targets, finding codes). Bumping this table is a
 * governed change: ship a new LAB_GATE_THRESHOLD_VERSION.
 */

import { distancePointPlane, type Plane, type Vec3 } from "../geometry";
import { exactGridPoints, type LabScenarioRun } from "./runner";
import type { LabScenario } from "./scenarios";
import { groundTruthOf, elementNodeId, type LabBoqRowTruth } from "./groundtruth";

/* ------------------------------------------------------------------ */
/* Metric model                                                         */
/* ------------------------------------------------------------------ */

export const LAB_CAPABILITIES = [
  "reconstruction",
  "semantic_classification",
  "reality_modeling",
  "assurance_readiness",
  "verification",
  "evidence_provenance",
  "boq_reconciliation",
  "change_detection",
  "intervention_lineage",
] as const;
export type LabCapabilityId = (typeof LAB_CAPABILITIES)[number];

export const LAB_METRIC_NAMES = [
  "plane_fit_rms",
  "registration_error",
  "point_count_error",
  "dimension_error",
  "classification_error",
  "node_coverage_deficit",
  "readiness_verdict_error",
  "capture_completeness_error",
  "verification_error_findings",
  "evidence_registration_deficit",
  "derivation_closure_deficit",
  "mapping_target_error",
  "quantity_error",
  "change_detection_fidelity",
  "lineage_completeness_error",
  "hierarchy_unlinked_gap_count",
] as const;
export type LabMetricName = (typeof LAB_METRIC_NAMES)[number];

export interface LabMetricInstance {
  readonly metric: LabMetricName;
  readonly capability: LabCapabilityId;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly value: number;
  readonly unit: "m" | "ratio" | "count";
  /** dimension_error is signed for diagnosis; gates evaluate |value|. */
  readonly signed: boolean;
  readonly detail: string;
}

export interface LabCapabilityFailure {
  readonly capability: LabCapabilityId;
  readonly code: string;
  readonly detail: string;
}

export interface LabCapabilityMetrics {
  readonly capability: LabCapabilityId;
  readonly instances: readonly LabMetricInstance[];
  /** Mean per metric name — INFORMATIONAL ONLY, never gated (R17). */
  readonly aggregates: Readonly<Partial<Record<LabMetricName, number>>>;
  readonly failure: LabCapabilityFailure | null;
}

export interface LabRunMetrics {
  readonly scenarioId: string;
  readonly capabilities: readonly LabCapabilityMetrics[];
  readonly failures: readonly LabCapabilityFailure[];
}

/* ------------------------------------------------------------------ */
/* Gates (versioned threshold table)                                    */
/* ------------------------------------------------------------------ */

export const LAB_GATE_THRESHOLD_VERSION = "lab-gates-1" as const;

export interface LabGateThreshold {
  readonly metric: LabMetricName;
  readonly threshold: number;
  readonly critical: boolean;
  readonly rationale: string;
}

/**
 * The versioned lab gate table. Every capability in the work order's
 * critical path gates CRITICALLY; the one documented exception is
 * `hierarchy_unlinked_gap_count` — the gap analysis honestly flags
 * administrative hierarchy nodes without linked evidence as coverage notes
 * (non-critical: the operator-declared structure is not an engineering
 * measurement regression).
 */
export const LAB_GATE_THRESHOLDS: readonly LabGateThreshold[] = [
  { metric: "plane_fit_rms", threshold: 0.001, critical: true, rationale: "5x the lab device 1σ (0.0002 m) plane-fit scatter envelope" },
  { metric: "registration_error", threshold: 0.002, critical: true, rationale: "10x the lab device 1σ mean point-to-plane registration error" },
  { metric: "point_count_error", threshold: 0, critical: true, rationale: "the fused cloud must carry EXACTLY the fixture grid's points (data loss is critical)" },
  { metric: "dimension_error", threshold: 0.02, critical: true, rationale: "±20 mm absolute dimension error invalidates survey-class engineering use (the assurance survey bound)" },
  { metric: "classification_error", threshold: 0, critical: true, rationale: "a mis-classified surface kind is a critical semantic regression" },
  { metric: "node_coverage_deficit", threshold: 0, critical: true, rationale: "the modeled node set must match ground truth exactly (missing or phantom nodes are critical)" },
  { metric: "readiness_verdict_error", threshold: 0, critical: true, rationale: "the readiness authority's verdict must match the scenario's expected verdict" },
  { metric: "capture_completeness_error", threshold: 0, critical: true, rationale: "capture completeness must equal the assurance verdict's implication exactly" },
  { metric: "verification_error_findings", threshold: 0, critical: true, rationale: "error-severity verification findings on a healthy run are critical model-discipline regressions" },
  { metric: "evidence_registration_deficit", threshold: 0, critical: true, rationale: "every captured asset's evidence record must be registered (a dropped record is critical)" },
  { metric: "derivation_closure_deficit", threshold: 0, critical: true, rationale: "every reconstruction artifact must carry a recorded derivation (provenance closure)" },
  { metric: "mapping_target_error", threshold: 0, critical: true, rationale: "BOQ mapping target sets must match ground truth exactly (mapping drift is critical)" },
  { metric: "quantity_error", threshold: 0.02, critical: true, rationale: "2% relative quantity error invalidates BOQ takeoff reconciliation" },
  { metric: "change_detection_fidelity", threshold: 0, critical: true, rationale: "the change report must carry exactly the expected finding set" },
  { metric: "lineage_completeness_error", threshold: 0, critical: true, rationale: "the issue->outcome lineage must resolve completely" },
  { metric: "hierarchy_unlinked_gap_count", threshold: 0, critical: false, rationale: "gap-analysis coverage notes for operator-declared administrative nodes — notes, never failures" },
];

const GATE_INDEX = new Map(LAB_GATE_THRESHOLDS.map((gate) => [gate.metric, gate] as const));

/** Threshold lookup; throws on an incomplete table (internal invariant). */
export function labGateFor(metric: LabMetricName): LabGateThreshold {
  const gate = GATE_INDEX.get(metric);
  if (gate === undefined) {
    throw new Error(`lab gate table incomplete: no threshold for ${metric}`);
  }
  return gate;
}

export interface LabGateViolation {
  readonly scenarioId: string;
  readonly capability: LabCapabilityId;
  readonly metric: LabMetricName;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly value: number;
  readonly threshold: number;
  readonly critical: boolean;
  readonly detail: string;
}

/** Evaluate every metric instance against its gate (per-instance, R17). */
export function evaluateLabGates(
  metrics: LabRunMetrics,
): readonly LabGateViolation[] {
  const violations: LabGateViolation[] = [];
  for (const capability of metrics.capabilities) {
    for (const instance of capability.instances) {
      const gate = labGateFor(instance.metric);
      if (Math.abs(instance.value) > gate.threshold) {
        violations.push({
          scenarioId: metrics.scenarioId,
          capability: instance.capability,
          metric: instance.metric,
          subjectId: instance.subjectId,
          subjectLabel: instance.subjectLabel,
          value: instance.value,
          threshold: gate.threshold,
          critical: gate.critical,
          detail: `${instance.detail} — |${instance.value}| > ${gate.threshold} (${gate.rationale})`,
        });
      }
    }
  }
  return violations;
}

/* ------------------------------------------------------------------ */
/* Metric computation                                                   */
/* ------------------------------------------------------------------ */

function meanOf(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return values.length === 0 ? 0 : sum / values.length;
}

function aggregateByMetric(
  instances: readonly LabMetricInstance[],
): Readonly<Partial<Record<LabMetricName, number>>> {
  const buckets = new Map<LabMetricName, number[]>();
  for (const instance of instances) {
    const bucket = buckets.get(instance.metric) ?? [];
    bucket.push(instance.value);
    buckets.set(instance.metric, bucket);
  }
  const aggregates: Partial<Record<LabMetricName, number>> = {};
  for (const [metric, values] of buckets) {
    aggregates[metric] = meanOf(values);
  }
  return aggregates;
}

function capabilityOf(
  capability: LabCapabilityId,
  instances: readonly LabMetricInstance[],
  failure: LabCapabilityFailure | null = null,
): LabCapabilityMetrics {
  return {
    capability,
    instances,
    aggregates: aggregateByMetric(instances),
    failure,
  };
}

/** Compute all capability metrics for one run (pure over the run record). */
export function computeRunMetrics(
  scenario: LabScenario,
  run: LabScenarioRun,
): LabRunMetrics {
  const truth = groundTruthOf(scenario);
  const capabilities: LabCapabilityMetrics[] = [];
  const failures: LabCapabilityFailure[] = [];

  /* -- reconstruction ------------------------------------------------- */
  if (run.reconstruction === null) {
    const failure: LabCapabilityFailure = {
      capability: "reconstruction",
      code: run.stopReason?.code ?? "RECONSTRUCTION_ABSENT",
      detail: run.stopReason?.detail ?? "no reconstruction record in the run",
    };
    capabilities.push(capabilityOf("reconstruction", [], failure));
    failures.push(failure);
  } else if (run.stoppedAt === "reconstruction") {
    const failure: LabCapabilityFailure = {
      capability: "reconstruction",
      code: run.stopReason?.code ?? "RECONSTRUCTION_FAILED",
      detail: run.stopReason?.detail ?? "reconstruction failed",
    };
    capabilities.push(capabilityOf("reconstruction", [], failure));
    failures.push(failure);
  } else {
    const instances: LabMetricInstance[] = [];
    for (const frame of run.reconstruction.frames) {
      const surfaceTruth = truth.surfaces.find((s) => s.surfaceId === frame.surfaceId);
      if (surfaceTruth === undefined) {
        continue;
      }
      instances.push({
        metric: "plane_fit_rms",
        capability: "reconstruction",
        subjectId: frame.surfaceId,
        subjectLabel: `${surfaceTruth.role} ${frame.surfaceId}`,
        value: frame.rmsResidual,
        unit: "m",
        signed: false,
        detail: `RMS residual of ${frame.pointCount} fused points about the fitted plane`,
      });
      // Registration error: mean point-to-plane distance of the EXACT
      // ground-truth grid points to the reconstructed plane.
      const exact = exactGridPoints(surfaceTruth);
      let distanceSum = 0;
      for (const point of exact) {
        distanceSum += distancePointPlane(point as Vec3, null, frame.plane as Plane).absolute;
      }
      instances.push({
        metric: "registration_error",
        capability: "reconstruction",
        subjectId: frame.surfaceId,
        subjectLabel: `${surfaceTruth.role} ${frame.surfaceId}`,
        value: distanceSum / exact.length,
        unit: "m",
        signed: false,
        detail: `mean point-to-plane distance of ${exact.length} exact ground-truth points to the reconstructed plane`,
      });
      instances.push({
        metric: "point_count_error",
        capability: "reconstruction",
        subjectId: frame.surfaceId,
        subjectLabel: `${surfaceTruth.role} ${frame.surfaceId}`,
        value:
          Math.abs(frame.pointCount - surfaceTruth.gridSide * surfaceTruth.gridSide) /
          (surfaceTruth.gridSide * surfaceTruth.gridSide),
        unit: "ratio",
        signed: false,
        detail: `fused ${frame.pointCount} of expected ${surfaceTruth.gridSide * surfaceTruth.gridSide} grid points`,
      });
    }
    // Dimension errors: measured room dimensions vs ground truth.
    for (const dimension of truth.dimensions) {
      const measured = run.measurements.find((m) => m.dimensionId === dimension.dimensionId);
      if (measured === undefined) {
        // Absent measurement: an explicit failure entry, never silence.
        const failure: LabCapabilityFailure = {
          capability: "reconstruction",
          code: "MISSING_MEASUREMENT",
          detail: `dimension ${dimension.dimensionId} (${dimension.label}) was not measured`,
        };
        failures.push(failure);
        continue;
      }
      instances.push({
        metric: "dimension_error",
        capability: "reconstruction",
        subjectId: dimension.dimensionId,
        subjectLabel: dimension.label,
        value: measured.valueM - dimension.valueM,
        unit: "m",
        signed: true,
        detail: `signed error measured(${measured.valueM.toFixed(6)}m) − truth(${dimension.valueM}m)`,
      });
    }
    capabilities.push(capabilityOf("reconstruction", instances));
  }

  /* -- semantic classification ---------------------------------------- */
  if (run.semantics === null) {
    const failure: LabCapabilityFailure = {
      capability: "semantic_classification",
      code: "SEMANTICS_ABSENT",
      detail: "no semantics record in the run (the run stopped earlier)",
    };
    capabilities.push(capabilityOf("semantic_classification", [], failure));
    failures.push(failure);
  } else {
    const instances: LabMetricInstance[] = [];
    for (const surface of scenario.surfaces) {
      if (surface.occluded) {
        continue; // honestly not captured — not a classification subject
      }
      const element = run.semantics.elements.find((e) => e.surfaceId === surface.surfaceId);
      const expectedKind =
        surface.role === "wall" ? "wall" : surface.role === "floor" ? "floor" : "ceiling";
      const value = element !== undefined && element.kind === expectedKind ? 0 : 1;
      instances.push({
        metric: "classification_error",
        capability: "semantic_classification",
        subjectId: surface.surfaceId,
        subjectLabel: `${surface.role} ${surface.surfaceId}`,
        value,
        unit: "count",
        signed: false,
        detail:
          element === undefined
            ? `no extracted element matched surface ${surface.surfaceId}`
            : `extracted kind "${element.kind}" vs truth role "${expectedKind}"`,
      });
    }
    capabilities.push(capabilityOf("semantic_classification", instances));
  }

  /* -- reality modeling ------------------------------------------------ */
  if (run.reality === null) {
    const failure: LabCapabilityFailure = {
      capability: "reality_modeling",
      code: "REALITY_ABSENT",
      detail: "no reality version record in the run (the run stopped earlier)",
    };
    capabilities.push(capabilityOf("reality_modeling", [], failure));
    failures.push(failure);
  } else {
    const expected = new Set(truth.expectedNodeIds);
    const modeled = new Set(run.reality.nodeIds);
    const missing = [...expected].filter((id) => !modeled.has(id));
    const phantom = [...modeled].filter((id) => !expected.has(id));
    capabilities.push(
      capabilityOf("reality_modeling", [
        {
          metric: "node_coverage_deficit",
          capability: "reality_modeling",
          subjectId: run.reality.baselineVersionId,
          subjectLabel: `${scenario.scenarioId} baseline node set`,
          value: missing.length + phantom.length,
          unit: "count",
          signed: false,
          detail: `modeled ${modeled.size} of ${expected.size} expected nodes (${missing.length} missing: ${missing.join(", ") || "none"}; ${phantom.length} phantom: ${phantom.join(", ") || "none"})`,
        },
      ]),
    );
  }

  /* -- assurance readiness --------------------------------------------- */
  if (run.assurance === null) {
    const failure: LabCapabilityFailure = {
      capability: "assurance_readiness",
      code: "ASSURANCE_ABSENT",
      detail: "no assurance verdict in the run (the run stopped earlier)",
    };
    capabilities.push(capabilityOf("assurance_readiness", [], failure));
    failures.push(failure);
  } else {
    const instances: LabMetricInstance[] = [
      {
        metric: "readiness_verdict_error",
        capability: "assurance_readiness",
        subjectId: truth.assurance.profileId,
        subjectLabel: `${scenario.scenarioId} baseline verdict`,
        value: run.assurance.readiness === truth.assurance.readiness ? 0 : 1,
        unit: "count",
        signed: false,
        detail: `verdict "${run.assurance.readiness}" vs expected "${truth.assurance.readiness}"`,
      },
      {
        metric: "capture_completeness_error",
        capability: "assurance_readiness",
        subjectId: truth.assurance.profileId,
        subjectLabel: `${scenario.scenarioId} capture completeness`,
        value:
          run.assurance.captureCompleteness === truth.assurance.captureCompleteness ? 0 : 1,
        unit: "count",
        signed: false,
        detail: `completeness "${run.assurance.captureCompleteness}" vs expected "${truth.assurance.captureCompleteness}" (the assurance engine's call — never the walk)`,
      },
    ];
    if (truth.postWorkAssurance !== null && run.assurance.postWork !== null) {
      instances.push(
        {
          metric: "readiness_verdict_error",
          capability: "assurance_readiness",
          subjectId: `${truth.postWorkAssurance.profileId}:postwork`,
          subjectLabel: `${scenario.scenarioId} post-work verdict`,
          value:
            run.assurance.postWork.readiness === truth.postWorkAssurance.readiness ? 0 : 1,
          unit: "count",
          signed: false,
          detail: `post-work verdict "${run.assurance.postWork.readiness}" vs expected "${truth.postWorkAssurance.readiness}"`,
        },
        {
          metric: "capture_completeness_error",
          capability: "assurance_readiness",
          subjectId: `${truth.postWorkAssurance.profileId}:postwork`,
          subjectLabel: `${scenario.scenarioId} post-work capture completeness`,
          value:
            run.assurance.postWork.captureCompleteness ===
            truth.postWorkAssurance.captureCompleteness
              ? 0
              : 1,
          unit: "count",
          signed: false,
          detail: `post-work completeness "${run.assurance.postWork.captureCompleteness}" vs expected "${truth.postWorkAssurance.captureCompleteness}"`,
        },
      );
    }
    capabilities.push(capabilityOf("assurance_readiness", instances));
  }

  /* -- verification ---------------------------------------------------- */
  if (run.verification === null) {
    const failure: LabCapabilityFailure = {
      capability: "verification",
      code: "VERIFICATION_ABSENT",
      detail: "no verification record in the run (the run stopped earlier)",
    };
    capabilities.push(capabilityOf("verification", [], failure));
    failures.push(failure);
  } else {
    const instances: LabMetricInstance[] = [
      {
        metric: "verification_error_findings",
        capability: "verification",
        subjectId: run.reality?.baselineVersionId ?? scenario.scenarioId,
        subjectLabel: `${scenario.scenarioId} baseline verification`,
        value: run.verification.errorCount,
        unit: "count",
        signed: false,
        detail: `${run.verification.errorCount} error-severity findings (${run.verification.warningCount} warnings)`,
      },
    ];
    if (run.verification.postWorkFindings !== null) {
      const postWorkErrors = run.verification.postWorkFindings.filter(
        (finding) => finding.severity === "error",
      ).length;
      instances.push({
        metric: "verification_error_findings",
        capability: "verification",
        subjectId: run.reality?.postWorkVersionId ?? `${scenario.scenarioId}:postwork`,
        subjectLabel: `${scenario.scenarioId} post-work verification`,
        value: postWorkErrors,
        unit: "count",
        signed: false,
        detail: `${postWorkErrors} error-severity findings in the post-work verification`,
      });
    }
    capabilities.push(capabilityOf("verification", instances));
  }

  /* -- evidence provenance ---------------------------------------------- */
  if (run.evidence === null) {
    const failure: LabCapabilityFailure = {
      capability: "evidence_provenance",
      code: "EVIDENCE_ABSENT",
      detail: "no evidence record in the run (the run stopped earlier)",
    };
    capabilities.push(capabilityOf("evidence_provenance", [], failure));
    failures.push(failure);
  } else {
    const expectedRegistrations =
      scenario.capturePlan.length + (scenario.postWorkCapturePlan?.length ?? 0);
    // Work-session photos are registered outside the capture plans; each
    // reconstruction job's derived artifact is registered as evidence too.
    const workPhotoCount = scenario.intervention === null ? 0 : 2;
    const derivationJobs = run.reconstruction?.jobs.length ?? 0;
    const expectedTotal = expectedRegistrations + workPhotoCount + derivationJobs;
    const derivations = run.reconstruction?.derivations.length ?? 0;
    capabilities.push(
      capabilityOf("evidence_provenance", [
        {
          metric: "evidence_registration_deficit",
          capability: "evidence_provenance",
          subjectId: scenario.scenarioId,
          subjectLabel: `${scenario.scenarioId} evidence graph`,
          value: expectedTotal - run.evidence.registeredContentIds.length,
          unit: "count",
          signed: false,
          detail: `registered ${run.evidence.registeredContentIds.length} of ${expectedTotal} expected evidence records (${run.evidence.droppedContentIds.length} dropped by degradation, ${derivationJobs} derived artifacts)`,
        },
        {
          metric: "derivation_closure_deficit",
          capability: "evidence_provenance",
          subjectId: scenario.scenarioId,
          subjectLabel: `${scenario.scenarioId} derivation closure`,
          value: derivationJobs - derivations,
          unit: "count",
          signed: false,
          detail: `${derivations} derivations recorded for ${derivationJobs} reconstruction jobs`,
        },
      ]),
    );
  }

  /* -- BOQ reconciliation ---------------------------------------------- */
  if (truth.boq === null || run.boq === null) {
    if (truth.boq !== null) {
      const failure: LabCapabilityFailure = {
        capability: "boq_reconciliation",
        code: "BOQ_ABSENT",
        detail: "no BOQ record in the run (the run stopped earlier)",
      };
      capabilities.push(capabilityOf("boq_reconciliation", [], failure));
      failures.push(failure);
    }
  } else {
    const instances: LabMetricInstance[] = [];
    for (const row of truth.boq.rows) {
      const entry = run.boq.entries.find(
        (candidate) => candidate.rowNumber === 3 + (row.itemId - 1),
      );
      if (entry === undefined) {
        const failure: LabCapabilityFailure = {
          capability: "boq_reconciliation",
          code: "MISSING_MAPPING_ENTRY",
          detail: `BOQ row for item ${row.itemId} (${row.description}) has no mapping entry`,
        };
        failures.push(failure);
        continue;
      }
      if (row.expectedTargets === "unmapped") {
        instances.push({
          metric: "mapping_target_error",
          capability: "boq_reconciliation",
          subjectId: `boq-item-${row.itemId}`,
          subjectLabel: row.description,
          value: entry.status === "unmapped" ? 0 : 1,
          unit: "count",
          signed: false,
          detail: `expected honestly unmapped; matcher status "${entry.status}" (${entry.reason ?? "no reason"})`,
        });
        continue;
      }
      const expected = new Set(row.expectedTargets);
      const actual = new Set(entry.targetNodeIds);
      const missingTargets = [...expected].filter((id) => !actual.has(id));
      const phantomTargets = [...actual].filter((id) => !expected.has(id));
      instances.push({
        metric: "mapping_target_error",
        capability: "boq_reconciliation",
        subjectId: `boq-item-${row.itemId}`,
        subjectLabel: row.description,
        value: missingTargets.length + phantomTargets.length,
        unit: "count",
        signed: false,
        detail: `mapped ${actual.size} targets vs ${expected.size} expected (${missingTargets.length} missing, ${phantomTargets.length} phantom)`,
      });
      instances.push(...quantityMetrics(row, run));
    }
    capabilities.push(capabilityOf("boq_reconciliation", instances));
  }

  /* -- change detection ------------------------------------------------- */
  if (scenario.intervention !== null) {
    if (run.changedetection === null) {
      const failure: LabCapabilityFailure = {
        capability: "change_detection",
        code: "CHANGE_DETECTION_ABSENT",
        detail: "no change report in the run (the run stopped earlier)",
      };
      capabilities.push(capabilityOf("change_detection", [], failure));
      failures.push(failure);
    } else {
      // Expected finding set for the repair: the condition change, the
      // removed defect width and the changed condition class.
      const expectedCodes = ["CONDITION_CHANGED", "PROPERTY_CHANGED", "PROPERTY_REMOVED"];
      const actualCodes = run.changedetection.findings.map((finding) => finding.code);
      const missing = expectedCodes.filter((code) => !actualCodes.includes(code));
      const unexpected = actualCodes.filter((code) => !expectedCodes.includes(code));
      capabilities.push(
        capabilityOf("change_detection", [
          {
            metric: "change_detection_fidelity",
            capability: "change_detection",
            subjectId: `${run.changedetection.fromVersionId}->${run.changedetection.toVersionId}`,
            subjectLabel: `${scenario.scenarioId} repair change report`,
            value: missing.length + unexpected.length,
            unit: "count",
            signed: false,
            detail: `finding codes [${actualCodes.join(", ")}] vs expected [${expectedCodes.join(", ")}] (${missing.length} missing, ${unexpected.length} unexpected)`,
          },
        ]),
      );
    }
  }

  /* -- intervention lineage ---------------------------------------------- */
  if (scenario.intervention !== null) {
    if (run.execution?.lineage == null || run.execution.outcomeId == null) {
      capabilities.push(
        capabilityOf("intervention_lineage", [
          {
            metric: "lineage_completeness_error",
            capability: "intervention_lineage",
            subjectId: scenario.intervention.scenarioId,
            subjectLabel: `${scenario.scenarioId} issue->outcome chain`,
            value: 1,
            unit: "count",
            signed: false,
            detail: "the verified issue->outcome lineage did not resolve (run stopped earlier)",
          },
        ]),
      );
    } else {
      const lineage = run.execution.lineage;
      const complete =
        lineage.executions.length === 1 &&
        (lineage.executions[0]?.outcomes.length ?? 0) === 1 &&
        (lineage.executions[0]?.postWorkCaptureSessionIds.length ?? 0) === 2;
      capabilities.push(
        capabilityOf("intervention_lineage", [
          {
            metric: "lineage_completeness_error",
            capability: "intervention_lineage",
            subjectId: lineage.caseId,
            subjectLabel: `${scenario.scenarioId} issue->outcome chain`,
            value: complete ? 0 : 1,
            unit: "count",
            signed: false,
            detail: `lineage resolved with ${lineage.executions.length} execution(s), ${lineage.executions[0]?.outcomes.length ?? 0} outcome observation(s) and ${lineage.executions[0]?.postWorkCaptureSessionIds.length ?? 0} post-work capture session(s)`,
          },
        ]),
      );
    }
  }

  /* -- hierarchy gap notes (non-critical) ------------------------------- */
  if (run.gaps !== null) {
    const hierarchyPrefixes = ["node:project:", "node:site:", "node:building:", "node:storey:"];
    const hierarchyGaps = run.gaps.gaps.filter((gap) =>
      gap.subjectNodeId !== null &&
      hierarchyPrefixes.some((prefix) => gap.subjectNodeId!.startsWith(prefix)),
    ).length;
    capabilities.push(
      capabilityOf("intervention_lineage", [
        {
          metric: "hierarchy_unlinked_gap_count",
          capability: "intervention_lineage",
          subjectId: run.gaps.analysisId,
          subjectLabel: `${scenario.scenarioId} administrative-node coverage notes`,
          value: hierarchyGaps,
          unit: "count",
          signed: false,
          detail: `the gap analysis honestly flags ${hierarchyGaps} operator-declared administrative nodes without linked evidence (notes, never failures)`,
        },
      ]),
    );
  }

  return { scenarioId: run.scenarioId, capabilities, failures };
}

/**
 * Per-node and aggregate quantity metrics for one mapped BOQ row.
 *
 * The per-node instances GATE (critical); the aggregate instance is attached
 * to the detail of an INFORMATIONAL record — R17's exact demonstration: the
 * aggregate quantity can reconcile within tolerance while one mapped node's
 * quantity is critically wrong.
 */
function quantityMetrics(
  row: LabBoqRowTruth,
  run: LabScenarioRun,
): readonly LabMetricInstance[] {
  const instances: LabMetricInstance[] = [];
  const measurementByProperty = new Map<string, number>();
  for (const measurement of run.measurements) {
    measurementByProperty.set(`${measurement.roomLabel}:${measurement.propertyKey}`, measurement.valueM);
  }
  for (const nodeQuantity of row.nodeQuantities) {
    const nodeId = nodeQuantity.nodeId;
    const roomLabel = nodeId.split(":")[1] ?? "";
    const measured = measuredQuantityFor(row, roomLabel, measurementByProperty);
    if (measured === null) {
      instances.push({
        metric: "quantity_error",
        capability: "boq_reconciliation",
        subjectId: nodeId,
        subjectLabel: `${row.description} @ ${nodeId}`,
        value: 1,
        unit: "ratio",
        signed: false,
        detail: `no measured quantity available for ${nodeId} (the run stopped earlier or the room was not measured)`,
      });
      continue;
    }
    instances.push({
      metric: "quantity_error",
      capability: "boq_reconciliation",
      subjectId: nodeId,
      subjectLabel: `${row.description} @ ${nodeId}`,
      value: Math.abs(measured - nodeQuantity.truth) / nodeQuantity.truth,
      unit: "ratio",
      signed: false,
      detail: `measured ${measured.toFixed(4)} vs truth ${nodeQuantity.truth} (aggregate row quantity reconciles at ${aggregateDetail(row, run)}) — INFORMATIONAL aggregate NEVER gates`,
    });
  }
  return instances;
}

/** The measured quantity for one mapped node under the row's formula. */
function measuredQuantityFor(
  row: LabBoqRowTruth,
  roomLabel: string,
  measurementByProperty: ReadonlyMap<string, number>,
): number | null {
  if (row.aggregateTruth === null) {
    return null;
  }
  const width = measurementByProperty.get(`${roomLabel}:room.width`);
  const depth = measurementByProperty.get(`${roomLabel}:room.depth`);
  const height = measurementByProperty.get(`${roomLabel}:room.height`);
  if (row.formula === "sum-room-floor-area") {
    return width !== undefined && depth !== undefined ? width * depth : null;
  }
  if (row.formula === "wall-repair-area") {
    return width !== undefined && height !== undefined ? width * height : null;
  }
  return null;
}

/** The aggregate quantity error (INFORMATIONAL — never gated, R17). */
function aggregateDetail(row: LabBoqRowTruth, run: LabScenarioRun): string {
  if (row.aggregateTruth === null) {
    return "n/a";
  }
  const measurementByProperty = new Map<string, number>();
  for (const measurement of run.measurements) {
    measurementByProperty.set(`${measurement.roomLabel}:${measurement.propertyKey}`, measurement.valueM);
  }
  let measuredSum = 0;
  let measurable = false;
  for (const nodeQuantity of row.nodeQuantities) {
    const roomLabel = nodeQuantity.nodeId.split(":")[1] ?? "";
    const measured = measuredQuantityFor(row, roomLabel, measurementByProperty);
    if (measured !== null) {
      measuredSum += measured;
      measurable = true;
    }
  }
  if (!measurable) {
    return "n/a";
  }
  const aggregateError = Math.abs(measuredSum - row.aggregateTruth) / row.aggregateTruth;
  return `${(aggregateError * 100).toFixed(3)}% (measured ${measuredSum.toFixed(4)} vs truth ${row.aggregateTruth})`;
}

/* ------------------------------------------------------------------ */
/* Discrimination (R17 mutation evidence)                               */
/* ------------------------------------------------------------------ */

export const LAB_DISCRIMINATION_FAILURE_CLASSES = [
  "reconstruction_input_incompatible",
  "assurance_evidence_shortfall",
  "geometry_gate_violation",
] as const;
export type LabDiscriminationFailureClass = (typeof LAB_DISCRIMINATION_FAILURE_CLASSES)[number];

export interface LabDiscriminationCase {
  readonly caseId: string;
  readonly scenarioId: string;
  readonly degradation: string;
  readonly failureClass: LabDiscriminationFailureClass;
  readonly detected: boolean;
  readonly detail: string;
}

/**
 * Evaluate one discrimination case: a deliberately degraded run MUST be
 * detected in its failure class. The predicates read ONLY the run record and
 * the gate violations — the same evidence the report surfaces.
 */
export function evaluateDiscriminationCase(input: {
  readonly caseId: string;
  readonly scenarioId: string;
  readonly degradation: string;
  readonly failureClass: LabDiscriminationFailureClass;
  readonly run: LabScenarioRun;
  readonly violations: readonly LabGateViolation[];
}): LabDiscriminationCase {
  const { run, violations } = input;
  let detected = false;
  let detail = "";
  switch (input.failureClass) {
    case "reconstruction_input_incompatible": {
      detected =
        run.stoppedAt === "reconstruction" &&
        run.stopReason?.code === "INPUT_INCOMPATIBLE";
      detail = `run stopped at "${run.stoppedAt}" with typed code "${run.stopReason?.code}" (expected reconstruction/INPUT_INCOMPATIBLE)`;
      break;
    }
    case "assurance_evidence_shortfall": {
      const critical = run.assurance?.dimensions.find(
        (dimension) =>
          dimension.critical &&
          dimension.outcome === "not_satisfied" &&
          dimension.deficiencyCode === "evidence_count_shortfall",
      );
      detected =
        run.assurance !== null &&
        run.assurance.readiness === "NOT_READY" &&
        run.assurance.captureCompleteness === "INCOMPLETE" &&
        critical !== undefined;
      detail = `readiness "${run.assurance?.readiness ?? "n/a"}", completeness "${run.assurance?.captureCompleteness ?? "n/a"}", critical shortfall dimension: ${critical?.dimensionId ?? "none"} (walk completed: ${run.capture?.walkCompleted ?? "n/a"})`;
      break;
    }
    case "geometry_gate_violation": {
      const geometryMetrics: readonly LabMetricName[] = [
        "dimension_error",
        "registration_error",
        "quantity_error",
      ];
      const criticalTripped = violations.filter(
        (violation) => violation.critical && geometryMetrics.includes(violation.metric),
      );
      detected = criticalTripped.length > 0;
      detail = `${criticalTripped.length} critical geometry/quantity gate violation(s): ${criticalTripped
        .map((violation) => `${violation.metric}@${violation.subjectId}=${violation.value.toFixed(6)}`)
        .join("; ")}`;
      break;
    }
  }
  return {
    caseId: input.caseId,
    scenarioId: input.scenarioId,
    degradation: input.degradation,
    failureClass: input.failureClass,
    detected,
    detail,
  };
}

/**
 * THE R17 AGGREGATE-HIDING CHECK: given a degraded run's metrics, the
 * per-instance gate evaluation MUST flag the critical regression even when
 * every INFORMATIONAL aggregate sits under its threshold. Returns the proof
 * record (asserted in tests).
 */
export function aggregateHidingProof(metrics: LabRunMetrics): {
  readonly criticalViolations: readonly LabGateViolation[];
  readonly aggregateDimensionError: number | null;
  readonly aggregateQuantityError: number | null;
  readonly hiddenByAggregates: boolean;
} {
  const violations = evaluateLabGates(metrics);
  const criticalViolations = violations.filter((violation) => violation.critical);
  const reconstruction = metrics.capabilities.find((c) => c.capability === "reconstruction");
  const boq = metrics.capabilities.find((c) => c.capability === "boq_reconciliation");
  const aggregateDimensionError = reconstruction?.aggregates["dimension_error"] ?? null;
  const aggregateQuantityError = boq?.aggregates["quantity_error"] ?? null;
  const dimensionGate = labGateFor("dimension_error").threshold;
  const quantityGate = labGateFor("quantity_error").threshold;
  const aggregatesPass =
    (aggregateDimensionError === null || aggregateDimensionError <= dimensionGate) &&
    (aggregateQuantityError === null || aggregateQuantityError <= quantityGate);
  return {
    criticalViolations,
    aggregateDimensionError,
    aggregateQuantityError,
    hiddenByAggregates: aggregatesPass && criticalViolations.length > 0,
  };
}

/** Convenience re-export for tests computing metrics from a scenario. */
export { elementNodeId };
