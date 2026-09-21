/**
 * PROD-018 — the PLAN-VS-REALITY / BEFORE-AFTER MODEL (pure logic).
 *
 * The parity composition's easy-access navigation between the two sides
 * of every project surface (the competitor simulation's "Progress /
 * before-after" journey — AISE answers it with its own architectural
 * honesty, never a cloned progress dashboard):
 *
 *  - the PLAN side is the project's pinned projection workspace (the
 *    as-designed/reconstructed model the drawings and proposed states
 *    refer to) plus the intervention scenario's PROPOSED states;
 *  - the REALITY side is the project's reality snapshot (the captured,
 *    evidence-backed record) with its epistemic statuses and evidence;
 *  - BEFORE/AFTER pairs exist ONLY where records state them: the corpus
 *    world's scenario + outcome summaries (PROPOSED v3 → OBSERVED outcome
 *    with post-work evidence), and live executions/comparisons (the
 *    recorded design-vs-reality comparisons). A pair with no recorded
 *    outcome is the explicit absent state — a proposal without post-work
 *    evidence is never presented as an outcome.
 *
 * The two sides are DIFFERENT records with different version ids and stay
 * labeled as such (the architecture lock: proposed content is never
 * presented as observed reality). Determinism: pure functions; no clock,
 * no randomness, no IO, no React.
 */

import type { RealityPaneView } from "../shell";
import type { WorkspaceInput } from "../workspace";
import type { ViewerScenario } from "../viewer";
import type {
  InterventionScenarioSummary,
  OutcomeSummary,
} from "../app/task-contract";
import type {
  ComparisonSummaryRecord,
  ExecutionSummaryRecord,
} from "../app/api";
import { formatRoute } from "../app/router";
import { plural } from "../app/format";

/* ------------------------------------------------------------------ */
/* The plan-vs-reality projection                                       */
/* ------------------------------------------------------------------ */

/** One side of the plan-vs-reality view (a distinct record class). */
export interface PlanRealitySideView {
  readonly side: "plan" | "reality";
  /** The side's title (the record class, honestly named). */
  readonly title: string;
  /** The record id this side renders from (verbatim). */
  readonly recordId: string;
  /** The side's epistemic statement (carried verbatim from the records). */
  readonly epistemicStatement: string;
  /** Honest one-line facts (verbatim field joins). */
  readonly facts: readonly string[];
  /** The surface route this side opens (the app's real router). */
  readonly href: string;
}

/** The plan-vs-reality view of one project (both sides + the distinction note). */
export interface PlanRealityView {
  readonly projectId: string;
  readonly plan: PlanRealitySideView | null;
  readonly reality: PlanRealitySideView | null;
  /** The honest distinction statement (the architecture lock, verbatim). */
  readonly note: string;
}

/**
 * Project one project's plan (pinned workspace + proposed scenario
 * states) and reality (snapshot + evidence) into the two-sided view.
 * Either side may be absent — the honest empty state the caller renders.
 */
export function planRealityView(input: {
  readonly projectId: string;
  readonly workspace: WorkspaceInput | null;
  readonly reality: RealityPaneView | null;
  readonly evidenceCount: number;
  readonly scenario: ViewerScenario | null;
}): PlanRealityView {
  const { projectId, workspace, reality, evidenceCount, scenario } = input;
  const plan =
    workspace === null && scenario === null
      ? null
      : {
          side: "plan" as const,
          title: "Plan — the pinned, as-designed/reconstructed model",
          recordId:
            workspace?.drawing.sourceVersionId ?? scenario?.baselineVersionId ?? "",
          epistemicStatement:
            "projections and proposed states — never observed reality",
          facts: [
            ...(workspace === null
              ? []
              : [
                  `pinned drawing ${workspace.drawing.drawingId} (kind ${workspace.drawing.kind}) over model version ${workspace.drawing.sourceVersionId}`,
                  `${plural(workspace.drawing.elements.length, "drawn element")} · ${plural(workspace.drawing.omittedNodes.length, "omitted node")} (omissions are recorded, never guessed)`,
                ]),
            ...(scenario === null
              ? []
              : [
                  `intervention scenario ${scenario.scenarioId} (${scenario.status}) — ${plural(scenario.states.length, "proposed state layer")}, every layer PROPOSED over baseline ${scenario.baselineVersionId}`,
                ]),
          ],
          href: formatRoute({ name: "sitetwin", projectId }),
        };
  const realityView =
    reality === null
      ? null
      : {
          side: "reality" as const,
          title: "Reality — the captured, evidence-backed snapshot",
          recordId: reality.versionId,
          epistemicStatement: `${plural(
            reality.nodes.filter((node) => node.epistemicStatus === "CONFIRMED").length,
            "CONFIRMED node",
          )} · ${plural(
            reality.nodes.filter((node) => node.epistemicStatus === "OBSERVED").length,
            "OBSERVED node",
          )} · ${plural(
            reality.nodes.filter((node) => node.epistemicStatus === "INFERRED").length,
            "INFERRED node",
          )} — statuses carried verbatim from the snapshot`,
          facts: [
            `reality graph version ${reality.versionId} · ${plural(reality.nodes.length, "node")}`,
            `${plural(evidenceCount, "evidence record")} behind the snapshot`,
          ],
          href: formatRoute({ name: "sitetwin", projectId }),
        };
  return {
    projectId,
    plan,
    reality: realityView,
    note: "The plan and the reality are DIFFERENT records with different version ids — the drawing is a projection pinned to a model version, the snapshot is the reality graph; neither is presented as the other.",
  };
}

