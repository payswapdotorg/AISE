/**
 * WORLD-P1 tests — the WORLD family: RECONSTRUCT → NAVIGATE
 * (`src/world/`).
 *
 * Proves the navigable-reconstruction-world contract works WITHOUT any
 * scene runtime (no Babylon, no WebGL): the composed world IS the P0-A
 * scene-composition value (structurally valid by the P0-A validator);
 * layer toggling is the typed visibility predicate; bookmarks are
 * typed world states with content-addressed identity and
 * revision-checked resolution; the identity-quarantine and
 * ghost-distinctness laws carry through every stage.
 */

import { describe, expect, test } from "bun:test";
import {
  applyLayerToggles,
  bookmarkDigestOf,
  captureNavigationBookmark,
  resolveElementVisibility,
  resolveLayerVisibility,
  resolveNavigationBookmark,
} from "./navigate";
import { captureElementIdOf, composeReconstructionWorld } from "./reconstruct";
import type { WorldCompositionRequest } from "./contract";
import { WORLD_PRESET_LAYERS } from "./contract";
import {
  FIXTURE_FRAGMENT,
  FIXTURE_PLAN_MODEL,
  FIXTURE_REGISTERED_FRAGMENT,
  FIXTURE_SITE_FRAME,
  FIXTURE_STILL_001_CONTENT_ID,
  FIXTURE_WALL_IFC_GUID,
  FIXTURE_WORLD,
  FIXTURE_WORLD_REVISION_2,
  FIXTURE_WORLD_REQUEST,
  FIXTURE_BOOKMARKED_AT,
} from "../fixtures";
import { validateScene } from "@aise/world-reality-substrate";
import type { NavigableWorld } from "./contract";

/* ------------------------------------------------------------------ */
/* RECONSTRUCT — the committed fixture                                  */
/* ------------------------------------------------------------------ */

describe("reconstruct — the committed fixture", () => {
  test("the world composes: 3 capture + 2 plan + 1 coverage node, structurally valid", () => {
    const world = FIXTURE_WORLD;
    expect(world.scene.nodes).toHaveLength(6);
    expect(world.scene.nodes.filter((n) => n.kind === "capture_cloud")).toHaveLength(3);
    expect(world.scene.nodes.filter((n) => n.kind === "plan_model")).toHaveLength(2);
    expect(world.scene.nodes.filter((n) => n.kind === "annotation")).toHaveLength(1);
    expect(validateScene(world.scene)).toEqual([]);
    expect(world.worldId).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the scene IS the P0-A ComposedScene shape (substrate-neutral composition types)", () => {
    const world = FIXTURE_WORLD;
    expect(world.scene.revision).toBe(1);
    expect(world.scene.layers).toEqual(WORLD_PRESET_LAYERS);
    expect(world.scene.ghostSummary).toBeNull(); // Layer-1 carries NO ghost set (the law)
    expect(world.scene.siteFrame).toEqual(FIXTURE_SITE_FRAME);
  });

  test("capture element ids are AISE content digests, NEVER asset content ids (identity separation)", () => {
    const expected = captureElementIdOf(
      FIXTURE_REGISTERED_FRAGMENT.fragmentId,
      FIXTURE_STILL_001_CONTENT_ID,
    );
    const record = FIXTURE_WORLD.elementProvenance.find((r) => r.origin === "capture")!;
    expect(record.elementId).toBe(expected);
    expect(record.elementId).not.toBe(FIXTURE_STILL_001_CONTENT_ID);
    expect(record.evidenceContentIds).toEqual([FIXTURE_STILL_001_CONTENT_ID]);
  });

  test("IFC GUIDs ride as namespaced external labels, never as identity", () => {
    const wallRecord = FIXTURE_WORLD.elementProvenance.find(
      (r) => r.elementId === "plan-wall-001",
    )!;
    expect(wallRecord.externalLabels).toEqual([
      { namespace: "ifc-guid", value: FIXTURE_WALL_IFC_GUID },
    ]);
    expect(wallRecord.elementId).not.toBe(FIXTURE_WALL_IFC_GUID);
  });

  test("the coverage node carries the union bounds and the derived provenance", () => {
    const coverageRecord = FIXTURE_WORLD.elementProvenance.find((r) => r.origin === "derived")!;
    expect(coverageRecord.declaredVolume).toEqual({ min: [-4, -4, 0], max: [14, 12, 6] });
    expect(FIXTURE_WORLD.coverage!.coveredBounds).toEqual({ min: [-4, -4, 0], max: [14, 12, 6] });
  });

  test("the world derivation binds the method identity and every input evidence id", () => {
    expect(FIXTURE_WORLD.derivation.method).toBe("reconstruction.world-compose");
    expect(FIXTURE_WORLD.derivation.inputEvidenceContentIds).toHaveLength(4);
    expect(FIXTURE_WORLD.derivation.outputContentId).toBe(FIXTURE_WORLD.worldId);
  });

  test("determinism: recomposing the same request yields the byte-identical world id", () => {
    const again = composeReconstructionWorld(FIXTURE_WORLD_REQUEST);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.worldId).toBe(FIXTURE_WORLD.worldId);
    }
  });
});

