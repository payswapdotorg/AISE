/**
 * The task-specific model-readiness assessment (AISE-013 core).
 *
 * Turns five inputs into ONE readiness verdict:
 *
 * - **geometry/measurement uncertainty** — the metrological
 *   records the model's assertions carry (AISE-009 vocabulary,
 *   ingested through AISE-011);
 * - **evidence coverage** — live support per assertion subject
 *   (the AISE-012 `assertionSupport` completeness view);
 * - **epistemic state** — OBSERVED/INFERRED/CONFIRMED/PROPOSED
 *   composition (preserved, never rewritten);
 * - **task intent** — the declared task/assurance profile
 *   (architecture-lock §3 binding);
 * - **verification evidence** — the AC-062/AC-063 validity
 *   projection (`computeVersionValidity`, the single
 *   implementation of the binding rule).
 *
 * Hard disciplines, each proven by tests:
 *
 * 1. **Confidence never substitutes uncertainty** (AC-070/071,
 *    lock §3): the confidence summary is REPORTING-ONLY. No
 *    dimension reads `confidence`; no verdict changes when
 *    confidence values change (mutation-tested).
 * 2. **No epistemic upgrades, no rewrites** (lock §2): the
 *    assessment is a pure read view over frozen inputs. The
 *    graph digest and mapping digest are bit-identical before
 *    and after (tested).
 * 3. **No second authority** (lock §1): the report is derived
 *    data, never stored into the Reality Graph or the evidence
 *    mapping.
 * 4. **Fail-closed computation** (lock §3): invalid graphs,
 *    invalid mappings, and invalid profiles throw — a readiness
 *    verdict is never produced over inputs the boundary cannot
 *    verify.
 * 5. **Determinism**: the report is a pure function of its
 *    inputs — canonical orderings everywhere, no timestamps, no
 *    ambient state. Identical inputs yield bit-identical reports
 *    and digests.
 *
 * The report deliberately carries a BINARY verdict
 * (READY/NOT_READY) with per-dimension results and findings:
 * "conditional" grading is policy, owned downstream (AISE-020
 * task/assurance engine), not invented here.
 */
import {
  assertionSupport,
  assertValidEpistemicState,
  canonicalContentHash,
  computeVersionValidity,
  deepFreeze,
  deriveWeakestState,
  EPISTEMIC_STATES,
  liveLinks,
  subjectKey,
  unitFamily,
  validateEvidenceGraph,
  validateRealityGraph,
  type AssertionSupport,
  type EpistemicState,
  type EvidenceGraph,
  type EvidenceSubject,
  type ModelUncertainty,
  type ModelUnit,
  type RealityModelGraph,
} from "@aise/engineering-model";
import type { AssuranceProfile, CaptureIntent } from "@aise/shared-contracts";
import {
  budgetForFamily,
  requirementsFor,
  standardEquivalent,
  READINESS_DIMENSIONS,
  type ReadinessDimension,
  type TaskProfileRecord,
  type UncertaintyBudget,
} from "./profile.js";
import { toSiValue } from "./units.js";

/** The overall, task-specific readiness verdict. */
export type ReadinessVerdict = "READY" | "NOT_READY";

/** Per-dimension verdict. `FAIL` only exists on required dimensions. */
export type DimensionVerdict = "PASS" | "FAIL" | "REPORTED" | "NOT_APPLICABLE";

/** Finding codes (stable, machine-readable). */
export type ReadinessFindingCode =
  | "EMPTY_MODEL"
  | "NO_EVIDENCE_MAPPING"
  | "UNCOVERED_CONFIRMED_ASSERTION"
  | "UNCOVERED_ASSERTIONS"
  | "MEASUREMENT_WITHOUT_UNCERTAINTY"
  | "NO_MEASUREMENTS"
  | "INVALIDATED_CONFIRMATION"
  | "PROPOSED_CONTENT"
  | "NO_ACCURACY_BUDGET"
  | "BUDGET_EXCEEDED"
  | "BUDGET_UNEVALUABLE";

/** One finding's dimension. */
export type { ReadinessDimension };

/** One reviewable readiness finding. */
export interface ReadinessFinding {
  readonly code: ReadinessFindingCode;
  readonly dimension: ReadinessDimension;
  readonly subjectDescription?: string;
  readonly detail: string;
}

