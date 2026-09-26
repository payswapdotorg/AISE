/**
 * PROD-018 — the OUTCOMES surface (outcome discovery, first-class).
 *
 * The parity composition's first-class surface for post-work evidence and
 * outcome comparison ("Review outcome" — the fourth canonical action):
 *
 *  - FIND outcomes by case, intervention or evidence (the recorded ids the
 *    outcome records carry — the search matches what the records state,
 *    never an interpretation);
 *  - BEFORE/AFTER pairs for executed work — composed ONLY from recorded
 *    outcome records (the task-flow bundle's scenario + outcome summaries;
 *    the live executions/comparisons namespaces). A proposal without
 *    post-work evidence is never presented as an outcome;
 *  - the OUTCOME BOUNDARY labels (uncertainty, provenance, verification)
 *    rendered at the consequential boundary where work becomes an
 *    observed outcome;
 *  - PLAN-VS-REALITY quick navigation (the composition's two-sided card).
 *
 * Honesty: demo mode composes the corpus world's task-flow objects (the
 * committed PROD-016 fixture values, explicitly badged demo); every other
 * project renders the honest empty state. Live mode consumes the real
 * executions/comparisons/scenario-index adapters (the same api.ts seams the
 * Intervention Studio uses — no second data path). Outcomes are OBSERVED
 * only with post-work evidence; epistemic states render verbatim.
 */

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useResource, type ResourceOutcome } from "../resource";
import { isDemoMode, useAppEnvironment } from "../environment";
import {
  describeApiFailure,
  loadComparisonsLive,
  loadExecutionsLive,
  loadScenarioIndexLive,
  type ComparisonSummaryRecord,
  type ExecutionSummaryRecord,
} from "../api";
import { demoScenario, demoWorkspaceInput, demoReality, demoEvidenceList } from "../demo";
import {
  DEMO_TASK_PROJECT_ID,
  demoTaskFlowBundle,
} from "../task-dataset";
import type { OutcomeSummary, TaskFlowBundle } from "../task-contract";
import {
  BeforeAfterCard,
  BoundaryLabelsCard,
  CanonicalActionBar,
  PlanRealityCard,
} from "../../parity/components";
import {
  liveBeforeAfterPairs,
  planRealityView,
  summaryBeforeAfterPairs,
} from "../../parity/plan-reality";
import { outcomeBoundaryLabels } from "../../parity/boundary-labels";
import {
  Card,
  DataBadge,
  EmptyState,
  EpistemicBadge,
  Instant,
  ResourceView,
} from "../components";
import { ProjectSurfaceNav } from "../components";
import { TaskFlowStrip } from "../task-first";
import { formatRoute } from "../router";
import { plural, shortId } from "../format";
import { postWorkCaptureHandoff } from "./CaptureMission";
import { formatFieldTaskDeepLink, type FieldTaskHandoff } from "@aise/adapter-contract/task-handoff";

/* ------------------------------------------------------------------ */
/* The outcome-search model (pure)                                     */
/* ------------------------------------------------------------------ */

/** What the outcome search composes over (the records this surface holds). */
export interface OutcomeSearchWorld {
  readonly bundle: TaskFlowBundle | null;
  readonly executions: readonly ExecutionSummaryRecord[];
  readonly comparisons: readonly ComparisonSummaryRecord[];
}

/** One outcome-search hit (the record + why it matched). */
export interface OutcomeSearchHit {
  readonly hitId: string;
  readonly kind: "outcome-summary" | "execution" | "comparison";
  readonly label: string;
  /** The recorded ids the query matched (case, intervention, evidence). */
  readonly matchedOn: readonly string[];
  readonly detail: string;
}

/**
 * Find outcomes by case, intervention or evidence: the query matches the
 * RECORDED ids the outcome records carry — a case id, a scenario id, an
 * execution/comparison/outcome id, a design source-of-record id, or a
 * post-work evidence content id. Pure: no IO, no clock.
 */
