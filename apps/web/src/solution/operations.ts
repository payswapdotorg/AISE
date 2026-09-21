/**
 * PROD-024 — MANIPULATION → TYPED OPERATION MAPPING + THE ONE SUBMISSION
 * PATH of the interactive solution workspace.
 *
 * THE CONVERGENCE LAW (§4.2 of the work order): EVERY user manipulation —
 * direct-manipulation control, timeline action, fallback-path action or
 * confirmed agent proposal — produces the SAME typed
 * `EngineeringOperationIntent` objects the agent path produces (built
 * through the contract's ONE constructor surface `createOperationIntent`)
 * and flows through THE ONE submission path `submitIntent` below, which
 * calls the solution ENGINE service and renders ONLY engine-computed
 * states. There is NO client-local operation semantics and NO optimistic
 * local geometry anywhere in this module:
 *
 *  - the DIRECT-MANIPULATION catalog offers real-world-worded actions per
 *    selected object/region, with parameter fields driven by the
 *    ENGINE-OWNED capability profile's `requiredParameters` (the profile
 *    is reference data — the workspace renders it read-only, never
 *    re-derives it);
 *  - `buildDirectManipulationIntent` constructs the typed intent with
 *    `provenance.origin: "direct-manipulation"` + the interaction detail;
 *  - `submitIntent` submits it to the engine service; the resulting
 *    operation/state/effect/lineage values are the ENGINE's outputs,
 *    stored verbatim;
 *  - `reviseOperation` (undo) flows through the engine's revision service
 *    — a NEW version, never a mutation (append-only history);
 *  - the AGENT path routes confirmed proposals through THE SAME
 *    `submitIntent` (the interaction controller in agent/controller.ts).
 *
 * The same semantics authored by direct manipulation or by the agent is
 * the SAME operation (the contract's identity derivation excludes
 * provenance — proven by the co-located tests with the committed
 * direct/agent intent fixture pair).
 */

import {
  createOperationIntent,
  REFERENCE_BUILDING_DOMAIN,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
  type EngineeringOperationIntent,
  type OperationCapabilityProfile,
  type OperationTarget,
  type SolutionDomainDescriptor,
} from "../../../../packages/solution-contract/src/index";
import type { AppliedOperation, RefusedOperation } from "../../../../packages/solution-engine/src/index";
import {
  materializeBaselineState,
} from "../../../../packages/solution-engine/src/index";
import type { SolutionServicePort } from "./service";
import type { SolutionBoqSyncInput } from "./boq";
import {
  clampStateIndex,
  currentVersionOf,
  cursorStateOf,
  initialWorkspaceState,
  withJourneyStep,
  type SolutionWorkspaceState,
  type TranscriptEntry,
  type WorkspaceNotice,
} from "./model";
import type { AgentTurnDecision } from "./agent/port";
import type { ObservedScene, SceneElement } from "./viewer/model";
import { resolveBoqForOperation } from "./boq";

/* ------------------------------------------------------------------ */
/* The deterministic workspace clock (injected; never a wall clock)     */
/* ------------------------------------------------------------------ */

/**
 * The workspace's injected time source. The DEFAULT is a DETERMINISTIC
 * stepped clock anchored at a fixed instant (the engine testkit's demo
 * discipline): layer N materializes at base + N minutes. Instants are
 * excluded from every identity derivation (the contract's rule), so this
 * only affects provenance display — never operation/state identities.
 */
export interface WorkspaceClock {
  /** The next instant for an authoring/creation act. */
  readonly now: () => string;
  /** The deterministic materialization instant of state layer N. */
  readonly materializeAt: (stateIndex: number) => string;
}

/** A fixed-base stepped clock (deterministic; the default). */
export function steppedWorkspaceClock(base: string, stepMs: number): WorkspaceClock {
  const baseMs = Date.parse(base);
  if (!Number.isFinite(baseMs)) {
    throw new Error(`steppedWorkspaceClock: base '${base}' is not a parseable instant`);
  }
  let ticks = 0;
  const iso = (ms: number): string => new Date(ms).toISOString();
  return {
    now: () => iso(baseMs + ++ticks * stepMs),
    materializeAt: (stateIndex) => iso(baseMs + stateIndex * stepMs),
  };
}

/** The default deterministic clock (2026-09-16T10:00:00.000Z + 1 min/layer). */
export function defaultWorkspaceClock(): WorkspaceClock {
  return steppedWorkspaceClock("2026-09-16T10:00:00.000Z", 60_000);
}

/* ------------------------------------------------------------------ */
/* Workspace dependencies (injected ports — no singletons)             */
/* ------------------------------------------------------------------ */

