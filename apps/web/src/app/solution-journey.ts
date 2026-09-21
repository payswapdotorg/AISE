/**
 * PROD-026 — the COMPOSED GOLDEN JOURNEY of the interactive engineering
 * solution workflow (§3 of the work order, end to end):
 *
 * ```text
 * reconstruct/open current building reality
 *  → select engineering problem
 *  → create interactive solution
 *  → manipulate directly and/or use agent commands
 *  → step through proposed layers/states
 *  → validate
 *  → generate solution BOQ
 *  → click BOQ line
 *  → jump to corresponding solution step/geometry
 *  → inspect and understand solution
 *  → save/revise solution without altering observed reality
 * ```
 *
 * ONE RUNNER, THREE AUTHORING MODES. `runComposedJourney` drives the
 * ENTIRE journey through the PROD-024 workspace's OWN controllers
 * (`openWorkspace` / `submitIntent` / `stepTimeline` / `reviseOperation` /
 * `validateCurrentVersion` / `applyAgentDecision` — imported from the
 * module's PUBLIC EXPORTS only) with the REAL `@aise/solution-engine`
 * (the workspace's local service binding) and the REAL
 * `@aise/solution-boq` derivation. The agent leg runs through the
 * workspace's agent-turn controller against the scripted agent port whose
 * scripted intents carry the PROD-023 command-corpus semantics (the exact
 * utterances the compiler's committed corpus pins — the corpus's
 * representative demolition / block-wall / plaster commands; the compiler
 * itself lives in the backend zone and cannot be imported from apps — the
 * frozen AISE-001 boundary matrix — so the composition replays its
 * corpus-pinned outputs through the port seam, exactly the PROD-024
 * discipline established for this boundary).
 *
 * The three modes author the SAME semantics:
 *
 *  - `mixed` — the recorded product session (direct manipulation for the
 *    demolition, agent commands for the rebuild + plaster);
 *  - `direct` — every operation authored through direct manipulation;
 *  - `agent` — every operation authored through agent commands.
 *
 * Because the contract's operation identity EXCLUDES provenance, the
 * direct and agent modes produce IDENTICAL operation identities over the
 * same version context (the equivalence proof — asserted by the
 * composition-model suite).
 *
 * DETERMINISM: no clock reads (the injected stepped workspace clock), no
 * randomness, no I/O — two runs produce byte-identical canonical records
 * (the record's deterministic `journeyId` digest).
 *
 * NO SECOND AUTHORITY: the record only ECHOES engine outputs (operations,
 * states, effects, quantities, snapshots) and BOQ-package outputs (lines,
 * traces, navigation) — every number traces to its producer verbatim.
 */

import { createHash } from "node:crypto";
import {
  resolveOperationsForLine,
  REFERENCE_BUILDING_OPERATION_PROFILE,
  type EngineeringOperationIntent,
  type OperationTarget,
  type SolutionBoqTraceSet,
} from "../../../../packages/solution-contract/src/index";
import { materializeBaselineState } from "../../../../packages/solution-engine/src/index";
import type { BaselineGeometryResolver } from "../../../../packages/solution-engine/src/index";
import {
  deriveSolutionBoq,
  verifySolutionBoq,
  type SolutionBoq,
} from "../../../../packages/solution-boq/src/index";
import { canonicalJsonStringify } from "../../../../packages/shared-contracts/src/index";
import { formatRoute } from "./router";
import type { SolutionQuery } from "./router";
import {
  applyAgentDecision,
  agentSessionContextOf,
  askDecisionOf,
  buildAgentIntent,
  buildDirectManipulationIntent,
  createLocalSolutionService,
  createScriptedSolutionAgentPort,
  DEMO_SOLUTION_WORLD,
  demoBaselineGeometry,
  demoObservedScene,
  dispatchOperationDecisionOf,
  openWorkspace,
  proposeDecisionOf,
  reviseOperation,
  stepTimeline,
  steppedWorkspaceClock,
  submitIntent,
  validateCurrentVersion,
  type AgentTurnDecision,
  type SolutionAgentPort,
  type SolutionCaseContext,
} from "../solution";

/* ------------------------------------------------------------------ */
/* Public type derivations (the workspace module's public surface only) */
/* ------------------------------------------------------------------ */

/** The observed scene / element types (derived from the public props type). */
export type ObservedSceneOf = SolutionCaseContext["observedScene"];
export type SceneElementOf = ObservedSceneOf["elements"][number];

/** One version of the workspace history (derived from the public controller). */
export type WorkspaceVersionOf = ReturnType<typeof openWorkspace>["versions"][number];

/** The workspace state (derived from the public controller's return type). */
export type WorkspaceStateOf = ReturnType<typeof openWorkspace>;

/* ------------------------------------------------------------------ */
/* The world input (one deterministic journey world)                    */
/* ------------------------------------------------------------------ */

/** One agent-command clarification (the ask → answer → recompile dance). */
export interface JourneyClarificationSpec {
  /** The compiler's targeted questions (rendered verbatim; never answered here). */
  readonly questions: readonly {
    readonly slotKind: "dimension" | "material" | "location" | "sequencing" | "constraint";
    readonly slot: string;
    readonly question: string;
    readonly offeredChoices?: readonly string[];
  }[];
  /** The user's answer (merged into the original request; the loop recompiles). */
  readonly answer: string;
}

/** The parameter-only quantity estimates the agent proposal previews. */
export interface JourneyEstimateSpec {
  readonly label: string;
  readonly dimension: "length" | "area" | "volume" | "count";
  readonly value: number;
  readonly unit: string;
  readonly basis: string;
}

/** One operation of the journey script (authored data — the journey's input). */
export interface JourneyOperationSpec {
  /** The engine operation type (the Phase 1 building catalogue). */
  readonly operationType: string;
  /** How the RECORDED (mixed-mode) journey authors this operation. */
  readonly origin: "direct-manipulation" | "agent";
  /** Stable authoring-event id (provenance only — never part of identity). */
  readonly intentId: string;
  /** The observed scene element the operation anchors to (read-only refs). */
  readonly targetElementId: string;
  /** Typed parameters WITH units (the engine profile's declaration order). */
  readonly parameters: readonly {
    readonly name: string;
    readonly value: number | string;
    readonly unit?: string;
  }[];
  /** The user-facing command (agent operations; the exact corpus utterance). */
  readonly commandText?: string;
  /** The authoring instant (deterministic, caller-pinned). */
  readonly authoredAt: string;
  /** The canonical command the proposal previews (agent operations). */
  readonly renderedCommand?: string;
  /** Parameter-only estimates the proposal previews (agent operations). */
  readonly estimates?: readonly JourneyEstimateSpec[];
  /** The clarification dance before the proposal (agent operations). */
  readonly clarification?: JourneyClarificationSpec;
}

