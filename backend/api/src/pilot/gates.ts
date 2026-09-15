/**
 * AISE-039 — pilot technical gates: performance, security and usability.
 *
 * GATES ARE COMPUTED, NOT DECLARED (the loud rule): every gate below
 * evaluates REAL inputs — recorded walk-hop latency samples over executed
 * sessions against VERSIONED budgets with regression thresholds; permission
 * and audit-event coverage over the AISE-036 identity vocabulary; scope
 * minimality over the identity permission registry (the registry the SDK
 * validates scopes against); broker-outcome and context-switch
 * distributions over the recorded shell-broker evidence — and emits a typed
 * PASS/FAIL/UNKNOWN result with inspectable, per-project-visible evidence.
 *
 * R17 DISCIpline (exact): gates evaluate PER-INSTANCE samples — never the
 * campaign aggregates. A campaign aggregate may sit under every budget
 * while one project's sample trips, and the gate STILL fails; the
 * `campaignAggregateHidingProof` helper makes the hiding case explicit and
 * testable. Per-project rollups are carried on every gate result.
 *
 * BUDGETS AND THRESHOLDS ARE VERSIONED DATA, NOT CODE CONSTANTS BURIED IN
 * LOGIC: `PilotGateTables` bundles the performance budget table (+version),
 * the latency regression baselines (+version), the security coverage table
 * (+version) and the usability thresholds (+version). Bumping any table is
 * a governed change: ship a new version string and keep the old table for
 * historical comparison — a release evaluation cross-checks the criteria's
 * expected versions against the versions the gates were computed under.
 *
 * NOT_OBSERVED PROPAGATES: a gate whose dimension was not observed in any
 * real session (environment- or session-level NOT_OBSERVED declarations,
 * or zero real sessions at all) is UNKNOWN with the dimension named —
 * never a silent PASS, never a zero-defaulted FAIL.
 */

import {
  GRANULARITY_RANK,
  permissionGranularity,
  permissionSurface,
  type AuditAction,
  type Permission,
} from "../identity/model";
import type { PilotCampaignResult } from "./campaign";
import {
  PilotError,
  isExternalTrip,
  type PilotDimension,
  type PilotEvidenceField,
  type PilotGateId,
  type PilotGateProjectRollup,
  type PilotGateResult,
  type PilotGateViolation,
  type PilotIcpClass,
  type PilotNotObserved,
  type PilotWalkHopId,
} from "./model";

/* ------------------------------------------------------------------ */
/* Versioned gate tables (data, not logic)                              */
/* ------------------------------------------------------------------ */

/** One walk-hop latency budget (ms) with criticality + rationale. */
export interface PilotHopLatencyBudget {
  readonly hopId: PilotWalkHopId;
  readonly budgetMs: number;
  readonly critical: boolean;
  readonly rationale: string;
}

/** One latency-regression baseline: campaign mean vs baseline tolerance. */
export interface PilotLatencyRegressionBaseline {
  readonly hopId: PilotWalkHopId;
  readonly baselineMs: number;
  /** Maximum allowed mean regression over the baseline, in percent. */
  readonly maxRegressionPct: number;
}

/** The versioned gate-table bundle every evaluator consumes. */
export interface PilotGateTables {
  readonly performanceVersion: string;
  readonly hopBudgets: readonly PilotHopLatencyBudget[];
  readonly latencyBaselines: readonly PilotLatencyRegressionBaseline[];
  readonly securityVersion: string;
  /** Permissions the pilot must have exercised (identity registry ids). */
  readonly requiredPermissions: readonly Permission[];
  /** Audit actions the pilot must have recorded (identity vocabulary). */
  readonly requiredAuditActions: readonly AuditAction[];
  readonly usabilityVersion: string;
  /** Minimum fraction of decided broker actions that were allowed. */
  readonly minAllowedRate: number;
  /** Maximum campaign-mean external context switches per real session. */
  readonly maxMeanContextSwitches: number;
}

/**
 * THE shipped performance budget table, version "pilot-perf-budgets-1".
 * Rationale: interactive primary-interface budgets for the R19 targeted
 * workflow — discovery/inspection hops must stay under human-interactive
 * latencies and the authorized-action round trip under the broker's
 * interactive envelope. Every entry is CRITICAL: a budget breach on the
 * targeted workflow's primary interface invalidates the pilot's
 * performance acceptance. Bumping this table is a governed change.
 */
export const PILOT_PERFORMANCE_BUDGET_VERSION = "pilot-perf-budgets-1" as const;

