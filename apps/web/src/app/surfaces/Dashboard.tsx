/**
 * PROD-002 — the Dashboard surface (the landing page of the golden
 * journey). PROD-017: the entry experience is TASK-FIRST — the
 * "What do you need to do?" intent form (a typed TaskIntent, W-R3) and
 * the current task's journey panel (NextBestAction-driven) render FIRST,
 * before the module-first journey map and dataset overview. The API mode,
 * the way into the demo/live projects, the journey map and a dataset
 * overview render from the frozen libraries' fixtures (demo mode) or the
 * live API (live mode).
 */

import { useCallback } from "react";
import type { ReactNode } from "react";
import { formatRoute } from "../router";
import { useResource } from "../resource";
import { isDemoMode, useAppEnvironment } from "../environment";
import {
  describeApiFailure,
  loadCaseSummariesLive,
  loadScenarioIndexLive,
  type CaseSummaryRecord,
  type ScenarioSummaryRecord,
} from "../api";
import {
  DEMO_PROJECT_ID,
  DEMO_SCENARIO_PROJECT_ID,
  demoBindings,
  demoEvidenceList,
  demoLensInput,
  demoProjects,
  demoScenario,
} from "../demo";
import { Card, DataBadge, EmptyState, ResourceView } from "../components";
import { plural } from "../format";
import { TaskFirstLanding } from "../task-first";

/** What the dashboard renders once loaded. */
export interface DashboardData {
  readonly mode: "demo" | "api";
  /** Demo-mode dataset overview (null in live mode). */
  readonly demo: {
    readonly projects: readonly { readonly projectId: string; readonly name: string; readonly note: string }[];
    readonly lens: {
      readonly items: number;
      readonly mapped: number;
      readonly ambiguous: number;
      readonly unmapped: number;
    };
    readonly scenario: { readonly title: string; readonly layers: number; readonly steps: number } | null;
    readonly connectors: number;
    readonly evidence: number;
  } | null;
  /** Live-mode deployment overview (null in demo mode). */
  readonly live: {
    readonly scenarios: readonly ScenarioSummaryRecord[];
    readonly cases: readonly CaseSummaryRecord[];
  } | null;
}

/** The dashboard surface. */
export function Dashboard(): ReactNode {
  const environment = useAppEnvironment();
  const load = useCallback(async () => {
    if (isDemoMode(environment) || environment.apiStatus === null) {
      // Demo mode (or still probing): the libraries' fixture world.
      const lens = demoLensInput(DEMO_PROJECT_ID);
      const scenario = demoScenario(DEMO_SCENARIO_PROJECT_ID);
      const bindings = demoBindings(DEMO_PROJECT_ID);
      const evidence = demoEvidenceList(DEMO_PROJECT_ID);
      const data: DashboardData = {
        mode: "demo",
        demo: {
          projects: demoProjects().map((project) => ({
            projectId: project.projectId,
            name: project.name,
            note: project.note,
          })),
          lens: {
            items: lens?.items.length ?? 0,
            mapped: lens?.items.filter((item) => item.mapping?.status === "mapped").length ?? 0,
            ambiguous:
              lens?.items.filter((item) => item.mapping?.status === "ambiguous").length ?? 0,
            unmapped:
              lens?.items.filter((item) => item.mapping?.status === "unmapped").length ?? 0,
          },
          scenario:
            scenario === null
              ? null
              : {
                  title: scenario.title,
                  layers: scenario.states.length,
                  steps: scenario.steps.length,
                },
          connectors: bindings.length,
          evidence: evidence.length,
        },
        live: null,
      };
      return { kind: "ready" as const, data };
    }
    const scenarios = await loadScenarioIndexLive(environment.fetchImpl);
    if (!scenarios.ok) {
      return { kind: "error" as const, message: describeApiFailure(scenarios.failure) };
    }
    const cases = await loadCaseSummariesLive(environment.fetchImpl);
    if (!cases.ok) {
      return { kind: "error" as const, message: describeApiFailure(cases.failure) };
    }
    const data: DashboardData = {
      mode: "api",
      demo: null,
      live: { scenarios: scenarios.scenarios, cases: cases.cases },
    };
    return { kind: "ready" as const, data };
  }, [environment]);

  const { state, reload } = useResource("dashboard", load);

  return (
    <>
      <div className="page-head">
        <h1>What do you need to do?</h1>
        <p>
          AISE turns site evidence into an engineering reality graph, explains
          cost scope, and lets you design and inspect proposed interventions —
          always keeping observed facts, derived interpretation and proposals
          distinct. Start from the task: state what you need to do and the
          journey follows.
        </p>
      </div>
      <TaskFirstLanding />
      <div className="page-head">
        <h2>Workspace overview</h2>
        <p>
          The deployment's records and the way into the product surfaces — for
          when you know where you are going.
        </p>
      </div>
      <ResourceView
        state={state}
        loadingLabel="Loading the workspace overview…"
        onRetry={reload}
        render={(data) => <DashboardBody data={data} />}
      />
    </>
  );
}