export interface WorkspaceDeps {
  /** The solution ENGINE service port (service.ts — the one server seam). */
  readonly service: SolutionServicePort;
  /** The injected deterministic clock (never a wall clock). */
  readonly clock: WorkspaceClock;
  /** The acting user (provenance attribution of direct manipulations). */
  readonly authoredBy: string;
}

/* ------------------------------------------------------------------ */
/* The direct-manipulation catalog (real-world wording, engine-driven)  */
/* ------------------------------------------------------------------ */

/** One offered manipulation action for a selected object/region. */
export interface ManipulationAction {
  /** Stable action id (presentation only). */
  readonly actionId: string;
  /** Real-world wording of the action (no AISE-internal jargon). */
  readonly label: string;
  /** What this action does, in one sentence (real-world wording). */
  readonly description: string;
  /** The operation type the action authors (engine vocabulary). */
  readonly operationType: string;
  /** Parameter fields, in the engine profile's declaration order. */
  readonly parameterFields: readonly ManipulationParameterField[];
}

/** One parameter field of a manipulation action. */
export interface ManipulationParameterField {
  readonly name: string;
  readonly label: string;
  /** "m"-family unit the input renders in (the intent carries it verbatim). */
  readonly unit: string;
  /** Optional offered choices (materials). */
  readonly choices?: readonly string[];
}

/** The default unit of a parameter slot, PER OPERATION TYPE (presentation
 *  convention mirroring the committed corpus's real-world wording: m for
 *  construction dimensions, mm for coats and pipe diameters). */
const PARAMETER_UNITS: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  excavation: { depth: "m", width: "m", length: "m" },
  backfill: { depth: "m", width: "m", length: "m" },
  "demolition-removal": { length: "m", height: "m", thickness: "m" },
  "foundation-placement": { length: "m", width: "m", depth: "m", material: "" },
  "slab-placement": { length: "m", width: "m", thickness: "m", material: "" },
  "block-wall-placement": { length: "m", height: "m", thickness: "m", material: "" },
  "opening-creation": { width: "m", height: "m", material: "" },
  "plaster-application": { thickness: "mm", material: "" },
  "finish-application": { thickness: "mm", material: "" },
  "building-service-installation": { length: "m", diameter: "mm", material: "" },
} as const);

/** The default unit of one parameter of one operation type ("" = none). */
function parameterUnitOf(operationType: string, name: string): string {
  return PARAMETER_UNITS[operationType]?.[name] ?? "m";
}

const MATERIAL_PARAMETERS = new Set(["material"]);

/** Real-world wording of parameter slots. */
const PARAMETER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  depth: "Depth",
  width: "Width",
  length: "Length",
  height: "Height",
  thickness: "Thickness",
  material: "Material",
  diameter: "Pipe diameter",
} as const);

/**
 * The actions offered for one selected scene element, derived from the
 * ENGINE-OWNED capability profile (required parameters in declaration
 * order) and the element's selector kind. The catalog is PRESENTATION:
 * it decides which controls to OFFER; the semantics always come from the
 * engine (the offered types are the engine profile's own supported
 * vocabulary for the element's anchoring kind).
 */
export function manipulationActionsForElement(
  element: SceneElement,
  profile: OperationCapabilityProfile = REFERENCE_BUILDING_OPERATION_PROFILE,
): readonly ManipulationAction[] {
  const types = OPERATIONS_BY_SELECTOR_KIND[element.selectorKind] ?? [];
  const declared = new Map(
    profile.domains.flatMap((domain) =>
      domain.operations.map((operation) => [operation.operationType, operation] as const),
    ),
  );
  const actions: ManipulationAction[] = [];
  for (const operationType of types) {
    const entry = declared.get(operationType);
    if (entry === undefined) {
      continue; // the engine does not declare it — the control is not offered
    }
    actions.push({
      actionId: `${element.elementId}:${operationType}`,
      label: ACTION_LABELS[operationType] ?? operationType,
      description: ACTION_DESCRIPTIONS[operationType] ?? "",
      operationType,
      parameterFields: entry.requiredParameters.map((name) => ({
        name,
        label: PARAMETER_LABELS[name] ?? name,
        unit: MATERIAL_PARAMETERS.has(name) ? "" : parameterUnitOf(operationType, name),
        ...(MATERIAL_PARAMETERS.has(name) && MATERIAL_CHOICES[operationType] !== undefined
          ? { choices: MATERIAL_CHOICES[operationType] }
          : {}),
      })),
    });
  }
  return actions;
}