export const PILOT_HOP_LATENCY_BUDGETS: readonly PilotHopLatencyBudget[] = Object.freeze([
  { hopId: "context_discover", budgetMs: 1200, critical: true, rationale: "project context discovery must stay inside a snappy interactive envelope" },
  { hopId: "reality_inspect", budgetMs: 2000, critical: true, rationale: "Reality Graph inspection over a pinned version must stay interactive" },
  { hopId: "boq_inspect", budgetMs: 1600, critical: true, rationale: "BOQ sheet inspection incl. mapped targets must stay interactive" },
  { hopId: "evidence_inspect", budgetMs: 1200, critical: true, rationale: "evidence record inspection must stay inside the discovery envelope" },
  { hopId: "action_initiate", budgetMs: 2500, critical: true, rationale: "authorized-action initiation (broker round trip) must stay interactive" },
  { hopId: "return_incumbent", budgetMs: 1500, critical: true, rationale: "the return path to the incumbent record must not strand the user perceptibly" },
]);

/**
 * THE shipped latency regression baselines (same version). The pilot
 * campaign's per-hop mean latency may regress at most 15% over the
 * recorded baseline before the regression gate trips — protecting the
 * pilot's performance acceptance against slow drift.
 */
export const PILOT_LATENCY_REGRESSION_BASELINES: readonly PilotLatencyRegressionBaseline[] =
  Object.freeze([
    { hopId: "context_discover", baselineMs: 700, maxRegressionPct: 15 },
    { hopId: "reality_inspect", baselineMs: 1450, maxRegressionPct: 15 },
    { hopId: "boq_inspect", baselineMs: 1120, maxRegressionPct: 15 },
    { hopId: "evidence_inspect", baselineMs: 750, maxRegressionPct: 15 },
    { hopId: "action_initiate", baselineMs: 2000, maxRegressionPct: 15 },
    { hopId: "return_incumbent", baselineMs: 880, maxRegressionPct: 15 },
  ]);

/** THE shipped security coverage table, version "pilot-security-coverage-1". */
export const PILOT_SECURITY_COVERAGE_VERSION = "pilot-security-coverage-1" as const;

/**
 * The R19 targeted workflow's permission surfaces the pilot must have
 * exercised (drawn VERBATIM from the AISE-036 identity registry): reading
 * the three inspection surfaces and initiating on the case/intervention
 * surfaces.
 */
export const PILOT_REQUIRED_PERMISSION_COVERAGE: readonly Permission[] = Object.freeze([
  "reality:read",
  "boq:read",
  "evidence:read",
  "case:read",
  "intervention:write",
]);

/**
 * The audit actions the pilot must have recorded (identity vocabulary):
 * BOTH the allowed and the refused authorization path — a pilot that only
 * ever records `authorization.allowed` has not demonstrated the refusal
 * path (the unauthorized-access discrimination discipline of AISE-036).
 */
export const PILOT_REQUIRED_AUDIT_COVERAGE: readonly AuditAction[] = Object.freeze([
  "authorization.allowed",
  "authorization.refused",
]);

/** THE shipped usability threshold table, version "pilot-usability-1". */
export const PILOT_USABILITY_THRESHOLD_VERSION = "pilot-usability-1" as const;

/** The shipped usability thresholds (R19 acceptance operationalized). */
export const PILOT_USABILITY_THRESHOLDS = Object.freeze({
  /** At least 75% of decided broker actions must be allowed. */
  minAllowedRate: 0.75,
  /** Campaign-mean external context switches per real session. */
  maxMeanContextSwitches: 1.0,
});

/** The shipped gate-table bundle (all three versions above). */
export const PILOT_GATE_TABLES_V1: PilotGateTables = Object.freeze({
  performanceVersion: PILOT_PERFORMANCE_BUDGET_VERSION,
  hopBudgets: PILOT_HOP_LATENCY_BUDGETS,
  latencyBaselines: PILOT_LATENCY_REGRESSION_BASELINES,
  securityVersion: PILOT_SECURITY_COVERAGE_VERSION,
  requiredPermissions: PILOT_REQUIRED_PERMISSION_COVERAGE,
  requiredAuditActions: PILOT_REQUIRED_AUDIT_COVERAGE,
  usabilityVersion: PILOT_USABILITY_THRESHOLD_VERSION,
  minAllowedRate: PILOT_USABILITY_THRESHOLDS.minAllowedRate,
  maxMeanContextSwitches: PILOT_USABILITY_THRESHOLDS.maxMeanContextSwitches,
});

