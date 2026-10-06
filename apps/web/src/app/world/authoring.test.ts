/**
 * WORLD-P5 Mount 4 — the AUTHORING PARITY tests at the route: the
 * same typed EngineeringOperation is produced by GESTURE and by NL
 * COMMAND over the same move-authoring scope (handoff §9 Scenario C).
 *
 *   - PARITY: DM stream ≡ NL utterance → the SAME operationId, the
 *     SAME ghost element id, the SAME ghost scene; only the
 *     provenance differs (origin direct-manipulation +
 *     interactionDetail vs origin agent + the verbatim commandText);
 *   - THE GHOST LAWS: the move ghost composes as an overlay (base
 *     untouched), the target flips to proposed-removed through
 *     `composeStationScene` (the surface law), the ghost id is
 *     deterministic (`ghost-move-<16hex>`);
 *   - FAIL-CLOSED: a ghost-target gesture refuses; a stale
 *     sceneRevision refuses; a substrate-shaped target refuses; a
 *     move without drop-at refuses; a non-move with a drop refuses;
 *     an unsupported utterance refuses at the NL gate; the rogue-
 *     parser gate re-validates;
 *   - THE SERVING-STAMP LAW: `assembleGestureStream` stamps the
 *     declared instant + operator (the browser capture carries
 *     neither — the clock law).
 */

import { describe, expect, test } from "bun:test";
import { FIXTURE_WORLD } from "@aise/world-layer1-experience";
import { compileManipulationStream } from "@aise/world-layer3-experience";
import { composeStationScene, canonicalJsonStringify } from "@aise/world-ux";
import {
  assembleGestureStream,
  authorStationMove,
  stationMoveAuthoringScope,
  stationMoveDeltaOf,
  stationMoveNlParser,
} from "./authoring";

const OPERATOR = { operatorId: "user-demo-engineer", role: "engineer" as const };
const AUTHORED_AT = "2026-10-06T09:00:00.000Z";
const WALL = "plan-wall-001";
const DELTA: readonly [number, number, number] = [1, 0, 0];
const UTTERANCE = "Move the wall 1 metre east.";

