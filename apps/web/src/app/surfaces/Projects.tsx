/**
 * PROD-002 — the Projects surface: list the projects this deployment (or
 * the demo dataset) knows, open one, and explain honestly how provisioning
 * works (the identity API owns it — this shell is read-oriented).
 */

import { useCallback } from "react";
import type { ReactNode } from "react";
import { formatRoute, PROJECT_SURFACES, projectSurfaceRoute } from "../router";
import { useResource, type ResourceOutcome } from "../resource";
import { isDemoMode, useAppEnvironment } from "../environment";
import { describeApiFailure, loadScenarioIndexLive } from "../api";
import { demoProjects } from "../demo";
import { Card, DataBadge, EmptyState, ResourceView } from "../components";

/** One project entry the surface can list. */
export interface ProjectEntry {
  readonly projectId: string;
  readonly name: string;
  readonly note: string;
}

/** What the Projects surface renders once loaded. */
export interface ProjectsData {
  readonly mode: "demo" | "api";
  readonly entries: readonly ProjectEntry[];
}

/** The Projects surface. */
export function Projects(): ReactNode {
  const environment = useAppEnvironment();
  const load = useCallback(async (): Promise<ResourceOutcome<ProjectsData>> => {
    if (isDemoMode(environment) || environment.apiStatus === null) {
      const entries: readonly ProjectEntry[] = demoProjects().map((project) => ({
        projectId: project.projectId,
        name: project.name,
        note: project.note,
      }));
      return { kind: "ready", data: { mode: "demo", entries } };
    }
    // Live mode: the deployment's scenario index carries verbatim project
    // ids — the honest tenancy view this shell can assemble today (a full
    // organization listing needs an organization id from the identity API).
    const scenarios = await loadScenarioIndexLive(environment.fetchImpl);
    if (!scenarios.ok) {
      return { kind: "error" as const, message: describeApiFailure(scenarios.failure) };
    }
    const byProject = new Map<string, number>();
    for (const scenario of scenarios.scenarios) {
      byProject.set(scenario.projectId, (byProject.get(scenario.projectId) ?? 0) + 1);
    }
    const entries: readonly ProjectEntry[] = [...byProject.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([projectId, scenarioCount]) => ({
        projectId,
        name: projectId,
        note: `${String(scenarioCount)} recorded intervention ${
          scenarioCount === 1 ? "scenario" : "scenarios"
        } — projects are listed from the scenario index; the identity API owns the full tenancy registry.`,
      }));
    return { kind: "ready", data: { mode: "api", entries } };
  }, [environment]);

  const { state, reload } = useResource("projects", load);

  return (
    <>
      <div className="page-head">
        <h1>Projects</h1>
        <p>
          Open a project to walk the golden journey: evidence, SiteTwin, BOQ
          understanding, engineering case and intervention design.
        </p>
      </div>
      <ResourceView
        state={state}
        loadingLabel="Loading projects…"
        onRetry={reload}
        render={(data) => <ProjectsBody mode={data.mode} entries={data.entries} />}
      />
    </>
  );
}

export function ProjectsBody({
  mode,
  entries,
}: {
  readonly mode: "demo" | "api";
  readonly entries: readonly ProjectEntry[];
}): ReactNode {
  return (
    <div className="grid grid-2">
      {entries.length === 0 ? (
        <Card title="Projects" badge={<DataBadge mode={mode} />}>
          <EmptyState
            title="No projects are known to this deployment yet"
            guidance="Intervention scenarios, reality snapshots and cases are recorded per project through the AISE API. Once the first project has recorded data, it appears here."
          />
        </Card>
      ) : (
        entries.map((entry) => (
          <Card
            key={entry.projectId}
            title={entry.name}
            badge={<DataBadge mode={mode} />}
            meta={<span className="mono">{entry.projectId}</span>}
          >
            <p>{entry.note}</p>
            <div className="toolbar">
              <a className="button" href={formatRoute({ name: "project", projectId: entry.projectId })}>
                Open project
              </a>
            </div>
            <ul className="pill-list">
              {PROJECT_SURFACES.map((surface) => (
                <li key={surface.surface}>
                  <a
                    className="button button-secondary button-small"
                    href={formatRoute(projectSurfaceRoute(surface.surface, entry.projectId))}
                  >
                    {surface.label}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
      <Card title="Adding a new project">
        <p>
          Project provisioning is owned by the identity service: projects are
          created through the organization endpoint of the AISE API
          (<span className="mono">POST /v1/identity/organizations/:id/projects</span>),
          and engineering content (reality versions, evidence, cases,
          interventions) is recorded per project id.
        </p>
        <p>
          This product shell is read-oriented by design: it surfaces recorded
          engineering truth and authorized connector actions, and never creates
          engineering records in the browser.
        </p>
      </Card>
    </div>
  );
}