/** Which operation types anchor to which selector kind (presentation map). */
const OPERATIONS_BY_SELECTOR_KIND: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  volume: ["excavation", "backfill", "slab-placement", "foundation-placement"],
  element: ["demolition-removal", "block-wall-placement", "opening-creation", "plaster-application", "finish-application", "building-service-installation"],
  "face-set": ["demolition-removal", "plaster-application", "finish-application"],
  "surface-region": ["demolition-removal", "plaster-application", "finish-application"],
  "line-extent": ["block-wall-placement", "building-service-installation"],
  point: ["building-service-installation"],
  storey: [],
  space: [],
} as const);

/** Real-world action wording (the no-jargon acceptance surface). */
const ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  excavation: "Dig an excavation pit",
  backfill: "Fill the area back in",
  "demolition-removal": "Remove the damaged section",
  "block-wall-placement": "Build a new block wall",
  "foundation-placement": "Lay a new footing",
  "slab-placement": "Pour a new floor slab",
  "opening-creation": "Cut a new opening",
  "plaster-application": "Apply a plaster coat",
  "finish-application": "Apply a finish coat",
  "building-service-installation": "Run a service line",
} as const);

const ACTION_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  excavation: "Remove soil to create a pit in the selected area.",
  backfill: "Fill the selected excavated area with material.",
  "demolition-removal": "Break out and remove the selected section of the building.",
  "block-wall-placement": "Build a new wall from blocks in the selected position.",
  "foundation-placement": "Place a new strip footing under the selected line.",
  "slab-placement": "Place a new ground-bearing floor slab in the selected area.",
  "opening-creation": "Cut a new door or window opening in the selected wall.",
  "plaster-application": "Coat the selected surfaces with plaster.",
  "finish-application": "Coat the selected surfaces with a finish layer.",
  "building-service-installation": "Install a conduit or cable-tray run along the selected line.",
} as const);

const MATERIAL_CHOICES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "block-wall-placement": ["concrete-block", "clay-block", "aac-block"],
  "foundation-placement": ["plain-concrete", "reinforced-concrete"],
  "slab-placement": ["plain-concrete", "reinforced-concrete"],
  "opening-creation": ["door", "window", "plain-opening"],
  "plaster-application": ["cement-plaster", "gypsum-plaster", "lime-plaster"],
  "finish-application": ["paint", "tile", "render"],
  "building-service-installation": ["pvc-conduit", "steel-conduit", "cable-tray"],
} as const);

/* ------------------------------------------------------------------ */
/* Intent construction (the ONE constructor surface, both origins)      */
/* ------------------------------------------------------------------ */

/** A direct-manipulation draft: the chosen action + its parameter values. */
export interface ManipulationDraft {
  readonly elementId: string;
  readonly operationType: string;
  /** Parameter values keyed by slot name (numbers or material strings). */
  readonly parameterValues: Readonly<Record<string, number | string>>;
  /** Intent id (stable authoring-event id; caller-assigned, deterministic). */
  readonly intentId: string;
}

/**
 * Builds the typed intent of one direct manipulation through the
 * CONTRACT's single constructor surface: `origin: "direct-manipulation"`
 * with the interaction detail, parameters WITH UNITS, the element's
 * read-only reality anchoring and the current proposal context.
 */
export function buildDirectManipulationIntent(
  draft: ManipulationDraft,
  element: SceneElement,
  state: SolutionWorkspaceState,
  authoredAt: string,
  authoredBy: string,
): EngineeringOperationIntent {
  const action = directActionOf(draft, element);
  const parameters = action.parameterFields.map((field) => {
    const value = draft.parameterValues[field.name];
    if (value === undefined) {
      throw new Error(
        `manipulation draft is missing the '${field.name}' value for ` +
          `'${draft.operationType}' — the engine requires it (never invented)`,
      );
    }
    return MATERIAL_PARAMETERS.has(field.name)
      ? { name: field.name, value: String(value) }
      : { name: field.name, value: Number(value), unit: field.unit };
  });
  return createOperationIntent({
    intentId: draft.intentId,
    operationType: draft.operationType,
    domain: REFERENCE_BUILDING_DOMAIN,
    parameters,
    target: targetOfElement(element),
    provenance: {
      origin: "direct-manipulation",
      authoredBy,
      authoredAt,
      evidenceIds: [],
      derivationNote: `operator authored '${action.label}' for ${element.label} through the workspace's direct-manipulation controls`,
      interactionDetail: `selected ${element.label} in the ${element.selectorKind} view and dimensioned the action`,
    },
    proposedTo: {
      solutionId: state.solutionId,
      versionNumber: currentVersionOf(state).versionNumber,
    },
  });
}

/** The contract `OperationTarget` of a scene element (read-only anchors). */
export function targetOfElement(element: SceneElement): OperationTarget {
  return {
    contractVersion: "1.0.0",
    selectorKind: element.selectorKind,
    nodeRefs: [...element.nodeRefs],
    geometryRefs: element.geometryRefs.map((ref) => ({ ...ref })),
    units: { linear: "m", angular: "rad" },
    description: element.label,
  };
}

