/**
 * AISE-022 — the readiness EVALUATOR (pure, deterministic, fail-closed).
 *
 * AGGREGATE RULE (multidimensional, per task kind — CRITICAL):
 *   ANY critical dimension `not_satisfied`     → NOT_READY        (fail-closed)
 *   else ANY critical dimension `insufficient` → INSUFFICIENT_DATA (fail-closed — unknown is never ready)
 *   else ANY non-critical dimension not satisfied → READY_WITH_NOTES
 *   else                                        → READY
 * A critical dimension can never silently default to `satisfied`: the
 * requirement switch is exhaustive and unknown kinds are typed errors
 * (`invalid_profile`), validated BEFORE any evaluation runs.
 *
 * MONOTONICITY (documented partial order, test-enforced):
 *   - Dimension satisfaction order: insufficient_data < not_satisfied < satisfied
 *     (`DIMENSION_OUTCOME_RANK`). Adding evidence facts (none invalidated)
 *     can only move a dimension UP this order: valid counts and coverage
 *     fractions are non-decreasing under evidence addition, and σ/epistemic
 *     dimensions are evidence-independent (unchanged = stays).
 *   - Readiness order (`READINESS_RANK`): {NOT_READY, INSUFFICIENT_DATA} are
 *     deliberately UNORDERED against each other (both mean "not ready";
 *     which one appears depends on whether the dominating critical
 *     deficiency is measured or unknown — resolving a measured failure can
 *     surface a remaining unknown, e.g. NOT_READY → INSUFFICIENT_DATA when
 *     the depth count reaches its minimum while room.height is still
 *     unasserted). Both sit strictly below READY_WITH_NOTES < READY, so the
 *     safety claim holds: ADDING evidence can never leave the ready region.
 *   - SCOPE (honest): monotonicity is guaranteed for evidence-fact additions
 *     and for non-contradicting fact improvements (σ tightening, epistemic
 *     upgrades on replacement snapshots). Property-fact ADDITIONS that
 *     introduce a weaker assertion of an already-bounded key (a worse σ, a
 *     lower status) correctly LOWER the dimension — the worst assertion
 *     governs (conservative by design; contradictions fail closed, they are
 *     not hidden by averaging).
 *   - INVALIDATION is explicitly NON-monotone (R7: "missing/invalid evidence
 *     invalidates readiness"): invalidating a critical evidence item drops
 *     READY → NOT_READY (tested).
 *
 * DEVICE AWARENESS WITHOUT DOWNGRADE (the core invariant): `deviceProfile`
 * is consulted ONLY by the gap-remediation annotator (`buildDeviceHint`).
 * Dimension evaluation and aggregation receive the fact index alone — the
 * evaluator is structurally incapable of letting a device change a
 * requirement, an outcome or a verdict. Identical evidence evaluated with a
 * weak vs strong device profile yields byte-identical readiness and
 * dimensions; only gap `deviceHint`s differ (tested — the exact difference
 * set is asserted).
 *
 * DETERMINISM: facts are folded in canonical (sorted) order over
 * order-insensitive accumulators (counts, sets, key-grouped lists re-sorted
 * by nodeId); reports carry no timestamps and no randomness; canonical
 * serialization via the shared `canonicalJsonStringify`.
 */

import { canonicalJsonStringify, type EpistemicStatus, type EvidenceMethod } from "@aise/shared-contracts";
import {
  AssuranceError,
  EPISTEMIC_RANK,
  METHOD_CAPABILITY_FACT_KEYS,
  METHOD_REMEDIATION_ALTERNATIVES,
  normalizeCapabilityFactLevel,
  validateAssuranceProfile,
  validateEvaluationFacts,
  type AssuranceProfile,
  type CapabilityFact,
  type CoverageBasis,
  type DeviceProfile,
  type DeviceRemediationHint,
  type DimensionBasis,
  type DimensionDeficiency,
  type DimensionOutcome,
  type DimensionOutcomeLevel,
  type EpistemicFloorBasis,
  type EpistemicKeyBasis,
  type EvidenceSufficiencyBasis,
  type EvaluationInput,
  type MethodPlausibility,
  type MethodPlausibilityLevel,
  type PropertyFact,
  type ReadinessDimension,
  type ReadinessGap,
  type ReadinessLevel,
  type ReadinessReport,
  type Remediation,
  type Requirement,
  type UncertaintyBoundBasis,
} from "./model";

