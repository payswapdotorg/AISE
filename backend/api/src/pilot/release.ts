/**
 * AISE-039 — release criteria, release evaluation and the append-only
 * release log.
 *
 * RELEASE CRITERIA ARE VERSIONED AND HONEST (the loud rules):
 *
 *  - A `ReleaseCriteria` is VERSIONED DATA composing the technical gates
 *   with adoption thresholds: the required gate ids, the expected gate
 *   table versions, the adoption thresholds per metric, the required real
 *   sample size, the required ICP classes (large AND small) and the bound
 *   regression suites (id + version). Bumping a criteria is a governed
 *   change: ship a new `version`.
 *  - THE EVALUATION IS BLOCKED OR READY — NEVER READY WHILE ANY CRITICAL
 *   GATE FAILS, ANY REQUIRED GATE IS UNKNOWN, ANY REQUIRED ADOPTION METRIC
 *   IS UNKNOWN, ANY THRESHOLD IS MISSED, ANY PROJECT LACKS EXECUTION, THE
 *   ICP COVERAGE IS MISSING, A GATE-TABLE VERSION MISMATCHES, OR A BOUND
 *   REGRESSION SUITE DOES NOT RESOLVE AT ITS REFERENCED VERSION. Every
 *   blocker is TYPED and names the exact failing/refusing surface.
 *  - A RELEASE EVALUATION WHOSE ADOPTION EVIDENCE IS SYNTHETIC-ONLY IS A
 *   TYPED REFUSAL: the `adoption_evidence_synthetic_only` blocker is
 *   emitted (alongside every unknown-metric blocker) — no release may
 *   claim adoption from projected users alone.
 *  - REGRESSION-SUITE BINDING (R17): the criteria reference the repo's
 *   regression suites BY ID + VERSION and the evaluation records which
 *   suites the release depends on, resolved verbatim against the
 *   suite registry (the real, imported version constants of the AISE-019
 *   benchmarks gates and the AISE-035 lab gates).
 *  - NO SELF-APPROVAL: the evaluation REPORTS readiness, it does not bless
 *   itself. Approval is a separate append-only log entry by a DIFFERENT
 *   actor; approving your own evaluation is a typed `self_approval_refused`
 *   refusal, and approving a BLOCKED evaluation is a typed
 *   `approval_of_blocked_evaluation` refusal (workers may not self-approve
 *   or self-merge governed Work Items).
 *  - THE RELEASE LOG IS APPEND-ONLY WITH PROVENANCE: every entry is
 *   content-digested (sha-256 over canonical JSON) and chained to its
 *   predecessor; entries are never rewritten and duplicate entries are a
 *   typed refusal.
 *
 * DETERMINISM: pure functions of (campaign, gates, metrics, criteria,
 * registry, clock); content-derived ids; no wall clock (injected), no
 * randomness, no I/O.
 */

import { GATE_THRESHOLD_VERSION as BENCHMARK_GATE_THRESHOLD_VERSION } from "../benchmarks/gates";
import { LAB_GATE_THRESHOLD_VERSION } from "../lab/metrics";
import type { PilotCampaignResult } from "./campaign";
import type { PilotAdoptionMetrics, PilotMetricResult } from "./metrics";
import {
  PilotError,
  pilotDigestOf,
  pilotIdOf,
  PILOT_GATE_IDS,
  validateGateId,
  validateMetricId,
  type PilotAdoptionMetricId,
  type PilotGateId,
  type PilotGateResult,
  type PilotIcpClass,
} from "./model";

/* ------------------------------------------------------------------ */
/* Regression-suite registry (the repo's REAL R17 surfaces)             */
/* ------------------------------------------------------------------ */

/** A regression-suite reference (by id + version — the R17 binding). */
export interface RegressionSuiteRef {
  readonly suiteId: string;
  readonly suiteVersion: string;
}

/** A resolved regression-suite binding (reference + owning surface). */
export interface RegressionSuiteBinding extends RegressionSuiteRef {
  readonly surface: string;
}

/**
 * THE bound regression-suite registry: the repo's existing golden-metrics/
 * discrimination surfaces with their REAL, IMPORTED version constants —
 * the pilot release never invents suite ids or versions.
 */
