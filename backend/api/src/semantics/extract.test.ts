/**
 * AISE-015 extraction tests — classification fixtures (including exact
 * thresholds and the honestly-unclassified tilted band), opening
 * door/window bands, dimensions via the geometry library, epistemic
 * discipline (everything INFERRED), provenance, purity and determinism.
 */

import { describe, expect, test } from "bun:test";
import { GeometryError, type Vec3 } from "../geometry";
import {
  DOOR_SILL_MAX_M,
  EXTRACTOR_VERSION,
  FLOOR_MIN_Z,
  WALL_MAX_VERTICALITY,
  WINDOW_SILL_MAX_M,
  WINDOW_SILL_MIN_M,
  extractArchitecturalSemantics,
  type ObservedOpening,
  type ObservedPlane,
  type SemanticElement,
  type SemanticsResult,
} from "./index";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function planeObs(
  sourceArtifactId: string,
  normal: Vec3,
  d: number,
  extra?: Partial<ObservedPlane>,
): ObservedPlane {
  return {
    plane: { normal, d },
    rmsResidual: 0.01,
    pointCount: 120,
    sourceArtifactId,
    ...extra,
  };
}

function openingObs(
  sourceArtifactId: string,
  boundingPolygon: readonly Vec3[],
  facts?: ObservedOpening["facts"],
): ObservedOpening {
  return { boundingPolygon, sourceArtifactId, facts };
}

/** A coherent rectangular room: 4 walls + floor + ceiling + 3 openings. */
function richRoomInput(): {
  planes: ObservedPlane[];
  openings: ObservedOpening[];
} {
  return {
    planes: [
      planeObs("art-wall-w", [1, 0, 0], 0),
      planeObs("art-wall-e", [-1, 0, 0], 4.2),
      planeObs("art-wall-n", [0, 1, 0], 0),
      planeObs("art-wall-s", [0, -1, 0], 3),
      planeObs("art-floor", [0, 0, 1], 0),
      planeObs("art-ceiling", [0, 0, -1], 2.7),
    ],
    openings: [
      openingObs(
        "art-door",
        [
          [0, 0.9, 0],
          [0, 1.0, 0],
          [0, 1.0, 2.05],
          [0, 0.9, 2.05],
        ],
        { reachesFloor: true, sillHeight: 0 },
      ),
      openingObs(
        "art-window",
        [
          [1, 0, 0.9],
          [1.6, 0, 0.9],
          [1.6, 0, 1.8],
          [1, 0, 1.8],
        ],
        { sillHeight: 0.9 },
      ),
      openingObs("art-plain-opening", [
        [4.2, 2, 1],
        [4.2, 2.4, 1],
        [4.2, 2.4, 1.8],
        [4.2, 2, 1.8],
      ]),
    ],
  };
}

function extract(input: {
  planes?: ObservedPlane[];
  openings?: ObservedOpening[];
}): SemanticsResult {
  return extractArchitecturalSemantics({ planes: input.planes ?? [], openings: input.openings });
}

function byKind(result: SemanticsResult, kind: SemanticElement["kind"]): SemanticElement[] {
  return result.elements.filter((e) => e.kind === kind);
}

function firstOf(elements: readonly SemanticElement[]): SemanticElement {
  const head = elements[0];
  if (head === undefined) {
    throw new Error("fixture expected a non-empty element list");
  }
  return head;
}

function prop(element: SemanticElement, key: string): string | number | boolean | undefined {
  return element.properties.find((p) => p.key === key)?.value;
}

/* ------------------------------------------------------------------ */
/* Plane classification                                                */
/* ------------------------------------------------------------------ */

