/**
 * AISE-035 — Physical Reality Lab dogfood report.
 *
 * HONEST REPORTING (the work order's loud rule): the report lists
 * per-scenario, per-capability outcomes with the underlying record ids;
 * UNKNOWN/NOT_OBSERVED/OCCLUDED propagate honestly; no capability's failure
 * is silently swallowed; a scenario that cannot complete reports WHERE it
 * stopped and why (typed). Capture completeness appears ONLY as the
 * assurance engine's verdict implication — never as "the walk finished".
 *
 * R17 RULE (exact): FAIL iff ANY critical gate violation or capability
 * failure on a BASELINE run, or any discrimination case that went
 * UNDETECTED (a mutation the gates cannot see is itself a critical defect);
 * PASS_WITH_NOTES iff non-critical violations only; PASS otherwise.
 * Aggregate metrics are informational and NEVER gate.
 *
 * LOUD HONESTY: every fixture in this report is simulated-with-documented-
 * ground-truth (`lab-simulated-capture-v1`); physical capture hardware does
 * not exist in this sandbox and is never implied.
 *
 * Determinism: the report is a pure function of the runs; the ONLY
 * nondeterministic field is `generatedAt` (injected clock), excluded from
 * the reproducibility digest.
 */

import { canonicalJsonStringify } from "@aise/shared-contracts";
import { sha256Hex } from "../lib/hash";
import type { LabDegradations, LabScenarioRun } from "./runner";
import { runScenario } from "./runner";
import { LAB_SCENARIOS, scenarioById } from "./scenarios";
import type { LabScenario } from "./scenarios";
import {
  aggregateHidingProof,
  computeRunMetrics,
  evaluateDiscriminationCase,
  evaluateLabGates,
  LAB_GATE_THRESHOLD_VERSION,
  type LabCapabilityId,
  type LabDiscriminationCase,
  type LabGateViolation,
  type LabRunMetrics,
} from "./metrics";
import { LAB_CLOCK, LAB_DEVICE_PROVENANCE, constantClock } from "./testkit";

/* ------------------------------------------------------------------ */
/* Report model                                                         */
/* ------------------------------------------------------------------ */

export const LAB_REPORT_SCHEMA_VERSION = "lab-dogfood-report/1" as const;
export const LAB_FIXTURE_PROVENANCE = "lab-simulated-capture-v1" as const;

export interface LabScenarioReportRow {
  readonly scenarioId: string;
  readonly kind: "baseline" | "discrimination";
  readonly degradations: LabDegradations;
  readonly hops: readonly {
    readonly hopId: string;
    readonly outcome: string;
    readonly recordIds: readonly string[];
    readonly detail: string | null;
  }[];
  readonly capabilities: readonly {
    readonly capability: LabCapabilityId;
    readonly metricInstanceCount: number;
    readonly violationCount: number;
    readonly criticalViolationCount: number;
    readonly failureCode: string | null;
  }[];
  readonly recordIds: {
    readonly missionId: string | null;
    readonly sessionId: string | null;
    readonly reconstructionJobIds: readonly string[];
    readonly realityVersionIds: readonly string[];
    readonly boqImportId: string | null;
    readonly mappingId: string | null;
    readonly caseId: string | null;
    readonly interventionScenarioId: string | null;
    readonly executionRecordId: string | null;
    readonly outcomeId: string | null;
  };
  readonly captureCompleteness: {
    readonly status: "COMPLETE" | "INCOMPLETE";
    readonly readiness: string;
    readonly basis: string;
    readonly gaps: readonly {
      readonly dimensionId: string;
      readonly critical: boolean;
      readonly deficiencyCode: string | null;
    }[];
  };
  readonly stoppedAt: string | null;
  readonly stopReason: { readonly code: string; readonly detail: string } | null;
}

export interface LabNotObservedRow {
  readonly scenarioId: string;
  readonly subjectId: string;
  readonly status: "OCCLUDED" | "NOT_OBSERVED" | "UNKNOWN";
  readonly detail: string;
}

