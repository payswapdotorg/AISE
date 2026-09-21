/**
 * PROD-024 — `SolutionWorkspace`: the interactive building solution
 * workspace (the module's SINGLE mounted entry).
 *
 * Composes the panes of the interactive engineering solution workflow:
 *
 *  - the layered VIEWER (observed vs proposed, selection, isolation,
 *    2D/3D navigation) — or the first-class ACCESSIBLE FALLBACK when the
 *    spatial viewer is not usable or not wanted;
 *  - the DIRECT-MANIPULATION controls (real-world-worded actions over the
 *    selected object/region, parameterized per the engine's capability
 *    catalogue);
 *  - the TIMELINE (steppable engine states), the OPERATION LIST and the
 *    DETAIL INSPECTOR (read-only, provenance-carrying) with the UNDO
 *    control (a NEW version through the engine — history is never
 *    rewritten);
 *  - the embedded AGENT PANEL (the PROD-023 compiler seam);
 *  - the guarded BOQ PANE (bidirectional line ↔ step/geometry sync when
 *    data exists; honest "none available" otherwise);
 *  - the QUANTITIES pane (engine-recorded impacts + the engine's
 *    aggregated inventory);
 *  - VALIDATE (the engine's deterministic checks, verbatim).
 *
 * AUTHORITY DISCIPLINE (the §4.2/§4.3 convergence + mutation-protection
 * laws): every manipulation — viewer control, fallback control, timeline
 * action or confirmed agent proposal — flows through the ONE submission
 * path (`submitIntent` of operations.ts) into the ENGINE service; the UI
 * renders engine-computed states only; the OBSERVED scene is read-only
 * display data and PROPOSED layers can never overwrite it (the engine's
 * proposals seal + the contract's read-only reality pins).
 *
 * MOUNT CONTRACT (§4.1): the Tech Lead mounts this component at the
 * integration station with the case/solution context and the port
 * bindings as props — no global singletons, no module side effects.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { BaselineGeometryResolver } from "../../../../packages/solution-engine/src/index";
import type { SolutionBoqSyncInput } from "./boq";
import { boqLineHighlightOf, resolveBoqForOperation } from "./boq";
import type { SolutionAgentPort } from "./agent/port";
import { AgentPanel } from "./agent/AgentPanel";
import {
  applyAgentDecision,
  agentSessionContextOf,
  buildDirectManipulationIntent,
  defaultWorkspaceClock,
  openWorkspace,
  reviseOperation,
  stepTimeline,
  submitIntent,
  validateCurrentVersion,
  type ManipulationAction,
  type WorkspaceClock,
  type WorkspaceDeps,
} from "./operations";
import { currentVersionOf, cursorStateOf, quantityRowsOf } from "./model";
import type { SolutionWorkspaceState, ViewerViewParams } from "./model";
import { createLocalSolutionService } from "./service";
import type { SolutionServicePort } from "./service";
import { BoqPane } from "./panes/BoqPane";
import { DetailInspectorPane } from "./panes/DetailInspectorPane";
import { ManipulationControlsPane } from "./panes/ManipulationControlsPane";
import { NoticePane } from "./panes/NoticePane";
import { OperationListPane } from "./panes/OperationListPane";
import { QuantitiesPane } from "./panes/QuantitiesPane";
import { TimelinePane } from "./panes/TimelinePane";
import { AccessibleScenePane } from "./fallback/AccessibleScenePane";
import { SceneView } from "./viewer/SceneView";
import { renderSceneSvg, sceneTextAlternative } from "./viewer/svg";
import { proposedOverlaysOf } from "./viewer/model";
import type { ObservedScene, SceneElement } from "./viewer/model";
import { SOLUTION_WORKSPACE_CSS } from "./styles";

/* ------------------------------------------------------------------ */
/* Props (the mount contract)                                          */
/* ------------------------------------------------------------------ */

