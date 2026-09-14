/**
 * AISE-015 consistency tests — clean fixtures produce ZERO findings;
 * OPENING_UNANCHORED / DUPLICATE_ELEMENT / normal-coherence findings carry
 * stable codes + measured values; extraction-level mutations reclassify and
 * create/remove findings; the check is pure and deterministic.
 */

import { describe, expect, test } from "bun:test";
import { type Vec3 } from "../geometry";
import {
  OPENING_ANCHOR_TOLERANCE_M,
  checkSemanticConsistency,
  extractArchitecturalSemantics,
  type GeometryObservationInput,
  type ObservedOpening,
  type ObservedPlane,
  type SemanticElement,
  type SemanticFinding,
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

function richRoomInput(): GeometryObservationInput {
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
      openingObs("art-door", [
        [0, 0.9, 0],
        [0, 1.0, 0],
        [0, 1.0, 2.05],
        [0, 0.9, 2.05],
      ], { reachesFloor: true }),
      openingObs("art-window", [
        [1, 0, 0.9],
        [1.6, 0, 0.9],
        [1.6, 0, 1.8],
        [1, 0, 1.8],
      ], { sillHeight: 0.9 }),
      openingObs("art-plain-opening", [
        [4.2, 2, 1],
        [4.2, 2.4, 1],
        [4.2, 2.4, 1.8],
        [4.2, 2, 1.8],
      ]),
    ],
  };
}

function check(
  elements: readonly SemanticElement[],
  input: GeometryObservationInput,
): readonly SemanticFinding[] {
  return checkSemanticConsistency(elements, input).findings;
}

function codes(findings: readonly SemanticFinding[]): readonly string[] {
  return findings.map((f) => f.code);
}

