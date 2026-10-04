/**
 * WORLD-P3 — the AUTHORING family (`src/authoring/`): stage 1 of the
 * lane (AUTHOR) and the direct-manipulation ↔ NL equivalence surface.
 *
 * The typed contract for interactive spatial authoring: create/modify/
 * propose commands authored EITHER by the direct-manipulation gesture
 * stream OR by a natural-language utterance, resolving to the SAME
 * typed `EngineeringOperationIntent` through the P0-C scene-usage
 * contract with ghost/proposed states under the ghost-distinctness law.
 *
 * THE DM↔NL EQUIVALENCE LAW (seam law #1, made structural here):
 *
 *   gesture stream ──compile──┐
 *                              ├──> AuthoringCommandDraft ──createOperationIntent──> intent
 *   NL utterance ──parse──────┘         (SAME closed typed                    (provenance is the
 *                                        command vocabulary)                   ONLY difference)
 *
 * Both modalities produce the draft through the SAME closed typed
 * command vocabulary, the SAME parameter-resolution function and the
 * SAME scope-declared target descriptors — so the same semantics
 * authored by either modality derives the SAME content-derived
 * operation identity (provenance is EXCLUDED from identity by
 * `@aise/solution-contract` identity.ts). No input modality receives
 * different engineering authority.
 *
 * THE NL-SUBSTRATE LAW (seam law #2 — exactly the P2 LLM law): the
 * natural-language command parser is a REPLACEABLE SUBSTRATE behind the
 * `NlCommandParserAdapter` port. Its outputs are UNTRUSTED candidate
 * drafts: the controlled entry point `parseNlCommandThroughPort`
 * re-validates every parsed draft against the closed vocabulary and the
 * authoring scope (fail-closed — a rogue parser output is a typed
 * refusal, never a pass-through). The parser can never author
 * engineering semantics it was not asked for: the draft's operation
 * type must be in the scope's declared palette, its parameters closed
 * against the palette's declared default sets, its target an element
 * the scope declares. A real NLU/LLM occupant is BLOCKED pending the
 * substrate decision (see the item's CAPABILITY-BOUNDARIES); the two
 * in-memory substitution doubles prove the port WITHOUT any model.
 *
 * THE GHOST LAW (seam law #3): authored create/modify/replace commands
 * compose GHOST scene nodes (`isGhost: true`, layer "solution") — the
 * P0-C scene-usage contract's ghost-distinctness helpers verify the
 * composed ghost set structurally BEFORE any presentation. A remove
 * command composes NO proposed node; its target lands in the removed
 * set. Reality nodes are never marked ghosts by this lane.
 *
 * LAWS (on top of the seam's ten; enforced here and drilled by
 * `authoring.test.ts`):
 *
 *  1. ONE COMMAND PER STREAM: a manipulation stream authors exactly one
 *     command — pick* → (edits|drags)* → commit; anything else is a
 *     typed refusal (never a partial compile).
 *  2. PARAMETERS ARE CLOSED AGAINST THE DECLARED PALETTE: every
 *     parameter (gesture-edited, utterance-extracted or default) must
 *     be a member of the operation type's declared default parameter
 *     set — order follows the DECLARED order; an unknown parameter name
 *     is a typed refusal. Numeric values REQUIRE typed units (the
 *     solution-contract invariant, enforced by `createOperationIntent`).
 *  3. TARGETS RESOLVE OR REFUSE: the picked/uttered element must be a
 *     declared element of the authoring scope AND present in the world
 *     scene — an unknown element is a typed refusal (identity
 *     quarantine: a substrate-shaped id is refused by pattern).
 *  4. PROVENANCE IS THE ONLY MODALITY DIFFERENCE: the DM compile
 *     records origin "direct-manipulation" + interactionDetail; the NL
 *     compile records origin "agent" + the EXACT normalized utterance
 *     (commandText verbatim, never paraphrased).
 *  5. DETERMINISM: no clock reads (authoredAt is a declared input), no
 *     randomness, no I/O; identical inputs derive identical intents
 *     and operation ids.
 */

import {
  createOperationIntent,
  deriveEngineeringOperationId,
  operationSemanticIdentityOfIntent,
  BUILDING_OPERATION_TYPES,
  type EngineeringOperationIntent,
  type OperationDependency,
  type OperationTarget,
  type SolutionDomainDescriptor,
  type TargetGeometryRef,
  type TypedOperationParameter,
  type OperationVersionContext,
} from "@aise/solution-contract";
import {
  ghostDistinctnessViolations,
  type ProposedStatePresentationRequest,
  type SolutionAssetSource,
} from "@aise/world-solution-substrate";
import {
  IDENTITY_TRANSFORM,
  translation,
  validateScene,
  type ComposedScene,
  type GhostSetSummary,
  type SceneElementId,
  type SceneNode,
} from "@aise/world-reality-substrate";
import {
  contentIdOf,
  isNonEmptyString,
  isRecord,
  isDeclaredInstant,
  laneRefused,
  looksLikeSubstrateId,
  type LaneOperator,
  type Layer3Family,
  type LaneOutcome,
} from "../seam";

