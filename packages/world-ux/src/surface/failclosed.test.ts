/**
 * WORLD-P4 — the spatial surface fail-closed drills: poisoned scenes,
 * mutating ghost overlays, provenance-poisoned commands (wiring note
 * #3) and structurally invalid compositions — every one a TYPED
 * refusal, never a guess.
 */

import { describe, expect, test } from "bun:test";
import {
  openReferenceWorldStation,
  composeStationScene,
  applyStationSelection,
} from "../index";
import { referenceWorldStationSources } from "../wiring/doubles";
import { FIXTURE_WORLD } from "@aise/world-layer1-experience";
import type { ComposedScene } from "@aise/world-reality-substrate";

const station = openReferenceWorldStation();
if (!station.ok) throw new Error(station.failure.detail);

/** The committed ghost overlay input (from the reference sources). */
const ghostOverlay = (() => {
  const sources = referenceWorldStationSources();
  const outcome = sources.ghostOverlay();
  if (!outcome.ok || outcome.value === null) {
    throw new Error("the fixture ghost overlay is unavailable");
  }
  return outcome.value;
})();

describe("the base-scene law (fail-closed)", () => {
  test("a structurally invalid base scene is refused with its violations named", () => {
    const broken: ComposedScene = {
      ...FIXTURE_WORLD.scene,
      nodes: [
        ...FIXTURE_WORLD.scene.nodes,
        {
          ...FIXTURE_WORLD.scene.nodes[0]!,
          elementId: FIXTURE_WORLD.scene.nodes[0]!.elementId,
        },
      ],
    };
    const composed = composeStationScene(broken, null);
    expect(composed.ok).toBe(false);
    if (composed.ok) return;
    expect(composed.failure.kind).toBe("contract-mismatch");
    expect(composed.failure.detail).toContain("duplicate elementId");
  });

  test("a base scene with an unresolved parent is refused", () => {
    const broken: ComposedScene = {
      ...FIXTURE_WORLD.scene,
      nodes: FIXTURE_WORLD.scene.nodes.map((node, index) =>
        index === 0 ? { ...node, parentId: "missing-parent" } : node,
      ),
    };
    const composed = composeStationScene(broken, null);
    expect(composed.ok).toBe(false);
    if (composed.ok) return;
    expect(composed.failure.detail).toContain("unresolved parentId");
  });
});

describe("the ghost-overlay law (captured reality is never mutated)", () => {
  test("a ghost scene that DROPS a base element is an operation-semantic refusal", () => {
    const dropping: ComposedScene = {
      ...ghostOverlay.ghostScene,
      nodes: ghostOverlay.ghostScene.nodes.slice(1),
    };
    const composed = composeStationScene(FIXTURE_WORLD.scene, {
      ghostScene: dropping,
      command: ghostOverlay.command,
    });
    expect(composed.ok).toBe(false);
    if (composed.ok) return;
    expect(composed.failure.kind).toBe("operation-semantic-failure");
    expect(composed.failure.detail).toContain("never a mutation of captured reality");
  });

  test("a ghost scene that flips a base element's ghost flag is refused", () => {
    const flipping: ComposedScene = {
      ...ghostOverlay.ghostScene,
      nodes: ghostOverlay.ghostScene.nodes.map((node) =>
        node.elementId === "plan-slab-001" ? { ...node, isGhost: !node.isGhost } : node,
      ),
    };
    const composed = composeStationScene(FIXTURE_WORLD.scene, {
      ghostScene: flipping,
      command: ghostOverlay.command,
    });
    expect(composed.ok).toBe(false);
    if (composed.ok) return;
    expect(composed.failure.detail).toContain("ghost flag");
  });

  test("a structurally invalid ghost scene is refused", () => {
    const firstNode = ghostOverlay.ghostScene.nodes[0]!;
    const broken: ComposedScene = {
      ...ghostOverlay.ghostScene,
      nodes: [...ghostOverlay.ghostScene.nodes, { ...firstNode }],
    };
    const composed = composeStationScene(FIXTURE_WORLD.scene, {
      ghostScene: broken,
      command: ghostOverlay.command,
    });
    expect(composed.ok).toBe(false);
    if (composed.ok) return;
    expect(composed.failure.kind).toBe("contract-mismatch");
  });
});

describe("the provenance guard (wiring note #3 — fail-closed)", () => {
  test("missing_operation_provenance refuses the station composition", () => {
    const poisoned = {
      ...ghostOverlay.command,
      intent: {
        ...ghostOverlay.command.intent,
        provenance: {
          ...ghostOverlay.command.intent.provenance,
          evidenceIds: [],
          derivationNote: undefined,
          commandText: undefined,
        },
      },
    };
    const composed = composeStationScene(FIXTURE_WORLD.scene, {
      ghostScene: ghostOverlay.ghostScene,
      command: poisoned,
    });
    expect(composed.ok).toBe(false);
    if (composed.ok) return;
    expect(composed.failure.kind).toBe("operation-semantic-failure");
    expect(composed.failure.detail).toContain("missing_operation_provenance");
  });

  test("an empty-string derivation note does NOT satisfy the invariant (fail-closed)", () => {
    const poisoned = {
      ...ghostOverlay.command,
      intent: {
        ...ghostOverlay.command.intent,
        provenance: {
          ...ghostOverlay.command.intent.provenance,
          evidenceIds: [],
          derivationNote: "",
          commandText: undefined,
        },
      },
    };
    const composed = composeStationScene(FIXTURE_WORLD.scene, {
      ghostScene: ghostOverlay.ghostScene,
      command: poisoned,
    });
    expect(composed.ok).toBe(false);
    if (composed.ok) return;
    expect(composed.failure.detail).toContain("missing_operation_provenance");
  });

  test("the committed fixture command PASSES the guard (the honest positive)", () => {
    const composed = composeStationScene(FIXTURE_WORLD.scene, ghostOverlay);
    expect(composed.ok).toBe(true);
  });
});

describe("the removal-reference law", () => {
  test("a ghost summary removing an UNKNOWN element is refused", () => {
    const lying: ComposedScene = {
      ...ghostOverlay.ghostScene,
      ghostSummary: {
        operationId: ghostOverlay.command.operationId,
        proposedElementIds: ghostOverlay.ghostScene.ghostSummary?.proposedElementIds ?? [],
        removedElementIds: ["element-never-seen"],
      },
    };
    const composed = composeStationScene(FIXTURE_WORLD.scene, {
      ghostScene: lying,
      command: ghostOverlay.command,
    });
    expect(composed.ok).toBe(false);
    if (composed.ok) return;
    expect(composed.failure.detail).toContain("removals must reference base elements");
  });
});

describe("the quarantined selection (drill)", () => {
  test("a pick-shaped substrate id inside a selection is refused (not silently stripped)", () => {
    const selection = applyStationSelection(station.value.scene, [
      "plan-slab-001",
      "node:42",
    ]);
    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    expect(selection.failure.kind).toBe("contract-mismatch");
  });
});