/** One deterministic journey world (the seeded fixture or the benchmark scenario). */
export interface JourneyWorldInput {
  readonly world: {
    readonly projectId: string;
    readonly caseId: string;
    readonly solutionId: string;
    readonly title: string;
    readonly problemStatement: string;
    readonly baselineRealityVersionId: string;
    readonly createdAt: string;
    readonly baselineMaterializedAt: string;
    readonly agentSessionId: string;
    readonly agentId: string;
    readonly userId: string;
  };
  /** The OBSERVED current-building reality (read-only display data). */
  readonly scene: ObservedSceneOf;
  /** The read-only baseline surface facts (the engine's only reality window). */
  readonly baselineGeometry: BaselineGeometryResolver;
  /** The journey's operation script (applied in order at version 1). */
  readonly operations: readonly JourneyOperationSpec[];
  /** The save/revise leg: which 1-based operation index the revision undoes. */
  readonly revise: {
    readonly revertOperationIndex: number;
    readonly reason: string;
  };
  /** The deterministic stepped clock anchor (base instant + step milliseconds). */
  readonly clock: { readonly base: string; readonly stepMs: number };
}

/* ------------------------------------------------------------------ */
/* The record (typed, canonically serializable, deterministic)          */
/* ------------------------------------------------------------------ */

/** The §3 journey legs the recorded steps cover. */
export type JourneyLegId =
  | "open-reality"
  | "select-problem"
  | "create-solution"
  | "manipulate"
  | "step-through"
  | "validate"
  | "generate-boq"
  | "click-boq-line"
  | "jump-and-inspect"
  | "save-revise";

/** The typed operation echo (the ENGINE's recorded operation, verbatim). */
export interface JourneyOperationEcho {
  readonly operationId: string;
  readonly operationType: string;
  readonly operationIndex: number;
  readonly solutionId: string;
  readonly versionNumber: number;
  /** How this step was authored (provenance only — never identity). */
  readonly origin: "direct-manipulation" | "agent";
  readonly intentId: string;
  readonly commandText?: string;
  readonly parameters: readonly {
    readonly name: string;
    readonly value: number | string | boolean;
    readonly unit?: string;
  }[];
  readonly target: {
    readonly selectorKind: string;
    readonly nodeRefs: readonly string[];
    readonly geometryRefs: readonly { readonly kind: string; readonly ref: string }[];
  };
}

/** The state transition echo (engine materializations, verbatim ids). */
export interface JourneyStateTransitionEcho {
  readonly versionNumber: number;
  readonly fromStateId: string | null;
  readonly toStateId: string;
  readonly toStateIndex: number;
  readonly toStateDigest: string;
  readonly transitionId?: string;
}

/** The validation snapshot echo (the engine's deterministic Validate). */
export interface JourneyValidationEcho {
  readonly snapshotId: string;
  readonly outcome: string;
  readonly inputDigest: string;
  readonly engine: { readonly kind: string; readonly version: string };
  readonly checkSummary: readonly { readonly checkId: string; readonly result: string }[];
}

/** One BOQ line's full trace echo (the BOQ package's derived line, verbatim). */
export interface JourneyBoqLineEcho {
  readonly boqLineId: string;
  readonly traceId: string;
  readonly itemDescription: string;
  readonly sectionId: string;
  readonly buildingElement: string;
  readonly quantity: {
    readonly dimension: string;
    readonly value: number;
    readonly unit: string;
    readonly calculationRef: string;
  };
  readonly material?: string;
  readonly direction: string;
  readonly contributingSteps: readonly {
    readonly operationId: string;
    readonly operationIndex: number;
    readonly contributionKind: string;
    readonly resultingStateRef: string;
  }[];
  readonly geometryRefs: readonly { readonly kind: string; readonly ref: string }[];
  readonly assumptionRefs: readonly string[];
}

/** The generated solution BOQ echo (document identity + lines + totals). */
export interface JourneyBoqEcho {
  readonly boqId: string;
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly validationSnapshotRef: string;
  readonly baselineRealityVersionId: string;
  readonly lineCount: number;
  readonly lines: readonly JourneyBoqLineEcho[];
  readonly totals: readonly {
    readonly dimension: string;
    readonly unit: string;
    readonly netValue: number;
    readonly addedValue: number;
    readonly removedValue: number;
  }[];
  readonly assumptions: readonly { readonly assumptionId: string; readonly statement: string }[];
  readonly verification: { readonly ok: boolean; readonly summary: string };
}

/** One cross-surface link the journey's steps resolve to (the app's one router). */
export interface JourneyLinkEcho {
  readonly label: string;
  readonly href: string;
  readonly basis: string;
}

/** The reality-seal echo (the mutation-protection proof inputs). */
export interface JourneySealEcho {
  readonly pinnedRealityVersionId: string;
  /** sha-256 of the observed scene's canonical bytes BEFORE the journey. */
  readonly observedSceneDigestBefore: string;
  /** sha-256 of the observed scene's canonical bytes AFTER the full journey. */
  readonly observedSceneDigestAfter: string;
  /** Whether every proposed state of every version carries the PROPOSED seal over the pinned baseline. */
  readonly everyStateSealedProposed: boolean;
  /** The count of proposed states checked for the seal. */
  readonly sealedStateCount: number;
}

/** One recorded step of the composed journey (the §3 journey record). */
export interface ComposedJourneyStep {
  readonly step: number;
  readonly leg: JourneyLegId;
  readonly title: string;
  readonly detail: string;
  readonly operation?: JourneyOperationEcho;
  readonly stateTransition?: JourneyStateTransitionEcho;
  readonly validation?: JourneyValidationEcho;
  readonly boq?: JourneyBoqEcho;
  /** The clicked line + its resolved step/geometry jump (the click/jump legs). */
  readonly boqLineClick?: {
    readonly boqLineId: string;
    readonly itemDescription: string;
    readonly quantity: {
      readonly value: number;
      readonly unit: string;
      readonly dimension: string;
    };
    readonly resolvedSteps: readonly {
      readonly operationId: string;
      readonly operationIndex: number;
      readonly contributionKind: string;
    }[];
    readonly geometryRefs: readonly { readonly kind: string; readonly ref: string }[];
  };
  readonly links?: readonly JourneyLinkEcho[];
}