export function findOutcomes(
  query: string,
  world: OutcomeSearchWorld,
): readonly OutcomeSearchHit[] {
  const term = query.trim().toLowerCase();
  if (term === "") {
    return [];
  }
  const hits: OutcomeSearchHit[] = [];
  const matches = (value: string): boolean => value.toLowerCase().includes(term);
  const outcome = world.bundle?.outcome ?? null;
  if (outcome !== null) {
    const scenario = world.bundle?.scenario ?? null;
    const caseSummary = world.bundle?.caseSummary ?? null;
    const matchedOn = [
      ...(matches(outcome.outcomeId) ? [outcome.outcomeId] : []),
      ...outcome.postWorkEvidenceContentIds.filter(matches),
      ...(scenario !== null && matches(scenario.scenarioId) ? [scenario.scenarioId] : []),
      ...(caseSummary !== null && matches(caseSummary.caseId) ? [caseSummary.caseId] : []),
    ];
    if (matchedOn.length > 0) {
      hits.push({
        hitId: `outcome:${outcome.outcomeId}`,
        kind: "outcome-summary",
        label: `Outcome ${outcome.outcomeId}`,
        matchedOn,
        detail: `${outcome.epistemicState} · ${plural(outcome.postWorkEvidenceContentIds.length, "post-work evidence item")}${scenario === null ? "" : ` · from scenario ${scenario.scenarioId} (v${String(scenario.version)} ${scenario.epistemicState})`}`,
      });
    }
  }
  for (const execution of world.executions) {
    const matchedOn = [
      execution.executionRecordId,
      execution.caseId,
      execution.scenarioId,
      execution.stateId,
    ].filter(matches);
    if (matchedOn.length > 0) {
      hits.push({
        hitId: `execution:${execution.executionRecordId}`,
        kind: "execution",
        label: `Execution ${execution.executionRecordId}`,
        matchedOn,
        detail: `${plural(execution.executedStepCount, "step")} executed · ${plural(execution.outcomeCount, "outcome")} · ${plural(execution.evidenceCount, "evidence record")}`,
      });
    }
  }
  for (const comparison of world.comparisons) {
    const matchedOn = [
      comparison.comparisonId,
      comparison.projectId,
      comparison.versionId,
      comparison.designSourceRecordId,
    ].filter(matches);
    if (matchedOn.length > 0) {
      hits.push({
        hitId: `comparison:${comparison.comparisonId}`,
        kind: "comparison",
        label: `Comparison ${comparison.comparisonId}`,
        matchedOn,
        detail: `design ${comparison.designSystemClass} ${comparison.designSourceRecordId} vs reality ${comparison.versionId} · ${plural(comparison.totalEntries, "entry")} · ${plural(comparison.discrepancies, "discrepancy")}`,
      });
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/* The surface                                                          */
/* ------------------------------------------------------------------ */

/** What the Outcomes surface renders once loaded. */
export interface OutcomesData {
  readonly mode: "demo" | "api";
  readonly projectId: string;
  /** Demo mode: the corpus world's task-flow bundle (null for others). */
  readonly demo: {
    readonly bundle: TaskFlowBundle | null;
    readonly scenarioPresent: boolean;
  } | null;
  /** Live mode: the deployment's records for this project. */
  readonly live: {
    /** Executions whose scenario belongs to this project (scenario ids joined). */
    readonly executions: readonly ExecutionSummaryRecord[];
    /** The deployment-wide execution list (honestly stated as such). */
    readonly executionsTotal: number;
    readonly comparisons: readonly ComparisonSummaryRecord[];
    readonly scenarioIds: readonly string[];
  } | null;
}

/** The Outcomes surface (the "Review outcome" canonical action's home). */
export function Outcomes({ projectId }: { readonly projectId: string }): ReactNode {
  const environment = useAppEnvironment();
  const mode = environment.apiStatus?.mode ?? "probing";
  const [query, setQuery] = useState("");
  const load = useCallback(async (): Promise<ResourceOutcome<OutcomesData>> => {
    if (isDemoMode(environment) || environment.apiStatus === null) {
      const bundle =
        projectId === DEMO_TASK_PROJECT_ID ? demoTaskFlowBundle() : null;
      return {
        kind: "ready",
        data: {
          mode: "demo",
          projectId,
          demo: {
            bundle,
            scenarioPresent: demoScenario(projectId) !== null,
          },
          live: null,
        },
      };
    }
    const [executions, comparisons, scenarios] = await Promise.all([
      loadExecutionsLive(environment.fetchImpl),
      loadComparisonsLive(environment.fetchImpl),
      loadScenarioIndexLive(environment.fetchImpl),
    ]);
    if (!executions.ok) {
      return { kind: "error", message: describeApiFailure(executions.failure) };
    }
    if (!comparisons.ok) {
      return { kind: "error", message: describeApiFailure(comparisons.failure) };
    }
    if (!scenarios.ok) {
      return { kind: "error", message: describeApiFailure(scenarios.failure) };
    }
    const scenarioIds = scenarios.scenarios
      .filter((entry) => entry.projectId === projectId)
      .map((entry) => entry.scenarioId);
    return {
      kind: "ready",
      data: {
        mode: "api",
        projectId,
        demo: null,
        live: {
          // Executions carry no project attribution in this API build —
          // the honest join is the project's own scenario ids; the
          // deployment-wide total stays visible.
          executions: executions.executions.filter((execution) =>
            scenarioIds.includes(execution.scenarioId),
          ),
          executionsTotal: executions.executions.length,
          comparisons: comparisons.comparisons.filter(
            (comparison) => comparison.projectId === projectId,
          ),
          scenarioIds,
        },
      },
    };
  }, [environment, projectId]);

  const { state, reload } = useResource(`outcomes:${projectId}:${mode}`, load);
  const world = useMemo<OutcomeSearchWorld>(
    () => ({
      bundle: state.status === "ready" ? (state.data.demo?.bundle ?? null) : null,
      executions: state.status === "ready" ? (state.data.live?.executions ?? []) : [],
      comparisons: state.status === "ready" ? (state.data.live?.comparisons ?? []) : [],
    }),
    [state],
  );
  const hits = query.trim() === "" ? null : findOutcomes(query, world);

  return (
    <>
      <div className="page-head">
        <p className="crumbs">
          <a href={formatRoute({ name: "projects" })}>Projects</a> /{" "}
          <a href={formatRoute({ name: "project", projectId })}>{projectId}</a>
        </p>
        <h1>Outcomes</h1>
        <p>
          Post-work evidence and outcome comparison as a first-class step —
          what executed work changed, with the evidence that observed it.
        </p>
      </div>
      <TaskFlowStrip projectId={projectId} />
      <ProjectSurfaceNav projectId={projectId} current="outcomes" />
      <CanonicalActionBar projectId={projectId} current="review-outcome" />
      <ResourceView
        state={state}
        loadingLabel="Loading the project's outcomes…"
        onRetry={reload}
        render={(data) => (
          <OutcomesBody
            data={data}
            query={query}
            onQuery={setQuery}
            hits={hits}
          />
        )}
      />
    </>
  );
}

/** The Outcomes surface body (exported for static render tests). */
export function OutcomesBody({
  data,
  query,
  onQuery,
  hits,
}: {
  readonly data: OutcomesData;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly hits: readonly OutcomeSearchHit[] | null;
}): ReactNode {
  return (
    <>
      <Card
        title="Find outcomes"
        meta={
          <span>
            by case, intervention or evidence — the search matches the
            recorded ids the outcome records carry, never an interpretation
          </span>
        }
      >
        <div className="search-box">
          <input
            type="search"
            value={query}
            onChange={(event) => {
              onQuery(event.target.value);
            }}
            placeholder="case-…, scenario-…, execution/comparison id, post-work evidence id…"
            aria-label="Find outcomes by case, intervention or evidence"
          />
          {hits === null ? null : (
            <span className="inline-label" role="status">
              {plural(hits.length, "matching outcome record")}
            </span>
          )}
        </div>
        {hits === null ? (
          <p className="pane-foot">
            The project&apos;s outcome records render below; a search narrows
            them by their recorded case, intervention and evidence ids.
          </p>
        ) : hits.length === 0 ? (
          <EmptyState
            title="No outcome record matches this search"
            guidance="The search matches recorded case ids, scenario ids, execution/comparison ids, design source-of-record ids and post-work evidence content ids. Try a different term — nothing is inferred."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Matched on</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((hit) => (
                  <tr key={hit.hitId} data-hit-kind={hit.kind}>
                    <td>{hit.label}</td>
                    <td>
                      {hit.matchedOn.map((entry) => (
                        <span key={entry} className="mono">
                          {shortId(entry)}{" "}
                        </span>
                      ))}
                    </td>
                    <td>{hit.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data.demo !== null ? (
        <DemoOutcomes data={data} />
      ) : (
        <LiveOutcomes data={data} />
      )}

      <PostWorkCaptureBridgePanel
        projectId={data.projectId}
        mode={data.mode}
        outcome={data.demo?.bundle?.outcome ?? null}
        scenarioId={data.demo?.bundle?.scenario?.scenarioId ?? null}
        caseId={data.demo?.bundle?.caseSummary?.caseId ?? null}
        executions={data.live?.executions ?? []}
      />

      <PlanVsRealityForOutcomes data={data} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Demo mode (the corpus world's task-flow objects)                    */
/* ------------------------------------------------------------------ */

function DemoOutcomes({ data }: { readonly data: OutcomesData }): ReactNode {
  const bundle = data.demo?.bundle ?? null;
  if (bundle === null) {
    return (
      <Card title="Outcome records" badge={<DataBadge mode="demo" />}>
        <EmptyState
          title="No outcome records held for this project in the demo dataset"
          guidance="The committed demo task world holds the outcome summary on the corpus project; this project carries none — an honest empty state, never borrowed data. On a live deployment, executions and their outcomes record through the Intervention Studio's outcome-loop panels."
          action={
            data.demo?.scenarioPresent === true ? (
              <a
                className="button"
                href={formatRoute({
                  name: "intervention",
                  projectId: data.projectId,
                  query: {},
                })}
              >
                Open this project's proposed scenario
              </a>
            ) : (
              <a
                className="button"
                href={formatRoute({ name: "outcomes", projectId: DEMO_TASK_PROJECT_ID })}
              >
                Open the demo outcome journey
              </a>
            )
          }
        />
      </Card>
    );
  }
  const outcome = bundle.outcome;
  const scenario = bundle.scenario;
  const pairs = summaryBeforeAfterPairs(data.projectId, scenario, outcome);
  return (
    <>
      <Card
        title="The observed outcome"
        badge={<DataBadge mode={data.mode} />}
        meta={
          outcome === null ? undefined : (
            <span>
              the task-flow bundle&apos;s OutcomeSummary — recorded{" "}
              <Instant iso={outcome.updatedAt} />
            </span>
          )
        }
      >
        {outcome === null ? (
          <EmptyState
            title="No outcome summary recorded for this task"
            guidance="The bundle carries no OutcomeSummary — an outcome exists only when post-work evidence observes one."
          />
        ) : (
          <>
            <p>
              <EpistemicBadge status={outcome.epistemicState} /> outcome{" "}
              <span className="mono">{outcome.outcomeId}</span> —{" "}
              {outcome.comparisonAvailable
                ? "a before/after comparison is recorded as available"
                : "no before/after comparison is recorded"}
            </p>
            <p className="pane-foot">
              Post-work evidence (content ids, verbatim):{" "}
              {outcome.postWorkEvidenceContentIds.length === 0
                ? "none recorded"
                : outcome.postWorkEvidenceContentIds.map((id) => (
                    <span key={id} className="mono" title={id}>
                      {shortId(id)}{" "}
                    </span>
                  ))}
            </p>
            {scenario === null ? null : (
              <p className="pane-foot">
                From intervention{" "}
                <a
                  href={formatRoute({
                    name: "intervention",
                    projectId: data.projectId,
                    query: {},
                  })}
                >
                  {scenario.scenarioId}
                </a>{" "}
                (v{String(scenario.version)} · <EpistemicBadge status={scenario.epistemicState} /> ·
                approval {scenario.approvalState}) —{" "}
                {bundle.caseSummary === null
                  ? "no case summary recorded"
                  : `diagnosed through case ${bundle.caseSummary.caseId}`}{" "}
                —{" "}
                <a href={formatRoute({ name: "case", projectId: data.projectId })}>
                  open the case
                </a>
              </p>
            )}
          </>
        )}
      </Card>
      <BeforeAfterCard pairs={pairs} mode={data.mode} />
      <BoundaryLabelsCard
        sets={[
          outcomeBoundaryLabels(outcome, null, null),
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Live mode (the real executions/comparisons adapters)                */
/* ------------------------------------------------------------------ */

function LiveOutcomes({ data }: { readonly data: OutcomesData }): ReactNode {
  const live = data.live;
  if (live === null) {
    return null;
  }
  const boundarySets = [
    ...live.executions.map((execution) => outcomeBoundaryLabels(null, execution, null)),
    ...live.comparisons.map((comparison) => outcomeBoundaryLabels(null, null, comparison)),
  ];
  return (
    <>
      <Card
        title="Recorded executions"
        badge={<DataBadge mode={data.mode} />}
        meta={
          <span>
            the executions namespace — {plural(live.executions.length, "execution")}{" "}
            against this project&apos;s{" "}
            {plural(live.scenarioIds.length, "scenario")}
            {live.executionsTotal === live.executions.length
              ? ""
              : ` · ${plural(live.executionsTotal, "execution")} deployment-wide (executions carry no project attribution in this API build — the project's own scenarios are the honest join)`}
          </span>
        }
      >
        {live.executions.length === 0 ? (
          <EmptyState
            title="No executions recorded for this project's scenarios"
            guidance="Record the execution of an approved scenario state in the Intervention Studio's outcome loop — the executions namespace then lists it here with its outcomes and evidence."
            action={
              <a
                className="button"
                href={formatRoute({
                  name: "intervention",
                  projectId: data.projectId,
                  query: {},
                })}
              >
                Open the Intervention Studio
              </a>
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Execution</th>
                  <th>Case</th>
                  <th>Scenario</th>
                  <th>Steps executed</th>
                  <th>Evidence</th>
                  <th>Outcomes</th>
                  <th>Executed</th>
                </tr>
              </thead>
              <tbody>
                {live.executions.map((execution) => (
                  <tr key={execution.executionRecordId}>
                    <td className="mono">{execution.executionRecordId}</td>
                    <td>
                      <a href={formatRoute({ name: "case", projectId: data.projectId })}>
                        <span className="mono">{execution.caseId}</span>
                      </a>
                    </td>
                    <td>
                      <a
                        href={formatRoute({
                          name: "intervention",
                          projectId: data.projectId,
                          query: {},
                        })}
                      >
                        <span className="mono">{execution.scenarioId}</span>
                      </a>
                    </td>
                    <td>{String(execution.executedStepCount)}</td>
                    <td>{String(execution.evidenceCount)}</td>
                    <td>{String(execution.outcomeCount)}</td>
                    <td>
                      <Instant iso={execution.executedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card
        title="Design-vs-reality comparisons"
        badge={<DataBadge mode={data.mode} />}
        meta={<span>the comparisons namespace — the recorded before/after substrate</span>}
      >
        {live.comparisons.length === 0 ? (
          <EmptyState
            title="No comparisons recorded for this project"
            guidance="Run a reality-vs-design comparison against the pinned reality version (the Intervention Studio's comparison panel assembles the exact nested contract)."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Comparison</th>
                  <th>Design side (source of record)</th>
                  <th>Reality side</th>
                  <th>Entries</th>
                  <th>Discrepancies</th>
                  <th>Computed</th>
                </tr>
              </thead>
              <tbody>
                {live.comparisons.map((comparison) => (
                  <tr key={comparison.comparisonId}>
                    <td className="mono">{comparison.comparisonId}</td>
                    <td>
                      <span className="mono">{comparison.designSourceRecordId}</span>{" "}
                      ({comparison.designSystemClass}
                      {comparison.designRevision === null ? "" : ` rev ${comparison.designRevision}`})
                    </td>
                    <td>
                      <span className="mono">{comparison.versionId}</span>
                    </td>
                    <td>{String(comparison.totalEntries)}</td>
                    <td>{String(comparison.discrepancies)}</td>
                    <td>
                      <Instant iso={comparison.computedAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <BeforeAfterCard
        pairs={liveBeforeAfterPairs(data.projectId, live.executions, live.comparisons)}
        mode={data.mode}
      />
      {boundarySets.length === 0 ? null : (
        <BoundaryLabelsCard sets={boundarySets} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The plan-vs-reality quick navigation (composed from the demo world)  */
/* ------------------------------------------------------------------ */

function PlanVsRealityForOutcomes({ data }: { readonly data: OutcomesData }): ReactNode {
  const view =
    data.demo !== null
      ? planRealityView({
          projectId: data.projectId,
          workspace: demoWorkspaceInput(data.projectId),
          reality: demoReality(data.projectId),
          evidenceCount: demoEvidenceList(data.projectId).length,
          scenario: demoScenario(data.projectId),
        })
      : // Live mode: the plan/reality records render on their own surfaces;
        // this card composes the demo world's pinned records (the corpus
        // project holds none — the honest null).
        planRealityView({
          projectId: data.projectId,
          workspace: null,
          reality: null,
          evidenceCount: 0,
          scenario: null,
        });
  if (view.plan === null && view.reality === null) {
    return (
      <Card title="Plan vs reality" meta={<span>the two sides of this project</span>}>
        <EmptyState
          title="No plan or reality records composed for this view"
          guidance="Live deployments render the plan on the SiteTwin surface (the pinned projection workspace) and the reality snapshot beside it. This card composes the records this build's demo world holds for the project."
          action={
            <a className="button" href={formatRoute({ name: "sitetwin", projectId: data.projectId })}>
              Open the SiteTwin
            </a>
          }
        />
      </Card>
    );
  }
  return <PlanRealityCard view={view} />;
}

/* ------------------------------------------------------------------ */
/* POST-005 — the post-work capture return-path bridge (plan §5)        */
/* ------------------------------------------------------------------ */

/**
 * The post-work capture bridge (plan §5: "EXECUTE → ANDROID post-work
 * capture → WEB Outcome / Before-After"): from executed work directly to
 * "capture the completed condition → on this device or the field device →
 * for this outcome" — and the honest statement of what returns. The demo
 * side shows the COMPLETED return path (the outcome's own recorded
 * post-work evidence content ids — observed-only through new evidence);
 * the live side offers the handoff per recorded execution.
 */
export function PostWorkCaptureBridgePanel({
  projectId,
  mode,
  outcome,
  scenarioId,
  caseId,
  executions,
}: {
  readonly projectId: string;
  readonly mode: "demo" | "api";
  /** The task-flow bundle's outcome summary (demo mode). */
  readonly outcome: OutcomeSummary | null;
  readonly scenarioId: string | null;
  readonly caseId: string | null;
  /** The live executions (live mode). */
  readonly executions: readonly ExecutionSummaryRecord[];
}): ReactNode {
  const [prepared, setPrepared] = useState<FieldTaskHandoff | null>(null);
  return (
    <PostWorkCaptureBridgeBody
      projectId={projectId}
      mode={mode}
      outcome={outcome}
      scenarioId={scenarioId}
      caseId={caseId}
      executions={executions}
      prepared={prepared}
      onPrepare={() => {
        if (outcome !== null) {
          setPrepared(
            postWorkCaptureHandoff({
              projectId,
              taskId: `task-postwork-${outcome.outcomeId}`,
              intent:
                "Capture the completed condition of the executed work so the outcome record stays observed-only through new evidence — the before/after comparison and the plan-vs-reality check cite what was actually done.",
              targetRefs: [
                outcome.outcomeId,
                ...(scenarioId === null ? [] : [scenarioId]),
                ...(caseId === null ? [] : [caseId]),
              ],
              epistemicState: outcome.epistemicState,
              originSurface: "outcomes",
              versionContext: {},
              issuedAt: new Date().toISOString(),
            }),
          );
          return;
        }
        const first = executions[0] ?? null;
        if (first === null) {
          setPrepared(null);
          return;
        }
        setPrepared(
          postWorkCaptureHandoff({
            projectId,
            taskId: `task-postwork-${first.executionRecordId}`,
            intent:
              "Capture the completed condition of the executed work so the outcome record stays observed-only through new evidence.",
            targetRefs: [first.executionRecordId, first.caseId, first.scenarioId],
            // The execution record carries no epistemic-state field of its
            // own; the recorded state id is the execution's own statement.
            epistemicState: `executed (${first.stateId})`,
            originSurface: "outcomes",
            versionContext: {},
            issuedAt: new Date().toISOString(),
          }),
        );
      }}
    />
  );
}

/** The bridge body (exported for static render tests — pure projection). */
export function PostWorkCaptureBridgeBody({
  projectId,
  mode,
  outcome,
  scenarioId,
  caseId,
  executions,
  prepared,
  onPrepare,
}: {
  readonly projectId: string;
  readonly mode: "demo" | "api";
  readonly outcome: OutcomeSummary | null;
  readonly scenarioId: string | null;
  readonly caseId: string | null;
  readonly executions: readonly ExecutionSummaryRecord[];
  readonly prepared: FieldTaskHandoff | null;
  readonly onPrepare: () => void;
}): ReactNode {
  return (
    <Card
      title="Post-work evidence — the return path to this outcome loop"
      badge={<DataBadge mode={mode} />}
      meta={
        <span>
          executed work becomes an outcome ONLY through post-work evidence —
          the plan §5 bridge: execute → capture → outcome
        </span>
      }
    >
      {outcome !== null ? (
        <>
          <p data-postwork-lead="true">
            This outcome is <EpistemicBadge status={outcome.epistemicState} /> —
            {scenarioId === null ? "" : ` from scenario ${scenarioId}`}
            {caseId === null ? "" : ` on case ${caseId}`} —
            and it earned that state through its recorded post-work evidence:
            the content ids the outcome record itself carries.
          </p>
          <ul className="notes-list" data-postwork-landed="true">
            {outcome.postWorkEvidenceContentIds.map((contentId) => (
              <li key={contentId}>
                <span className="tag">post-work evidence</span>{" "}
                <span className="mono">{shortId(contentId)}</span> — captured
                in the field, synced through the ingestion gateway, and
                visible in this outcome loop (the search above finds it by
                this content id).
              </li>
            ))}
            {outcome.postWorkEvidenceContentIds.length === 0 ? (
              <li>no post-work evidence content ids recorded on this outcome</li>
            ) : null}
          </ul>
        </>
      ) : executions.length === 0 ? (
        <EmptyState
          title="No executed work to capture post-work evidence for"
          guidance="Executed interventions appear here with their post-work capture task — execute a validated solution in the Intervention Studio first. A proposal without post-work evidence is never presented as an outcome."
        />
      ) : (
        <p data-postwork-lead="true">
          {plural(executions.length, "recorded execution")} on this
          deployment — each is a post-work capture task away from its
          outcome record.
        </p>
      )}
      {outcome === null && executions.length === 0 ? null : (
        <div className="toolbar">
          <button
            type="button"
            className="button"
            onClick={onPrepare}
            data-postwork-prepare="idle"
          >
            Prepare the post-work capture handoff
          </button>
          <a
            className="button button-secondary"
            href={formatRoute({ name: "capture", projectId })}
            data-postwork-device="this-device"
          >
            Capture on this device
          </a>
        </div>
      )}
      {prepared === null ? null : (
        <div className="callout callout-info" data-postwork-handoff="true" role="status">
          <p>
            <strong>Post-work capture task ready.</strong> Open this link on
            the phone — the AISE Field app opens the post-work capture for
            this executed work:
          </p>
          <p className="mono pane-foot">
            <a href={formatFieldTaskDeepLink(prepared)}>{formatFieldTaskDeepLink(prepared)}</a>
          </p>
          <p className="pane-foot">
            task <span className="mono">{prepared.taskId}</span> · targets{" "}
            {prepared.targetRefs.join(", ")} · purpose {prepared.purpose} ·
            the outcome&apos;s epistemic state ({prepared.epistemicState})
            crosses the boundary verbatim — new evidence, never assertion,
            turns executed work into an observed outcome.
          </p>
        </div>
      )}
      <p className="pane-foot" data-postwork-return="true">
        The return path: the captured evidence syncs server-side
        (content-addressed, provenance preserved) and this loop surfaces it —
        the outcome search matches post-work evidence content ids, and the
        before/after and plan-vs-reality comparisons below cite what was
        actually done.
      </p>
    </Card>
  );
}