/** The case/solution context the workspace operates on (via props). */
export interface SolutionCaseContext {
  readonly projectId: string;
  readonly caseId: string;
  readonly solutionId: string;
  readonly title: string;
  readonly problemStatement: string;
  /** The PINNED authoritative Reality-Graph version (read-only reference). */
  readonly baselineRealityVersionId: string;
  /** The observed current-building reality (read-only display data). */
  readonly observedScene: ObservedScene;
  /** Read-only baseline surface facts for coated operations (optional). */
  readonly baselineGeometry?: BaselineGeometryResolver;
}

/** The embedded agent session handle (the PROD-023 seam binding). */
export interface SolutionAgentHandle {
  readonly port: SolutionAgentPort;
  readonly sessionId: string;
  readonly agentId: string;
  readonly userId?: string;
}

export interface SolutionWorkspaceProps {
  readonly context: SolutionCaseContext;
  /** The agent seam — absent means the honest "not connected" panel. */
  readonly agent?: SolutionAgentHandle;
  /** The engine service port (default: the local engine binding). */
  readonly service?: SolutionServicePort;
  /** The deterministic clock (default: the fixed stepped demo clock). */
  readonly clock?: WorkspaceClock;
  /** BOQ data through the guarded seam, when the case context has it. */
  readonly boq?: SolutionBoqSyncInput;
  /** The acting user (provenance attribution; default demo engineer). */
  readonly userId?: string;
}

/* ------------------------------------------------------------------ */
/* The component                                                       */
/* ------------------------------------------------------------------ */

