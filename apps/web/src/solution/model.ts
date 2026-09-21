/**
 * PROD-024 — the interactive solution workspace STATE MODEL.
 *
 * ⚠⚠⚠ NO BROWSER-SIDE AUTHORITY (the frozen invariant of
 * spec/architecture-lock.md "Authority" #9: UI state is never canonical)
 * ⚠⚠⚠
 *
 * The workspace state holds ONLY:
 *
 *  - the case/solution identity (received via props);
 *  - the APPEND-ONLY version history — every `SolutionVersion` here was
 *    ASSEMBLED FROM ENGINE OUTPUT ONLY (the engine's `applyOperation`
 *    results and `materializeBaselineState`; never a client-computed
 *    state, never a client-authored operation);
 *  - the timeline cursor (WHICH engine state is being viewed — moving it
 *    changes presentation only);
 *  - the selection, the agent turn's pending state + transcript, the
 *    journey trace log and presentational view parameters.
 *
 * EVERY mutation of the proposal flows through the engine service port
 * (`service.ts`): there is no reducer action that changes a proposed
 * state's content, and no action at all that touches the observed scene or
 * the authoritative Reality Graph (mutation protection is structural —
 * asserted by the co-located tests).
 *
 * DETERMINISM: the state carries no clock and no randomness; every
 * engine-facing instant is injected by the controller. Two identical
 * interaction scripts produce byte-identical serialized journey traces
 * (`serializeJourneyTrace` — the golden-journey determinism proof).
 */

import type {
  ProposedState,
  SolutionValidationSnapshot,
  SolutionVersion,
} from "../../../../packages/solution-contract/src/index";
import type { StateQuantityInventory } from "../../../../packages/solution-engine/src/index";
import { canonicalJsonStringify } from "../../../../packages/shared-contracts/src/index";
import type {
  AgentPendingClarification,
  AgentPendingProposal,
} from "./agent/port";

/* ------------------------------------------------------------------ */
/* Viewer view parameters (presentation only)                          */
/* ------------------------------------------------------------------ */

/** Axonographic view parameters (radians) — presentation only. */
export interface ViewerViewParams {
  /** Rotation of the model about the vertical (z) axis. */
  readonly azimuthRad: number;
  /** Viewing elevation above the horizontal plane. */
  readonly elevationRad: number;
  /** Which projection the main pane shows. */
  readonly projection: "plan" | "axonometric";
}

export const DEFAULT_VIEW_PARAMS: ViewerViewParams = Object.freeze({
  azimuthRad: Math.PI / 6,
  elevationRad: Math.PI / 5,
  projection: "axonometric",
} as const);

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

/** What the user has selected (presentation; resolves cross-pane focus). */
export type WorkspaceSelection =
  | { readonly kind: "scene-element"; readonly elementId: string }
  | { readonly kind: "operation"; readonly operationId: string }
  | { readonly kind: "boq-line"; readonly boqLineId: string };

/* ------------------------------------------------------------------ */
/* Notices (refusals surfaced honestly)                                */
/* ------------------------------------------------------------------ */

/**
 * A refusal/notice the workspace surfaces VERBATIM: the engine's typed
 * outcome (or the revision's, or the compiler's) with its machine-readable
 * reasons — never re-authored, never dropped.
 */
export interface WorkspaceNotice {
  readonly source: "solution-engine" | "solution-agent" | "workspace";
  readonly kind:
    | "engine-refusal"
    | "revision-refused"
    | "agent-unsupported"
    | "agent-ambiguous"
    | "agent-unsafe-refusal"
    | "service-error";
  readonly outcome: string;
  readonly reasons: readonly { readonly code: string; readonly detail: string }[];
}

/* ------------------------------------------------------------------ */
/* The agent transcript (verbatim rendering of the port's outcomes)     */
/* ------------------------------------------------------------------ */

export type TranscriptEntry =
  | { readonly who: "user"; readonly text: string }
  | {
      readonly who: "agent";
      readonly kind: "ask" | "propose" | "notice" | "tool";
      readonly text: string;
      /** The port's verbatim question/proposal payloads, when present. */
      readonly questions?: readonly {
        readonly slotKind: string;
        readonly slot: string;
        readonly question: string;
      }[];
      readonly proposalSummary?: {
        readonly renderedCommand: string;
        readonly target: string;
        readonly estimatedQuantities: readonly { readonly label: string; readonly value: number; readonly unit: string }[];
        readonly irreversible: boolean;
        readonly reviewRequirements: readonly string[];
      };
    };

/* ------------------------------------------------------------------ */
/* The journey trace (the deterministic operation-trace log)            */
/* ------------------------------------------------------------------ */

