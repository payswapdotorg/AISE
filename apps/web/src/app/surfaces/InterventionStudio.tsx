/**
 * PROD-002/010 — the Intervention Studio surface (the "INTERVENTION STUDIO →
 * STEP THROUGH INTERVENTION STATES → INSPECT 2D+3D+BOQ IMPACT → RECORD
 * EXECUTION → COMPARE OUTCOME" tail of the golden journey): layer-by-layer
 * navigation through ONE intervention scenario's ordered PROPOSED states,
 * with synchronized 3D / 2D / BOQ panes projected from the viewer library's
 * ONE frame, plus the governed outcome loop (approval, execution, OBSERVED
 * outcomes, reality-vs-design comparison).
 *
 * Honesty (the §027 discipline):
 *  - EVERY state layer is a PROPOSED projection over the pinned baseline —
 *    the surface says so, prominently, and every pane is labeled PROPOSED;
 *  - the scenario is deep-linkable (`?scenario=` + `?layer=`): an unknown
 *    scenario id renders a TYPED state, never a silent fallback; more than
 *    one scenario renders a selector whose selection IS navigation;
 *  - the approval panel NEVER auto-approves: only the governed transition
 *    table's allowed edges are offered, and `approved` requires a recorded
 *    approval reference (mirrored client-side BEFORE the write);
 *  - outcomes are ALWAYS OBSERVED — the outcome panel states the discipline;
 *  - every write panel is broker-gated and honestly DISABLED in demo mode
 *    (the shell never fabricates writes);
 *  - the BOQ pane lists proposed quantities VERBATIM — it does not compute
 *    quantities, costs or deltas (that is the impact engine's authority).
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useResource, type ResourceOutcome } from "../resource";
import { isDemoMode, useAppEnvironment } from "../environment";
import {
  appendStepLive,
  createLiveAuthorizationPort,
  createScenarioLive,
  describeApiFailure,
  loadCaseLineageLive,
  loadCaseSummariesLive,
  loadComparisonsLive,
  loadComparisonLive,
  loadEvidenceIndexLive,
  loadExecutionsLive,
  loadLatestRealityVersionLive,
  loadScenarioIndexLive,
  loadScenarioLive,
  recordApprovalReferenceLive,
  recordExecutionLive,
  recordOutcomeLive,
  runComparisonLive,
  transitionScenarioStatusLive,
  type CaseLineageRecord,
  type ComparisonDetailRecord,
  type ComparisonSummaryRecord,
  type ExecutionSummaryRecord,
} from "../api";
import {
  allowedScenarioTransitions,
  appendStepRequestBody,
  CASE_REVIEW_DECISIONS,
  createRecordAction,
  idListFromField,
  resolveCreateActionOffer,
  stateNodeOptions,
  STEP_KINDS,
  TERMINAL_SCENARIO_STATUSES,
  validateAppendStepDraft,
  validateApprovalReferenceDraft,
  validateNewScenarioDraft,
  type AppendStepDraft,
  type CreateActionOffer,
  type NewScenarioDraft,
  type StepKindValue,
} from "../create-forms";
import {
  recordExecutionAction,
  recordExecutionRequestBody,
  recordOutcomeAction,
  recordOutcomeRequestBody,
  runComparisonAction,
  runComparisonRequestBody,
  unknownStepRefs,
  validateComparisonDraft,
  validateExecutionDraft,
  validateOutcomeDraft,
  type ComparisonDraft,
  type ExecutionDraft,
  type OutcomeDraft,
} from "../outcome-forms";
import { evidenceOptionsFromDemo, evidenceOptionsFromLive, toggleEvidenceId } from "../evidence-picker";
import { demoEvidenceList, demoScenario } from "../demo";
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
  BaselinePicker,
  Card,
  CasePicker,
  CreateField,
  CreateRecordPanel,
  DataBadge,
  EmptyState,
  EpistemicBadge,
  EvidencePicker,
  Instant,
  LibrarySvg,
  ResourceView,
  StepPicker,
  type BaselinePickerState,
  type CreatePanelOutcome,
  type EvidencePickerStatus,
} from "../components";
import { ProjectSurfaceNav } from "../components";
import { formatRoute } from "../router";
import { plural, shortId } from "../format";
import { defaultOrganizationId, storeOrganizationId } from "./Projects";

/**
 * The session org context for panels that do not collect an org field:
 * the last-used organization of this session (the Projects/scenario
 * panels store it on use), the demo tenant's org in demo mode. The
 * authorization target is a UI-honesty gate — the SERVER enforces the
 * real tenant scopes on every write.
 */
function sessionOrganizationId(demo: boolean): string {
  return defaultOrganizationId(demo);
}

/** What the Intervention Studio renders once loaded. */
export interface InterventionData {
  readonly mode: "demo" | "api";
  readonly projectId: string;
  /** The scenario record (demo fixture or live adapter); null = none. */
  readonly scenario: ViewerScenario | null;
  /** The project's scenario summaries (the selector + typed unknown state). */
  readonly scenarioSummaries: readonly {
    readonly scenarioId: string;
    readonly title: string;
    readonly status: string;
    readonly stateCount: number;
  }[];
  /** The deep-linked scenario id when it matches NOTHING (typed, no fallback). */
  readonly unknownScenario: string | null;
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
  scenarioId,
}: {
  readonly projectId: string;
  /** The deep-linked layer index (already router-validated as ≥ 0). */
  readonly layer: number;
  /** The deep-linked scenario id (`?scenario=`, router-validated). */
  readonly scenarioId?: string;
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
          scenarioSummaries:
            scenario === null
              ? []
              : [
                  {
                    scenarioId: scenario.scenarioId,
                    title: scenario.title,
                    status: scenario.status,
                    stateCount: scenario.states.length,
                  },
                ],
          unknownScenario: null,
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
    const summaries = index.scenarios
      .filter((entry) => entry.projectId === projectId)
      .map((entry) => ({
        scenarioId: entry.scenarioId,
        title: entry.title,
        status: entry.status,
        stateCount: entry.stateCount,
      }));
    // Scenario resolution: the deep link is AUTHORITATIVE — an unknown id
    // renders the typed unknown state, never a silent fallback to the first
    // match; with no deep link the first summary loads.
    let summary = null as null | (typeof summaries)[number];
    let unknownScenario: string | null = null;
    if (scenarioId !== undefined) {
      summary = summaries.find((entry) => entry.scenarioId === scenarioId) ?? null;
      unknownScenario = summary === null ? scenarioId : null;
    } else {
      summary = summaries[0] ?? null;
    }
    if (summary === null) {
      return {
        kind: "ready",
        data: {
          mode: "api",
          projectId,
          scenario: null,
          scenarioSummaries: summaries,
          unknownScenario,
          geometries: [],
          executions: [],
          comparisons: [],
        },
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
        scenarioSummaries: summaries,
        unknownScenario,
        geometries: [],
        executions: executions.executions.filter(
          (execution) => execution.scenarioId === summary.scenarioId,
        ),
        comparisons: comparisons.comparisons.filter(
          (comparison) => comparison.projectId === projectId,
        ),
      },
    };
  }, [environment, projectId, scenarioId]);

  // The resource key includes the scenario id: deep-linking to another
  // scenario re-loads (never renders the previous scenario's record).
  const { state, reload } = useResource(
    `intervention:${projectId}:${mode}:${scenarioId ?? ""}`,
    load,
  );

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
            scenarioId={scenarioId}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onReload={reload}
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
  onReload,
}: {
  readonly data: InterventionData;
  readonly layer: number;
  readonly scenarioId?: string;
  readonly selectedNodeId: string | null;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onReload: () => void;
}): ReactNode {
  const environment = useAppEnvironment();
  const demo = data.mode === "demo";
  return (
    <>
      {data.unknownScenario === null ? null : (
        <Card title="Unknown scenario" badge={<DataBadge mode={data.mode} />}>
          <div className="state state-error" role="alert" data-unknown-scenario={data.unknownScenario}>
            <p className="state-title">This scenario id matches nothing recorded for the project</p>
            <p className="state-guidance">
              The deep link names scenario <span className="mono">{data.unknownScenario}</span> —
              the project carries {String(data.scenarioSummaries.length)} recorded{" "}
              {plural(data.scenarioSummaries.length, "scenario")}. Nothing was guessed and no
              fallback scenario was rendered.
            </p>
            <div className="state-action">
              {data.scenarioSummaries.length === 0 ? null : (
                <a
                  className="button"
                  href={formatRoute({
                    name: "intervention",
                    projectId: data.projectId,
                    query: { scenario: data.scenarioSummaries[0]?.scenarioId },
                  })}
                >
                  Open {data.scenarioSummaries[0]?.scenarioId}
                </a>
              )}
            </div>
          </div>
        </Card>
      )}
      {data.scenarioSummaries.length > 1 ? (
        <ScenarioSelector
          projectId={data.projectId}
          summaries={data.scenarioSummaries}
          currentScenarioId={data.scenario?.scenarioId ?? null}
          layer={layer}
        />
      ) : null}
      {data.scenario === null && data.unknownScenario === null ? (
        <>
          <Card title="Intervention scenario" badge={<DataBadge mode={data.mode} />}>
            <EmptyState
              title="No intervention scenario recorded for this project"
              guidance="A scenario is an ordered set of recorded steps over a pinned baseline version; its proposed states are materialized per layer. The first scenario can be created right here — the panel below offers the intervention API's create act through the authorization broker."
              action={
                <a className="button" href="#create-scenario">
                  Create the first scenario
                </a>
              }
            />
          </Card>
          <NewScenarioPanel
            projectId={data.projectId}
            mode={demo ? "demo" : "api"}
            principalId={environment.principalId}
            fetchImpl={environment.fetchImpl}
            authorization={demo ? undefined : createLiveAuthorizationPort(environment.fetchImpl)}
            onCreated={onReload}
          />
        </>
      ) : data.scenario === null ? null : (
        <ScenarioView
          data={data}
          layer={layer}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onReload={onReload}
        />
      )}
    </>
  );
}