/* ------------------------------------------------------------------ */
/* Documented orders + serialization                                    */
/* ------------------------------------------------------------------ */

/** Satisfaction order: insufficient_data < not_satisfied < satisfied. */
export const DIMENSION_OUTCOME_RANK: Readonly<Record<DimensionOutcomeLevel, number>> = {
  insufficient_data: 0,
  not_satisfied: 1,
  satisfied: 2,
};

/**
 * Readiness order: {NOT_READY, INSUFFICIENT_DATA} unordered (both non-ready),
 * READY_WITH_NOTES < READY above them. See the module header for rationale.
 */
export const READINESS_RANK: Readonly<Record<ReadinessLevel, number>> = {
  NOT_READY: 0,
  INSUFFICIENT_DATA: 0,
  READY_WITH_NOTES: 1,
  READY: 2,
};

/** `a ⊑ b` under the documented dimension-outcome order. */
export function dimensionOutcomeAtLeast(a: DimensionOutcomeLevel, b: DimensionOutcomeLevel): boolean {
  return DIMENSION_OUTCOME_RANK[a] >= DIMENSION_OUTCOME_RANK[b];
}

/** `a ⊑ b` under the documented readiness order. */
export function readinessAtLeast(a: ReadinessLevel, b: ReadinessLevel): boolean {
  return READINESS_RANK[a] >= READINESS_RANK[b];
}

/** Canonical JSON text of a report (deterministic; no timestamps inside). */
export function serializeReadinessReport(report: ReadinessReport): string {
  return canonicalJsonStringify(report);
}

/* ------------------------------------------------------------------ */
/* Fact index (pure fold over canonical-ordered facts)                 */
/* ------------------------------------------------------------------ */

interface TaggedPropertyFact {
  readonly nodeId: string;
  readonly fact: PropertyFact;
}

interface FactIndex {
  readonly evidenceTotal: number;
  readonly nodeIds: readonly string[];
  readonly validCountByMethod: ReadonlyMap<EvidenceMethod, number>;
  readonly invalidCountByMethod: ReadonlyMap<EvidenceMethod, number>;
  /** Node ids linked by at least one VALID evidence item (coverage measurand). */
  readonly validLinkedNodeIds: ReadonlySet<string>;
  /** Property facts grouped by key, each group sorted by nodeId (worst governs). */
  readonly factsByKey: ReadonlyMap<string, readonly TaggedPropertyFact[]>;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Fold evidence facts and node facts into the evaluation index. All
 * accumulators are order-insensitive (counts, sets, key-grouped lists that
 * are re-sorted), so any permutation of the input yields the same index and
 * a byte-identical report.
 */
function buildFactIndex(input: EvaluationInput): FactIndex {
  const nodes = [...input.graphSnapshot.nodes].sort((a, b) => compareStrings(a.nodeId, b.nodeId));
  const evidence = [...input.evidence].sort((a, b) => compareStrings(a.evidenceId, b.evidenceId));

  const validCountByMethod = new Map<EvidenceMethod, number>();
  const invalidCountByMethod = new Map<EvidenceMethod, number>();
  const validLinkedNodeIds = new Set<string>();
  for (const fact of evidence) {
    const target = fact.invalidated ? invalidCountByMethod : validCountByMethod;
    target.set(fact.method, (target.get(fact.method) ?? 0) + 1);
    if (!fact.invalidated) {
      for (const nodeId of fact.linkedNodeIds) validLinkedNodeIds.add(nodeId);
    }
  }

  const grouped = new Map<string, TaggedPropertyFact[]>();
  for (const node of nodes) {
    for (const fact of node.properties) {
      const list = grouped.get(fact.key);
      if (list === undefined) grouped.set(fact.key, [{ nodeId: node.nodeId, fact }]);
      else list.push({ nodeId: node.nodeId, fact });
    }
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => compareStrings(a.nodeId, b.nodeId));
  }