export const PILOT_BOUND_REGRESSION_SUITES: readonly RegressionSuiteBinding[] = Object.freeze([
  {
    suiteId: "aise-benchmarks-regression",
    suiteVersion: BENCHMARK_GATE_THRESHOLD_VERSION,
    surface: "backend/api/src/benchmarks (AISE-019 golden metrics, gates + discrimination matrix)",
  },
  {
    suiteId: "aise-lab-golden-metrics",
    suiteVersion: LAB_GATE_THRESHOLD_VERSION,
    surface: "backend/api/src/lab (AISE-035 end-to-end dogfood gates + discrimination cases)",
  },
]);

/* ------------------------------------------------------------------ */
/* Release criteria (versioned data)                                    */
/* ------------------------------------------------------------------ */

/** One adoption threshold: a min and/or max bound on a metric's value. */
export interface PilotAdoptionThreshold {
  readonly metric: PilotAdoptionMetricId;
  readonly min?: number;
  readonly max?: number;
}

/** THE versioned release criteria for the production pilot. */
export interface ReleaseCriteria {
  readonly criteriaId: string;
  readonly version: number;
  /** Gates that must be PASS for READY (every entry, no exceptions). */
  readonly requiredGateIds: readonly PilotGateId[];
  /** The gate-table versions the criteria were authored against. */
  readonly gateTableVersions: Readonly<Record<PilotGateTableFamily, string>>;
  readonly adoptionThresholds: readonly PilotAdoptionThreshold[];
  /** Required real-session sample size per adoption metric. */
  readonly requiredRealSampleSize: number;
  /** ICP classes that must each have executed projects (large AND small). */
  readonly requiredIcpClasses: readonly PilotIcpClass[];
  readonly minProjectsPerIcpClass: number;
  /** May a release be READY while any campaign project lacks execution? */
  readonly requireEveryProjectExecuted: boolean;
  /** The regression suites this release depends on (id + version). */
  readonly regressionSuites: readonly RegressionSuiteRef[];
}

/** The gate-table families a criteria version pins. */
export type PilotGateTableFamily = "performance" | "security" | "usability";

function gateTableVersionOf(result: PilotGateResult): PilotGateTableFamily {
  if (result.gateId.startsWith("performance.")) {
    return "performance";
  }
  if (result.gateId.startsWith("security.")) {
    return "security";
  }
  return "usability";
}

/**
 * THE shipped release criteria, version 1: every technical gate PASS under
 * the shipped table versions, the R19 adoption thresholds, a real sample
 * of at least 3 sessions, both ICP classes with at least one executed
 * project each, every campaign project executed, and both bound
 * regression suites at their current versions.
 */
export const PILOT_RELEASE_CRITERIA_V1: ReleaseCriteria = Object.freeze({
  criteriaId: "release-criteria/production-pilot",
  version: 1,
  requiredGateIds: PILOT_GATE_IDS,
  gateTableVersions: {
    performance: "pilot-perf-budgets-1",
    security: "pilot-security-coverage-1",
    usability: "pilot-usability-1",
  },
  adoptionThresholds: [
    { metric: "primary_interface_adoption_rate", min: 0.75 },
    { metric: "authorized_action_success_rate", min: 0.75 },
    { metric: "return_path_completion_rate", min: 0.9 },
    { metric: "context_switches_per_session", max: 1.5 },
    { metric: "workflow_migration_coverage", min: 0.5 },
    { metric: "distinct_pilot_principals", min: 3 },
  ] as readonly PilotAdoptionThreshold[],
  requiredRealSampleSize: 3,
  requiredIcpClasses: ["large", "small"] as const,
  minProjectsPerIcpClass: 1,
  requireEveryProjectExecuted: true,
  regressionSuites: PILOT_BOUND_REGRESSION_SUITES.map(({ suiteId, suiteVersion }) => ({
    suiteId,
    suiteVersion,
  })),
});