/** The full composed journey record (deterministic, canonically serializable). */
export interface ComposedJourneyRecord {
  readonly journeyKind: "aise-composed-solution-journey";
  readonly journeyVersion: string;
  readonly mode: JourneyMode;
  readonly world: {
    readonly projectId: string;
    readonly caseId: string;
    readonly solutionId: string;
    readonly title: string;
    readonly problemStatement: string;
    readonly baselineRealityVersionId: string;
  };
  readonly steps: readonly ComposedJourneyStep[];
  readonly versions: readonly {
    readonly versionNumber: number;
    readonly status: string;
    readonly operationIds: readonly string[];
    readonly stateIds: readonly string[];
    readonly finalStateDigest: string;
  }[];
  readonly boq: JourneyBoqEcho;
  readonly revisedBoq: JourneyBoqEcho | null;
  /** The version-pinned trace set (the workspace's guarded BOQ seam input). */
  readonly boqTraceSet: SolutionBoqTraceSet;
  /** The equivalence list: every authored operation's identity + origin. */
  readonly operationIdentities: readonly {
    readonly step: number;
    readonly origin: "direct-manipulation" | "agent";
    readonly operationId: string;
    readonly versionNumber: number;
  }[];
  readonly seal: JourneySealEcho;
  /** The composition's cross-surface map (the app's one router). */
  readonly crossSurfaceLinks: readonly JourneyLinkEcho[];
  /** sha-256 over the canonical record (this digest field excluded). */
  readonly journeyId: string;
}

/** The composed journey result (the record + the live objects it echoes). */
export interface ComposedJourneyResult {
  readonly record: ComposedJourneyRecord;
  /** The workspace state after the full journey (the composed product session). */
  readonly state: WorkspaceStateOf;
  /** The generated solution BOQ of version 1 (the derived projection). */
  readonly boq: SolutionBoq;
  /** The generated solution BOQ of the revised version 2 (the save/revise leg). */
  readonly revisedBoq: SolutionBoq | null;
  /** The case context the composition mounts the workspace with. */
  readonly caseContext: SolutionCaseContext;
  /** The guarded BOQ seam input over the version-1 trace set. */
  readonly boqSyncInput: { kind: "trace-set"; traceSet: SolutionBoqTraceSet };
}

/** The authoring mode of one journey run. */
export type JourneyMode = "mixed" | "direct" | "agent";

/* ------------------------------------------------------------------ */
/* Deterministic helpers                                                */
/* ------------------------------------------------------------------ */

function sha256Hex(value: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(value), "utf8").digest("hex");
}

/** The workspace state's current version (the public controllers' own convention). */
function currentVersionOf(state: WorkspaceStateOf): WorkspaceVersionOf {
  const version = state.versions[state.currentVersionNumber - 1];
  if (version === undefined) {
    throw new Error(
      `composed journey: version ${state.currentVersionNumber} of solution ` +
        `'${state.solutionId}' is missing from the workspace history`,
    );
  }
  return version;
}

/** The engine-owned capability profile's declared limitations (reference data). */
function reviewRequirementsOf(operationType: string): readonly string[] {
  for (const domain of REFERENCE_BUILDING_OPERATION_PROFILE.domains) {
    const operation = domain.operations.find(
      (entry) => entry.operationType === operationType,
    );
    if (operation !== undefined) {
      return [...operation.limitations];
    }
  }
  return [];
}

/**
 * The `OperationTarget` of one observed scene element — the same read-only
 * projection the workspace's direct-manipulation controller applies
 * (`targetOfElement` of operations.ts: the element's own selector, node
 * refs and geometry refs, verbatim). The composition mirrors it for the
 * AGENT-authored intents so both modes anchor IDENTICALLY.
 */
function targetOfElement(element: SceneElementOf): OperationTarget {
  return {
    contractVersion: "1.0.0",
    selectorKind: element.selectorKind,
    nodeRefs: [...element.nodeRefs],
    geometryRefs: element.geometryRefs.map((ref) => ({ ...ref })),
    units: { linear: "m", angular: "rad" },
    description: element.label,
  };
}

/* ------------------------------------------------------------------ */
/* The scripted agent (the compiler-corpus-pinned semantics)            */
/* ------------------------------------------------------------------ */

/** One scripted agent turn of the journey script. */
interface ScriptedTurn {
  readonly utterance: string;
  readonly decision: AgentTurnDecision;
}

/** The user-facing confirmation utterance (the corpus's confirmation form). */
const CONFIRM_UTTERANCE = "yes, apply it";

/**
 * Builds the journey's scripted agent port: every AGENT-authored operation
 * becomes an ask → (answer) → propose → confirm turn sequence whose
 * dispatched intent is a REAL contract object built through the public
 * `buildAgentIntent` (origin `agent`, the exact command text). The script
 * replays IN ORDER and never improvises (the port's own guarantee).
 */
function buildJourneyAgent(
  world: JourneyWorldInput,
  authored: readonly { spec: JourneyOperationSpec; origin: "direct-manipulation" | "agent" }[],
  scene: ObservedSceneOf,
): SolutionAgentPort {
  const turns: ScriptedTurn[] = [];
  for (const entry of authored) {
    if (entry.origin !== "agent") {
      continue;
    }
    const spec = entry.spec;
    if (spec.commandText === undefined) {
      throw new Error(
        `composed journey: agent operation '${spec.intentId}' carries no commandText — ` +
          `the scripted port never invents an utterance`,
      );
    }
    const element = scene.elements.find(
      (candidate) => candidate.elementId === spec.targetElementId,
    );
    if (element === undefined) {
      throw new Error(
        `composed journey: agent operation '${spec.intentId}' anchors to unknown ` +
          `scene element '${spec.targetElementId}'`,
      );
    }
    const intent = buildAgentIntent({
      intentId: spec.intentId,
      operationType: spec.operationType,
      parameters: spec.parameters,
      target: targetOfElement(element),
      commandText: spec.commandText,
      authoredAt: spec.authoredAt,
      authoredBy: world.world.agentId,
      proposedTo: { solutionId: world.world.solutionId, versionNumber: 1 },
    });
    const renderedCommand = spec.renderedCommand ?? spec.commandText;
    const proposal = proposeDecisionOf({
      intent,
      renderedCommand,
      estimatedQuantities: [...(spec.estimates ?? [])],
      irreversible: false,
      reviewRequirements: reviewRequirementsOf(spec.operationType),
      utterance: spec.commandText,
    });
    if (spec.clarification !== undefined) {
      turns.push({
        utterance: spec.commandText,
        decision: askDecisionOf({
          utterance: spec.commandText,
          questions: spec.clarification.questions,
        }),
      });
      const merged = `${spec.commandText} ${spec.clarification.answer.trim()}`;
      turns.push({ utterance: merged, decision: proposal });
    } else {
      turns.push({ utterance: spec.commandText, decision: proposal });
    }
    turns.push({
      utterance: CONFIRM_UTTERANCE,
      decision: dispatchOperationDecisionOf(
        proposal.proposal,
        world.world.solutionId,
        1,
      ),
    });
  }
  return createScriptedSolutionAgentPort({
    agentId: world.world.agentId,
    turns,
  });
}

/* ------------------------------------------------------------------ */
/* The echo builders (producer outputs, verbatim)                       */
/* ------------------------------------------------------------------ */