  return {
    evidenceTotal: evidence.length,
    nodeIds: nodes.map((node) => node.nodeId),
    validCountByMethod,
    invalidCountByMethod,
    validLinkedNodeIds,
    factsByKey: grouped,
  };
}

/* ------------------------------------------------------------------ */
/* Dimension evaluators (one per requirement kind — exhaustive)         */
/* ------------------------------------------------------------------ */

interface Evaluated {
  readonly outcome: DimensionOutcomeLevel;
  readonly basis: DimensionBasis;
  readonly deficiency?: DimensionDeficiency;
}

/** Deterministic number rendering for messages (no float drift). */
function fmt(n: number): string {
  return String(Math.round(n * 1e6) / 1e6);
}

function evaluateEvidenceSufficiency(req: Extract<Requirement, { kind: "evidence_sufficiency" }>, index: FactIndex): Evaluated {
  const validCount = index.validCountByMethod.get(req.method) ?? 0;
  const invalidCount = index.invalidCountByMethod.get(req.method) ?? 0;
  const basis: EvidenceSufficiencyBasis = {
    kind: "evidence_sufficiency",
    method: req.method,
    requiredCount: req.minCount,
    validCount,
    invalidCount,
  };
  if (index.evidenceTotal === 0) {
    return {
      outcome: "insufficient_data",
      basis,
      deficiency: {
        code: "no_evidence_recorded",
        kind: "unknown_data",
        message: `no evidence recorded for the evaluated state — nothing to count for ${req.method}`,
      },
    };
  }
  if (validCount >= req.minCount) return { outcome: "satisfied", basis };
  const shortfall = req.minCount - validCount;
  return {
    outcome: "not_satisfied",
    basis,
    deficiency: {
      code: "evidence_count_shortfall",
      kind: "measured_failure",
      message: `valid ${req.method} evidence ${validCount} of required ${req.minCount} (short by ${shortfall}; ${invalidCount} invalidated item${invalidCount === 1 ? "" : "s"} not counted)`,
      shortfall,
    },
  };
}

