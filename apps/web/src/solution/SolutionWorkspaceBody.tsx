/**
 * PROD-024/PROD-031 — `SolutionWorkspaceBody`: the interactive building
 * solution workspace's FULL component body (the binding-explicit core).
 *
 * This is the SAME component tree as `SolutionWorkspace` (the module's
 * single mounted entry): every pane, controller and honest state of the
 * PROD-024 workspace, over EXPLICITLY INJECTED bindings —
 *
 *  - `deps` — the service port (the ENGINE seam), the deterministic
 *    clock and the acting user (provenance attribution);
 *  - `openedState` — the workspace's initial state, ALREADY opened over
 *    an engine-computed baseline overlay (layer 0): the Node facade opens
 *    synchronously through the local engine (`openWorkspace` of
 *    `./operations`); the BROWSER mount opens through the service port
 *    (`openWorkspaceThroughService` of `./operations-core` — the backend
 *    engine over the mounted routes), so the crypto-dependent baseline
 *    materialization executes server-side and this module's graph stays
 *    crypto-free (PROD-031's browser-safe cut: the browser mount's chunk
 *    imports THIS module + `./operations-core`, never the engine-tainted
 *    facades).
 *
 * AUTHORITY DISCIPLINE (the §4.2/§4.3 convergence + mutation-protection
 * laws): every manipulation — viewer control, fallback control, timeline
 * action or confirmed agent proposal — flows through the ONE submission
 * path (`submitIntent` of operations-core) into the ENGINE service; the
 * UI renders engine-computed states only; the OBSERVED scene is read-only
 * display data and PROPOSED layers can never overwrite it (the engine's
 * proposals seal + the contract's read-only reality pins).
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
  reviseOperation,
  stepTimeline,
  submitIntent,
  validateCurrentVersion,
  type ManipulationAction,
  type WorkspaceDeps,
} from "./operations-core";
import { currentVersionOf, cursorStateOf, quantityRowsOf } from "./model";
import type { SolutionWorkspaceState, ViewerViewParams } from "./model";

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

export interface SolutionWorkspaceBodyProps {
  readonly context: SolutionCaseContext;
  /** The agent seam — absent means the honest "not connected" panel. */
  readonly agent?: SolutionAgentHandle;
  /** BOQ data through the guarded seam, when the case context has it. */
  readonly boq?: SolutionBoqSyncInput;
  /** The EXPLICIT workspace bindings (service port, clock, acting user). */
  readonly deps: WorkspaceDeps;
  /** The opened initial workspace state (an engine-computed baseline). */
  readonly openedState: SolutionWorkspaceState;
}

/* ------------------------------------------------------------------ */
/* The component                                                       */
/* ------------------------------------------------------------------ */

export function SolutionWorkspaceBody(props: SolutionWorkspaceBodyProps): React.ReactNode {
  const context = props.context;
  const deps = props.deps;
  const service = deps.service;
  const clock = deps.clock;
  const authoredBy = deps.authoredBy;

  const [state, setState] = useState<SolutionWorkspaceState>(() => props.openedState);
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