function boqEchoOf(boq: SolutionBoq): JourneyBoqEcho {
  const verification = verifySolutionBoq(boq);
  return {
    boqId: boq.boqId,
    solutionId: boq.solutionId,
    versionNumber: boq.versionNumber,
    validationSnapshotRef: boq.validationSnapshotRef,
    baselineRealityVersionId: boq.baselineRealityVersionId,
    lineCount: boq.lines.length,
    lines: boq.lines.map((line) => ({
      boqLineId: line.boqLineId,
      traceId: line.trace.traceId,
      itemDescription: line.itemDescription,
      sectionId: line.sectionId,
      buildingElement: line.buildingElement,
      quantity: {
        dimension: line.quantity.dimension,
        value: line.quantity.value,
        unit: line.quantity.unit,
        calculationRef: line.quantity.calculationRef,
      },
      ...(line.material === undefined ? {} : { material: line.material }),
      direction: line.direction,
      contributingSteps: line.contributions.map((contribution) => ({
        operationId: contribution.operationId,
        operationIndex: contribution.operationIndex,
        contributionKind: contribution.contributionKind,
        resultingStateRef: contribution.resultingStateRef,
      })),
      geometryRefs: line.trace.geometryRefs.map((ref) => ({
        kind: ref.kind,
        ref: ref.ref,
      })),
      assumptionRefs: [...line.assumptionRefs],
    })),
    totals: boq.totals.map((total) => ({
      dimension: total.dimension,
      unit: total.unit,
      netValue: total.netValue,
      addedValue: total.addedValue,
      removedValue: total.removedValue,
    })),
    assumptions: boq.assumptions.map((assumption) => ({
      assumptionId: assumption.assumptionId,
      statement: assumption.statement,
    })),
    verification: {
      ok: verification.ok,
      summary: verification.ok
        ? `verified: ${verification.summary.lineCount} lines, ${verification.summary.sectionCount} sections, ${verification.summary.assumptionCount} assumptions over ${verification.summary.operationCount} operations`
        : `verification findings: ${verification.findings.join("; ")}`,
    },
  };
}

function operationEchoOf(
  operation: WorkspaceVersionOf["operations"][number],
  origin: "direct-manipulation" | "agent",
  spec: JourneyOperationSpec,
): JourneyOperationEcho {
  return {
    operationId: operation.operationId,
    operationType: operation.operationType,
    operationIndex: operation.operationIndex,
    solutionId: operation.solutionId,
    versionNumber: operation.versionNumber,
    origin,
    intentId: spec.intentId,
    ...(origin === "agent" && spec.commandText !== undefined
      ? { commandText: spec.commandText }
      : {}),
    parameters: operation.parameters.map((parameter) => ({
      name: parameter.name,
      value: parameter.value,
      ...(parameter.unit === undefined ? {} : { unit: parameter.unit }),
    })),
    target: {
      selectorKind: operation.target.selectorKind,
      nodeRefs: [...operation.target.nodeRefs],
      geometryRefs: operation.target.geometryRefs.map((ref) => ({
        kind: ref.kind,
        ref: ref.ref,
      })),
    },
  };
}

/**
 * Guards the direct path's catalog agreement: the workspace's own action
 * catalog (parameter names + units, engine-profile-driven) must produce
 * EXACTLY the scripted parameters — a mismatch is a script defect, never
 * silently applied.
 */
function guardParameterAgreement(
  spec: JourneyOperationSpec,
  built: EngineeringOperationIntent,
): void {
  const expected = spec.parameters;
  const actual = built.parameters;
  if (expected.length !== actual.length) {
    throw new Error(
      `composed journey: direct intent '${spec.intentId}' parameter count ` +
        `${actual.length} does not match the script's ${expected.length} — the ` +
        `engine catalogue disagrees with the script`,
    );
  }
  for (let index = 0; index < expected.length; index += 1) {
    const want = expected[index]!;
    const got = actual[index]!;
    if (want.name !== got.name || want.value !== got.value || want.unit !== got.unit) {
      throw new Error(
        `composed journey: direct intent '${spec.intentId}' parameter ` +
          `'${want.name}' (${want.value} ${want.unit ?? "—"}) disagrees with the ` +
          `catalogue's (${got.value} ${got.unit ?? "—"}) — the script and the ` +
          `engine catalogue must agree`,
      );
    }
  }
}

/** Selects the journey's clicked BOQ line (deterministic: the LAST line). */
function selectJourneyBoqLine(boq: SolutionBoq): SolutionBoq["lines"][number] {
  const line = boq.lines[boq.lines.length - 1];
  if (line === undefined) {
    throw new Error("composed journey: the generated BOQ carries no lines");
  }
  return line;
}

/* ------------------------------------------------------------------ */
/* THE RUNNER                                                           */
/* ------------------------------------------------------------------ */

/**
 * Runs the ENTIRE §3 journey over one deterministic world.
 *
 * Every mutation flows through the workspace's public controllers into the
 * REAL engine; every BOQ value comes from the REAL derivation; the record
 * only echoes producer outputs. The authoritative observed scene is hashed
 * before the journey and re-hashed after it (the seal echo).
 */
