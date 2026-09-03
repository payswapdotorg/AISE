/**
 * Numerical regression, determinism, and source-discipline tests
 * (AISE-009).
 *
 * - **Numerical regression**: fixed seeded datasets fitted and
 *   compared against frozen expected values with tight tolerances
 *   — any numerical drift in the solvers trips these.
 * - **Determinism**: same inputs ⇒ bit-identical results; same
 *   point SET in any order ⇒ bit-identical results (canonical
 *   accumulation order); no hidden state across repeated calls.
 * - **Source discipline**: no ambient nondeterminism in the
 *   computation paths (Math.random / Date.now / Math.hypot are
 *   banned in src, tests excluded), and no measurement output
 *   ever carries a confidence field (uncertainty is never
 *   replaced by confidence).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fitPlane, fitPlaneRobust } from "./fitting/plane.js";
import { fitCylinder, fitCylinderRobust } from "./fitting/cylinder.js";
import { defineLine, definePoint } from "./query/entities.js";
import { distancePointToPoint, distancePointToLine } from "./query/distance.js";
import { angleLineToLine } from "./query/angle.js";
import { DeterministicRng } from "./seeded.js";
import { exactCylinderPoints, exactPlanePoints, noisyCylinderPoints, noisyPlanePoints } from "./fixtures/golden.js";

const UNIT = "meter" as const;

describe("numerical regression (frozen expected values)", () => {
  it("plane fit on the noisy fixture reproduces the frozen values", () => {
    const result = fitPlane({ points: noisyPlanePoints(), unit: UNIT });
    // Frozen on 2026-09-03 (Node 22, vitest): if these drift, a
    // numerical change entered the solver chain. True normal:
    // (2, 3, −1)/√14 ≈ (0.53452, 0.80178, −0.26726).
    expect(result.plane.normal.x).toBeGreaterThan(0.5342);
    expect(result.plane.normal.x).toBeLessThan(0.5344);
    expect(result.plane.normal.y).toBeGreaterThan(0.8018);
    expect(result.plane.normal.y).toBeLessThan(0.8020);
    expect(Math.abs(result.plane.normal.z)).toBeGreaterThan(0.2672);
    expect(Math.abs(result.plane.normal.z)).toBeLessThan(0.2674);
    expect(result.residualStats.rms).toBeGreaterThan(0.0055);
    expect(result.residualStats.rms).toBeLessThan(0.0062);
    expect(result.residualStats.maxAbs).toBeLessThanOrEqual(0.011);
    expect(result.residualStats.count).toBe(81);
  });

  it("cylinder fit on the exact fixture reproduces the frozen values", () => {
    const result = fitCylinder({ points: exactCylinderPoints(), unit: UNIT });
    expect(result.cylinder.radius).toBeGreaterThan(4.9999);
    expect(result.cylinder.radius).toBeLessThan(5.0001);
    expect(result.cylinder.axisPoint.x).toBeGreaterThan(0.9999);
    expect(result.cylinder.axisPoint.x).toBeLessThan(1.0001);
    expect(result.cylinder.axisPoint.y).toBeGreaterThan(1.9999);
    expect(result.cylinder.axisPoint.y).toBeLessThan(2.0001);
    expect(Math.abs(result.cylinder.axis.z)).toBeGreaterThan(0.99999);
    expect(result.residualStats.rms).toBeLessThan(1e-8);
  });

  it("cylinder fit on the noisy fixture reproduces the frozen values", () => {
    const result = fitCylinder({ points: noisyCylinderPoints(), unit: UNIT });
    expect(result.cylinder.radius).toBeGreaterThan(5.0003);
    expect(result.cylinder.radius).toBeLessThan(5.0006);
    expect(result.cylinder.axisPoint.x).toBeGreaterThan(0.99985);
    expect(result.cylinder.axisPoint.x).toBeLessThan(0.99999);
    expect(result.cylinder.axisPoint.y).toBeGreaterThan(1.9995);
    expect(result.cylinder.axisPoint.y).toBeLessThan(1.99965);
    expect(result.residualStats.rms).toBeGreaterThan(0.0055);
    expect(result.residualStats.rms).toBeLessThan(0.0060);
  });

  it("query values reproduce frozen results on seeded query data", () => {
    const rng = new DeterministicRng(20260903);
    const a = { x: rng.nextSignedUnit() * 10, y: rng.nextSignedUnit() * 10, z: rng.nextSignedUnit() * 10 };
    const b = { x: rng.nextSignedUnit() * 10, y: rng.nextSignedUnit() * 10, z: rng.nextSignedUnit() * 10 };
    const measurement = distancePointToPoint(
      definePoint(a, { unit: UNIT }),
      definePoint(b, { unit: UNIT }),
    );
    // Recompute independently: sqrt of sum of squares of the seeded deltas.
    const expected = Math.sqrt(
      (b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2,
    );
    expect(measurement.value).toBeCloseTo(expected, 12);
  });
});

describe("determinism (bit-identical)", () => {
  it("plane fit: 5 fixed permutations of the exact fixture all produce identical results", () => {
    const base = exactPlanePoints();
    const reference = fitPlane({ points: base, unit: UNIT });
    for (let seed = 1; seed <= 5; seed += 1) {
      const rng = new DeterministicRng(seed);
      const permuted = rng.permutation(base.length).map((index) => base[index]!);
      const result = fitPlane({ points: permuted, unit: UNIT });
      expect(result).toEqual(reference);
    }
  });

  it("plane robust fit: permutations produce identical results", () => {
    const rng = new DeterministicRng(55);
    const base = noisyPlanePoints();
    const permuted = rng.permutation(base.length).map((index) => base[index]!);
    const a = fitPlaneRobust({ points: base, unit: UNIT });
    const b = fitPlaneRobust({ points: permuted, unit: UNIT });
    expect(a).toEqual(b);
  });

  it("cylinder fit: 3 fixed permutations produce identical results", () => {
    const base = exactCylinderPoints();
    const reference = fitCylinder({ points: base, unit: UNIT });
    for (const seed of [11, 22, 33]) {
      const rng = new DeterministicRng(seed);
      const permuted = rng.permutation(base.length).map((index) => base[index]!);
      const result = fitCylinder({ points: permuted, unit: UNIT });
      expect(result).toEqual(reference);
    }
  });

  it("cylinder robust fit: permutations produce identical results", () => {
    const base = noisyCylinderPoints();
    const rng = new DeterministicRng(66);
    const permuted = rng.permutation(base.length).map((index) => base[index]!);
    const a = fitCylinderRobust({ points: base, unit: UNIT });
    const b = fitCylinderRobust({ points: permuted, unit: UNIT });
    expect(a).toEqual(b);
  });

  it("content hashes of permuted point sets are identical (order-free provenance)", () => {
    const a = fitPlane({ points: exactPlanePoints(), unit: UNIT });
    const rng = new DeterministicRng(88);
    const base = exactPlanePoints();
    const permuted = rng.permutation(base.length).map((index) => base[index]!);
    const b = fitPlane({ points: permuted, unit: UNIT });
    expect(a.provenance.inputs[0]!.contentHash).toBe(b.provenance.inputs[0]!.contentHash);
  });

  it("queries have no hidden state: repeated calls are identical", () => {
    const point = definePoint({ x: 1, y: 2, z: 3 }, { unit: UNIT });
    const line = defineLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { unit: UNIT });
    const first = distancePointToLine(point, line);
    const second = distancePointToLine(point, line);
    expect(first).toEqual(second);
  });

  it("seeded robust candidate sampling is exercised and deterministic (small cap)", () => {
    // Cap below the triple count → the seeded sampling path runs;
    // two identical calls must agree bit-for-bit.
    const base = exactPlanePoints();
    const a = fitPlaneRobust({ points: base, unit: UNIT }, { maxCandidates: 40 });
    const b = fitPlaneRobust({ points: base, unit: UNIT }, { maxCandidates: 40 });
    expect(a).toEqual(b);
    expect(a.provenance.parameters).toMatchObject({ sampled: true, candidateCount: 40 });
  });
});

describe("source discipline (static scans)", () => {
  const SRC_ROOT = path.resolve(import.meta.dirname);

  function sourceFiles(): string[] {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          files.push(full);
        }
      }
    };
    walk(SRC_ROOT);
    return files;
  }

  it("no Math.random / Date.now / Math.hypot anywhere in production source", () => {
    for (const file of sourceFiles()) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} must not use Math.random`).not.toContain("Math.random");
      expect(content, `${file} must not use Date.now`).not.toContain("Date.now");
      expect(content, `${file} must not use Math.hypot`).not.toContain("Math.hypot");
      expect(content, `${file} must not use new Date(`).not.toContain("new Date(");
    }
  });

  it("no measurement or fit output ever carries a confidence field", () => {
    const plane = fitPlane({ points: exactPlanePoints(), unit: UNIT, perPointStandardUncertainty: 0.01 });
    const cylinder = fitCylinder({
      points: exactCylinderPoints(),
      unit: UNIT,
      perPointStandardUncertainty: 0.01,
    });
    const distance = distancePointToPoint(
      definePoint({ x: 0, y: 0, z: 0 }, { unit: UNIT }),
      definePoint({ x: 3, y: 4, z: 0 }, { unit: UNIT, standardUncertainty: 0.1 }),
    );
    const angle = angleLineToLine(
      defineLine({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { unit: UNIT }),
      defineLine({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { unit: UNIT }),
    );
    for (const output of [plane, cylinder, distance, angle]) {
      const serialized = JSON.stringify(output);
      expect(serialized).not.toContain("confidence");
    }
  });
});