/** Immutably override an element's plane normal (mutation helper). */
function withNormal(
  element: SemanticElement,
  normal: Vec3,
): SemanticElement {
  return {
    ...element,
    geometry: {
      ...element.geometry,
      plane: element.geometry.plane === undefined ? undefined : { ...element.geometry.plane, normal },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Clean fixtures                                                      */
/* ------------------------------------------------------------------ */

describe("clean fixtures", () => {
  test("coherent extracted room → zero findings", () => {
    const input = richRoomInput();
    const elements = extractArchitecturalSemantics(input).elements;
    expect(check(elements, input)).toEqual([]);
  });

  test("floor and ceiling sharing one plane are NOT duplicates (per-kind check)", () => {
    const input: GeometryObservationInput = {
      planes: [planeObs("f", [0, 0, 1], 0), planeObs("c", [0, 0, -1], 0)],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    expect(check(elements, input)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* OPENING_UNANCHORED                                                  */
/* ------------------------------------------------------------------ */

describe("OPENING_UNANCHORED", () => {
  test("opening centroid far from all walls → finding with the measured distance", () => {
    const input: GeometryObservationInput = {
      planes: [planeObs("w1", [1, 0, 0], 0)],
      openings: [openingObs("o-far", [[5, 0, 1]])],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    const findings = check(elements, input);
    expect(codes(findings)).toEqual(["OPENING_UNANCHORED"]);
    expect(findings[0]?.measuredValue).toBeCloseTo(5, 12);
    expect(findings[0]?.elementId).toBeNull();
    expect(findings[0]?.detail).toContain("o-far");
    expect(findings[0]?.detail).toContain(String(OPENING_ANCHOR_TOLERANCE_M));
  });

  test("centroid exactly at the tolerance distance is anchored (strict >)", () => {
    const input: GeometryObservationInput = {
      planes: [planeObs("w1", [1, 0, 0], 0)],
      openings: [openingObs("o-edge", [[0.15, 0, 1]])],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    expect(check(elements, input)).toEqual([]);
  });

  test("centroid just beyond the tolerance distance → finding", () => {
    const input: GeometryObservationInput = {
      planes: [planeObs("w1", [1, 0, 0], 0)],
      openings: [openingObs("o-edge", [[0.16, 0, 1]])],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    const findings = check(elements, input);
    expect(codes(findings)).toEqual(["OPENING_UNANCHORED"]);
    expect(findings[0]?.measuredValue).toBeCloseTo(0.16, 12);
  });

  test("no wall elements at all → finding with null measured value", () => {
    const input: GeometryObservationInput = {
      planes: [planeObs("f", [0, 0, 1], 0)],
      openings: [openingObs("o1", [[0, 0, 1]])],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    const findings = check(elements, input);
    expect(codes(findings)).toEqual(["OPENING_UNANCHORED"]);
    expect(findings[0]?.measuredValue).toBeNull();
    expect(findings[0]?.detail).toContain("no wall");
  });

  test("empty bounding polygon → finding naming the undefined centroid", () => {
    const input: GeometryObservationInput = {
      planes: [planeObs("w1", [1, 0, 0], 0)],
      openings: [openingObs("o-empty", [])],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    const findings = check(elements, input);
    expect(codes(findings)).toEqual(["OPENING_UNANCHORED"]);
    expect(findings[0]?.measuredValue).toBeNull();
    expect(findings[0]?.detail).toContain("empty bounding polygon");
  });
});

/* ------------------------------------------------------------------ */
/* DUPLICATE_ELEMENT                                                   */
/* ------------------------------------------------------------------ */

describe("DUPLICATE_ELEMENT", () => {
  test("two identical walls from different artifacts → finding naming both ids", () => {
    const input: GeometryObservationInput = {
      planes: [planeObs("w1", [1, 0, 0], 0), planeObs("w2", [1, 0, 0], 0)],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    expect(elements).toHaveLength(2);
    const findings = check(elements, input);
    expect(codes(findings)).toEqual(["DUPLICATE_ELEMENT"]);
    const firstId = elements[0]?.elementId;
    const partnerId = elements[1]?.elementId;
    if (firstId === undefined || partnerId === undefined) {
      throw new Error("fixture expected two wall elements");
    }
    expect(findings[0]?.elementId).toBe(firstId);
    expect(findings[0]?.relatedElementIds).toEqual([partnerId]);
    expect(findings[0]?.measuredValue).toBe(0);
  });

  test("near-identical walls (|Δd| = 0.005 m) → finding with the offset delta", () => {
    const input: GeometryObservationInput = {
      planes: [planeObs("w1", [1, 0, 0], 0), planeObs("w2", [1, 0, 0], 0.005)],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    const findings = check(elements, input);
    expect(codes(findings)).toEqual(["DUPLICATE_ELEMENT"]);
    expect(findings[0]?.measuredValue).toBeCloseTo(0.005, 12);
  });

  test("boundary: |Δd| exactly at the tolerance (0.01 m) is NOT a duplicate", () => {
    const input: GeometryObservationInput = {
      planes: [planeObs("w1", [1, 0, 0], 0), planeObs("w2", [1, 0, 0], 0.01)],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    expect(check(elements, input)).toEqual([]);
  });

  test("walls 0.01 rad apart are NOT duplicates (dot below threshold)", () => {
    const input: GeometryObservationInput = {
      planes: [
        planeObs("w1", [1, 0, 0], 0),
        planeObs("w2", [Math.cos(0.01), Math.sin(0.01), 0], 0),
      ],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    expect(check(elements, input)).toEqual([]);
  });

  test("anti-parallel re-detection of the same plane IS a duplicate", () => {
    const input: GeometryObservationInput = {
      planes: [planeObs("w1", [1, 0, 0], 0), planeObs("w2", [-1, 0, 0], 0)],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    expect(codes(check(elements, input))).toEqual(["DUPLICATE_ELEMENT"]);
  });

  test("distant parallel walls (opposite room faces) are NOT duplicates", () => {
    const input: GeometryObservationInput = {
      planes: [planeObs("w1", [1, 0, 0], 0), planeObs("w2", [-1, 0, 0], 4.2)],
    };
    const elements = extractArchitecturalSemantics(input).elements;
    expect(check(elements, input)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Normal-direction coherence                                          */
/* ------------------------------------------------------------------ */

describe("normal-direction coherence findings", () => {
  test("wall element with a non-horizontal normal → WALL_NORMAL_NOT_HORIZONTAL", () => {
    const input: GeometryObservationInput = { planes: [planeObs("w1", [1, 0, 0], 0)] };
    const elements = extractArchitecturalSemantics(input).elements.map((e) =>
      withNormal(e, [1, 0, 0.2]),
    );
    const findings = check(elements, input);
    expect(codes(findings)).toEqual(["WALL_NORMAL_NOT_HORIZONTAL"]);
    expect(findings[0]?.measuredValue).toBeCloseTo(0.2 / Math.sqrt(1.04), 12);
    expect(findings[0]?.elementId).toBe(elements[0]?.elementId);
  });

  test("floor element whose normal does not point up → FLOOR_NORMAL_NOT_UPWARD", () => {
    const input: GeometryObservationInput = { planes: [planeObs("f", [0, 0, 1], 0)] };
    const elements = extractArchitecturalSemantics(input).elements.map((e) =>
      withNormal(e, [1, 0, 0.2]),
    );
    const findings = check(elements, input);
    expect(codes(findings)).toEqual(["FLOOR_NORMAL_NOT_UPWARD"]);
    expect(findings[0]?.measuredValue).toBeCloseTo(0.2 / Math.sqrt(1.04), 12);
  });

  test("ceiling element whose normal does not point down → CEILING_NORMAL_NOT_DOWNWARD", () => {
    const input: GeometryObservationInput = { planes: [planeObs("c", [0, 0, -1], 0)] };
    const elements = extractArchitecturalSemantics(input).elements.map((e) =>
      withNormal(e, [1, 0, 0.2]),
    );
    const findings = check(elements, input);
    expect(codes(findings)).toEqual(["CEILING_NORMAL_NOT_DOWNWARD"]);
    expect(findings[0]?.measuredValue).toBeCloseTo(0.2 / Math.sqrt(1.04), 12);
  });

  test("zero-length plane normal on a wall → finding with null measured value", () => {
    const input: GeometryObservationInput = { planes: [planeObs("w1", [1, 0, 0], 0)] };
    const elements = extractArchitecturalSemantics(input).elements.map((e) =>
      withNormal(e, [0, 0, 0]),
    );
    const findings = check(elements, input);
    expect(codes(findings)).toEqual(["WALL_NORMAL_NOT_HORIZONTAL"]);
    expect(findings[0]?.measuredValue).toBeNull();
    expect(findings[0]?.detail).toContain("zero-length");
  });
});

/* ------------------------------------------------------------------ */
/* Mutation cases (extraction flips classification; findings follow)   */
/* ------------------------------------------------------------------ */

describe("mutation cases", () => {
  test("flipping the floor normal to vertical reclassifies it as a wall AND creates a duplicate", () => {
    const mutated: GeometryObservationInput = {
      ...richRoomInput(),
      planes: [
        planeObs("art-wall-w", [1, 0, 0], 0),
        planeObs("art-wall-e", [-1, 0, 0], 4.2),
        planeObs("art-wall-n", [0, 1, 0], 0),
        planeObs("art-wall-s", [0, -1, 0], 3),
        planeObs("art-floor", [1, 0, 0], 0),
        planeObs("art-ceiling", [0, 0, -1], 2.7),
      ],
    };
    const result = extractArchitecturalSemantics(mutated);
    expect(result.stats.floors).toBe(0);
    expect(result.stats.walls).toBe(5);
    const findings = check(result.elements, mutated);
    expect(codes(findings)).toContain("DUPLICATE_ELEMENT");
    expect(findings).toHaveLength(1);
  });

  test("tilting the ceiling to 45° unclassifies it and removes the floor height", () => {
    const mutated: GeometryObservationInput = {
      ...richRoomInput(),
      planes: [
        planeObs("art-wall-w", [1, 0, 0], 0),
        planeObs("art-wall-e", [-1, 0, 0], 4.2),
        planeObs("art-wall-n", [0, 1, 0], 0),
        planeObs("art-wall-s", [0, -1, 0], 3),
        planeObs("art-floor", [0, 0, 1], 0),
        planeObs("art-ceiling", [Math.SQRT1_2, 0, Math.SQRT1_2], 2.7),
      ],
    };
    const result = extractArchitecturalSemantics(mutated);
    expect(result.stats.ceilings).toBe(0);
    expect(result.unclassified).toHaveLength(2); // tilted plane + plain opening
    const floor = result.elements.find((e) => e.kind === "floor");
    expect(floor?.geometry.height).toBeUndefined();
    expect(check(result.elements, mutated)).toEqual([]);
  });

  test("tilting a wall normal unclassifies the wall and drops its partner's width", () => {
    const mutated: GeometryObservationInput = {
      ...richRoomInput(),
      planes: [
        planeObs("art-wall-w", [Math.SQRT1_2, 0, Math.SQRT1_2], 0),
        planeObs("art-wall-e", [-1, 0, 0], 4.2),
        planeObs("art-wall-n", [0, 1, 0], 0),
        planeObs("art-wall-s", [0, -1, 0], 3),
        planeObs("art-floor", [0, 0, 1], 0),
        planeObs("art-ceiling", [0, 0, -1], 2.7),
      ],
    };
    const result = extractArchitecturalSemantics(mutated);
    expect(result.stats.walls).toBe(3);
    const east = result.elements.find(
      (e) => e.kind === "wall" && e.provenance.sourceArtifactIds[0] === "art-wall-e",
    );
    expect(east?.geometry.width).toBeUndefined();
    // The door that lived on the vanished wall is now honestly unanchored.
    const findings = check(result.elements, mutated);
    expect(codes(findings)).toEqual(["OPENING_UNANCHORED"]);
    expect(findings[0]?.measuredValue).toBeCloseTo(0.95, 12);
  });

  test("moving an opening away from every wall creates OPENING_UNANCHORED", () => {
    const mutated: GeometryObservationInput = {
      ...richRoomInput(),
      openings: [
        openingObs("art-door", [
          [5, 0.9, 0],
          [5, 1.0, 0],
          [5, 1.0, 2.05],
          [5, 0.9, 2.05],
        ], { reachesFloor: true }),
        openingObs("art-window", [
          [1, 0, 0.9],
          [1.6, 0, 0.9],
          [1.6, 0, 1.8],
          [1, 0, 1.8],
        ], { sillHeight: 0.9 }),
        openingObs("art-plain-opening", [
          [4.2, 2, 1],
          [4.2, 2.4, 1],
          [4.2, 2.4, 1.8],
          [4.2, 2, 1.8],
        ]),
      ],
    };
    const result = extractArchitecturalSemantics(mutated);
    const findings = check(result.elements, mutated);
    expect(codes(findings)).toEqual(["OPENING_UNANCHORED"]);
    expect(findings[0]?.measuredValue).toBeCloseTo(0.8, 12);
    expect(findings[0]?.detail).toContain("art-door");
  });
});

/* ------------------------------------------------------------------ */
/* Purity and determinism                                              */
/* ------------------------------------------------------------------ */

describe("purity and determinism", () => {
  test("the check never mutates elements or input (JSON snapshots)", () => {
    const input = richRoomInput();
    const elements = extractArchitecturalSemantics(input).elements;
    const elementsSnapshot = JSON.stringify(elements);
    const inputSnapshot = JSON.stringify(input);
    check(elements, input);
    expect(JSON.stringify(elements)).toBe(elementsSnapshot);
    expect(JSON.stringify(input)).toBe(inputSnapshot);
  });

  test("the same elements + input produce byte-identical reports", () => {
    const input = richRoomInput();
    const elements = extractArchitecturalSemantics(input).elements;
    const first = checkSemanticConsistency(elements, input);
    const second = checkSemanticConsistency(elements, structuredClone(input));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