/** Input of the pure readiness computation. */
export interface ReadinessInput {
  readonly graph: RealityModelGraph;
  /** The committed version the graph belongs to. */
  readonly version: number;
  /** The project's current evidence mapping (assembled snapshot). */
  readonly mapping: EvidenceGraph;
  /** Whether a mapping actually exists (false → NO_EVIDENCE_MAPPING finding). */
  readonly mappingPresent: boolean;
  /** The declared task profile the assessment is bound to. */
  readonly profile: TaskProfileRecord;
}

// --- dimension results ------------------------------------------------------

export interface ModelIntegrityResult {
  readonly dimension: "model-integrity";
  readonly required: boolean;
  readonly verdict: DimensionVerdict;
  readonly objectCount: number;
  readonly spaceCount: number;
  readonly assertionCount: number;
  readonly findings: readonly ReadinessFinding[];
}

export interface EvidenceCoverageResult {
  readonly dimension: "evidence-coverage";
  readonly required: boolean;
  readonly verdict: DimensionVerdict;
  readonly assertionCount: number;
  readonly assertionsWithSupport: number;
  readonly coverageRatio: number;
  readonly uncoveredConfirmedCount: number;
  readonly findings: readonly ReadinessFinding[];
}

export interface MeasurementUncertaintyResult {
  readonly dimension: "measurement-uncertainty";
  readonly required: boolean;
  readonly verdict: DimensionVerdict;
  readonly measurementCount: number;
  readonly measurementsWithUncertainty: number;
  readonly findings: readonly ReadinessFinding[];
}

export interface ConfirmedValidityResult {
  readonly dimension: "confirmed-validity";
  readonly required: boolean;
  readonly verdict: DimensionVerdict;
  readonly confirmedCount: number;
  readonly validCount: number;
  readonly invalidatedCount: number;
  readonly findings: readonly ReadinessFinding[];
}

export interface EpistemicCompositionResult {
  readonly dimension: "epistemic-composition";
  readonly required: boolean;
  readonly verdict: DimensionVerdict;
  readonly proposedObjectCount: number;
  readonly proposedAssertionCount: number;
  readonly objectsByState: Readonly<Record<EpistemicState, number>>;
  readonly assertionsByState: Readonly<Record<EpistemicState, number>>;
  readonly weakestAssertionState: EpistemicState;
  readonly findings: readonly ReadinessFinding[];
}

export interface BudgetEvaluationEntry {
  readonly subjectDescription: string;
  /** The stated uncertainty kind. */
  readonly uncertaintyKind: ModelUncertainty["kind"];
  /** Standard-equivalent uncertainty in the family's SI base unit. */
  readonly siValue: number;
  readonly siUnit: "meter" | "square_meter" | "radian";
  readonly bound: number;
  readonly exceeded: boolean;
}

export interface UncertaintyBudgetResult {
  readonly dimension: "uncertainty-budget";
  readonly required: boolean;
  readonly verdict: DimensionVerdict;
  readonly budget?: UncertaintyBudget;
  readonly evaluatedCount: number;
  readonly exceededCount: number;
  readonly unevaluableCount: number;
  readonly evaluations: readonly BudgetEvaluationEntry[];
  readonly findings: readonly ReadinessFinding[];
}

export type DimensionResult =
  | ModelIntegrityResult
  | EvidenceCoverageResult
  | MeasurementUncertaintyResult
  | ConfirmedValidityResult
  | EpistemicCompositionResult
  | UncertaintyBudgetResult;

// --- summaries ---------------------------------------------------------------

/** Assertion totals (the honest counts behind every dimension). */
export interface AssertionTotals {
  readonly assertions: number;
  readonly withSupport: number;
  readonly confirmed: number;
  readonly confirmedValid: number;
  readonly confirmedInvalidated: number;
  readonly measurements: number;
  readonly measurementsWithUncertainty: number;
  readonly proposedAssertions: number;
  readonly proposedObjects: number;
  readonly confidenceBearing: number;
}

/** REPORTING-ONLY confidence view (never gates any verdict). */
export interface ConfidenceSummary {
  readonly assertionsWithConfidence: number;
  readonly minConfidence?: number;
  readonly meanConfidence?: number;
}

