/**
 * WORLD-P0-A tests — the substrate-neutral linear algebra (AISE
 * column-vector convention, row-major storage): transform composition,
 * quaternion rotation, parent chains, ray/AABB picking, digests.
 */

import { describe, expect, test } from "bun:test";
import {
  aabbOfPoints,
  composeTransform,
  MAT4_IDENTITY,
  mat4CanonicalJson,
  mat4Multiply,
  rayIntersectAabb,
  transformPoint,
} from "./linalg";

describe("transform composition", () => {
  test("translation + scale: (1,1,1) with scale 2 and translation (1,2,3) maps to (3,4,5)", () => {
    const matrix = composeTransform({ translation: [1, 2, 3], scale: [2, 2, 2] });
    expect(transformPoint(matrix, [1, 1, 1])).toEqual([3, 4, 5]);
  });

  test("identity: no translation, rotation or scale maps points unchanged", () => {
    const matrix = composeTransform({});
    expect(transformPoint(matrix, [7, -8, 9])).toEqual([7, -8, 9]);
  });

  test("a +90-degree rotation about Z maps +X to +Y", () => {
    const matrix = composeTransform({ rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
    const mapped = transformPoint(matrix, [1, 0, 0]);
    expect(mapped[0]).toBeCloseTo(0, 12);
    expect(mapped[1]).toBeCloseTo(1, 12);
    expect(mapped[2]).toBeCloseTo(0, 12);
  });

  test("a -90-degree rotation about X maps +Y to -Z", () => {
    const matrix = composeTransform({ rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2] });
    const mapped = transformPoint(matrix, [0, 1, 0]);
    expect(mapped[0]).toBeCloseTo(0, 12);
    expect(mapped[1]).toBeCloseTo(0, 12);
    expect(mapped[2]).toBeCloseTo(-1, 12);
  });

  test("scale applies before rotation (T*R*S order)", () => {
    // Rotate 90 about Z, then check that scaling happened in the local
    // frame first: point (1, 0, 0) scaled by (2, 3, 4) is (2, 0, 0);
    // rotating 90 about Z yields (0, 2, 0).
    const matrix = composeTransform({
      rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
      scale: [2, 3, 4],
    });
    const mapped = transformPoint(matrix, [1, 0, 0]);
    expect(mapped[0]).toBeCloseTo(0, 12);
    expect(mapped[1]).toBeCloseTo(2, 12);
  });

  test("world = parent * local: a two-level chain composes additively for translations", () => {
    const world = mat4Multiply(
      composeTransform({ translation: [10, 0, 0] }),
      composeTransform({ translation: [1, 0, 0] }),
    );
    expect(transformPoint(world, [0, 0, 0])).toEqual([11, 0, 0]);
  });

  test("a three-level chain with rotation composes exactly", () => {
    const world = mat4Multiply(
      mat4Multiply(
        composeTransform({ translation: [10, 0, 0] }),
        composeTransform({ rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }),
      ),
      composeTransform({ translation: [1, 0, 0] }),
    );
    // local (1,0,0) -> rotated to (0,1,0) -> translated to (10,1,0).
    const mapped = transformPoint(world, [0, 0, 0]);
    expect(mapped[0]).toBeCloseTo(10, 12);
    expect(mapped[1]).toBeCloseTo(1, 12);
    expect(mapped[2]).toBeCloseTo(0, 12);
  });

  test("MAT4_IDENTITY is the identity for multiplication", () => {
    const matrix = composeTransform({ translation: [1, 2, 3] });
    const left = mat4Multiply(MAT4_IDENTITY, matrix);
    const right = mat4Multiply(matrix, MAT4_IDENTITY);
    expect(left).toEqual(matrix);
    expect(right).toEqual(matrix);
  });
});

describe("ray/AABB picking (the slab method)", () => {
  const unitBox = { min: [-1, -1, -1] as const, max: [1, 1, 1] as const };

  test("a ray down -z from z=5 enters at t=4 and exits at t=6", () => {
    const hit = rayIntersectAabb([0, 0, 5], [0, 0, -1], unitBox);
    expect(hit.hit).toBe(true);
    expect(hit.tNear).toBeCloseTo(4, 12);
    expect(hit.tFar).toBeCloseTo(6, 12);
  });

  test("a parallel ray outside the box misses", () => {
    const hit = rayIntersectAabb([5, 0, 5], [0, 0, -1], unitBox);
    expect(hit.hit).toBe(false);
  });

  test("a ray starting inside the box reports a negative tNear (honestly)", () => {
    const hit = rayIntersectAabb([0, 0, 0], [0, 0, -1], unitBox);
    expect(hit.hit).toBe(true);
    expect(hit.tNear).toBeCloseTo(-1, 12);
    expect(hit.tFar).toBeCloseTo(1, 12);
  });

  test("a ray pointing away misses (tFar < 0)", () => {
    const hit = rayIntersectAabb([0, 0, 5], [0, 0, 1], unitBox);
    expect(hit.hit).toBe(false);
  });

  test("a ray with a zero direction component inside the slab still hits", () => {
    const hit = rayIntersectAabb([0, 0, 5], [0, 0, -1], unitBox);
    expect(hit.hit).toBe(true);
    const diagonal = rayIntersectAabb([0, 0, 5], [0, 0, -1], unitBox);
    expect(diagonal.hit).toBe(true);
  });
});

describe("bounding boxes and canonical digests", () => {
  test("aabbOfPoints fits the extremes of a point cloud", () => {
    const box = aabbOfPoints([
      [1, 2, 3],
      [-4, 0, 5],
      [0, -6, -7],
    ]);
    expect(box.min).toEqual([-4, -6, -7]);
    expect(box.max).toEqual([1, 2, 5]);
  });

  test("the canonical matrix digest is stable and rounding-normalized", () => {
    const matrix = composeTransform({ translation: [1, 2, 3], scale: [2, 2, 2] });
    expect(mat4CanonicalJson(matrix)).toBe(mat4CanonicalJson(composeTransform({ translation: [1, 2, 3], scale: [2, 2, 2] })));
    expect(mat4CanonicalJson(matrix)).not.toBe(mat4CanonicalJson(composeTransform({ translation: [9, 9, 9] })));
  });
});
