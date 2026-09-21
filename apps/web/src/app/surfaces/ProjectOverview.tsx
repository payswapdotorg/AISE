/**
 * PROD-002 — the Project overview surface (the "UNDERSTAND SCOPE + MISSING
 * EVIDENCE" step of the golden journey): the project's context record, its
 * reality scope, its BOQ scope and an honest inventory of what evidence is
 * missing — with the next journey steps one click away.
 *
 * Honesty: the context/reality/BOQ values are SourcedValues rendered with
 * their source notes; epistemic statuses are badges; the "missing evidence"
 * inventory counts what the records declare missing (unmapped/ambiguous BOQ
 * rows, declared missing evidence on the case, invalidated evidence) — it
 * never invents a gap and never hides one.
 */

import { useCallback } from "react";
import type { ReactNode } from "react";
import { useResource, type ResourceOutcome } from "../resource";
import { isDemoMode, useAppEnvironment } from "../environment";
import {
  describeApiFailure,
  loadRealityLive,
  loadScenarioIndexLive,
} from "../api";
import {
  demoBoqImport,
  demoCase,
  demoContext,
  demoEvidenceList,
  demoLensInput,
  demoReality,
} from "../demo";
import type {
  BoqPaneView,
  CasePaneView,
  ContextPaneView,
  RealityPaneView,
} from "../../shell";
import {
  Card,
  DataBadge,
  EmptyState,
  EpistemicBadge,
  Field,
  Instant,
  ResourceView,
  SourceNote,
} from "../components";
import { ProjectSurfaceNav } from "../components";
import { TaskFlowStrip } from "../task-first";
import { formatRoute } from "../router";
import { plural } from "../format";

/** What the overview renders once loaded. */
export interface ProjectOverviewData {
  readonly mode: "demo" | "api";
  readonly projectId: string;
  /** The demo dataset's records for this project (null in live mode). */
  readonly demo: {
    readonly context: ContextPaneView | null;
    readonly reality: RealityPaneView | null;
    readonly boqImport: BoqPaneView | null;
    readonly caseView: CasePaneView | null;
    readonly evidenceTotal: number;
    readonly evidenceInvalidated: number;
    readonly lens: {
      readonly total: number;
      readonly mapped: number;
      readonly ambiguous: number;
      readonly unmapped: number;
    } | null;
  } | null;
  /** The live deployment's records for this project (null in demo mode). */
  readonly live: {
    readonly reality: RealityPaneView | null;
    readonly scenarioCount: number;
  } | null;
}

/** The Project overview surface. */
export function ProjectOverview({
  projectId,
}: {
  readonly projectId: string;
}): ReactNode {
  const environment = useAppEnvironment();
  const mode = environment.apiStatus?.mode ?? "probing";
  const load = useCallback(async (): Promise<ResourceOutcome<ProjectOverviewData>> => {
    if (isDemoMode(environment) || environment.apiStatus === null) {
      const lens = demoLensInput(projectId);
      const evidence = demoEvidenceList(projectId);
      return {
        kind: "ready",
        data: {
          mode: "demo",
          projectId,
          demo: {
            context: demoContext(projectId),
            reality: demoReality(projectId),
            boqImport: demoBoqImport(projectId),
            caseView: demoCase(projectId),
            evidenceTotal: evidence.length,
            evidenceInvalidated: evidence.filter((entry) => entry.invalidationReason !== null)
              .length,
            lens:
              lens === null
                ? null
                : {
                    total: lens.items.length,
                    mapped: lens.items.filter((item) => item.mapping?.status === "mapped").length,
                    ambiguous: lens.items.filter((item) => item.mapping?.status === "ambiguous")
                      .length,
                    unmapped: lens.items.filter((item) => item.mapping?.status === "unmapped")
                      .length,
                  },
          },
          live: null,
        },
      };
    }
    const reality = await loadRealityLive(environment.fetchImpl, projectId);
    if (!reality.ok) {
      return { kind: "error", message: describeApiFailure(reality.failure) };
    }
    const scenarios = await loadScenarioIndexLive(environment.fetchImpl);
    if (!scenarios.ok) {
      return { kind: "error", message: describeApiFailure(scenarios.failure) };
    }
    return {
      kind: "ready",
      data: {
        mode: "api",
        projectId,
        demo: null,
        live: {
          reality: reality.view,
          scenarioCount: scenarios.scenarios.filter(
            (scenario) => scenario.projectId === projectId,
          ).length,
        },
      },
    };
  }, [environment, projectId]);

  const { state, reload } = useResource(`project-overview:${projectId}:${mode}`, load);

  return (
    <>
      <div className="page-head">
        <p className="crumbs">
          <a href={formatRoute({ name: "projects" })}>Projects</a> /{" "}
          <span className="mono">{projectId}</span>
        </p>
        <h1>Project overview</h1>
        <p>
          Scope and missing evidence — what this project&apos;s records state,
          and what they honestly do not cover yet.
        </p>
      </div>
      <TaskFlowStrip projectId={projectId} />
      <ProjectSurfaceNav projectId={projectId} current="overview" />
      <ResourceView
        state={state}
        loadingLabel="Loading the project scope…"
        onRetry={reload}
        render={(data) => <ProjectOverviewBody data={data} />}
      />
    </>
  );
}