export interface LabDogfoodReport {
  readonly schemaVersion: typeof LAB_REPORT_SCHEMA_VERSION;
  readonly fixtureProvenance: typeof LAB_FIXTURE_PROVENANCE;
  /** Injected-clock timestamp — the ONLY nondeterministic field. */
  readonly generatedAt: string;
  readonly gateThresholdVersion: string;
  readonly baselineRuns: readonly LabScenarioReportRow[];
  readonly discriminationRuns: readonly LabScenarioReportRow[];
  readonly discrimination: readonly LabDiscriminationCase[];
  readonly overall: "PASS" | "PASS_WITH_NOTES" | "FAIL";
  readonly criticalViolations: readonly LabGateViolation[];
  readonly nonCriticalViolations: readonly LabGateViolation[];
  readonly capabilityFailures: readonly {
    readonly scenarioId: string;
    readonly capability: LabCapabilityId;
    readonly code: string;
    readonly detail: string;
  }[];
  readonly notObserved: readonly LabNotObservedRow[];
  readonly aggregateHiding: {
    readonly caseId: string;
    readonly aggregateDimensionError: number | null;
    readonly aggregateQuantityError: number | null;
    readonly criticalViolationCount: number;
    readonly hiddenByAggregates: boolean;
  } | null;
  /** sha256 over canonical report JSON with timestamp+digest stripped. */
  readonly reproducibilityDigest: string;
}

/* ------------------------------------------------------------------ */
/* Discrimination case definitions (the deliberate degradation matrix)   */
/* ------------------------------------------------------------------ */

export interface LabDiscriminationSpec {
  readonly caseId: string;
  readonly scenarioId: string;
  readonly degradations: LabDegradations;
  readonly degradationLabel: string;
  readonly failureClass: "reconstruction_input_incompatible" | "assurance_evidence_shortfall" | "geometry_gate_violation";
}

/**
 * The shipped discrimination matrix: one corrupted capture input, one
 * dropped evidence record, one injected geometry error — each MUST be
 * detected in its failure class; aggregate scoring may never hide any.
 */
export const LAB_DISCRIMINATION_SPECS: readonly LabDiscriminationSpec[] = [
  {
    caseId: "discrimination-corrupted-capture",
    scenarioId: "lab-room-104-defect",
    degradations: { corruptedCaptureAssetId: "depth:surface:room-104:ceiling" },
    degradationLabel: "the ceiling depth frame's bytes are not valid depth-map exchange v1",
    failureClass: "reconstruction_input_incompatible",
  },
  {
    caseId: "discrimination-dropped-evidence",
    scenarioId: "lab-room-104-defect",
    degradations: { droppedEvidenceAssetId: "photo:room-104:crack-2" },
    degradationLabel:
      "one VISUAL_RECONSTRUCTION photo's evidence record is lost after a completed walk (3 required, 2 registered)",
    failureClass: "assurance_evidence_shortfall",
  },
  {
    caseId: "discrimination-injected-geometry",
    scenarioId: "lab-floor-gf-boq",
    degradations: {
      injectedGeometryError: { assetId: "depth:surface:room-b:wall-west", offsetM: 0.15 },
    },
    degradationLabel:
      "room-b's west-wall depth frame is displaced 0.15 m along its normal (a mis-registered capture frame)",
    failureClass: "geometry_gate_violation",
  },
];

/* ------------------------------------------------------------------ */
/* Report assembly                                                      */
/* ------------------------------------------------------------------ */

export interface RunDogfoodOptions {
  /** Injected clock — report timestamp ONLY (never metric math). */
  readonly now?: () => string;
  /** Restrict the dogfood to a subset of baseline scenarios (tests). */
  readonly baselineScenarioIds?: readonly string[];
  /**
   * TEST SEAM: apply degradations to BASELINE runs — used by the R17 tests
   * to prove a critical regression on a baseline fails the overall report
   * even when most metric instances pass. Production dogfood runs never set
   * this (baselines are clean by definition).
   */
  readonly baselineDegradationsByScenarioId?: Readonly<Record<string, LabDegradations>>;
  readonly discriminationSpecs?: readonly LabDiscriminationSpec[];
}

interface RunBundle {
  readonly scenario: LabScenario;
  readonly run: LabScenarioRun;
  readonly metrics: LabRunMetrics;
  readonly violations: readonly LabGateViolation[];
}