/** Validate release criteria (typed refusal on an inconsistent table). */
export function validateReleaseCriteria(criteria: ReleaseCriteria): ReleaseCriteria {
  if (typeof criteria.criteriaId !== "string" || criteria.criteriaId.length === 0) {
    throw new PilotError("invalid_release_criteria", "criteriaId must be a non-empty string");
  }
  if (!Number.isInteger(criteria.version) || criteria.version <= 0) {
    throw new PilotError(
      "invalid_release_criteria",
      `criteria '${criteria.criteriaId}' version must be a positive integer`,
    );
  }
  if (criteria.requiredGateIds.length === 0) {
    throw new PilotError(
      "invalid_release_criteria",
      `criteria '${criteria.criteriaId}' requires no gates — a release without gates is refused`,
    );
  }
  for (const gateId of criteria.requiredGateIds) {
    validateGateId(gateId);
  }
  for (const family of ["performance", "security", "usability"] as const) {
    const version = criteria.gateTableVersions[family];
    if (typeof version !== "string" || version.length === 0) {
      throw new PilotError(
        "invalid_release_criteria",
        `criteria '${criteria.criteriaId}' pins no ${family} gate-table version`,
      );
    }
  }
  for (const threshold of criteria.adoptionThresholds) {
    validateMetricId(threshold.metric);
    if (threshold.min === undefined && threshold.max === undefined) {
      throw new PilotError(
        "invalid_release_criteria",
        `threshold for '${threshold.metric}' carries neither min nor max`,
      );
    }
  }
  if (criteria.requiredRealSampleSize < 1) {
    throw new PilotError(
      "invalid_release_criteria",
      `criteria '${criteria.criteriaId}' requires a real sample size of at least 1`,
    );
  }
  if (criteria.regressionSuites.length === 0) {
    throw new PilotError(
      "invalid_release_criteria",
      `criteria '${criteria.criteriaId}' binds no regression suites — an unbound release is refused`,
    );
  }
  return criteria;
}

/* ------------------------------------------------------------------ */
/* Release evaluation                                                   */
/* ------------------------------------------------------------------ */

/** Every release blocker kind (typed registry — all DISTINCT). */
export const RELEASE_BLOCKER_KINDS = Object.freeze([
  "critical_gate_failed",
  "gate_unknown",
  "gate_not_evaluated",
  "gate_version_mismatch",
  "adoption_metric_unknown",
  "adoption_threshold_missed",
  "adoption_evidence_synthetic_only",
  "campaign_icp_coverage_missing",
  "project_not_executed",
  "project_execution_failed",
  "regression_suite_binding_broken",
] as const satisfies readonly string[]);
export type ReleaseBlockerKind = (typeof RELEASE_BLOCKER_KINDS)[number];

/** A typed release blocker (BLOCKED verdicts name their exact causes). */
export type ReleaseBlocker =
  | {
      readonly kind: "critical_gate_failed";
      readonly gateId: PilotGateId;
      readonly violationCount: number;
      readonly detail: string;
    }
  | {
      readonly kind: "gate_unknown";
      readonly gateId: PilotGateId;
      readonly dimension: string;
      readonly detail: string;
    }
  | {
      readonly kind: "gate_not_evaluated";
      readonly gateId: PilotGateId;
      readonly detail: string;
    }
  | {
      readonly kind: "gate_version_mismatch";
      readonly family: PilotGateTableFamily;
      readonly expectedVersion: string;
      readonly foundVersion: string;
      readonly gateId: PilotGateId;
    }
  | {
      readonly kind: "adoption_metric_unknown";
      readonly metric: PilotAdoptionMetricId;
      readonly reason: string;
      readonly missingRealEvidence: string;
    }
  | {
      readonly kind: "adoption_threshold_missed";
      readonly metric: PilotAdoptionMetricId;
      readonly value: number;
      readonly requirement: string;
    }
  | {
      readonly kind: "adoption_evidence_synthetic_only";
      readonly projectedUsers: number | null;
      readonly generators: readonly string[];
      readonly detail: string;
    }
  | {
      readonly kind: "campaign_icp_coverage_missing";
      readonly icpClass: PilotIcpClass;
      readonly detail: string;
    }
  | {
      readonly kind: "project_not_executed";
      readonly projectId: string;
      readonly detail: string;
    }
  | {
      readonly kind: "project_execution_failed";
      readonly projectId: string;
      readonly stopCode: string | null;
      readonly detail: string;
    }
  | {
      readonly kind: "regression_suite_binding_broken";
      readonly suiteId: string;
      readonly expectedVersion: string;
      readonly foundVersion: string | null;
      readonly detail: string;
    };