const FAMILY: Layer3Family = "authoring";

/* ------------------------------------------------------------------ */
/* Sealed kinds + closed vocabularies                                   */
/* ------------------------------------------------------------------ */

export const AUTHORING_COMMAND_KIND = "spatial-authoring-command" as const;
export const AUTHORING_COMMAND_SCHEMA_VERSION = "spatial-authoring-command/1" as const;
export const NL_COMMAND_PARSE_PORT_ID = "authoring.nl-command/1" as const;

/**
 * The closed interaction-verb vocabulary (the directive's Layer-3
 * target: "GRAB / MOVE / REPLACE / ADD / REMOVE"). The verb is the
 * INTERACTION semantics; the `operationType` carries the engineering
 * semantics (open wire vocabulary, building catalogue advisory).
 */
export const SPATIAL_AUTHORING_COMMANDS = [
  "add",
  "remove",
  "move",
  "replace",
  "reparameterize",
] as const;
export type SpatialAuthoringCommandKind = (typeof SPATIAL_AUTHORING_COMMANDS)[number];

export function isSpatialAuthoringCommandKind(
  value: unknown,
): value is SpatialAuthoringCommandKind {
  return (
    typeof value === "string" &&
    (SPATIAL_AUTHORING_COMMANDS as readonly string[]).includes(value)
  );
}

/**
 * The closed direct-manipulation gesture vocabulary (the gesture stream
 * the interactive world emits). A stream is pick* → (edit|drag)* →
 * commit (law 1).
 */
export const MANIPULATION_GESTURE_KINDS = [
  "pick-element",
  "begin-grab",
  "drag-by",
  "drop-at",
  "edit-parameter",
  "commit",
] as const;
export type ManipulationGestureKind = (typeof MANIPULATION_GESTURE_KINDS)[number];

/* ------------------------------------------------------------------ */
/* The authoring scope (the DECLARED world the command acts in)         */
/* ------------------------------------------------------------------ */

/**
 * One DECLARED selection mode of a scoped element: the selector kind,
 * the read-only reality anchors and the units of ONE way an operation
 * may target this element. An element may offer several modes (the wall
 * offers its faces AND its line extent — the tool's selection mode
 * picks one); each (elementId, selectorKind) pair is unique. The
 * app/world declares these; the lane never invents anchors.
 */
export interface ScopedSelectionMode {
  readonly selectorKind: OperationTarget["selectorKind"];
  readonly geometryRefs: readonly TargetGeometryRef[];
  readonly units: OperationTarget["units"];
  readonly description: string;
}

/** One DECLARED scoped element and its selection modes. */
export interface ScopedElementDescriptor {
  readonly elementId: SceneElementId;
  readonly selectionModes: readonly ScopedSelectionMode[];
}

/**
 * One DECLARED operation-type entry of the authoring palette: the
 * operation type, the TARGET SELECTION MODE it operates through (the
 * tool mode — declared, never inferred by the lane), and its DECLARED
 * default parameter set (parameter ORDER included — the
 * identity-stable resolution order). The palette is the
 * app/engine-declared catalogue slice available in this authoring
 * context; an operation type outside it is a typed refusal (closed
 * support, honestly declared).
 */
export interface ScopedOperationType {
  readonly operationType: string;
  readonly targetSelectorKind: OperationTarget["selectorKind"];
  readonly defaultParameters: readonly TypedOperationParameter[];
}

/**
 * The authoring scope: the world scene, the scoped element descriptors,
 * the declared operation palette and the proposal context. EVERYTHING
 * an authored command resolves against — no invention anywhere.
 */
export interface AuthoringScope {
  readonly solutionId: string;
  readonly versionNumber: number;
  readonly worldScene: ComposedScene;
  readonly elementDescriptors: readonly ScopedElementDescriptor[];
  readonly operationPalette: readonly ScopedOperationType[];
  readonly domain: SolutionDomainDescriptor;
}

/* ------------------------------------------------------------------ */
/* The modality-neutral typed command draft                             */
/* ------------------------------------------------------------------ */

/**
 * The closed typed command draft — the SINGLE vocabulary BOTH input
 * modalities resolve to (the equivalence law's core type). The draft is
 * modality-neutral: provenance attaches only at intent compile time.
 */