export function ProjectOverviewBody({ data }: { readonly data: ProjectOverviewData }): ReactNode {
  return (
    <div className="grid grid-2">
      <ContextCard data={data} />
      <ScopeCard data={data} />
      <CostScopeCard data={data} />
      <MissingEvidenceCard data={data} />
    </div>
  );
}

function ContextCard({ data }: { readonly data: ProjectOverviewData }): ReactNode {
  if (data.demo !== null) {
    const context = data.demo.context;
    return (
      <Card
        title="Project context"
        badge={<DataBadge mode="demo" />}
        meta={context === null ? undefined : <SourceNote source={context.source} />}
      >
        {context === null ? (
          <EmptyState
            title="No context record for this project"
            guidance="The demo dataset holds no context record for this project id. Context records are assembled per project when evidence and reality versions are recorded."
            action={
              <a className="button" href={formatRoute({ name: "projects" })}>
                Back to projects
              </a>
            }
          />
        ) : (
          <dl className="fields">
            <Field label="Project name">{context.projectName.value}</Field>
            <Field label="Organization">
              <span className="mono">{context.organizationId}</span>
            </Field>
            <Field label="Phase">{context.phase.value}</Field>
            <Field label="Site">{context.site.value}</Field>
            <Field label="Latest reality version">
              {context.latestRealityVersionId === null
                ? "none recorded yet"
                : context.latestRealityVersionId.value}
            </Field>
            <Field label="BOQ imports">
              {context.boqImportIds.map((entry) => (
                <span key={entry.value} className="mono">
                  {entry.value}
                </span>
              ))}
            </Field>
            <Field label="Open cases">
              {context.openCaseIds.length === 0
                ? "none"
                : context.openCaseIds.map((entry) => (
                    <a
                      key={entry.value}
                      href={formatRoute({ name: "case", projectId: data.projectId })}
                    >
                      {entry.value}
                    </a>
                  ))}
            </Field>
          </dl>
        )}
      </Card>
    );
  }
  return (
    <Card title="Project context" badge={<DataBadge mode="api" />}>
      <EmptyState
        title="The context record is not exposed by a readable API route"
        guidance="This deployment answers the API, but the project-context assembly has no GET endpoint this build consumes. The scope below is assembled from the reality and intervention namespaces; organization and phase come from the identity registry."
      />
    </Card>
  );
}