/** Epistemic composition (passthrough counts — never rewritten). */
export interface EpistemicSummary {
  readonly objectsByState: Readonly<Record<EpistemicState, number>>;
  readonly assertionsByState: Readonly<Record<EpistemicState, number>>;
  readonly proposedObjectCount: number;
  readonly proposedAssertionCount: number;
  readonly weakestAssertionState: EpistemicState;
}

/** The task-specific readiness report of one model version. */
export interface ReadinessReport {
  readonly taskId: string;
  readonly intent: CaptureIntent;
  readonly assuranceProfile: AssuranceProfile;
  readonly profileDigest: string;
  readonly modelId: string;
  readonly version: number;
  readonly graphDigest: string;
  readonly mappingDigest: string;
  readonly verdict: ReadinessVerdict;
  /** Required dimensions that failed (why NOT_READY). */
  readonly blockingDimensions: readonly ReadinessDimension[];
  /** Every dimension result, canonical order. */
  readonly dimensions: readonly DimensionResult[];
  readonly assertionTotals: AssertionTotals;
  readonly epistemicSummary: EpistemicSummary;
  readonly confidenceSummary: ConfidenceSummary;
}

// --- inventory ----------------------------------------------------------------

/** One assertion joined across the evidence view and the graph. */
interface InventoryEntry {
  readonly support: AssertionSupport;
  readonly quantity?: {
    readonly value: number;
    readonly unit: ModelUnit;
    readonly uncertainty?: ModelUncertainty;
  };
  readonly measurementKind?: "measurement" | "estimate";
  readonly confidence?: number;
}

// --- computation ---------------------------------------------------------------

/**
 * Computes the task-specific readiness report. Pure: validates
 * every input at the boundary (fail-closed), reads nothing
 * ambient, mutates nothing, and orders everything canonically.
 */
export function computeReadiness(input: ReadinessInput): ReadinessReport {
  // Boundary: the inputs are re-validated — a readiness verdict
  // is never computed over a graph or mapping the model layer
  // would reject (tampered, thawed, or malformed).
  validateRealityGraph(input.graph);
  validateEvidenceGraph(input.mapping);

  const support = assertionSupport(input.graph, input.version, input.mapping);
  const validity = computeVersionValidity(input.graph, input.version, input.mapping);
  const inventory = joinInventory(input.graph, input.version, support);
  const profile = input.profile;

  const dimensions: DimensionResult[] = [
    evaluateModelIntegrity(input.graph, inventory, profile),
    evaluateEvidenceCoverage(input.mapping, input.mappingPresent, support, profile),
    evaluateMeasurementUncertainty(inventory, profile),
    evaluateConfirmedValidity(validity, profile),
    evaluateEpistemicComposition(input.graph, support, profile),
    evaluateUncertaintyBudget(inventory, profile),
  ];

  const blocking = dimensions.filter((dimension) => dimension.verdict === "FAIL").map((dimension) => dimension.dimension);

  const stateCounts = countStates(input.graph, support);
  const confidence = confidenceSummary(inventory);

  return deepFreeze({
    taskId: profile.taskId,
    intent: profile.intent,
    assuranceProfile: profile.profile,
    profileDigest: profile.digest,
    modelId: input.graph.modelId,
    version: input.version,
    graphDigest: input.graph.digest,
    mappingDigest: input.mapping.digest,
    verdict: blocking.length === 0 ? "READY" : "NOT_READY",
    blockingDimensions: Object.freeze([...blocking]),
    dimensions: Object.freeze(dimensions),
    assertionTotals: {
      assertions: support.length,
      withSupport: support.filter((entry) => entry.liveSupportingEvidence.length > 0).length,
      confirmed: validity.confirmedAssertionCount,
      confirmedValid: validity.validCount,
      confirmedInvalidated: validity.invalidatedCount,
      measurements: inventory.filter((entry) => entry.measurementKind === "measurement").length,
      measurementsWithUncertainty: inventory.filter(
        (entry) => entry.measurementKind === "measurement" && entry.quantity?.uncertainty !== undefined,
      ).length,
      proposedAssertions: support.filter((entry) => entry.status === "PROPOSED").length,
      proposedObjects: input.graph.objects.filter((object) => object.epistemicState === "PROPOSED").length,
      confidenceBearing: confidence.assertionsWithConfidence,
    },
    epistemicSummary: stateCounts,
    confidenceSummary: confidence,
  });
}

