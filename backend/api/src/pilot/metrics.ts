/**
 * AISE-039 — pilot adoption metrics, computed from EXECUTED records.
 *
 * THE CRITICAL ACCEPTANCE (loud): every adoption metric below is computed
 * ONLY from recorded pilot session activity that DROVE THE REAL MODULES —
 * sessions whose evidence is bound to campaign-executed end-to-end runs,
 * adoption-module migration-state records, recorded shell-broker
 * authorized-action outcomes and recorded deep-link/return-path
 * traversals. A metric whose evidence is synthetic-only (a projected user
 * count, a generated activity stream) is typed UNKNOWN with the missing
 * real-evidence requirement NAMED — never a number, never defaulted. Mixed
 * campaigns compute over the REAL sessions only, with the excluded
 * synthetic session count reported honestly in the metric's evidence.
 *
 * NOT_OBSERVED PROPAGATES: a metric whose dimension was not observed in
 * any real session (environment- or session-level NOT_OBSERVED
 * declarations, or simply no recorded observations of that kind) is typed
 * UNKNOWN with reason `dimension_not_observed` — the honest uncertainty
 * marker, exactly like the adoption module's UNKNOWN score components.
 *
 * INSUFFICIENT REAL EVIDENCE: a computed metric over fewer real sessions
 * than the required sample size is typed UNKNOWN with reason
 * `insufficient_real_evidence` (the number would be an anecdote, not a
 * pilot result).
 *
 * DETERMINISM: pure function of the campaign result; byte-identical
 * recomputation (the caller may digest the canonical JSON).
 */

import type { PilotCampaignResult } from "./campaign";
import {
  isExternalTrip,
  type PilotAdoptionMetricId,
  type PilotMetricUnknownReason,
} from "./model";

/* ------------------------------------------------------------------ */
/* Metric result model                                                  */
/* ------------------------------------------------------------------ */

/** The inspectable evidence trail behind a computed metric. */
export interface PilotMetricEvidence {
  readonly realSessionIds: readonly string[];
  readonly excludedSyntheticSessionCount: number;
  readonly excludedNotObservedSessionCount: number;
  /** Additional metric-specific evidence fields (never secrets). */
  readonly extras: readonly { readonly label: string; readonly value: number }[];
}

/** A COMPUTED metric: a number with its full derivation + evidence trail. */
export interface PilotComputedMetric {
  readonly kind: "computed";
  readonly metric: PilotAdoptionMetricId;
  readonly value: number;
  readonly unit: "ratio" | "count" | "sessions" | "ms";
  readonly derivation: string;
  readonly evidence: PilotMetricEvidence;
}

/**
 * An UNKNOWN metric: never a number, never defaulted. `reason` is typed;
 * `missingRealEvidence` names the REAL evidence the metric still needs.
 */
export interface PilotUnknownMetric {
  readonly kind: "unknown";
  readonly metric: PilotAdoptionMetricId;
  readonly reason: PilotMetricUnknownReason;
  readonly missingRealEvidence: string;
  readonly detail: string;
}

export type PilotMetricResult = PilotComputedMetric | PilotUnknownMetric;

/** The full adoption-metrics bundle over a campaign. */
export interface PilotAdoptionMetrics {
  readonly summary: {
    readonly realSessionCount: number;
    readonly syntheticSessionCount: number;
    readonly distinctRealPrincipals: number;
    readonly executedProjectCount: number;
    readonly syntheticProjectCount: number;
    /** The projected user count of a recorded synthetic projection, if any. */
    readonly projectedUsers: number | null;
    readonly syntheticGenerators: readonly string[];
  };
  readonly metrics: Readonly<Record<PilotAdoptionMetricId, PilotMetricResult>>;
}

export interface ComputeAdoptionMetricsOptions {
  /** Required real-session sample size per metric (default 1). */
  readonly minRealSessions?: number;
  /**
   * The routine context-switch budget PER SESSION for the adoption-rate
   * numerator (R19: "without routine context switching"). Default: the
   * shipped usability threshold table's per-session budget.
   */
  readonly routineContextSwitchBudget?: number;
}

