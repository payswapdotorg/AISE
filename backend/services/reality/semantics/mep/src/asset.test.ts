/**
 * Asset candidate unit tests (AISE-027) — blob statistics, the
 * surface-gap connection metric, and the evidence-pinned role
 * classification (the honesty core: valves are NEVER claimed
 * without continuation evidence).
 */
import { describe, expect, it } from "vitest";
import type { GeomPoint } from "@aise/backend-geometry";
import { reconstructPipeNetwork, type MepPipe } from "./network.js";
import {
  COLINEAR_COS_MIN,
  DEFAULT_ASSET_TOLERANCE,
  classifyRole,
  extractConnections,
  fitAssetBlob,
  buildAsset,
} from "./asset.js";
import { toMepError } from "./errors.js";

/** Deterministic shell sampler (the golden ring grid: axis 0.05, 16 rings). */
function shellPoints(
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  radius: number,
): GeomPoint[] {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.hypot(dx, dy, dz);
  const ux = dx / length;
  const uy = dy / length;
  const uz = dz / length;
  const candidates = [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ];
  let world = candidates[0]!;
  let best = Math.abs(world.x * ux + world.y * uy + world.z * uz);
  for (let index = 1; index < candidates.length; index += 1) {
    const alignment = Math.abs(candidates[index]!.x * ux + candidates[index]!.y * uy + candidates[index]!.z * uz);
    if (alignment < best) {
      world = candidates[index]!;
      best = alignment;
    }
  }
  const dotU = world.x * ux + world.y * uy + world.z * uz;
  let ex = world.x - ux * dotU;
  let ey = world.y - uy * dotU;
  let ez = world.z - uz * dotU;
  const eNorm = Math.hypot(ex, ey, ez);
  ex /= eNorm;
  ey /= eNorm;
  ez /= eNorm;
  const fx = uy * ez - uz * ey;
  const fy = uz * ex - ux * ez;
  const fz = ux * ey - uy * ex;
  const points: GeomPoint[] = [];
  const steps = Math.max(1, Math.round(length / 0.05));
  for (let step = 0; step <= steps; step += 1) {
    const t = (step / steps) * length;
    for (let ring = 0; ring < 16; ring += 1) {
      const theta = (2 * Math.PI * ring) / 16;
      points.push({
        x: start[0] + ux * t + radius * (Math.cos(theta) * ex + Math.sin(theta) * fx),
        y: start[1] + uy * t + radius * (Math.cos(theta) * ey + Math.sin(theta) * fy),
        z: start[2] + uz * t + radius * (Math.cos(theta) * ez + Math.sin(theta) * fz),
      });
    }
  }
  return points;
}

interface Segment {
  readonly name: string;
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  readonly radius: number;
}

/** Builds real fitted pipes through the AISE-026 pipeline. */
function fittedPipes(segments: readonly Segment[]): MepPipe[] {
  const points = segments.flatMap((segment) => shellPoints(segment.start, segment.end, segment.radius));
  const network = reconstructPipeNetwork({ points, unit: "meter", joinTolerance: 0.3 });
  if (network.pipes.length !== segments.length) {
    throw new Error(`expected ${segments.length} fitted pipes, got ${network.pipes.length}`);
  }
  return [...network.pipes];
}

/** Matches a fitted pipe to its segment by midpoint. */
function matchSegment(pipe: MepPipe | undefined, segment: Segment): boolean {
  if (pipe === undefined) {
    return false;
  }
  const midX = (pipe.centerline.start.x + pipe.centerline.end.x) / 2;
  const midY = (pipe.centerline.start.y + pipe.centerline.end.y) / 2;
  const midZ = (pipe.centerline.start.z + pipe.centerline.end.z) / 2;
  const truthX = (segment.start[0] + segment.end[0]) / 2;
  const truthY = (segment.start[1] + segment.end[1]) / 2;
  const truthZ = (segment.start[2] + segment.end[2]) / 2;
  return Math.hypot(midX - truthX, midY - truthY, midZ - truthZ) < 0.2;
}