function ScopeCard({ data }: { readonly data: ProjectOverviewData }): ReactNode {
  const reality = data.demo !== null ? data.demo.reality : data.live?.reality ?? null;
  const byStatus = new Map<string, number>();
  for (const node of reality?.nodes ?? []) {
    byStatus.set(node.epistemicStatus, (byStatus.get(node.epistemicStatus) ?? 0) + 1);
  }
  return (
    <Card
      title="Reality scope"
      badge={<DataBadge mode={data.mode} />}
      meta={
        reality === null ? undefined : (
          <span>
            version <span className="mono">{reality.versionId}</span> · recorded{" "}
            <Instant iso={reality.versionCreatedAt.value} />
          </span>
        )
      }
    >
      {reality === null ? (
        <EmptyState
          title="No reality snapshot recorded for this project"
          guidance="A reality snapshot is materialized when captured evidence is reconstructed into a Reality Graph version. Until then there is no observed scope to show — this is an honest empty state, not missing data."
          action={
            <a
              className="button"
              href={formatRoute({ name: "sitetwin", projectId: data.projectId })}
            >
              Open the SiteTwin surface
            </a>
          }
        />
      ) : (
        <>
          <div className="stat-row">
            <div className="stat">
              <div className="stat-value">{String(reality.nodes.length)}</div>
              <div className="stat-label">nodes in the snapshot</div>
            </div>
            <div className="stat">
              <div className="stat-value">
                {[...byStatus.entries()]
                  .map(([status, count]) => `${String(count)} ${status.toLowerCase()}`)
                  .join(" · ") || "—"}
              </div>
              <div className="stat-label">by epistemic status</div>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Kind</th>
                  <th>Epistemic status</th>
                  <th>Recorded properties</th>
                </tr>
              </thead>
              <tbody>
                {reality.nodes.map((node) => (
                  <tr key={node.nodeId}>
                    <td className="mono">{node.nodeId}</td>
                    <td>{node.kind}</td>
                    <td>
                      <EpistemicBadge status={node.epistemicStatus} />
                    </td>
                    <td>{node.summary.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pane-foot">
            Every node carries its evidence references on the{" "}
            <a href={formatRoute({ name: "sitetwin", projectId: data.projectId })}>
              SiteTwin / Evidence
            </a>{" "}
            surface.
          </p>
        </>
      )}
    </Card>
  );
}

function CostScopeCard({ data }: { readonly data: ProjectOverviewData }): ReactNode {
  if (data.demo !== null) {
    const boqImport = data.demo.boqImport;
    const lens = data.demo.lens;
    return (
      <Card
        title="Cost scope (BOQ)"
        badge={<DataBadge mode="demo" />}
        meta={
          boqImport === null ? undefined : (
            <span>
              import <span className="mono">{boqImport.importId}</span> ·{" "}
              {boqImport.format.value} · {plural(boqImport.sheets.length, "sheet")}
            </span>
          )
        }
      >
        {boqImport === null ? (
          <EmptyState
            title="No BOQ import recorded for this project"
            guidance="BOQ documents are imported as evidence and normalized per project. The demo dataset holds no BOQ import for this project id."
            action={
              <a
                className="button"
                href={formatRoute({ name: "boq-lens", projectId: data.projectId })}
              >
                Open the BOQ Lens anyway
              </a>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Sheet</th>
                    <th>Rows</th>
                    <th>Sections</th>
                  </tr>
                </thead>
                <tbody>
                  {boqImport.sheets.map((sheet) => (
                    <tr key={sheet.sheetName.value}>
                      <td>{sheet.sheetName.value}</td>
                      <td>{String(sheet.rowCount)}</td>
                      <td>{String(sheet.sectionCount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {lens === null ? null : (
              <p className="pane-foot">
                The lens maps {plural(lens.mapped, "row")} of {plural(lens.total, "row")} to
                reality elements — {plural(lens.ambiguous, "row")} ambiguous,{" "}
                {plural(lens.unmapped, "row")} unmapped. Ambiguity and gaps stay visible on the{" "}
                <a href={formatRoute({ name: "boq-lens", projectId: data.projectId })}>
                  BOQ Lens
                </a>{" "}
                surface.
              </p>
            )}
          </>
        )}
      </Card>
    );
  }
  return (
    <Card title="Cost scope (BOQ)" badge={<DataBadge mode="api" />}>
      <EmptyState
        title="BOQ scope requires the server-assembled lens input"
        guidance="The BOQ Lens renders from the joined import, normalization and mapping records. This build wires that join for the demo dataset; against the live API the lens surface states honestly what is unavailable."
        action={
          <a className="button" href={formatRoute({ name: "boq-lens", projectId: data.projectId })}>
            Open the BOQ Lens
          </a>
        }
      />
    </Card>
  );
}

function MissingEvidenceCard({ data }: { readonly data: ProjectOverviewData }): ReactNode {
  return (
    <Card title="Missing evidence" meta={<span>what the records declare missing</span>}>
      {data.demo !== null ? (
        <MissingEvidenceDemo demo={data.demo} projectId={data.projectId} />
      ) : (
        <MissingEvidenceLive
          scenarioCount={data.live?.scenarioCount ?? 0}
          projectId={data.projectId}
        />
      )}
    </Card>
  );
}

function MissingEvidenceDemo({
  demo,
  projectId,
}: {
  readonly demo: NonNullable<ProjectOverviewData["demo"]>;
  readonly projectId: string;
}): ReactNode {
  const caseView = demo.caseView;
  const items: readonly { readonly text: string }[] = [
    ...(demo.lens === null
      ? []
      : demo.lens.unmapped > 0
        ? [
            {
              text: `${plural(demo.lens.unmapped, "BOQ row")} not mapped to any reality element — the mapping records state why on the BOQ Lens surface.`,
            },
          ]
        : []),
    ...(demo.lens === null
      ? []
      : demo.lens.ambiguous > 0
        ? [
            {
              text: `${plural(demo.lens.ambiguous, "BOQ row")} with an ambiguous mapping — competing candidates are recorded, no target is committed.`,
            },
          ]
        : []),
    ...(caseView === null
      ? [{ text: "No engineering case recorded — no declared missing evidence either." }]
      : caseView.missingEvidenceCount > 0
        ? [
            {
              text: `${plural(caseView.missingEvidenceCount, "missing-evidence declaration")} on case ${caseView.caseId} — see the Engineering Case surface.`,
            },
          ]
        : []),
    ...(demo.evidenceInvalidated > 0
      ? [
          {
            text: `${plural(demo.evidenceInvalidated, "evidence record")} invalidated — invalidation is a state, not a deletion; the records stay visible.`,
          },
        ]
      : []),
  ];
  return (
    <>
      <div className="stat-row">
        <div className="stat">
          <div className="stat-value">{String(demo.evidenceTotal)}</div>
          <div className="stat-label">evidence records</div>
        </div>
        <div className="stat">
          <div className="stat-value">{String(demo.evidenceInvalidated)}</div>
          <div className="stat-label">invalidated (still visible)</div>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="pane-foot">
          The recorded evidence covers what the current cases ask for. New declarations appear
          here as cases record them.
        </p>
      ) : (
        <ul className="notes-list">
          {items.map((item, index) => (
            <li key={index}>{item.text}</li>
          ))}
        </ul>
      )}
      <div className="toolbar">
        <a className="button" href={formatRoute({ name: "case", projectId })}>
          Open the Engineering Case
        </a>
      </div>
    </>
  );
}

function MissingEvidenceLive({
  scenarioCount,
  projectId,
}: {
  readonly scenarioCount: number;
  readonly projectId: string;
}): ReactNode {
  return (
    <>
      <p className="pane-foot">
        {scenarioCount === 0
          ? "No intervention scenarios are recorded for this project yet."
          : `${plural(scenarioCount, "intervention scenario")} recorded for this project.`}{" "}
        Missing-evidence declarations live on engineering cases; this build reads the
        deployment-wide case list on the Engineering Case surface.
      </p>
      <div className="toolbar">
        <a className="button" href={formatRoute({ name: "intervention", projectId, query: {} })}>
          Intervention Studio
        </a>
      </div>
    </>
  );
}