function evaluateUncertaintyBound(req: Extract<Requirement, { kind: "uncertainty_bound" }>, index: FactIndex): Evaluated {
  const facts = index.factsByKey.get(req.propertyKey) ?? [];
  const numericFacts = facts.filter((tagged) => typeof tagged.fact.value === "number");
  const consistentSigmas: number[] = [];
  let sigmaMissingCount = 0;
  let unitMissingCount = 0;
  let unitMismatchCount = 0;
  let firstAnomaly: { nodeId: string; code: DimensionDeficiency["code"]; detail: string } | null = null;
  for (const tagged of numericFacts) {
    const sigma = tagged.fact.uncertainty?.sigma;
    if (sigma === undefined) {
      sigmaMissingCount += 1;
      if (firstAnomaly === null) {
        firstAnomaly = { nodeId: tagged.nodeId, code: "sigma_not_reported", detail: "reports no σ" };
      }
      continue;
    }
    if (tagged.fact.unit === undefined) {
      unitMissingCount += 1;
      if (firstAnomaly === null) {
        firstAnomaly = { nodeId: tagged.nodeId, code: "sigma_unit_missing", detail: "carries σ without a unit" };
      }
      continue;
    }
    if (tagged.fact.unit !== req.unit) {
      unitMismatchCount += 1;
      if (firstAnomaly === null) {
        firstAnomaly = {
          nodeId: tagged.nodeId,
          code: "sigma_unit_mismatch",
          detail: `reports σ in unit "${tagged.fact.unit}" (required "${req.unit}")`,
        };
      }
      continue;
    }
    consistentSigmas.push(sigma);
  }
  const maxMeasuredSigma = consistentSigmas.length > 0 ? Math.max(...consistentSigmas) : null;
  const basis: UncertaintyBoundBasis = {
    kind: "uncertainty_bound",
    propertyKey: req.propertyKey,
    requiredUnit: req.unit,
    assertionCount: facts.length,
    numericAssertionCount: numericFacts.length,
    sigmaReportedCount: numericFacts.length - sigmaMissingCount,
    unitConsistentCount: consistentSigmas.length,
    maxMeasuredSigma,
  };
  if (facts.length === 0) {
    return {
      outcome: "insufficient_data",
      basis,
      deficiency: {
        code: "property_absent",
        kind: "unknown_data",
        message: `"${req.propertyKey}" is not asserted in the evaluated state — σ unknown (never assumed 0)`,
      },
    };
  }
  if (numericFacts.length < facts.length) {
    return {
      outcome: "not_satisfied",
      basis,
      deficiency: {
        code: "non_numeric_property",
        kind: "measured_failure",
        message: `"${req.propertyKey}" has ${facts.length - numericFacts.length} of ${facts.length} assertions with non-numeric values — an uncertainty bound is not applicable`,
        shortfall: facts.length - numericFacts.length,
      },
    };
  }
  if (firstAnomaly !== null) {
    const anomalyTotal = sigmaMissingCount + unitMissingCount + unitMismatchCount;
    return {
      outcome: "insufficient_data",
      basis,
      deficiency: {
        code: firstAnomaly.code,
        kind: "unknown_data",
        message: `"${req.propertyKey}" on node "${firstAnomaly.nodeId}" ${firstAnomaly.detail}; ${anomalyTotal} of ${facts.length} assertions carry quality anomalies (${sigmaMissingCount} without σ, ${unitMissingCount} without unit, ${unitMismatchCount} with wrong unit)`,
      },
    };
  }
  if (maxMeasuredSigma === null || maxMeasuredSigma <= req.maxSigma) {
    if (maxMeasuredSigma === null) {
      // Unreachable when no anomalies exist (firstAnomaly would have fired);
      // kept fail-closed rather than assuming a σ of 0.
      return {
        outcome: "insufficient_data",
        basis,
        deficiency: {
          code: "sigma_not_reported",
          kind: "unknown_data",
          message: `"${req.propertyKey}" has no measurable σ — measurement quality unknown`,
        },
      };
    }
    return { outcome: "satisfied", basis };
  }
  const shortfall = maxMeasuredSigma - req.maxSigma;
  const aboveCount = consistentSigmas.filter((sigma) => sigma > req.maxSigma).length;
  return {
    outcome: "not_satisfied",
    basis,
    deficiency: {
      code: "sigma_above_bound",
      kind: "measured_failure",
      message: `max σ ${fmt(maxMeasuredSigma)} exceeds bound ${fmt(req.maxSigma)} on "${req.propertyKey}" (over by ${fmt(shortfall)}; ${aboveCount} of ${facts.length} assertions above bound)`,
      shortfall,
    },
  };
}

function evaluateCoverage(req: Extract<Requirement, { kind: "coverage" }>, index: FactIndex): Evaluated {
  const nodesTotal = index.nodeIds.length;
  if (nodesTotal === 0) {
    const basis: CoverageBasis = {
      kind: "coverage",
      minCoverageFraction: req.minCoverageFraction,
      nodesTotal: 0,
      nodesCovered: 0,
      measuredCoverageFraction: null,
    };
    return {
      outcome: "insufficient_data",
      basis,
      deficiency: {
        code: "no_modeled_nodes",
        kind: "unknown_data",
        message: "no modeled nodes in the evaluated state — coverage fraction not measurable",
      },
    };
  }
  const uncovered = index.nodeIds.filter((nodeId) => !index.validLinkedNodeIds.has(nodeId));
  const nodesCovered = nodesTotal - uncovered.length;
  const fraction = nodesCovered / nodesTotal;
  const basis: CoverageBasis = {
    kind: "coverage",
    minCoverageFraction: req.minCoverageFraction,
    nodesTotal,
    nodesCovered,
    measuredCoverageFraction: fraction,
  };
  if (fraction >= req.minCoverageFraction) return { outcome: "satisfied", basis };
  const shortfall = req.minCoverageFraction - fraction;
  return {
    outcome: "not_satisfied",
    basis,
    deficiency: {
      code: "coverage_shortfall",
      kind: "measured_failure",
      message: `coverage ${fmt(fraction)} below required ${fmt(req.minCoverageFraction)} (short by ${fmt(shortfall)}; ${uncovered.length} of ${nodesTotal} nodes without valid linked evidence)`,
      shortfall,
    },
  };
}