export interface AuthoringCommandDraft {
  readonly kind: typeof AUTHORING_COMMAND_KIND;
  readonly schemaVersion: typeof AUTHORING_COMMAND_SCHEMA_VERSION;
  /** The interaction verb (closed vocabulary). */
  readonly commandKind: SpatialAuthoringCommandKind;
  /** The engineering operation type (must be in the scope's palette). */
  readonly operationType: string;
  /** The target element the command acts on (scope-declared). */
  readonly targetElementId: SceneElementId;
  /** Parameter overrides the modality extracted (closed at resolution). */
  readonly parameterOverrides: readonly TypedOperationParameter[];
  /** Dependency edges the author asserts (may be empty). */
  readonly dependsOn: readonly OperationDependency[];
}

/* ------------------------------------------------------------------ */
/* Target resolution (the SHARED target law of both modalities)         */
/* ------------------------------------------------------------------ */

/**
 * Resolve the operation target of a draft: the scoped element + the
 * palette entry's DECLARED target selection mode → the unique matching
 * selection mode → the `OperationTarget` (read-only reality anchors,
 * verbatim). Refuses when the palette lacks the operation type or the
 * element offers no such selection mode. PURE.
 */
export function resolveOperationTarget(
  scope: AuthoringScope,
  draft: AuthoringCommandDraft,
): LaneOutcome<OperationTarget> {
  const entry = scope.operationPalette.find(
    (candidate) => candidate.operationType === draft.operationType,
  );
  if (entry === undefined) {
    return laneRefused<OperationTarget>(
      FAMILY,
      "unsupported-data",
      `operation type '${draft.operationType}' is not in the authoring scope's declared palette ` +
        `(declared: ${scope.operationPalette.map((e) => e.operationType).join(", ") || "none"})`,
    );
  }
  const descriptor = scope.elementDescriptors.find(
    (candidate) => candidate.elementId === draft.targetElementId,
  );
  if (descriptor === undefined) {
    return laneRefused<OperationTarget>(
      FAMILY,
      "unsupported-data",
      `target element '${draft.targetElementId}' is not declared in the authoring scope`,
    );
  }
  const mode = descriptor.selectionModes.find(
    (candidate) => candidate.selectorKind === entry.targetSelectorKind,
  );
  if (mode === undefined) {
    return laneRefused<OperationTarget>(
      FAMILY,
      "unsupported-data",
      `element '${draft.targetElementId}' offers no '${entry.targetSelectorKind}' selection mode ` +
        `(declared: ${descriptor.selectionModes.map((m) => m.selectorKind).join(", ") || "none"}) ` +
        `— required by operation type '${draft.operationType}'`,
    );
  }
  return {
    ok: true,
    value: {
      contractVersion: "1.0.0",
      selectorKind: mode.selectorKind,
      nodeRefs: [descriptor.elementId],
      geometryRefs: [...mode.geometryRefs],
      units: mode.units,
      description: mode.description,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Parameter resolution (the SHARED law of both modalities)             */
/* ------------------------------------------------------------------ */

/**
 * Resolve the command parameters: the operation type's DECLARED default
 * parameter set in DECLARED order, with the modality's overrides
 * applied in place. Unknown override names are typed refusals — the
 * parameter surface is closed against the palette (law 2). PURE.
 */
export function resolveCommandParameters(
  scope: AuthoringScope,
  operationType: string,
  overrides: readonly TypedOperationParameter[],
): LaneOutcome<readonly TypedOperationParameter[]> {
  const entry = scope.operationPalette.find(
    (candidate) => candidate.operationType === operationType,
  );
  if (entry === undefined) {
    return laneRefused<readonly TypedOperationParameter[]>(
      FAMILY,
      "unsupported-data",
      `operation type '${operationType}' is not in the authoring scope's declared palette ` +
        `(declared: ${scope.operationPalette.map((e) => e.operationType).join(", ") || "none"})`,
    );
  }
  const byName = new Map(
    overrides.map((override) => [override.name, override] as const),
  );
  const resolved: TypedOperationParameter[] = [];
  for (const parameter of entry.defaultParameters) {
    const override = byName.get(parameter.name);
    if (override !== undefined) {
      if (
        typeof override.value === "number" &&
        !isNonEmptyString(override.unit)
      ) {
        return laneRefused<readonly TypedOperationParameter[]>(
          FAMILY,
          "contract-mismatch",
          `numeric parameter '${override.name}' requires a typed unit (the frozen discipline)`,
        );
      }
      resolved.push(override);
      byName.delete(override.name);
    } else {
      resolved.push(parameter);
    }
  }
  if (byName.size > 0) {
    const unknown = [...byName.keys()].sort().join(", ");
    return laneRefused<readonly TypedOperationParameter[]>(
      FAMILY,
      "contract-mismatch",
      `parameter override(s) outside the declared set for '${operationType}': ${unknown} ` +
        `(declared: ${entry.defaultParameters.map((p) => p.name).join(", ")})`,
    );
  }
  return { ok: true, value: resolved };
}

/* ------------------------------------------------------------------ */
/* Draft validation (the closed-vocabulary gate every draft passes)     */
/* ------------------------------------------------------------------ */

/**
 * Validate a draft against the closed vocabulary and the authoring
 * scope (the gate BOTH the DM compile and the NL parse enforce; the
 * NL port entry re-runs it over UNTRUSTED parser output). PURE.
 */
export function validateAuthoringCommandDraft(
  draft: AuthoringCommandDraft,
  scope: AuthoringScope,
): LaneOutcome<null> {
  if (!isRecord(draft)) {
    return laneRefused<null>(FAMILY, "contract-mismatch", "the draft must be an object");
  }
  if (draft.kind !== AUTHORING_COMMAND_KIND) {
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      `draft kind must be '${AUTHORING_COMMAND_KIND}'`,
    );
  }
  if (draft.schemaVersion !== AUTHORING_COMMAND_SCHEMA_VERSION) {
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      `draft schemaVersion must be '${AUTHORING_COMMAND_SCHEMA_VERSION}'`,
    );
  }
  if (!isSpatialAuthoringCommandKind(draft.commandKind)) {
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      `command kind must be one of ${SPATIAL_AUTHORING_COMMANDS.join(" | ")}`,
    );
  }
  if (!isNonEmptyString(draft.operationType)) {
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      "operationType must be a non-empty string",
    );
  }
  const substratePattern = looksLikeSubstrateId(draft.targetElementId);
  if (substratePattern !== null) {
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      `identity quarantine: targetElementId carries a substrate-shaped id (pattern ${substratePattern})`,
    );
  }
  const descriptor = scope.elementDescriptors.find(
    (candidate) => candidate.elementId === draft.targetElementId,
  );
  const sceneElement = scope.worldScene.nodes.find(
    (node) => node.elementId === draft.targetElementId,
  );
  if (sceneElement === undefined) {
    return laneRefused<null>(
      FAMILY,
      "contract-mismatch",
      `target element '${draft.targetElementId}' is not present in the scope's world scene (revision ${scope.worldScene.revision})`,
    );
  }
  if (sceneElement.isGhost) {
    return laneRefused<null>(
      FAMILY,
      "operation-semantic-failure",
      `target element '${draft.targetElementId}' is already a ghost — authoring commands anchor to captured reality, never to proposed state`,
    );
  }
  if (descriptor === undefined) {
    return laneRefused<null>(
      FAMILY,
      "unsupported-data",
      `target element '${draft.targetElementId}' is not declared in the authoring scope`,
    );
  }
  const target = resolveOperationTarget(scope, draft);
  if (!target.ok) {
    return target;
  }
  const parameters = resolveCommandParameters(
    scope,
    draft.operationType,
    draft.parameterOverrides,
  );
  if (!parameters.ok) {
    return parameters;
  }
  return { ok: true, value: null };
}