/* ------------------------------------------------------------------ */
/* RECONSTRUCT — fail-closed drills                                     */
/* ------------------------------------------------------------------ */

describe("reconstruct — fail-closed drills", () => {
  test("an UNREGISTERED fragment refuses (never a silently-unanchored world)", () => {
    const outcome = composeReconstructionWorld({
      ...FIXTURE_WORLD_REQUEST,
      fragments: [FIXTURE_FRAGMENT], // registrationState: unregistered
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("operation-semantic-failure");
      expect(outcome.failure.detail).toContain("register first");
    }
  });

  test("a REFUSED-registration fragment refuses too (the state machine is honest)", () => {
    const outcome = composeReconstructionWorld({
      ...FIXTURE_WORLD_REQUEST,
      fragments: [
        { ...FIXTURE_FRAGMENT, registrationState: "registration-refused" },
      ],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("operation-semantic-failure");
    }
  });

  test("a fragment with a DIFFERENT site frame refuses (one frame per world)", () => {
    const outcome = composeReconstructionWorld({
      ...FIXTURE_WORLD_REQUEST,
      siteFrame: { origin: [100, 0, 0], northHeading: 0, units: "metre" },
      fragments: [
        { ...FIXTURE_REGISTERED_FRAGMENT },
      ],
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("site frame");
    }
  });

  test("a substrate-shaped plan element id refuses (identity quarantine, directive §10)", () => {
    const outcome = composeReconstructionWorld({
      ...FIXTURE_WORLD_REQUEST,
      planModel: {
        ...FIXTURE_PLAN_MODEL,
        elements: [
          {
            ...FIXTURE_PLAN_MODEL.elements[0]!,
            elementId: "2hNGeMV3v5xeJ$OTEbSO6r", // IFC GUID shape as identity
          },
        ],
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toContain("identity quarantine");
      expect(outcome.failure.detail).toContain("ifc-guid");
    }
  });

  test("a usd-prim-path-shaped plan element id refuses", () => {
    const outcome = composeReconstructionWorld({
      ...FIXTURE_WORLD_REQUEST,
      planModel: {
        ...FIXTURE_PLAN_MODEL,
        elements: [
          {
            ...FIXTURE_PLAN_MODEL.elements[0]!,
            elementId: "/World/Walls/Wall_01",
          },
        ],
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("usd-prim-path");
    }
  });

  test("duplicate plan element ids refuse", () => {
    const outcome = composeReconstructionWorld({
      ...FIXTURE_WORLD_REQUEST,
      planModel: {
        ...FIXTURE_PLAN_MODEL,
        elements: [
          FIXTURE_PLAN_MODEL.elements[0]!,
          { ...FIXTURE_PLAN_MODEL.elements[1]!, elementId: FIXTURE_PLAN_MODEL.elements[0]!.elementId },
        ],
      },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("duplicate plan element");
    }
  });

  test("an empty composition refuses (no fragments, no plan — no empty world)", () => {
    const outcome = composeReconstructionWorld({
      ...FIXTURE_WORLD_REQUEST,
      fragments: [],
      planModel: null,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("empty world");
    }
  });

  test("a non-positive world revision refuses", () => {
    const outcome = composeReconstructionWorld({
      ...FIXTURE_WORLD_REQUEST,
      worldRevision: 0,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
    }
  });

  test("every composed node is isGhost: false (the ghost-distinctness law, structural)", () => {
    for (const node of FIXTURE_WORLD.scene.nodes) {
      expect(node.isGhost).toBe(false);
    }
    for (const node of FIXTURE_WORLD_REVISION_2.scene.nodes) {
      expect(node.isGhost).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* NAVIGATE — layer toggling (the typed visibility predicate)           */
/* ------------------------------------------------------------------ */

describe("navigate — layer toggling", () => {
  test("default visibility: every layer's visibleByDefault, AND semantics per node", () => {
    const outcome = applyLayerToggles(FIXTURE_WORLD, []);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const view = outcome.value;
      expect(view.layerVisibility).toEqual([
        { layerId: "capture-reality", visible: true },
        { layerId: "plan-model", visible: true },
        { layerId: "coverage", visible: false },
        { layerId: "annotations", visible: true },
      ]);
      // capture nodes are visible (their only layer is visible)
      for (const record of view.elementVisibility.slice(0, 3)) {
        expect(record.visible).toBe(true);
      }
    }
  });

  test("hiding plan-model hides plan nodes and leaves capture nodes visible", () => {
    const outcome = applyLayerToggles(FIXTURE_WORLD, [
      { layerId: "plan-model", visible: false },
    ]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const byId = new Map(
        outcome.value.elementVisibility.map((entry) => [entry.elementId, entry.visible]),
      );
      expect(byId.get("plan-wall-001")).toBe(false);
      expect(byId.get("plan-slab-001")).toBe(false);
      const captureId = FIXTURE_WORLD.elementProvenance[0]!.elementId;
      expect(byId.get(captureId)).toBe(true);
    }
  });

  test("toggling works for the coverage layer too (annotation node)", () => {
    const outcome = applyLayerToggles(FIXTURE_WORLD, [
      { layerId: "coverage", visible: true },
    ]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const coverageId = FIXTURE_WORLD.elementProvenance.find((r) => r.origin === "derived")!
        .elementId;
      const entry = outcome.value.elementVisibility.find((e) => e.elementId === coverageId)!;
      expect(entry.visible).toBe(true);
    }
  });

  test("an UNKNOWN layer id in a toggle refuses (fail-closed, P0-A mirror)", () => {
    const outcome = applyLayerToggles(FIXTURE_WORLD, [
      { layerId: "no-such-layer", visible: true },
    ]);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toContain("unknown layerId");
    }
  });

  test("later toggles win (deterministic last-wins semantics)", () => {
    const outcome = applyLayerToggles(FIXTURE_WORLD, [
      { layerId: "plan-model", visible: false },
      { layerId: "plan-model", visible: true },
    ]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const planEntry = outcome.value.layerVisibility.find(
        (entry) => entry.layerId === "plan-model",
      )!;
      expect(planEntry.visible).toBe(true);
    }
  });

  test("the predicate is idempotent: applying the same toggles twice yields the identical view state", () => {
    const toggles = [{ layerId: "plan-model", visible: false }];
    const first = applyLayerToggles(FIXTURE_WORLD, toggles);
    const second = applyLayerToggles(FIXTURE_WORLD, toggles);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  test("the standalone resolvers are exported pure (layer + element resolution)", () => {
    const visibility = resolveLayerVisibility(FIXTURE_WORLD, []);
    expect(visibility.ok).toBe(true);
    if (visibility.ok) {
      const elements = resolveElementVisibility(FIXTURE_WORLD, visibility.value);
      expect(elements).toHaveLength(6);
    }
  });
});

/* ------------------------------------------------------------------ */
/* NAVIGATE — bookmarks (typed world states)                            */
/* ------------------------------------------------------------------ */

describe("navigate — bookmarks", () => {
  function fixtureCamera() {
    return {
      position: [10, -10, 10] as const,
      target: [5, 3, 1] as const,
      up: [0, 0, 1] as const,
      fovRadians: Math.PI / 4,
      mode: "orbit" as const,
    };
  }

  test("a bookmark captures the typed world state (content-addressed identity)", async () => {
    const view = (await import("./navigate")).applyLayerToggles(FIXTURE_WORLD, []);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const outcome = captureNavigationBookmark(
      FIXTURE_WORLD,
      view.value,
      fixtureCamera(),
      null,
      ["plan-wall-001"],
      "Site entrance",
      FIXTURE_BOOKMARKED_AT,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const bookmark = outcome.value;
      expect(bookmark.bookmarkId).toMatch(/^[0-9a-f]{64}$/);
      expect(bookmark.worldRevision).toBe(1);
      expect(bookmark.selectedElementIds).toEqual(["plan-wall-001"]);
      // the digest round-trip law: the id IS the digest of the body
      expect(bookmarkDigestOf(bookmark)).toBe(bookmark.bookmarkId);
    }
  });

  test("resolveBookmark round-trips the view state (byte-identical resolution)", () => {
    const view = applyLayerToggles(FIXTURE_WORLD, [{ layerId: "plan-model", visible: false }]);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const captured = captureNavigationBookmark(
      FIXTURE_WORLD,
      view.value,
      fixtureCamera(),
      null,
      [],
      "Hidden plan",
      FIXTURE_BOOKMARKED_AT,
    );
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    const resolved = resolveNavigationBookmark(FIXTURE_WORLD, captured.value);
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(JSON.stringify(resolved.value)).toBe(JSON.stringify(view.value));
    }
  });

  test("a STALE bookmark (different world revision) refuses — never silently applied", () => {
    const view = applyLayerToggles(FIXTURE_WORLD, []);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const captured = captureNavigationBookmark(
      FIXTURE_WORLD,
      view.value,
      fixtureCamera(),
      null,
      [],
      "Rev 1 view",
      FIXTURE_BOOKMARKED_AT,
    );
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    const stale = resolveNavigationBookmark(FIXTURE_WORLD_REVISION_2, captured.value);
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.failure.kind).toBe("operation-semantic-failure");
      expect(stale.failure.detail).toContain("stale");
    }
  });

  test("a bookmark selecting an UNKNOWN element refuses", () => {
    const view = applyLayerToggles(FIXTURE_WORLD, []);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const outcome = captureNavigationBookmark(
      FIXTURE_WORLD,
      view.value,
      fixtureCamera(),
      null,
      ["no-such-element"],
      "Bad selection",
      FIXTURE_BOOKMARKED_AT,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("contract-mismatch");
      expect(outcome.failure.detail).toContain("not in world");
    }
  });

  test("a non-unit section-plane normal refuses", () => {
    const view = applyLayerToggles(FIXTURE_WORLD, []);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const outcome = captureNavigationBookmark(
      FIXTURE_WORLD,
      view.value,
      fixtureCamera(),
      {
        planeId: "section-1",
        normal: [1, 1, 1], // not unit length
        distance: 0,
        enabled: true,
      },
      [],
      "Bad section",
      FIXTURE_BOOKMARKED_AT,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.detail).toContain("unit length");
    }
  });

  test("a lawful section plane passes and rides in the bookmark", () => {
    const view = applyLayerToggles(FIXTURE_WORLD, []);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const outcome = captureNavigationBookmark(
      FIXTURE_WORLD,
      view.value,
      fixtureCamera(),
      {
        planeId: "section-1",
        normal: [0, 0, 1],
        distance: 2,
        enabled: true,
      },
      [],
      "Cut at +2m",
      FIXTURE_BOOKMARKED_AT,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.section).not.toBeNull();
    }
  });

  test("a view state from a DIFFERENT world refuses at capture (the binding gate)", () => {
    const view = applyLayerToggles(FIXTURE_WORLD_REVISION_2, []);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const outcome = captureNavigationBookmark(
      FIXTURE_WORLD, // rev 1 world with a rev 2 view
      view.value,
      fixtureCamera(),
      null,
      [],
      "Cross-world",
      FIXTURE_BOOKMARKED_AT,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failure.kind).toBe("operation-semantic-failure");
    }
  });
});

/* ------------------------------------------------------------------ */
/* Properties                                                           */
/* ------------------------------------------------------------------ */

describe("world family — properties", () => {
  test("toggle-set closure: every toggle combination resolves to a total visibility map", () => {
    const layerIds = ["capture-reality", "plan-model", "coverage", "annotations"];
    // all 2^4 toggle combinations
    for (let mask = 0; mask < 16; mask++) {
      const toggles = layerIds.map((layerId, bit) => ({
        layerId,
        visible: (mask & (1 << bit)) !== 0,
      }));
      const outcome = applyLayerToggles(FIXTURE_WORLD, toggles);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.value.elementVisibility).toHaveLength(6);
        for (const entry of outcome.value.elementVisibility) {
          expect(typeof entry.visible).toBe("boolean");
        }
      }
    }
  });

  test("world composition over generated fragments stays structurally valid (property)", () => {
    for (let seed = 0; seed < 5; seed++) {
      const request: WorldCompositionRequest = {
        ...FIXTURE_WORLD_REQUEST,
        worldRevision: 100 + seed,
        planModel: {
          ...FIXTURE_PLAN_MODEL,
          elements: [
            {
              ...FIXTURE_PLAN_MODEL.elements[0]!,
              elementId: `plan-generated-${seed}`,
              translation: [seed, seed, 0],
            },
          ],
        },
      };
      const outcome = composeReconstructionWorld(request);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(validateScene(outcome.value.scene)).toEqual([]);
        // IDENTITY STABILITY: the same identity inputs (frame,
        // fragments, plan model id, georeference) keep the SAME world
        // id across revisions — the revision content changes, the
        // identity does not (what-changed depends on this).
        expect(outcome.value.worldId).toBe(FIXTURE_WORLD.worldId);
        expect(outcome.value.worldRevision).toBe(100 + seed);
      }
    }
  });

  test("unplaced assets never become scene nodes (spatial honesty at composition)", () => {
    const outcome = composeReconstructionWorld({
      ...FIXTURE_WORLD_REQUEST,
      fragments: [
        {
          ...FIXTURE_REGISTERED_FRAGMENT,
          assets: FIXTURE_REGISTERED_FRAGMENT.assets.map((asset) => ({
            ...asset,
            declaredPose: null, // all unplaced
          })),
        },
      ],
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const world: NavigableWorld = outcome.value;
      expect(world.scene.nodes.filter((n) => n.kind === "capture_cloud")).toHaveLength(0);
      // plan nodes still compose; the world is honestly plan-only
      expect(world.scene.nodes.filter((n) => n.kind === "plan_model")).toHaveLength(2);
      // the coverage limitations record the unplaced assets
      expect(world.coverage!.limitations.some((l) => l.includes("declared no pose"))).toBe(true);
    }
  });
});