/** The shipped default sample size (a single session is not a pilot). */
export const PILOT_DEFAULT_MIN_REAL_SESSIONS = 1;

/** The shipped per-session routine context-switch budget (R19). */
export const PILOT_ROUTINE_CONTEXT_SWITCH_BUDGET = 2;

/* ------------------------------------------------------------------ */
/* Internal session views                                               */
/* ------------------------------------------------------------------ */

interface SessionView {
  readonly projectId: string;
  readonly environmentId: string;
  readonly session: PilotCampaignResult["projects"][number]["sessions"][number];
  readonly notObserved: readonly string[];
}

function sessionViewsOf(campaign: PilotCampaignResult): {
  readonly real: readonly SessionView[];
  readonly synthetic: readonly SessionView[];
} {
  const real: SessionView[] = [];
  const synthetic: SessionView[] = [];
  const environmentById = new Map(
    campaign.environments.map((environment) => [environment.environmentId, environment]),
  );
  for (const project of campaign.projects) {
    const environment = environmentById.get(project.environmentId);
    const environmentDims = environment?.notObservedDimensions ?? [];
    for (const session of project.sessions) {
      const notObserved = [...new Set([...environmentDims, ...session.notObserved])].sort();
      const view: SessionView = {
        projectId: project.projectId,
        environmentId: project.environmentId,
        session,
        notObserved,
      };
      const isSynthetic = session.evidence.some((entry) => entry.kind === "synthetic_projection");
      if (isSynthetic) {
        synthetic.push(view);
      } else {
        real.push(view);
      }
    }
  }
  return { real, synthetic };
}