function rowOf(bundle: RunBundle, kind: "baseline" | "discrimination"): LabScenarioReportRow {
  const { run, metrics, violations } = bundle;
  const violationCountFor = (capability: LabCapabilityId): { total: number; critical: number } => {
    const mine = violations.filter((violation) => violation.capability === capability);
    return { total: mine.length, critical: mine.filter((v) => v.critical).length };
  };
  const completeness = completenessOf(run);
  return {
    scenarioId: run.scenarioId,
    kind,
    degradations: run.degradations,
    hops: run.hops.map((hop) => ({
      hopId: hop.hopId,
      outcome: hop.outcome,
      recordIds: hop.recordIds,
      detail: hop.detail,
    })),
    capabilities: metrics.capabilities.map((capability) => {
      const counts = violationCountFor(capability.capability);
      return {
        capability: capability.capability,
        metricInstanceCount: capability.instances.length,
        violationCount: counts.total,
        criticalViolationCount: counts.critical,
        failureCode: capability.failure?.code ?? null,
      };
    }),
    recordIds: {
      missionId: run.mission?.missionId ?? null,
      sessionId: run.capture?.sessionId ?? null,
      reconstructionJobIds: run.reconstruction?.jobs.map((job) => job.jobId) ?? [],
      realityVersionIds: run.reality?.versionIds ?? [],
      boqImportId: run.boq?.importId ?? null,
      mappingId: run.boq?.mappingId ?? null,
      caseId: run.caseRecord?.caseId ?? null,
      interventionScenarioId: run.intervention?.scenarioId ?? null,
      executionRecordId: run.execution?.executionRecordId ?? null,
      outcomeId: run.execution?.outcomeId ?? null,
    },
    captureCompleteness: completeness,
    stoppedAt: run.stoppedAt,
    stopReason: run.stopReason,
  };
}

/**
 * Capture completeness — THE ASSURANCE ENGINE'S CALL ONLY. A stopped run is
 * INCOMPLETE with the typed stop reason as its basis (the budget could not
 * even be evaluated); an evaluated run is COMPLETE iff the readiness verdict
 * is READY or READY_WITH_NOTES, carrying the engine's typed gaps otherwise.
 */
function completenessOf(run: LabScenarioRun): LabScenarioReportRow["captureCompleteness"] {
  if (run.assurance === null) {
    return {
      status: "INCOMPLETE",
      readiness: "UNEVALUATED",
      basis: `the assurance budget was never evaluated: the run stopped at "${run.stoppedAt ?? "unknown"}" (${run.stopReason?.code ?? "unknown"})`,
      gaps: [
        {
          dimensionId: "pipeline-stop",
          critical: true,
          deficiencyCode: run.stopReason?.code ?? "RUN_STOPPED",
        },
      ],
    };
  }
  return {
    status: run.assurance.captureCompleteness,
    readiness: run.assurance.readiness,
    basis:
      run.assurance.captureCompleteness === "COMPLETE"
        ? "the assurance engine's readiness verdict satisfies the declared task's evidence/uncertainty budget"
        : "the assurance engine's verdict does NOT satisfy the declared budget — INCOMPLETE regardless of the completed walk",
    gaps: run.assurance.dimensions
      .filter((dimension) => dimension.outcome !== "satisfied")
      .map((dimension) => ({
        dimensionId: dimension.dimensionId,
        critical: dimension.critical,
        deficiencyCode: dimension.deficiencyCode,
      })),
  };
}

/**
 * Run the full dogfood: every baseline scenario end-to-end, the
 * discrimination matrix, per-capability golden metrics + gates, and the
 * honest report. Deterministic: identical options → byte-identical digest.
 */
