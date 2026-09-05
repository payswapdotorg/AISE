/**
 * Network reconstruction unit tests (AISE-026) — classification
 * honesty, connectivity semantics, identity/evidence pinning,
 * and the fail-closed contract, over controlled synthetic inputs.
 */
import { describe, expect, it } from "vitest";
import { reconstructPipeNetwork, DEFAULT_JOIN_TOLERANCE } from "./network.js";
import { validatePipeNetwork } from "./validate.js";
import { exactPipeNetworkPoints, GOLDEN_JOIN_TOLERANCE } from "./fixtures/golden.js";
import { toMepError } from "./errors.js";
import type { GeomPoint } from "@aise/backend-geometry";

function capture(action: () => unknown): ReturnType<typeof toMepError> {
  try {
    action();
  } catch (error) {
    return toMepError(error);
  }
  return null;
}

/** A synthetic pipe shell (compact helper). */
function pipe(
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

describe("reconstructPipeNetwork (composition contract)", () => {
  it("reconstructs the exact fixture: 4 pipes, 3 junctions, 0 unassigned, self-validated", () => {
    const network = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter", joinTolerance: GOLDEN_JOIN_TOLERANCE });
    expect(network.counts.pipes).toBe(4);
    expect(network.counts.junctions).toBe(3);
    expect(network.counts.unassigned).toBe(0);
    expect(network.counts.coupled).toBe(1);
    expect(network.counts.branches).toBe(2);
    expect(() => validatePipeNetwork(network)).not.toThrow();
    expect(network.kind).toBe("mep-pipe-network");
    expect(network.unit).toBe("meter");
    expect(network.sourceEpistemic).toBe("INFERRED");
  });

  it("ignores the input emission order (canonicalization: same digest for any permutation)", () => {
    const points = exactPipeNetworkPoints();
    const shuffled = [...points].reverse();
    const a = reconstructPipeNetwork({ points, unit: "meter" });
    const b = reconstructPipeNetwork({ points: shuffled, unit: "meter" });
    expect(b.digest).toBe(a.digest);
    expect(b.inputContentHash).toBe(a.inputContentHash);
  });

  it("is byte-stable: same input -> identical canonical representation", () => {
    const first = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter" });
    const second = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter" });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("carries content-derived identities and evidence-pinned provenance", () => {
    const network = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter" });
    for (const pipe of network.pipes) {
      expect(pipe.pipeId).toMatch(/^mep-pipe-[0-9a-f]{16}$/);
      expect(pipe.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(pipe.provenance.method).toBe("mep/pipe-fit-v1");
      expect(pipe.provenance.inputs).toHaveLength(1);
      expect(pipe.provenance.inputs[0]!.kind).toBe("point-set");
      expect(pipe.provenance.inputs[0]!.contentHash).toBe(network.inputContentHash);
      expect(pipe.provenance.inputs[0]!.epistemic).toBe("INFERRED");
    }
    // All identities distinct.
    expect(new Set(network.pipes.map((pipe) => pipe.pipeId)).size).toBe(4);
  });

  it("passes source epistemic states through verbatim (never upgraded)", () => {
    const network = reconstructPipeNetwork({
      points: exactPipeNetworkPoints(),
      unit: "meter",
      sourceEpistemic: "OBSERVED",
    });
    expect(network.sourceEpistemic).toBe("OBSERVED");
    expect(network.pipes.every((pipe) => pipe.epistemic === "OBSERVED")).toBe(true);
    expect(() => validatePipeNetwork(network)).not.toThrow();
  });

  it("omits uncertainties for noise-free inputs (absent means not stated, never zero)", () => {
    const network = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter" });
    for (const pipe of network.pipes) {
      expect(pipe.diameter.uncertainty).toBeUndefined();
      expect(pipe.length.uncertainty).toBeUndefined();
    }
  });

  it("records junction diameter relations verbatim (mismatch never averaged)", () => {
    const network = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter", joinTolerance: GOLDEN_JOIN_TOLERANCE });
    const thin = network.pipes.find((pipe) => pipe.diameter.value < 0.08)!;
    const mismatched = network.junctions.filter((junction) => junction.diameterRelation === "mismatch");
    expect(mismatched).toHaveLength(2);
    // Both mismatches involve the thin branch pipe.
    for (const junction of mismatched) {
      expect([junction.pipeId, junction.nearPipeId]).toContain(thin.pipeId);
    }
    const compatible = network.junctions.filter((junction) => junction.diameterRelation === "compatible");
    expect(compatible).toHaveLength(1);
    expect(compatible[0]!.kind).toBe("coupled");
  });

  it("classifies non-slender and small clusters honestly (unassigned with reasons)", () => {
    // A squat blob (sphere-ish cluster): enough points, not slender.
    const blob: GeomPoint[] = [];
    for (let i = 0; i < 200; i += 1) {
      const theta = 0.3 * i;
      const phi = 0.7 * i;
      blob.push({
        x: 1.1 * Math.sin(phi) * Math.cos(theta),
        y: 1.1 * Math.sin(phi) * Math.sin(theta),
        z: 1.1 * Math.cos(phi),
      });
    }
    const network = reconstructPipeNetwork({ points: blob, unit: "meter", clusterRadius: 0.4 });
    expect(network.counts.pipes).toBe(0);
    expect(network.counts.unassigned).toBeGreaterThanOrEqual(1);
    expect(network.unassigned.every((entry) => entry.reason === "non-slender-cluster")).toBe(true);
    // A handful of stray points: insufficient-points.
    const stray = network.unassigned; // blob consumed above
    void stray;
    const small = reconstructPipeNetwork({
      points: pipe([0, 0, 0], [4, 0, 0], 0.05, 3, 2),
      unit: "meter",
    });
    expect(small.counts.pipes).toBe(0);
    expect(small.unassigned[0]!.reason).toBe("insufficient-points");
  });

  it("junction tolerance is honest and configurable (widening connects, tightening separates)", () => {
    // Two pipes with a 0.2 gap between endpoint and the other's centerline.
    const a = pipe([0, 0, 0], [4, 0, 0], 0.05);
    const b = pipe([5, 0, 0], [8, 0, 0], 0.05); // endpoint (5,0,0) is 1.0 from A's centerline end
    const loose = reconstructPipeNetwork({
      points: [...a, ...b],
      unit: "meter",
      joinTolerance: 1.1,
    });
    expect(loose.counts.junctions).toBe(1);
    expect(loose.junctions[0]!.kind).toBe("coupled");
    const tight = reconstructPipeNetwork({
      points: [...a, ...b],
      unit: "meter",
      joinTolerance: DEFAULT_JOIN_TOLERANCE,
    });
    expect(tight.counts.junctions).toBe(0);
  });
});

describe("reconstructPipeNetwork (fail-closed contract)", () => {
  it("rejects the empty point cloud", () => {
    const error = capture(() => reconstructPipeNetwork({ points: [], unit: "meter" }));
    expect(error?.code).toBe("EMPTY_INPUT");
    expect(error?.retryable).toBe(false);
  });

  it("rejects a unit outside the frozen vocabulary", () => {
    const error = capture(() => reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "furlong" }));
    expect(error?.code).toBe("VALIDATION_FAILED");
  });

  it("rejects non-finite coordinates", () => {
    const error = capture(() =>
      reconstructPipeNetwork({ points: [{ x: Number.NaN, y: 0, z: 0 }], unit: "meter" }),
    );
    expect(error?.code).toBe("NON_FINITE_INPUT");
  });

  it("rejects invalid options", () => {
    for (const bad of [
      { clusterRadius: 0 },
      { clusterRadius: -1 },
      { joinTolerance: 0 },
      { minPipePoints: 1 },
      { minPipePoints: 2.5 },
      { perPointStandardUncertainty: -1 },
    ]) {
      const error = capture(() =>
        reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter", ...bad }),
      );
      expect(error, JSON.stringify(bad)).not.toBeNull();
    }
  });

  it("does not mutate the input points (derived state only)", () => {
    const points = exactPipeNetworkPoints();
    const before = JSON.stringify(points);
    reconstructPipeNetwork({ points, unit: "meter" });
    expect(JSON.stringify(points)).toBe(before);
  });
});

describe("network digest binding (the mutation-harness teeth)", () => {
  it("binds the digest to the network content (different inputs -> different digests)", () => {
    const a = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter", joinTolerance: GOLDEN_JOIN_TOLERANCE });
    const b = reconstructPipeNetwork({
      points: exactPipeNetworkPoints().map((point) => ({ x: point.x, y: point.y, z: point.z + 1 })),
      unit: "meter",
      joinTolerance: GOLDEN_JOIN_TOLERANCE,
    });
    expect(a.digest).not.toBe(b.digest);
    expect(a.inputContentHash).not.toBe(b.inputContentHash);
    // And the digest is a 64-hex canonical hash, not a placeholder.
    expect(a.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(a.digest).not.toBe("0".repeat(64));
  });
});