/** The canonical digest of a report (the record pins it; the report carries it not). */
export function readinessReportDigest(report: ReadinessReport): string {
  return canonicalContentHash(report);
}

// --- evaluators -----------------------------------------------------------------

function evaluateModelIntegrity(
  graph: RealityModelGraph,
  inventory: readonly InventoryEntry[],
  profile: TaskProfileRecord,
): ModelIntegrityResult {
  const requirement = requirementsFor(profile.profile, "model-integrity");
  const findings: ReadinessFinding[] = [];
  const nonEmpty = graph.objects.length + graph.spaces.length > 0;
  if (!nonEmpty) {
    findings.push({
      code: "EMPTY_MODEL",
      dimension: "model-integrity",
      detail: "the committed version contains no spaces and no objects — nothing to ready",
    });
  }
  // model-integrity is required at EVERY profile (the fixed
  // table); an empty model is never ready for any purpose.
  return freezeResult({
    dimension: "model-integrity",
    required: requirement.required,
    verdict: nonEmpty ? "PASS" : "FAIL",
    objectCount: graph.objects.length,
    spaceCount: graph.spaces.length,
    assertionCount: inventory.length,
    findings: sortFindings(findings),
  });
}

function evaluateEvidenceCoverage(
  mapping: EvidenceGraph,
  mappingPresent: boolean,
  support: readonly AssertionSupport[],
  profile: TaskProfileRecord,
): EvidenceCoverageResult {
  const requirement = requirementsFor(profile.profile, "evidence-coverage");
  const total = support.length;
  const covered = support.filter((entry) => entry.liveSupportingEvidence.length > 0);
  const ratio = total > 0 ? covered.length / total : 0;
  const uncovered = support.filter((entry) => entry.liveSupportingEvidence.length === 0);
  const uncoveredConfirmed = uncovered.filter((entry) => entry.status === "CONFIRMED");

  const findings: ReadinessFinding[] = [];
  if (!mappingPresent) {
    findings.push({
      code: "NO_EVIDENCE_MAPPING",
      dimension: "evidence-coverage",
      detail: "no evidence mapping exists for the project — coverage is zero by absence, not by rejection",
    });
  } else if (liveLinks(mapping).length === 0) {
    findings.push({
      code: "NO_EVIDENCE_MAPPING",
      dimension: "evidence-coverage",
      detail: "the evidence mapping exists but carries no live links",
    });
  }
  for (const entry of uncoveredConfirmed) {
    findings.push({
      code: "UNCOVERED_CONFIRMED_ASSERTION",
      dimension: "evidence-coverage",
      subjectDescription: entry.description,
      detail: `CONFIRMED assertion has no live supporting evidence (cited: ${
        entry.citedEvidenceRefs.length > 0 ? entry.citedEvidenceRefs.join(", ") : "none"
      })`,
    });
  }
  if (uncovered.length - uncoveredConfirmed.length > 0) {
    findings.push({
      code: "UNCOVERED_ASSERTIONS",
      dimension: "evidence-coverage",
      detail: `${uncovered.length - uncoveredConfirmed.length} non-confirmed assertions lack live supporting evidence (reported in aggregate; confirmed assertions are listed individually)`,
    });
  }

  const passes = requirement.minCoverageRatio === undefined || ratio >= requirement.minCoverageRatio;
  return freezeResult({
    dimension: "evidence-coverage",
    required: requirement.required,
    verdict: requirement.required ? (passes ? "PASS" : "FAIL") : "REPORTED",
    assertionCount: total,
    assertionsWithSupport: covered.length,
    coverageRatio: ratio,
    uncoveredConfirmedCount: uncoveredConfirmed.length,
    findings: sortFindings(findings),
  });
}