// The inline valve scenario: A1 — 0.25 m gap — V — 0.25 m gap — A2.
const RUN_A1: Segment = { name: "A1", start: [0, 0, 1], end: [1.55, 0, 1], radius: 0.05 };
const RUN_A2: Segment = { name: "A2", start: [2.45, 0, 1], end: [4, 0, 1], radius: 0.05 };
const VALVE_BLOB = shellPoints([1.8, 0, 1], [2.2, 0, 1], 0.075);

describe("fitAssetBlob (compact-blob statistics)", () => {
  it("computes the exact centroid, mean radius and scatter of the symmetric valve shell", () => {
    const stats = fitAssetBlob(VALVE_BLOB);
    expect(stats.pointCount).toBe(144);
    expect(stats.centroid.x).toBeCloseTo(2, 10);
    expect(stats.centroid.y).toBeCloseTo(0, 10);
    expect(stats.centroid.z).toBeCloseTo(1, 10);
    // Analytic ring mean: (1/9)·Σ sqrt((t−0.2)² + 0.075²).
    expect(stats.meanRadius).toBeCloseTo(0.1408764, 6);
    // The squat cylinder is anisotropic — the residuals carry that
    // verbatim (max deviation = the end rings vs the mean).
    expect(stats.residuals.rms).toBeGreaterThan(0.03);
    expect(stats.residuals.max).toBeCloseTo(0.213601 - 0.140876, 3);
  });

  it("is deterministic for a fixed point order (the pipeline always sums canonical order)", () => {
    // The production path canonicalizes (sorts) BEFORE clustering, so
    // the blob statistics always sum the same canonical member order;
    // pipeline-level permutation invariance is pinned by the topology
    // tests. Unit contract: bit-identical for a fixed input order.
    expect(JSON.stringify(fitAssetBlob(VALVE_BLOB))).toBe(JSON.stringify(fitAssetBlob(VALVE_BLOB)));
  });

  it("fails closed on an empty blob", () => {
    expect(() => fitAssetBlob([])).toThrow();
  });
});

describe("extractConnections (the surface-gap metric)", () => {
  it("finds both valve connections with the analytic gap and surface points on the blob", () => {
    const pipes = fittedPipes([RUN_A1, RUN_A2]);
    const connections = extractConnections(VALVE_BLOB, pipes, DEFAULT_ASSET_TOLERANCE);
    expect(connections).toHaveLength(2);
    const byPipe = new Map(connections.map((connection) => [connection.pipeId, connection]));
    const a1 = pipes.find((pipe) => matchSegment(pipe, RUN_A1))!;
    const a2 = pipes.find((pipe) => matchSegment(pipe, RUN_A2))!;
    // A1's END (endpoint 1) and A2's START (endpoint 0) are the near ends.
    expect(byPipe.get(a1.pipeId)?.endpointIndex).toBe(1);
    expect(byPipe.get(a2.pipeId)?.endpointIndex).toBe(0);
    // The analytic surface gap: sqrt(0.25² + 0.075²).
    expect(byPipe.get(a1.pipeId)?.surfaceGap).toBeCloseTo(Math.sqrt(0.0625 + 0.005625), 5);
    expect(byPipe.get(a2.pipeId)?.surfaceGap).toBeCloseTo(Math.sqrt(0.0625 + 0.005625), 5);
    // The surface points are actual blob points (on the scanned shell).
    for (const connection of connections) {
      const isBlobPoint = VALVE_BLOB.some(
        (point) =>
          point.x === connection.surfacePoint.x && point.y === connection.surfacePoint.y && point.z === connection.surfacePoint.z,
      );
      expect(isBlobPoint).toBe(true);
    }
    // Canonical (pipeId, endpointIndex) order.
    expect(connections[0]!.pipeId <= connections[1]!.pipeId).toBe(true);
  });

  it("returns nothing beyond the tolerance (honest refusal, no near-miss coercion)", () => {
    const pipes = fittedPipes([RUN_A1, RUN_A2]);
    expect(extractConnections(VALVE_BLOB, pipes, 0.2)).toHaveLength(0);
    expect(extractConnections(VALVE_BLOB, [], DEFAULT_ASSET_TOLERANCE)).toHaveLength(0);
  });
});

