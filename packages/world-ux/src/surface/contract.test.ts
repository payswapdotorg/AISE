/**
 * WORLD-P4 — the spatial surface family tests: the station scene
 * composition (the ghost discipline, ghost-removed resolvability —
 * wiring note #5), the typed camera operations, the quarantined
 * selection/pick and the composed layer toggles.
 */

import { describe, expect, test } from "bun:test";
import {
  openReferenceWorldStation,
  resolveStationElement,
  pickStationElement,
  applyStationSelection,
  applyStationCameraOperation,
  applyStationLayerToggles,
  composeStationScene,
  STATION_ELEMENT_STATUSES,
  isStationElementStatus,
  STATION_CAMERA_OPERATIONS,
  isStationCameraOperationKind,
} from "../index";
import { FIXTURE_WORLD, FIXTURE_WORLD_REVISION_2 } from "@aise/world-layer1-experience";

const station = openReferenceWorldStation();
if (!station.ok) throw new Error(station.failure.detail);
const MODEL = station.value.scene;

describe("the station scene composition", () => {
  test("the committed scenario composes: base world + ghost overlay + status index", () => {
    expect(MODEL.baseScene.nodes.length).toBe(FIXTURE_WORLD.scene.nodes.length);
    expect(MODEL.ghostSummary).not.toBe(null);
    expect(MODEL.ghostSummary!.proposedElementIds.length).toBeGreaterThan(0);
    expect(MODEL.ghostSummary!.removedElementIds).toContain("plan-wall-001");
    /* The status index covers base elements + the ghost addition. */
    expect(MODEL.elementStatus.length).toBe(
      MODEL.baseScene.nodes.length + MODEL.ghostSummary!.proposedElementIds.length,
    );
  });

  test("every status comes from the closed vocabulary", () => {
    expect(STATION_ELEMENT_STATUSES).toEqual([
      "captured",
      "plan",
      "capture-asset",
      "annotation",
      "proposed-ghost",
      "proposed-removed",
    ]);
    for (const entry of MODEL.elementStatus) {
      expect(isStationElementStatus(entry.status)).toBe(true);
    }
    expect(isStationElementStatus("proposed")).toBe(false);
  });

  test("a ghost overlay composes over any revision of the fixture world", () => {
    const composed = composeStationScene(FIXTURE_WORLD_REVISION_2.scene, null);
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    expect(composed.value.stationRevision).toBe(FIXTURE_WORLD_REVISION_2.scene.revision);
    expect(composed.value.ghostSummary).toBe(null);
    expect(composed.value.activeCommand).toBe(null);
  });
});

describe("ghost-removed resolvability (the P3 wiring note #5)", () => {
  test("a ghost-REMOVED element id stays RESOLVABLE with its captured node intact", () => {
    const removedId = MODEL.ghostSummary!.removedElementIds[0]!;
    const resolution = resolveStationElement(MODEL, removedId);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.value.status).toBe("proposed-removed");
    expect(resolution.value.node).not.toBe(null);
    /* The captured node is intact — the runtime overlay owns the
     * VISUAL removal; identity never dangles. */
    expect(resolution.value.node!.elementId).toBe(removedId);
    expect(resolution.value.node!.isGhost).toBe(false);
  });

  test("the ghost PROPOSED element resolves with its ghost node (ghost-distinctness)", () => {
    const ghostId = MODEL.ghostSummary!.proposedElementIds[0]!;
    const resolution = resolveStationElement(MODEL, ghostId);
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.value.status).toBe("proposed-ghost");
    expect(resolution.value.isGhost).toBe(true);
  });

  test("an unknown element id is a typed refusal (never a guess)", () => {
    const resolution = resolveStationElement(MODEL, "element-that-does-not-exist");
    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.failure.kind).toBe("unsupported-data");
    expect(resolution.failure.family).toBe("surface");
  });

  test("an empty id is a contract-mismatch refusal", () => {
    const resolution = resolveStationElement(MODEL, "");
    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.failure.kind).toBe("contract-mismatch");
  });
});

describe("identity quarantine (law #7)", () => {
  test("a substrate-shaped pick id is refused (never canonical identity)", () => {
    const pick = pickStationElement(MODEL, { elementId: "/UsdPrim/Wall_001" });
    expect(pick.ok).toBe(false);
    if (pick.ok) return;
    expect(pick.failure.kind).toBe("contract-mismatch");
    expect(pick.failure.detail).toContain("identity quarantine");
  });

  test("a substrate-shaped selection id is refused", () => {
    const selection = applyStationSelection(MODEL, ["node:42"]);
    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    expect(selection.failure.detail).toContain("canonical AISE identity only");
  });

  test("a canonical pick resolves with structurally-derived HUD concerns", () => {
    const removedId = MODEL.ghostSummary!.removedElementIds[0]!;
    const pick = pickStationElement(MODEL, { elementId: removedId });
    expect(pick.ok).toBe(true);
    if (!pick.ok) return;
    expect(pick.value.status).toBe("proposed-removed");
    expect(pick.value.concernsPanels).toContain("objective");
    /* A proposed-ghost pick concerns validation + cost/BOQ. */
    const ghostId = MODEL.ghostSummary!.proposedElementIds[0]!;
    const ghostPick = pickStationElement(MODEL, { elementId: ghostId });
    expect(ghostPick.ok).toBe(true);
    if (ghostPick.ok) {
      expect(ghostPick.value.concernsPanels).toContain("validation");
      expect(ghostPick.value.concernsPanels).toContain("cost-boq");
    }
  });
});