/* ------------------------------------------------------------------ */
/* The direct-manipulation gesture stream                               */
/* ------------------------------------------------------------------ */

/** One direct-manipulation gesture (the interactive world's input). */
export type ManipulationGesture =
  | {
      readonly gesture: "pick-element";
      readonly elementId: SceneElementId;
    }
  | {
      readonly gesture: "begin-grab";
      readonly elementId: SceneElementId;
    }
  | {
      readonly gesture: "drag-by";
      readonly deltaMetres: readonly [number, number, number];
    }
  | {
      readonly gesture: "drop-at";
      readonly deltaMetres: readonly [number, number, number];
    }
  | {
      readonly gesture: "edit-parameter";
      readonly parameter: TypedOperationParameter;
    }
  | {
      readonly gesture: "commit";
      readonly commandKind: SpatialAuthoringCommandKind;
      readonly operationType: string;
    };

/** The recorded direct-manipulation stream (one authored command). */
export interface DirectManipulationStream {
  readonly streamId: string;
  readonly operator: LaneOperator;
  /** The world revision the stream was recorded against (declared). */
  readonly sceneRevision: number;
  readonly gestures: readonly ManipulationGesture[];
  readonly authoredAt: string;
}

/**
 * Compile a direct-manipulation gesture stream into the modality-
 * neutral draft + the provenance interaction detail (law 1: one command
 * per stream; law 2: parameters closed against the palette). PURE.
 */