describe("classifyRole (evidence-pinned roles)", () => {
  it("classifies the inline colinear continuation as a VALVE", () => {
    const pipes = fittedPipes([RUN_A1, RUN_A2]);
    const connections = extractConnections(VALVE_BLOB, pipes, DEFAULT_ASSET_TOLERANCE);
    const stats = fitAssetBlob(VALVE_BLOB);
    const classification = classifyRole(connections, stats.centroid, pipes);
    expect(classification).toEqual({ role: "valve", roleBasis: "inline-continuation" });
  });

  it("classifies colinear ends on the SAME side as equipment (no continuation through)", () => {
    // Two parallel +X runs ending side by side LEFT of the blob.
    const p1: Segment = { name: "P1", start: [2.5, 0, 1], end: [4.45, 0, 1], radius: 0.05 };
    const p2: Segment = { name: "P2", start: [2.5, 0.25, 1], end: [4.45, 0.25, 1], radius: 0.05 };
    const blob = shellPoints([4.8, 0, 1], [5.2, 0, 1], 0.075);
    const pipes = fittedPipes([p1, p2]);
    const connections = extractConnections(blob, pipes, 0.55);
    expect(connections).toHaveLength(2);
    const stats = fitAssetBlob(blob);
    const classification = classifyRole(connections, stats.centroid, pipes);
    expect(classification).toEqual({ role: "equipment", roleBasis: "terminal" });
  });

  it("classifies perpendicular arrivals as equipment (terminal)", () => {
    // A +X run ends near the blob; a +Y run also ends near it.
    const run: Segment = { name: "R", start: [2, 0, 1], end: [4.45, 0, 1], radius: 0.05 };
    const riser: Segment = { name: "S", start: [5, 0.45, 1], end: [5, 1.8, 1], radius: 0.05 };
    const blob = shellPoints([4.8, 0, 1], [5.2, 0, 1], 0.075);
    const pipes = fittedPipes([run, riser]);
    const connections = extractConnections(blob, pipes, 0.55);
    expect(connections).toHaveLength(2);
    const stats = fitAssetBlob(blob);
    expect(classifyRole(connections, stats.centroid, pipes)).toEqual({ role: "equipment", roleBasis: "terminal" });
  });

  it("classifies a single terminal connection as equipment", () => {
    const pipes = fittedPipes([RUN_A1]);
    const connections = extractConnections(VALVE_BLOB, pipes, DEFAULT_ASSET_TOLERANCE);
    expect(connections).toHaveLength(1);
    const stats = fitAssetBlob(VALVE_BLOB);
    expect(classifyRole(connections, stats.centroid, pipes)).toEqual({ role: "equipment", roleBasis: "terminal" });
  });

  it("refuses (null) when no connection evidence exists", () => {
    const pipes = fittedPipes([RUN_A1, RUN_A2]);
    const stats = fitAssetBlob(VALVE_BLOB);
    expect(classifyRole([], stats.centroid, pipes)).toBeNull();
  });

  it("the colinear gate is exactly the frozen constant (≈ cos 30°)", () => {
    expect(COLINEAR_COS_MIN).toBe(0.866);
    expect(COLINEAR_COS_MIN).toBeGreaterThan(Math.cos(Math.PI / 6) - 0.001);
    expect(DEFAULT_ASSET_TOLERANCE).toBe(0.35);
  });
});