export async function runComposedJourney(
  input: JourneyWorldInput,
  mode: JourneyMode = "mixed",
): Promise<ComposedJourneyResult> {
  const world = input.world;
  const scene = input.scene;
  const sceneDigestBefore = sha256Hex(scene);

  const journeyDeps = {
    service: createLocalSolutionService({ baselineGeometry: input.baselineGeometry }),
    clock: steppedWorkspaceClock(input.clock.base, input.clock.stepMs),
    authoredBy: world.userId,
  };

  const steps: ComposedJourneyStep[] = [];
  const operationIdentities: {
    step: number;
    origin: "direct-manipulation" | "agent";
    operationId: string;
    versionNumber: number;
  }[] = [];
  const authored: readonly {
    spec: JourneyOperationSpec;
    origin: "direct-manipulation" | "agent";
  }[] = input.operations.map((spec) => ({
    spec,
    origin:
      mode === "mixed"
        ? spec.origin
        : mode === "direct"
          ? "direct-manipulation"
          : "agent",
  }));
  const agent = buildJourneyAgent(input, authored, scene);

  /* ---- Step 1 — RECONSTRUCT/OPEN the current building reality. ---- */
  steps.push({
    step: 1,
    leg: "open-reality",
    title: "Reconstruct / open the current building reality",
    detail:
      `opened the observed building reality pinned to Reality-Graph version ` +
      `'${world.baselineRealityVersionId}' — ${scene.elements.length} observed ` +
      `element(s), read-only; the baseline surface facts anchor coated operations ` +
      `through the engine's read-only resolver`,
    links: [
      {
        label: "The observed reality (SiteTwin / Evidence)",
        href: formatRoute({ name: "sitetwin", projectId: world.projectId }),
        basis:
          "the solution's pinned baseline reality version — the same project's evidence surface",
      },
    ],
  });

  /* ---- Step 2 — SELECT the engineering problem. ---- */
  steps.push({
    step: 2,
    leg: "select-problem",
    title: "Select the engineering problem",
    detail:
      `selected the engineering problem of case '${world.caseId}': ${world.problemStatement}`,
    links: [
      {
        label: `case ${world.caseId} (Engineering Case)`,
        href: formatRoute({ name: "case", projectId: world.projectId }),
        basis: `the solution world's recorded case pin (${world.caseId})`,
      },
    ],
  });

  /* ---- Step 3 — CREATE the interactive solution. ---- */
  let state = openWorkspace({
    projectId: world.projectId,
    caseId: world.caseId,
    solutionId: world.solutionId,
    title: world.title,
    problemStatement: world.problemStatement,
    baselineRealityVersionId: world.baselineRealityVersionId,
    createdAt: world.createdAt,
    materializedAt: world.baselineMaterializedAt,
  });
  const baselineState = currentVersionOf(state).states[0]!;
  steps.push({
    step: 3,
    leg: "create-solution",
    title: "Create the interactive solution",
    detail:
      `created solution '${world.solutionId}' — version 1, layer 0 (the baseline ` +
      `overlay over the pinned observed reality); the proposal starts empty`,
    stateTransition: {
      versionNumber: 1,
      fromStateId: null,
      toStateId: baselineState.stateId,
      toStateIndex: baselineState.stateIndex,
      toStateDigest: baselineState.contentDigest ?? "",
    },
  });

  /* The agent-turn helper — exactly the component's own controller. */
  const userTurn = async (utterance: string): Promise<WorkspaceStateOf> => {
    const session = agentSessionContextOf(state, scene, {
      sessionId: world.agentSessionId,
      agentId: world.agentId,
      userId: world.userId,
    });
    const decision = await agent.decideTurn({
      utterance,
      session,
      ...(state.pendingClarification === undefined
        ? {}
        : { pendingClarification: state.pendingClarification }),
      ...(state.pendingProposal === undefined
        ? {}
        : { pendingProposal: state.pendingProposal }),
    });
    return applyAgentDecision(state, utterance, decision, journeyDeps, undefined);
  };

  /* ---- Steps 4..(3+N) — the operations (direct and/or agent). ---- */
  for (let index = 0; index < authored.length; index += 1) {
    const { spec, origin } = authored[index]!;
    const element = scene.elements.find(
      (candidate) => candidate.elementId === spec.targetElementId,
    );
    if (element === undefined) {
      throw new Error(
        `composed journey: operation '${spec.intentId}' anchors to unknown scene ` +
          `element '${spec.targetElementId}'`,
      );
    }
    const versionBefore = currentVersionOf(state);
    const previousState = versionBefore.states[versionBefore.states.length - 1]!;
    const stepNumber = 4 + index;

    if (origin === "direct-manipulation") {
      /* The DIRECT path: the workspace's own direct-manipulation controller. */
      state = { ...state, selection: { kind: "scene-element", elementId: element.elementId } };
      const intent = buildDirectManipulationIntent(
        {
          elementId: element.elementId,
          operationType: spec.operationType,
          parameterValues: Object.fromEntries(
            spec.parameters.map((parameter) => [parameter.name, parameter.value]),
          ),
          intentId: spec.intentId,
        },
        element,
        state,
        spec.authoredAt,
        world.userId,
      );
      guardParameterAgreement(spec, intent);
      state = await submitIntent(state, intent, journeyDeps);
    } else {
      /* The AGENT path: NL commands through the agent-turn controller. */
      const utterances: string[] =
        spec.clarification === undefined
          ? [spec.commandText!, CONFIRM_UTTERANCE]
          : [spec.commandText!, spec.clarification.answer, CONFIRM_UTTERANCE];
      for (const utterance of utterances) {
        state = await userTurn(utterance);
      }
    }

    const versionAfter = currentVersionOf(state);
    const appliedOperation = versionAfter.operations[versionAfter.operations.length - 1];
    if (appliedOperation === undefined) {
      throw new Error(
        `composed journey: operation '${spec.intentId}' was not applied — the engine ` +
          `refused (notice: ${state.notice?.kind ?? "none"})`,
      );
    }
    const resultingState = versionAfter.states[versionAfter.states.length - 1]!;
    const clarifyNote =
      spec.clarification === undefined || origin === "direct-manipulation"
        ? ""
        : ` (after a clarification: ${spec.clarification.questions
            .map((question) => question.slot)
            .join(", ")})`;
    steps.push({
      step: stepNumber,
      leg: "manipulate",
      title:
        origin === "direct-manipulation"
          ? `Manipulate directly — ${spec.operationType}`
          : `Use agent commands — ${spec.operationType}`,
      detail:
        origin === "direct-manipulation"
          ? `selected ${element.label} in the drawing and executed the direct-manipulation ` +
            `action '${spec.operationType}' — the typed intent flows through the ONE ` +
            `submission path into the engine`
          : `asked the agent: '${spec.commandText}'${clarifyNote} — the confirmed proposal ` +
            `applies through THE SAME submission path as direct manipulation, over ` +
            `${element.label}`,
      operation: operationEchoOf(appliedOperation, origin, spec),
      stateTransition: {
        versionNumber: versionAfter.versionNumber,
        fromStateId: previousState.stateId,
        toStateId: resultingState.stateId,
        toStateIndex: resultingState.stateIndex,
        toStateDigest: resultingState.contentDigest ?? "",
        ...(state.journey[state.journey.length - 1]?.transitionId === undefined
          ? {}
          : { transitionId: state.journey[state.journey.length - 1]?.transitionId }),
      },
    });
    operationIdentities.push({
      step: stepNumber,
      origin,
      operationId: appliedOperation.operationId,
      versionNumber: appliedOperation.versionNumber,
    });
  }

  /* ---- Step (4 + N) — STEP THROUGH the proposed layers/states. ---- */
  const stepThroughNumber = 4 + authored.length;
  const preStepFinal = (() => {
    const version = currentVersionOf(state);
    return version.states[version.states.length - 1]!;
  })();
  state = stepTimeline(state, 1);
  const steppedBack = currentVersionOf(state).states[state.cursorStateIndex]!;
  state = stepTimeline(state, currentVersionOf(state).states.length - 1);
  const steppedForward = currentVersionOf(state).states[state.cursorStateIndex]!;
  steps.push({
    step: stepThroughNumber,
    leg: "step-through",
    title: "Step through the proposed layers/states",
    detail:
      `stepped the timeline back to layer 1 (state ${steppedBack.stateId.slice(0, 12)}…) ` +
      `and forward to the final layer ${steppedForward.stateIndex} (state ` +
      `${steppedForward.stateId.slice(0, 12)}…) — every cursor position is the ` +
      `engine's own recorded state, never a client-side snapshot`,
    stateTransition: {
      versionNumber: 1,
      fromStateId: preStepFinal.stateId,
      toStateId: steppedForward.stateId,
      toStateIndex: steppedForward.stateIndex,
      toStateDigest: steppedForward.contentDigest ?? "",
    },
  });

  /* ---- Step (5 + N) — VALIDATE. ---- */
  const validateNumber = 5 + authored.length;
  state = await validateCurrentVersion(state, journeyDeps);
  const snapshot = state.validationSnapshot;
  if (snapshot === undefined) {
    throw new Error("composed journey: validation produced no snapshot");
  }
  const validationEcho: JourneyValidationEcho = {
    snapshotId: snapshot.snapshotId,
    outcome: snapshot.outcome,
    inputDigest: snapshot.inputDigest,
    engine: { kind: snapshot.engine.kind, version: snapshot.engine.version },
    checkSummary: snapshot.checks.map((check) => ({
      checkId: check.checkId,
      result: check.result,
    })),
  };
  steps.push({
    step: validateNumber,
    leg: "validate",
    title: "Validate (the deterministic server-side checks)",
    detail:
      `validated version 1 through the engine's deterministic Validate — outcome ` +
      `'${snapshot.outcome}' over ${snapshot.checks.length} checks (engine ` +
      `${snapshot.engine.kind} ${snapshot.engine.version}); the snapshot certifies the ` +
      `version's exact bytes (inputDigest ${snapshot.inputDigest.slice(0, 12)}…)`,
    validation: validationEcho,
  });

  /* ---- Step (6 + N) — GENERATE the solution BOQ. ---- */
  const generateNumber = 6 + authored.length;
  const validatedVersion = currentVersionOf(state);
  const boq = deriveSolutionBoq({ version: validatedVersion, snapshot });
  const boqEcho = boqEchoOf(boq);
  steps.push({
    step: generateNumber,
    leg: "generate-boq",
    title: "Generate the solution BOQ",
    detail:
      `generated the solution BOQ from the declared validation snapshot — ` +
      `${boq.lines.length} line(s) across ${boq.sections.length} section(s), every ` +
      `quantity engine-sourced with its calculation reference; the derived ` +
      `projection never overwrites a source BOQ`,
    boq: boqEcho,
  });

  /* ---- Step (7 + N) — CLICK a BOQ line. ---- */
  const clickNumber = 7 + authored.length;
  const clickedLine = selectJourneyBoqLine(boq);
  const clickedContributions = resolveOperationsForLine(boq.traceSet, clickedLine.boqLineId)!;
  steps.push({
    step: clickNumber,
    leg: "click-boq-line",
    title: "Click the BOQ line",
    detail:
      `clicked the generated line '${clickedLine.itemDescription}' ` +
      `(${clickedLine.quantity.value} ${clickedLine.quantity.unit}) — the guarded BOQ ` +
      `pane resolves its trace through the contract's own resolvers`,
    boqLineClick: {
      boqLineId: clickedLine.boqLineId,
      itemDescription: clickedLine.itemDescription,
      quantity: {
        value: clickedLine.quantity.value,
        unit: clickedLine.quantity.unit,
        dimension: clickedLine.quantity.dimension,
      },
      resolvedSteps: clickedContributions.map((contribution) => ({
        operationId: contribution.operationId,
        operationIndex: contribution.operationIndex,
        contributionKind: contribution.contributionKind,
      })),
      geometryRefs: clickedLine.trace.geometryRefs.map((ref) => ({
        kind: ref.kind,
        ref: ref.ref,
      })),
    },
  });

  /* ---- Step (8 + N) — JUMP to the corresponding step/geometry + inspect. ---- */
  const jumpNumber = 8 + authored.length;
  const jumpedOperationIndex = clickedContributions[0]!.operationIndex;
  const jumpedOperation = validatedVersion.operations.find(
    (operation) => operation.operationIndex === jumpedOperationIndex,
  );
  if (jumpedOperation === undefined) {
    throw new Error(
      `composed journey: the clicked line's step ${jumpedOperationIndex} resolves to no operation`,
    );
  }
  const jumpedState = validatedVersion.states[jumpedOperationIndex]!;
  const jumpedSpec = authored[jumpedOperationIndex - 1]?.spec;
  if (jumpedSpec === undefined) {
    throw new Error(
      `composed journey: no scripted operation at index ${jumpedOperationIndex}`,
    );
  }
  const jumpQuery: SolutionQuery = {
    case: world.caseId,
    boqLine: clickedLine.boqLineId,
    step: jumpedOperationIndex,
  };
  steps.push({
    step: jumpNumber,
    leg: "jump-and-inspect",
    title: "Jump to the corresponding solution step / geometry (and inspect it)",
    detail:
      `the clicked line jumps to solution step ${jumpedOperationIndex} — operation ` +
      `${jumpedOperation.operationId.slice(0, 12)}… (${jumpedOperation.operationType}), ` +
      `state ${jumpedState.stateId.slice(0, 12)}… — and the inspector shows its typed ` +
      `parameters, engine-recorded quantities with calculation references and read-only ` +
      `reality anchors (${jumpedOperation.target.geometryRefs.map((ref) => ref.ref).join(", ")})`,
    operation: operationEchoOf(jumpedOperation, authored[jumpedOperationIndex - 1]!.origin, jumpedSpec),
    stateTransition: {
      versionNumber: 1,
      fromStateId: validatedVersion.states[jumpedOperationIndex - 1]?.stateId ?? null,
      toStateId: jumpedState.stateId,
      toStateIndex: jumpedState.stateIndex,
      toStateDigest: jumpedState.contentDigest ?? "",
    },
    links: [
      {
        label: `solution step ${jumpedOperationIndex} of ${world.solutionId} (this surface, deep-linked)`,
        href: formatRoute({ name: "solution", projectId: world.projectId, query: jumpQuery }),
        basis:
          "the clicked BOQ line's contributing operation — the contract's line → step resolution",
      },
    ],
  });

  /* ---- Step (9 + N) — SAVE/REVISE without altering observed reality. ---- */
  const reviseNumber = 9 + authored.length;
  if (input.revise.revertOperationIndex < 1 || input.revise.revertOperationIndex > authored.length) {
    throw new Error(
      `composed journey: revise targets unknown operation index ${input.revise.revertOperationIndex}`,
    );
  }
  const versionBeforeRevision = currentVersionOf(state);
  const revertOperationId = versionBeforeRevision.operations.find(
    (operation) => operation.operationIndex === input.revise.revertOperationIndex,
  )?.operationId;
  if (revertOperationId === undefined) {
    throw new Error(
      `composed journey: no applied operation at index ${input.revise.revertOperationIndex}`,
    );
  }
  const versionOneSnapshot = structuredClone(versionBeforeRevision);
  state = await reviseOperation(state, revertOperationId, journeyDeps, input.revise.reason);
  const revisedVersion = currentVersionOf(state);
  const revisedFinalState = revisedVersion.states[revisedVersion.states.length - 1]!;

  /* The revised version gets its own validation + BOQ (the saved revision's record). */
  state = await validateCurrentVersion(state, journeyDeps);
  const revisedSnapshot = state.validationSnapshot!;
  const revisedBoq = deriveSolutionBoq({
    version: currentVersionOf(state),
    snapshot: revisedSnapshot,
  });
  const revisedBoqEcho = boqEchoOf(revisedBoq);

  const sceneDigestAfter = sha256Hex(scene);
  let sealedStateCount = 0;
  let everyStateSealed = true;
  for (const version of state.versions) {
    for (const proposed of version.states) {
      sealedStateCount += 1;
      if (
        proposed.epistemicStatus !== "PROPOSED" ||
        proposed.baselineRealityVersionId !== world.baselineRealityVersionId
      ) {
        everyStateSealed = false;
      }
    }
  }
  const seal: JourneySealEcho = {
    pinnedRealityVersionId: world.baselineRealityVersionId,
    observedSceneDigestBefore: sceneDigestBefore,
    observedSceneDigestAfter: sceneDigestAfter,
    everyStateSealedProposed: everyStateSealed,
    sealedStateCount,
  };

  /* The rebuilt kept operations of the revision (new version context → new identities). */
  const lastRebuilt = revisedVersion.operations[revisedVersion.operations.length - 1]!;
  const lastRebuiltSpec = authored.find(
    (entry) => entry.spec.operationType === lastRebuilt.operationType,
  );
  if (lastRebuiltSpec === undefined) {
    throw new Error(
      `composed journey: rebuilt operation type '${lastRebuilt.operationType}' has no scripted spec`,
    );
  }
  for (const operation of revisedVersion.operations) {
    operationIdentities.push({
      step: reviseNumber,
      origin: authored.find((entry) => entry.spec.operationType === operation.operationType)!
        .origin,
      operationId: operation.operationId,
      versionNumber: operation.versionNumber,
    });
  }

  steps.push({
    step: reviseNumber,
    leg: "save-revise",
    title: "Save / revise the solution without altering observed reality",
    detail:
      `revised the solution by undoing step ${input.revise.revertOperationIndex} ` +
      `(${revertOperationId.slice(0, 12)}…) — a NEW version ${revisedVersion.versionNumber} ` +
      `whose kept operations were rebuilt through the same engine path; version 1 stays ` +
      `in the history untouched, the observed scene is byte-identical before/after ` +
      `(${sceneDigestBefore.slice(0, 12)}…), and every proposed state carries the PROPOSED ` +
      `seal over the pinned baseline`,
    operation: operationEchoOf(lastRebuilt, lastRebuiltSpec.origin, lastRebuiltSpec.spec),
    stateTransition: {
      versionNumber: revisedVersion.versionNumber,
      fromStateId: versionOneSnapshot.states[versionOneSnapshot.states.length - 1]!.stateId,
      toStateId: revisedFinalState.stateId,
      toStateIndex: revisedFinalState.stateIndex,
      toStateDigest: revisedFinalState.contentDigest ?? "",
    },
    validation: {
      snapshotId: revisedSnapshot.snapshotId,
      outcome: revisedSnapshot.outcome,
      inputDigest: revisedSnapshot.inputDigest,
      engine: { kind: revisedSnapshot.engine.kind, version: revisedSnapshot.engine.version },
      checkSummary: revisedSnapshot.checks.map((check) => ({
        checkId: check.checkId,
        result: check.result,
      })),
    },
    boq: revisedBoqEcho,
  });

  /* ---- The record. ---- */
  const crossSurfaceLinks: readonly JourneyLinkEcho[] = [
    {
      label: `case ${world.caseId} → the interactive solution workspace`,
      href: formatRoute({
        name: "solution",
        projectId: world.projectId,
        query: { case: world.caseId },
      }),
      basis: `the solution world's recorded case pin (${world.caseId})`,
    },
    {
      label: "intervention → the interactive solution composition",
      href: formatRoute({ name: "solution", projectId: world.projectId, query: {} }),
      basis: "the proposal-composition affordance of the Intervention Studio surface",
    },
    {
      label: `BOQ lens line → the solution BOQ line trace (${clickedLine.boqLineId.slice(0, 12)}…)`,
      href: formatRoute({
        name: "solution",
        projectId: world.projectId,
        query: { boqLine: clickedLine.boqLineId, step: jumpedOperationIndex },
      }),
      basis: "the clicked generated line's trace — the document-level source reference",
    },
    {
      label: "the source BOQ surface of this project (BOQ Lens)",
      href: formatRoute({ name: "boq-lens", projectId: world.projectId }),
      basis:
        "the generated solution BOQ is a separate derived projection — the source BOQ surface stays distinct",
    },
  ];

  const recordWithoutDigest = {
    journeyKind: "aise-composed-solution-journey" as const,
    journeyVersion: "1.0.0" as const,
    mode,
    world: {
      projectId: world.projectId,
      caseId: world.caseId,
      solutionId: world.solutionId,
      title: world.title,
      problemStatement: world.problemStatement,
      baselineRealityVersionId: world.baselineRealityVersionId,
    },
    steps,
    versions: state.versions.map((version) => ({
      versionNumber: version.versionNumber,
      status: version.status,
      operationIds: version.operations.map((operation) => operation.operationId),
      stateIds: version.states.map((proposed) => proposed.stateId),
      finalStateDigest: version.states[version.states.length - 1]?.contentDigest ?? "",
    })),
    boq: boqEcho,
    revisedBoq: revisedBoqEcho,
    boqTraceSet: boq.traceSet,
    operationIdentities,
    seal,
    crossSurfaceLinks,
  };
  const record: ComposedJourneyRecord = {
    ...recordWithoutDigest,
    journeyId: sha256Hex(recordWithoutDigest),
  };

  const caseContext: SolutionCaseContext = {
    projectId: world.projectId,
    caseId: world.caseId,
    solutionId: world.solutionId,
    title: world.title,
    problemStatement: world.problemStatement,
    baselineRealityVersionId: world.baselineRealityVersionId,
    observedScene: scene,
    baselineGeometry: input.baselineGeometry,
  };

  return {
    record,
    state,
    boq,
    revisedBoq,
    caseContext,
    boqSyncInput: { kind: "trace-set", traceSet: boq.traceSet },
  };
}