function evaluateMeasurementUncertainty(
  inventory: readonly InventoryEntry[],
  profile: TaskProfileRecord,
): MeasurementUncertaintyResult {
  const requirement = requirementsFor(profile.profile, "measurement-uncertainty");
  const measurements = inventory.filter((entry) => entry.measurementKind === "measurement");
  const withUncertainty = measurements.filter((entry) => entry.quantity?.uncertainty !== undefined);

  const findings: ReadinessFinding[] = [];
  for (const entry of measurements) {
    if (entry.quantity?.uncertainty === undefined) {
      findings.push({
        code: "MEASUREMENT_WITHOUT_UNCERTAINTY",
        dimension: "measurement-uncertainty",
        subjectDescription: entry.support.description,
        detail: `measurement (${entry.quantity?.value ?? "?"} ${entry.quantity?.unit ?? "?"}) carries no uncertainty record — AC-071 "where available" is unmet for a directly-supported value`,
      });
    }
  }
  if (measurements.length === 0) {
    findings.push({
      code: "NO_MEASUREMENTS",
      dimension: "measurement-uncertainty",
      detail: "the version contains no measurement-kind assertions — no directly-supported value exists to anchor task accuracy",
    });
  }

  let passes = true;
  if (requirement.uncertaintyOnAllMeasurements) {
    passes = withUncertainty.length === measurements.length;
  }
  if (requirement.requireAtLeastOneMeasurement) {
    passes = passes && measurements.length > 0;
  }
  return freezeResult({
    dimension: "measurement-uncertainty",
    required: requirement.required,
    verdict: requirement.required ? (passes ? "PASS" : "FAIL") : "REPORTED",
    measurementCount: measurements.length,
    measurementsWithUncertainty: withUncertainty.length,
    findings: sortFindings(findings),
  });
}

function evaluateConfirmedValidity(
  validity: ReturnType<typeof computeVersionValidity>,
  profile: TaskProfileRecord,
): ConfirmedValidityResult {
  const requirement = requirementsFor(profile.profile, "confirmed-validity");
  const findings: ReadinessFinding[] = [];
  for (const entry of validity.entries) {
    if (!entry.valid) {
      findings.push({
        code: "INVALIDATED_CONFIRMATION",
        dimension: "confirmed-validity",
        subjectDescription: entry.description,
        detail: `verification invalidated (${entry.invalidationReasons.join(", ")}) — cited: ${entry.citedEvidenceRefs.join(", ") || "none"}; live support: ${entry.liveSupportingEvidence.join(", ") || "none"}`,
      });
    }
  }
  const passes = !requirement.zeroInvalidatedConfirmed || validity.invalidatedCount === 0;
  return freezeResult({
    dimension: "confirmed-validity",
    required: requirement.required,
    verdict: requirement.required ? (passes ? "PASS" : "FAIL") : "REPORTED",
    confirmedCount: validity.confirmedAssertionCount,
    validCount: validity.validCount,
    invalidatedCount: validity.invalidatedCount,
    findings: sortFindings(findings),
  });
}

function evaluateEpistemicComposition(
  graph: RealityModelGraph,
  support: readonly AssertionSupport[],
  profile: TaskProfileRecord,
): EpistemicCompositionResult {
  const requirement = requirementsFor(profile.profile, "epistemic-composition");
  const objectsByState = zeroedStateCounts();
  for (const object of graph.objects) {
    objectsByState[object.epistemicState] += 1;
  }
  const assertionsByState = zeroedStateCounts();
  for (const entry of support) {
    assertValidEpistemicState(entry.status, "assertion.status");
    assertionsByState[entry.status] += 1;
  }
  const proposedObjects = graph.objects.filter((object) => object.epistemicState === "PROPOSED").length;
  const proposedAssertions = support.filter((entry) => entry.status === "PROPOSED").length;

  const findings: ReadinessFinding[] = [];
  if (proposedObjects + proposedAssertions > 0) {
    findings.push({
      code: "PROPOSED_CONTENT",
      dimension: "epistemic-composition",
      detail: `${proposedObjects} objects and ${proposedAssertions} assertions are PROPOSED (hypothetical/design content, not authoritative reality)`,
    });
  }

  const passes = !requirement.zeroProposedContent || proposedObjects + proposedAssertions === 0;
  return freezeResult({
    dimension: "epistemic-composition",
    required: requirement.required,
    verdict: requirement.required ? (passes ? "PASS" : "FAIL") : "REPORTED",
    proposedObjectCount: proposedObjects,
    proposedAssertionCount: proposedAssertions,
    objectsByState: deepFreeze({ ...objectsByState }),
    assertionsByState: deepFreeze({ ...assertionsByState }),
    weakestAssertionState: deriveWeakestState(support.map((entry) => entry.status)),
    findings: sortFindings(findings),
  });
}

