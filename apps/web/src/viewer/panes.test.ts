/**
 * AISE-027 viewer tests — pane projection correctness: the axonometric (3D)
 * and plan (2D) projections against hand-verifiable fixtures, the honest
 * omission matrix, the BOQ projection (verbatim proposed quantities,
 * origins, tombstones), shuffle invariance and purity.
 */

import { describe, expect, test } from "bun:test";
import * as viewer from "./index";
import {
  buildState0,
  buildState1,
  buildState2,
  buildState3,
  canonicalScenario,
  deepFreeze,
  shuffledGeometries,
  STEP1_ID,
  STEP2_ID,
  STEP3_ID,
  viewerGeometries,
} from "./fixtures";
import type { Point2D, Vec3, ViewParams } from "./index";

const NORTH_ELEVATION: ViewParams = { azimuthRad: Math.PI / 2, elevationRad: 0 };

/* ------------------------------------------------------------------ */
/* Point projections (hand-verifiable worked examples)                 */
/* ------------------------------------------------------------------ */

describe("projectPoint — the AISE-021 axonometric formulas", () => {
  test("az = π/2, el = 0 maps (x, y, z) to (x, −z) — a north elevation", () => {
    expect(viewer.projectPoint([4.2, 3, 2.7], NORTH_ELEVATION)).toEqual([4.2, -2.7]);
    expect(viewer.projectPoint([0, 0, 0], NORTH_ELEVATION)).toEqual([0, 0]);
    expect(viewer.projectPoint([1.5, 99, 0.5], NORTH_ELEVATION)).toEqual([1.5, -0.5]);
  });

  test("az = 0, el = 0 maps (x, y, z) to (−y, −z) — an east elevation", () => {
    const east: ViewParams = { azimuthRad: 0, elevationRad: 0 };
    expect(viewer.projectPoint([4.2, 3, 2.7], east)).toEqual([-3, -2.7]);
    expect(viewer.projectPoint([7, 1.25, 0], east)).toEqual([-1.25, 0]);
  });

  test("az = π/4, el = 0 maps (x, y, z) to ((x−y)·√2/2, −z)", () => {
    const diagonal: ViewParams = { azimuthRad: Math.PI / 4, elevationRad: 0 };
    const halfSqrt2 = Math.SQRT1_2;
    expect(viewer.projectPoint([4.2, 3, 2.7], diagonal)).toEqual([
      Math.round((4.2 - 3) * halfSqrt2 * 1e6) / 1e6,
      -2.7,
    ]);
  });

  test("float dust is quantized to the 1 µm grid and −0 is canonicalized", () => {
    // cos(π/2) ≈ 6.1e-17 would leak through unquantized arithmetic.
    const tiny = viewer.projectPoint([0, 1, 0], NORTH_ELEVATION);
    expect(tiny[0]).toBe(0);
    expect(Object.is(tiny[0], -0)).toBe(false);
    expect(viewer.projectPoint([-3, 0, 0], NORTH_ELEVATION)).toEqual([-3, 0]);
  });

  test("DEFAULT_VIEW is the AISE-021 default: 45° azimuth, 30° elevation", () => {
    expect(viewer.DEFAULT_VIEW.azimuthRad).toBe(Math.PI / 4);
    expect(viewer.DEFAULT_VIEW.elevationRad).toBe(Math.PI / 6);
  });
});