/* ------------------------------------------------------------------ */
/* The SEEDED world (the committed demo wall world)                     */
/* ------------------------------------------------------------------ */

/** The seeded journey's operation script (the corpus-pinned semantics). */
const SEEDED_OPERATIONS: readonly JourneyOperationSpec[] = [
  {
    operationType: "demolition-removal",
    origin: "direct-manipulation",
    intentId: "intent-journey-demolition-001",
    targetElementId: "node-wall-002",
    parameters: [
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 2.4, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
    ],
    /* The agent-authored variant of the SAME semantics (the corpus's
     * representative demolition command over the same wall-faces focus). */
    commandText: "Remove the damaged plaster 5 m long, 2.4 m high and 0.1 m thick.",
    renderedCommand: "Remove the damaged plaster 5 m long, 2.4 m high and 0.1 m thick.",
    authoredAt: "2026-09-16T10:05:00.000Z",
    estimates: [
      {
        label: "Removed volume",
        dimension: "volume",
        value: 1.2,
        unit: "m3",
        basis: "length × height × thickness (parameters only)",
      },
      {
        label: "Removed face area",
        dimension: "area",
        value: 12,
        unit: "m2",
        basis: "length × height (parameters only)",
      },
    ],
  },
  {
    operationType: "block-wall-placement",
    origin: "agent",
    intentId: "intent-journey-block-001",
    targetElementId: "geo-wall-line-003",
    parameters: [
      { name: "length", value: 5, unit: "m" },
      { name: "height", value: 1, unit: "m" },
      { name: "thickness", value: 0.1, unit: "m" },
      { name: "material", value: "concrete-block" },
    ],
    commandText: "Rebuild the damaged wall with blocks.",
    renderedCommand: "Lay blocks to a height of 1 m along this wall.",
    authoredAt: "2026-09-16T10:10:00.000Z",
    estimates: [
      {
        label: "Wall face area",
        dimension: "area",
        value: 5,
        unit: "m2",
        basis: "length × height (parameters only)",
      },
      {
        label: "Blocks needed",
        dimension: "count",
        value: 65,
        unit: "count",
        basis: "ceil(height/0.2) × ceil(length/0.4) (parameters only)",
      },
    ],
    clarification: {
      questions: [
        {
          slotKind: "dimension",
          slot: "height",
          question: "How high should the new wall section be built?",
        },
        {
          slotKind: "material",
          slot: "material",
          question: "Which blocks should be used?",
          offeredChoices: ["concrete-block", "clay-block", "aac-block"],
        },
      ],
      answer: "1 m high, using concrete blocks",
    },
  },
  {
    operationType: "plaster-application",
    origin: "agent",
    intentId: "intent-journey-plaster-001",
    targetElementId: "node-wall-002",
    parameters: [
      { name: "thickness", value: 30, unit: "mm" },
      { name: "material", value: "cement-plaster" },
    ],
    commandText: "Apply 30 mm plaster to the affected wall faces.",
    renderedCommand: "Apply 30 mm plaster to the affected wall faces.",
    authoredAt: "2026-09-16T10:15:00.000Z",
    estimates: [
      {
        label: "Plaster area",
        dimension: "area",
        value: 12.5,
        unit: "m2",
        basis: "the observed face-set area (caller-known focus value)",
      },
    ],
  },
];

