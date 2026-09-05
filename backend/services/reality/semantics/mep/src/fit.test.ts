/**
 * Unit tests for the deterministic clustering and cylinder fit
 * (AISE-026) — the estimator contracts before composition.
 */
import { describe, expect, it } from "vitest";
import type { GeomPoint } from "@aise/backend-geometry";
import { clusterPoints } from "./cluster.js";
import { distanceToSegment, fitCylinder } from "./fit.js";

/** Samples one axis-aligned pipe shell (test helper). */
function shell(
  start: [number, number, number],
  end: [number, number, number],
  radius: number,
  axisSteps = 80,
  ringCount = 16,
): GeomPoint[] {
  const [ax, ay, az] = start;
  const [bx, by, bz] = end;
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  const u = [dx / length, dy / length, dz / length];
  // Perpendicular frame: for axis-aligned pipes pick the world axes.
  // Perpendicular ring frame: Gram-Schmidt the world axis least
  // aligned with the pipe axis (the fixture's rule).
  const candidates = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let world = candidates[0]!;
  let best = Math.abs(world[0]! * u[0]! + world[1]! * u[1]! + world[2]! * u[2]!);
  for (let ci = 1; ci < 3; ci += 1) {
    const c = candidates[ci]!;
    const alignment = Math.abs(c[0]! * u[0]! + c[1]! * u[1]! + c[2]! * u[2]!);
    if (alignment < best) {
      world = c;
      best = alignment;
    }
  }
  const dotU = world[0]! * u[0]! + world[1]! * u[1]! + world[2]! * u[2]!;
  let ex = world[0]! - u[0]! * dotU;
  let ey = world[1]! - u[1]! * dotU;
  let ez = world[2]! - u[2]! * dotU;
  const eNorm = Math.hypot(ex, ey, ez);
  ex /= eNorm; ey /= eNorm; ez /= eNorm;
  const e = [ex, ey, ez];
  const f = [u[1]! * ez - u[2]! * ey, u[2]! * ex - u[0]! * ez, u[0]! * ey - u[1]! * ex];
  const points: GeomPoint[] = [];
  for (let step = 0; step <= axisSteps; step += 1) {
    const t = (step / axisSteps) * length;
    for (let ring = 0; ring < ringCount; ring += 1) {
      const theta = (2 * Math.PI * ring) / ringCount;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      points.push({
        x: ax + u[0]! * t + radius * (cos * e[0]! + sin * f[0]!),
        y: ay + u[1]! * t + radius * (cos * e[1]! + sin * f[1]!),
        z: az + u[2]! * t + radius * (cos * e[2]! + sin * f[2]!),
      });
    }
  }
  return points;
}

describe("clusterPoints", () => {
  it("clusters a single pipe's shell into one cluster (canonical order)", () => {
    const points = shell([0, 0, 0], [4, 0, 0], 0.05);
    const clusters = clusterPoints([...points].reverse(), 0.1);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.points).toHaveLength(points.length);
  });

  it("separates two distant pipes and ignores input order", () => {
    const a = shell([0, 0, 0], [4, 0, 0], 0.05);
    const b = shell([0, 1.2, 0], [4, 1.2, 0], 0.05);
    for (const input of [[...a, ...b], [...b, ...a]]) {
      const clusters = clusterPoints(input, 0.1);
      expect(clusters).toHaveLength(2);
      expect(clusters[0]!.points.length).toBe(a.length);
    }
  });

  it("rejects invalid radii (fail closed)", () => {
    expect(() => clusterPoints([{ x: 0, y: 0, z: 0 }], 0)).toThrow();
    expect(() => clusterPoints([{ x: 0, y: 0, z: 0 }], -1)).toThrow();
  });
});

describe("fitCylinder", () => {
  it("fits an exact +X pipe: axis, centerline extremes, diameter = 2R", () => {
    const fit = fitCylinder(shell([0, 0, 1], [4, 0, 1], 0.05));
    expect(fit.axis.x).toBeCloseTo(1, 6);
    expect(Math.abs(fit.axis.y)).toBeLessThan(1e-9);
    expect(fit.diameter).toBeCloseTo(0.1, 6);
    expect(fit.length).toBeCloseTo(4, 6);
    // Centerline endpoints: the extreme projected points (start < end lexicographically).
    expect(fit.start.x).toBeCloseTo(0, 6);
    expect(fit.end.x).toBeCloseTo(4, 6);
    expect(fit.start.y).toBeCloseTo(0, 6);
    expect(fit.start.z).toBeCloseTo(1, 6);
    // Exact shell: residuals ~0.
    expect(fit.residuals.rms).toBeLessThan(1e-6);
  });

  it("canonicalizes the axis sign (first nonzero component positive)", () => {
    // A pipe sampled from high to low X still fits +X (sign canonical).
    const fit = fitCylinder(shell([4, 0, 0], [0, 0, 0], 0.05));
    expect(fit.axis.x).toBeCloseTo(1, 6);
    expect(fit.start.x).toBeCloseTo(0, 6);
    expect(fit.end.x).toBeCloseTo(4, 6);
  });

  it("fits a +Y pipe and a diagonal pipe honestly (fitted, not snapped)", () => {
    const y = fitCylinder(shell([2, 0, 1], [2, 1.2, 1], 0.0325));
    expect(y.axis.y).toBeCloseTo(1, 6);
    expect(y.diameter).toBeCloseTo(0.065, 6);
    expect(y.length).toBeCloseTo(1.2, 6);
    const diagonal = fitCylinder(shell([0, 0, 0], [3, 3, 0], 0.04));
    expect(Math.abs(diagonal.axis.x - Math.SQRT1_2)).toBeLessThan(1e-6);
    expect(diagonal.axis.y).toBeCloseTo(Math.SQRT1_2, 6);
    expect(diagonal.length).toBeCloseTo(Math.hypot(3, 3), 6);
  });

  it("rejects degenerate inputs (fail closed)", () => {
    expect(() => fitCylinder([])).toThrow();
    expect(() => fitCylinder([{ x: 0, y: 0, z: 0 }])).toThrow();
  });
});

describe("distanceToSegment", () => {
  it("computes point-to-segment distance with the closest point (mid, interior, beyond-end)", () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 4, y: 0, z: 0 };
    expect(distanceToSegment({ x: 2, y: 1, z: 0 }, a, b).distance).toBeCloseTo(1, 9);
    expect(distanceToSegment({ x: 2, y: 0, z: 0 }, a, b).closest.x).toBeCloseTo(2, 9);
    // Beyond the end: clamps to the endpoint.
    const beyond = distanceToSegment({ x: 6, y: 0, z: 0 }, a, b);
    expect(beyond.distance).toBeCloseTo(2, 9);
    expect(beyond.closest.x).toBeCloseTo(4, 9);
  });
});
