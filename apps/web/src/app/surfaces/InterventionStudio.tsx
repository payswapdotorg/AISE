/**
 * PROD-002 — the Intervention Studio surface (the "INTERVENTION STUDIO →
 * STEP THROUGH INTERVENTION STATES → INSPECT 2D+3D+BOQ IMPACT → RECORD
 * EXECUTION → COMPARE OUTCOME" tail of the golden journey): layer-by-layer
 * navigation through ONE intervention scenario's ordered PROPOSED states,
 * with synchronized 3D / 2D / BOQ panes projected from the viewer library's
 * ONE frame, plus the outcome loop (recorded executions and comparisons).
 *
 * Honesty (the §027 discipline):
 *  - EVERY state layer is a PROPOSED projection over the pinned baseline —
 *    the surface says so, prominently, and every pane is labeled PROPOSED;
 *  - scenario-authored elements render dashed (the library's presentation
 *    distinction over the verbatim origin vocabulary);
 *  - proposed removals (tombstones) render in their own list — never as
 *    silently deleted content;
 *  - navigation clamps at the layer edges with honest disabled controls;
 *  - the layer is deep-linkable (`?layer=N`) and back-button correct;
 *  - the BOQ pane lists proposed quantities VERBATIM — it does not compute
 *    quantities, costs or deltas (that is the impact engine's authority).
 */

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { useResource, type ResourceOutcome } from "../resource";
import { isDemoMode, useAppEnvironment } from "../environment";
import {
  describeApiFailure,
  loadComparisonsLive,
  loadExecutionsLive,
  loadScenarioIndexLive,
  loadScenarioLive,
  type ComparisonSummaryRecord,
  type ExecutionSummaryRecord,
} from "../api";
import { demoScenario } from "../demo";
import { viewerGeometries } from "../../viewer/fixtures";
import {
  DEFAULT_VIEW,
  navigationTargets,
  projectPane,
  projectStateBoq,
  propertyText,
  renderPaneSvg,
  removalText,
  rowQuantitiesText,
  type BoqRow,
  type GeometryRecord,
  type ViewerScenario,
} from "../../viewer";
import {
  Card,
  DataBadge,
  EmptyState,
  EpistemicBadge,
  Instant,
  LibrarySvg,
  ResourceView,
} from "../components";
import { ProjectSurfaceNav } from "../components";
import { formatRoute } from "../router";
import { plural, shortId } from "../format";

/** What the Intervention Studio renders once loaded. */
export interface InterventionData {
  readonly mode: "demo" | "api";
  readonly projectId: string;
  /** The scenario record (demo fixture or live adapter); null = none. */
  readonly scenario: ViewerScenario | null;
  /** The geometry records resolved for the scenario's states. */
  readonly geometries: readonly GeometryRecord[];
  /** Recorded executions for this scenario (live adapter; demo: none). */
  readonly executions: readonly ExecutionSummaryRecord[];
  /** Recorded comparisons for this project (live adapter; demo: none). */
  readonly comparisons: readonly ComparisonSummaryRecord[];
}