export function compileManipulationStream(
  stream: DirectManipulationStream,
  scope: AuthoringScope,
): LaneOutcome<{ readonly draft: AuthoringCommandDraft; readonly interactionDetail: string }> {
  if (scope.worldScene.revision !== stream.sceneRevision) {
    return laneRefused(
      FAMILY,
      "operation-semantic-failure",
      `the stream was recorded against scene revision ${stream.sceneRevision}, ` +
        `but the authoring scope is at revision ${scope.worldScene.revision} ` +
        `(re-record the stream against the current world)`,
    );
  }
  if (stream.gestures.length === 0) {
    return laneRefused(
      FAMILY,
      "contract-mismatch",
      "a manipulation stream must not be empty",
    );
  }
  if (!isDeclaredInstant(stream.authoredAt)) {
    return laneRefused(
      FAMILY,
      "contract-mismatch",
      "authoredAt must be a declared ISO-8601 UTC instant",
    );
  }
  const first = stream.gestures[0];
  if (first === undefined || first.gesture !== "pick-element") {
    return laneRefused(
      FAMILY,
      "contract-mismatch",
      "a manipulation stream must begin with a pick-element gesture",
    );
  }
  const last = stream.gestures[stream.gestures.length - 1];
  if (last === undefined || last.gesture !== "commit") {
    return laneRefused(
      FAMILY,
      "contract-mismatch",
      "a manipulation stream must end with a commit gesture",
    );
  }
  const pickedId = first.elementId;
  const substratePattern = looksLikeSubstrateId(pickedId);
  if (substratePattern !== null) {
    return laneRefused(
      FAMILY,
      "contract-mismatch",
      `identity quarantine: the picked element id carries a substrate-shaped id (pattern ${substratePattern})`,
    );
  }
  const descriptor = scope.elementDescriptors.find(
    (candidate) => candidate.elementId === pickedId,
  );
  if (descriptor === undefined) {
    return laneRefused(
      FAMILY,
      "unsupported-data",
      `the picked element '${pickedId}' is not declared in the authoring scope`,
    );
  }
  const overrides: TypedOperationParameter[] = [];
  let dragCount = 0;
  let dropDelta: readonly [number, number, number] | null = null;
  let regrabMismatch: string | null = null;
  for (let index = 1; index < stream.gestures.length - 1; index += 1) {
    const gesture = stream.gestures[index];
    if (gesture === undefined) {
      continue;
    }
    switch (gesture.gesture) {
      case "pick-element": {
        if (gesture.elementId !== pickedId) {
          regrabMismatch = `a stream authors ONE command: re-pick of '${gesture.elementId}' after '${pickedId}'`;
        }
        break;
      }
      case "begin-grab": {
        if (gesture.elementId !== pickedId) {
          regrabMismatch = `a stream authors ONE command: grab of '${gesture.elementId}' after picking '${pickedId}'`;
        }
        break;
      }
      case "drag-by":
      case "drop-at": {
        dragCount += 1;
        for (const axis of gesture.deltaMetres) {
          if (!Number.isFinite(axis)) {
            return laneRefused(
              FAMILY,
              "contract-mismatch",
              "a drag/drop delta must be finite (metres)",
            );
          }
        }
        if (gesture.gesture === "drop-at") {
          dropDelta = gesture.deltaMetres;
        }
        break;
      }
      case "edit-parameter": {
        overrides.push(gesture.parameter);
        break;
      }
      case "commit": {
        regrabMismatch = "a stream authors ONE command: a commit gesture before the final commit";
        break;
      }
    }
  }
  if (regrabMismatch !== null) {
    return laneRefused(FAMILY, "contract-mismatch", regrabMismatch);
  }
  if (last.commandKind === "move" && dropDelta === null) {
    return laneRefused(
      FAMILY,
      "contract-mismatch",
      "a move command requires a drop-at gesture (the translation the operator applied)",
    );
  }
  if (dropDelta !== null && last.commandKind !== "move") {
    return laneRefused(
      FAMILY,
      "operation-semantic-failure",
      `a ${last.commandKind} command cannot carry a drag translation — only move commands translate`,
    );
  }
  const draft: AuthoringCommandDraft = {
    kind: AUTHORING_COMMAND_KIND,
    schemaVersion: AUTHORING_COMMAND_SCHEMA_VERSION,
    commandKind: last.commandKind,
    operationType: last.operationType,
    targetElementId: pickedId,
    parameterOverrides: overrides,
    dependsOn: [],
  };
  const validation = validateAuthoringCommandDraft(draft, scope);
  if (!validation.ok) {
    return validation;
  }
  const parts: string[] = [
    `operator picked ${pickedId}`,
  ];
  if (dragCount > 0 && dropDelta !== null) {
    parts.push(
      `dragged the element by (${dropDelta[0]}, ${dropDelta[1]}, ${dropDelta[2]}) m`,
    );
  }
  if (overrides.length > 0) {
    parts.push(
      `edited ${overrides.length} parameter(s): ${overrides
        .map((p) => `${p.name}${isNonEmptyString(p.unit) ? ` [${p.unit}]` : ""}=${p.value}`)
        .join(", ")}`,
    );
  }
  parts.push(`committed a ${last.commandKind} command of type ${last.operationType}`);
  const interactionDetail = `operator authored the command by direct manipulation in the interactive world (${parts.join("; ")})`;
  return { ok: true, value: { draft, interactionDetail } };
}

