/**
 * CRITICAL golden pipe-network benchmark (AISE-026) — the
 * controlled fixture acceptance: exact + seeded-noisy networks
 * reconstructed by the REAL pipeline and pinned against ground
 * truth (centerlines, diameters, lengths, connectivity), with
 * determinism and topology-correctness pins.
 */
import { describe, expect, it } from "vitest";
import { reconstructPipeNetwork, type MepPipe } from "./network.js";
import { validatePipeNetwork } from "./validate.js";
import {
  exactPipeNetworkPoints,
  noisyPipeNetworkPoints,
  pipeNetworkGroundTruth,
  PIPE_NOISE_SEED,
  GOLDEN_JOIN_TOLERANCE,
  GOLDEN_JUNCTION_DISTANCE,
} from "./fixtures/golden.js";

const TRUTH = pipeNetworkGroundTruth();

/** Matches a reconstructed pipe to its ground-truth layout by proximity. */
function matchPipe(
  network: ReturnType<typeof reconstructPipeNetwork>,
  truth: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } },
): MepPipe {
  const pipe = network.pipes.find((candidate) => {
    const midA = {
      x: (candidate.centerline.start.x + candidate.centerline.end.x) / 2,
      y: (candidate.centerline.start.y + candidate.centerline.end.y) / 2,
      z: (candidate.centerline.start.z + candidate.centerline.end.z) / 2,
    };
    const midB = {
      x: (truth.start.x + truth.end.x) / 2,
      y: (truth.start.y + truth.end.y) / 2,
      z: (truth.start.z + truth.end.z) / 2,
    };
    return Math.hypot(midA.x - midB.x, midA.y - midB.y, midA.z - midB.z) < 0.2;
  });
  if (pipe === undefined) {
    throw new Error(`no reconstructed pipe near ground truth ${JSON.stringify(truth.start)}`);
  }
  return pipe;
}

describe("golden EXACT pipe network (real pipeline, no noise)", () => {
  const network = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter", joinTolerance: GOLDEN_JOIN_TOLERANCE });

  it("reconstructs exactly 4 pipes (topology correctness)", () => {
    expect(network.counts.pipes).toBe(4);
    expect(network.counts.unassigned).toBe(0);
    expect(() => validatePipeNetwork(network)).not.toThrow();
  });

  it("pins every centerline, diameter and length to the ground truth (±1e-6)", () => {
    for (const truth of TRUTH.pipes) {
      const pipe = matchPipe(network, truth);
      expect(pipe.centerline.start.x).toBeCloseTo(truth.start.x, 6);
      expect(pipe.centerline.start.y).toBeCloseTo(truth.start.y, 6);
      expect(pipe.centerline.start.z).toBeCloseTo(truth.start.z, 6);
      expect(pipe.centerline.end.x).toBeCloseTo(truth.end.x, 6);
      expect(pipe.centerline.end.y).toBeCloseTo(truth.end.y, 6);
      expect(pipe.centerline.end.z).toBeCloseTo(truth.end.z, 6);
      expect(pipe.diameter.value).toBeCloseTo(truth.diameter, 6);
      expect(pipe.length.value).toBeCloseTo(truth.length, 6);
    }
  });

  it("pins the connectivity topology: 3 junctions with exact kinds and relations", () => {
    expect(network.counts.junctions).toBe(3);
    expect(network.counts.coupled).toBe(1);
    expect(network.counts.branches).toBe(2);
    const mismatchCount = network.junctions.filter((j) => j.diameterRelation === "mismatch").length;
    expect(mismatchCount).toBe(2);
    // Branch junction positions lie ON the run centerlines; the junction
    // distances are the honest 0.25 m end gaps.
    for (const junction of network.junctions) {
      const nearPipe = network.pipes.find((pipe) => pipe.pipeId === junction.nearPipeId)!;
      const distance = pointOnSegmentDistance(junction.position, nearPipe);
      expect(distance).toBeLessThan(1e-6);
      expect(junction.distance).toBeCloseTo(GOLDEN_JUNCTION_DISTANCE, 6);
    }
  });

  it("is deterministic: byte-identical repeat reconstruction", () => {
    const second = reconstructPipeNetwork({ points: exactPipeNetworkPoints(), unit: "meter", joinTolerance: GOLDEN_JOIN_TOLERANCE });
    expect(JSON.stringify(second)).toBe(JSON.stringify(network));
    expect(second.digest).toBe(network.digest);
  });
});

