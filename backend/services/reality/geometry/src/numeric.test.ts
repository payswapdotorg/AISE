/**
 * Numeric core tests (AISE-009): the deterministic Jacobi
 * eigensolver, the pivoting linear solver, the Kása + Gauss-Newton
 * circle fit, the deterministic RNG, and the canonicalizer.
 */
import { describe, expect, it } from "vitest";
import { eigensystemSymmetric3, solveLinear3 } from "./numeric/matrix.js";
import { fitCircle2 } from "./numeric/circle.js";
import { computeResidualStats } from "./fitting/residuals.js";
import { DeterministicRng } from "./seeded.js";
import { canonicalizePointSet, vec3Normalize, assertFiniteNumber } from "./validate.js";
import { GeometryError } from "./errors.js";

describe("symmetric 3x3 eigensolver", () => {
  it("solves the identity", () => {
    const { eigenvalues, eigenvectors } = eigensystemSymmetric3([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    expect(eigenvalues).toEqual([1, 1, 1]);
    for (const v of eigenvectors) {
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 12);
    }
  });

  it("solves a diagonal matrix exactly", () => {
    const { eigenvalues, eigenvectors } = eigensystemSymmetric3([
      [3, 0, 0],
      [0, 1, 0],
      [0, 0, 2],
    ]);
    expect(eigenvalues).toEqual([1, 2, 3]);
    // λ=1 corresponds to the y direction (diag entries 3,1,2).
    const v0 = eigenvectors[0]!;
    expect(Math.abs(v0.y)).toBeCloseTo(1, 12);
  });

  it("solves a known 2x2-block matrix", () => {
    // [[2,1],[1,2]] block has eigenvalues 3 (x=y) and 1 (x=−y); plus 3.
    const { eigenvalues, eigenvectors } = eigensystemSymmetric3([
      [2, 1, 0],
      [1, 2, 0],
      [0, 0, 3],
    ]);
    expect(eigenvalues[0]).toBeCloseTo(1, 10);
    expect(eigenvalues[1]).toBeCloseTo(3, 10);
    expect(eigenvalues[2]).toBeCloseTo(3, 10);
    const v0 = eigenvectors[0]!;
    expect(Math.abs(v0.x + v0.y)).toBeCloseTo(0, 10); // x = −y direction
    expect(Math.abs(v0.z)).toBeCloseTo(0, 10);
  });

  it("solves a fully coupled matrix (A·v = λ·v for every pair)", () => {
    const matrix = [
      [4, 1, 2],
      [1, 3, 0.5],
      [2, 0.5, 1],
    ] as const;
    const { eigenvalues, eigenvectors } = eigensystemSymmetric3(matrix);
    for (let i = 0; i < 3; i += 1) {
      const v = eigenvectors[i]!;
      const av = [
        matrix[0][0]! * v.x + matrix[0][1]! * v.y + matrix[0][2]! * v.z,
        matrix[1][0]! * v.x + matrix[1][1]! * v.y + matrix[1][2]! * v.z,
        matrix[2][0]! * v.x + matrix[2][1]! * v.y + matrix[2][2]! * v.z,
      ];
      const lambda = eigenvalues[i]!;
      expect(av[0]!).toBeCloseTo(lambda * v.x, 10);
      expect(av[1]!).toBeCloseTo(lambda * v.y, 10);
      expect(av[2]!).toBeCloseTo(lambda * v.z, 10);
    }
    // Trace invariance: sum of eigenvalues = trace.
    const trace = matrix[0][0]! + matrix[1][1]! + matrix[2][2]!;
    const sum = eigenvalues[0]! + eigenvalues[1]! + eigenvalues[2]!;
    expect(sum).toBeCloseTo(trace, 10);
  });

  it("is deterministic (bit-identical across calls) and permutation-invariant via canonical sign fixing", () => {
    const matrix = [
      [5, 2, 1],
      [2, 4, 3],
      [1, 3, 2],
    ] as const;
    const a = eigensystemSymmetric3(matrix);
    const b = eigensystemSymmetric3(matrix);
    expect(a).toEqual(b);
  });

  it("rejects non-symmetric input", () => {
    expect(() =>
      eigensystemSymmetric3([
        [1, 2, 0],
        [1, 1, 0],
        [0, 0, 1],
      ]),
    ).toThrow(GeometryError);
  });
});

describe("linear solver", () => {
  it("solves well-conditioned systems exactly", () => {
    const x = solveLinear3(
      [
        [2, 0, 0],
        [0, 4, 0],
        [0, 0, 8],
      ],
      [2, 8, 16],
    );
    expect([...x]).toEqual([1, 2, 2]);
  });

  it("solves with pivoting", () => {
    const x = solveLinear3(
      [
        [0, 0, 1],
        [1, 0, 0],
        [0, 1, 0],
      ],
      [3, 4, 5],
    );
    expect([...x]).toEqual([4, 5, 3]);
  });

  it("rejects singular systems with DEGENERATE_GEOMETRY", () => {
    try {
      solveLinear3(
        [
          [1, 2, 3],
          [2, 4, 6],
          [0, 0, 1],
        ],
        [1, 2, 3],
      );
      expect.unreachable("singular system must fail closed");
    } catch (error) {
      expect((error as GeometryError).code).toBe("DEGENERATE_GEOMETRY");
    }
  });
});

describe("circle fit", () => {
  it("recovers an exact circle", () => {
    const points = [
      { x: 5, y: 0 },
      { x: 0, y: 5 },
      { x: -5, y: 0 },
      { x: 0, y: -5 },
      { x: 3.5355339059327378, y: 3.5355339059327378 },
    ];
    const circle = fitCircle2(points);
    expect(circle.centerX).toBeCloseTo(0, 12);
    expect(circle.centerY).toBeCloseTo(0, 12);
    expect(circle.radius).toBeCloseTo(5, 12);
  });

  it("recovers an off-center circle", () => {
    const cx = 2;
    const cy = -3;
    const r = 1.5;
    const points = Array.from({ length: 24 }, (_, i) => {
      const theta = (i * 2 * Math.PI) / 24;
      return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
    });
    const circle = fitCircle2(points);
    expect(circle.centerX).toBeCloseTo(cx, 10);
    expect(circle.centerY).toBeCloseTo(cy, 10);
    expect(circle.radius).toBeCloseTo(r, 10);
  });

  it("refines partial arcs geometrically (Kása bias removed)", () => {
    // 45° arc of radius 10 centered at (1, 2): algebraic fits are
    // biased on arcs; the geometric refinement must land close.
    const cx = 1;
    const cy = 2;
    const r = 10;
    const points = Array.from({ length: 30 }, (_, i) => {
      const theta = (i * Math.PI) / (4 * 29); // 0..π/4
      return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
    });
    const circle = fitCircle2(points);
    expect(circle.radius).toBeCloseTo(r, 3);
    expect(circle.centerX).toBeCloseTo(cx, 2);
    expect(circle.centerY).toBeCloseTo(cy, 2);
  });

  it("rejects fewer than 3 points", () => {
    expect(() => fitCircle2([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow(GeometryError);
  });

  it("rejects collinear points (a line is a circle of infinite radius)", () => {
    try {
      fitCircle2([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ]);
      expect.unreachable("collinear circle fit must fail closed");
    } catch (error) {
      expect((error as GeometryError).code).toBe("DEGENERATE_GEOMETRY");
    }
  });

  it("rejects non-finite coordinates", () => {
    expect(() =>
      fitCircle2([
        { x: 0, y: 0 },
        { x: Number.NaN, y: 1 },
        { x: 2, y: 2 },
      ]),
    ).toThrow(GeometryError);
  });
});

describe("residual statistics", () => {
  it("computes exact statistics on a known sample", () => {
    const stats = computeResidualStats([-1, 0, 1, 2]);
    expect(stats.count).toBe(4);
    expect(stats.min).toBe(-1);
    expect(stats.max).toBe(2);
    expect(stats.mean).toBeCloseTo(0.5, 12);
    expect(stats.median).toBeCloseTo(0.5, 12);
    expect(stats.rms).toBeCloseTo(Math.sqrt((1 + 0 + 1 + 4) / 4), 12);
    expect(stats.standardDeviation).toBeCloseTo(Math.sqrt(5 / 3), 12); // sample std
    expect(stats.maxAbs).toBe(2);
  });

  it("is invariant to input order (bit-identical)", () => {
    const a = computeResidualStats([3, -1, 2, 0.5, -2]);
    const b = computeResidualStats([-2, 0.5, 2, -1, 3]);
    expect(a).toEqual(b);
  });

  it("rejects empty and non-finite samples", () => {
    expect(() => computeResidualStats([])).toThrow(GeometryError);
    expect(() => computeResidualStats([1, Number.NaN])).toThrow(GeometryError);
  });
});

describe("deterministic RNG", () => {
  it("reproduces the same stream for the same seed", () => {
    const a = new DeterministicRng(42);
    const b = new DeterministicRng(42);
    for (let i = 0; i < 100; i += 1) {
      expect(a.nextUint32()).toBe(b.nextUint32());
    }
  });

  it("differs across seeds", () => {
    const a = new DeterministicRng(1);
    const b = new DeterministicRng(2);
    const aValues = [a.nextUint32(), a.nextUint32(), a.nextUint32()];
    const bValues = [b.nextUint32(), b.nextUint32(), b.nextUint32()];
    expect(aValues).not.toEqual(bValues);
  });

  it("produces unit values in [0, 1) and signed values in [-1, 1)", () => {
    const rng = new DeterministicRng(7);
    for (let i = 0; i < 1000; i += 1) {
      const u = rng.nextUnit();
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      const s = rng.nextSignedUnit();
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThan(1);
    }
  });

  it("rejects invalid seeds", () => {
    expect(() => new DeterministicRng(0)).toThrow();
    expect(() => new DeterministicRng(-5)).toThrow();
    expect(() => new DeterministicRng(1.5)).toThrow();
  });

  it("permutations are reproducible and complete", () => {
    const a = new DeterministicRng(99).permutation(50);
    const b = new DeterministicRng(99).permutation(50);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(50);
    expect(Math.max(...a)).toBe(49);
  });
});

describe("point-set canonicalization", () => {
  it("sorts lexicographically and never mutates the input", () => {
    const input = [
      { x: 2, y: 0, z: 0 },
      { x: 1, y: 5, z: 0 },
      { x: 1, y: 2, z: 9 },
      { x: 1, y: 2, z: -1 },
    ];
    const snapshot = input.map((p) => ({ ...p }));
    const canonical = canonicalizePointSet(input, { minCount: 3 });
    expect(input).toEqual(snapshot);
    expect(canonical.map((p) => p.x)).toEqual([1, 1, 1, 2]);
    expect(canonical.map((p) => p.y)).toEqual([2, 2, 5, 0]);
    expect(canonical.map((p) => p.z)).toEqual([-1, 9, 0, 0]);
  });

  it("is invariant to input permutation (bit-identical)", () => {
    const base = [
      { x: 3, y: 1, z: 4 },
      { x: 1, y: 5, z: 9 },
      { x: 2, y: 6, z: 5 },
    ];
    const permutations = [
      [base[1]!, base[2]!, base[0]!],
      [base[2]!, base[0]!, base[1]!],
      [base[0]!, base[2]!, base[1]!],
    ];
    const canonicals = permutations.map((p) => canonicalizePointSet(p, { minCount: 3 }));
    for (const canonical of canonicals) {
      expect(canonical).toEqual(canonicals[0]);
    }
  });

  it("rejects insufficient points", () => {
    expect(() => canonicalizePointSet([{ x: 0, y: 0, z: 0 }], { minCount: 3 })).toThrow(GeometryError);
  });

  it("rejects non-finite coordinates", () => {
    expect(() =>
      canonicalizePointSet(
        [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: Number.POSITIVE_INFINITY, z: 0 },
          { x: 2, y: 2, z: 2 },
        ],
        { minCount: 3 },
      ),
    ).toThrow(GeometryError);
  });
});

describe("vector helpers", () => {
  it("normalizes and rejects the zero vector", () => {
    const n = vec3Normalize({ x: 0, y: 3, z: 4 }, "v");
    expect(n).toEqual({ x: 0, y: 0.6, z: 0.8 });
    expect(() => vec3Normalize({ x: 0, y: 0, z: 0 }, "v")).toThrow(GeometryError);
    expect(() => vec3Normalize({ x: 1e-13, y: 0, z: 0 }, "v")).toThrow(GeometryError);
  });

  it("assertFiniteNumber rejects non-finite values with details", () => {
    try {
      assertFiniteNumber(Number.NaN, "test.value");
      expect.unreachable("must fail closed");
    } catch (error) {
      const geometryError = error as GeometryError;
      expect(geometryError.code).toBe("NON_FINITE_INPUT");
      expect(geometryError.details).toMatchObject({ label: "test.value" });
    }
    expect(assertFiniteNumber(42, "test.value")).toBe(42);
  });
});
