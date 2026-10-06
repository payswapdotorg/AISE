/**
 * WORLD-P5 Mount 4 — MULTI-INPUT AUTHORING AT THE ROUTE: the DM
 * authoring surface (grab/move gestures against the real scene)
 * composing the P3 `world-layer3-experience` authoring contracts
 * through the P5 mount — the SAME typed EngineeringOperation is
 * produced by gesture and by NL command (handoff §9 Scenario C).
 *
 * THE COMPOSITION (the wiring double's stationAuthoringScope pattern,
 * extended MOVE-capable):
 *   - the SCOPE declares move-capable element descriptors (the plan
 *     wall + the plan slab, face-set selection modes) and a palette
 *     entry for `block-wall-placement` (the station's own rebuild
 *     operation — moving the wall is repositioning the placement);
 *   - the GESTURE path: a DirectManipulationStream (pick → begin-grab
 *     → drag-by → drop-at → commit move) compiled through the REAL
 *     lane compiler (`compileManipulationStream` →
 *     `compileAuthoringCommand`) — provenance origin
 *     `direct-manipulation` + the synthesized interactionDetail;
 *   - the NL path: a route-owned occupant of the P0/P3
 *     `authoring.nl-command/1` port with a deterministic move grammar
 *     (deictic target from the selection context — the lane law),
 *     compiled through the same compiler — provenance origin `agent`
 *     + the verbatim commandText;
 *   - BOTH produce the SAME `operationId` (the solution-contract
 *     identity excludes provenance) and the SAME ghost element id;
 *     the move delta reaches the ghost through the caller-declared
 *     ghost transform (the P3 law — the typed intent parameters do
 *     not carry the delta; recorded in the evidence).
 *
 * THE BROWSER GESTURE CAPTURE (browser-gpu-mount.tsx) collects the
 * typed gesture sequence from REAL viewport picks (pointerdown pick →
 * pointerup pick → the xy site-frame delta between the two hit
 * points). The declared `authoredAt` instant and the operator identity
 * are stamped by the SERVING compile (`assembleGestureStream`) — the
 * browser never reads a clock (the lane's law #9).
 */

import type { ComposedScene } from "@aise/world-reality-substrate";
import { REFERENCE_BUILDING_DOMAIN } from "@aise/solution-contract";
import { FIXTURE_WORLD } from "@aise/world-layer1-experience";
import {
  compileManipulationStream,
  compileAuthoringCommand,
  composeGhostScene,
  parseNlCommandThroughPort,
  type AuthoredCommand,
  type AuthoringCommandDraft,
  type AuthoringScope,
  type DirectManipulationStream,
  type ManipulationGesture,
  type NlCommandParserAdapter,
} from "@aise/world-layer3-experience";

/* ------------------------------------------------------------------ */
/* The move-authoring scope (route-declared, over the station world)    */
/* ------------------------------------------------------------------ */

const STATION_SOLUTION_ID = "solution-demo-001";
const STATION_SOLUTION_VERSION = 1;
const MOVE_OPERATION_TYPE = "block-wall-placement";

/** The station's move-capable authoring scope (the P3 lane shape). */
export function stationMoveAuthoringScope(): AuthoringScope {
  return {
    solutionId: STATION_SOLUTION_ID,
    versionNumber: STATION_SOLUTION_VERSION,
    worldScene: FIXTURE_WORLD.scene as ComposedScene,
    elementDescriptors: [
      {
        elementId: "plan-wall-001",
        selectionModes: [
          {
            selectorKind: "face-set" as const,
            geometryRefs: [{ kind: "polygon" as const, ref: "geo-wall-faces-002" }],
            units: { linear: "m", angular: "rad" },
            description: "The wall's finish faces",
          },
        ],
      },
      {
        elementId: "plan-slab-001",
        selectionModes: [
          {
            selectorKind: "face-set" as const,
            geometryRefs: [{ kind: "polygon" as const, ref: "geo-slab-faces-001" }],
            units: { linear: "m", angular: "rad" },
            description: "The slab's top face",
          },
        ],
      },
    ],
    operationPalette: [
      {
        operationType: MOVE_OPERATION_TYPE,
        targetSelectorKind: "face-set" as const,
        defaultParameters: [
          { name: "length", value: 5, unit: "m" },
          { name: "height", value: 1, unit: "m" },
          { name: "thickness", value: 0.1, unit: "m" },
          { name: "material", value: "concrete-block" },
        ],
      },
    ],
    domain: REFERENCE_BUILDING_DOMAIN,
  };
}