/** Validate a gate-table bundle (typed refusal on an incomplete table). */
export function validateGateTables(tables: PilotGateTables): PilotGateTables {
  for (const field of [
    "performanceVersion",
    "securityVersion",
    "usabilityVersion",
  ] as const) {
    if (typeof tables[field] !== "string" || tables[field].length === 0) {
      throw new PilotError("invalid_gate_tables", `table version '${field}' must be a non-empty string`);
    }
  }
  if (tables.hopBudgets.length === 0) {
    throw new PilotError("invalid_gate_tables", "hop latency budget table is empty");
  }
  const budgetHopIds = new Set(tables.hopBudgets.map((budget) => budget.hopId));
  for (const budget of tables.hopBudgets) {
    if (budget.budgetMs <= 0) {
      throw new PilotError(
        "invalid_gate_tables",
        `hop budget '${budget.hopId}' must be positive (got ${String(budget.budgetMs)})`,
      );
    }
  }
  for (const baseline of tables.latencyBaselines) {
    if (!budgetHopIds.has(baseline.hopId)) {
      throw new PilotError(
        "invalid_gate_tables",
        `latency baseline references hop '${baseline.hopId}' with no budget entry`,
      );
    }
    if (baseline.baselineMs <= 0 || baseline.maxRegressionPct < 0) {
      throw new PilotError(
        "invalid_gate_tables",
        `latency baseline '${baseline.hopId}' must be positive with a non-negative tolerance`,
      );
    }
  }
  for (const rate of [tables.minAllowedRate]) {
    if (rate <= 0 || rate > 1) {
      throw new PilotError(
        "invalid_gate_tables",
        `minAllowedRate must be in (0, 1] (got ${String(rate)})`,
      );
    }
  }
  if (tables.maxMeanContextSwitches < 0) {
    throw new PilotError("invalid_gate_tables", "maxMeanContextSwitches must be non-negative");
  }
  return tables;
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                     */
/* ------------------------------------------------------------------ */

interface RealSessionView {
  readonly projectId: string;
  readonly environmentId: string;
  readonly sessionId: string;
  readonly session: PilotCampaignResult["projects"][number]["sessions"][number];
}

function environmentOf(
  campaign: PilotCampaignResult,
  environmentId: string,
): PilotCampaignResult["environments"][number] {
  const found = campaign.environments.find((entry) => entry.environmentId === environmentId);
  if (found === undefined) {
    throw new PilotError(
      "invalid_campaign_spec",
      `campaign '${campaign.campaignId}' references unknown environment '${environmentId}'`,
    );
  }
  return found;
}

/** Every REAL session of the campaign with its project/environment context. */
function realSessionsOf(campaign: PilotCampaignResult): readonly RealSessionView[] {
  const views: RealSessionView[] = [];
  for (const project of campaign.projects) {
    for (const session of project.sessions) {
      const synthetic = session.evidence.some((entry) => entry.kind === "synthetic_projection");
      if (synthetic) {
        continue;
      }
      views.push({
        projectId: project.projectId,
        environmentId: project.environmentId,
        sessionId: session.sessionId,
        session,
      });
    }
  }
  return views;
}

/** Sessions of real class where `dimension` was observed. */
function dimensionObservedSessions(
  campaign: PilotCampaignResult,
  dimension: PilotDimension,
): readonly RealSessionView[] {
  return realSessionsOf(campaign).filter((view) => {
    const environment = environmentOf(campaign, view.environmentId);
    return !environment.notObservedDimensions.includes(dimension) &&
      !view.session.notObserved.includes(dimension);
  });
}

function meanOf(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum / values.length;
}

function rollupsFor(
  gateId: PilotGateId,
  violations: readonly PilotGateViolation[],
  campaign: PilotCampaignResult,
): readonly PilotGateProjectRollup[] {
  return campaign.projects.map((project) => {
    const projectViolations = violations.filter(
      (violation) => violation.gateId === gateId && violation.projectId === project.projectId,
    );
    const criticalCount = projectViolations.filter((violation) => violation.critical).length;
    return {
      projectId: project.projectId,
      status: projectViolations.length === 0 ? "PASS" : criticalCount > 0 ? "FAIL" : "PASS",
      violationCount: projectViolations.length,
      criticalViolationCount: criticalCount,
    } satisfies PilotGateProjectRollup;
  });
}

function statusOf(
  violations: readonly PilotGateViolation[],
  hasSamples: boolean,
): "PASS" | "FAIL" | "UNKNOWN" {
  if (!hasSamples) {
    return "UNKNOWN";
  }
  if (violations.some((violation) => violation.critical)) {
    return "FAIL";
  }
  return "PASS";
}

/* ------------------------------------------------------------------ */
/* Performance gates                                                    */
/* ------------------------------------------------------------------ */

export interface HopLatencyGateResult extends PilotGateResult {
  readonly gateId: "performance.hop_latency";
  readonly samplesEvaluated: number;
  readonly campaignMeanMsByHop: Readonly<Partial<Record<PilotWalkHopId, number>>>;
}

export interface LatencyRegressionGateResult extends PilotGateResult {
  readonly gateId: "performance.latency_regression";
  readonly campaignMeanMsByHop: Readonly<Partial<Record<PilotWalkHopId, number>>>;
}

interface LatencySample {
  readonly projectId: string;
  readonly sessionId: string;
  readonly hopId: PilotWalkHopId;
  readonly latencyMs: number;
}

function latencySamplesOf(
  campaign: PilotCampaignResult,
): readonly LatencySample[] {
  const samples: LatencySample[] = [];
  for (const view of dimensionObservedSessions(campaign, "walk-latency")) {
    for (const hop of view.session.walk) {
      if (hop.outcome === "ok" && hop.latencyMs !== null) {
        samples.push({
          projectId: view.projectId,
          sessionId: view.sessionId,
          hopId: hop.hopId,
          latencyMs: hop.latencyMs,
        });
      }
    }
  }
  return samples;
}

function campaignMeansByHop(
  samples: readonly LatencySample[],
): Readonly<Partial<Record<PilotWalkHopId, number>>> {
  const byHop = new Map<PilotWalkHopId, number[]>();
  for (const sample of samples) {
    const list = byHop.get(sample.hopId) ?? [];
    list.push(sample.latencyMs);
    byHop.set(sample.hopId, list);
  }
  const means: Partial<Record<PilotWalkHopId, number>> = {};
  for (const [hopId, values] of byHop) {
    means[hopId] = meanOf(values);
  }
  return means;
}

/**
 * Performance gate 1 — hop latency budgets: every recorded sample of every
 * real, latency-observed session is evaluated against its hop's VERSIONED
 * budget (per-instance, R17); a single critical breach fails the gate and
 * is reported with project/session/hop/sample evidence.
 */
export function evaluateHopLatencyGate(
  campaign: PilotCampaignResult,
  tables: PilotGateTables,
): HopLatencyGateResult {
  validateGateTables(tables);
  const budgetIndex = new Map(tables.hopBudgets.map((budget) => [budget.hopId, budget]));
  const samples = latencySamplesOf(campaign);
  const violations: PilotGateViolation[] = [];
  for (const sample of samples) {
    const budget = budgetIndex.get(sample.hopId);
    if (budget === undefined) {
      throw new PilotError(
        "invalid_gate_tables",
        `no hop budget for walk hop '${sample.hopId}' (table ${tables.performanceVersion})`,
      );
    }
    if (sample.latencyMs > budget.budgetMs) {
      violations.push({
        gateId: "performance.hop_latency",
        code: "hop_latency_over_budget",
        critical: budget.critical,
        projectId: sample.projectId,
        sessionId: sample.sessionId,
        detail:
          `session '${sample.sessionId}' walk hop '${sample.hopId}' took ${sample.latencyMs} ms ` +
          `> budget ${budget.budgetMs} ms (${budget.rationale})`,
      });
    }
  }
  const notObserved =
    samples.length === 0
      ? ({
          dimension: "walk-latency",
          detail:
            "no real session recorded walk-latency samples (zero real sessions, or the walk-latency dimension was declared NOT_OBSERVED)",
        } satisfies PilotNotObserved)
      : null;
  const evidence: PilotEvidenceField[] = [
    { label: "samplesEvaluated", value: samples.length },
    { label: "campaignMeanMsByHop", value: JSON.stringify(campaignMeansByHop(samples)) },
  ];
  return {
    gateId: "performance.hop_latency",
    status: statusOf(violations, samples.length > 0),
    critical: true,
    tableVersion: tables.performanceVersion,
    violations,
    notObserved,
    perProject: rollupsFor("performance.hop_latency", violations, campaign),
    evidence,
    samplesEvaluated: samples.length,
    campaignMeanMsByHop: campaignMeansByHop(samples),
  };
}

/**
 * Performance gate 2 — latency regression: the campaign's per-hop MEAN
 * latency is compared against the versioned baselines; a mean regressing
 * beyond the tolerated percentage over baseline trips (drift protection
 * for the pilot's performance acceptance).
 */
export function evaluateLatencyRegressionGate(
  campaign: PilotCampaignResult,
  tables: PilotGateTables,
): LatencyRegressionGateResult {
  validateGateTables(tables);
  const samples = latencySamplesOf(campaign);
  const means = campaignMeansByHop(samples);
  const violations: PilotGateViolation[] = [];
  for (const baseline of tables.latencyBaselines) {
    const mean = means[baseline.hopId];
    if (mean === undefined) {
      continue;
    }
    const allowedMs = baseline.baselineMs * (1 + baseline.maxRegressionPct / 100);
    if (mean > allowedMs) {
      violations.push({
        gateId: "performance.latency_regression",
        code: "latency_regression_exceeded",
        critical: true,
        projectId: null,
        sessionId: null,
        detail:
          `campaign mean for walk hop '${baseline.hopId}' regressed to ${mean.toFixed(1)} ms ` +
          `> allowed ${allowedMs.toFixed(1)} ms (baseline ${baseline.baselineMs} ms + ` +
          `${baseline.maxRegressionPct}% tolerance)`,
      });
    }
  }
  const notObserved =
    samples.length === 0
      ? ({
          dimension: "walk-latency",
          detail:
            "no real session recorded walk-latency samples, so no regression can be evaluated",
        } satisfies PilotNotObserved)
      : null;
  return {
    gateId: "performance.latency_regression",
    status: statusOf(violations, samples.length > 0),
    critical: true,
    tableVersion: tables.performanceVersion,
    violations,
    notObserved,
    perProject: rollupsFor("performance.latency_regression", violations, campaign),
    evidence: [{ label: "campaignMeanMsByHop", value: JSON.stringify(means) }],
    campaignMeanMsByHop: means,
  };
}

/* ------------------------------------------------------------------ */
/* Security gates                                                       */
/* ------------------------------------------------------------------ */

/**
 * Security gate 1 — permission-matrix coverage: the permissions the
 * targeted workflow must exercise (versioned data, identity registry ids)
 * must ALL have been exercised by the pilot's REAL sessions' authorized
 * actions. A missing permission is a FAIL naming it; zero real actions is
 * UNKNOWN (not observed), never a pass-by-emptiness.
 */
export function evaluatePermissionCoverageGate(
  campaign: PilotCampaignResult,
  tables: PilotGateTables,
): PilotGateResult {
  validateGateTables(tables);
  const views = dimensionObservedSessions(campaign, "authorized-actions");
  const exercised = new Set<string>();
  for (const view of views) {
    for (const action of view.session.authorizedActions) {
      exercised.add(action.requiredPermission);
    }
  }
  const violations: PilotGateViolation[] = [];
  for (const required of tables.requiredPermissions) {
    if (!exercised.has(required)) {
      violations.push({
        gateId: "security.permission_coverage",
        code: "permission_not_exercised",
        critical: true,
        projectId: null,
        sessionId: null,
        detail:
          `permission '${required}' (AISE-036 identity registry) was never exercised by any real ` +
          `pilot session's authorized action — the permission-matrix coverage is incomplete`,
      });
    }
  }
  const hasSamples = views.some((view) => view.session.authorizedActions.length > 0);
  const notObserved =
    !hasSamples
      ? ({
          dimension: "authorized-actions",
          detail:
            "no real session recorded authorized actions (zero real sessions, or the authorized-actions dimension was declared NOT_OBSERVED)",
        } satisfies PilotNotObserved)
      : null;
  return {
    gateId: "security.permission_coverage",
    status: statusOf(violations, hasSamples),
    critical: true,
    tableVersion: tables.securityVersion,
    violations,
    notObserved,
    perProject: rollupsFor("security.permission_coverage", violations, campaign),
    evidence: [
      { label: "exercisedPermissions", value: JSON.stringify([...exercised].sort()) },
      { label: "requiredPermissions", value: JSON.stringify([...tables.requiredPermissions].sort()) },
    ],
  };
}

/**
 * Security gate 2 — audit-event coverage: the pilot's REAL sessions must
 * have recorded audit events covering the versioned required action set
 * (allowed AND refused — the refusal path must be demonstrated, mirroring
 * the AISE-036 unauthorized-access discrimination discipline).
 */
export function evaluateAuditCoverageGate(
  campaign: PilotCampaignResult,
  tables: PilotGateTables,
): PilotGateResult {
  validateGateTables(tables);
  const views = dimensionObservedSessions(campaign, "audit-events");
  const recorded = new Set<string>();
  for (const view of views) {
    for (const event of view.session.auditEvents) {
      recorded.add(event.action);
    }
  }
  const violations: PilotGateViolation[] = [];
  for (const required of tables.requiredAuditActions) {
    if (!recorded.has(required)) {
      violations.push({
        gateId: "security.audit_coverage",
        code: "audit_action_not_recorded",
        critical: true,
        projectId: null,
        sessionId: null,
        detail:
          `audit action '${required}' (AISE-036 vocabulary) was never recorded by a real pilot ` +
          `session — the audit coverage is incomplete`,
      });
    }
  }
  const hasSamples = views.some((view) => view.session.auditEvents.length > 0);
  const notObserved =
    !hasSamples
      ? ({
          dimension: "audit-events",
          detail:
            "no real session recorded audit events (zero real sessions, or the audit-events dimension was declared NOT_OBSERVED)",
        } satisfies PilotNotObserved)
      : null;
  return {
    gateId: "security.audit_coverage",
    status: statusOf(violations, hasSamples),
    critical: true,
    tableVersion: tables.securityVersion,
    violations,
    notObserved,
    perProject: rollupsFor("security.audit_coverage", violations, campaign),
    evidence: [
      { label: "recordedAuditActions", value: JSON.stringify([...recorded].sort()) },
      { label: "requiredAuditActions", value: JSON.stringify([...tables.requiredAuditActions].sort()) },
    ],
  };
}

/**
 * Security gate 3 — scope minimality: every ALLOWED broker action's held
 * permission must be the MINIMAL one for its requirement — the same
 * surface at the same granularity rank. Holding a coarser granularity
 * (e.g. `reality:admin` for a `reality:read` requirement) or a different
 * surface is an over-scoped grant: a least-privilege violation named per
 * action (the identity module's implication ladder is the AUTHORITY; this
 * gate audits deployment grant hygiene against it).
 */
export function evaluateScopeMinimalityGate(
  campaign: PilotCampaignResult,
  tables: PilotGateTables,
): PilotGateResult {
  validateGateTables(tables);
  const views = dimensionObservedSessions(campaign, "authorized-actions");
  const violations: PilotGateViolation[] = [];
  let allowedActionCount = 0;
  for (const view of views) {
    for (const action of view.session.authorizedActions) {
      if (action.decision !== "allowed" || action.heldPermission === null) {
        continue;
      }
      allowedActionCount += 1;
      const held = action.heldPermission;
      const required = action.requiredPermission;
      if (permissionSurface(held) !== permissionSurface(required)) {
        violations.push({
          gateId: "security.scope_minimality",
          code: "cross_surface_grant",
          critical: true,
          projectId: view.projectId,
          sessionId: view.sessionId,
          detail:
            `action '${action.actionId}' holds '${held}' for a '${required}' requirement — a ` +
            `grant on a DIFFERENT surface can never satisfy the requirement (AISE-036 ladder)`,
        });
        continue;
      }
      if (GRANULARITY_RANK[permissionGranularity(held)] > GRANULARITY_RANK[permissionGranularity(required)]) {
        violations.push({
          gateId: "security.scope_minimality",
          code: "scope_not_minimal",
          critical: true,
          projectId: view.projectId,
          sessionId: view.sessionId,
          detail:
            `action '${action.actionId}' holds '${held}' for a '${required}' requirement — an ` +
            `over-scoped grant (least-privilege violation; the identity ladder implies it but ` +
            `the deployment should hold the minimal permission)`,
        });
      }
    }
  }
  const notObserved =
    allowedActionCount === 0
      ? ({
          dimension: "authorized-actions",
          detail:
            "no real session recorded an ALLOWED authorized action, so no grant hygiene can be audited",
        } satisfies PilotNotObserved)
      : null;
  return {
    gateId: "security.scope_minimality",
    status: statusOf(violations, allowedActionCount > 0),
    critical: true,
    tableVersion: tables.securityVersion,
    violations,
    notObserved,
    perProject: rollupsFor("security.scope_minimality", violations, campaign),
    evidence: [
      { label: "allowedActionsAudited", value: allowedActionCount },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Usability gates                                                      */
/* ------------------------------------------------------------------ */

/**
 * Usability gate 1 — broker-outcome distribution: the fraction of DECIDED
 * (allowed + refused) broker actions that were allowed must meet the
 * versioned minimum. Unavailable outcomes are EXCLUDED from the rate (an
 * unknowable decision is not a failure) but reported honestly; a campaign
 * with zero decided outcomes is UNKNOWN, never a zero-defaulted FAIL.
 */
export function evaluateBrokerOutcomeGate(
  campaign: PilotCampaignResult,
  tables: PilotGateTables,
): PilotGateResult {
  validateGateTables(tables);
  const views = dimensionObservedSessions(campaign, "authorized-actions");
  let allowed = 0;
  let refused = 0;
  let unavailable = 0;
  for (const view of views) {
    for (const action of view.session.authorizedActions) {
      if (action.decision === "allowed") {
        allowed += 1;
      } else if (action.decision === "refused") {
        refused += 1;
      } else {
        unavailable += 1;
      }
    }
  }
  const decided = allowed + refused;
  const allowedRate = decided === 0 ? null : allowed / decided;
  const violations: PilotGateViolation[] = [];
  if (allowedRate !== null && allowedRate < tables.minAllowedRate) {
    violations.push({
      gateId: "usability.broker_outcome_distribution",
      code: "allowed_rate_below_threshold",
      critical: true,
      projectId: null,
      sessionId: null,
      detail:
        `allowed rate ${allowedRate.toFixed(3)} (${allowed}/${decided}) < required minimum ` +
        `${tables.minAllowedRate} — the broker outcome distribution fails the R19 authorized-action ` +
        `acceptance`,
    });
  }
  const notObserved =
    decided === 0
      ? ({
          dimension: "authorized-actions",
          detail:
            "no real session recorded a DECIDED broker outcome (only unavailable decisions, zero real sessions, or NOT_OBSERVED) — the distribution is not observed",
        } satisfies PilotNotObserved)
      : null;
  return {
    gateId: "usability.broker_outcome_distribution",
    status: statusOf(violations, decided > 0),
    critical: true,
    tableVersion: tables.usabilityVersion,
    violations,
    notObserved,
    perProject: rollupsFor("usability.broker_outcome_distribution", violations, campaign),
    evidence: [
      { label: "allowed", value: allowed },
      { label: "refused", value: refused },
      { label: "unavailable", value: unavailable },
      { label: "allowedRate", value: allowedRate },
    ],
  };
}

/**
 * Usability gate 2 — context-switch distribution: the campaign-mean
 * external context switches per REAL session must stay within the
 * versioned budget (R19: "without routine context switching for the
 * targeted workflow"). Sessions without any recorded traversal evidence
 * make the dimension not observed → UNKNOWN.
 */
export function evaluateContextSwitchGate(
  campaign: PilotCampaignResult,
  tables: PilotGateTables,
): PilotGateResult {
  validateGateTables(tables);
  const views = dimensionObservedSessions(campaign, "return-path");
  const perSession: { projectId: string; sessionId: string; externalTrips: number }[] = [];
  for (const view of views) {
    const externalTrips = view.session.traversals.filter(isExternalTrip).length;
    perSession.push({ projectId: view.projectId, sessionId: view.sessionId, externalTrips });
  }
  const observed = perSession.length > 0;
  const mean = observed ? meanOf(perSession.map((entry) => entry.externalTrips)) : null;
  const violations: PilotGateViolation[] = [];
  if (mean !== null && mean > tables.maxMeanContextSwitches) {
    violations.push({
      gateId: "usability.context_switch_distribution",
      code: "context_switches_over_budget",
      critical: true,
      projectId: null,
      sessionId: null,
      detail:
        `campaign-mean external context switches per session ${mean.toFixed(3)} > budget ` +
        `${tables.maxMeanContextSwitches} — routine context switching fails the R19 primary-interface ` +
        `acceptance`,
    });
  }
  const notObserved =
    !observed
      ? ({
          dimension: "return-path",
          detail:
            "no real session with observed return-path dimension — context switching is not observed",
        } satisfies PilotNotObserved)
      : null;
  return {
    gateId: "usability.context_switch_distribution",
    status: statusOf(violations, observed),
    critical: true,
    tableVersion: tables.usabilityVersion,
    violations,
    notObserved,
    perProject: rollupsFor("usability.context_switch_distribution", violations, campaign),
    evidence: [
      { label: "sessionsEvaluated", value: perSession.length },
      { label: "meanExternalTripsPerSession", value: mean },
    ],
  };
}

/**
 * Usability gate 3 — return-path integrity (CRITICAL, R19 + the AISE-040
 * no-stranding contract): an external round trip that did NOT return via
 * its recorded return path strands the user outside the shell. Any
 * stranded trip fails the gate with project/session evidence.
 */
export function evaluateReturnPathIntegrityGate(
  campaign: PilotCampaignResult,
  tables: PilotGateTables,
): PilotGateResult {
  validateGateTables(tables);
  const views = dimensionObservedSessions(campaign, "return-path");
  const violations: PilotGateViolation[] = [];
  let externalTrips = 0;
  let returned = 0;
  for (const view of views) {
    for (const traversal of view.session.traversals) {
      if (!isExternalTrip(traversal)) {
        continue;
      }
      externalTrips += 1;
      if (traversal.returnedViaReturnPath === true) {
        returned += 1;
      } else {
        violations.push({
          gateId: "usability.return_path_integrity",
          code: "stranded_external_trip",
          critical: true,
          projectId: view.projectId,
          sessionId: view.sessionId,
          detail:
            `external trip '${traversal.traversalId}' to '${traversal.address}' did not return ` +
            `via its recorded return path — the user was stranded outside the AISE shell`,
        });
      }
    }
  }
  const notObserved =
    externalTrips === 0
      ? ({
          dimension: "return-path",
          detail:
            "no real session recorded an external round trip — return-path integrity is not observed",
        } satisfies PilotNotObserved)
      : null;
  return {
    gateId: "usability.return_path_integrity",
    status: statusOf(violations, externalTrips > 0),
    critical: true,
    tableVersion: tables.usabilityVersion,
    violations,
    notObserved,
    perProject: rollupsFor("usability.return_path_integrity", violations, campaign),
    evidence: [
      { label: "externalTrips", value: externalTrips },
      { label: "returnedViaReturnPath", value: returned },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The full gate evaluation + the R17 aggregate-hiding proof            */
/* ------------------------------------------------------------------ */

/** The complete technical gate evaluation over a pilot campaign. */
export interface PilotGateEvaluation {
  readonly results: readonly PilotGateResult[];
  /** Per-project rollup across ALL gates (every project visible, R17). */
  readonly perProject: readonly {
    readonly projectId: string;
    readonly icpClass: PilotIcpClass;
    readonly failedGateIds: readonly string[];
    readonly unknownGateIds: readonly string[];
    readonly criticalViolationCount: number;
  }[];
  readonly aggregateHiding: PilotAggregateHidingProof;
}

/**
 * The R17 proof applied to pilot gates: whether the CAMPAIGN AGGREGATES
 * (per-hop mean latency vs budgets) would have passed while a per-project
 * CRITICAL violation exists — the hiding case the §039 acceptance forbids.
 */
export interface PilotAggregateHidingProof {
  readonly campaignMeanWithinBudgets: boolean;
  readonly criticalViolationCount: number;
  readonly projectIdsWithCriticalViolations: readonly string[];
  /** True iff aggregates pass while critical per-instance violations exist. */
  readonly hiddenByCampaignAggregate: boolean;
}

/** Evaluate all eight technical gates over the campaign (one call). */
export function evaluatePilotGates(
  campaign: PilotCampaignResult,
  tables: PilotGateTables,
): PilotGateEvaluation {
  validateGateTables(tables);
  const results: PilotGateResult[] = [
    evaluateHopLatencyGate(campaign, tables),
    evaluateLatencyRegressionGate(campaign, tables),
    evaluatePermissionCoverageGate(campaign, tables),
    evaluateAuditCoverageGate(campaign, tables),
    evaluateScopeMinimalityGate(campaign, tables),
    evaluateBrokerOutcomeGate(campaign, tables),
    evaluateContextSwitchGate(campaign, tables),
    evaluateReturnPathIntegrityGate(campaign, tables),
  ];
  const perProject = campaign.projects.map((project) => {
    const failedGateIds: string[] = [];
    const unknownGateIds: string[] = [];
    let criticalViolationCount = 0;
    for (const result of results) {
      // Per-project FAILURE attribution comes from the gate's own rollup
      // (a campaign-wide failing gate is not mis-attributed to projects
      // that contributed no violation — R17 per-project honesty).
      const row = result.perProject.find((entry) => entry.projectId === project.projectId);
      if (row !== undefined && row.status === "FAIL") {
        failedGateIds.push(result.gateId);
      }
      if (result.status === "UNKNOWN") {
        unknownGateIds.push(result.gateId);
      }
      criticalViolationCount += result.violations.filter(
        (violation) => violation.critical && violation.projectId === project.projectId,
      ).length;
    }
    return {
      projectId: project.projectId,
      icpClass: project.icpClass,
      failedGateIds,
      unknownGateIds,
      criticalViolationCount,
    };
  });
  return {
    results,
    perProject,
    aggregateHiding: campaignAggregateHidingProof(campaign, results, tables),
  };
}

/** Compute the aggregate-hiding proof from a campaign + its gate results. */
export function campaignAggregateHidingProof(
  campaign: PilotCampaignResult,
  results: readonly PilotGateResult[],
  tables: PilotGateTables = PILOT_GATE_TABLES_V1,
): PilotAggregateHidingProof {
  const hopLatency = results.find((result) => result.gateId === "performance.hop_latency");
  const means =
    hopLatency !== undefined && "campaignMeanMsByHop" in hopLatency
      ? (hopLatency as HopLatencyGateResult).campaignMeanMsByHop
      : {};
  const budgetIndex = new Map(tables.hopBudgets.map((budget) => [budget.hopId, budget]));
  let campaignMeanWithinBudgets = true;
  for (const [hopId, mean] of Object.entries(means) as [PilotWalkHopId, number][]) {
    const budget = budgetIndex.get(hopId);
    if (budget !== undefined && mean > budget.budgetMs) {
      campaignMeanWithinBudgets = false;
    }
  }
  const criticalViolations = results.flatMap((result) =>
    result.violations.filter((violation) => violation.critical),
  );
  const projectIds = [
    ...new Set(criticalViolations.map((violation) => violation.projectId).filter((id) => id !== null)),
  ].sort();
  return {
    campaignMeanWithinBudgets,
    criticalViolationCount: criticalViolations.length,
    projectIdsWithCriticalViolations: projectIds,
    hiddenByCampaignAggregate:
      campaignMeanWithinBudgets && criticalViolations.length > 0,
  };
}