/** The scenario selector: selection IS navigation (hash links, layer preserved). */
function ScenarioSelector({
  projectId,
  summaries,
  currentScenarioId,
  layer,
}: {
  readonly projectId: string;
  readonly summaries: readonly { readonly scenarioId: string; readonly title: string; readonly status: string; readonly stateCount: number }[];
  readonly currentScenarioId: string | null;
  readonly layer: number;
}): ReactNode {
  return (
    <Card
      title="Scenarios"
      meta={<span>more than one scenario is recorded — picking one navigates (the layer is preserved)</span>}
    >
      <ul className="notes-list" data-scenario-selector="true">
        {summaries.map((summary) => (
          <li key={summary.scenarioId}>
            <a
              className="button button-secondary"
              href={formatRoute({
                name: "intervention",
                projectId,
                query: { ...(layer > 0 ? { layer } : {}), scenario: summary.scenarioId },
              })}
              aria-current={summary.scenarioId === currentScenarioId ? "true" : undefined}
            >
              <span className="mono">{summary.scenarioId}</span>
            </a>{" "}
            “{summary.title}” · status {summary.status} · {String(summary.stateCount)}{" "}
            {plural(summary.stateCount, "state layer")}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The loaded scenario: the layer walk + the governed outcome loop. */
function ScenarioView({
  data,
  layer,
  selectedNodeId,
  onSelectNode,
  onReload,
}: {
  readonly data: InterventionData;
  readonly layer: number;
  readonly selectedNodeId: string | null;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onReload: () => void;
}): ReactNode {
  const environment = useAppEnvironment();
  const demo = data.mode === "demo";
  const scenario = data.scenario;
  if (scenario === null) {
    return null;
  }
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
              href={formatRoute({
                name: "intervention",
                projectId: data.projectId,
                query: { ...(scenario === null ? {} : { scenario: scenario.scenarioId }) },
              })}
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
  const noStates = scenario.states.length <= 1;

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

      <ApprovalPanel
        scenario={scenario}
        mode={demo ? "demo" : "api"}
        principalId={environment.principalId}
        fetchImpl={environment.fetchImpl}
        authorization={demo ? undefined : createLiveAuthorizationPort(environment.fetchImpl)}
        onTransitioned={onReload}
      />

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
        {noStates ? (
          <div className="callout callout-warning" data-no-states="true">
            <p>
              <strong>No steps are recorded on this scenario yet</strong> — only the
              baseline overlay exists. Append the first step to materialize a new
              proposed layer.
            </p>
            <div className="state-action">
              <a className="button" href="#append-step">
                Append the first step
              </a>
            </div>
          </div>
        ) : null}
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
                query: { layer: previous.stateIndex, scenario: scenario.scenarioId },
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
                query: { layer: next.stateIndex, scenario: scenario.scenarioId },
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
                  query: { layer: index, scenario: scenario.scenarioId },
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

      <AppendStepPanel
        scenario={scenario}
        stateLayer={stateLayer}
        mode={demo ? "demo" : "api"}
        principalId={environment.principalId}
        fetchImpl={environment.fetchImpl}
        authorization={demo ? undefined : createLiveAuthorizationPort(environment.fetchImpl)}
        onCreated={onReload}
      />

      <OutcomeLoopCard
        data={data}
        scenario={scenario}
        stateLayer={stateLayer}
        onReload={onReload}
      />
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

/* ------------------------------------------------------------------ */
/* The brokered create-scenario panel (baseline picker)                 */
/* ------------------------------------------------------------------ */

/**
 * The brokered create-scenario panel (intervention:write — POST
 * /v1/interventions). The baseline defaults to the project's LATEST reality
 * version (prefill only while untouched; a typed value is a manual
 * override) with the empty-vNNN trap called out by the BaselinePicker.
 */
export function NewScenarioPanel({
  projectId,
  mode,
  principalId,
  fetchImpl,
  authorization,
  onCreated,
}: {
  readonly projectId: string;
  readonly mode: "demo" | "api";
  readonly principalId: string;
  readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  readonly authorization?: Parameters<typeof resolveCreateActionOffer>[0]["authorization"];
  readonly onCreated: () => void;
}): ReactNode {
  const [organizationId, setOrganizationId] = useState(() => defaultOrganizationId(mode === "demo"));
  const [scenarioId, setScenarioId] = useState("");
  const [title, setTitle] = useState("");
  const [baseline, setBaseline] = useState("");
  const [baselineTouched, setBaselineTouched] = useState(false);
  const [baselineState, setBaselineState] = useState<BaselinePickerState>(
    mode === "demo" ? { kind: "demo" } : { kind: "loading" },
  );
  const [offer, setOffer] = useState<CreateActionOffer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CreatePanelOutcome | null>(null);

  useEffect(() => {
    if (mode !== "api") {
      setBaselineState({ kind: "demo" });
      return;
    }
    let cancelled = false;
    setBaselineState({ kind: "loading" });
    void loadLatestRealityVersionLive(fetchImpl, projectId).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setBaselineState({ kind: "failed", message: describeApiFailure(result.failure) });
        return;
      }
      setBaselineState(
        result.version === null
          ? { kind: "none" }
          : {
              kind: "ready",
              version: {
                versionId: result.version.versionId,
                createdAt: result.version.createdAt,
                nodeCount: result.version.nodeCount,
              },
            },
      );
      // Prefill ONLY while untouched: the latest version proposes itself,
      // a typed value is a manual override.
      setBaselineTouched((touched) => (touched ? touched : false));
      setBaseline((current) => (baselineTouched || current !== "" ? current : result.version?.versionId ?? ""));
    });
    return () => {
      cancelled = true;
    };
  }, [mode, fetchImpl, projectId]);

  const draft: NewScenarioDraft = {
    scenarioId,
    projectId,
    title,
    baselineVersionId: baselineTouched ? baseline : baseline,
  };
  const defects = validateNewScenarioDraft(draft);
  const askable = mode === "api" && organizationId.trim() !== "" && projectId.trim() !== "";

  useEffect(() => {
    if (!askable) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void resolveCreateActionOffer({
      authorization,
      descriptor: createRecordAction({
        actionId: "create-scenario",
        label: "Create intervention scenario",
        permission: "intervention:write",
        sourceModule: "case",
      }),
      bindingId: "intervention:create-scenario",
      returnTo: { module: "reality", projectId },
      principalId,
      target: { kind: "project", organizationId, projectId },
    }).then((resolved) => {
      if (!cancelled) {
        setOffer(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [askable, authorization, organizationId, principalId, projectId]);

  const submit = useCallback(async () => {
    if (mode !== "api" || defects.length > 0 || submitting) {
      return;
    }
    setSubmitting(true);
    const result = await createScenarioLive(fetchImpl, {
      scenarioId,
      projectId,
      title,
      baselineVersionId: baseline,
    });
    setSubmitting(false);
    if (result.ok) {
      // Remember the org this scenario was recorded under — the downstream
      // panels (append/approval/execution/outcome/comparison) ask their
      // authorization questions against the session org context.
      storeOrganizationId(organizationId);
      setOutcome({
        kind: "created",
        detail: `Scenario ${result.record.scenarioId} recorded over baseline ${result.record.baselineVersionId} (status ${result.record.status}).`,
        endpoint: result.endpoint,
      });
      onCreated();
    } else {
      setOutcome({ kind: "failed", detail: describeApiFailure(result.failure) });
    }
  }, [baseline, defects.length, fetchImpl, mode, onCreated, organizationId, projectId, scenarioId, submitting, title]);

  return (
    <CreateRecordPanel
      id="create-scenario"
      title="Create an intervention scenario"
      intro="A scenario is an ordered set of recorded steps over a PINNED baseline reality version (POST /v1/interventions). The panel is offered only when the broker answers an explicit intervention:write ALLOWED."
      offer={offer}
      mode={mode}
      draftValid={defects.length === 0}
      defects={defects}
      submitting={submitting}
      outcome={outcome}
      onSubmit={() => {
        void submit();
      }}
      submitLabel="Create scenario"
    >
      <CreateField
        label="Organization id"
        value={organizationId}
        onChange={setOrganizationId}
        hint="Prefilled from the acting context — hand-entry stays."
      />
      <CreateField label="Scenario id" value={scenarioId} onChange={setScenarioId} />
      <CreateField label="Title" value={title} onChange={setTitle} mono={false} />
      <BaselinePicker
        state={baselineState}
        value={baseline}
        onChange={(value) => {
          setBaselineTouched(true);
          setBaseline(value);
        }}
      />
    </CreateRecordPanel>
  );
}

/* ------------------------------------------------------------------ */
/* The brokered append-step panel                                       */
/* ------------------------------------------------------------------ */

/**
 * The brokered append-step panel (intervention:write — POST
 * /v1/interventions/:id/steps): the kind selector, the target-node picker
 * from the CURRENT materialized state's own nodes (free-entry fallback),
 * the per-kind fields, and provenance (EvidencePicker + derivation note).
 * Success reloads — the new layer materializes.
 */
export function AppendStepPanel({
  scenario,
  stateLayer,
  mode,
  principalId,
  fetchImpl,
  authorization,
  onCreated,
}: {
  readonly scenario: ViewerScenario;
  readonly stateLayer: ViewerScenario["states"][number];
  readonly mode: "demo" | "api";
  readonly principalId: string;
  readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  readonly authorization?: Parameters<typeof resolveCreateActionOffer>[0]["authorization"];
  readonly onCreated: () => void;
}): ReactNode {
  const [kind, setKind] = useState<StepKindValue>("property_change");
  const [targetNodeId, setTargetNodeId] = useState("");
  const [propertyLines, setPropertyLines] = useState("");
  const [nodeKind, setNodeKind] = useState("");
  const [parentNodeId, setParentNodeId] = useState("");
  const [reason, setReason] = useState("");
  const [text, setText] = useState("");
  const [rationale, setRationale] = useState("");
  const [evidenceField, setEvidenceField] = useState("");
  const [derivationNote, setDerivationNote] = useState("");
  const [evidenceStatus, setEvidenceStatus] = useState<EvidencePickerStatus>({ kind: "loading" });
  const [offer, setOffer] = useState<CreateActionOffer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CreatePanelOutcome | null>(null);

  useEffect(() => {
    if (mode !== "api") {
      setEvidenceStatus({ kind: "ready", options: evidenceOptionsFromDemo(demoEvidenceList(scenario.projectId)) });
      return;
    }
    let cancelled = false;
    setEvidenceStatus({ kind: "loading" });
    void loadEvidenceIndexLive(fetchImpl).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setEvidenceStatus({ kind: "failed", message: describeApiFailure(result.failure) });
        return;
      }
      setEvidenceStatus({ kind: "ready", options: evidenceOptionsFromLive(result.items) });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, fetchImpl, scenario.projectId]);

  const draft: AppendStepDraft = {
    kind,
    targetNodeId,
    ...(propertyLines.trim() === "" ? {} : { propertyLines }),
    ...(nodeKind.trim() === "" ? {} : { nodeKind }),
    ...(parentNodeId.trim() === "" ? {} : { parentNodeId }),
    ...(reason.trim() === "" ? {} : { reason }),
    ...(text.trim() === "" ? {} : { text }),
    ...(rationale.trim() === "" ? {} : { rationale }),
    provenanceEvidenceIds: idListFromField(evidenceField),
    ...(derivationNote.trim() === "" ? {} : { provenanceDerivationNote: derivationNote }),
  };
  const defects = validateAppendStepDraft(draft);
  const nodeOptions = stateNodeOptions(stateLayer);
  const askable = mode === "api" && targetNodeId.trim() !== "";

  useEffect(() => {
    if (!askable) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void resolveCreateActionOffer({
      authorization,
      descriptor: createRecordAction({
        actionId: "append-step",
        label: "Append intervention step",
        permission: "intervention:write",
        sourceModule: "case",
      }),
      bindingId: "intervention:append-step",
      returnTo: { module: "reality", projectId: scenario.projectId },
      principalId,
      target: { kind: "organization", organizationId: sessionOrganizationId(false) },
    }).then((resolved) => {
      if (!cancelled) {
        setOffer(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [askable, authorization, principalId, scenario.projectId]);

  const submit = useCallback(async () => {
    if (mode !== "api" || defects.length > 0 || submitting) {
      return;
    }
    const body = appendStepRequestBody(draft);
    if (!body.ok) {
      return;
    }
    setSubmitting(true);
    const result = await appendStepLive(fetchImpl, scenario.scenarioId, body.body);
    setSubmitting(false);
    if (result.ok) {
      setOutcome({
        kind: "created",
        detail: `Step ${result.record.step.stepId} (${result.record.step.kind} → ${result.record.step.targetNodeId}) recorded; state ${result.record.state.stateId} materialized as layer ${String(result.record.state.stateIndex)}.`,
        endpoint: result.endpoint,
      });
      onCreated();
    } else {
      setOutcome({ kind: "failed", detail: describeApiFailure(result.failure) });
    }
  }, [defects.length, draft, fetchImpl, mode, onCreated, scenario.scenarioId, submitting]);

  return (
    <CreateRecordPanel
      id="append-step"
      title="Append a step"
      intro="Steps append to the scenario's ordered record (POST /v1/interventions/:id/steps); each accepted step materializes the next proposed layer. The target-node picker lists the CURRENT materialized state's own nodes — hand-entry stays the fallback."
      offer={offer}
      mode={mode}
      draftValid={defects.length === 0}
      defects={defects}
      submitting={submitting}
      outcome={outcome}
      onSubmit={() => {
        void submit();
      }}
      submitLabel="Append step"
    >
      <CreateField
        label="Step kind"
        value={kind}
        onChange={(value) => {
          setKind(value as StepKindValue);
        }}
        options={STEP_KINDS.map((stepKind) => ({ value: stepKind, label: stepKind }))}
        hint="The AISE-026 frozen step-kind vocabulary, verbatim."
      />
      <CreateField
        label="Target node id"
        value={targetNodeId}
        onChange={setTargetNodeId}
        hint="Free entry stays available; the current state's own nodes are offered below."
      />
      {nodeOptions.length === 0 ? (
        <p className="state-guidance" data-picker-state="empty">
          The current state carries no nodes — hand-entry is the only path.
        </p>
      ) : (
        <fieldset className="picker" data-picker="target-node">
          <legend>Current state&apos;s nodes (layer {String(stateLayer.stateIndex)})</legend>
          <ul className="notes-list">
            {nodeOptions.map((option) => (
              <li key={option.nodeId}>
                <button
                  type="button"
                  className="button button-secondary button-small"
                  onClick={() => {
                    setTargetNodeId(option.nodeId);
                  }}
                >
                  Use <span className="mono">{option.nodeId}</span>
                </button>
                <span className="picker-caption"> — {option.label}</span>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      {kind === "property_change" || kind === "element_modification" ? (
        <CreateField
          label="Property lines (one `key = value unit` per line)"
          value={propertyLines}
          onChange={setPropertyLines}
          multiline
          hint={kind === "property_change" ? "property_change requires EXACTLY ONE line." : "element_modification requires AT LEAST ONE line."}
        />
      ) : null}
      {kind === "element_addition" ? (
        <>
          <CreateField label="New node kind" value={nodeKind} onChange={setNodeKind} hint="The reality NodeKind vocabulary, verbatim." />
          <CreateField label="Parent node id (optional host)" value={parentNodeId} onChange={setParentNodeId} />
          <CreateField
            label="New node property lines (optional, one `key = value unit` per line)"
            value={propertyLines}
            onChange={setPropertyLines}
            multiline
          />
        </>
      ) : null}
      {kind === "proposed_removal" ? (
        <CreateField label="Reason (a removal is never silent)" value={reason} onChange={setReason} multiline mono={false} />
      ) : null}
      {kind === "note" ? (
        <CreateField label="Note text" value={text} onChange={setText} multiline mono={false} />
      ) : null}
      <CreateField label="Rationale (optional, carried verbatim)" value={rationale} onChange={setRationale} mono={false} />
      <CreateField
        label="Provenance evidence ids (comma-separated, 64-hex)"
        value={evidenceField}
        onChange={setEvidenceField}
        hint="A step requires provenance — a non-empty evidence list and/or a derivation note."
      />
      <EvidencePicker
        status={evidenceStatus}
        value={evidenceField}
        onToggle={(evidenceId) => {
          setEvidenceField(toggleEvidenceId(evidenceField, evidenceId));
        }}
      />
      <CreateField label="Provenance derivation note" value={derivationNote} onChange={setDerivationNote} mono={false} />
    </CreateRecordPanel>
  );
}

/* ------------------------------------------------------------------ */
/* The governed approval panel                                          */
/* ------------------------------------------------------------------ */

/**
 * The governed approval panel (#scenario-approval): the current status, the
 * recorded audit, and the approval reference VERBATIM. ONLY the transition
 * table's allowed next statuses are offered; `approved` requires a recorded
 * approval reference (approval_reference_required mirrored client-side
 * BEFORE the write); terminal statuses render the honest no-transitions
 * note. This panel NEVER auto-approves.
 */
export function ApprovalPanel({
  scenario,
  mode,
  principalId,
  fetchImpl,
  authorization,
  onTransitioned,
}: {
  readonly scenario: ViewerScenario;
  readonly mode: "demo" | "api";
  readonly principalId: string;
  readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  readonly authorization?: Parameters<typeof resolveCreateActionOffer>[0]["authorization"];
  readonly onTransitioned: () => void;
}): ReactNode {
  const [nextStatus, setNextStatus] = useState("");
  const [caseId, setCaseId] = useState("");
  const [reviewDecision, setReviewDecision] = useState<string>(CASE_REVIEW_DECISIONS[0]);
  const [reviewedAt, setReviewedAt] = useState("");
  const [caseOptions, setCaseOptions] = useState<readonly { readonly caseId: string; readonly title: string }[]>([]);
  const [offer, setOffer] = useState<CreateActionOffer | null>(null);
  const [submitting, setSubmitting] = useState<"none" | "reference" | "transition">("none");
  const [outcome, setOutcome] = useState<CreatePanelOutcome | null>(null);

  const allowed = allowedScenarioTransitions(scenario.status);
  const terminal = (TERMINAL_SCENARIO_STATUSES as readonly string[]).includes(scenario.status);
  const effectiveNextStatus = nextStatus === "" ? (allowed[0] ?? "") : nextStatus;
  // The approval_reference_required mirror: transitioning to `approved`
  // demands a RECORDED reference — named BEFORE the write, never discovered
  // by a 422.
  const referenceRequired =
    effectiveNextStatus === "approved" && (scenario.approvalReference === null || scenario.approvalReference === undefined);

  useEffect(() => {
    if (mode !== "api") {
      return;
    }
    let cancelled = false;
    void loadCaseSummariesLive(fetchImpl).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setCaseOptions(result.cases.map((entry) => ({ caseId: entry.caseId, title: entry.title })));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, fetchImpl]);

  const referenceDraft = { caseId, reviewDecision, reviewedAt };
  const referenceDefects = caseId === "" && reviewedAt === "" ? [] : validateApprovalReferenceDraft(referenceDraft);

  useEffect(() => {
    if (mode !== "api") {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void resolveCreateActionOffer({
      authorization,
      descriptor: createRecordAction({
        actionId: "scenario-approval",
        label: "Record approval reference / transition status",
        permission: "intervention:write",
        sourceModule: "case",
      }),
      bindingId: "intervention:scenario-approval",
      returnTo: { module: "reality", projectId: scenario.projectId },
      principalId,
      target: { kind: "organization", organizationId: sessionOrganizationId(false) },
    }).then((resolved) => {
      if (!cancelled) {
        setOffer(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [authorization, mode, principalId, scenario.projectId]);

  const submitReference = useCallback(async () => {
    if (mode !== "api" || referenceDefects.length > 0 || submitting !== "none") {
      return;
    }
    setSubmitting("reference");
    const result = await recordApprovalReferenceLive(fetchImpl, scenario.scenarioId, {
      caseId,
      reviewDecision,
      reviewedAt,
    });
    setSubmitting("none");
    if (result.ok) {
      setOutcome({
        kind: "created",
        detail: `Approval reference recorded on case ${caseId} (decision ${reviewDecision}) — the scenario carries it verbatim now.`,
        endpoint: result.endpoint,
      });
      onTransitioned();
    } else {
      setOutcome({ kind: "failed", detail: describeApiFailure(result.failure) });
    }
  }, [caseId, mode, onTransitioned, referenceDefects.length, reviewDecision, scenario.scenarioId, submitting]);

  const submitTransition = useCallback(async () => {
    if (mode !== "api" || effectiveNextStatus === "" || referenceRequired || submitting !== "none") {
      return;
    }
    setSubmitting("transition");
    const result = await transitionScenarioStatusLive(fetchImpl, scenario.scenarioId, {
      status: effectiveNextStatus,
    });
    setSubmitting("none");
    if (result.ok) {
      setOutcome({
        kind: "created",
        detail: `Status transition recorded: ${scenario.status} → ${effectiveNextStatus}.`,
        endpoint: result.endpoint,
      });
      onTransitioned();
    } else {
      setOutcome({ kind: "failed", detail: describeApiFailure(result.failure) });
    }
  }, [effectiveNextStatus, fetchImpl, mode, onTransitioned, referenceRequired, scenario.scenarioId, scenario.status, submitting]);

  return (
    <CreateRecordPanel
      id="scenario-approval"
      title="Scenario approval (governed)"
      intro="Approval is a review decision recorded on a case — never an observed reality. This panel never auto-approves: a status transition is an explicit write against the governed table."
      offer={offer}
      mode={mode}
      draftValid={!referenceRequired}
      defects={[
        ...(referenceRequired
          ? [
              `approval_reference_required: transitioning to approved requires a recorded approval reference — record one below first (the scenario carries none yet)`,
            ]
          : []),
        ...referenceDefects,
      ]}
      submitting={submitting !== "none"}
      outcome={outcome}
      onSubmit={() => {
        void submitTransition();
      }}
      submitLabel={`Transition status${effectiveNextStatus === "" ? "" : ` → ${effectiveNextStatus}`}`}
    >
      <div className="stat-row">
        <div className="stat">
          <div className="stat-value">{scenario.status}</div>
          <div className="stat-label">current status (verbatim)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{String(scenario.transitions.length)}</div>
          <div className="stat-label">recorded status transitions (audit)</div>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Recorded status</th>
              <th>At</th>
            </tr>
          </thead>
          <tbody>
            {scenario.transitions.map((transition, index) => (
              <tr key={index}>
                <td>{transition.status}</td>
                <td>
                  <Instant iso={transition.at} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {scenario.approvalReference === null || scenario.approvalReference === undefined ? (
        <p className="pane-foot" data-approval-reference="none">
          No approval reference recorded on this scenario yet.
        </p>
      ) : (
        <div className="callout callout-info" data-approval-reference="recorded">
          <p>
            Approval reference (verbatim): decision{" "}
            <strong>{scenario.approvalReference.reviewDecision}</strong> on case{" "}
            <span className="mono">{scenario.approvalReference.caseId}</span>, reviewed{" "}
            <Instant iso={scenario.approvalReference.reviewedAt} />.
          </p>
        </div>
      )}
      {terminal ? (
        <div className="callout callout-warning" data-terminal-status="true">
          <p>
            <strong>Terminal status.</strong> {scenario.status} allows no further transitions —
            the record stays as it is (a superseding proposal is a NEW scenario).
          </p>
        </div>
      ) : (
        <CreateField
          label="Next status (only the governed table's allowed edges)"
          value={effectiveNextStatus}
          onChange={setNextStatus}
          options={allowed.map((status) => ({ value: status, label: status }))}
          hint={`Allowed from ${scenario.status}: ${allowed.join(", ")} — the frozen AISE-026 transition table, verbatim.`}
        />
      )}
      <h3 className="pane-head">Record an approval reference (case review)</h3>
      <CreateField label="Case id" value={caseId} onChange={setCaseId} hint="The case whose review outcome this reference records." />
      <CasePicker
        options={caseOptions}
        value={caseId}
        onPick={(picked) => {
          setCaseId(picked);
        }}
      />
      <CreateField
        label="Review decision"
        value={reviewDecision}
        onChange={setReviewDecision}
        options={CASE_REVIEW_DECISIONS.map((decision) => ({ value: decision, label: decision }))}
        hint="The AISE-025 case-review decision vocabulary, verbatim."
      />
      <CreateField
        label="Reviewed at (ISO-8601 UTC, milliseconds)"
        value={reviewedAt}
        onChange={setReviewedAt}
        placeholder="2026-07-13T09:00:00.000Z"
      />
      <div className="toolbar">
        <button
          type="button"
          className="button button-secondary"
          disabled={mode === "demo" || referenceDefects.length > 0 || submitting !== "none"}
          onClick={() => {
            void submitReference();
          }}
        >
          {submitting === "reference" ? "Recording…" : "Record approval reference"}
        </button>
      </div>
    </CreateRecordPanel>
  );
}

/* ------------------------------------------------------------------ */
/* The outcome loop (executions, OBSERVED outcomes, comparisons)        */
/* ------------------------------------------------------------------ */

/** The outcome-loop card: executions → outcomes → comparisons, with next steps. */
function OutcomeLoopCard({
  data,
  scenario,
  stateLayer,
  onReload,
}: {
  readonly data: InterventionData;
  readonly scenario: ViewerScenario;
  readonly stateLayer: ViewerScenario["states"][number];
  readonly onReload: () => void;
}): ReactNode {
  const environment = useAppEnvironment();
  const demo = data.mode === "demo";
  const [outcomeExecutionId, setOutcomeExecutionId] = useState<string | null>(null);
  const [viewedComparison, setViewedComparison] = useState<{
    readonly comparisonId: string;
    readonly record: ComparisonDetailRecord | null;
    readonly failure: string | null;
  } | null>(null);

  const openOutcome = data.executions.find((execution) => execution.executionRecordId === outcomeExecutionId) ?? null;

  return (
    <>
      <Card
        title="Outcome loop"
        badge={<DataBadge mode={data.mode} />}
        meta={<span>recorded executions and design-vs-as-built comparisons</span>}
      >
        {demo ? (
          <>
            <EmptyState
              title="No executions recorded in the demo dataset"
              guidance="Executing a scenario and recording evidence of what was actually done is an API write (the executions namespace) — honestly API-gated in demo mode. Once recorded, executions and their outcome comparisons appear here — observed outcomes, visually distinct from the proposed states above."
            />
          </>
        ) : (
          <>
            {data.executions.length === 0 ? (
              <EmptyState
                title="No executions recorded for this scenario"
                guidance="Record the execution of the viewed layer against the scenario's approved state — the panel below prefills the scenario and state from the layer you are viewing."
                action={
                  <a className="button" href="#record-execution">
                    Record the first execution
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
                      <th>State</th>
                      <th>Steps executed</th>
                      <th>Evidence</th>
                      <th>Outcomes</th>
                      <th>Executed</th>
                      <th>Next step</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.executions.map((execution) => (
                      <tr key={execution.executionRecordId}>
                        <td className="mono">{execution.executionRecordId}</td>
                        <td className="mono">{execution.caseId}</td>
                        <td className="mono" title={execution.stateId}>
                          {shortId(execution.stateId)}
                        </td>
                        <td>{String(execution.executedStepCount)}</td>
                        <td>{String(execution.evidenceCount)}</td>
                        <td>{String(execution.outcomeCount)}</td>
                        <td>
                          <Instant iso={execution.executedAt} />
                        </td>
                        <td>
                          <a href="#record-outcome" onClick={() => { setOutcomeExecutionId(execution.executionRecordId); }}>
                            Record outcome
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.comparisons.length === 0 ? (
              <EmptyState
                title="No comparisons recorded for this project"
                guidance="Run a reality-vs-design comparison against the pinned reality version — the panel below assembles the exact nested contract."
                action={
                  <a className="button" href="#run-comparison">
                    Run the first comparison
                  </a>
                }
              />
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Comparison</th>
                      <th>Design source</th>
                      <th>Entries</th>
                      <th>Discrepancies</th>
                      <th>Computed</th>
                      <th>Next step</th>
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
                        <td>
                          <a
                            href="#comparison-record"
                            onClick={() => {
                              setViewedComparison({ comparisonId: comparison.comparisonId, record: null, failure: null });
                              void loadComparisonLive(environment.fetchImpl, comparison.comparisonId).then((result) => {
                                setViewedComparison(
                                  result.ok
                                    ? { comparisonId: comparison.comparisonId, record: result.record, failure: null }
                                    : { comparisonId: comparison.comparisonId, record: null, failure: describeApiFailure(result.failure) },
                                );
                              });
                            }}
                          >
                            View full record
                          </a>
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
      {demo ? null : (
        <RecordExecutionPanel
          scenario={scenario}
          stateLayer={stateLayer}
          mode={demo ? "demo" : "api"}
          principalId={environment.principalId}
          fetchImpl={environment.fetchImpl}
          authorization={demo ? undefined : createLiveAuthorizationPort(environment.fetchImpl)}
          onCreated={onReload}
        />
      )}
      {openOutcome === null || demo ? null : (
        <RecordOutcomePanel
          execution={openOutcome}
          mode="api"
          principalId={environment.principalId}
          fetchImpl={environment.fetchImpl}
          authorization={createLiveAuthorizationPort(environment.fetchImpl)}
          onCreated={onReload}
        />
      )}
      {demo ? null : (
        <RunComparisonPanel
          projectId={data.projectId}
          mode="api"
          principalId={environment.principalId}
          fetchImpl={environment.fetchImpl}
          authorization={createLiveAuthorizationPort(environment.fetchImpl)}
          onCreated={onReload}
        />
      )}
      {viewedComparison === null ? null : viewedComparison.record === null ? (
        <Card id="comparison-record" title="Comparison record" badge={<DataBadge mode="api" />}>
          {viewedComparison.failure === null ? (
            <p className="state-guidance">Loading the full record…</p>
          ) : (
            <div className="state state-error" role="alert">
              <p className="state-title">The full record could not be loaded</p>
              <p className="state-guidance">{viewedComparison.failure}</p>
            </div>
          )}
        </Card>
      ) : (
        <ComparisonRecordView record={viewedComparison.record} />
      )}
    </>
  );
}

/**
 * The brokered record-execution panel (#record-execution): scenario/state
 * PREFILLED from the loaded layer, the step picker over the scenario's REAL
 * step ids, the case picker, evidence via the register, actor + executedAt.
 * The guidance names scenario_not_approved and links the approval panel
 * while the scenario is not approved.
 */
export function RecordExecutionPanel({
  scenario,
  stateLayer,
  mode,
  principalId,
  fetchImpl,
  authorization,
  onCreated,
}: {
  readonly scenario: ViewerScenario;
  readonly stateLayer: ViewerScenario["states"][number];
  readonly mode: "demo" | "api";
  readonly principalId: string;
  readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  readonly authorization?: Parameters<typeof resolveCreateActionOffer>[0]["authorization"];
  readonly onCreated: () => void;
}): ReactNode {
  const [executionRecordId, setExecutionRecordId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [stepsField, setStepsField] = useState("");
  const [evidenceField, setEvidenceField] = useState("");
  const [captureField, setCaptureField] = useState("");
  const [executedAt, setExecutedAt] = useState("");
  const [actor, setActor] = useState(principalId);
  const [caseOptions, setCaseOptions] = useState<readonly { readonly caseId: string; readonly title: string }[]>([]);
  const [evidenceStatus, setEvidenceStatus] = useState<EvidencePickerStatus>({ kind: "loading" });
  const [offer, setOffer] = useState<CreateActionOffer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CreatePanelOutcome | null>(null);

  useEffect(() => {
    if (mode !== "api") {
      return;
    }
    let cancelled = false;
    void loadCaseSummariesLive(fetchImpl).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setCaseOptions(result.cases.map((entry) => ({ caseId: entry.caseId, title: entry.title })));
      }
    });
    void loadEvidenceIndexLive(fetchImpl).then((result) => {
      if (cancelled) {
        return;
      }
      setEvidenceStatus(
        result.ok
          ? { kind: "ready", options: evidenceOptionsFromLive(result.items) }
          : { kind: "failed", message: describeApiFailure(result.failure) },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [mode, fetchImpl]);

  const selectedStepIds = idListFromField(stepsField);
  const unknownSteps = unknownStepRefs(
    scenario.steps.map((step) => step.stepId),
    selectedStepIds,
  );
  const draft: ExecutionDraft = {
    executionRecordId,
    caseId,
    scenarioId: scenario.scenarioId,
    stateId: stateLayer.stateId,
    executedStepIds: selectedStepIds,
    evidenceIds: idListFromField(evidenceField),
    ...(captureField.trim() === "" ? {} : { captureSessionIds: idListFromField(captureField) }),
    executedAt,
    ...(actor.trim() === "" ? {} : { actor }),
  };
  const defects = [
    ...validateExecutionDraft(draft),
    ...unknownSteps.map(
      (stepId) => `unknown_step_ref: step ${stepId} is not one of this scenario's recorded steps`,
    ),
  ];
  const notApproved = scenario.status !== "approved";
  const askable = mode === "api" && executionRecordId.trim() !== "" && caseId.trim() !== "";

  useEffect(() => {
    if (!askable) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void resolveCreateActionOffer({
      authorization,
      descriptor: recordExecutionAction(),
      bindingId: "intervention:record-execution",
      returnTo: { module: "case", projectId: scenario.projectId, caseId },
      principalId,
      target: { kind: "organization", organizationId: sessionOrganizationId(false) },
    }).then((resolved) => {
      if (!cancelled) {
        setOffer(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [askable, authorization, caseId, principalId, scenario.projectId]);

  const submit = useCallback(async () => {
    if (mode !== "api" || defects.length > 0 || submitting) {
      return;
    }
    setSubmitting(true);
    const result = await recordExecutionLive(fetchImpl, recordExecutionRequestBody(draft));
    setSubmitting(false);
    if (result.ok) {
      setOutcome({
        kind: "created",
        detail: `Execution ${result.record.executionRecordId} recorded — state transition ${result.record.stateTransition.fromStatus} → ${result.record.stateTransition.toStatus} with ${String(result.record.outcomes.length)} outcome(s).`,
        endpoint: result.endpoint,
      });
      onCreated();
    } else {
      setOutcome({ kind: "failed", detail: describeApiFailure(result.failure) });
    }
  }, [defects.length, draft, fetchImpl, mode, onCreated, submitting]);

  return (
    <CreateRecordPanel
      id="record-execution"
      title="Record an execution"
      intro="An execution records WHAT WAS ACTUALLY DONE against one materialized state (POST /v1/executions) — the executed steps, the substantiating evidence and the case it answers. Outcomes are recorded separately, always OBSERVED."
      offer={offer}
      mode={mode}
      draftValid={defects.length === 0}
      defects={defects}
      submitting={submitting}
      outcome={outcome}
      onSubmit={() => {
        void submit();
      }}
      submitLabel="Record execution"
    >
      {notApproved ? (
        <div className="callout callout-warning" data-scenario-not-approved="true">
          <p>
            <strong>scenario_not_approved:</strong> this scenario&apos;s status is{" "}
            {scenario.status} — recording an execution before approval is possible on the wire,
            but the governed journey approves first.{" "}
            <a href="#scenario-approval">Open the approval panel</a>.
          </p>
        </div>
      ) : null}
      <div className="stat-row">
        <div className="stat">
          <div className="stat-value mono">{scenario.scenarioId}</div>
          <div className="stat-label">scenario (prefilled from the loaded record)</div>
        </div>
        <div className="stat">
          <div className="stat-value mono" title={stateLayer.stateId}>
            {shortId(stateLayer.stateId)}
          </div>
          <div className="stat-label">state (prefilled from the VIEWED layer {String(stateLayer.stateIndex)})</div>
        </div>
      </div>
      <CreateField label="Execution record id" value={executionRecordId} onChange={setExecutionRecordId} />
      <CreateField label="Case id" value={caseId} onChange={setCaseId} hint="The case this execution answers (the outcome loop links them)." />
      <CasePicker
        options={caseOptions}
        value={caseId}
        onPick={(picked) => {
          setCaseId(picked);
        }}
      />
      <CreateField
        label="Executed step ids (comma-separated)"
        value={stepsField}
        onChange={setStepsField}
        hint="REQUIRED non-empty — the scenario's real step ids; unknown refs are named above."
      />
      <StepPicker
        steps={scenario.steps.map((step) => ({
          stepId: step.stepId,
          kind: step.kind,
          stepIndex: step.stepIndex,
        }))}
        selectedStepIds={selectedStepIds}
        onToggle={(stepId) => {
          setStepsField(
            (selectedStepIds.includes(stepId)
              ? selectedStepIds.filter((id) => id !== stepId)
              : [...selectedStepIds, stepId]
            ).join(", "),
          );
        }}
      />
      <CreateField
        label="Evidence ids (comma-separated, 64-hex)"
        value={evidenceField}
        onChange={setEvidenceField}
        hint="REQUIRED non-empty — what was actually done is substantiated."
      />
      <EvidencePicker
        status={evidenceStatus}
        value={evidenceField}
        onToggle={(evidenceId) => {
          setEvidenceField(toggleEvidenceId(evidenceField, evidenceId));
        }}
      />
      <CreateField
        label="Executed at (ISO-8601 UTC, milliseconds)"
        value={executedAt}
        onChange={setExecutedAt}
        placeholder="2026-07-13T14:30:00.000Z"
      />
      <CreateField label="Actor" value={actor} onChange={setActor} hint="Rides the wire unparsed (the probe contract); prefilled with the acting principal." />
      <CreateField
        label="Capture session ids (optional, comma-separated)"
        value={captureField}
        onChange={setCaptureField}
      />
    </CreateRecordPanel>
  );
}

/**
 * The brokered record-outcome panel (#record-outcome): the case is FIXED to
 * the execution's (a mismatch is named, mirroring outcome_case_mismatch),
 * evidence is REQUIRED (outcome_without_evidence), and outcomes are ALWAYS
 * OBSERVED — the body never carries an epistemicStatus. Success renders the
 * VERIFIED issue→outcome lineage (or its typed refusal named).
 */
export function RecordOutcomePanel({
  execution,
  mode,
  principalId,
  fetchImpl,
  authorization,
  onCreated,
}: {
  readonly execution: ExecutionSummaryRecord;
  readonly mode: "demo" | "api";
  readonly principalId: string;
  readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  readonly authorization?: Parameters<typeof resolveCreateActionOffer>[0]["authorization"];
  readonly onCreated: () => void;
}): ReactNode {
  const [caseId, setCaseId] = useState(execution.caseId);
  const [statement, setStatement] = useState("");
  const [evidenceField, setEvidenceField] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [actor, setActor] = useState(principalId);
  const [caseOptions, setCaseOptions] = useState<readonly { readonly caseId: string; readonly title: string }[]>([]);
  const [evidenceStatus, setEvidenceStatus] = useState<EvidencePickerStatus>({ kind: "loading" });
  const [offer, setOffer] = useState<CreateActionOffer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CreatePanelOutcome | null>(null);
  const [lineage, setLineage] = useState<
    | { readonly kind: "loading" }
    | { readonly kind: "ready"; readonly record: CaseLineageRecord }
    | { readonly kind: "failed"; readonly message: string }
    | null
  >(null);

  useEffect(() => {
    if (mode !== "api") {
      return;
    }
    let cancelled = false;
    void loadCaseSummariesLive(fetchImpl).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setCaseOptions(result.cases.map((entry) => ({ caseId: entry.caseId, title: entry.title })));
      }
    });
    void loadEvidenceIndexLive(fetchImpl).then((result) => {
      if (cancelled) {
        return;
      }
      setEvidenceStatus(
        result.ok
          ? { kind: "ready", options: evidenceOptionsFromLive(result.items) }
          : { kind: "failed", message: describeApiFailure(result.failure) },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [mode, fetchImpl]);

  const draft: OutcomeDraft = {
    caseId,
    statement,
    evidenceIds: idListFromField(evidenceField),
    ...(observedAt.trim() === "" ? {} : { observedAt }),
    ...(actor.trim() === "" ? {} : { actor }),
  };
  const defects = validateOutcomeDraft(draft, execution.caseId);
  const askable = mode === "api" && statement.trim() !== "";

  useEffect(() => {
    if (!askable) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void resolveCreateActionOffer({
      authorization,
      descriptor: recordOutcomeAction(),
      bindingId: "intervention:record-outcome",
      returnTo: { module: "case", projectId: execution.scenarioId, caseId: execution.caseId },
      principalId,
      target: { kind: "organization", organizationId: sessionOrganizationId(false) },
    }).then((resolved) => {
      if (!cancelled) {
        setOffer(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [askable, authorization, execution.caseId, execution.scenarioId, principalId]);

  const submit = useCallback(async () => {
    if (mode !== "api" || defects.length > 0 || submitting) {
      return;
    }
    setSubmitting(true);
    const result = await recordOutcomeLive(fetchImpl, execution.executionRecordId, recordOutcomeRequestBody(draft));
    setSubmitting(false);
    if (result.ok) {
      setOutcome({
        kind: "created",
        detail: `OBSERVED outcome ${result.record.outcomeId} recorded on case ${result.record.caseId} — “${result.record.statement}”.`,
        endpoint: result.endpoint,
      });
      onCreated();
      // The VERIFIED issue→outcome lineage (or its typed refusal named).
      setLineage({ kind: "loading" });
      void loadCaseLineageLive(fetchImpl, draft.caseId).then((lineageResult) => {
        setLineage(
          lineageResult.ok
            ? { kind: "ready", record: lineageResult.record }
            : { kind: "failed", message: describeApiFailure(lineageResult.failure) },
        );
      });
    } else {
      setOutcome({ kind: "failed", detail: describeApiFailure(result.failure) });
    }
  }, [defects.length, draft, execution.executionRecordId, fetchImpl, mode, onCreated, submitting]);

  return (
    <>
      <CreateRecordPanel
        id="record-outcome"
        title={`Record an OBSERVED outcome — execution ${execution.executionRecordId}`}
        intro="Outcomes are ALWAYS OBSERVED — the body never carries an epistemic status; an interpretation belongs on the case, not here. The case is FIXED to the execution's (a mismatch is named, never coerced) and evidence is REQUIRED."
        offer={offer}
        mode={mode}
        draftValid={defects.length === 0}
        defects={defects}
        submitting={submitting}
        outcome={outcome}
        onSubmit={() => {
          void submit();
        }}
        submitLabel="Record OBSERVED outcome"
      >
        <div className="stat-row">
          <div className="stat">
            <div className="stat-value mono">{execution.executionRecordId}</div>
            <div className="stat-label">execution (fixed)</div>
          </div>
          <div className="stat">
            <div className="stat-value mono">{execution.caseId}</div>
            <div className="stat-label">the execution&apos;s case (editable below; a mismatch is named)</div>
          </div>
        </div>
        <CreateField
          label="Case id"
          value={caseId}
          onChange={setCaseId}
          hint={`Defaults to the execution's case (${execution.caseId}); the draft validator names outcome_case_mismatch on any other value.`}
        />
        <CasePicker
          options={caseOptions}
          value={caseId}
          onPick={(picked) => {
            setCaseId(picked);
          }}
        />
        <CreateField
          label="Statement (what was observed)"
          value={statement}
          onChange={setStatement}
          multiline
          mono={false}
        />
        <CreateField
          label="Evidence ids (REQUIRED, comma-separated, 64-hex)"
          value={evidenceField}
          onChange={setEvidenceField}
          hint="outcome_without_evidence is the typed refusal — an OBSERVED outcome is substantiated."
        />
        <EvidencePicker
          status={evidenceStatus}
          value={evidenceField}
          onToggle={(evidenceId) => {
            setEvidenceField(toggleEvidenceId(evidenceField, evidenceId));
          }}
        />
        <CreateField
          label="Observed at (ISO-8601 UTC, milliseconds)"
          value={observedAt}
          onChange={setObservedAt}
          placeholder="2026-07-14T10:00:00.000Z"
          hint="Rides the wire unparsed (the probe contract)."
        />
        <CreateField label="Actor" value={actor} onChange={setActor} hint="Rides the wire unparsed; prefilled with the acting principal." />
      </CreateRecordPanel>
      {lineage === null ? null : lineage.kind === "loading" ? (
        <Card title="Issue → outcome lineage" badge={<DataBadge mode="api" />}>
          <p className="state-guidance">Loading the verified lineage…</p>
        </Card>
      ) : lineage.kind === "failed" ? (
        <Card title="Issue → outcome lineage" badge={<DataBadge mode="api" />}>
          <div className="state state-error" role="alert">
            <p className="state-title">The lineage could not be verified</p>
            <p className="state-guidance">{lineage.message}</p>
          </div>
        </Card>
      ) : (
        <Card
          title="Issue → outcome lineage (VERIFIED)"
          badge={<DataBadge mode="api" />}
          meta={<span>case {lineage.record.caseId} — executions and their OBSERVED outcomes, verbatim</span>}
        >
          {lineage.record.executions.length === 0 ? (
            <EmptyState
              title="No executions link this case yet"
              guidance="The lineage view appears once the case carries executions with outcomes."
            />
          ) : (
            <ul className="notes-list">
              {lineage.record.executions.map((lineageExecution) => (
                <li key={lineageExecution.executionRecordId}>
                  <span className="mono">{lineageExecution.executionRecordId}</span> — executed{" "}
                  <Instant iso={lineageExecution.executedAt} /> · steps{" "}
                  {lineageExecution.executedStepIds.map((id) => shortId(id)).join(", ")} ·{" "}
                  {lineageExecution.outcomes.length === 0
                    ? "no outcomes recorded yet"
                    : lineageExecution.outcomes.map((lineageOutcome) => (
                        <span key={lineageOutcome.outcomeId}>
                          <EpistemicBadge status={lineageOutcome.epistemicStatus} />{" "}
                          “{lineageOutcome.statement}”
                        </span>
                      ))}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The run-comparison panel + the full comparison record view           */
/* ------------------------------------------------------------------ */

/**
 * The brokered run-comparison panel (#run-comparison): assembles the EXACT
 * nested POST /v1/comparisons contract (sourceOfRecord five fields, items
 * with REQUIRED possibly-empty properties, optional tolerances/coverage
 * omitted when absent). The reality version prefills from the project's
 * latest recorded version (prefill only while untouched).
 */
export function RunComparisonPanel({
  projectId,
  mode,
  principalId,
  fetchImpl,
  authorization,
  onCreated,
}: {
  readonly projectId: string;
  readonly mode: "demo" | "api";
  readonly principalId: string;
  readonly fetchImpl: (input: string, init?: RequestInit) => Promise<Response>;
  readonly authorization?: Parameters<typeof resolveCreateActionOffer>[0]["authorization"];
  readonly onCreated: () => void;
}): ReactNode {
  const [comparisonId, setComparisonId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [versionTouched, setVersionTouched] = useState(false);
  const [designTitle, setDesignTitle] = useState("");
  const [systemClass, setSystemClass] = useState("");
  const [systemInstanceId, setSystemInstanceId] = useState("");
  const [sourceRecordId, setSourceRecordId] = useState("");
  const [revision, setRevision] = useState("");
  const [retrievedAt, setRetrievedAt] = useState("");
  const [designItemLines, setDesignItemLines] = useState("");
  const [toleranceLines, setToleranceLines] = useState("");
  const [coverageLines, setCoverageLines] = useState("");
  const [offer, setOffer] = useState<CreateActionOffer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CreatePanelOutcome | null>(null);
  const [record, setRecord] = useState<ComparisonDetailRecord | null>(null);

  useEffect(() => {
    if (mode !== "api") {
      return;
    }
    let cancelled = false;
    void loadLatestRealityVersionLive(fetchImpl, projectId).then((result) => {
      if (cancelled || !result.ok) {
        return;
      }
      if (result.version !== null && !versionTouched && versionId === "") {
        setVersionId(result.version.versionId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mode, fetchImpl, projectId]);

  const draft: ComparisonDraft = {
    comparisonId,
    projectId,
    versionId,
    ...(designTitle.trim() === "" ? {} : { designTitle }),
    systemClass,
    systemInstanceId,
    sourceRecordId,
    revision,
    retrievedAt,
    designItemLines,
    ...(toleranceLines.trim() === "" ? {} : { toleranceLines }),
    ...(coverageLines.trim() === "" ? {} : { coverageLines }),
  };
  const defects = validateComparisonDraft(draft);
  const askable = mode === "api" && comparisonId.trim() !== "";

  useEffect(() => {
    if (!askable) {
      setOffer(null);
      return;
    }
    let cancelled = false;
    void resolveCreateActionOffer({
      authorization,
      descriptor: runComparisonAction(),
      bindingId: "boq:run-comparison",
      returnTo: { module: "reality", projectId },
      principalId,
      target: { kind: "organization", organizationId: sessionOrganizationId(false) },
    }).then((resolved) => {
      if (!cancelled) {
        setOffer(resolved);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [askable, authorization, principalId, projectId]);

  const submit = useCallback(async () => {
    if (mode !== "api" || defects.length > 0 || submitting) {
      return;
    }
    setSubmitting(true);
    const result = await runComparisonLive(fetchImpl, runComparisonRequestBody(draft));
    setSubmitting(false);
    if (result.ok) {
      setOutcome({
        kind: "created",
        detail: `Comparison ${result.record.comparisonId} computed — ${String(result.record.stats.totalEntries)} entries, ${String(result.record.stats.discrepancies)} discrepancies.`,
        endpoint: result.endpoint,
      });
      setRecord(result.record);
      onCreated();
    } else {
      setOutcome({ kind: "failed", detail: describeApiFailure(result.failure) });
    }
  }, [defects.length, draft, fetchImpl, mode, onCreated, submitting]);

  return (
    <>
      <CreateRecordPanel
        id="run-comparison"
        title="Run a reality-vs-design comparison"
        intro="A comparison pins the resolved reality version and the design reference byte-exactly (the input digest) and answers per-entry verdicts with the uncertainty family first-class (POST /v1/comparisons). The comparison write rides boq:write (the frozen vocabulary has no comparison: permission — documented honestly)."
        offer={offer}
        mode={mode}
        draftValid={defects.length === 0}
        defects={defects}
        submitting={submitting}
        outcome={outcome}
        onSubmit={() => {
          void submit();
        }}
        submitLabel="Run comparison"
      >
        <CreateField label="Comparison id" value={comparisonId} onChange={setComparisonId} />
        <CreateField
          label="Reality version (vNNN)"
          value={versionId}
          onChange={(value) => {
            setVersionTouched(true);
            setVersionId(value);
          }}
          hint="Prefilled with the project's latest recorded reality version while untouched — a typed value is a manual override."
        />
        <CreateField label="Design title (optional)" value={designTitle} onChange={setDesignTitle} mono={false} />
        <CreateField label="sourceOfRecord.systemClass" value={systemClass} onChange={setSystemClass} hint="The incumbent system class (AISE vocabulary, e.g. storage-document)." />
        <CreateField label="sourceOfRecord.systemInstanceId" value={systemInstanceId} onChange={setSystemInstanceId} />
        <CreateField label="sourceOfRecord.sourceRecordId" value={sourceRecordId} onChange={setSourceRecordId} />
        <CreateField label="sourceOfRecord.revision" value={revision} onChange={setRevision} />
        <CreateField
          label="sourceOfRecord.retrievedAt (ISO-8601 UTC, milliseconds)"
          value={retrievedAt}
          onChange={setRetrievedAt}
          placeholder="2026-07-13T08:00:00.000Z"
        />
        <CreateField
          label="Design items (one `id | target | label | key = value unit` per line)"
          value={designItemLines}
          onChange={setDesignItemLines}
          multiline
          rows={5}
          hint="An empty target segment (or `-`) leaves the item unmapped (the honest unmapped_design_item omission). Properties may be empty (object-level comparison)."
        />
        <CreateField
          label="Tolerances (optional, one `key = tolerance` per line; `default = 5` sets the default)"
          value={toleranceLines}
          onChange={setToleranceLines}
          multiline
        />
        <CreateField
          label="Coverage annotations (optional, one `targetNodeId STATUS evidenceId` per line; UNKNOWN|NOT_OBSERVED|OCCLUDED)"
          value={coverageLines}
          onChange={setCoverageLines}
          multiline
        />
      </CreateRecordPanel>
      {record === null ? null : <ComparisonRecordView record={record} />}
    </>
  );
}

/** The comparison status families (distinct chips per family). */
function comparisonStatusFamily(status: string): string {
  if (status === "matches" || status === "within_tolerance") {
    return "verdict-match";
  }
  if (status === "differs" || status === "deviation_beyond_tolerance") {
    return "verdict-discrepancy";
  }
  if (status === "unknown" || status === "not_observed_in_reality" || status === "occluded_in_reality") {
    return "verdict-uncertainty";
  }
  if (status === "unplanned_in_reality") {
    return "verdict-coverage";
  }
  return "verdict-other";
}

/**
 * The FULL comparison record, rendered honestly — the ten statistics, the
 * uncertainty family first-class, verbatim statuses with family-distinct
 * chips, omission codes, deviations with applied tolerances, reality
 * epistemic badges, evidence links and the pinned input digest.
 *
 * The api-level validator pins the record's load-bearing core; the entries
 * table renders the entries the live payload carries (structural mirror of
 * the comparison record — same discipline as the boqlens mirrors). A record
 * whose payload carries no entries renders the pinned statistics + an
 * honest note, never invented rows.
 */
export function ComparisonRecordView({
  record,
}: {
  readonly record: ComparisonDetailRecord;
}): ReactNode {
  // The full-record structural mirror (rendered when the payload carries it).
  const full = record as unknown as {
    readonly entries?: readonly {
      readonly entryId: string;
      readonly designItemId: string | null;
      readonly targetNodeId: string | null;
      readonly aspect: string;
      readonly propertyKey: string | null;
      readonly status: string;
      readonly omissionCode?: string;
      readonly designValue?: { readonly value: string | number | boolean; readonly unit?: string };
      readonly realityValue?: {
        readonly value: string | number | boolean;
        readonly unit?: string;
        readonly epistemicStatus?: string;
      };
      readonly deviation?: number;
      readonly tolerance?: number;
      readonly realityEvidenceIds?: readonly string[];
    }[];
    readonly stats?: Record<string, number>;
    readonly tolerances?: { readonly byKey?: Record<string, number>; readonly default?: number | null };
  };
  const stats = full.stats ?? { totalEntries: record.stats.totalEntries, discrepancies: record.stats.discrepancies };
  const statRows: readonly [string, number][] = [
    ["totalEntries", stats.totalEntries ?? record.stats.totalEntries],
    ["matches", stats.matches ?? 0],
    ["withinTolerance", stats.withinTolerance ?? 0],
    ["differs", stats.differs ?? 0],
    ["deviationBeyondTolerance", stats.deviationBeyondTolerance ?? 0],
    ["unknown", stats.unknown ?? 0],
    ["notObservedInReality", stats.notObservedInReality ?? 0],
    ["occludedInReality", stats.occludedInReality ?? 0],
    ["unplannedInReality", stats.unplannedInReality ?? 0],
    ["discrepancies", stats.discrepancies ?? record.stats.discrepancies],
  ];
  const entries = full.entries ?? null;
  return (
    <Card
      id="comparison-record"
      title={`Comparison record — ${record.comparisonId}`}
      badge={<DataBadge mode="api" />}
      meta={
        <span>
          reality <span className="mono">{record.realityRef.versionId}</span> of{" "}
          <span className="mono">{record.realityRef.projectId}</span> · computed{" "}
          <Instant iso={record.computedAt} /> · input digest{" "}
          <span className="mono" title={record.inputDigest}>
            {shortId(record.inputDigest)}
          </span>
        </span>
      }
    >
      <div className="stat-row" data-stats="all-ten">
        {statRows.map(([key, value]) => (
          <div className="stat" key={key} data-stat={key}>
            <div className="stat-value">{String(value)}</div>
            <div className="stat-label">{key}</div>
          </div>
        ))}
      </div>
      <p className="pane-foot">
        The uncertainty family (unknown · not_observed_in_reality · occluded_in_reality) is
        first-class — never absence, never zero-assumed. The discrepancy family is differs +
        deviation_beyond_tolerance.
      </p>
      {full.tolerances === undefined ? null : (
        <p className="pane-foot">
          Tolerances: default{" "}
          {full.tolerances.default === null || full.tolerances.default === undefined
            ? "none"
            : String(full.tolerances.default)}
          {Object.keys(full.tolerances.byKey ?? {}).length === 0
            ? ""
            : `; per-key ${Object.entries(full.tolerances.byKey ?? {})
                .map(([key, value]) => `${key}=${String(value)}`)
                .join(", ")}`}
        </p>
      )}
      {entries === null ? (
        <p className="pane-foot">
          This record&apos;s payload carried no entries table — the pinned statistics above are
          the api-validated core; no rows are invented.
        </p>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No comparison entries"
          guidance="The comparison carried zero rows — the design reference declared no comparable scope against the pinned reality version."
        />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Entry</th>
                <th>Design item / target</th>
                <th>Aspect</th>
                <th>Status (verbatim)</th>
                <th>Design value</th>
                <th>Reality value</th>
                <th>Deviation (tolerance)</th>
                <th>Reality evidence</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.entryId}>
                  <td className="mono" title={entry.entryId}>
                    {shortId(entry.entryId)}
                  </td>
                  <td>
                    {entry.designItemId === null ? (
                      <em>none (unplanned)</em>
                    ) : (
                      <span className="mono">{entry.designItemId}</span>
                    )}
                    {entry.targetNodeId === null ? null : (
                      <>
                        {" "}
                        → <span className="mono">{entry.targetNodeId}</span>
                      </>
                    )}
                  </td>
                  <td>
                    {entry.aspect}
                    {entry.propertyKey === null ? null : ` · ${entry.propertyKey}`}
                  </td>
                  <td>
                    <span className={`tag tag-comparison-${comparisonStatusFamily(entry.status)}`} data-status={entry.status}>
                      {entry.status}
                    </span>
                    {entry.omissionCode === undefined ? null : (
                      <span className="tag tag-omission" title="why this row's comparison was honestly omitted">
                        {entry.omissionCode}
                      </span>
                    )}
                  </td>
                  <td>
                    {entry.designValue === undefined
                      ? "—"
                      : `${String(entry.designValue.value)}${entry.designValue.unit === undefined ? "" : ` ${entry.designValue.unit}`}`}
                  </td>
                  <td>
                    {entry.realityValue === undefined ? (
                      "—"
                    ) : (
                      <>
                        {String(entry.realityValue.value)}
                        {entry.realityValue.unit === undefined ? "" : ` ${entry.realityValue.unit}`}
                        {entry.realityValue.epistemicStatus === undefined ? null : (
                          <>
                            {" "}
                            <EpistemicBadge status={entry.realityValue.epistemicStatus} />
                          </>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    {entry.deviation === undefined
                      ? "—"
                      : `${String(entry.deviation)}${entry.tolerance === undefined ? "" : ` (± ${String(entry.tolerance)})`}`}
                  </td>
                  <td>
                    {(entry.realityEvidenceIds ?? []).length === 0
                      ? "—"
                      : (entry.realityEvidenceIds ?? []).map((id) => (
                          <span key={id} className="mono" title={id}>
                            {shortId(id)}{" "}
                          </span>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="pane-foot">
        Pinned input digest (sha-256 over the canonical JSON of the resolved reality version +
        design reference + tolerances + coverage): <span className="mono">{record.inputDigest}</span>
      </p>
    </Card>
  );
}