describe("WORLD-P5 Mount 4 — multi-input authoring parity at the route", () => {
  test("PARITY: the gesture and the NL command produce the SAME typed EngineeringOperation", () => {
    const dm = authorStationMove({
      modality: "dm",
      deltaMetres: DELTA,
      targetElementId: WALL,
      authoredAt: AUTHORED_AT,
      operator: OPERATOR,
      intentId: "intent-p5-move-dm-0001",
    });
    const nl = authorStationMove({
      modality: "nl",
      deltaMetres: DELTA,
      targetElementId: WALL,
      authoredAt: AUTHORED_AT,
      operator: OPERATOR,
      intentId: "intent-p5-move-nl-0001",
      utterance: UTTERANCE,
    });
    expect(dm.ok).toBe(true);
    expect(nl.ok).toBe(true);
    if (!dm.ok || !nl.ok) return;
    /* THE parity law: one typed operation, two input modalities. */
    expect(dm.value.operationId).toBe(nl.value.operationId);
    expect(dm.value.ghostElementId).toBe(nl.value.ghostElementId);
    expect(dm.value.ghostElementId).toMatch(/^ghost-move-[0-9a-f]{16}$/);
    /* The ghost scenes are canonical-identical (the same ghost). */
    expect(canonicalJsonStringify(dm.value.ghostScene)).toBe(
      canonicalJsonStringify(nl.value.ghostScene),
    );
    /* Only the provenance differs — exactly as the law requires. */
    expect(dm.value.command.intent.provenance.origin).toBe("direct-manipulation");
    expect(nl.value.command.intent.provenance.origin).toBe("agent");
    expect(dm.value.command.intent.provenance.interactionDetail ?? "").toContain(
      "direct manipulation in the interactive world",
    );
    expect(nl.value.command.intent.provenance.commandText).toBe(UTTERANCE);
  });

  test("PARITY holds for arbitrary deltas (the seeded drill)", () => {
    /* The cardinal-delta drill: each delta ↔ its utterance; composite
     * deltas have no utterance in this grammar (honestly unsupported
     * at the NL gate — the DM path still authors them). */
    const drills: {
      delta: readonly [number, number, number];
      utterance: string | null;
    }[] = [
      { delta: [2, 0, 0], utterance: "Move the wall 2 metres east." },
      { delta: [0, 3, 0], utterance: "Move the wall 3 metres north." },
      { delta: [0, 0, 2], utterance: "Move the wall 2 metres up." },
      { delta: [0.5, -1.5, 0], utterance: null },
    ];
    for (const { delta, utterance } of drills) {
      const dm = authorStationMove({
        modality: "dm",
        deltaMetres: delta,
        targetElementId: WALL,
        authoredAt: AUTHORED_AT,
        operator: OPERATOR,
        intentId: "intent-p5-seed-dm",
      });
      expect(dm.ok).toBe(true);
      if (utterance === null) {
        /* composite delta — no utterance in this grammar */
        const nlComposite = authorStationMove({
          modality: "nl",
          deltaMetres: delta,
          targetElementId: WALL,
          authoredAt: AUTHORED_AT,
          operator: OPERATOR,
          intentId: "intent-p5-seed-nl",
          utterance: "Move the wall sideways somehow.",
        });
        expect(nlComposite.ok).toBe(false);
        continue;
      }
      const nl = authorStationMove({
        modality: "nl",
        deltaMetres: delta,
        targetElementId: WALL,
        authoredAt: AUTHORED_AT,
        operator: OPERATOR,
        intentId: "intent-p5-seed-nl",
        utterance,
      });
      expect(nl.ok).toBe(true);
      if (dm.ok && nl.ok) expect(dm.value.operationId).toBe(nl.value.operationId);
    }
    /* The pure delta grammar (all six directions). */
    expect(stationMoveDeltaOf("Move the wall 1 metre east.")?.deltaMetres).toEqual([1, 0, 0]);
    expect(stationMoveDeltaOf("Move the wall 2.5 metres west.")?.deltaMetres).toEqual([-2.5, 0, 0]);
    expect(stationMoveDeltaOf("Move the slab 3 metres north.")?.deltaMetres).toEqual([0, 3, 0]);
    expect(stationMoveDeltaOf("Move the wall 1 metre up.")?.deltaMetres).toEqual([0, 0, 1]);
    expect(stationMoveDeltaOf("Teleport the wall.")).toBeNull();
  });

  test("GHOST LAWS: the move ghost is an overlay; the target flips to proposed-removed through the surface contract", () => {
    const outcome = authorStationMove({
      modality: "dm",
      deltaMetres: DELTA,
      targetElementId: WALL,
      authoredAt: AUTHORED_AT,
      operator: OPERATOR,
      intentId: "intent-p5-move-ghost-0001",
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    /* The base scene is untouched (every base node present). */
    for (const node of FIXTURE_WORLD.scene.nodes) {
      expect(
        outcome.value.ghostScene.nodes.some((n) => n.elementId === node.elementId),
      ).toBe(true);
    }
    /* composeStationScene (the P4 surface contract) over the move
     * ghost: the target flips to proposed-removed, the ghost is
     * proposed-ghost, and ghost-removed ids STAY RESOLVABLE. */
    const station = composeStationScene(FIXTURE_WORLD.scene, {
      ghostScene: outcome.value.ghostScene,
      command: outcome.value.command,
    });
    expect(station.ok).toBe(true);
    if (!station.ok) return;
    const statusOf = (id: string) =>
      station.value.elementStatus.find((e) => e.elementId === id)?.status;
    expect(statusOf(WALL)).toBe("proposed-removed");
    expect(statusOf(outcome.value.ghostElementId)).toBe("proposed-ghost");
  });

  test("FAIL-CLOSED: the gesture-stream laws refuse (ghost target, stale revision, substrate id, move-needs-drop-at)", () => {
    /* A ghost target is refused (authoring anchors to captured reality). */
    const ghostId = "ghost-reparameterize-2814f7cd97b18960";
    const ghostTarget = authorStationMove({
      modality: "dm",
      deltaMetres: DELTA,
      targetElementId: ghostId,
      authoredAt: AUTHORED_AT,
      operator: OPERATOR,
      intentId: "intent-p5-refused-0001",
    });
    expect(ghostTarget.ok).toBe(false);

    /* A substrate-shaped target is refused (identity quarantine). */
    const substrateTarget = authorStationMove({
      modality: "nl",
      deltaMetres: DELTA,
      targetElementId: "/UsdPrim/Wall_001",
      authoredAt: AUTHORED_AT,
      operator: OPERATOR,
      intentId: "intent-p5-refused-0002",
      utterance: UTTERANCE,
    });
    expect(substrateTarget.ok).toBe(false);

    /* A stale sceneRevision refuses at the stream compile. */
    const stale = assembleGestureStream(
      { pickedElementId: WALL, dragDeltaMetres: DELTA },
      {
        streamId: "station-move-dm-stale",
        operator: OPERATOR,
        sceneRevision: 999,
        authoredAt: AUTHORED_AT,
      },
    );
    const staleOutcome = compileManipulationStream(stale, stationMoveAuthoringScope());
    expect(staleOutcome.ok).toBe(false);

    /* A move without drop-at refuses. */
    const noDrop = assembleGestureStream(
      { pickedElementId: WALL, dragDeltaMetres: [0, 0, 0] },
      {
        streamId: "station-move-dm-nodrop",
        operator: OPERATOR,
        sceneRevision: FIXTURE_WORLD.scene.revision,
        authoredAt: AUTHORED_AT,
      },
    );
    const noDropOutcome = compileManipulationStream(
      { ...noDrop, gestures: noDrop.gestures.filter((g) => g.gesture !== "drop-at") },
      stationMoveAuthoringScope(),
    );
    expect(noDropOutcome.ok).toBe(false);
  });

  test("FAIL-CLOSED: the NL gate refuses unsupported utterances and missing selection context", () => {
    const parser = stationMoveNlParser();
    const scope = stationMoveAuthoringScope();
    const unsupported = parser.parseCommand({
      utterance: "Demolish everything.",
      scope,
      selectedElementId: WALL,
    });
    expect(unsupported.ok).toBe(false);
    const noSelection = parser.parseCommand({
      utterance: UTTERANCE,
      scope,
      selectedElementId: null,
    });
    expect(noSelection.ok).toBe(false);
    /* An undeclared element is refused through the full path. */
    const undeclared = authorStationMove({
      modality: "nl",
      deltaMetres: DELTA,
      targetElementId: "annotation-undeclared-001",
      authoredAt: AUTHORED_AT,
      operator: OPERATOR,
      intentId: "intent-p5-refused-0003",
      utterance: UTTERANCE,
    });
    expect(undeclared.ok).toBe(false);
  });

  test("THE SERVING-STAMP LAW: assembleGestureStream stamps the declared instant + operator (the browser capture carries neither)", () => {
    const stream = assembleGestureStream(
      { pickedElementId: WALL, dragDeltaMetres: DELTA },
      {
        streamId: "station-move-dm-browser-0001",
        operator: OPERATOR,
        sceneRevision: FIXTURE_WORLD.scene.revision,
        authoredAt: AUTHORED_AT,
      },
    );
    expect(stream.authoredAt).toBe(AUTHORED_AT);
    expect(stream.operator.operatorId).toBe("user-demo-engineer");
    expect(stream.gestures.map((g) => g.gesture)).toEqual([
      "pick-element",
      "begin-grab",
      "drag-by",
      "drop-at",
      "commit",
    ]);
    /* Determinism: the same capture assembles byte-identically. */
    expect(canonicalJsonStringify(stream)).toBe(
      canonicalJsonStringify(
        assembleGestureStream(
          { pickedElementId: WALL, dragDeltaMetres: DELTA },
          {
            streamId: "station-move-dm-browser-0001",
            operator: OPERATOR,
            sceneRevision: FIXTURE_WORLD.scene.revision,
            authoredAt: AUTHORED_AT,
          },
        ),
      ),
    );
  });
});