/* ------------------------------------------------------------------ */
/* The NL move grammar (a route-owned occupant of the nl-command port)  */
/* ------------------------------------------------------------------ */

/** The pure utterance→delta extraction (the ghost-transform source). */
export function stationMoveDeltaOf(
  utterance: string,
): { deltaMetres: readonly [number, number, number] } | null {
  const match =
    /^move (?:the |this )?[a-z-]+ (\d+(?:\.\d+)?) metres? (east|west|north|south|up|down)\.$/i.exec(
      utterance.trim(),
    );
  if (match === null) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const direction = (match[2] ?? "").toLowerCase();
  const byDirection: Record<string, readonly [number, number, number]> = {
    east: [amount, 0, 0],
    west: [-amount, 0, 0],
    north: [0, amount, 0],
    south: [0, -amount, 0],
    up: [0, 0, amount],
    down: [0, 0, -amount],
  };
  const delta = byDirection[direction];
  return delta === undefined ? null : { deltaMetres: delta };
}

/**
 * The route's NL parser double: a deterministic move-grammar occupant
 * of the `authoring.nl-command/1` port (the parser is SUBSTRATE — the
 * rogue-parser gate at `parseNlCommandThroughPort` re-validates every
 * draft fail-closed).
 */
export function stationMoveNlParser(): NlCommandParserAdapter {
  return {
    portId: "authoring.nl-command/1",
    capabilities: {
      supportedGrammarFamilies: ["station-move-command"],
      maxUtteranceLength: 200,
      blocked: [
        {
          capability: "deictic-target-resolution",
          reason:
            "the target comes only from the selection context — the P3 lane law (never a guessed element)",
        },
      ],
    },
    parseCommand(request) {
      const delta = stationMoveDeltaOf(request.utterance);
      if (delta === null) {
        return {
          ok: false,
          failure: {
            kind: "unsupported-data" as const,
            family: "authoring" as const,
            detail: `unsupported utterance (the station move grammar): ${request.utterance}`,
          },
        };
      }
      if (request.selectedElementId === null) {
        return {
          ok: false,
          failure: {
            kind: "operation-semantic-failure" as const,
            family: "authoring" as const,
            detail:
              "no selection context — the move grammar is deictic (select the element first)",
          },
        };
      }
      return {
        ok: true,
        value: {
          kind: "spatial-authoring-command" as const,
          schemaVersion: "spatial-authoring-command/1" as const,
          commandKind: "move" as const,
          operationType: MOVE_OPERATION_TYPE,
          targetElementId: request.selectedElementId,
          parameterOverrides: [],
          dependsOn: [],
        },
      };
    },
  };
}

/* ------------------------------------------------------------------ */
/* The gesture path (typed stream assembly — the serving side stamps)   */
/* ------------------------------------------------------------------ */

/** The browser capture (real viewport picks — no clock, no operator). */
export interface CapturedGestureSequence {
  readonly pickedElementId: string;
  readonly dragDeltaMetres: readonly [number, number, number];
}

/**
 * Assemble the typed DirectManipulationStream from a browser capture —
 * THE SERVING ENTRY: the declared instant + operator identity are
 * stamped here (the browser never reads a clock; lane law #9).
 */
export function assembleGestureStream(
  captured: CapturedGestureSequence,
  context: {
    readonly streamId: string;
    readonly operator: { readonly operatorId: string; readonly role: "engineer" };
    readonly sceneRevision: number;
    readonly authoredAt: string;
  },
): DirectManipulationStream {
  const gestures: ManipulationGesture[] = [
    { gesture: "pick-element", elementId: captured.pickedElementId },
    { gesture: "begin-grab", elementId: captured.pickedElementId },
    { gesture: "drag-by", deltaMetres: captured.dragDeltaMetres },
    { gesture: "drop-at", deltaMetres: captured.dragDeltaMetres },
    { gesture: "commit", commandKind: "move", operationType: MOVE_OPERATION_TYPE },
  ];
  return {
    streamId: context.streamId,
    operator: context.operator,
    sceneRevision: context.sceneRevision,
    gestures,
    authoredAt: context.authoredAt,
  };
}