function unknown(
  metric: PilotAdoptionMetricId,
  reason: PilotMetricUnknownReason,
  missingRealEvidence: string,
  detail: string,
): PilotUnknownMetric {
  return { kind: "unknown", metric, reason, missingRealEvidence, detail };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function evidenceOf(
  used: readonly SessionView[],
  syntheticCount: number,
  notObservedCount: number,
  extras: readonly { readonly label: string; readonly value: number }[],
): PilotMetricEvidence {
  return {
    realSessionIds: used.map((view) => view.session.sessionId).sort(),
    excludedSyntheticSessionCount: syntheticCount,
    excludedNotObservedSessionCount: notObservedCount,
    extras,
  };
}

/* ------------------------------------------------------------------ */
/* R19 walk completion (derived, never claimed)                         */
/* ------------------------------------------------------------------ */

/**
 * Derive whether a session completed the targeted workflow IN AISE: every
 * walk hop ok-or-notApplicable (no failed hop), no stranded external trip,
 * and context switches within the routine budget. Derived from the record
 * — a session never claims its own success.
 */
export function sessionCompletedTargetedWorkflow(
  session: PilotSessionRecordLike,
  routineContextSwitchBudget: number,
): boolean {
  const walkOk = session.walk.every(
    (hop) => hop.outcome === "ok" || hop.outcome === "notApplicable",
  );
  if (!walkOk) {
    return false;
  }
  const externalTrips = session.traversals.filter(isExternalTrip);
  const stranded = externalTrips.some((trip) => trip.returnedViaReturnPath !== true);
  if (stranded) {
    return false;
  }
  return externalTrips.length <= routineContextSwitchBudget;
}

/** The minimal session shape the completion derivation needs. */
export interface PilotSessionRecordLike {
  readonly walk: readonly { readonly outcome: "ok" | "failed" | "notApplicable" }[];
  readonly traversals: readonly {
    readonly fromModule: string;
    readonly toModule: string;
    readonly returnedViaReturnPath: boolean | null;
  }[];
}

/* ------------------------------------------------------------------ */
/* The metrics                                                          */
/* ------------------------------------------------------------------ */

/**
 * Compute the full adoption-metrics bundle over a pilot campaign. Every
 * metric is computed from REAL (executed-record-bound) sessions only;
 * synthetic sessions are excluded and counted, never summed in.
 */
export function computeAdoptionMetrics(
  campaign: PilotCampaignResult,
  options: ComputeAdoptionMetricsOptions = {},
): PilotAdoptionMetrics {
  const minRealSessions = options.minRealSessions ?? PILOT_DEFAULT_MIN_REAL_SESSIONS;
  const routineBudget =
    options.routineContextSwitchBudget ?? PILOT_ROUTINE_CONTEXT_SWITCH_BUDGET;
  const { real, synthetic } = sessionViewsOf(campaign);
  const syntheticGenerators = [
    ...new Set(
      synthetic.flatMap((view) =>
        view.session.evidence
          .filter((entry) => entry.kind === "synthetic_projection")
          .map((entry) => (entry as { readonly generator: string }).generator),
      ),
    ),
  ].sort();
  const projectedUsers =
    campaign.projectedAdoption === undefined ? null : campaign.projectedAdoption.projectedUsers;
  const executedProjectCount = campaign.projects.filter(
    (project) => project.executed !== null,
  ).length;
  const syntheticProjectCount = campaign.projects.length - executedProjectCount;
  const distinctRealPrincipals = new Set(real.map((view) => view.session.principalId)).size;

  const metrics = {} as Record<PilotAdoptionMetricId, PilotMetricResult>;

  /* -- shared real-evidence preambles ---------------------------------- */
  const realEvidenceMissing = (metric: PilotAdoptionMetricId, what: string): PilotUnknownMetric => {
    if (real.length === 0) {
      return unknown(
        metric,
        "synthetic_only_evidence",
        `recorded pilot sessions that drove the real modules (${what})`,
        synthetic.length > 0
          ? `every recorded session is a synthetic projection (${syntheticGenerators.join(", ")}) — ${what} from executed records is entirely missing`
          : `no sessions were recorded at all — ${what} from executed records is entirely missing`,
      );
    }
    return unknown(
      metric,
      "insufficient_real_evidence",
      `at least ${String(minRealSessions)} real-evidence sessions (${what})`,
      `only ${String(real.length)} real-evidence session(s) were recorded — below the required sample size of ${String(minRealSessions)}`,
    );
  };

  /* -- 1. primary_interface_adoption_rate ------------------------------ */
  {
    const metric: PilotAdoptionMetricId = "primary_interface_adoption_rate";
    // Every real session carries the R19 walk by construction (the walk is
    // the targeted workflow); completion is DERIVED, never claimed.
    const eligible = real;
    const excludedNotObserved = 0;
    if (real.length < minRealSessions) {
      metrics[metric] = realEvidenceMissing(metric, "completed R19 walks");
    } else {
      const completed = eligible.filter((view) =>
        sessionCompletedTargetedWorkflow(view.session, routineBudget),
      );
      const value = ratio(completed.length, eligible.length);
      metrics[metric] = {
        kind: "computed",
        metric,
        value,
        unit: "ratio",
        derivation:
          `${completed.length} of ${eligible.length} real-evidence sessions completed the targeted ` +
          `workflow in AISE (walk hops ok/notApplicable, no stranded external trip, ≤ ${routineBudget} ` +
          `context switches) — synthetic sessions excluded (${synthetic.length}), NOT_OBSERVED excluded (${excludedNotObserved})`,
        evidence: evidenceOf(eligible, synthetic.length, excludedNotObserved, [
          { label: "completedSessions", value: completed.length },
        ]),
      };
    }
  }

  /* -- 2. authorized_action_success_rate ------------------------------- */
  {
    const metric: PilotAdoptionMetricId = "authorized_action_success_rate";
    const eligible = real.filter((view) => !view.notObserved.includes("authorized-actions"));
    const excludedNotObserved = real.length - eligible.length;
    let allowed = 0;
    let refused = 0;
    let undecided = 0;
    for (const view of eligible) {
      for (const action of view.session.authorizedActions) {
        if (action.decision === "allowed") {
          allowed += 1;
        } else if (action.decision === "refused") {
          refused += 1;
        } else {
          undecided += 1;
        }
      }
    }
    const decided = allowed + refused;
    if (real.length < minRealSessions) {
      metrics[metric] = realEvidenceMissing(metric, "recorded shell-broker authorized-action outcomes");
    } else if (decided === 0) {
      metrics[metric] = unknown(
        metric,
        "dimension_not_observed",
        "at least one DECIDED broker outcome (allowed or refused) recorded by a real session",
        `the authorized-actions dimension was not observed: ${undecided} action(s) were unavailable ` +
          `(authorization unknowable) and none were decided`,
      );
    } else {
      metrics[metric] = {
        kind: "computed",
        metric,
        value: ratio(allowed, decided),
        unit: "ratio",
        derivation:
          `${allowed} of ${decided} decided broker actions were allowed (${refused} refused); ` +
          `${undecided} unavailable outcomes are EXCLUDED (unknowable, never zero-defaulted) and ` +
          `reported here instead`,
        evidence: evidenceOf(eligible, synthetic.length, excludedNotObserved, [
          { label: "allowed", value: allowed },
          { label: "refused", value: refused },
          { label: "undecided", value: undecided },
        ]),
      };
    }
  }

  /* -- 3. return_path_completion_rate ---------------------------------- */
  {
    const metric: PilotAdoptionMetricId = "return_path_completion_rate";
    const eligible = real.filter((view) => !view.notObserved.includes("return-path"));
    const excludedNotObserved = real.length - eligible.length;
    let trips = 0;
    let returned = 0;
    for (const view of eligible) {
      for (const traversal of view.session.traversals) {
        if (isExternalTrip(traversal)) {
          trips += 1;
          if (traversal.returnedViaReturnPath === true) {
            returned += 1;
          }
        }
      }
    }
    if (real.length < minRealSessions) {
      metrics[metric] = realEvidenceMissing(metric, "recorded deep-link/return-path traversals");
    } else if (trips === 0) {
      metrics[metric] = unknown(
        metric,
        "dimension_not_observed",
        "at least one recorded external round trip by a real session",
        "no real session recorded an external round trip — the return-path dimension was not observed",
      );
    } else {
      metrics[metric] = {
        kind: "computed",
        metric,
        value: ratio(returned, trips),
        unit: "ratio",
        derivation:
          `${returned} of ${trips} external round trips returned via the recorded return path`,
        evidence: evidenceOf(eligible, synthetic.length, excludedNotObserved, [
          { label: "externalTrips", value: trips },
          { label: "returned", value: returned },
        ]),
      };
    }
  }

  /* -- 4. context_switches_per_session --------------------------------- */
  {
    const metric: PilotAdoptionMetricId = "context_switches_per_session";
    const eligible = real.filter((view) => !view.notObserved.includes("return-path"));
    const excludedNotObserved = real.length - eligible.length;
    const perSession = eligible.map(
      (view) => view.session.traversals.filter(isExternalTrip).length,
    );
    if (real.length < minRealSessions) {
      metrics[metric] = realEvidenceMissing(metric, "recorded external context switches");
    } else if (perSession.length === 0) {
      metrics[metric] = unknown(
        metric,
        "dimension_not_observed",
        "at least one real session with recorded traversal evidence",
        "the return-path dimension was not observed for any real session",
      );
    } else {
      const mean = perSession.reduce((sum, value) => sum + value, 0) / perSession.length;
      metrics[metric] = {
        kind: "computed",
        metric,
        value: mean,
        unit: "count",
        derivation:
          `mean external context switches per real session over ${perSession.length} sessions ` +
          `(lower is better; R19: no ROUTINE context switching for the targeted workflow)`,
        evidence: evidenceOf(eligible, synthetic.length, excludedNotObserved, [
          { label: "sessions", value: perSession.length },
          { label: "totalExternalTrips", value: perSession.reduce((sum, v) => sum + v, 0) },
        ]),
      };
    }
  }

  /* -- 5. workflow_migration_coverage ---------------------------------- */
  {
    const metric: PilotAdoptionMetricId = "workflow_migration_coverage";
    const targeted = campaign.targetedWorkflowSteps;
    const states = campaign.adoptionStates;
    if (states.length === 0) {
      const projection = campaign.projectedAdoption;
      metrics[metric] = unknown(
        metric,
        "no_adoption_state_records",
        "adoption-module migration-state records (AISE-041 candidates) for the targeted workflow steps",
        projection === undefined
          ? "no migration-state records and no projection were recorded — the adoption-states dimension is not observed"
          : `only a synthetic projection was recorded (generator '${projection.generator}', ` +
            `projected coverage ${String(projection.projectedCoverage)}, projected users ` +
            `${String(projection.projectedUsers)}) — a projection can never satisfy this metric`,
      );
    } else if (real.length === 0) {
      metrics[metric] = unknown(
        metric,
        "synthetic_only_evidence",
        "real pilot sessions whose activity drove the recorded adoption-module migration states",
        `migration-state records exist (${states.length} candidates) but NO real session references ` +
          `them — states no pilot session drove are not executed-record evidence`,
      );
    } else if (real.length < minRealSessions) {
      metrics[metric] = realEvidenceMissing(
        metric,
        "real pilot sessions referencing the recorded adoption-module migration states",
      );
    } else if (targeted.length === 0) {
      metrics[metric] = unknown(
        metric,
        "dimension_not_observed",
        "targeted incumbent workflow steps to compute coverage over",
        "the campaign declares no targeted workflow steps — coverage has no denominator",
      );
    } else {
      // A targeted step is covered iff a candidate sits at piloted/replaced
      // AND at least one REAL session's activity references it.
      const referencedCandidates = new Set(
        real.flatMap((view) => view.session.adoptionStateRefs),
      );
      const covered = new Set(
        states
          .filter(
            (candidate) =>
              (candidate.state === "piloted" || candidate.state === "replaced") &&
              referencedCandidates.has(candidate.candidateId),
          )
          .map((candidate) => `${candidate.workflowId}/${candidate.stepId}`),
      );
      const targetedKeys = targeted.map((step) => `${step.workflowId}/${step.stepId}`);
      const coveredCount = targetedKeys.filter((key) => covered.has(key)).length;
      metrics[metric] = {
        kind: "computed",
        metric,
        value: ratio(coveredCount, targetedKeys.length),
        unit: "ratio",
        derivation:
          `${coveredCount} of ${targetedKeys.length} targeted incumbent workflow steps are at AISE-041 ` +
          `migration state piloted or replaced AND referenced by real pilot sessions (adoption-module ` +
          `records: ${states.map((candidate) => `${candidate.candidateId}@${candidate.state}`).sort().join(", ")})`,
        evidence: evidenceOf(real, synthetic.length, 0, [
          { label: "targetedSteps", value: targetedKeys.length },
          { label: "coveredSteps", value: coveredCount },
          { label: "adoptionStateRecords", value: states.length },
        ]),
      };
    }
  }

  /* -- 6. distinct_pilot_principals ------------------------------------ */
  {
    const metric: PilotAdoptionMetricId = "distinct_pilot_principals";
    if (real.length < minRealSessions) {
      metrics[metric] = realEvidenceMissing(metric, "real pilot principals with executed-record-bound sessions");
    } else {
      metrics[metric] = {
        kind: "computed",
        metric,
        value: distinctRealPrincipals,
        unit: "count",
        derivation:
          `${distinctRealPrincipals} distinct principals drove real-evidence sessions ` +
          `(${real.length} sessions; synthetic sessions excluded: ${synthetic.length})`,
        evidence: evidenceOf(real, synthetic.length, 0, [
          { label: "realSessions", value: real.length },
        ]),
      };
    }
  }

  return {
    summary: {
      realSessionCount: real.length,
      syntheticSessionCount: synthetic.length,
      distinctRealPrincipals,
      executedProjectCount,
      syntheticProjectCount,
      projectedUsers,
      syntheticGenerators,
    },
    metrics,
  };
}