describe("plane classification", () => {
  test("horizontal plane (0,0,1) → floor", () => {
    const result = extract({ planes: [planeObs("a1", [0, 0, 1], 0)] });
    expect(result.elements).toHaveLength(1);
    expect(result.elements[0]?.kind).toBe("floor");
    expect(result.stats.floors).toBe(1);
  });

  test("horizontal plane (0,0,-1) → ceiling", () => {
    const result = extract({ planes: [planeObs("a1", [0, 0, -1], 2.7)] });
    expect(result.elements[0]?.kind).toBe("ceiling");
    expect(result.stats.ceilings).toBe(1);
  });

  test("vertical planes (1,0,0), (0,1,0), (0,-1,0) → wall", () => {
    const result = extract({
      planes: [
        planeObs("a1", [1, 0, 0], 0),
        planeObs("a2", [0, 1, 0], 0),
        planeObs("a3", [0, -1, 0], 3),
      ],
    });
    expect(result.stats.walls).toBe(3);
    expect(result.elements.every((e) => e.kind === "wall")).toBe(true);
  });

  test("45° tilted plane is honestly UNCLASSIFIED (|z|=0.707 is no band)", () => {
    const tilted: Vec3 = [Math.SQRT1_2, 0, Math.SQRT1_2];
    const result = extract({ planes: [planeObs("a1", tilted, 1)] });
    expect(result.elements).toHaveLength(0);
    expect(result.stats.walls).toBe(0);
    expect(result.unclassified).toHaveLength(1);
    expect(result.unclassified[0]?.reason).toContain(String(Math.SQRT1_2));
    expect(result.unclassified[0]?.reason).toContain(`< ${WALL_MAX_VERTICALITY}`);
    expect(result.unclassified[0]?.reason).toContain(`> ${FLOOR_MIN_Z}`);
  });

  test("boundary: |z| exactly WALL_MAX_VERTICALITY is unclassified (strict <)", () => {
    const result = extract({ planes: [planeObs("a1", [Math.sqrt(0.99), 0, 0.1], 0)] });
    expect(result.elements).toHaveLength(0);
    expect(result.unclassified[0]?.reason).toContain("strict thresholds");
  });

  test("boundary: |z| just below the wall threshold is a wall", () => {
    const result = extract({ planes: [planeObs("a1", [Math.sqrt(1 - 0.099 * 0.099), 0, 0.099], 0)] });
    expect(result.stats.walls).toBe(1);
  });

  test("boundary: z exactly FLOOR_MIN_Z is unclassified (strict >)", () => {
    const result = extract({ planes: [planeObs("a1", [Math.sqrt(0.19), 0, 0.9], 0)] });
    expect(result.elements).toHaveLength(0);
    expect(result.unclassified).toHaveLength(1);
  });

  test("boundary: z exactly -FLOOR_MIN_Z is unclassified (strict <)", () => {
    const result = extract({ planes: [planeObs("a1", [Math.sqrt(0.19), 0, -0.9], 0)] });
    expect(result.elements).toHaveLength(0);
    expect(result.unclassified).toHaveLength(1);
  });

  test("just inside the floor/ceiling bands", () => {
    const floor = extract({ planes: [planeObs("a1", [0, 0, 0.91], 0)] });
    const ceiling = extract({ planes: [planeObs("a1", [0, 0, -0.91], 0)] });
    expect(floor.stats.floors).toBe(1);
    expect(ceiling.stats.ceilings).toBe(1);
  });

  test("zero-length normal is unclassified with a reason naming the degeneracy", () => {
    const result = extract({ planes: [planeObs("a1", [0, 0, 0], 0)] });
    expect(result.elements).toHaveLength(0);
    expect(result.unclassified[0]?.reason).toContain("zero-length plane normal");
  });

  test("non-unit normal is normalized before classification and storage", () => {
    // (0,0,2)·x + 5 = 0 is the same plane as z + 2.5 = 0 (unit normal up).
    const result = extract({ planes: [planeObs("a1", [0, 0, 2], 5)] });
    const element = firstOf(result.elements);
    expect(element.kind).toBe("floor");
    expect(element.geometry.plane?.normal).toEqual([0, 0, 1]);
    expect(element.geometry.plane?.d).toBe(2.5);
    expect(prop(element, "classificationNormalZ")).toBe(1);
  });

  test("classification emits FACTS (basis + normalZ), never scores", () => {
    const result = extract({ planes: [planeObs("a1", [1, 0, 0], 0)] });
    const element = firstOf(result.elements);
    expect(prop(element, "classificationBasis")).toBe("normal-direction");
    expect(prop(element, "classificationNormalZ")).toBe(0);
    expect(prop(element, "planePointCount")).toBe(120);
    expect(prop(element, "planeRmsResidual")).toBe(0.01);
  });

  test("no property key anywhere mentions confidence/readiness/scores", () => {
    const result = extract(richRoomInput());
    const banned = /confidence|readiness|score/i;
    for (const element of result.elements) {
      for (const property of element.properties) {
        expect(banned.test(property.key)).toBe(false);
      }
    }
  });

  test("observedAt is passed through as a fact when present", () => {
    const result = extract({
      planes: [planeObs("a1", [0, 0, 1], 0, { observedAt: "2026-07-01T10:00:00Z" })],
    });
    expect(prop(firstOf(result.elements), "observedAt")).toBe("2026-07-01T10:00:00Z");
  });

  test("bit-identical duplicate observation (same artifact + plane) collapses", () => {
    const result = extract({
      planes: [planeObs("a1", [1, 0, 0], 0), planeObs("a1", [1, 0, 0], 0)],
    });
    expect(result.stats.walls).toBe(1);
    expect(result.unclassified).toHaveLength(0);
  });

  test("element ids are content-derived and stable; different artifacts differ", () => {
    const a = extract({ planes: [planeObs("a1", [1, 0, 0], 0)] });
    const again = extract({ planes: [planeObs("a1", [1, 0, 0], 0)] });
    const b = extract({ planes: [planeObs("a2", [1, 0, 0], 0)] });
    const idA = firstOf(a.elements).elementId;
    expect(idA.startsWith("wall-")).toBe(true);
    expect(idA.length).toBe("wall-".length + 12);
    expect(firstOf(again.elements).elementId).toBe(idA);
    expect(firstOf(b.elements).elementId).not.toBe(idA);
  });
});