function directActionOf(draft: ManipulationDraft, element: SceneElement): ManipulationAction {
  const actions = manipulationActionsForElement(element);
  const action = actions.find((candidate) => candidate.operationType === draft.operationType);
  if (action === undefined) {
    throw new Error(
      `operation type '${draft.operationType}' is not offered for ` +
        `'${element.elementId}' (selector kind '${element.selectorKind}') — ` +
        `the catalog offers only engine-declared types`,
    );
  }
  return action;
}

/* ------------------------------------------------------------------ */
/* Opening the workspace (the engine-materialized baseline overlay)     */
/* ------------------------------------------------------------------ */

/**
 * Opens the workspace: materializes the baseline overlay (layer 0) through
 * the ENGINE's `materializeBaselineState` and records the `inspect` step.
 * Version 1 starts as an empty draft over the pinned observed reality.
 */
export function openWorkspace(input: {
  readonly projectId: string;
  readonly caseId: string;
  readonly solutionId: string;
  readonly title: string;
  readonly problemStatement: string;
  readonly baselineRealityVersionId: string;
  readonly createdAt: string;
  readonly materializedAt: string;
}): SolutionWorkspaceState {
  const baselineState = materializeBaselineState({
    solutionId: input.solutionId,
    versionNumber: 1,
    baselineRealityVersionId: input.baselineRealityVersionId,
    materializedAt: input.materializedAt,
  });
  return initialWorkspaceState({
    projectId: input.projectId,
    caseId: input.caseId,
    solutionId: input.solutionId,
    title: input.title,
    problemStatement: input.problemStatement,
    baselineRealityVersionId: input.baselineRealityVersionId,
    baselineState,
    createdAt: input.createdAt,
  });
}

/* ------------------------------------------------------------------ */
/* THE ONE SUBMISSION PATH (both authoring modes converge here)         */
/* ------------------------------------------------------------------ */

/**
 * Submits ONE typed intent to the ENGINE service and folds the result
 * into the workspace state:
 *
 *  - `applied` → the engine's operation + resulting state are appended to
 *    the CURRENT version (engine output VERBATIM — no client computation),
 *    the timeline cursor moves to the new layer and the journey records
 *    the operation/state/transition identities;
 *  - refused (`invalid` | `unsupported` | `needs-input`) → the workspace
 *    surfaces the refusal HONESTLY (typed notice with the engine's
 *    machine-readable reasons, verbatim) and NOTHING is appended.
 *
 * BOTH authoring modes call this one function (direct manipulation from
 * the controls; the agent path from a confirmed proposal — §4.2).
 */
export async function submitIntent(
  state: SolutionWorkspaceState,
  intent: EngineeringOperationIntent,
  deps: WorkspaceDeps,
): Promise<SolutionWorkspaceState> {
  const version = currentVersionOf(state);
  const baseline = version.states[version.states.length - 1];
  if (baseline === undefined) {
    throw new Error("workspace state is corrupt: the current version has no states");
  }
  const nextIndex = baseline.stateIndex + 1;
  const materializedAt = deps.clock.materializeAt(nextIndex);
  const result = await deps.service.step({
    baseline,
    intent,
    materializedAt,
  });

  if (result.result.outcome === "applied") {
    return foldApplied(state, result.result, intent);
  }
  return foldRefused(state, result.result, intent);
}

/** Folds one ENGINE-applied operation into the state (append-only). */
function foldApplied(
  state: SolutionWorkspaceState,
  applied: AppliedOperation,
  intent: EngineeringOperationIntent,
): SolutionWorkspaceState {
  const version = currentVersionOf(state);
  const nextVersion = {
    ...version,
    operations: [...version.operations, applied.operation],
    states: [...version.states, applied.resultingState],
  };
  const versions = [...state.versions];
  versions[nextVersion.versionNumber - 1] = nextVersion;
  const origin = intent.provenance.origin === "agent" ? "agent" : "direct-manipulation";
  const journeyKind = origin === "agent" ? "confirm" : "direct-manipulation";
  return withJourneyStep(
    {
      ...state,
      versions,
      cursorStateIndex: applied.resultingState.stateIndex,
      notice: undefined,
      pendingProposal: undefined,
      pendingClarification: undefined,
    },
    {
      kind: journeyKind,
      origin,
      intentId: intent.intentId,
      operationId: applied.operation.operationId,
      stateId: applied.resultingState.stateId,
      transitionId: applied.lineage.transitionId,
      versionNumber: nextVersion.versionNumber,
      stateIndex: applied.resultingState.stateIndex,
      detail:
        `applied '${applied.operation.operationType}' ` +
        `${origin === "agent" ? "(agent command confirmed)" : "(direct manipulation)"} ` +
        `— engine state layer ${applied.resultingState.stateIndex} of version ` +
        `${nextVersion.versionNumber}`,
    },
  );
}