/** A release evaluation: BLOCKED with exact blockers, or READY. */
export interface ReleaseEvaluation {
  /** Content-derived: `releval-<first 16 hex of the content digest>`. */
  readonly evaluationId: string;
  readonly criteriaId: string;
  readonly criteriaVersion: number;
  readonly campaignId: string;
  readonly campaignDigest: string;
  readonly evaluatedAt: string;
  readonly evaluatedBy: string;
  readonly verdict: "READY" | "BLOCKED";
  readonly blockers: readonly ReleaseBlocker[];
  /** Echoed gate statuses (inspectable, per gate). */
  readonly gateStatuses: readonly { readonly gateId: PilotGateId; readonly status: string }[];
  /** Echoed adoption metric results (inspectable, per metric). */
  readonly adoptionMetricResults: readonly {
    readonly metric: PilotAdoptionMetricId;
    readonly kind: "computed" | "unknown";
    readonly value: number | null;
  }[];
  /** The regression suites this release depends on, resolved verbatim. */
  readonly regressionSuites: readonly RegressionSuiteBinding[];
  /** sha-256 over the canonical evaluation JSON (digest field stripped). */
  readonly contentDigest: string;
}

export interface EvaluateReleaseInput {
  readonly campaign: PilotCampaignResult;
  readonly gateResults: readonly PilotGateResult[];
  readonly adoptionMetrics: PilotAdoptionMetrics;
  readonly criteria: ReleaseCriteria;
  /** Defaults to the shipped registry (`PILOT_BOUND_REGRESSION_SUITES`). */
  readonly suiteRegistry?: readonly RegressionSuiteBinding[];
  readonly evaluatedBy: string;
  readonly now: () => string;
}

function thresholdRequirementOf(threshold: { min?: number; max?: number }): string {
  const parts: string[] = [];
  if (threshold.min !== undefined) {
    parts.push(`min ${threshold.min}`);
  }
  if (threshold.max !== undefined) {
    parts.push(`max ${threshold.max}`);
  }
  return parts.join(" and ");
}

/**
 * Evaluate a release against versioned criteria. The verdict is READY only
 * when every gate passes under the pinned table versions, every required
 * adoption metric is COMPUTED and within thresholds, the campaign spans
 * the required ICP classes with every project executed and healthy, and
 * every bound regression suite resolves at its referenced version.
 */