/** The Intervention Studio surface. */
export function InterventionStudio({
  projectId,
  layer,
}: {
  readonly projectId: string;
  /** The deep-linked layer index (already router-validated as ≥ 0). */
  readonly layer: number;
}): ReactNode {
  const environment = useAppEnvironment();
  const mode = environment.apiStatus?.mode ?? "probing";
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const load = useCallback(async (): Promise<ResourceOutcome<InterventionData>> => {
    if (isDemoMode(environment) || environment.apiStatus === null) {
      const scenario = demoScenario(projectId);
      return {
        kind: "ready",
        data: {
          mode: "demo",
          projectId,
          scenario,
          geometries: scenario === null ? [] : viewerGeometries(),
          executions: [],
          comparisons: [],
        },
      };
    }
    const index = await loadScenarioIndexLive(environment.fetchImpl);
    if (!index.ok) {
      return { kind: "error", message: describeApiFailure(index.failure) };
    }
    const matching = index.scenarios.filter((entry) => entry.projectId === projectId);
    const summary = matching[0] ?? null;
    if (summary === null) {
      return {
        kind: "ready",
        data: { mode: "api", projectId, scenario: null, geometries: [], executions: [], comparisons: [] },
      };
    }
    const loaded = await loadScenarioLive(environment.fetchImpl, summary.scenarioId);
    if (!loaded.ok) {
      return { kind: "error", message: describeApiFailure(loaded.failure) };
    }
    const [executions, comparisons] = await Promise.all([
      loadExecutionsLive(environment.fetchImpl),
      loadComparisonsLive(environment.fetchImpl),
    ]);
    if (!executions.ok) {
      return { kind: "error", message: describeApiFailure(executions.failure) };
    }
    if (!comparisons.ok) {
      return { kind: "error", message: describeApiFailure(comparisons.failure) };
    }
    return {
      kind: "ready",
      data: {
        mode: "api",
        projectId,
        scenario: loaded.scenario.record,
        geometries: [],
        executions: executions.executions.filter(
          (execution) => execution.scenarioId === summary.scenarioId,
        ),
        comparisons: comparisons.comparisons.filter(
          (comparison) => comparison.projectId === projectId,
        ),
      },
    };
  }, [environment, projectId]);

  const { state, reload } = useResource(`intervention:${projectId}:${mode}`, load);

  return (
    <>
      <div className="page-head">
        <p className="crumbs">
          <a href={formatRoute({ name: "projects" })}>Projects</a> /{" "}
          <a href={formatRoute({ name: "project", projectId })}>{projectId}</a>
        </p>
        <h1>Intervention Studio</h1>
        <p>
          Step through the scenario&apos;s ordered proposed states — every
          layer is a proposal over the pinned baseline, synchronized across
          the 3D, 2D and BOQ panes.
        </p>
      </div>
      <ProjectSurfaceNav projectId={projectId} current="intervention" />
      <ResourceView
        state={state}
        loadingLabel="Loading the intervention scenario…"
        onRetry={reload}
        render={(data) => (
          <StudioBody
            data={data}
            layer={layer}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        )}
      />
    </>
  );
}

