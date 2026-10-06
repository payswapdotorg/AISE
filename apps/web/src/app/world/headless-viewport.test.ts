/**
 * WORLD-P5 Mount 1 — the HEADLESS VIEWPORT parity tests: the station
 * record's viewport extension under the one-record discipline.
 *
 *   - DETERMINISM: the projection rebuilds byte-identically (LAW 1's
 *     discipline extended to the viewport);
 *   - TRACEABILITY: every declared box traces to declared data (the
 *     plan shapes, the capture volumes, the coverage union, the ghost
 *     target + declared transform) — never invented geometry;
 *   - THE REAL ADAPTER over the committed scene: the NullEngine
 *     occupant loads the record's viewport (all boxes resolve), picks
 *     return CANONICAL record element ids, the ghost set applies, and
 *     the whole flow re-runs byte-identically (the substitution law's
 *     determinism face, at the station scene).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CameraState } from "@aise/world-reality-substrate";
import { createBabylonSceneRuntime } from "@aise/world-scene-runtime";
import type { BabylonSceneRuntime } from "@aise/world-scene-runtime";
import type { GeometryReference } from "@aise/world-reality-substrate";
import { openReferenceWorldStation, canonicalJsonStringify } from "@aise/world-ux";
import { buildStationRecord, type StationRecord } from "./record";
import { buildStationViewportProjection } from "./scene-projection";

const COMMITTED = JSON.parse(
  readFileSync(join(import.meta.dir, "station-record.json"), "utf8"),
) as StationRecord;

function stationModel() {
  const outcome = openReferenceWorldStation();
  if (!outcome.ok) throw new Error(outcome.failure.detail);
  return outcome.value;
}

describe("WORLD-P5 — the station viewport projection (the one-record discipline)", () => {
  test("DETERMINISM: the projection rebuilds byte-identically (canonical JSON)", () => {
    const model = stationModel();
    const first = buildStationViewportProjection(model);
    const second = buildStationViewportProjection(stationModel());
    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
  });

  test("LAW 1 (extended): the live record's viewport ≡ the committed record's viewport", () => {
    const live = buildStationRecord();
    expect(canonicalJsonStringify(live.viewport)).toBe(
      canonicalJsonStringify(COMMITTED.viewport),
    );
    /* The station IDENTITY is unchanged by the viewport extension. */
    expect(live.stationId).toBe(COMMITTED.stationId);
    expect(live.stationId).toBe("794d5f8ca8e59d66");
  });

  test("TRACEABILITY: every declared box traces to declared data", () => {
    const boxes = new Map(COMMITTED.viewport.boxes.map((b) => [b.assetId, b]));
    /* The plan wall renders its DECLARED plan shape (site-absolute). */
    const wall = boxes.get("station-box:plan-wall-001");
    expect(wall).toBeDefined();
    expect(wall?.min).toEqual([1, -4, 0]);
    expect(wall?.max).toEqual([3, 0, 3]);
    /* The ghost renders the wall box translated by the DECLARED ghost
     * transform (the 30 mm plaster pass offset: +0.02 m in x). */
    const ghost = boxes.get("station-box:ghost-reparameterize-2814f7cd97b18960");
    expect(ghost).toBeDefined();
    expect(ghost?.min).toEqual([1.02, -4, 0]);
    expect(ghost?.max).toEqual([3.02, 0, 3]);
    /* The coverage annotation renders the DECLARED-volume union. */
    const coverage = [...boxes.values()].find(
      (b) => b.min[0] === -4 && b.max[0] === 14 && b.max[1] === 12,
    );
    expect(coverage).toBeDefined();
    expect(coverage?.min).toEqual([-4, -4, 0]);
    /* Exactly the record's elements that have declared geometry are
     * boxed — one box per element, none invented. */
    expect(COMMITTED.viewport.boxes.length).toBe(7);
    expect(COMMITTED.viewport.derivationNote).toContain("no invented geometry");
  });

  test("THE REAL ADAPTER over the committed scene: NullEngine loads it, picks return canonical record ids, ghosts apply — deterministically", () => {
    const run = (): string => {
      const boxes = new Map(COMMITTED.viewport.boxes.map((b) => [b.assetId, b]));
      const runtimeOutcome = createBabylonSceneRuntime({
        engine: { mode: "null" },
        geometry: (ref: GeometryReference) => {
          const box = boxes.get(ref.assetId);
          return box === undefined ? null : { kind: "box" as const, min: box.min, max: box.max };
        },
      });
      if (!runtimeOutcome.ok) throw new Error(runtimeOutcome.failure.detail);
      const runtime: BabylonSceneRuntime = runtimeOutcome.value;
      const load = runtime.loadScene(COMMITTED.viewport.scene);
      if (!load.ok) throw new Error(load.failure.detail);
      const handle = load.value;
      /* The station's initial camera (the record's authority). */
      runtime.setCamera(handle, COMMITTED.initialCamera);
      /* The ghost set (the record's ghost summary). */
      const ghostSummary = COMMITTED.viewport.scene.ghostSummary;
      if (ghostSummary !== null) {
        const ghostSet = runtime.setGhostSet(
          handle,
          ghostSummary.operationId,
          ghostSummary.proposedElementIds,
          ghostSummary.removedElementIds,
        );
        if (!ghostSet.ok) throw new Error(ghostSet.failure.detail);
      }
      /* A pick through the camera target returns a CANONICAL record
       * element id (identity law at the station level). */
      const pick = runtime.pick(handle, 0.5, 0.5);
      if (!pick.ok) throw new Error(pick.failure.detail);
      const knownIds = COMMITTED.elements.map((e) => e.elementId);
      const bounds = runtime.getWorldBounds(handle);
      runtime.dispose(handle);
      runtime.shutdown();
      return canonicalJsonStringify({
        revision: handle.sceneRevision,
        pick: pick.value.elementId,
        pickIsCanonical: pick.value.elementId !== null && knownIds.includes(pick.value.elementId),
        bounds: bounds.ok ? bounds.value : null,
      });
    };
    const first = run();
    const second = run();
    expect(first).toBe(second);
    const parsed = JSON.parse(first) as { pickIsCanonical: boolean; pick: string | null };
    expect(parsed.pickIsCanonical).toBe(true);
    expect(parsed.pick).not.toBeNull();
  });

  test("LAW 2 (camera parity at the GPU layer): the typed operations round-trip through the real adapter over the record's camera", () => {
    const boxes = new Map(COMMITTED.viewport.boxes.map((b) => [b.assetId, b]));
    const runtimeOutcome = createBabylonSceneRuntime({
      engine: { mode: "null" },
      geometry: (ref: GeometryReference) => {
        const box = boxes.get(ref.assetId);
        return box === undefined ? null : { kind: "box" as const, min: box.min, max: box.max };
      },
    });
    if (!runtimeOutcome.ok) throw new Error(runtimeOutcome.failure.detail);
    const runtime = runtimeOutcome.value;
    const load = runtime.loadScene(COMMITTED.viewport.scene);
    if (!load.ok) throw new Error(load.failure.detail);
    const handle = load.value;
    const typed: CameraState = {
      position: [2, -8, 3],
      target: [2, -2, 1.5],
      up: [0, 0, 1],
      fovRadians: 0.9,
      mode: "orbit",
    };
    expect(runtime.setCamera(handle, typed).ok).toBe(true);
    const back = runtime.getCamera(handle);
    expect(back.ok).toBe(true);
    if (back.ok) expect(JSON.stringify(back.value)).toBe(JSON.stringify(typed));
    runtime.dispose(handle);
    runtime.shutdown();
  });
});