function evaluateEpistemicFloor(req: Extract<Requirement, { kind: "epistemic_floor" }>, index: FactIndex): Evaluated {
  const floorRank = EPISTEMIC_RANK[req.minEpistemicStatus];
  const perKey: EpistemicKeyBasis[] = [];
  for (const propertyKey of req.propertyKeys) {
    const facts = index.factsByKey.get(propertyKey) ?? [];
    let minStatus: EpistemicStatus | null = null;
    for (const tagged of facts) {
      const status = tagged.fact.epistemicStatus;
      if (minStatus === null || EPISTEMIC_RANK[status] < EPISTEMIC_RANK[minStatus]) {
        minStatus = status;
      }
    }
    perKey.push({ propertyKey, assertionCount: facts.length, minMeasuredStatus: minStatus });
  }
  const basis: EpistemicFloorBasis = {
    kind: "epistemic_floor",
    minEpistemicStatus: req.minEpistemicStatus,
    propertyKeys: req.propertyKeys,
    perKey,
  };
  for (const keyBasis of perKey) {
    if (keyBasis.minMeasuredStatus === null) {
      return {
        outcome: "not_satisfied",
        basis,
        deficiency: {
          code: "missing_property",
          kind: "measured_failure",
          message: `"${keyBasis.propertyKey}" is not asserted — the ${req.minEpistemicStatus} epistemic floor cannot be met`,
        },
      };
    }
    const measuredRank = EPISTEMIC_RANK[keyBasis.minMeasuredStatus];
    if (measuredRank < floorRank) {
      return {
        outcome: "not_satisfied",
        basis,
        deficiency: {
          code: "epistemic_status_below_floor",
          kind: "measured_failure",
          message: `"${keyBasis.propertyKey}" min status ${keyBasis.minMeasuredStatus} below floor ${req.minEpistemicStatus} (${keyBasis.assertionCount} assertion${keyBasis.assertionCount === 1 ? "" : "s"}, worst governs)`,
          shortfall: floorRank - measuredRank,
        },
      };
    }
  }
  return { outcome: "satisfied", basis };
}

function evaluateDimension(dimension: ReadinessDimension, index: FactIndex): DimensionOutcome {
  const req = dimension.requirement;
  let evaluated: Evaluated;
  switch (req.kind) {
    case "evidence_sufficiency":
      evaluated = evaluateEvidenceSufficiency(req, index);
      break;
    case "uncertainty_bound":
      evaluated = evaluateUncertaintyBound(req, index);
      break;
    case "coverage":
      evaluated = evaluateCoverage(req, index);
      break;
    case "epistemic_floor":
      evaluated = evaluateEpistemicFloor(req, index);
      break;
    default: {
      // NEVER silently satisfied — unknown kinds are typed errors (also
      // guarded by validateAssuranceProfile before this point).
      throw new AssuranceError(
        "invalid_profile",
        `unknown requirement kind "${String((req as { kind?: unknown }).kind)}"`,
      );
    }
  }
  const outcome: DimensionOutcome = {
    dimensionId: dimension.dimensionId,
    critical: dimension.critical,
    outcome: evaluated.outcome,
    basis: evaluated.basis,
    ...(dimension.weight !== undefined ? { weight: dimension.weight } : {}),
    ...(evaluated.deficiency !== undefined ? { deficiency: evaluated.deficiency } : {}),
  };
  return outcome;
}