/* ------------------------------------------------------------------ */
/* The NL-command parser port (the replaceable substrate — law 2)       */
/* ------------------------------------------------------------------ */

/** Capabilities of one NL-command parser implementation. */
export interface NlParserCapabilities {
  /** The closed grammar families this parser declares support for. */
  readonly supportedGrammarFamilies: readonly string[];
  readonly maxUtteranceLength: number;
  /** Named BLOCKED capabilities with the honest reason (law 8). */
  readonly blocked: readonly { readonly capability: string; readonly reason: string }[];
}

/** The request the NL parser port receives. */
export interface NlCommandParseRequest {
  /** The EXACT normalized utterance (carried verbatim to provenance). */
  readonly utterance: string;
  /** The authoring scope the utterance resolves against. */
  readonly scope: AuthoringScope;
  /** The element the operator has selected, when one is (context). */
  readonly selectedElementId: SceneElementId | null;
}

/**
 * The natural-language command parser port — a REPLACEABLE SUBSTRATE
 * (exactly the P2 LLM law): implementations may be the in-memory
 * deterministic doubles of `./doubles.ts`, a real NLU engine, or an LLM
 * adapter in a future occupant. The port NEVER receives authority: its
 * output is a candidate draft that `parseNlCommandThroughPort`
 * re-validates fail-closed.
 */
export interface NlCommandParserAdapter {
  readonly portId: typeof NL_COMMAND_PARSE_PORT_ID;
  readonly capabilities: NlParserCapabilities;
  parseCommand(request: NlCommandParseRequest): LaneOutcome<AuthoringCommandDraft>;
}

/**
 * THE CONTROLLED ENTRY POINT of the NL lane: parse an utterance through
 * a parser (any occupant — double or real engine) and REFUSE rogue
 * output fail-closed. The parser is an untrusted substrate: its draft
 * is re-validated against the closed command vocabulary and the
 * authoring scope before it can compile (law 2 + law 8).
 */