/** One recorded step of the user's journey (the operation trace identity). */
export interface JourneyStepRecord {
  readonly step: number;
  readonly kind:
    | "inspect"
    | "direct-manipulation"
    | "agent-turn"
    | "step-back"
    | "step-forward"
    | "step-jump"
    | "revise"
    | "confirm"
    | "validate";
  readonly origin?: "direct-manipulation" | "agent";
  readonly utterance?: string;
  readonly intentId?: string;
  readonly operationId?: string;
  readonly stateId?: string;
  readonly transitionId?: string;
  readonly versionNumber?: number;
  readonly stateIndex?: number;
  readonly detail: string;
}

/* ------------------------------------------------------------------ */
/* The workspace state                                                 */
/* ------------------------------------------------------------------ */

/** The workspace's immutable state (every field read-only). */
export interface SolutionWorkspaceState {
  /* Case/solution identity (props; never mutated here). */
  readonly projectId: string;
  readonly caseId: string;
  readonly solutionId: string;
  readonly title: string;
  readonly problemStatement: string;
  readonly baselineRealityVersionId: string;

  /**
   * APPEND-ONLY version history — version N is `versions[N - 1]`. Version 1
   * is created from the baseline overlay (engine `materializeBaselineState`)
   * when the workspace opens; every later version exists only as the
   * engine's revision output (`reviseVersion` — undo creates a NEW version,
   * never a rewrite). Historical versions are NEVER mutated (asserted by
   * the sabotage tests).
   */
  readonly versions: readonly SolutionVersion[];
  /** Which version the timeline views (1-based; always a defined entry). */
  readonly currentVersionNumber: number;
  /** Timeline cursor: the state layer being viewed (0 = baseline overlay). */
  readonly cursorStateIndex: number;

  /* Selection + focus (presentation only). */
  readonly selection: WorkspaceSelection | undefined;
  /** Isolate the selected operation's affected geometry in the viewer. */
  readonly isolate: boolean;

  /* Engine-derived data (rendered verbatim). */
  readonly inventory: StateQuantityInventory | undefined;
  readonly validationSnapshot: SolutionValidationSnapshot | undefined;

  /* The agent panel's state. */
  readonly pendingClarification: AgentPendingClarification | undefined;
  readonly pendingProposal: AgentPendingProposal | undefined;
  readonly transcript: readonly TranscriptEntry[];
  readonly agentBusy: boolean;

  /* Notices + trace. */
  readonly notice: WorkspaceNotice | undefined;
  readonly journey: readonly JourneyStepRecord[];
  readonly view: ViewerViewParams;
  /** Whether the accessible non-viewer fallback is the active mode. */
  readonly fallbackMode: boolean;
}

/* ------------------------------------------------------------------ */
/* Initial state                                                       */
/* ------------------------------------------------------------------ */

/**
 * The workspace's opening state: version 1 exists with ONLY the baseline
 * overlay (engine materialization, caller-pinned instant), the cursor is
 * at layer 0 and the journey records the `inspect` step.
 */
export function initialWorkspaceState(input: {
  readonly projectId: string;
  readonly caseId: string;
  readonly solutionId: string;
  readonly title: string;
  readonly problemStatement: string;
  readonly baselineRealityVersionId: string;
  readonly baselineState: ProposedState;
  readonly createdAt: string;
}): SolutionWorkspaceState {
  const version: SolutionVersion = {
    contractVersion: "1.0.0",
    solutionId: input.solutionId,
    versionNumber: 1,
    status: "draft",
    operations: [],
    states: [input.baselineState],
    createdAt: input.createdAt,
  };
  return {
    projectId: input.projectId,
    caseId: input.caseId,
    solutionId: input.solutionId,
    title: input.title,
    problemStatement: input.problemStatement,
    baselineRealityVersionId: input.baselineRealityVersionId,
    versions: [version],
    currentVersionNumber: 1,
    cursorStateIndex: 0,
    selection: undefined,
    isolate: false,
    inventory: undefined,
    validationSnapshot: undefined,
    pendingClarification: undefined,
    pendingProposal: undefined,
    transcript: [],
    agentBusy: false,
    notice: undefined,
    journey: [
      {
        step: 1,
        kind: "inspect",
        stateId: input.baselineState.stateId,
        versionNumber: 1,
        stateIndex: 0,
        detail:
          `opened the solution workspace on the observed baseline ` +
          `(reality version ${input.baselineRealityVersionId}) — the proposal ` +
          `starts from the baseline overlay, layer 0`,
      },
    ],
    view: DEFAULT_VIEW_PARAMS,
    fallbackMode: false,
  };
}

/* ------------------------------------------------------------------ */
/* Derivations (pure)                                                  */
/* ------------------------------------------------------------------ */