/**
 * The seeded-fixture journey world: the PROD-024 module's committed demo
 * wall world (the SAME world the engine's `fixtures/baseline-geometry.json`,
 * the contract's committed intent corpus and the PROD-025 golden BOQ
 * describe), with the corpus-pinned script:
 *
 *   demolition (direct) → block wall (agent, clarified) → plaster (agent)
 *
 * The agent commands are the PROD-023 corpus's own utterance semantics
 * (the representative demolition / block-wall / plaster commands); the
 * demolition's direct authoring uses the contract's committed
 * `valid-demolition-removal` semantics.
 */
export function seededJourneyWorld(): JourneyWorldInput {
  return {
    world: {
      projectId: DEMO_SOLUTION_WORLD.projectId,
      caseId: DEMO_SOLUTION_WORLD.caseId,
      solutionId: DEMO_SOLUTION_WORLD.solutionId,
      title: DEMO_SOLUTION_WORLD.title,
      problemStatement: DEMO_SOLUTION_WORLD.problemStatement,
      baselineRealityVersionId: DEMO_SOLUTION_WORLD.baselineRealityVersionId,
      createdAt: DEMO_SOLUTION_WORLD.createdAt,
      baselineMaterializedAt: DEMO_SOLUTION_WORLD.baselineMaterializedAt,
      agentSessionId: DEMO_SOLUTION_WORLD.agentSessionId,
      agentId: DEMO_SOLUTION_WORLD.agentId,
      userId: DEMO_SOLUTION_WORLD.userId,
    },
    scene: demoObservedScene(),
    baselineGeometry: demoBaselineGeometry(),
    operations: SEEDED_OPERATIONS,
    revise: {
      revertOperationIndex: 1,
      reason: "save a revision without the demolition — the kept rebuild + plaster stand",
    },
    clock: { base: "2026-09-16T10:00:00.000Z", stepMs: 60_000 },
  };
}