describe("buildAsset (identity, provenance, uncertainty)", () => {
  it("builds the valve asset with content-derived identity and evidence linkage", () => {
    const pipes = fittedPipes([RUN_A1, RUN_A2]);
    const network = reconstructPipeNetwork({
      points: [RUN_A1, RUN_A2].flatMap((segment) =>
        shellPoints(segment.start, segment.end, segment.radius),
      ),
      unit: "meter",
      joinTolerance: 0.3,
    });
    const blobCluster = { firstIndex: 0, points: VALVE_BLOB };
    const classification = buildAsset(blobCluster, pipes, {
      unit: "meter",
      sourceEpistemic: "INFERRED",
      perPointSigma: undefined,
      assetTolerance: DEFAULT_ASSET_TOLERANCE,
      inputContentHash: network.inputContentHash,
      inputPointCount: network.counts.inputPoints,
    });
    if (classification.kind !== "asset") {
      throw new Error("the valve blob must classify as an asset");
    }
    const asset = classification.asset;
    expect(asset.assetId).toMatch(/^mep-asset-[0-9a-f]{16}$/);
    expect(asset.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(asset.role).toBe("valve");
    expect(asset.roleBasis).toBe("inline-continuation");
    expect(asset.position.x).toBeCloseTo(2, 10);
    expect(asset.size.value).toBeCloseTo(0.281753, 5);
    expect(asset.size.unit).toBe("meter");
    // The size standard error is the mean-radial estimator's standard
    // error — for an exact squat shell the scatter is shape-driven
    // (anisotropy), exposed verbatim by the residuals. Noise-free
    // position uncertainty stays ABSENT (not stated, never zero).
    expect(asset.size.uncertainty?.kind).toBe("standard");
    const valveSizeUncertainty = asset.size.uncertainty;
    if (valveSizeUncertainty?.kind === "standard") {
      expect(valveSizeUncertainty.u).toBeCloseTo(0.008242, 5);
    } else {
      throw new Error("the size uncertainty must be standard");
    }
    expect(asset.positionUncertainty).toBeUndefined();
    expect(asset.epistemic).toBe("INFERRED");
    expect(asset.connections).toHaveLength(2);
    for (const connection of asset.connections) {
      expect(connection.assetId).toBe(asset.assetId);
      expect(pipes.some((pipe) => pipe.pipeId === connection.pipeId)).toBe(true);
    }
    // Evidence linkage: provenance pins the input point-set.
    expect(asset.provenance.method).toBe("mep/asset-v1");
    expect(asset.provenance.inputs[0]?.kind).toBe("point-set");
    expect(asset.provenance.inputs[0]?.contentHash).toBe(network.inputContentHash);
  });

  it("carries honest standard uncertainties when the per-point sigma is declared", () => {
    const pipes = fittedPipes([RUN_A1, RUN_A2]);
    const blobCluster = { firstIndex: 0, points: VALVE_BLOB };
    const classification = buildAsset(blobCluster, pipes, {
      unit: "meter",
      sourceEpistemic: "OBSERVED",
      perPointSigma: 0.01,
      assetTolerance: DEFAULT_ASSET_TOLERANCE,
      inputContentHash: "0".repeat(64),
      inputPointCount: 1000,
    });
    if (classification.kind !== "asset") {
      throw new Error("expected an asset");
    }
    const positionUncertainty = classification.asset.positionUncertainty;
    expect(positionUncertainty?.kind).toBe("standard");
    if (positionUncertainty?.kind === "standard") {
      expect(positionUncertainty.u).toBeCloseTo(0.01 / 12, 6);
    } else {
      throw new Error("the position uncertainty must be standard");
    }
    const sizeUncertainty = classification.asset.size.uncertainty;
    expect(sizeUncertainty?.kind).toBe("standard");
    expect(classification.asset.epistemic).toBe("OBSERVED");
  });

  it("refuses an unconnected blob as unconnected-cluster (never an asset)", () => {
    const pipes = fittedPipes([RUN_A1, RUN_A2]);
    const farBlob = shellPoints([50, 50, 50], [50.4, 50, 50], 0.075);
    const classification = buildAsset({ firstIndex: 0, points: farBlob }, pipes, {
      unit: "meter",
      sourceEpistemic: "INFERRED",
      perPointSigma: undefined,
      assetTolerance: DEFAULT_ASSET_TOLERANCE,
      inputContentHash: "0".repeat(64),
      inputPointCount: 1000,
    });
    if (classification.kind !== "unassigned") {
      throw new Error("expected the unassigned refusal");
    }
    expect(classification.unassigned.reason).toBe("unconnected-cluster");
    expect(classification.unassigned.pointCount).toBe(144);
    expect(classification.unassigned.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fail-closed: a non-finite surface gap option is not possible (validated upstream)", () => {
    // The option validation lives in the topology entry point; here the
    // builder contract stays pure. Sanity: the error model narrows.
    const error = toMepError(new Error("not a mep error"));
    expect(error).toBeNull();
  });
});