function evaluateUncertaintyBudget(
  inventory: readonly InventoryEntry[],
  profile: TaskProfileRecord,
): UncertaintyBudgetResult {
  const requirement = requirementsFor(profile.profile, "uncertainty-budget");
  const budget = profile.uncertaintyBudget;

  if (budget === undefined) {
    const findings: ReadinessFinding[] =
      profile.profile === "CRITICAL"
        ? [
            {
              code: "NO_ACCURACY_BUDGET",
              dimension: "uncertainty-budget",
              detail: "CRITICAL task without a declared accuracy budget — the task-specific accuracy bound is unstated (advisory; the profile binding itself is declared)",
            },
          ]
        : [];
    return freezeResult({
      dimension: "uncertainty-budget",
      required: false,
      verdict: "NOT_APPLICABLE",
      evaluatedCount: 0,
      exceededCount: 0,
      unevaluableCount: 0,
      evaluations: [],
      findings: sortFindings(findings),
    });
  }

  const findings: ReadinessFinding[] = [];
  const evaluations: BudgetEvaluationEntry[] = [];
  let unevaluable = 0;

  for (const entry of inventory) {
    if (entry.quantity === undefined) {
      continue; // presence assertions carry no value to bound
    }
    const family = unitFamily(entry.quantity.unit);
    const bound = budgetForFamily(budget, family);
    if (bound === undefined) {
      continue; // family not budgeted by this task
    }
    const uncertainty = entry.quantity.uncertainty;
    const standard = uncertainty === undefined ? undefined : standardEquivalent(uncertainty);
    if (uncertainty === undefined || standard === undefined) {
      unevaluable += 1;
      findings.push({
        code: "BUDGET_UNEVALUABLE",
        dimension: "uncertainty-budget",
        subjectDescription: entry.support.description,
        detail:
          uncertainty === undefined
            ? `value (${entry.quantity.value} ${entry.quantity.unit}) carries no uncertainty record — the budget cannot be evaluated against it`
            : `value (${entry.quantity.value} ${entry.quantity.unit}) carries a tolerance (a specification bound, not a statistical estimate) — never converted to a standard uncertainty`,
      });
      continue;
    }
    const siValue = toSiValue(standard, entry.quantity.unit);
    const exceeded = siValue > bound.bound;
    evaluations.push({
      subjectDescription: entry.support.description,
      uncertaintyKind: uncertainty.kind,
      siValue,
      siUnit: bound.unit,
      bound: bound.bound,
      exceeded,
    });
    if (exceeded) {
      findings.push({
        code: "BUDGET_EXCEEDED",
        dimension: "uncertainty-budget",
        subjectDescription: entry.support.description,
        detail: `standard-equivalent uncertainty ${siValue} ${bound.unit} exceeds the task budget ${bound.bound} ${bound.unit}`,
      });
    }
  }

  evaluations.sort((a, b) =>
    a.subjectDescription < b.subjectDescription ? -1 : a.subjectDescription > b.subjectDescription ? 1 : 0,
  );

  // Fail-closed at CRITICAL (lock §3: ambiguous evidence fails);
  // budget exceeding fails at every enforcing profile.
  const exceededCount = evaluations.filter((evaluation) => evaluation.exceeded).length;
  const failsByExceeded = requirement.budgetEnforced && exceededCount > 0;
  const failsByAmbiguity = profile.profile === "CRITICAL" && unevaluable > 0;
  const verdict: DimensionVerdict = requirement.required
    ? failsByExceeded || failsByAmbiguity
      ? "FAIL"
      : "PASS"
    : "REPORTED";

  return freezeResult({
    dimension: "uncertainty-budget",
    required: requirement.required,
    verdict,
    budget: deepFreeze({ ...budget }),
    evaluatedCount: evaluations.length,
    exceededCount,
    unevaluableCount: unevaluable,
    evaluations: Object.freeze([...evaluations]),
    findings: sortFindings(findings),
  });
}

// --- helpers ---------------------------------------------------------------------

