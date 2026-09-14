/**
 * AISE-021 wireframe tests — the documented axonometric projection
 * (hand-computed cases), honest omissions, cross-view node identity and
 * byte-determinism of the 3D pane.
 */

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_VIEW,
  project3dWireframe,
  projectPoint,
  renderWireframeSvg,
  WIREFRAME_SELECTED_STROKE,
} from "./wireframe";
import { skewHexagon, storeySnapshot } from "./fixtures";

const NORTH_ELEVATION = { azimuthRad: Math.PI / 2, elevationRad: 0 } as const;
const EAST_ELEVATION = { azimuthRad: 0, elevationRad: 0 } as const;
const DIAGONAL = { azimuthRad: Math.PI / 4, elevationRad: 0 } as const;

describe("axonometric point projection (documented hand-computed cases)", () => {
  test("azimuth π/2, elevation 0 maps (x, y, z) → (x, −z) — north elevation", () => {
    expect(projectPoint([2, 3, 1.5], NORTH_ELEVATION)).toEqual([2, -1.5]);
    expect(projectPoint([0, 99, 0], NORTH_ELEVATION)).toEqual([0, 0]);
  });

  test("azimuth 0, elevation 0 maps (x, y, z) → (−y, −z) — east elevation", () => {
    expect(projectPoint([2, 3, 1.5], EAST_ELEVATION)).toEqual([-3, -1.5]);
    expect(projectPoint([7, -1, 0.5], EAST_ELEVATION)).toEqual([1, -0.5]);
  });

  test("azimuth π/4, elevation 0 maps (x, y, z) → ((x−y)·√2/2, −z) — quantized to 1 µm", () => {
    const [sx, sy] = projectPoint([1, 0, 2], DIAGONAL);
    expect(sx).toBe(0.707107);
    expect(sy).toBe(-2);
    const [sx2, sy2] = projectPoint([0, 1, 2], DIAGONAL);
    expect(sx2).toBe(-0.707107);
    expect(sy2).toBe(-2);
  });

  test("the default view (45°, 30°) follows the documented formulas", () => {
    expect(DEFAULT_VIEW.azimuthRad).toBe(Math.PI / 4);
    expect(DEFAULT_VIEW.elevationRad).toBe(Math.PI / 6);
    // (0, 0, z): screenX = 0, screenY = −z·cos(30°) — quantized to 1 µm.
    expect(projectPoint([0, 0, 2], DEFAULT_VIEW)[1]).toBe(-1.732051);
    // (1, 0, 0): screenX = sin(45°), screenY = cos(45°)·sin(30°).
    expect(projectPoint([1, 0, 0], DEFAULT_VIEW)[0]).toBe(0.707107);
    expect(projectPoint([1, 0, 0], DEFAULT_VIEW)[1]).toBe(0.353553);
  });

  test("exact-zero screen coordinates are canonicalized (no −0 leaks)", () => {
    expect(Object.is(projectPoint([0, 0, 0], DEFAULT_VIEW)[0], 0)).toBe(true);
    expect(Object.is(projectPoint([0, 0, 0], DEFAULT_VIEW)[1], 0)).toBe(true);
    expect(projectPoint([1, 1, 0], DIAGONAL)[1]).toBe(0);
  });
});