describe("projectPointPlan — the plan (XY) projection", () => {
  test("drops the height axis: (x, y, z) ↦ (x, y), quantized", () => {
    expect(viewer.projectPointPlan([4.2, 3, 2.7])).toEqual([4.2, 3]);
    expect(viewer.projectPointPlan([0, 0, 9])).toEqual([0, 0]);
  });

  test("quantizes dust and canonicalizes −0", () => {
    const point: Vec3 = [1e-9, -1e-9, 5];
    const projected: Point2D = viewer.projectPointPlan(point);
    expect(projected[0]).toBe(0);
    expect(projected[1]).toBe(0);
    expect(Object.is(projected[1], -0)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Pane projections over the fixture states                            */
/* ------------------------------------------------------------------ */

describe("projectPane — 3D axonometric pane", () => {
  test("projects wall-north's boundary EXACTLY at the north elevation", () => {
    const projection = viewer.projectPane(buildState2(), viewerGeometries(), {
      mode: "axonometric",
      view: NORTH_ELEVATION,
    });
    const wallNorth = projection.shapes.find((shape) => shape.nodeId === "wall-north");
    if (wallNorth === undefined) {
      throw new Error("wall-north must project");
    }
    expect([...wallNorth.points]).toEqual([
      [0, 0],
      [4.2, 0],
      [4.2, -2.7],
      [0, -2.7],
    ]);
    expect(wallNorth.geometryId).toBe("plane-wall-north-001");
    expect(wallNorth.origin).toBe("baseline_touched");
  });

  test("shapes are node-id sorted regardless of the state's array order", () => {
    const projection = viewer.projectPane(buildState2(), viewerGeometries(), {
      mode: "axonometric",
      view: NORTH_ELEVATION,
    });
    const ids = projection.shapes.map((shape) => shape.nodeId);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain("wall-partition-new");
    expect(ids).toContain("door-101");
  });

  test("the scenario-authored partition carries its origin and dashed-stroke hook", () => {
    const projection = viewer.projectPane(buildState2(), viewerGeometries(), {
      mode: "axonometric",
      view: NORTH_ELEVATION,
    });
    const partition = projection.shapes.find((shape) => shape.nodeId === "wall-partition-new");
    if (partition === undefined) {
      throw new Error("the partition must project");
    }
    expect(partition.origin).toBe("scenario");
    expect(partition.geometryId).toBe("plane-wall-partition-001");
    expect(partition.points).toHaveLength(4);
  });

  test("the honest omission matrix (all five stable reason codes)", () => {
    const projection = viewer.projectPane(buildState2(), viewerGeometries(), {
      mode: "axonometric",
      view: NORTH_ELEVATION,
    });
    const reasons = new Map(
      projection.omissions.map((omission) => [omission.nodeId, omission.reason]),
    );
    expect(reasons.get("ceiling-1")).toBe("boundary-absent");
    expect(reasons.get("column-mesh-1")).toBe("geometry-kind-not-projectable");
    expect(reasons.get("railing-1")).toBe("geometry-unresolved");
    expect(reasons.get("paint-1")).toBe("geometry-ref-absent");
    expect(reasons.get("skirting-1")).toBe("degenerate-projection");
    expect(projection.omissions).toHaveLength(5);
  });

  test("container kinds are skipped WITHOUT an omission entry (not drawing content)", () => {
    const projection = viewer.projectPane(buildState0(), viewerGeometries(), {
      mode: "axonometric",
      view: NORTH_ELEVATION,
    });
    for (const container of ["building-a", "site-north", "storey-01", "space-office-101"]) {
      expect(projection.shapes.some((shape) => shape.nodeId === container)).toBe(false);
      expect(projection.omissions.some((omission) => omission.nodeId === container)).toBe(false);
    }
  });

  test("a proposed-removal node is absent from layer 3's shapes AND omissions", () => {
    const projection = viewer.projectPane(buildState3(), viewerGeometries(), {
      mode: "axonometric",
      view: NORTH_ELEVATION,
    });
    expect(projection.shapes.some((shape) => shape.nodeId === "wall-east")).toBe(false);
    expect(projection.omissions.some((omission) => omission.nodeId === "wall-east")).toBe(false);
  });
});

describe("projectPane — 2D plan pane", () => {
  test("projects wall-north's footprint EXACTLY (x, y from the boundary)", () => {
    const projection = viewer.projectPane(buildState1(), viewerGeometries(), { mode: "plan" });
    const wallNorth = projection.shapes.find((shape) => shape.nodeId === "wall-north");
    if (wallNorth === undefined) {
      throw new Error("wall-north must project in plan");
    }
    expect([...wallNorth.points]).toEqual([
      [0, 3],
      [4.2, 3],
      [4.2, 3],
      [0, 3],
    ]);
    expect(wallNorth.origin).toBe("baseline_touched");
  });

  test("the plan pane carries the SAME node ids as the 3D pane (cross-pane identity)", () => {
    const plan = viewer.projectPane(buildState2(), viewerGeometries(), { mode: "plan" });
    const axonometric = viewer.projectPane(buildState2(), viewerGeometries(), {
      mode: "axonometric",
      view: NORTH_ELEVATION,
    });
    expect(plan.shapes.map((shape) => shape.nodeId)).toEqual(
      axonometric.shapes.map((shape) => shape.nodeId),
    );
    expect(plan.omissions.map((omission) => omission.nodeId)).toEqual(
      axonometric.omissions.map((omission) => omission.nodeId),
    );
  });

  test("the honest omission matrix holds identically in plan", () => {
    const projection = viewer.projectPane(buildState2(), viewerGeometries(), { mode: "plan" });
    const reasons = new Map(
      projection.omissions.map((omission) => [omission.nodeId, omission.reason]),
    );
    expect(reasons.get("ceiling-1")).toBe("boundary-absent");
    expect(reasons.get("column-mesh-1")).toBe("geometry-kind-not-projectable");
    expect(reasons.get("railing-1")).toBe("geometry-unresolved");
    expect(reasons.get("paint-1")).toBe("geometry-ref-absent");
    expect(reasons.get("skirting-1")).toBe("degenerate-projection");
  });

  test("an empty geometry table yields unresolved omissions for every resolvable ref, never guesses", () => {
    const projection = viewer.projectPane(buildState1(), [], { mode: "plan" });
    expect(projection.shapes).toHaveLength(0);
    const reasons = new Map(
      projection.omissions.map((omission) => [omission.nodeId, omission.reason]),
    );
    // Plane/polygon refs become honestly unresolved…
    expect(reasons.get("wall-north")).toBe("geometry-unresolved");
    expect(reasons.get("railing-1")).toBe("geometry-unresolved");
    expect(reasons.get("skirting-1")).toBe("geometry-unresolved");
    // …while the structural cases keep their own stable codes.
    expect(reasons.get("column-mesh-1")).toBe("geometry-kind-not-projectable");
    expect(reasons.get("paint-1")).toBe("geometry-ref-absent");
  });
});

/* ------------------------------------------------------------------ */
/* Determinism / shuffle invariance / purity                           */
/* ------------------------------------------------------------------ */

describe("pane projection determinism and purity", () => {
  test("two fresh projections of the same state are deep-equal", () => {
    const a = viewer.projectPane(buildState2(), viewerGeometries(), {
      mode: "axonometric",
      view: NORTH_ELEVATION,
    });
    const b = viewer.projectPane(buildState2(), viewerGeometries(), {
      mode: "axonometric",
      view: NORTH_ELEVATION,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("shuffled node/relationship/geometry order renders byte-identically", () => {
    const canonical = canonicalScenario();
    const shuffled = {
      ...canonical,
      states: canonical.states.map((state) => ({
        ...state,
        nodes: [...state.nodes].reverse(),
        relationships: [...state.relationships].reverse(),
      })),
    };
    const canonicalLayer2 = canonical.states[2];
    const shuffledLayer2 = shuffled.states[2];
    if (canonicalLayer2 === undefined || shuffledLayer2 === undefined) {
      throw new Error("fixture must carry layer 2");
    }
    const a = viewer.projectPane(canonicalLayer2, viewerGeometries(), {
      mode: "axonometric",
      view: NORTH_ELEVATION,
    });
    const b = viewer.projectPane(shuffledLayer2, shuffledGeometries(), {
      mode: "axonometric",
      view: NORTH_ELEVATION,
    });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  test("a deep-frozen state and geometry table survive projection unmutated", () => {
    const state = deepFreeze(buildState2());
    const geometries = deepFreeze(viewerGeometries());
    const before = JSON.stringify({ state, geometries });
    expect(() =>
      viewer.projectPane(state, geometries, { mode: "axonometric", view: NORTH_ELEVATION }),
    ).not.toThrow();
    expect(() => viewer.projectPane(state, geometries, { mode: "plan" })).not.toThrow();
    expect(JSON.stringify({ state, geometries })).toBe(before);
  });
});

/* ------------------------------------------------------------------ */
/* Pane SVG rendering                                                  */
/* ------------------------------------------------------------------ */

describe("renderPaneSvg — deterministic SVG presentation", () => {
  const plan = viewer.projectPane(buildState2(), viewerGeometries(), { mode: "plan" });

  test("every shape carries data-node-id and the 026 data-origin", () => {
    const svg = viewer.renderPaneSvg(plan);
    expect(svg).toContain(`<polygon data-node-id="wall-north" data-origin="baseline_touched"`);
    expect(svg).toContain(`<polygon data-node-id="wall-partition-new" data-origin="scenario"`);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>\n")).toBe(true);
  });

  test("scenario-authored shapes render with the dashed stroke; baseline solid", () => {
    const svg = viewer.renderPaneSvg(plan);
    expect(svg).toContain(
      `data-node-id="wall-partition-new" data-origin="scenario" fill="none"`,
    );
    expect(svg.split(`stroke-dasharray=`).length - 1).toBe(1); // only the partition
    // Every shape keeps the base stroke (the dash is an ADDITIONAL attr).
    expect(svg.split(`stroke="${viewer.PANE_STROKE}"`).length - 1).toBe(plan.shapes.length);
  });

  test("selectedNodeId highlights EXACTLY that node's shape — presentation only", () => {
    const plain = viewer.renderPaneSvg(plan);
    const selected = viewer.renderPaneSvg(plan, "wall-north");
    expect(plain).not.toContain(`data-selected="true"`);
    expect(selected).toContain(`data-node-id="wall-north" data-origin="baseline_touched" data-selected="true"`);
    expect(selected.split(`data-selected="true"`).length - 1).toBe(1);
    // ids and geometry are untouched by selection.
    const ids = (fragment: string): string[] =>
      [...fragment.matchAll(/data-node-id="([^"]+)"/g)].map((match) => match[1] ?? "");
    expect(ids(selected)).toEqual(ids(plain));
  });

  test("omissionLines lists node id + reason; no list when nothing is omitted", () => {
    const onlyWallNorth = {
      ...buildState2(),
      nodes: buildState2().nodes.filter((stateNode) => stateNode.nodeId === "wall-north"),
    };
    const clean = viewer.projectPane(onlyWallNorth, viewerGeometries(), { mode: "plan" });
    expect(viewer.omissionLines(clean)).toHaveLength(0);
    const withOmissions = viewer.projectPane(buildState0(), viewerGeometries(), {
      mode: "plan",
    });
    const listed = viewer.omissionLines(withOmissions);
    expect(listed[0]).toBe(`<ul class="omissions">`);
    expect(listed.join("\n")).toContain(`data-omitted-node-id="railing-1" data-reason="geometry-unresolved"`);
  });

  test("two renders of the same projection are byte-identical", () => {
    expect(viewer.renderPaneSvg(plan, "wall-north")).toBe(viewer.renderPaneSvg(plan, "wall-north"));
  });
});

/* ------------------------------------------------------------------ */
/* BOQ pane projection                                                 */
/* ------------------------------------------------------------------ */

describe("projectStateBoq — the proposed bill of the layer", () => {
  test("rows are node-id sorted and cover EVERY live node (containers included)", () => {
    const boq = viewer.projectStateBoq(buildState2());
    const ids = boq.rows.map((row) => row.nodeId);
    expect(ids).toEqual([...ids].sort());
    expect(ids).toContain("space-office-101");
    expect(ids).toContain("wall-partition-new");
    expect(boq.rows).toHaveLength(buildState2().nodes.length);
  });

  test("wall-north's row carries the touched content VERBATIM with its step", () => {
    const boq = viewer.projectStateBoq(buildState1());
    const wallNorth = boq.rows.find((row) => row.nodeId === "wall-north");
    if (wallNorth === undefined) {
      throw new Error("wall-north row must exist");
    }
    expect(wallNorth.origin).toBe("baseline_touched");
    expect([...wallNorth.appliedStepIds]).toEqual([STEP1_ID]);
    expect(wallNorth.properties.map((property) => property.key)).toEqual([
      "thickness",
      "fireRating",
    ]);
    const fireRating = wallNorth.properties.find((property) => property.key === "fireRating");
    expect(fireRating?.value).toBe("REI90");
    expect(fireRating?.epistemicStatus).toBe("PROPOSED");
  });

  test("the partition row is scenario-authored with its own step id", () => {
    const boq = viewer.projectStateBoq(buildState2());
    const partition = boq.rows.find((row) => row.nodeId === "wall-partition-new");
    if (partition === undefined) {
      throw new Error("partition row must exist");
    }
    expect(partition.origin).toBe("scenario");
    expect([...partition.appliedStepIds]).toEqual([STEP2_ID]);
    expect(partition.properties.map((property) => property.key)).toEqual([
      "thickness",
      "fireRating",
    ]);
  });

  test("layer 3 excludes wall-east from live rows and lists it as a PROPOSED REMOVAL", () => {
    const boq = viewer.projectStateBoq(buildState3());
    expect(boq.rows.some((row) => row.nodeId === "wall-east")).toBe(false);
    expect(boq.removals).toHaveLength(1);
    const removal = boq.removals[0];
    expect(removal?.nodeId).toBe("wall-east");
    expect(removal?.reason).toBe("Obsolete partition demolished to open the floor plan.");
    expect(removal?.proposedByStepId).toBe(STEP3_ID);
  });

  test("earlier layers carry NO removals (the tombstone appears only from layer 3)", () => {
    expect(viewer.projectStateBoq(buildState0()).removals).toHaveLength(0);
    expect(viewer.projectStateBoq(buildState1()).removals).toHaveLength(0);
    expect(viewer.projectStateBoq(buildState2()).removals).toHaveLength(0);
  });

  test("propertyText and rowQuantitiesText format deterministically and honestly", () => {
    const boq = viewer.projectStateBoq(buildState1());
    const wallNorth = boq.rows.find((row) => row.nodeId === "wall-north");
    const thickness = wallNorth?.properties.find((property) => property.key === "thickness");
    const fireRating = wallNorth?.properties.find((property) => property.key === "fireRating");
    if (thickness === undefined || fireRating === undefined) {
      throw new Error("fixture properties missing");
    }
    expect(viewer.propertyText(thickness)).toBe("thickness = 240 mm (PROPOSED)");
    expect(viewer.propertyText(fireRating)).toBe("fireRating = REI90 (PROPOSED)");
    const paint = viewer.projectStateBoq(buildState0()).rows.find((row) => row.nodeId === "paint-1");
    if (paint === undefined) {
      throw new Error("paint row missing");
    }
    expect(viewer.rowQuantitiesText(paint)).not.toBe("");
    const empty = viewer.projectStateBoq(buildState0()).rows.find((row) => row.nodeId === "building-a");
    if (empty === undefined) {
      throw new Error("building row missing");
    }
    expect(viewer.rowQuantitiesText(empty)).toBe("no proposed quantities");
  });

  test("renderBoqTable emits rows with stable ids, origins and steps; removals listed", () => {
    const boq = viewer.projectStateBoq(buildState3());
    const lines = viewer.renderBoqTable(boq).join("\n");
    expect(lines).toContain(`<tr data-node-id="wall-north" data-origin="baseline_touched"`);
    expect(lines).toContain(`<tr data-node-id="wall-partition-new" data-origin="scenario"`);
    expect(lines).toContain("thickness = 120 mm (PROPOSED)");
    expect(lines).toContain(
      `<li data-node-id="wall-east" data-removal-step-id="${STEP3_ID}">wall-east — PROPOSED REMOVAL — Obsolete partition demolished to open the floor plan. (step ${STEP3_ID})</li>`,
    );
    expect(lines).toContain("no proposed quantities");
  });

  test("selectedNodeId marks exactly that node's BOQ row (presentation only)", () => {
    const boq = viewer.projectStateBoq(buildState2());
    const plain = viewer.renderBoqTable(boq).join("\n");
    const selected = viewer.renderBoqTable(boq, "wall-north").join("\n");
    expect(plain).not.toContain(`data-selected="true"`);
    expect(selected.split(`data-selected="true"`).length - 1).toBe(1);
    expect(selected).toContain(`<tr data-node-id="wall-north" data-origin="baseline_touched" data-selected="true"`);
  });

  test("a deep-frozen state survives the BOQ projection unmutated; two runs equal", () => {
    const state = deepFreeze(buildState2());
    const before = JSON.stringify(state);
    const a = viewer.projectStateBoq(state);
    const b = viewer.projectStateBoq(state);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(state)).toBe(before);
  });
});