export function evaluateRelease(input: EvaluateReleaseInput): ReleaseEvaluation {
  const { campaign, gateResults, adoptionMetrics, criteria } = input;
  validateReleaseCriteria(criteria);
  const registry = input.suiteRegistry ?? PILOT_BOUND_REGRESSION_SUITES;
  const blockers: ReleaseBlocker[] = [];

  /* -- gates: pass/unknown/version ------------------------------------- */
  for (const gateId of criteria.requiredGateIds) {
    const result = gateResults.find((candidate) => candidate.gateId === gateId);
    if (result === undefined) {
      blockers.push({
        kind: "gate_not_evaluated",
        gateId,
        detail: `criteria '${criteria.criteriaId}' v${criteria.version} requires gate '${gateId}' but it was not evaluated over the campaign`,
      });
      continue;
    }
    if (result.status === "FAIL") {
      blockers.push({
        kind: "critical_gate_failed",
        gateId,
        violationCount: result.violations.filter((violation) => violation.critical).length,
        detail:
          `gate '${gateId}' FAILED under table ${result.tableVersion} — first violation: ` +
          `${result.violations[0]?.detail ?? "(no violation detail)"}`,
      });
    } else if (result.status === "UNKNOWN") {
      blockers.push({
        kind: "gate_unknown",
        gateId,
        dimension: result.notObserved?.dimension ?? "unknown",
        detail:
          result.notObserved?.detail ??
          `gate '${gateId}' is UNKNOWN — a required gate may never be satisfied by an unknown result`,
      });
    }
    const family = gateTableVersionOf(result);
    const expected = criteria.gateTableVersions[family];
    if (result.tableVersion !== expected) {
      blockers.push({
        kind: "gate_version_mismatch",
        family,
        expectedVersion: expected,
        foundVersion: result.tableVersion,
        gateId,
      });
    }
  }

  /* -- adoption metrics: computed + within thresholds -------------------- */
  for (const threshold of criteria.adoptionThresholds) {
    const result: PilotMetricResult | undefined = adoptionMetrics.metrics[threshold.metric];
    if (result === undefined) {
      blockers.push({
        kind: "adoption_metric_unknown",
        metric: threshold.metric,
        reason: "not_computed_by_metrics_bundle",
        missingRealEvidence: `the adoption metrics bundle did not compute '${threshold.metric}'`,
      });
      continue;
    }
    if (result.kind === "unknown") {
      blockers.push({
        kind: "adoption_metric_unknown",
        metric: threshold.metric,
        reason: result.reason,
        missingRealEvidence: result.missingRealEvidence,
      });
      continue;
    }
    if (threshold.min !== undefined && result.value < threshold.min) {
      blockers.push({
        kind: "adoption_threshold_missed",
        metric: threshold.metric,
        value: result.value,
        requirement: `value ${result.value} < ${thresholdRequirementOf(threshold)}`,
      });
    }
    if (threshold.max !== undefined && result.value > threshold.max) {
      blockers.push({
        kind: "adoption_threshold_missed",
        metric: threshold.metric,
        value: result.value,
        requirement: `value ${result.value} > ${thresholdRequirementOf(threshold)}`,
      });
    }
  }

  /* -- the synthetic-only typed refusal ---------------------------------- */
  if (
    adoptionMetrics.summary.realSessionCount === 0 &&
    (adoptionMetrics.summary.syntheticSessionCount > 0 ||
      adoptionMetrics.summary.projectedUsers !== null)
  ) {
    blockers.push({
      kind: "adoption_evidence_synthetic_only",
      projectedUsers: adoptionMetrics.summary.projectedUsers,
      generators: adoptionMetrics.summary.syntheticGenerators,
      detail:
        `the campaign's adoption evidence is SYNTHETIC-ONLY ` +
        `(${String(adoptionMetrics.summary.syntheticSessionCount)} synthetic sessions` +
        `${adoptionMetrics.summary.projectedUsers === null ? "" : `, ${String(adoptionMetrics.summary.projectedUsers)} projected users`}` +
        `) — §039 forbids claims based on simulated users alone; this refusal stands until ` +
        `executed-record evidence exists`,
    });
  }

  /* -- campaign composition: ICP coverage + executed projects ------------- */
  for (const icpClass of criteria.requiredIcpClasses) {
    const executedProjects = campaign.projects.filter(
      (project) => project.icpClass === icpClass && project.executed !== null,
    );
    if (executedProjects.length < criteria.minProjectsPerIcpClass) {
      blockers.push({
        kind: "campaign_icp_coverage_missing",
        icpClass,
        detail:
          `ICP class '${icpClass}' has ${executedProjects.length} executed project(s); the criteria ` +
          `require at least ${criteria.minProjectsPerIcpClass}`,
      });
    }
  }
  if (criteria.requireEveryProjectExecuted) {
    for (const project of campaign.projects) {
      if (project.executed === null) {
        blockers.push({
          kind: "project_not_executed",
          projectId: project.projectId,
          detail:
            `project '${project.projectId}' contributed NO executed run (synthetic-only project) — ` +
            `a READY release may not claim pilot coverage over it`,
        });
      }
    }
  }
  for (const project of campaign.projects) {
    if (project.executed !== null && project.executed.criticalExecutionFailure) {
      blockers.push({
        kind: "project_execution_failed",
        projectId: project.projectId,
        stopCode: project.executed.stopReason?.code ?? null,
        detail:
          `project '${project.projectId}' executed with a critical failure ` +
          `(${project.executed.stopReason === null
            ? "a failed hop"
            : `stopped at '${project.executed.stoppedAt}': ${project.executed.stopReason.code}`})`,
      });
    }
  }

  /* -- regression-suite binding (R17, id + version) ----------------------- */
  const boundSuites: RegressionSuiteBinding[] = [];
  for (const ref of criteria.regressionSuites) {
    const found = registry.find((binding) => binding.suiteId === ref.suiteId);
    if (found === undefined) {
      blockers.push({
        kind: "regression_suite_binding_broken",
        suiteId: ref.suiteId,
        expectedVersion: ref.suiteVersion,
        foundVersion: null,
        detail: `regression suite '${ref.suiteId}' is not present in the suite registry`,
      });
      continue;
    }
    if (found.suiteVersion !== ref.suiteVersion) {
      blockers.push({
        kind: "regression_suite_binding_broken",
        suiteId: ref.suiteId,
        expectedVersion: ref.suiteVersion,
        foundVersion: found.suiteVersion,
        detail:
          `regression suite '${ref.suiteId}' is at version '${found.suiteVersion}' but the criteria ` +
          `bind version '${ref.suiteVersion}' — re-bind the criteria (a governed change) or restore ` +
          `the suite`,
      });
      continue;
    }
    boundSuites.push(found);
  }

  const evaluation: ReleaseEvaluation = {
    evaluationId: "pending",
    criteriaId: criteria.criteriaId,
    criteriaVersion: criteria.version,
    campaignId: campaign.campaignId,
    campaignDigest: campaign.reproducibilityDigest,
    evaluatedAt: input.now(),
    evaluatedBy: input.evaluatedBy,
    verdict: blockers.length === 0 ? "READY" : "BLOCKED",
    blockers,
    gateStatuses: gateResults.map((result) => ({
      gateId: result.gateId,
      status: result.status,
    })),
    adoptionMetricResults: (Object.values(adoptionMetrics.metrics) as PilotMetricResult[]).map(
      (result) => ({
        metric: result.metric,
        kind: result.kind,
        value: result.kind === "computed" ? result.value : null,
      }),
    ),
    regressionSuites: boundSuites,
    contentDigest: "pending",
  };
  // The digest preimage: the evaluation with id and digest stripped.
  const finalDigest = pilotDigestOf({
    criteriaId: evaluation.criteriaId,
    criteriaVersion: evaluation.criteriaVersion,
    campaignId: evaluation.campaignId,
    campaignDigest: evaluation.campaignDigest,
    evaluatedAt: evaluation.evaluatedAt,
    evaluatedBy: evaluation.evaluatedBy,
    verdict: evaluation.verdict,
    blockers: evaluation.blockers,
    gateStatuses: evaluation.gateStatuses,
    adoptionMetricResults: evaluation.adoptionMetricResults,
    regressionSuites: evaluation.regressionSuites,
  });
  return {
    ...evaluation,
    evaluationId: pilotIdOf("releval", finalDigest),
    contentDigest: finalDigest,
  };
}