describe("golden NOISY pipe network (seeded, σ = 0.01 m, recorded seed)", () => {
  it("the fixture is reproducible (same seed -> identical points)", () => {
    expect(JSON.stringify(noisyPipeNetworkPoints())).toBe(JSON.stringify(noisyPipeNetworkPoints()));
    expect(PIPE_NOISE_SEED).toBe(0x26262);
  });

  it("reconstructs the same topology under noise (4 pipes, 3 junctions)", () => {
    const network = reconstructPipeNetwork({
      points: noisyPipeNetworkPoints(),
      unit: "meter",
      joinTolerance: GOLDEN_JOIN_TOLERANCE,
      perPointStandardUncertainty: 0.01,
    });
    expect(network.counts.pipes).toBe(4);
    expect(network.counts.unassigned).toBe(0);
    expect(network.counts.junctions).toBe(3);
    expect(() => validatePipeNetwork(network)).not.toThrow();
  });

  it("holds centerlines/diameters within the noise tolerance (±0.02 m)", () => {
    const network = reconstructPipeNetwork({
      points: noisyPipeNetworkPoints(),
      unit: "meter",
      joinTolerance: GOLDEN_JOIN_TOLERANCE,
      perPointStandardUncertainty: 0.01,
    });
    for (const truth of TRUTH.pipes) {
      const pipe = matchPipe(network, truth);
      expect(pipe.diameter.value).toBeCloseTo(truth.diameter, 1);
      expect(pipe.length.value).toBeCloseTo(truth.length, 1);
      // Endpoint ORDER is canonical (lexicographic), not semantic: under
      // noise the order can flip — compare the UNORDERED endpoint set.
      const endpoints = [pipe.centerline.start, pipe.centerline.end];
      for (const expected of [truth.start, truth.end]) {
        const best = Math.min(
          ...endpoints.map((endpoint) => Math.hypot(endpoint.x - expected.x, endpoint.y - expected.y, endpoint.z - expected.z)),
        );
        // 3σ + estimator slack at the extreme projections.
        expect(best).toBeLessThan(0.03);
      }
    }
    // Noisy inputs carry honest standard uncertainties.
    for (const pipe of network.pipes) {
      expect(pipe.diameter.uncertainty).toBeDefined();
      expect(pipe.diameter.uncertainty!.kind).toBe("standard");
    }
  });

  it("is deterministic under noise (same seed -> byte-identical network)", () => {
    const first = reconstructPipeNetwork({
      points: noisyPipeNetworkPoints(),
      unit: "meter",
      joinTolerance: GOLDEN_JOIN_TOLERANCE,
      perPointStandardUncertainty: 0.01,
    });
    const second = reconstructPipeNetwork({
      points: noisyPipeNetworkPoints(),
      unit: "meter",
      joinTolerance: GOLDEN_JOIN_TOLERANCE,
      perPointStandardUncertainty: 0.01,
    });
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

/** Distance from a point to a segment (test-side check of "on the centerline"). */
function pointOnSegmentDistance(
  point: { x: number; y: number; z: number },
  pipe: { centerline: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } } },
): number {
  const a = pipe.centerline.start;
  const b = pipe.centerline.end;
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const apz = point.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  if (ab2 === 0) {
    return Math.hypot(apx, apy, apz);
  }
  const t = Math.min(1, Math.max(0, (apx * abx + apy * aby + apz * abz) / ab2));
  return Math.hypot(point.x - (a.x + abx * t), point.y - (a.y + aby * t), point.z - (a.z + abz * t));
}