export async function runDogfoodReport(
  options: RunDogfoodOptions = {},
): Promise<LabDogfoodReport> {
  const now = options.now ?? constantClock(LAB_CLOCK.report);
  const baselineIds =
    options.baselineScenarioIds ?? LAB_SCENARIOS.map((scenario) => scenario.scenarioId);
  const specs = options.discriminationSpecs ?? LAB_DISCRIMINATION_SPECS;

  const baselineBundles: RunBundle[] = [];
  for (const scenarioId of baselineIds) {
    const scenario = scenarioById(scenarioId);
    const degradations = options.baselineDegradationsByScenarioId?.[scenarioId];
    const { run } = await runScenario(scenario, degradations === undefined ? {} : { degradations });
    const metrics = computeRunMetrics(scenario, run);
    baselineBundles.push({
      scenario,
      run,
      metrics,
      violations: evaluateLabGates(metrics),
    });
  }

  const discriminationBundles: RunBundle[] = [];
  const discriminationCases: LabDiscriminationCase[] = [];
  for (const spec of specs) {
    const scenario = scenarioById(spec.scenarioId);
    const { run } = await runScenario(scenario, { degradations: spec.degradations });
    const metrics = computeRunMetrics(scenario, run);
    const violations = evaluateLabGates(metrics);
    discriminationBundles.push({ scenario, run, metrics, violations });
    discriminationCases.push(
      evaluateDiscriminationCase({
        caseId: spec.caseId,
        scenarioId: spec.scenarioId,
        degradation: spec.degradationLabel,
        failureClass: spec.failureClass,
        run,
        violations,
      }),
    );
  }

  // R17: only BASELINE violations fail the dogfood; discrimination runs are
  // EXPECTED to trip (that is the detection being proven) — but a case that
  // went UNDETECTED is itself a critical defect of the gate system.
  const criticalViolations = baselineBundles.flatMap((bundle) =>
    bundle.violations.filter((violation) => violation.critical),
  );
  const nonCriticalViolations = baselineBundles.flatMap((bundle) =>
    bundle.violations.filter((violation) => !violation.critical),
  );
  const capabilityFailures = baselineBundles.flatMap((bundle) =>
    bundle.metrics.failures.map((failure) => ({
      scenarioId: bundle.run.scenarioId,
      ...failure,
    })),
  );
  const undetected = discriminationCases.filter((caseEntry) => !caseEntry.detected);

  const overall: LabDogfoodReport["overall"] =
    criticalViolations.length > 0 || capabilityFailures.length > 0 || undetected.length > 0
      ? "FAIL"
      : nonCriticalViolations.length > 0
        ? "PASS_WITH_NOTES"
        : "PASS";

  // The aggregate-hiding proof over the injected-geometry case: the
  // informational aggregates sit under their thresholds while the critical
  // per-instance violations trip (R17's exact demonstration).
  const geometryCase = discriminationCases.find(
    (caseEntry) => caseEntry.failureClass === "geometry_gate_violation",
  );
  const geometryBundle = discriminationBundles[discriminationCases.indexOf(geometryCase ?? discriminationCases[0]!)] ?? discriminationBundles[0]!;
  const hiding = geometryBundle === undefined ? null : aggregateHidingProof(geometryBundle.metrics);
  const aggregateHiding =
    hiding !== null && geometryCase !== undefined
      ? {
          caseId: geometryCase.caseId,
          aggregateDimensionError: hiding.aggregateDimensionError,
          aggregateQuantityError: hiding.aggregateQuantityError,
          criticalViolationCount: hiding.criticalViolations.length,
          hiddenByAggregates: hiding.hiddenByAggregates,
        }
      : null;

  const notObserved: LabNotObservedRow[] = baselineBundles.flatMap((bundle) =>
    bundle.run.notObserved.map((entry) => ({
      scenarioId: bundle.run.scenarioId,
      subjectId: entry.subjectId,
      status: entry.status,
      detail: entry.detail,
    })),
  );

  const digestible = {
    schemaVersion: LAB_REPORT_SCHEMA_VERSION,
    fixtureProvenance: LAB_FIXTURE_PROVENANCE,
    gateThresholdVersion: LAB_GATE_THRESHOLD_VERSION,
    baselineRuns: baselineBundles.map((bundle) => rowOf(bundle, "baseline")),
    discriminationRuns: discriminationBundles.map((bundle) => rowOf(bundle, "discrimination")),
    discrimination: discriminationCases,
    overall,
    criticalViolations,
    nonCriticalViolations,
    capabilityFailures,
    notObserved,
    aggregateHiding,
    deviceProvenance: LAB_DEVICE_PROVENANCE,
  };
  return {
    ...digestible,
    generatedAt: now(),
    reproducibilityDigest: sha256Hex(canonicalJsonStringify(digestible)),
  };
}

/** The digest preimage: the report minus timestamp and digest (explicit copy). */
export function stripForDigest(
  report: LabDogfoodReport,
): Omit<LabDogfoodReport, "generatedAt" | "reproducibilityDigest"> {
  return {
    schemaVersion: report.schemaVersion,
    fixtureProvenance: report.fixtureProvenance,
    gateThresholdVersion: report.gateThresholdVersion,
    baselineRuns: report.baselineRuns,
    discriminationRuns: report.discriminationRuns,
    discrimination: report.discrimination,
    overall: report.overall,
    criticalViolations: report.criticalViolations,
    nonCriticalViolations: report.nonCriticalViolations,
    capabilityFailures: report.capabilityFailures,
    notObserved: report.notObserved,
    aggregateHiding: report.aggregateHiding,
  };
}

/** sha256 of the canonical report JSON with timestamp+digest stripped. */
export function digestOf(report: LabDogfoodReport): string {
  return sha256Hex(canonicalJsonStringify(stripForDigest(report)));
}

/** Assert two reports are reproducible (digest + canonical structure). */
export function assertReproducible(
  reportA: LabDogfoodReport,
  reportB: LabDogfoodReport,
): { readonly reproducible: boolean; readonly digestA: string; readonly digestB: string } {
  const digestA = digestOf(reportA);
  const digestB = digestOf(reportB);
  return {
    reproducible:
      digestA === digestB &&
      canonicalJsonStringify(stripForDigest(reportA)) ===
        canonicalJsonStringify(stripForDigest(reportB)),
    digestA,
    digestB,
  };
}