/* ------------------------------------------------------------------ */
/* The recorded seeded journey (one cached promise per process)         */
/* ------------------------------------------------------------------ */

let seededPromise: Promise<ComposedJourneyResult> | undefined;

/**
 * The recorded SEEDED journey (mixed authoring) as ONE cached promise per
 * process — pure and deterministic, so caching changes nothing observable.
 * The surface unwraps it with React 19's `use()`; the tests await it.
 */
export function seededJourneyResource(): Promise<ComposedJourneyResult> {
  if (seededPromise === undefined) {
    seededPromise = runComposedJourney(seededJourneyWorld(), "mixed");
  }
  return seededPromise;
}

/* ------------------------------------------------------------------ */
/* The engine-executability probe (the guarded browser mount)           */
/* ------------------------------------------------------------------ */

let engineExecutable: boolean | undefined;

/**
 * Whether the deterministic solution engine can execute in THIS runtime.
 * The engine's identity derivations use `node:crypto`'s sha-256; a plain
 * browser bundle externalizes it (Vite's browser-external stub), so the
 * surface probes the engine ONCE with a scratch baseline materialization
 * and renders the honest degraded composition when it cannot run. In the
 * server-side renders and the deterministic test gate the engine always
 * executes (this probe answers true).
 */
export function solutionEngineExecutable(): boolean {
  if (engineExecutable === undefined) {
    try {
      materializeBaselineState({
        solutionId: "engine-executability-probe",
        versionNumber: 1,
        baselineRealityVersionId: "probe",
        materializedAt: "1970-01-01T00:00:00.000Z",
      });
      engineExecutable = true;
    } catch {
      engineExecutable = false;
    }
  }
  return engineExecutable;
}