describe("the typed selection", () => {
  test("a canonical multi-selection resolves, deduplicates and carries no hover", () => {
    const removedId = MODEL.ghostSummary!.removedElementIds[0]!;
    const selection = applyStationSelection(MODEL, [removedId, removedId, "plan-slab-001"]);
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.value.selectedElementIds).toEqual([removedId, "plan-slab-001"]);
    expect(selection.value.hoveredElementId).toBe(null);
  });

  test("a selection with an unknown id is a typed refusal", () => {
    const selection = applyStationSelection(MODEL, ["nope-001"]);
    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    expect(selection.failure.family).toBe("surface");
  });
});

describe("the typed camera operations (walk/orbit/fly)", () => {
  test("the closed operation vocabulary", () => {
    expect(STATION_CAMERA_OPERATIONS).toEqual(["orbit-to", "walk-to", "fly-through"]);
    expect(isStationCameraOperationKind("orbit-to")).toBe(true);
    expect(isStationCameraOperationKind("teleport")).toBe(false);
  });

  test("orbit-to sets the orbit mode and preserves the up vector", () => {
    const camera = station.value.initialCamera;
    const next = applyStationCameraOperation(camera, {
      operation: "orbit-to",
      position: [10, 0, 5],
      target: [0, 0, 0],
      fovRadians: null,
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.value.mode).toBe("orbit");
    expect(next.value.up).toEqual(camera.up);
    expect(next.value.fovRadians).toBe(camera.fovRadians);
  });

  test("walk-to/fly-through set their modes; an explicit fov is carried", () => {
    const camera = station.value.initialCamera;
    const walk = applyStationCameraOperation(camera, {
      operation: "walk-to",
      position: [1, 1, 1.7],
      target: [2, 2, 1.7],
      fovRadians: 1.2,
    });
    expect(walk.ok && walk.value.mode).toBe("walk");
    expect(walk.ok && walk.value.fovRadians).toBe(1.2);
    const fly = applyStationCameraOperation(camera, {
      operation: "fly-through",
      position: [0, -10, 8],
      target: [0, 0, 1],
      fovRadians: null,
    });
    expect(fly.ok && fly.value.mode).toBe("fly");
  });

  test("non-finite positions and non-positive fovs are refused", () => {
    const camera = station.value.initialCamera;
    const badPosition = applyStationCameraOperation(camera, {
      operation: "orbit-to",
      position: [Number.NaN, 0, 0],
      target: [0, 0, 0],
      fovRadians: null,
    });
    expect(badPosition.ok).toBe(false);
    const badFov = applyStationCameraOperation(camera, {
      operation: "orbit-to",
      position: [1, 1, 1],
      target: [0, 0, 0],
      fovRadians: 0,
    });
    expect(badFov.ok).toBe(false);
    if (badFov.ok) return;
    expect(badFov.failure.detail).toContain("positive finite radian");
  });
});

describe("the composed layer toggles (the P1 navigate vocabulary)", () => {
  test("toggling a fixture layer hides its elements (AND semantics)", () => {
    const view = applyStationLayerToggles(FIXTURE_WORLD, [
      { layerId: "plan-model", visible: false },
    ]);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const visibilityByElement = new Map(
      view.value.elementVisibility.map((entry) => [entry.elementId, entry.visible]),
    );
    /* Every plan-model element is hidden... */
    for (const node of FIXTURE_WORLD.scene.nodes.filter((n) =>
      n.layerIds.includes("plan-model"),
    )) {
      expect(visibilityByElement.get(node.elementId)).toBe(false);
    }
    /* ...and every capture-reality element stays visible. */
    for (const node of FIXTURE_WORLD.scene.nodes.filter((n) =>
      n.layerIds.includes("capture-reality"),
    )) {
      expect(visibilityByElement.get(node.elementId)).toBe(true);
    }
  });

  test("the P1 refusal shape is carried through in the UNIFIED family form (law #4)", () => {
    const view = applyStationLayerToggles(FIXTURE_WORLD, [
      { layerId: "layer-that-does-not-exist", visible: false },
    ]);
    expect(view.ok).toBe(false);
    if (view.ok) return;
    expect(view.failure.family).toBe("surface");
    expect(view.failure.detail).toContain("layer toggle refused by layer1.");
  });
});