describe("wireframe model (project3dWireframe)", () => {
  test("projects every boundary-bearing element, id-sorted, with the SAME node ids as the 2D drawing", () => {
    const model = project3dWireframe(storeySnapshot(), DEFAULT_VIEW);
    expect(model.elements.map((element) => element.nodeId)).toEqual([
      "door-1",
      "floor-1",
      "wall-e",
      "wall-n",
      "wall-s",
      "wall-w",
      "window-1",
    ]);
    expect(model.elements.map((element) => element.geometryId)).toEqual([
      "geo-door-1",
      "geo-floor-1",
      "geo-wall-e",
      "geo-wall-n",
      "geo-wall-s",
      "geo-wall-w",
      "geo-window-1",
    ]);
    // Container nodes (building/storey/space) are skipped, not omitted.
    expect(model.omissions.map((omission) => omission.nodeId)).not.toContain("storey-1");
  });

  test("wall boundaries project as CLOSED skew hexagons (6 points, first vertex hand-checked)", () => {
    const model = project3dWireframe(storeySnapshot(), NORTH_ELEVATION);
    const wallW = model.elements.find((element) => element.nodeId === "wall-w");
    if (wallW === undefined) {
      throw new Error("wall-w wireframe element missing");
    }
    expect(wallW.closed).toBe(true);
    expect(wallW.points).toHaveLength(6);
    // skewHexagon([−0.3, −0.3, 0], [0, 3.3, 2.7]) first vertex (−0.3, −0.3, 0)
    // under (x, y, z) → (x, −z): (−0.3, 0); the 4th vertex (0, 3.3, 2.7) → (0, −2.7).
    expect(wallW.points[0]).toEqual([-0.3, 0]);
    expect(wallW.points[3]).toEqual([0, -2.7]);
  });

  test("floor boundary projects vertex-for-vertex under the north elevation", () => {
    const model = project3dWireframe(storeySnapshot(), NORTH_ELEVATION);
    const floor = model.elements.find((element) => element.nodeId === "floor-1");
    if (floor === undefined) {
      throw new Error("floor-1 wireframe element missing");
    }
    // Floor polygon [[0,0,0],[4.2,0,0],[4.2,3,0],[0,3,0]] → (x, −z) = (x, 0).
    expect(floor.points).toEqual([
      [0, 0],
      [4.2, 0],
      [4.2, 0],
      [0, 0],
    ]);
  });

  test("omits exactly the un-projectable candidates with stable reason codes", () => {
    const model = project3dWireframe(storeySnapshot(), DEFAULT_VIEW);
    expect(model.omissions).toEqual([
      { nodeId: "ceiling-1", reason: "boundary-absent" },
      { nodeId: "column-1", reason: "geometry-kind-not-projectable" },
      { nodeId: "paint-1", reason: "geometry-ref-absent" },
      { nodeId: "railing-1", reason: "geometry-unresolved" },
    ]);
  });

  test("the caller's node array order never changes the output (id-sorted processing)", () => {
    const snapshot = storeySnapshot();
    const shuffled = {
      ...snapshot,
      nodes: [...snapshot.nodes].reverse(),
      geometries: [...(snapshot.geometries ?? [])].reverse(),
    };
    expect(project3dWireframe(shuffled, DEFAULT_VIEW)).toEqual(project3dWireframe(snapshot, DEFAULT_VIEW));
  });

  test("a skew hexagon of a known box projects to the documented corners (east elevation)", () => {
    const hexagon = skewHexagon([0, 0, 0], [4.2, 3, 2.7]);
    const projected = hexagon.map((vertex) => projectPoint(vertex, EAST_ELEVATION));
    // (x, y, z) → (−y, −z): the six corners become the rectangle extremes.
    expect(projected[0]).toEqual([0, 0]);
    expect(projected[2]).toEqual([-3, 0]);
    expect(projected[3]).toEqual([-3, -2.7]);
    expect(projected[5]).toEqual([0, -2.7]);
  });
});

describe("wireframe SVG rendering", () => {
  test("renders one polyline per element with data-node-id and explicit closure", () => {
    const model = project3dWireframe(storeySnapshot(), NORTH_ELEVATION);
    const svg = renderWireframeSvg(model);
    expect(svg.startsWith('<svg height="')).toBe(true);
    expect(svg.endsWith("</svg>\n")).toBe(true);
    for (const nodeId of ["door-1", "floor-1", "wall-e", "wall-n", "wall-s", "wall-w", "window-1"]) {
      expect(svg).toContain(`data-node-id="${nodeId}"`);
    }
    // Closed polylines repeat their first point (7 pairs for the 6-point hexagon).
    const wallW = svg.match(/<polyline data-node-id="wall-w"[^>]*points="([^"]+)"/);
    if (wallW === null || wallW[1] === undefined) {
      throw new Error("wall-w polyline missing");
    }
    const pairs = wallW[1].split(" ");
    expect(pairs).toHaveLength(7);
    expect(pairs[0]).toBe(pairs[6]);
    expect(pairs[0]).toBe("-0.3,0");
  });

  test("selection highlights EXACTLY one element with the highlight stroke", () => {
    const model = project3dWireframe(storeySnapshot(), DEFAULT_VIEW);
    const svg = renderWireframeSvg(model, "wall-e");
    expect((svg.match(/data-selected="true"/g) ?? []).length).toBe(1);
    expect(svg).toContain('<polyline data-node-id="wall-e" data-selected="true"');
    expect(svg).toContain(`stroke="${WIREFRAME_SELECTED_STROKE}"`);
    expect(svg).toContain('<polyline data-node-id="wall-n" fill="none"');
  });

  test("byte-deterministic for identical model + selection", () => {
    const model = project3dWireframe(storeySnapshot(), DEFAULT_VIEW);
    expect(renderWireframeSvg(model, "wall-n")).toBe(renderWireframeSvg(model, "wall-n"));
    expect(renderWireframeSvg(model)).toBe(renderWireframeSvg(model));
  });
});