export function parseNlCommandThroughPort(
  parser: NlCommandParserAdapter,
  request: NlCommandParseRequest,
): LaneOutcome<AuthoringCommandDraft> {
  if (parser.portId !== NL_COMMAND_PARSE_PORT_ID) {
    return laneRefused(
      FAMILY,
      "contract-mismatch",
      `the parser must declare portId '${NL_COMMAND_PARSE_PORT_ID}'`,
    );
  }
  if (!isNonEmptyString(request.utterance)) {
    return laneRefused(FAMILY, "contract-mismatch", "the utterance must be a non-empty string");
  }
  if (request.utterance.length > parser.capabilities.maxUtteranceLength) {
    return laneRefused(
      FAMILY,
      "unsupported-data",
      `the utterance exceeds the parser's declared max length ${parser.capabilities.maxUtteranceLength}`,
    );
  }
  const parsed = parser.parseCommand(request);
  if (!parsed.ok) {
    return parsed;
  }
  const draft = parsed.value;
  if (!isRecord(draft)) {
    return laneRefused(
      FAMILY,
      "contract-mismatch",
      "the parser returned a non-object draft — rogue substrate output",
    );
  }
  if (draft.kind !== AUTHORING_COMMAND_KIND) {
    return laneRefused(
      FAMILY,
      "contract-mismatch",
      "the parser returned a draft of the wrong kind — rogue substrate output",
    );
  }
  const validation = validateAuthoringCommandDraft(draft, request.scope);
  if (!validation.ok) {
    return laneRefused<AuthoringCommandDraft>(
      FAMILY,
      "contract-mismatch",
      `rogue parser output refused at the NL gate: ${validation.failure.detail}`,
    );
  }
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Intent compile (the single constructor surface, both modalities)     */
/* ------------------------------------------------------------------ */

/** The provenance input of one modality (the ONLY modality difference). */
export interface AuthoringProvenanceInput {
  readonly operator: LaneOperator;
  /** The declared authoring instant (never a clock read). */
  readonly authoredAt: string;
  /** DM modality: the recorded interaction detail. */
  readonly interactionDetail?: string;
  /** NL modality: the EXACT normalized utterance (verbatim). */
  readonly commandText?: string;
  /** Optional input evidence content ids. */
  readonly evidenceIds?: readonly string[];
}

/** One authored command: the compiled intent + derived identity. */
export interface AuthoredCommand {
  readonly commandKind: SpatialAuthoringCommandKind;
  readonly modality: "direct-manipulation" | "agent";
  readonly intent: EngineeringOperationIntent;
  /** The content-derived operation identity (modality-INDEPENDENT). */
  readonly operationId: string;
  readonly targetElementId: SceneElementId;
  readonly commandDraft: AuthoringCommandDraft;
}

/**
 * Compile a (validated) draft into an `EngineeringOperationIntent`
 * through the solution-contract's ONE constructor surface. The modality
 * determines ONLY the provenance origin (law 4): direct-manipulation
 * with interactionDetail, agent with the verbatim commandText. PURE.
 */
export function compileAuthoringCommand(
  draft: AuthoringCommandDraft,
  scope: AuthoringScope,
  provenanceInput: AuthoringProvenanceInput,
  intentId: string,
): LaneOutcome<AuthoredCommand> {
  const validation = validateAuthoringCommandDraft(draft, scope);
  if (!validation.ok) {
    return validation;
  }
  const targetOutcome = resolveOperationTarget(scope, draft);
  if (!targetOutcome.ok) {
    return targetOutcome;
  }
  const target = targetOutcome.value;
  const parameters = resolveCommandParameters(
    scope,
    draft.operationType,
    draft.parameterOverrides,
  );
  if (!parameters.ok) {
    return parameters;
  }
  const isDirect = provenanceInput.interactionDetail !== undefined;
  const isAgent = provenanceInput.commandText !== undefined;
  if (isDirect === isAgent) {
    return laneRefused<AuthoredCommand>(
      FAMILY,
      "contract-mismatch",
      "exactly ONE modality provenance must be present " +
        "(interactionDetail for direct-manipulation, commandText for agent)",
    );
  }
  try {
    const intent = createOperationIntent({
      intentId,
      operationType: draft.operationType,
      domain: scope.domain,
      parameters: [...parameters.value],
      target,
      dependsOn: [...draft.dependsOn],
      provenance: {
        origin: isDirect ? "direct-manipulation" : "agent",
        authoredBy: provenanceInput.operator.operatorId,
        authoredAt: provenanceInput.authoredAt,
        ...(isDirect
          ? { interactionDetail: provenanceInput.interactionDetail }
          : { commandText: provenanceInput.commandText }),
        evidenceIds: [...(provenanceInput.evidenceIds ?? [])],
        ...(isDirect
          ? {
              derivationNote:
                "operator authored the command by direct manipulation in the interactive world",
            }
          : {}),
      },
      proposedTo: {
        solutionId: scope.solutionId,
        versionNumber: scope.versionNumber,
      },
    });
    const context: OperationVersionContext = {
      solutionId: scope.solutionId,
      versionNumber: scope.versionNumber,
      operationIndex: 1,
    };
    const operationId = deriveEngineeringOperationId(
      operationSemanticIdentityOfIntent(intent, context),
    );
    return {
      ok: true,
      value: {
        commandKind: draft.commandKind,
        modality: isDirect ? "direct-manipulation" : "agent",
        intent,
        operationId,
        targetElementId: draft.targetElementId,
        commandDraft: draft,
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return laneRefused<AuthoredCommand>(
      FAMILY,
      "contract-mismatch",
      `the intent constructor refused the command (the contract invariants): ${detail}`,
    );
  }
}

/** Derive the operation identity of an intent at a compile context. PURE. */
export function operationIdentityOf(
  intent: EngineeringOperationIntent,
  context: OperationVersionContext,
): string {
  return deriveEngineeringOperationId(
    operationSemanticIdentityOfIntent(intent, context),
  );
}

/* ------------------------------------------------------------------ */
/* Ghost composition (the ghost-distinctness law carrier)               */
/* ------------------------------------------------------------------ */

/**
 * The ghost (proposed) element id of an authored command: content-
 * derived from the command draft — deterministic, AISE-side, never a
 * substrate id, stable across modalities (the same command semantics
 * derive the same ghost element id). PURE.
 */
export function ghostElementIdOf(draft: AuthoringCommandDraft): SceneElementId {
  const digest = contentIdOf(
    {
      commandKind: draft.commandKind,
      operationType: draft.operationType,
      targetElementId: draft.targetElementId,
      parameterOverrides: draft.parameterOverrides,
      dependsOn: draft.dependsOn,
    },
    "",
  );
  return `ghost-${draft.commandKind}-${digest.slice(0, 16)}`;
}

/** The ghost set an authored command composes (law 3). PURE. */
export function ghostSetOfCommand(command: AuthoredCommand): GhostSetSummary {
  const ghostId = ghostElementIdOf(command.commandDraft);
  if (command.commandKind === "add") {
    return {
      operationId: command.operationId,
      proposedElementIds: [ghostId],
      removedElementIds: [],
    };
  }
  if (command.commandKind === "remove") {
    return {
      operationId: command.operationId,
      proposedElementIds: [],
      removedElementIds: [command.targetElementId],
    };
  }
  // move / replace / reparameterize: the modified state presents as a
  // ghost; the captured element leaves the presentation.
  return {
    operationId: command.operationId,
    proposedElementIds: [ghostId],
    removedElementIds: [command.targetElementId],
  };
}

/**
 * Compose the ghost scene node(s) of a command into the base world
 * scene: the new/modified element appears as a GHOST node (isGhost:
 * true, layer "solution"), the captured target stays untouched (reality
 * is never mutated — the governed changes API stays the only write
 * path). Refuses structurally invalid compositions. PURE.
 */
export function composeGhostScene(
  baseScene: ComposedScene,
  command: AuthoredCommand,
  ghostOptions: {
    readonly transform?: readonly [number, number, number];
    readonly geometry: SceneNode["geometry"];
    readonly label: string;
  },
): LaneOutcome<ComposedScene> {
  if (
    !baseScene.nodes.some((node) => node.elementId === command.targetElementId) &&
    command.commandKind !== "add"
  ) {
    return laneRefused<ComposedScene>(
      FAMILY,
      "contract-mismatch",
      `the command's target element '${command.targetElementId}' is not in the base scene`,
    );
  }
  const ghostId = ghostElementIdOf(command.commandDraft);
  const ghostNode: SceneNode = {
    elementId: ghostId,
    kind: "ghost",
    parentId: null,
    transform:
      ghostOptions.transform === undefined
        ? IDENTITY_TRANSFORM
        : translation(ghostOptions.transform[0], ghostOptions.transform[1], ghostOptions.transform[2]),
    geometry: ghostOptions.geometry,
    material: null,
    layerIds: ["solution"],
    isGhost: true,
    evidenceContentIds: [],
    label: ghostOptions.label,
  };
  const ghostSet = ghostSetOfCommand(command);
  const nextRevision = baseScene.revision + 1;
  // The base nodes ALL stay: the ghost set's removedElementIds mark what
  // the PRESENTATION removes (the runtime overlay owns the visual
  // removal); the composed scene data keeps the world intact — the
  // P0-C ghost-distinctness law requires removed ids resolvable.
  const composed: ComposedScene = {
    ...baseScene,
    revision: nextRevision,
    nodes:
      command.commandKind === "remove"
        ? [...baseScene.nodes]
        : [...baseScene.nodes, ghostNode],
    ghostSummary: ghostSet,
  };
  const structural = validateScene(composed);
  if (structural.length > 0) {
    return laneRefused<ComposedScene>(
      FAMILY,
      "contract-mismatch",
      `the composed ghost scene is structurally invalid: ${structural.join("; ")}`,
    );
  }
  const ghostLaw = ghostDistinctnessViolations(composed, ghostSet);
  if (ghostLaw.length > 0) {
    return laneRefused<ComposedScene>(
      FAMILY,
      "operation-semantic-failure",
      `the composed scene violates the ghost-distinctness law: ${ghostLaw.join("; ")}`,
    );
  }
  return { ok: true, value: composed };
}

/**
 * Build the P0-C proposed-state presentation request for an authored
 * command's composed scene — the bridge to the scene-usage contract
 * (WORLD-P0-C drives the Babylon port; the ghost law is verified by the
 * usage adapter end-to-end). Refuses when the intent carries no
 * proposal context. PURE.
 */
export function proposedStatePresentationRequestOf(
  command: AuthoredCommand,
  composedScene: ComposedScene,
  solutionAssets: readonly SolutionAssetSource[],
): LaneOutcome<ProposedStatePresentationRequest> {
  const proposedTo = command.intent.proposedTo;
  if (proposedTo === undefined) {
    return laneRefused<ProposedStatePresentationRequest>(
      FAMILY,
      "contract-mismatch",
      "the authored intent carries no proposal context (proposedTo) — a presentation needs the solution/version binding",
    );
  }
  return {
    ok: true,
    value: {
      kind: "proposed-state-presentation-request",
      schemaVersion: "proposed-state-presentation-request/1",
      solutionId: proposedTo.solutionId,
      versionNumber: proposedTo.versionNumber,
      stateIndex: 1,
      baseScene: composedScene,
      ghostSet: ghostSetOfCommand(command),
      solutionAssets: [...solutionAssets],
    },
  };
}

/** Re-export the identity transform for consumers composing ghost nodes. */
export { IDENTITY_TRANSFORM, translation };

/** The building operation catalogue advisory (open wire, closed Phase 1). */
export { BUILDING_OPERATION_TYPES };