/* ------------------------------------------------------------------ */
/* The append-only release log                                          */
/* ------------------------------------------------------------------ */

/** The chain root for a release log's first entry. */
export const PILOT_RELEASE_LOG_GENESIS = "aise-pilot-release-log-genesis-v1";

/** One append-only release-log entry: an evaluation or an approval. */
export type ReleaseLogEntry =
  | {
      readonly kind: "evaluation";
      readonly entryId: string;
      readonly occurredAt: string;
      readonly actor: string;
      readonly evaluation: ReleaseEvaluation;
      readonly previousEntryDigest: string;
      readonly entryDigest: string;
    }
  | {
      readonly kind: "approval";
      readonly entryId: string;
      readonly occurredAt: string;
      readonly actor: string;
      readonly evaluationId: string;
      readonly note: string;
      readonly previousEntryDigest: string;
      readonly entryDigest: string;
    };

/** Distributive omit (Omit over a union must keep the branches). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function entryPreimage(
  entry: DistributiveOmit<ReleaseLogEntry, "entryId" | "entryDigest">,
): unknown {
  if (entry.kind === "evaluation") {
    return {
      kind: entry.kind,
      occurredAt: entry.occurredAt,
      actor: entry.actor,
      evaluationDigest: entry.evaluation.contentDigest,
      previousEntryDigest: entry.previousEntryDigest,
    };
  }
  return {
    kind: entry.kind,
    occurredAt: entry.occurredAt,
    actor: entry.actor,
    evaluationId: entry.evaluationId,
    note: entry.note,
    previousEntryDigest: entry.previousEntryDigest,
  };
}

/** Append a release evaluation to the log (append-only, chained). */
export function appendEvaluation(
  log: readonly ReleaseLogEntry[],
  evaluation: ReleaseEvaluation,
  actor: string,
  now: () => string,
): readonly ReleaseLogEntry[] {
  const duplicate = log.some(
    (entry) => entry.kind === "evaluation" && entry.evaluation.evaluationId === evaluation.evaluationId,
  );
  if (duplicate) {
    throw new PilotError(
      "duplicate_log_entry",
      `evaluation '${evaluation.evaluationId}' is already in the release log — the log is append-only, never rewritten`,
    );
  }
  const previousEntryDigest = log.length === 0 ? PILOT_RELEASE_LOG_GENESIS : log[log.length - 1]!.entryDigest;
  const preimage = {
    kind: "evaluation",
    occurredAt: now(),
    actor,
    evaluationDigest: evaluation.contentDigest,
    previousEntryDigest,
  };
  const entryDigest = pilotDigestOf(preimage);
  const entry: ReleaseLogEntry = {
    kind: "evaluation",
    entryId: pilotIdOf("relelog", entryDigest),
    occurredAt: now(),
    actor,
    evaluation,
    previousEntryDigest,
    entryDigest,
  };
  return [...log, entry];
}