/* ------------------------------------------------------------------ */
/* Aggregate (fail-closed)                                             */
/* ------------------------------------------------------------------ */

export function aggregateReadiness(outcomes: readonly DimensionOutcome[]): ReadinessLevel {
  const critical = outcomes.filter((outcome) => outcome.critical);
  if (critical.some((outcome) => outcome.outcome === "not_satisfied")) return "NOT_READY";
  if (critical.some((outcome) => outcome.outcome === "insufficient_data")) return "INSUFFICIENT_DATA";
  return outcomes.some((outcome) => !outcome.critical && outcome.outcome !== "satisfied")
    ? "READY_WITH_NOTES"
    : "READY";
}

/* ------------------------------------------------------------------ */
/* Gaps + device-aware remediation hints (annotation only)              */
/* ------------------------------------------------------------------ */

function buildRemediation(req: Requirement, basis: DimensionBasis): Remediation {
  switch (req.kind) {
    case "evidence_sufficiency": {
      const evidenceBasis = basis as EvidenceSufficiencyBasis;
      return {
        kind: "evidence_sufficiency",
        method: req.method,
        requiredCount: req.minCount,
        validCount: evidenceBasis.validCount,
        additionalCountNeeded: Math.max(0, req.minCount - evidenceBasis.validCount),
      };
    }
    case "uncertainty_bound": {
      const uncertaintyBasis = basis as UncertaintyBoundBasis;
      return {
        kind: "uncertainty_bound",
        propertyKey: req.propertyKey,
        requiredMaxSigma: req.maxSigma,
        unit: req.unit,
        currentMaxSigma: uncertaintyBasis.maxMeasuredSigma,
      };
    }
    case "coverage": {
      const coverageBasis = basis as CoverageBasis;
      return {
        kind: "coverage",
        minCoverageFraction: req.minCoverageFraction,
        measuredCoverageFraction: coverageBasis.measuredCoverageFraction,
      };
    }
    case "epistemic_floor": {
      const floorBasis = basis as EpistemicFloorBasis;
      const floorRank = EPISTEMIC_RANK[req.minEpistemicStatus];
      return {
        kind: "epistemic_floor",
        minEpistemicStatus: req.minEpistemicStatus,
        unsatisfiedPropertyKeys: floorBasis.perKey
          .filter(
            (keyBasis) =>
              keyBasis.minMeasuredStatus === null ||
              EPISTEMIC_RANK[keyBasis.minMeasuredStatus] < floorRank,
          )
          .map((keyBasis) => keyBasis.propertyKey),
      };
    }
  }
}

/**
 * Device-aware remediation ANNOTATION. This is the ONLY code path that
 * reads `capabilityFacts`, and it runs AFTER verdicts are fixed. Verdict
 * surfaces (`readiness`, `dimensions`) never see the device profile.
 */