/** Folds one ENGINE refusal into the state (honest notice, no append). */
function foldRefused(
  state: SolutionWorkspaceState,
  refused: RefusedOperation,
  intent: EngineeringOperationIntent,
): SolutionWorkspaceState {
  const origin = intent.provenance.origin === "agent" ? "agent" : "direct-manipulation";
  const notice: WorkspaceNotice = {
    source: "solution-engine",
    kind: "engine-refusal",
    outcome: refused.outcome,
    reasons: refused.reasons.map((reason) => ({ code: reason.code, detail: reason.detail })),
  };
  return withJourneyStep(
    { ...state, notice },
    {
      kind: origin === "agent" ? "agent-turn" : "direct-manipulation",
      origin,
      intentId: intent.intentId,
      versionNumber: currentVersionOf(state).versionNumber,
      detail:
        `the solution engine REFUSED the '${intent.operationType}' intent ` +
        `(${refused.outcome}): ${refused.reasons
          .map((reason) => `${reason.code} — ${reason.detail}`)
          .join("; ")} — nothing was applied`,
    },
  );
}

/* ------------------------------------------------------------------ */
/* Timeline stepping (cursor over ENGINE states — presentation only)    */
/* ------------------------------------------------------------------ */

/**
 * Moves the timeline cursor to a target state layer (clamped). The state
 * AT the cursor is ALWAYS an engine-recorded layer of the current version
 * — stepping back restores the exact prior engine state (the layers are
 * the engine's own materializations; nothing is re-derived client-side).
 */
export function stepTimeline(
  state: SolutionWorkspaceState,
  targetStateIndex: number,
): SolutionWorkspaceState {
  const clamped = clampStateIndex(state, targetStateIndex);
  if (clamped === state.cursorStateIndex) {
    return state;
  }
  const target = cursorStateOf({ ...state, cursorStateIndex: clamped });
  const kind =
    clamped === state.cursorStateIndex - 1
      ? "step-back"
      : clamped === state.cursorStateIndex + 1
        ? "step-forward"
        : "step-jump";
  return withJourneyStep(
    { ...state, cursorStateIndex: clamped },
    {
      kind,
      versionNumber: currentVersionOf(state).versionNumber,
      stateIndex: clamped,
      stateId: target.stateId,
      detail: `stepped to engine state layer ${clamped} (state ${target.stateId})`,
    },
  );
}

/* ------------------------------------------------------------------ */
/* Revision (undo) — the engine's new-version path, never a mutation     */
/* ------------------------------------------------------------------ */

/**
 * Undoes one recorded operation by producing a NEW solution version
 * through the engine's revision service (the engine re-applies the kept
 * operations — new identities, provenance preserved). The PRIOR version
 * stays in the history UNTOUCHED (append-only); the timeline moves to the
 * new version's final layer.
 */
export async function reviseOperation(
  state: SolutionWorkspaceState,
  revertOperationId: string,
  deps: WorkspaceDeps,
  reason = "undo the recorded operation through the workspace timeline",
): Promise<SolutionWorkspaceState> {
  const version = currentVersionOf(state);
  const createdAt = deps.clock.now();
  const result = await deps.service.revise({
    version,
    revertOperationId,
    createdAt,
    materializeClock: deps.clock.materializeAt,
    revisionProvenance: {
      authoredBy: deps.authoredBy,
      reason,
      authoredAt: createdAt,
    },
  });
  if (result.outcome === "revised") {
    return withJourneyStep(
      {
        ...state,
        versions: [...state.versions, result.newVersion],
        currentVersionNumber: result.newVersion.versionNumber,
        cursorStateIndex: result.newVersion.states.length - 1,
        notice: undefined,
        validationSnapshot: undefined,
      },
      {
        kind: "revise",
        operationId: revertOperationId,
        stateId:
          result.newVersion.states[result.newVersion.states.length - 1]?.stateId,
        transitionId: result.revision.transitionId,
        versionNumber: result.newVersion.versionNumber,
        stateIndex: result.newVersion.states.length - 1,
        detail:
          `revised version ${version.versionNumber} into NEW version ` +
          `${result.newVersion.versionNumber} (reverting operation ` +
          `${revertOperationId.slice(0, 12)}…) — the prior version is ` +
          `preserved untouched in the history`,
      },
    );
  }
  return withJourneyStep(
    {
      ...state,
      notice: {
        source: "solution-engine",
        kind: "revision-refused",
        outcome: "invalid",
        reasons: result.reasons.map((entry) => ({ code: entry.code, detail: entry.detail })),
      },
    },
    {
      kind: "revise",
      operationId: revertOperationId,
      versionNumber: version.versionNumber,
      detail:
        `the solution engine REFUSED the revision: ${result.reasons
          .map((entry) => `${entry.code} — ${entry.detail}`)
          .join("; ")} — the version is unchanged`,
    },
  );
}