/**
 * Append an APPROVAL for a logged evaluation. Typed refusals (never a bare
 * throw): unknown evaluation, approval of a BLOCKED evaluation, and
 * SELF-APPROVAL (the approver is the evaluator — workers may not
 * self-approve governed Work Items).
 */
export function requestApproval(
  log: readonly ReleaseLogEntry[],
  evaluationId: string,
  approver: string,
  note: string,
  now: () => string,
): readonly ReleaseLogEntry[] {
  const evaluationEntry = log.find(
    (entry) => entry.kind === "evaluation" && entry.evaluation.evaluationId === evaluationId,
  );
  if (evaluationEntry === undefined || evaluationEntry.kind !== "evaluation") {
    throw new PilotError(
      "unknown_evaluation",
      `evaluation '${evaluationId}' is not in the release log — approve a logged evaluation`,
    );
  }
  if (evaluationEntry.evaluation.verdict !== "READY") {
    throw new PilotError(
      "approval_of_blocked_evaluation",
      `evaluation '${evaluationId}' is ${evaluationEntry.evaluation.verdict} — a BLOCKED evaluation cannot be approved`,
    );
  }
  if (evaluationEntry.actor === approver) {
    throw new PilotError(
      "self_approval_refused",
      `'${approver}' evaluated '${evaluationId}' and may not approve it — no self-approval of governed releases`,
    );
  }
  const previousEntryDigest = log.length === 0 ? PILOT_RELEASE_LOG_GENESIS : log[log.length - 1]!.entryDigest;
  const entryDigest = pilotDigestOf({
    kind: "approval",
    occurredAt: now(),
    actor: approver,
    evaluationId,
    note,
    previousEntryDigest,
  });
  const entry: ReleaseLogEntry = {
    kind: "approval",
    entryId: pilotIdOf("relelog", entryDigest),
    occurredAt: now(),
    actor: approver,
    evaluationId,
    note,
    previousEntryDigest,
    entryDigest,
  };
  return [...log, entry];
}

/** Verify a release log's chain integrity (digests + links). */
export function verifyReleaseLog(
  log: readonly ReleaseLogEntry[],
): { readonly verified: boolean; readonly reason: string | null } {
  let previous = PILOT_RELEASE_LOG_GENESIS;
  for (const entry of log) {
    if (entry.previousEntryDigest !== previous) {
      return {
        verified: false,
        reason: `entry '${entry.entryId}' does not chain to its predecessor ('${entry.previousEntryDigest}' != '${previous}')`,
      };
    }
    const recomputed = pilotDigestOf(entryPreimage(entry));
    if (recomputed !== entry.entryDigest) {
      return {
        verified: false,
        reason: `entry '${entry.entryId}' content digest mismatch (expected '${recomputed}', recorded '${entry.entryDigest}')`,
      };
    }
    previous = entry.entryDigest;
  }
  return { verified: true, reason: null };
}