function buildDeviceHint(
  method: EvidenceMethod,
  additionalCountNeeded: number,
  capabilityFacts: Readonly<Record<string, string>>,
): DeviceRemediationHint {
  const factKey = METHOD_CAPABILITY_FACT_KEYS[method];
  const rawFact = capabilityFacts[factKey];
  const plausibility: MethodPlausibilityLevel =
    rawFact === undefined ? "undetermined" : normalizeCapabilityFactLevel(rawFact);
  const consulted: CapabilityFact[] = [];
  if (rawFact !== undefined) consulted.push({ key: factKey, value: rawFact });

  const alternativeMethods: MethodPlausibility[] = [];
  const alternativeLabels: string[] = [];
  if (plausibility === "unavailable" || plausibility === "undetermined") {
    for (const alternative of METHOD_REMEDIATION_ALTERNATIVES[method] ?? []) {
      const altKey = METHOD_CAPABILITY_FACT_KEYS[alternative];
      const altRaw = capabilityFacts[altKey];
      const altPlausibility =
        altRaw === undefined ? "undetermined" : normalizeCapabilityFactLevel(altRaw);
      alternativeMethods.push({ method: alternative, plausibility: altPlausibility });
      alternativeLabels.push(alternative);
      if (altRaw !== undefined) consulted.push({ key: altKey, value: altRaw });
    }
  }

  let note: string;
  if (plausibility === "available") {
    note = `capability fact ${factKey}="${rawFact}" — ${method} plausible on this device; capture ${additionalCountNeeded} more valid ${method} evidence item${additionalCountNeeded === 1 ? "" : "s"} to close the gap`;
  } else if (plausibility === "degraded") {
    note = `capability fact ${factKey}="${rawFact}" — ${method} degraded on this device: expect higher operator burden; capture ${additionalCountNeeded} more valid ${method} evidence item${additionalCountNeeded === 1 ? "" : "s"}`;
  } else if (plausibility === "unavailable") {
    note = `capability fact ${factKey}="${rawFact}" — required method unavailable on this device; the requirement is UNCHANGED (never lowered): escalate or use a capable device; profile-governed substitution candidates: ${alternativeLabels.join(", ")}`;
  } else if (rawFact === undefined) {
    note = `no capability fact ${factKey} — plausibility undetermined (never assumed available); the requirement is UNCHANGED; substitution candidates pending capability classification: ${alternativeLabels.join(", ")}`;
  } else {
    note = `capability fact ${factKey}="${rawFact}" is not recognized (expected available|degraded|unavailable) — plausibility undetermined; the requirement is UNCHANGED; substitution candidates: ${alternativeLabels.join(", ")}`;
  }

  return {
    requiredMethod: method,
    requiredMethodPlausibility: plausibility,
    consultedCapabilityFacts: consulted,
    alternativeMethods,
    note,
  };
}

function buildGap(
  profile: AssuranceProfile,
  dimension: ReadinessDimension,
  outcome: DimensionOutcome,
  deviceProfile: DeviceProfile | undefined,
): ReadinessGap {
  const remediation = buildRemediation(dimension.requirement, outcome.basis);
  const deviceHint =
    deviceProfile !== undefined &&
    dimension.requirement.kind === "evidence_sufficiency" &&
    remediation.kind === "evidence_sufficiency"
      ? buildDeviceHint(remediation.method, remediation.additionalCountNeeded, deviceProfile.capabilityFacts)
      : undefined;
  const gap: ReadinessGap = {
    gapId: `${profile.profileId}::${dimension.dimensionId}`,
    dimensionId: dimension.dimensionId,
    critical: dimension.critical,
    requirement: dimension.requirement,
    remediation,
    ...(deviceHint !== undefined ? { deviceHint } : {}),
  };
  return gap;
}

/* ------------------------------------------------------------------ */
/* The evaluator                                                        */
/* ------------------------------------------------------------------ */

/**
 * Evaluate multidimensional readiness from evidence/model state alone.
 * Pure and deterministic: same input → byte-identical canonical report.
 * Throws typed `AssuranceError` (invalid_profile / invalid_input) on
 * malformed state — never silently evaluates to satisfied.
 */
export function evaluateReadiness(input: EvaluationInput): ReadinessReport {
  const profile = validateAssuranceProfile(input.profile);
  const facts = validateEvaluationFacts(input);
  const index = buildFactIndex(facts);
  const deviceProfile = facts.deviceProfile;

  const dimensions: DimensionOutcome[] = [];
  const gaps: ReadinessGap[] = [];
  for (const dimension of profile.dimensions) {
    const outcome = evaluateDimension(dimension, index);
    dimensions.push(outcome);
    if (outcome.outcome !== "satisfied") {
      gaps.push(buildGap(profile, dimension, outcome, deviceProfile));
    }
  }
  return {
    profileId: profile.profileId,
    profileVersion: profile.version,
    taskKind: profile.taskKind,
    readiness: aggregateReadiness(dimensions),
    dimensions,
    gaps,
  };
}