/* ------------------------------------------------------------------ */
/* Validation (the deterministic server-side Validate, verbatim)        */
/* ------------------------------------------------------------------ */

/** Runs the engine's deterministic Validate over the current version. */
export async function validateCurrentVersion(
  state: SolutionWorkspaceState,
  deps: WorkspaceDeps,
): Promise<SolutionWorkspaceState> {
  const version = currentVersionOf(state);
  const result = await deps.service.validate({
    version,
    validatedAt: deps.clock.now(),
  });
  return withJourneyStep(
    { ...state, validationSnapshot: result.snapshot },
    {
      kind: "validate",
      versionNumber: version.versionNumber,
      stateIndex: state.cursorStateIndex,
      detail:
        `validated version ${version.versionNumber}: outcome ` +
        `'${result.snapshot.outcome}' over ${result.snapshot.checks.length} ` +
        `deterministic checks (engine ${result.snapshot.engine.kind} ` +
        `${result.snapshot.engine.version})`,
    },
  );
}

/* ------------------------------------------------------------------ */
/* The agent session context (caller-assembled, exactly like PROD-023)  */
/* ------------------------------------------------------------------ */

/**
 * Assembles the caller-side agent session context from the workspace
 * state + scene: the spatial foci (one per observed element, with the
 * caller-known anchor facts), the recent operations (the current
 * version's, caller-projected) and the proposal context. The compiler
 * never fetches — this is the `GroundedContext` discipline of PROD-023.
 */
export function agentSessionContextOf(
  state: SolutionWorkspaceState,
  scene: ObservedScene,
  session: { readonly sessionId: string; readonly agentId: string; readonly userId?: string },
) {
  const version = currentVersionOf(state);
  return {
    sessionId: session.sessionId,
    agentId: session.agentId,
    ...(session.userId === undefined ? {} : { userId: session.userId }),
    proposedTo: {
      solutionId: state.solutionId,
      versionNumber: version.versionNumber,
    },
    foci: scene.elements.map((element) => ({
      focusId: element.elementId,
      label: element.label,
      aliases: [element.label.toLowerCase(), element.elementId],
      selectorKind: element.selectorKind,
      nodeRefs: [...element.nodeRefs],
      geometryRefs: element.geometryRefs.map((ref) => ({ ...ref })),
      knownParameters: element.facts
        .filter((fact) => fact.label === "Observed area")
        .map((fact) => ({ name: "area", value: Number(fact.value), unit: "m2" })),
    })),
    recentOperations: version.operations.map((operation) => ({
      operationId: operation.operationId,
      operationType: operation.operationType,
      parameters: [...operation.parameters],
    })),
  };
}

/* ------------------------------------------------------------------ */
/* The agent decision controller (the consumption side of the seam)      */
/* ------------------------------------------------------------------ */

/**
 * Folds one AGENT TURN DECISION (from the agent port) into the workspace
 * state. This is the CONSUMPTION side of the PROD-023 interaction loop —
 * the decision itself was produced by the compiler seam:
 *
 *  - `ask` → the questions surface VERBATIM (transcript + pending
 *    clarification); the workspace never answers them itself;
 *  - `propose` → the proposal previews BEFORE execution (rendered
 *    command, target, parameter-only quantity estimates, irreversible and
 *    review flags);
 *  - `dispatch-operation` (a user confirmation) → the intent is applied
 *    through THE SAME `submitIntent` path as direct manipulation;
 *  - `dispatch-tool` → the read-only tool commands execute through the
 *    service port / timeline cursor / BOQ seam and their reports render
 *    verbatim;
 *  - `unsupported` / `ambiguous` / `refuse` → the compiler's honest
 *    states surface verbatim — the workspace never invents an operation
 *    the compiler did not produce.
 */