/* ------------------------------------------------------------------ */
/* Before/after pairs (executed work + comparisons)                     */
/* ------------------------------------------------------------------ */

/** One before/after pair (composed ONLY from recorded outcome records). */
export interface BeforeAfterPair {
  readonly pairId: string;
  readonly label: string;
  readonly before: {
    readonly label: string;
    readonly recordId: string;
    readonly state: string;
  };
  readonly after: {
    readonly label: string;
    readonly recordId: string;
    readonly state: string;
  };
  /** The post-work evidence the after side carries (verbatim ids). */
  readonly evidenceRefs: readonly string[];
  readonly comparisonAvailable: boolean;
  /** The recorded basis of the pair (never an inference). */
  readonly basis: string;
  readonly href: string;
}

/**
 * The composed before/after pairs of the CORPUS world's task-flow
 * summaries: the scenario summary (PROPOSED, pending-review) paired with
 * the outcome summary (OBSERVED, with post-work evidence) — one pair per
 * recorded outcome, plus the scenario's honest pending pair when no
 * outcome is recorded.
 */
export function summaryBeforeAfterPairs(
  projectId: string,
  scenario: InterventionScenarioSummary | null,
  outcome: OutcomeSummary | null,
): readonly BeforeAfterPair[] {
  const pairs: BeforeAfterPair[] = [];
  if (outcome !== null) {
    pairs.push({
      pairId: `summary:${outcome.outcomeId}`,
      label: "Executed work — proposal to observed outcome",
      before: {
        label: "the proposed intervention",
        recordId: scenario?.scenarioId ?? "—",
        state:
          scenario === null
            ? "no scenario summary recorded"
            : `PROPOSED v${String(scenario.version)} · approval ${scenario.approvalState}`,
      },
      after: {
        label: "the observed outcome",
        recordId: outcome.outcomeId,
        state: outcome.epistemicState,
      },
      evidenceRefs: [...outcome.postWorkEvidenceContentIds],
      comparisonAvailable: outcome.comparisonAvailable,
      basis: "the task-flow bundle's InterventionScenarioSummary + OutcomeSummary (server-owned contract objects)",
      href: formatRoute({ name: "outcomes", projectId }),
    });
    return pairs;
  }
  if (scenario !== null) {
    pairs.push({
      pairId: `summary:pending:${scenario.scenarioId}`,
      label: "Proposed intervention — awaiting execution evidence",
      before: {
        label: "the proposed intervention",
        recordId: scenario.scenarioId,
        state: `PROPOSED v${String(scenario.version)}`,
      },
      after: {
        label: "the observed outcome",
        recordId: "—",
        state: "NOT RECORDED — a proposal without post-work evidence is never presented as an outcome",
      },
      evidenceRefs: [],
      comparisonAvailable: false,
      basis: "the task-flow bundle's InterventionScenarioSummary; no OutcomeSummary is recorded for this project",
      href: formatRoute({ name: "outcomes", projectId }),
    });
  }
  return pairs;
}

/**
 * The composed before/after pairs from LIVE execution records: each
 * execution pairs the executed scenario state (with its executed steps
 * and evidence) with its recorded outcomes (the summary's outcomeCount);
 * each recorded comparison is its own design-vs-reality pair. The pairs
 * are field joins of the verbatim records — no status is invented.
 */
export function liveBeforeAfterPairs(
  projectId: string,
  executions: readonly ExecutionSummaryRecord[],
  comparisons: readonly ComparisonSummaryRecord[],
): readonly BeforeAfterPair[] {
  const pairs: BeforeAfterPair[] = [];
  for (const execution of executions) {
    pairs.push({
      pairId: `execution:${execution.executionRecordId}`,
      label: `Execution ${execution.executionRecordId}`,
      before: {
        label: "the executed scenario state",
        recordId: execution.stateId,
        state: `${plural(execution.executedStepCount, "step")} executed against scenario ${execution.scenarioId} (case ${execution.caseId})`,
      },
      after: {
        label: "the recorded outcomes",
        recordId: execution.executionRecordId,
        state: `${plural(execution.outcomeCount, "outcome")} · ${plural(execution.evidenceCount, "evidence record")}`,
      },
      evidenceRefs: [],
      // Honest field join: the deployment's recorded comparisons are the
      // comparison substrate; the execution summary itself carries no
      // comparison flag (stated in the basis, never inferred per-pair).
      comparisonAvailable: comparisons.length > 0,
      basis: `the executions namespace's summary record ${execution.executionRecordId} (executed ${execution.executedAt}); the summary carries no per-execution comparison flag — the project's recorded comparisons are the substrate`,
      href: formatRoute({ name: "outcomes", projectId }),
    });
  }
  for (const comparison of comparisons) {
    pairs.push({
      pairId: `comparison:${comparison.comparisonId}`,
      label: `Comparison ${comparison.comparisonId}`,
      before: {
        label: "the design side",
        recordId: comparison.designSourceRecordId,
        state: `source of record ${comparison.designSystemClass}${comparison.designRevision === null ? "" : ` rev ${comparison.designRevision}`}`,
      },
      after: {
        label: "the reality side",
        recordId: comparison.versionId,
        state: `${plural(comparison.totalEntries, "entry", "entries")} compared · ${plural(comparison.discrepancies, "discrepancy", "discrepancies")}`,
      },
      evidenceRefs: [],
      comparisonAvailable: true,
      basis: `the comparisons namespace's summary record ${comparison.comparisonId} (computed ${comparison.computedAt})`,
      href: formatRoute({ name: "outcomes", projectId }),
    });
  }
  return pairs;
}