/* ------------------------------------------------------------------ */
/* The parity entry (the same typed operation from both modalities)     */
/* ------------------------------------------------------------------ */

export interface StationMoveAuthoringOutcome {
  readonly modality: "direct-manipulation" | "agent";
  readonly command: AuthoredCommand;
  readonly ghostScene: ComposedScene;
  readonly operationId: string;
  readonly ghostElementId: string;
  readonly ghostTransform: readonly [number, number, number];
}

export type StationMoveAuthoringRefusal =
  | { ok: false; readonly detail: string }
  | { ok: true; readonly value: StationMoveAuthoringOutcome };

/** The ghost options for a move (the caller-declared transform law). */
function moveGhostOptions(delta: readonly [number, number, number], targetId: string) {
  return {
    transform: delta,
    geometry: {
      assetId: `asset-station-move-ghost-${targetId}`,
      partId: "part-001",
      format: "gltf-json" as const,
    },
    label: `PROPOSED — ${targetId} moved ${String(delta[0])}, ${String(delta[1])}, ${String(delta[2])} m`,
  };
}

/**
 * Author the station move ONE way — DM (the assembled gesture stream)
 * or NL (the utterance through the port) — over the SAME scope, and
 * derive the ghost scene. Both modalities over the same delta produce
 * the SAME typed operation (the parity law, pinned by the tests).
 */
export function authorStationMove(input: {
  readonly modality: "dm" | "nl";
  readonly deltaMetres: readonly [number, number, number];
  readonly targetElementId: string;
  readonly authoredAt: string;
  readonly operator: { readonly operatorId: string; readonly role: "engineer" };
  readonly intentId: string;
  readonly utterance?: string;
}): StationMoveAuthoringRefusal {
  const scope = stationMoveAuthoringScope();

  let draft: AuthoringCommandDraft;
  let provenance:
    | { interactionDetail: string }
    | { commandText: string };

  if (input.modality === "dm") {
    const stream = assembleGestureStream(
      { pickedElementId: input.targetElementId, dragDeltaMetres: input.deltaMetres },
      {
        streamId: `station-move-dm-${input.intentId}`,
        operator: input.operator,
        sceneRevision: (scope.worldScene as ComposedScene).revision,
        authoredAt: input.authoredAt,
      },
    );
    const compiled = compileManipulationStream(stream, scope);
    if (!compiled.ok) return { ok: false, detail: compiled.failure.detail };
    draft = compiled.value.draft;
    provenance = { interactionDetail: compiled.value.interactionDetail };
  } else {
    if (input.utterance === undefined) {
      return { ok: false, detail: "the NL modality requires the utterance" };
    }
    const parsed = parseNlCommandThroughPort(stationMoveNlParser(), {
      utterance: input.utterance,
      scope,
      selectedElementId: input.targetElementId,
    });
    if (!parsed.ok) return { ok: false, detail: parsed.failure.detail };
    draft = parsed.value;
    provenance = { commandText: input.utterance };
  }

  const commandOutcome = compileAuthoringCommand(
    draft,
    scope,
    {
      operator: input.operator,
      authoredAt: input.authoredAt,
      ...(provenance as { interactionDetail?: string; commandText?: string }),
    },
    input.intentId,
  );
  if (!commandOutcome.ok) return { ok: false, detail: commandOutcome.failure.detail };
  const command = commandOutcome.value;

  const ghostScene = composeGhostScene(
    scope.worldScene as ComposedScene,
    command,
    moveGhostOptions(input.deltaMetres, input.targetElementId),
  );
  if (!ghostScene.ok) return { ok: false, detail: ghostScene.failure.detail };

  return {
    ok: true,
    value: {
      modality: command.modality,
      command,
      ghostScene: ghostScene.value,
      operationId: command.operationId,
      ghostElementId: ghostScene.value.nodes.find((n) => n.isGhost)?.elementId ?? "",
      ghostTransform: input.deltaMetres,
    },
  };
}