export async function applyAgentDecision(
  state: SolutionWorkspaceState,
  utterance: string,
  decision: AgentTurnDecision,
  deps: WorkspaceDeps,
  boq: SolutionBoqSyncInput | undefined,
): Promise<SolutionWorkspaceState> {
  const userEntry: TranscriptEntry = { who: "user", text: utterance };
  switch (decision.decision) {
    case "ask": {
      return withJourneyStep(
        {
          ...state,
          pendingClarification: decision.pendingClarification,
          pendingProposal: undefined,
          transcript: [
            ...state.transcript,
            userEntry,
            {
              who: "agent",
              kind: "ask",
              text: decision.questions.map((question) => question.question).join(" "),
              questions: decision.questions.map((question) => ({
                slotKind: question.slotKind,
                slot: question.slot,
                question: question.question,
              })),
            },
          ],
        },
        {
          kind: "agent-turn",
          utterance,
          detail: `the agent asked for clarification: ${decision.questions
            .map((question) => question.slot)
            .join(", ")}`,
        },
      );
    }
    case "propose": {
      return withJourneyStep(
        {
          ...state,
          pendingProposal: decision.pendingProposal,
          pendingClarification: undefined,
          transcript: [
            ...state.transcript,
            userEntry,
            {
              who: "agent",
              kind: "propose",
              text: decision.proposal.renderedCommand,
              proposalSummary: {
                renderedCommand: decision.proposal.renderedCommand,
                target: decision.proposal.target.description,
                estimatedQuantities: decision.proposal.estimatedQuantities.map((quantity) => ({
                  label: quantity.label,
                  value: quantity.value,
                  unit: quantity.unit,
                })),
                irreversible: decision.proposal.irreversible,
                reviewRequirements: [...decision.proposal.reviewRequirements],
              },
            },
          ],
        },
        {
          kind: "agent-turn",
          utterance,
          detail: `the agent proposed '${decision.proposal.renderedCommand}' — awaiting user confirmation`,
        },
      );
    }
    case "dispatch-operation": {
      const next = await submitIntent(state, decision.command.intent, deps);
      const refused = next.notice !== undefined && next.notice.kind === "engine-refusal";
      // The submission path already recorded the journey step (confirm or
      // direct-manipulation + refusal detail); stamp the utterance onto it
      // so the trace joins the agent turn to the applied operation.
      const journey = [...next.journey];
      const lastIndex = journey.length - 1;
      const last = journey[lastIndex];
      if (last !== undefined) {
        journey[lastIndex] = { ...last, utterance };
      }
      return {
        ...next,
        journey,
        transcript: [
          ...next.transcript,
          userEntry,
          {
            who: "agent",
            kind: refused ? "notice" : "tool",
            text: refused
              ? `The solution engine refused this operation: ${next.notice?.reasons
                  .map((reason) => reason.detail)
                  .join("; ")}`
              : `Applied: ${decision.proposal.renderedCommand}`,
          },
        ],
      };
    }
    case "dispatch-tool": {
      return applyAgentToolCommand(state, utterance, decision, deps, boq);
    }
    case "unsupported": {
      return withJourneyStep(
        {
          ...state,
          pendingClarification: undefined,
          pendingProposal: undefined,
          notice: {
            source: "solution-agent",
            kind: "agent-unsupported",
            outcome: "unsupported",
            reasons: [{ code: "unsupported", detail: decision.command.reason }],
          },
          transcript: [
            ...state.transcript,
            userEntry,
            { who: "agent", kind: "notice", text: decision.command.reason },
          ],
        },
        {
          kind: "agent-turn",
          utterance,
          detail: `the agent answered 'unsupported': ${decision.command.reason}`,
        },
      );
    }
    case "ambiguous": {
      const readings = decision.command.readings.map((reading) => reading.description).join(" / ");
      return withJourneyStep(
        {
          ...state,
          pendingClarification: undefined,
          pendingProposal: undefined,
          notice: {
            source: "solution-agent",
            kind: "agent-ambiguous",
            outcome: "ambiguous",
            reasons: decision.command.readings.map((reading) => ({
              code: "ambiguous-reading",
              detail: reading.description,
            })),
          },
          transcript: [
            ...state.transcript,
            userEntry,
            { who: "agent", kind: "notice", text: `This request has more than one meaning: ${readings}` },
          ],
        },
        {
          kind: "agent-turn",
          utterance,
          detail: `the agent answered 'ambiguous' (${readings}) — no operation was authored`,
        },
      );
    }
    case "refuse": {
      return withJourneyStep(
        {
          ...state,
          pendingClarification: undefined,
          pendingProposal: undefined,
          notice: {
            source: "solution-agent",
            kind: "agent-unsafe-refusal",
            outcome: "unsafe-refusal",
            reasons: [
              { code: decision.command.reasonCode, detail: decision.command.reason },
            ],
          },
          transcript: [
            ...state.transcript,
            userEntry,
            { who: "agent", kind: "notice", text: decision.command.reason },
          ],
        },
        {
          kind: "agent-turn",
          utterance,
          detail: `the agent REFUSED the request (${decision.command.reasonCode}): ${decision.command.reason}`,
        },
      );
    }
    case "cancelled": {
      return withJourneyStep(
        {
          ...state,
          pendingClarification: undefined,
          pendingProposal: undefined,
          transcript: [...state.transcript, userEntry, { who: "agent", kind: "notice", text: decision.note }],
        },
        {
          kind: "agent-turn",
          utterance,
          detail: `the pending agent request was cancelled: ${decision.note}`,
        },
      );
    }
  }
}