/* ------------------------------------------------------------------ */
/* Opening classification                                              */
/* ------------------------------------------------------------------ */

describe("opening classification", () => {
  test("reachesFloor=true → door (even with a conflicting sill height)", () => {
    const result = extract({
      openings: [openingObs("o1", [[0, 0, 0], [0, 1, 0], [0, 1, 2], [0, 0, 2]], { reachesFloor: true, sillHeight: 1.0 })],
    });
    expect(result.stats.doors).toBe(1);
    expect(prop(firstOf(result.elements), "reachesFloor")).toBe(true);
    expect(prop(firstOf(result.elements), "sillHeight")).toBe(1.0);
  });

  test("sill height below the door threshold → door", () => {
    const result = extract({
      openings: [openingObs("o1", [[0, 0, 0.1], [0, 1, 0.1], [0, 1, 2], [0, 0, 2]], { sillHeight: 0.1 })],
    });
    expect(result.stats.doors).toBe(1);
  });

  test("sill height 1.0 m (window band) → window", () => {
    const result = extract({
      openings: [openingObs("o1", [[0, 0, 1], [0, 1, 1], [0, 1, 1.8], [0, 0, 1.8]], { sillHeight: 1.0 })],
    });
    expect(result.stats.windows).toBe(1);
  });

  test("window band bounds are inclusive: 0.8 and 1.2 are windows", () => {
    const low = extract({ openings: [openingObs("o1", [[0, 0, 0.8]], { sillHeight: WINDOW_SILL_MIN_M })] });
    const high = extract({ openings: [openingObs("o2", [[0, 0, 1.2]], { sillHeight: WINDOW_SILL_MAX_M })] });
    expect(low.stats.windows).toBe(1);
    expect(high.stats.windows).toBe(1);
  });

  test("no facts → stays kind 'opening' with an explicit unclassifiedReason", () => {
    const result = extract({
      openings: [openingObs("o1", [[0, 0, 1], [0, 1, 1], [0, 1, 2], [0, 0, 2]])],
    });
    expect(result.stats.openings).toBe(1);
    expect(result.stats.unclassified).toBe(1);
    const reason = prop(firstOf(result.elements), "unclassifiedReason") as string;
    expect(reason).toContain("insufficient facts");
    expect(result.unclassified[0]?.reason).toBe(reason);
  });

  test("reachesFloor=false without sill height stays 'opening'", () => {
    const result = extract({
      openings: [openingObs("o1", [[0, 0, 1]], { reachesFloor: false })],
    });
    expect(result.stats.openings).toBe(1);
    expect(prop(firstOf(result.elements), "reachesFloor")).toBe(false);
  });

  test("sill 0.5 m (between bands) stays 'opening', reason names BOTH bands", () => {
    const result = extract({
      openings: [openingObs("o1", [[0, 0, 0.5]], { sillHeight: 0.5 })],
    });
    expect(result.stats.openings).toBe(1);
    const reason = prop(firstOf(result.elements), "unclassifiedReason") as string;
    expect(reason).toContain(String(DOOR_SILL_MAX_M));
    expect(reason).toContain(String(WINDOW_SILL_MIN_M));
    expect(reason).toContain(String(WINDOW_SILL_MAX_M));
    expect(reason).toContain("0.5");
  });

  test("boundary: sill exactly DOOR_SILL_MAX_M misses the door band (strict <)", () => {
    const result = extract({
      openings: [openingObs("o1", [[0, 0, 0.3]], { sillHeight: 0.3 })],
    });
    expect(result.stats.openings).toBe(1);
    expect(result.stats.doors).toBe(0);
  });

  test("boundary polygon is copied, not aliased, from the input", () => {
    const polygon: Vec3[] = [
      [0, 0, 1],
      [0, 1, 1],
    ];
    const input = { openings: [openingObs("o1", polygon, { sillHeight: 1.0 })] };
    const result = extract(input);
    const stored = firstOf(result.elements).geometry.boundaryPolygon;
    expect(stored).toEqual(polygon);
    expect(stored === polygon).toBe(false);
    expect(stored?.[0] === polygon[0]).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Dimensions (geometry library)                                       */
/* ------------------------------------------------------------------ */

describe("dimensions", () => {
  test("floor z=0 + ceiling z=2.7 → height 2.7 with null uncertainty (preserved)", () => {
    const result = extract({
      planes: [planeObs("f", [0, 0, 1], 0), planeObs("c", [0, 0, -1], 2.7)],
    });
    const floor = firstOf(byKind(result, "floor"));
    const ceiling = firstOf(byKind(result, "ceiling"));
    expect(floor.geometry.height?.value).toBe(2.7);
    expect(floor.geometry.height?.uncertainty).toBeNull();
    expect(ceiling.geometry.height?.value).toBe(2.7);
    expect(ceiling.geometry.height?.uncertainty).toBeNull();
    expect(prop(floor, "floorToCeilingHeight")).toBe(2.7);
  });

  test("height property note names the method and BOTH source artifacts", () => {
    const result = extract({
      planes: [planeObs("art-f", [0, 0, 1], 0), planeObs("art-c", [0, 0, -1], 2.7)],
    });
    const note = firstOf(byKind(result, "floor")).properties.find(
      (p) => p.key === "floorToCeilingHeight",
    )?.note;
    expect(note).toContain("dimensionBetweenParallelPlanes");
    expect(note).toContain("art-f");
    expect(note).toContain("art-c");
  });

  test("uncertainty composes from explicit plane offsetSigma via the library", () => {
    const result = extract({
      planes: [
        planeObs("f", [0, 0, 1], 0, { offsetSigma: 0.01 }),
        planeObs("c", [0, 0, -1], 2.7, { offsetSigma: 0.02 }),
      ],
    });
    expect(firstOf(byKind(result, "floor")).geometry.height?.uncertainty).toBeCloseTo(
      Math.sqrt(0.01 * 0.01 + 0.02 * 0.02),
      12,
    );
  });

  test("unknown offset σ (null or omitted) keeps the dimension uncertainty null", () => {
    const withNull = extract({
      planes: [
        planeObs("f", [0, 0, 1], 0, { offsetSigma: 0.01 }),
        planeObs("c", [0, 0, -1], 2.7, { offsetSigma: null }),
      ],
    });
    const omitted = extract({
      planes: [planeObs("f", [0, 0, 1], 0), planeObs("c", [0, 0, -1], 2.7)],
    });
    expect(firstOf(byKind(withNull, "floor")).geometry.height?.uncertainty).toBeNull();
    expect(firstOf(byKind(omitted, "floor")).geometry.height?.uncertainty).toBeNull();
  });

  test("negative offsetSigma fails closed with a typed geometry error", () => {
    let caught: unknown;
    try {
      extract({
        planes: [
          planeObs("f", [0, 0, 1], 0, { offsetSigma: -0.1 }),
          planeObs("c", [0, 0, -1], 2.7, { offsetSigma: 0.01 }),
        ],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GeometryError);
    expect((caught as GeometryError).code).toBe("INVALID_INPUT");
  });

  test("non-parallel (tilted) ceiling → no height, floor keeps its kind", () => {
    const result = extract({
      planes: [planeObs("f", [0, 0, 1], 0), planeObs("c", [Math.SQRT1_2, 0, Math.SQRT1_2], 2.7)],
    });
    expect(result.stats.floors).toBe(1);
    expect(result.stats.ceilings).toBe(0);
    expect(firstOf(byKind(result, "floor")).geometry.height).toBeUndefined();
    expect(result.unclassified).toHaveLength(1);
  });

  test("multiple parallel ceilings: floor takes the minimum separation", () => {
    const result = extract({
      planes: [
        planeObs("f", [0, 0, 1], 0),
        planeObs("c1", [0, 0, -1], 2.7),
        planeObs("c2", [0, 0, -1], 3.3),
      ],
    });
    expect(firstOf(byKind(result, "floor")).geometry.height?.value).toBe(2.7);
    expect(result.stats.ceilings).toBe(2);
  });

  test("parallel walls derive width (E/W 4.2 m, N/S 3.0 m)", () => {
    const result = extract(richRoomInput());
    for (const element of byKind(result, "wall")) {
      expect(element.geometry.width).toBeDefined();
      expect(element.properties.some((p) => p.key === "distanceToNearestParallelWall")).toBe(true);
    }
    expect(firstOf(byKind(result, "wall")).geometry.width?.value).toBe(4.2);
  });

  test("wall without a parallel partner gets no width", () => {
    const result = extract({
      planes: [planeObs("w", [1, 0, 0], 0), planeObs("n", [0, 1, 0], 0)],
    });
    for (const element of byKind(result, "wall")) {
      expect(element.geometry.width).toBeUndefined();
      expect(element.properties.some((p) => p.key === "distanceToNearestParallelWall")).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Epistemics, provenance, stats, purity, determinism                  */
/* ------------------------------------------------------------------ */

describe("epistemic discipline and provenance", () => {
  test("ALL emitted elements and properties are INFERRED (exhaustive)", () => {
    const result = extract(richRoomInput());
    expect(result.elements.length).toBeGreaterThanOrEqual(8);
    for (const element of result.elements) {
      expect(element.epistemicStatus).toBe("INFERRED");
      for (const property of element.properties) {
        expect(property.epistemicStatus).toBe("INFERRED");
      }
    }
  });

  test("provenance carries the extractor version and source artifact ids verbatim", () => {
    const result = extract(richRoomInput());
    for (const element of result.elements) {
      expect(element.provenance.extractorVersion).toBe(EXTRACTOR_VERSION);
      expect(element.provenance.extractorVersion).toBe("aise-semantics/1.0");
      expect(element.provenance.sourceArtifactIds).toHaveLength(1);
      expect(element.provenance.sourceArtifactIds[0]).toMatch(/^art-/);
    }
    const door = result.elements.find((e) => e.kind === "door");
    expect(door?.provenance.sourceArtifactIds).toEqual(["art-door"]);
  });
});

describe("stats", () => {
  test("rich room fixture counts every kind and the honest unknown", () => {
    const result = extract(richRoomInput());
    expect(result.stats).toEqual({
      walls: 4,
      floors: 1,
      ceilings: 1,
      openings: 1,
      doors: 1,
      windows: 1,
      unclassified: 1,
    });
    expect(result.elements).toHaveLength(9);
  });
});

describe("purity and determinism", () => {
  test("extraction never mutates the input (JSON snapshot)", () => {
    const input = richRoomInput();
    const before = JSON.stringify(input);
    extract(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  test("extraction does not write into a deep-frozen input", () => {
    const input = richRoomInput();
    deepFreeze(input);
    expect(() => extract(input)).not.toThrow();
  });

  test("same input twice → byte-identical JSON result", () => {
    const input = richRoomInput();
    const first = extract(input);
    const second = extract(structuredClone(input));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