export function DashboardBody({ data }: { readonly data: DashboardData }): ReactNode {
  return (
    <div className="grid grid-2">
      <Card
        title="Start the journey"
        badge={<DataBadge mode={data.mode} />}
        meta={<span>landing → project → evidence → understanding → intervention → outcome</span>}
      >
        <ol className="journey">
          <li>
            <span className="journey-index" aria-hidden="true">
              1
            </span>
            <span className="journey-body">
              <a href={formatRoute({ name: "projects" })}>Open a project</a>
              <span className="journey-hint">
                Create or open the demo project — the pilot world or the
                intervention scenario project.
              </span>
            </span>
          </li>
          <li>
            <span className="journey-index" aria-hidden="true">
              2
            </span>
            <span className="journey-body">
              <a href={formatRoute({ name: "sitetwin", projectId: DEMO_PROJECT_ID })}>
                Browse the SiteTwin and its evidence
              </a>
              <span className="journey-hint">
                Synchronized 2D/3D views of the pinned model version, with the
                reality snapshot and its evidence records.
              </span>
            </span>
          </li>
          <li>
            <span className="journey-index" aria-hidden="true">
              3
            </span>
            <span className="journey-body">
              <a href={formatRoute({ name: "boq-lens", projectId: DEMO_PROJECT_ID })}>
                Understand the BOQ scope
              </a>
              <span className="journey-hint">
                Verbatim source rows, derived interpretation and mapping, honest
                totals — and what is still missing.
              </span>
            </span>
          </li>
          <li>
            <span className="journey-index" aria-hidden="true">
              4
            </span>
            <span className="journey-body">
              <a href={formatRoute({ name: "intervention", projectId: DEMO_SCENARIO_PROJECT_ID, query: {} })}>
                Step through an intervention
              </a>
              <span className="journey-hint">
                Proposed states layer by layer, with synchronized 3D / 2D / BOQ
                impact inspection.
              </span>
            </span>
          </li>
        </ol>
      </Card>
      <DatasetOverview data={data} />
    </div>
  );
}

function DatasetOverview({ data }: { readonly data: DashboardData }): ReactNode {
  if (data.mode === "demo" && data.demo !== null) {
    const demo = data.demo;
    return (
      <Card
        title="Demo dataset"
        badge={<DataBadge mode="demo" />}
        meta={
          <span>
            the built-in fixture world of the frozen libraries — shown because
            the API is unavailable on this origin
          </span>
        }
      >
        <div className="stat-row">
          <div className="stat">
            <div className="stat-value">{String(demo.projects.length)}</div>
            <div className="stat-label">demo projects</div>
          </div>
          <div className="stat">
            <div className="stat-value">{String(demo.lens.items)}</div>
            <div className="stat-label">BOQ rows in the lens</div>
          </div>
          <div className="stat">
            <div className="stat-value">
              {demo.scenario === null ? "—" : String(demo.scenario.layers)}
            </div>
            <div className="stat-label">intervention layers</div>
          </div>
          <div className="stat">
            <div className="stat-value">{String(demo.connectors)}</div>
            <div className="stat-label">connector bindings</div>
          </div>
        </div>
        <ul className="notes-list">
          <li>
            BOQ mapping coverage: {plural(demo.lens.mapped, "row")} mapped,{" "}
            {plural(demo.lens.ambiguous, "row")} ambiguous, {plural(demo.lens.unmapped, "row")}{" "}
            unmapped — ambiguity and gaps stay visible.
          </li>
          <li>
            {plural(demo.evidence, "evidence record")} in the pilot project,
            including one invalidated record (invalidated is a state, not a
            deletion).
          </li>
          {demo.scenario === null ? null : (
            <li>
              Intervention scenario “{demo.scenario.title}” — {demo.scenario.steps} steps,{" "}
              {demo.scenario.layers} proposed layers.
            </li>
          )}
        </ul>
      </Card>
    );
  }
  if (data.live !== null) {
    return (
      <Card
        title="Deployment overview"
        badge={<DataBadge mode="api" />}
        meta={<span>live records from the same-origin API</span>}
      >
        {data.live.scenarios.length === 0 && data.live.cases.length === 0 ? (
          <EmptyState
            title="No recorded scenarios or cases yet"
            guidance="This deployment answered the API but holds no intervention scenarios and no engineering cases. Record data through the API to populate the product surfaces."
          />
        ) : (
          <>
            <div className="stat-row">
              <div className="stat">
                <div className="stat-value">{String(data.live.scenarios.length)}</div>
                <div className="stat-label">intervention scenarios</div>
              </div>
              <div className="stat">
                <div className="stat-value">{String(data.live.cases.length)}</div>
                <div className="stat-label">engineering cases</div>
              </div>
            </div>
            {data.live.scenarios.length === 0 ? null : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Scenario</th>
                      <th>Project</th>
                      <th>Status</th>
                      <th>Layers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.live.scenarios.map((scenario) => (
                      <tr key={scenario.scenarioId}>
                        <td>{scenario.title}</td>
                        <td>
                          <span className="mono">{scenario.projectId}</span>
                        </td>
                        <td>{scenario.status}</td>
                        <td>{String(scenario.stateCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>
    );
  }
  return null;
}