/** Executes one read-only agent tool command through the real seams. */
async function applyAgentToolCommand(
  state: SolutionWorkspaceState,
  utterance: string,
  decision: AgentTurnDecision & { readonly decision: "dispatch-tool" },
  deps: WorkspaceDeps,
  boq: SolutionBoqSyncInput | undefined,
): Promise<SolutionWorkspaceState> {
  const command = decision.command;
  const version = currentVersionOf(state);
  let text: string;
  let next = state;
  switch (command.kind) {
    case "validate": {
      const validated = await validateCurrentVersion(state, deps);
      const snapshot = validated.validationSnapshot;
      text =
        snapshot === undefined
          ? "Validation did not produce a snapshot."
          : `Validation outcome: ${snapshot.outcome}. ${snapshot.checks
              .map((check) => `${check.checkId}: ${check.result}`)
              .join("; ")}`;
      next = validated;
      break;
    }
    case "inspect": {
      const inspected = await deps.service.inspect({ version });
      text =
        `The current proposed state carries ${inspected.operationCount} operation(s) ` +
        `across ${inspected.stateCount} layers; viewing layer ` +
        `${inspected.requestedStateIndex} (state ${inspected.requestedState.stateId}).`;
      break;
    }
    case "navigate": {
      if (command.target.kind === "goto-step") {
        const stepped = stepTimeline(state, command.target.stateIndex ?? 0);
        next = stepped;
        text = `Moved to step ${command.target.stateIndex ?? 0} of the timeline.`;
      } else if (command.target.kind === "current-state") {
        text = `The current proposed state is layer ${state.cursorStateIndex} of version ${version.versionNumber}.`;
      } else {
        text = `The solution has ${version.states.length - 1} step(s): ${version.operations
          .map((operation, index) => `${index + 1}. ${operation.operationType}`)
          .join(", ")}.`;
      }
      break;
    }
    case "explain": {
      const operation = version.operations[command.operationIndex - 1];
      if (operation === undefined) {
        text = `There is no operation at step ${command.operationIndex}.`;
        break;
      }
      text = `Step ${command.operationIndex} is a '${operation.operationType}' authored by ${operation.provenance.authoredBy}; the engine recorded ${operation.effects.length} effect(s).`;
      next = {
        ...state,
        selection: { kind: "operation", operationId: operation.operationId },
      };
      break;
    }
    case "boq-step-lookup": {
      const operation = version.operations[command.operationIndex - 1];
      if (operation === undefined) {
        text = `There is no operation at step ${command.operationIndex}.`;
        break;
      }
      const lines = resolveBoqForOperation(boq, state, operation.operationId);
      text =
        lines === undefined
          ? `No BOQ data is available for this solution yet.`
          : lines.length === 0
            ? `Step ${command.operationIndex} contributes to no BOQ line.`
            : `Step ${command.operationIndex} contributes to ${lines.length} BOQ line(s): ${lines
                .map((line) => `${line.itemDescription} (${line.quantity.value} ${line.quantity.unit})`)
                .join("; ")}.`;
      next = {
        ...state,
        selection: { kind: "operation", operationId: operation.operationId },
      };
      break;
    }
    default: {
      text = "This tool command is not supported by the workspace yet.";
      break;
    }
  }
  return withJourneyStep(
    {
      ...next,
      transcript: [
        ...next.transcript,
        { who: "user", text: utterance },
        { who: "agent", kind: "tool", text },
      ],
    },
    {
      kind: "agent-turn",
      utterance,
      detail: `the agent executed the read-only '${command.kind}' tool command`,
    },
  );
}

/* ------------------------------------------------------------------ */
/* Identity equivalence helpers (the convergence-law proofs)            */
/* ------------------------------------------------------------------ */

/**
 * The deterministic operation identity of an intent at a version context
 * — the CONTRACT's own derivation (used by the equivalence tests: the
 * same semantics from direct manipulation and the agent is the SAME
 * operation).
 */
export function operationIdentityOf(
  intent: EngineeringOperationIntent,
  context: { readonly solutionId: string; readonly versionNumber: number; readonly operationIndex: number },
): string {
  return deriveEngineeringOperationId(operationSemanticIdentityOfIntent(intent, context));
}

/** Re-exported for consumers assembling domain descriptors. */
export type { SolutionDomainDescriptor };