export function StudioBody({
  data,
  layer,
  selectedNodeId,
  onSelectNode,
}: {
  readonly data: InterventionData;
  readonly layer: number;
  readonly selectedNodeId: string | null;
  readonly onSelectNode: (nodeId: string) => void;
}): ReactNode {
  if (data.scenario === null) {
    return (
      <Card title="Intervention scenario" badge={<DataBadge mode={data.mode} />}>
        <EmptyState
          title="No intervention scenario recorded for this project"
          guidance="A scenario is an ordered set of recorded steps over a pinned baseline version; its proposed states are materialized per layer. The demo dataset holds a scenario only for the intervention-scenario project."
          action={
            <a
              className="button"
              href={formatRoute({
                name: "intervention",
                projectId: "project-zurich-hq",
                query: {},
              })}
            >
              Open the demo scenario
            </a>
          }
        />
      </Card>
    );
  }
  const scenario = data.scenario;
  if (layer >= scenario.states.length) {
    return (
      <Card title="Intervention scenario" meta={<span className="mono">{scenario.scenarioId}</span>}>
        <div className="state state-error" role="alert">
          <p className="state-title">This layer does not exist</p>
          <p className="state-guidance">
            Layer {String(layer)} is outside the scenario&apos;s recorded range
            (0…{String(scenario.states.length - 1)}). Addressing a layer that
            does not exist is an error, never a silent clamp.
          </p>
          <div className="state-action">
            <a
              className="button"
              href={formatRoute({ name: "intervention", projectId: data.projectId, query: {} })}
            >
              Go to layer 0 (baseline overlay)
            </a>
          </div>
        </div>
      </Card>
    );
  }
  const { current, previous, next } = navigationTargets(scenario, layer);
  const stateLayer = scenario.states[layer]!;
  const boq = projectStateBoq(stateLayer);
  const pane3d = projectPane(stateLayer, data.geometries, {
    mode: "axonometric",
    view: DEFAULT_VIEW,
  });
  const pane2d = projectPane(stateLayer, data.geometries, { mode: "plan" });
  const selectedRow =
    selectedNodeId === null
      ? null
      : (boq.rows.find((row) => row.nodeId === selectedNodeId) ?? null);

  return (
    <>
      <Card
        title={scenario.title}
        badge={<DataBadge mode={data.mode} />}
        meta={
          <span>
            scenario <span className="mono">{scenario.scenarioId}</span> · status{" "}
            {scenario.status} · baseline{" "}
            <span className="mono">{scenario.baselineVersionId}</span> · created{" "}
            <Instant iso={scenario.createdAt} /> · updated <Instant iso={scenario.updatedAt} />
          </span>
        }
      >
        <div className="callout callout-warning">
          Every layer below is a <EpistemicBadge status="PROPOSED" /> projection
          over the pinned baseline. Approval is a review decision; observed
          reality changes only when post-execution evidence is recorded.
        </div>
        {scenario.approvalReference === null || scenario.approvalReference === undefined ? null : (
          <p className="pane-foot">
            Recorded review outcome: <strong>{scenario.approvalReference.reviewDecision}</strong>{" "}
            on case <span className="mono">{scenario.approvalReference.caseId}</span>, reviewed{" "}
            <Instant iso={scenario.approvalReference.reviewedAt} />.
          </p>
        )}
        <StatusTimeline scenario={scenario} />
      </Card>

      <Card
        title="Layer navigation"
        meta={
          <span>
            layer {String(current.stateIndex)} of {String(current.stateCount - 1)} · state{" "}
            <span className="mono" title={current.stateId}>
              {shortId(current.stateId)}
            </span>{" "}
            · applied steps{" "}
            {current.appliedStepIds.length === 0
              ? "none (baseline overlay)"
              : current.appliedStepIds.map((stepId) => shortId(stepId)).join(", ")}
          </span>
        }
      >
        <div className="toolbar">
          {current.atFirst ? (
            <button type="button" className="button button-secondary" disabled>
              Previous — already at layer 0
            </button>
          ) : (
            <a
              className="button button-secondary"
              href={formatRoute({
                name: "intervention",
                projectId: data.projectId,
                query: { layer: previous.stateIndex },
              })}
            >
              Previous — layer {String(previous.stateIndex)}
            </a>
          )}
          {current.atLast ? (
            <button type="button" className="button" disabled>
              Next — already at the last layer
            </button>
          ) : (
            <a
              className="button"
              href={formatRoute({
                name: "intervention",
                projectId: data.projectId,
                query: { layer: next.stateIndex },
              })}
            >
              Next — layer {String(next.stateIndex)}
            </a>
          )}
        </div>
        <div className="step-strip" aria-label="Scenario layers">
          {scenario.states.map((stateEntry, index) => {
            const step = index === 0 ? null : scenario.steps[index - 1] ?? null;
            return (
              <a
                key={stateEntry.stateId}
                className="step-chip"
                href={formatRoute({
                  name: "intervention",
                  projectId: data.projectId,
                  query: { layer: index },
                })}
                aria-current={index === layer ? "step" : undefined}
                title={step === null ? "baseline overlay" : `${step.kind} — ${step.rationale ?? ""}`}
              >
                L{String(index)}
                {step === null ? " · baseline" : ` · ${step.kind}`}
              </a>
            );
          })}
        </div>
        <StepList scenario={scenario} layer={layer} />
      </Card>

      <Card title="Synchronized panes" meta={<span>projected from ONE frame — they cannot desynchronize</span>}>
        <div className="pane-grid pane-grid-3">
          <div className="pane">
            <div className="pane-head">
              3D — axonometric <EpistemicBadge status="PROPOSED" />
              <span className="pane-sub">
                {plural(pane3d.shapes.length, "shape")} · {plural(pane3d.omissions.length, "omission")}
              </span>
            </div>
            <LibrarySvg
              svg={renderPaneSvg(pane3d, selectedNodeId ?? undefined)}
              title="Axonometric projection of the selected proposed state"
              onSelectNode={onSelectNode}
            />
            <div className="pane-foot">
              <OmissionList omissions={pane3d.omissions} />
            </div>
          </div>
          <div className="pane">
            <div className="pane-head">
              2D — plan <EpistemicBadge status="PROPOSED" />
              <span className="pane-sub">
                {plural(pane2d.shapes.length, "shape")} · {plural(pane2d.omissions.length, "omission")}
              </span>
            </div>
            <LibrarySvg
              svg={renderPaneSvg(pane2d, selectedNodeId ?? undefined)}
              title="Plan projection of the selected proposed state"
              onSelectNode={onSelectNode}
            />
            <div className="pane-foot">
              <OmissionList omissions={pane2d.omissions} />
            </div>
          </div>
          <div className="pane">
            <div className="pane-head">
              BOQ — proposed quantities <EpistemicBadge status="PROPOSED" />
              <span className="pane-sub">{plural(boq.rows.length, "live node")}</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Node</th>
                    <th>Kind</th>
                    <th>Proposed quantities (verbatim)</th>
                  </tr>
                </thead>
                <tbody>
                  {boq.rows.map((row) => (
                    <BoqRowView
                      key={row.nodeId}
                      row={row}
                      selected={row.nodeId === selectedNodeId}
                      onSelect={() => {
                        onSelectNode(row.nodeId);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pane-foot">
              Proposed quantities are carried verbatim — the viewer computes no
              quantities, costs or deltas (the impact engine owns those).
            </div>
          </div>
        </div>
        {boq.removals.length === 0 ? null : (
          <div className="callout callout-warning">
            <strong>Proposed removals in this layer</strong> — tombstones, never
            silent deletions:
            <ul className="notes-list">
              {boq.removals.map((removal) => (
                <li key={removal.nodeId}>{removalText(removal)}</li>
              ))}
            </ul>
          </div>
        )}
        {selectedRow === null ? (
          <EmptyState
            title="Nothing selected"
            guidance="Select a shape in a pane or a BOQ row to inspect the node's proposed properties."
          />
        ) : (
          <SelectedNodePanel row={selectedRow} />
        )}
      </Card>

      <OutcomeCard data={data} />
    </>
  );
}

function StatusTimeline({ scenario }: { readonly scenario: ViewerScenario }): ReactNode {
  return (
    <div className="step-strip" aria-label="Recorded status timeline">
      {scenario.transitions.map((transition, index) => (
        <span key={index} className="step-chip" aria-current={index === scenario.transitions.length - 1 ? "step" : undefined}>
          {transition.status} · <Instant iso={transition.at} />
        </span>
      ))}
    </div>
  );
}

function StepList({ scenario, layer }: { readonly scenario: ViewerScenario; readonly layer: number }): ReactNode {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>#</th>
            <th>Step</th>
            <th>Kind</th>
            <th>Target</th>
            <th>Rationale (verbatim)</th>
            <th>Provenance</th>
            <th>In this layer</th>
          </tr>
        </thead>
        <tbody>
          {scenario.steps.map((step) => {
            const applied = layer >= step.stepIndex;
            return (
              <tr key={step.stepId} data-applied={applied ? "true" : "false"}>
                <td>{String(step.stepIndex)}</td>
                <td className="mono" title={step.stepId}>
                  {shortId(step.stepId)}
                </td>
                <td>{step.kind}</td>
                <td className="mono">{step.targetNodeId}</td>
                <td>{step.rationale ?? "—"}</td>
                <td>
                  {step.provenance.evidenceIds.length === 0
                    ? step.provenance.derivationNote === undefined
                      ? "none recorded"
                      : `derivation: ${step.provenance.derivationNote}`
                    : step.provenance.evidenceIds.map((id) => shortId(id)).join(", ")}
                </td>
                <td>{applied ? "applied" : "not yet applied"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OmissionList({
  omissions,
}: {
  readonly omissions: readonly { readonly nodeId: string; readonly reason: string }[];
}): ReactNode {
  if (omissions.length === 0) {
    return <p>No omissions — every candidate resolved.</p>;
  }
  return (
    <div>
      Omitted (honest reasons — geometry is never guessed):
      <ul>
        {omissions.map((omission) => (
          <li key={omission.nodeId}>
            <span className="mono">{omission.nodeId}</span> — {omission.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BoqRowView({
  row,
  selected,
  onSelect,
}: {
  readonly row: BoqRow;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): ReactNode {
  return (
    <tr
      data-node-id={row.nodeId}
      data-origin={row.origin}
      data-selected={selected ? "true" : undefined}
      onClick={onSelect}
    >
      <td>
        <button type="button" className="row-select" onClick={onSelect} aria-label={`Inspect node ${row.nodeId}`}>
          <span className="mono">{row.nodeId}</span>
        </button>
      </td>
      <td>
        {row.kind}
        {row.origin === "scenario" ? (
          <span className="tag tag-origin-scenario"> scenario-authored</span>
        ) : row.origin === "baseline_touched" ? (
          <span className="tag tag-origin-touched"> baseline, touched</span>
        ) : null}
      </td>
      <td>{rowQuantitiesText(row)}</td>
    </tr>
  );
}

function SelectedNodePanel({ row }: { readonly row: BoqRow }): ReactNode {
  return (
    <section className="selection-panel" aria-label="Selected proposed node">
      <h3 className="pane-head">
        Selected node — <span className="mono">{row.nodeId}</span>{" "}
        <EpistemicBadge status="PROPOSED" />
      </h3>
      <dl className="fields">
        <div className="field">
          <dt>Kind</dt>
          <dd>{row.kind}</dd>
        </div>
        <div className="field">
          <dt>Origin in this layer</dt>
          <dd>
            {row.origin}
            {row.origin === "scenario"
              ? " — authored by a scenario step (drawn dashed in the geometric panes)"
              : ""}
          </dd>
        </div>
        <div className="field">
          <dt>Applied steps</dt>
          <dd>
            {row.appliedStepIds.length === 0
              ? "none (pure baseline overlay)"
              : row.appliedStepIds.map((stepId) => shortId(stepId)).join(", ")}
          </dd>
        </div>
      </dl>
      {row.properties.length === 0 ? (
        <p className="pane-foot">No proposed properties on this node.</p>
      ) : (
        <ul className="notes-list">
          {row.properties.map((property) => (
            <li key={property.key}>{propertyText(property)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OutcomeCard({ data }: { readonly data: InterventionData }): ReactNode {
  return (
    <Card
      title="Outcome loop"
      meta={<span>recorded executions and design-vs-as-built comparisons</span>}
    >
      {data.mode === "demo" ? (
        <>
          <EmptyState
            title="No executions recorded in the demo dataset"
            guidance="Executing a scenario and recording evidence of what was actually done is an API write (the executions namespace). Once recorded, executions and their outcome comparisons appear here — observed outcomes, visually distinct from the proposed states above."
          />
          <p className="pane-foot">
            The demo dataset carries the proposal side of the loop only — that
            is the honest state of a product walkthrough without a backend.
          </p>
        </>
      ) : data.executions.length === 0 && data.comparisons.length === 0 ? (
        <EmptyState
          title="No executions or comparisons recorded for this project"
          guidance="Record an execution against one of this scenario's states (POST /v1/executions) and compute a comparison against the captured reality; both then appear here."
        />
      ) : (
        <>
          {data.executions.length === 0 ? null : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Execution</th>
                    <th>State</th>
                    <th>Steps executed</th>
                    <th>Evidence</th>
                    <th>Outcomes</th>
                    <th>Executed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.executions.map((execution) => (
                    <tr key={execution.executionRecordId}>
                      <td className="mono">{execution.executionRecordId}</td>
                      <td className="mono" title={execution.stateId}>
                        {shortId(execution.stateId)}
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
          {data.comparisons.length === 0 ? null : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Comparison</th>
                    <th>Design source</th>
                    <th>Entries</th>
                    <th>Discrepancies</th>
                    <th>Computed</th>
                  </tr>
                </thead>
                <tbody>
                  {data.comparisons.map((comparison) => (
                    <tr key={comparison.comparisonId}>
                      <td className="mono">{comparison.comparisonId}</td>
                      <td>
                        <span className="mono">{comparison.designSourceRecordId}</span>
                        {comparison.designRevision === null ? "" : ` rev ${comparison.designRevision}`}
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
        </>
      )}
    </Card>
  );
}
