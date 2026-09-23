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
 * path (`submitIntent` of operations-core) into the ENGINE service; the
 * UI renders engine-computed states only; the OBSERVED scene is read-only
 * display data and PROPOSED layers can never overwrite it (the engine's
 * proposals seal + the contract's read-only reality pins).
 *
 * MOUNT CONTRACT (§4.1): the Tech Lead mounts this component at the
 * integration station with the case/solution context and the port
 * bindings as props — no global singletons, no module side effects.
 *
 * PROD-031 (the browser-safe cut): the component tree lives in
 * `./SolutionWorkspaceBody` (the binding-explicit, crypto-free core) and
 * THIS entry keeps the mount contract verbatim — the OPTIONAL bindings
 * default to the LOCAL engine binding (`createLocalSolutionService`, the
 * deterministic in-process engine: the default where the module graph
 * evaluates — the deterministic gate, the server-side renders) and the
 * workspace opens SYNCHRONOUSLY through the local engine's baseline
 * materialization (`openWorkspace` of `./operations`). The BROWSER mount
 * (the composition layer's second rung) instead mounts the BODY directly
 * with the HTTP service binding and the service-port opening
 * (`openWorkspaceThroughService`) — the same component tree, the same
 * ONE submission path, the engine executing server-side over the mounted
 * routes.
 */

import { useMemo, useState } from "react";
import type { SolutionBoqSyncInput } from "./boq";
import type { SolutionAgentHandle, SolutionCaseContext } from "./SolutionWorkspaceBody";
import { SolutionWorkspaceBody } from "./SolutionWorkspaceBody";
import { defaultWorkspaceClock, openWorkspace } from "./operations";
import type { WorkspaceClock, WorkspaceDeps } from "./operations";
import { createLocalSolutionService } from "./service";
import type { SolutionServicePort } from "./service";
import type { SolutionWorkspaceState } from "./model";

export type { SolutionCaseContext, SolutionAgentHandle } from "./SolutionWorkspaceBody";

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

/**
 * The workspace entry (the NODE DEFAULT bindings): resolves the optional
 * props exactly as the PROD-024 mount contract documents them — the local
 * engine service, the fixed stepped demo clock, the demo engineer as the
 * acting user — opens the workspace synchronously through the local
 * engine's baseline materialization, and renders the full component body
 * over those bindings.
 */
export function SolutionWorkspace(props: SolutionWorkspaceProps): React.ReactNode {
  const context = props.context;
  const clock = props.clock ?? defaultWorkspaceClock();
  const authoredBy = props.userId ?? "user-demo-engineer";
  // The DEFAULT service is created ONCE per mount (the engine service is
  // stateless — every method a pure function of its request — so this is
  // observably identical to the per-render construction the PROD-024
  // component performed, without the per-render churn).
  const [defaultService] = useState(() =>
    createLocalSolutionService(
      context.baselineGeometry === undefined
        ? {}
        : { baselineGeometry: context.baselineGeometry },
    ),
  );
  const deps: WorkspaceDeps = useMemo(
    () => ({ service: props.service ?? defaultService, clock, authoredBy }),
    [props.service, defaultService, clock, authoredBy],
  );
  const [openedState] = useState<SolutionWorkspaceState>(() =>
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
  return (
    <SolutionWorkspaceBody
      agent={props.agent}
      boq={props.boq}
      context={context}
      deps={deps}
      openedState={openedState}
    />
  );
}