/** The version the timeline currently views (always defined). */
export function currentVersionOf(state: SolutionWorkspaceState): SolutionVersion {
  const version = state.versions[state.currentVersionNumber - 1];
  if (version === undefined) {
    throw new Error(
      `workspace state is corrupt: version ${state.currentVersionNumber} of ` +
        `solution '${state.solutionId}' is missing from the history`,
    );
  }
  return version;
}

/** The engine state at the timeline cursor (ALWAYS an engine-recorded state). */
export function cursorStateOf(state: SolutionWorkspaceState): ProposedState {
  const version = currentVersionOf(state);
  const cursor = version.states[state.cursorStateIndex];
  if (cursor === undefined) {
    throw new Error(
      `workspace state is corrupt: cursor ${state.cursorStateIndex} is outside ` +
        `version ${version.versionNumber}'s ${version.states.length} state layers`,
    );
  }
  return cursor;
}

/** One timeline tick: the state layer + the operation that produced it. */
export interface TimelineTick {
  readonly stateIndex: number;
  readonly stateId: string;
  /** The operation that produced this layer (undefined for layer 0). */
  readonly operationId: string | undefined;
  readonly operationType: string | undefined;
  readonly label: string;
  readonly isCursor: boolean;
}

/** The full timeline of the current version (engine states, in order). */
export function timelineOf(state: SolutionWorkspaceState): readonly TimelineTick[] {
  const version = currentVersionOf(state);
  return version.states.map((proposed, index) => {
    const operation =
      index === 0 ? undefined : version.operations[index - 1];
    return {
      stateIndex: proposed.stateIndex,
      stateId: proposed.stateId,
      operationId: operation?.operationId,
      operationType: operation?.operationType,
      label:
        index === 0
          ? "Observed baseline (layer 0)"
          : `Step ${index} — ${operation?.operationType ?? "operation"}`,
      isCursor: index === state.cursorStateIndex,
    };
  });
}

/** Clamps a target state index into the current version's layer range. */
export function clampStateIndex(state: SolutionWorkspaceState, target: number): number {
  const version = currentVersionOf(state);
  return Math.max(0, Math.min(target, version.states.length - 1));
}

/* ------------------------------------------------------------------ */
/* Quantity rows (ENGINE-RECORDED effects, rendered verbatim)          */
/* ------------------------------------------------------------------ */

/** One engine-recorded quantity impact row of the current view. */
export interface QuantityRow {
  readonly step: number;
  readonly operationId: string;
  readonly operationType: string;
  readonly direction: string;
  readonly value: number;
  readonly unit: string;
  readonly calculationRef: string;
}

/**
 * The quantity impacts of the operations applied up to the cursor, taken
 * VERBATIM from the engine-recorded operations' `quantity-impact` effects
 * (no client-side arithmetic anywhere). When the engine service's
 * aggregated inventory is present its net totals are used; the rows are
 * always the engine's own effect records.
 */
export function quantityRowsOf(state: SolutionWorkspaceState): readonly QuantityRow[] {
  const version = currentVersionOf(state);
  const applied = new Set(cursorStateOf(state).appliedOperationIds);
  const rows: QuantityRow[] = [];
  for (const operation of version.operations) {
    if (!applied.has(operation.operationId)) {
      continue;
    }
    for (const effect of operation.effects) {
      if (effect.effectKind !== "quantity-impact" || effect.quantity === undefined) {
        continue;
      }
      rows.push({
        step: operation.operationIndex,
        operationId: operation.operationId,
        operationType: operation.operationType,
        direction: effect.direction ?? "changed",
        value: effect.quantity.value,
        unit: effect.quantity.unit,
        calculationRef: effect.quantity.calculationRef,
      });
    }
  }
  return rows;
}

/** Appends one journey record (step numbers are 1-based and contiguous). */
export function withJourneyStep(
  state: SolutionWorkspaceState,
  record: Omit<JourneyStepRecord, "step">,
): SolutionWorkspaceState {
  const step = state.journey.length + 1;
  return { ...state, journey: [...state.journey, { ...record, step }] };
}

/* ------------------------------------------------------------------ */
/* Journey trace serialization (the byte-stable determinism proof)      */
/* ------------------------------------------------------------------ */

/**
 * Serializes the journey trace canonically (sorted keys, 2-space indent):
 * two identical interaction scripts produce BYTE-IDENTICAL traces — the
 * golden-journey determinism acceptance. The trace joins manipulation,
 * agent turns, timeline steps and revisions through the engine's trace
 * identities (operation id / state id / transition id).
 */
export function serializeJourneyTrace(state: SolutionWorkspaceState): string {
  return canonicalJsonStringify({
    solutionId: state.solutionId,
    baselineRealityVersionId: state.baselineRealityVersionId,
    finalVersionNumber: state.currentVersionNumber,
    finalStateId: cursorStateOf(state).stateId,
    journey: state.journey,
  });
}