export function SolutionWorkspace(props: SolutionWorkspaceProps): React.ReactNode {
  const context = props.context;
  const service = props.service ?? createLocalSolutionService(
    context.baselineGeometry === undefined ? {} : { baselineGeometry: context.baselineGeometry },
  );
  const clock = props.clock ?? defaultWorkspaceClock();
  const authoredBy = props.userId ?? "user-demo-engineer";
  const deps: WorkspaceDeps = useMemo(
    () => ({ service, clock, authoredBy }),
    [service, clock, authoredBy],
  );

  const [state, setState] = useState<SolutionWorkspaceState>(() =>
    openWorkspace({
      projectId: context.projectId,
      caseId: context.caseId,
      solutionId: context.solutionId,
      title: context.title,
      problemStatement: context.problemStatement,
      baselineRealityVersionId: context.baselineRealityVersionId,
      createdAt: clock.now(),
      materializedAt: clock.materializeAt(0),
    }),
  );
  const intentSeq = useRef(1);

  /* ---- Derived views (pure, from engine-computed state). ---- */
  const version = currentVersionOf(state);
  const cursorState = cursorStateOf(state);
  const overlays = useMemo(
    () => proposedOverlaysOf(version, context.observedScene, state.cursorStateIndex),
    [version, context.observedScene, state.cursorStateIndex],
  );
  const selectedElement: SceneElement | undefined =
    state.selection?.kind === "scene-element"
      ? context.observedScene.elements.find(
          (element) =>
            state.selection?.kind === "scene-element" && element.elementId === state.selection.elementId,
        )
      : undefined;
  const selectedOperationId =
    state.selection?.kind === "operation" ? state.selection.operationId : undefined;
  const boqHighlight =
    state.selection?.kind === "boq-line"
      ? boqLineHighlightOf(props.boq, state.selection.boqLineId)
      : undefined;
  const detailBoqLines =
    selectedOperationId === undefined
      ? undefined
      : resolveBoqForOperation(props.boq, state, selectedOperationId);

  const sceneSvg = renderSceneSvg(
    context.observedScene,
    overlays,
    state.view,
    state.view.projection,
    {
      selectedElementId:
        state.selection?.kind === "scene-element" ? state.selection.elementId : undefined,
      selectedOperationId,
      ...(state.isolate && selectedOperationId !== undefined
        ? { isolateOperationId: selectedOperationId }
        : {}),
      ...(boqHighlight === undefined
        ? {}
        : {
            highlightOperationIds: boqHighlight.operationIds,
            highlightGeometryRefs: boqHighlight.geometryRefs,
          }),
    },
  );

  /* ---- Controllers (every mutation through the ONE paths). ---- */

  const refreshInventory = useCallback(
    async (next: SolutionWorkspaceState): Promise<SolutionWorkspaceState> => {
      const result = await service.quantities({
        version: currentVersionOf(next),
        stateIndex: next.cursorStateIndex,
      });
      return { ...next, inventory: result.inventory };
    },
    [service],
  );

  const handleStep = useCallback(
    async (targetIndex: number) => {
      const stepped = stepTimeline(state, targetIndex);
      if (stepped === state) {
        return;
      }
      setState(await refreshInventory(stepped));
    },
    [state, refreshInventory],
  );

  const handleSelectElement = useCallback((elementId: string) => {
    setState((current) => ({
      ...current,
      selection: { kind: "scene-element", elementId },
      isolate: false,
    }));
  }, []);

  const handleSelectOperation = useCallback((operationId: string) => {
    setState((current) => ({
      ...current,
      selection: { kind: "operation", operationId },
    }));
  }, []);

  const handleSelectBoqLine = useCallback((boqLineId: string) => {
    setState((current) => ({
      ...current,
      selection: { kind: "boq-line", boqLineId },
    }));
  }, []);

  const handleExecuteManipulation = useCallback(
    async (input: {
      readonly element: SceneElement;
      readonly action: ManipulationAction;
      readonly parameterValues: Readonly<Record<string, number | string>>;
    }) => {
      const intent = buildDirectManipulationIntent(
        {
          elementId: input.element.elementId,
          operationType: input.action.operationType,
          parameterValues: input.parameterValues,
          intentId: `intent-direct-${intentSeq.current++}`,
        },
        input.element,
        state,
        clock.now(),
        authoredBy,
      );
      const next = await submitIntent(state, intent, deps);
      setState(await refreshInventory(next));
    },
    [state, deps, clock, authoredBy, refreshInventory],
  );

  const handleRevise = useCallback(
    async (operationId: string) => {
      const next = await reviseOperation(state, operationId, deps);
      setState(await refreshInventory(next));
    },
    [state, deps, refreshInventory],
  );

  const handleValidate = useCallback(async () => {
    const next = await validateCurrentVersion(state, deps);
    const refreshed = await refreshInventory(next);
    setState(refreshed);
  }, [state, deps, refreshInventory]);

  const handleAgentTurn = useCallback(
    async (utterance: string) => {
      if (props.agent === undefined) {
        return;
      }
      const session = agentSessionContextOf(state, context.observedScene, {
        sessionId: props.agent.sessionId,
        agentId: props.agent.agentId,
        ...(props.agent.userId === undefined ? {} : { userId: props.agent.userId }),
      });
      const decision = await props.agent.port.decideTurn({
        utterance,
        session,
        ...(state.pendingClarification === undefined
          ? {}
          : { pendingClarification: state.pendingClarification }),
        ...(state.pendingProposal === undefined
          ? {}
          : { pendingProposal: state.pendingProposal }),
      });
      const next = await applyAgentDecision(state, utterance, decision, deps, props.boq);
      setState(await refreshInventory(next));
    },
    [props.agent, props.boq, state, context.observedScene, deps, refreshInventory],
  );

  const handleCancelPending = useCallback(() => {
    handleAgentTurn("cancel");
  }, [handleAgentTurn]);

  const handleViewChange = useCallback((view: ViewerViewParams) => {
    setState((current) => ({ ...current, view }));
  }, []);

  const handleToggleFallback = useCallback(() => {
    setState((current) => ({ ...current, fallbackMode: !current.fallbackMode }));
  }, []);

  const handleToggleIsolate = useCallback(() => {
    setState((current) => ({ ...current, isolate: !current.isolate }));
  }, []);

  const handleCloseDetail = useCallback(() => {
    setState((current) => ({ ...current, selection: undefined, isolate: false }));
  }, []);

  /* ---- Render. ---- */

  return (
    <main
      aria-label={`Interactive solution workspace — ${context.title}`}
      className="solution-workspace"
      data-solution-id={context.solutionId}
      data-case-id={context.caseId}
      data-baseline-reality-version={context.baselineRealityVersionId}
      data-current-version={state.currentVersionNumber}
      data-cursor-state-index={state.cursorStateIndex}
      data-fallback-mode={state.fallbackMode ? "true" : "false"}
      id="solution-workspace"
    >
      {/* The module's constant stylesheet (never derived from data). */}
      <style>{SOLUTION_WORKSPACE_CSS}</style>
      <header className="solution-header">
        <h2>{context.title}</h2>
        <p className="solution-problem">{context.problemStatement}</p>
        <p className="solution-pin">
          Branches from the observed building (reality version{" "}
          <code>{context.baselineRealityVersionId}</code>) — proposed work never changes the
          observed record. Every step below is a proposed layer produced by the deterministic
          solution engine.
        </p>
        <div className="solution-header-actions">
          <button
            aria-pressed={state.fallbackMode ? "true" : "false"}
            onClick={handleToggleFallback}
            type="button"
          >
            {state.fallbackMode ? "Show the drawing view" : "Use the accessible view (no drawing)"}
          </button>
          <button onClick={handleValidate} type="button">
            Check this proposal (validate)
          </button>
        </div>
      </header>

      {state.notice === undefined ? null : (
        <NoticePane
          notice={state.notice}
          onDismiss={() => {
            setState((current) => ({ ...current, notice: undefined }));
          }}
        />
      )}

      {state.validationSnapshot === undefined ? null : (
        <section
          aria-label="Validation result"
          className="solution-pane solution-validation"
          data-validation-outcome={state.validationSnapshot.outcome}
          id="solution-validation"
        >
          <h3>Validation — {state.validationSnapshot.outcome}</h3>
          <ul>
            {state.validationSnapshot.checks.map((check) => (
              <li data-check-id={check.checkId} data-check-result={check.result} key={check.checkId}>
                {check.checkId}: {check.result} — {check.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      {state.fallbackMode ? (
        <AccessibleScenePane
          overlays={overlays}
          scene={context.observedScene}
          onSelectElement={handleSelectElement}
          onSelectOperation={handleSelectOperation}
          selectedElementId={state.selection?.kind === "scene-element" ? state.selection.elementId : undefined}
          selectedOperationId={selectedOperationId}
        />
      ) : (
        <SceneView
          alternative={sceneTextAlternative(context.observedScene, overlays)}
          onSelectElement={handleSelectElement}
          onSelectOperation={handleSelectOperation}
          selectedElementId={state.selection?.kind === "scene-element" ? state.selection.elementId : undefined}
          selectedOperationId={selectedOperationId}
          svg={sceneSvg}
          title={`Building view — layer ${state.cursorStateIndex} of ${version.states.length - 1} proposed steps`}
          view={state.view}
          onViewChange={handleViewChange}
        />
      )}

      <div className="solution-columns">
        <ManipulationControlsPane
          element={selectedElement}
          onExecute={handleExecuteManipulation}
        />
        <TimelinePane onStep={handleStep} state={state} />
        <OperationListPane onSelectOperation={handleSelectOperation} state={state} />
        <DetailInspectorPane
          boqLines={detailBoqLines}
          onClose={handleCloseDetail}
          onRevise={handleRevise}
          onToggleIsolate={handleToggleIsolate}
          state={state}
        />
        <QuantitiesPane rows={quantityRowsOf(state)} inventory={state.inventory} />
        <BoqPane boq={props.boq} onSelectLine={handleSelectBoqLine} state={state} />
      </div>

      <AgentPanel
        busy={state.agentBusy}
        onCancelPending={handleCancelPending}
        pendingClarification={state.pendingClarification}
        pendingProposal={state.pendingProposal}
        port={props.agent?.port}
        onUserTurn={handleAgentTurn}
        transcript={state.transcript}
      />

      <footer className="solution-footer">
        <p>
          Observed reality is authoritative and read-only; every proposed layer comes from the
          deterministic solution engine (states, quantities, identities). Current layer:{" "}
          <code>{cursorState.stateId.slice(0, 16)}…</code> of version {state.currentVersionNumber}
          {" · "}
          {version.operations.length} recorded operation(s). Undo always creates a new version —
          history is never rewritten.
        </p>
      </footer>
    </main>
  );
}