/** Joins the evidence support view with graph-side assertion details. */
function joinInventory(
  graph: RealityModelGraph,
  version: number,
  support: readonly AssertionSupport[],
): readonly InventoryEntry[] {
  const propertyBySubject = new Map<
    string,
    {
      quantity?: { value: number; unit: ModelUnit; uncertainty?: ModelUncertainty };
      kind?: "measurement" | "estimate";
      confidence?: number;
    }
  >();
  const put = (
    subject: EvidenceSubject,
    assertion: {
      quantity?: { value: number; unit: ModelUnit; uncertainty?: ModelUncertainty };
      kind?: "measurement" | "estimate";
      confidence?: number;
    },
  ): void => {
    propertyBySubject.set(subjectKey(subject), {
      ...(assertion.quantity !== undefined ? { quantity: { ...assertion.quantity } } : {}),
      ...(assertion.kind !== undefined ? { kind: assertion.kind } : {}),
      ...(assertion.confidence !== undefined ? { confidence: assertion.confidence } : {}),
    });
  };
  for (const object of graph.objects) {
    for (const assertion of object.properties) {
      put(
        {
          kind: "object-property",
          modelId: graph.modelId,
          version,
          objectId: object.objectId,
          propertyKey: assertion.key,
        },
        assertion,
      );
    }
  }
  for (const space of graph.spaces) {
    for (const assertion of space.properties ?? []) {
      put(
        {
          kind: "space-property",
          modelId: graph.modelId,
          version,
          spaceId: space.spaceId,
          propertyKey: assertion.key,
        },
        assertion,
      );
    }
  }

  return support.map((entry) => {
    const details =
      entry.subject.kind === "object-property" || entry.subject.kind === "space-property"
        ? propertyBySubject.get(subjectKey(entry.subject))
        : undefined;
    return {
      support: entry,
      ...(details?.quantity !== undefined ? { quantity: details.quantity } : {}),
      ...(details?.kind !== undefined ? { measurementKind: details.kind } : {}),
      ...(details?.confidence !== undefined ? { confidence: details.confidence } : {}),
    };
  });
}

function zeroedStateCounts(): Record<EpistemicState, number> {
  const counts = {} as Record<EpistemicState, number>;
  for (const state of EPISTEMIC_STATES) {
    counts[state] = 0;
  }
  return counts;
}

function countStates(graph: RealityModelGraph, support: readonly AssertionSupport[]): EpistemicSummary {
  const objectsByState = zeroedStateCounts();
  for (const object of graph.objects) {
    objectsByState[object.epistemicState] += 1;
  }
  const assertionsByState = zeroedStateCounts();
  for (const entry of support) {
    assertionsByState[entry.status] += 1;
  }
  return {
    objectsByState: deepFreeze({ ...objectsByState }),
    assertionsByState: deepFreeze({ ...assertionsByState }),
    proposedObjectCount: graph.objects.filter((object) => object.epistemicState === "PROPOSED").length,
    proposedAssertionCount: support.filter((entry) => entry.status === "PROPOSED").length,
    weakestAssertionState: deriveWeakestState(support.map((entry) => entry.status)),
  };
}

/** Confidence aggregation — REPORTING ONLY, never a verdict input. */
function confidenceSummary(inventory: readonly InventoryEntry[]): ConfidenceSummary {
  const values = inventory
    .map((entry) => entry.confidence)
    .filter((value): value is number => value !== undefined);
  if (values.length === 0) {
    return { assertionsWithConfidence: 0 };
  }
  const sum = values.reduce((total, value) => total + value, 0);
  return deepFreeze({
    assertionsWithConfidence: values.length,
    minConfidence: Math.min(...values),
    meanConfidence: sum / values.length,
  });
}

/** Canonical finding order: dimension, code, subject, detail. */
function sortFindings(findings: readonly ReadinessFinding[]): readonly ReadinessFinding[] {
  const dimensionOrder = new Map<string, number>(
    READINESS_DIMENSIONS.map((dimension, index) => [dimension as string, index]),
  );
  return Object.freeze(
    [...findings].sort((a, b) => {
      const dimensionDelta =
        (dimensionOrder.get(a.dimension) ?? 99) - (dimensionOrder.get(b.dimension) ?? 99);
      if (dimensionDelta !== 0) {
        return dimensionDelta;
      }
      if (a.code !== b.code) {
        return a.code < b.code ? -1 : 1;
      }
      const subjectA = a.subjectDescription ?? "";
      const subjectB = b.subjectDescription ?? "";
      if (subjectA !== subjectB) {
        return subjectA < subjectB ? -1 : 1;
      }
      return a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0;
    }),
  );
}

function freezeResult<T extends object>(result: T): T {
  return deepFreeze(result);
}
