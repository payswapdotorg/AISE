/**
 * CRITICAL golden asset/topology benchmark (AISE-027) — the
 * controlled fixture acceptance: exact + seeded-noisy topologies
 * reconstructed by the REAL pipeline and pinned against ground
 * truth (pipes, assets, roles, connections, junctions, the
 * connectivity graph), with determinism, uncertainty and
 * validator pins.
 */
import { describe, expect, it } from "vitest";
import { reconstructMepTopology, type MepTopology } from "./topology.js";
import type { MepAsset } from "./asset.js";
import { validateMepTopology } from "./validate.js";
import {
  exactTopologyPoints,
  noisyTopologyPoints,
  topologyGroundTruth,
  TOPOLOGY_NOISE_SEED,
  TOPOLOGY_ASSET_TOLERANCE,
  TOPOLOGY_JOIN_TOLERANCE,
  TOPOLOGY_VALVE_GAP,
  TOPOLOGY_EQUIPMENT_GAP,
} from "./fixtures/topology.js";

const TRUTH = topologyGroundTruth();

const EXACT_INPUT = {
  points: exactTopologyPoints(),
  unit: "meter",
  joinTolerance: TOPOLOGY_JOIN_TOLERANCE,
  assetTolerance: TOPOLOGY_ASSET_TOLERANCE,
} as const;

/** Matches a reconstructed pipe to its ground-truth layout by midpoint proximity. */
function matchPipeName(topology: MepTopology, name: string): string {
  const truth = TRUTH.pipes.find((pipe) => pipe.name === name);
  if (truth === undefined) {
    throw new Error(`unknown ground-truth pipe: ${name}`);
  }
  const mid = {
    x: (truth.start.x + truth.end.x) / 2,
    y: (truth.start.y + truth.end.y) / 2,
    z: (truth.start.z + truth.end.z) / 2,
  };
  const pipe = topology.pipes.find((candidate) => {
    const candidateMid = {
      x: (candidate.centerline.start.x + candidate.centerline.end.x) / 2,
      y: (candidate.centerline.start.y + candidate.centerline.end.y) / 2,
      z: (candidate.centerline.start.z + candidate.centerline.end.z) / 2,
    };
    return Math.hypot(candidateMid.x - mid.x, candidateMid.y - mid.y, candidateMid.z - mid.z) < 0.2;
  });
  if (pipe === undefined) {
    throw new Error(`no reconstructed pipe near ground truth ${name}`);
  }
  return pipe.pipeId;
}

/** Matches a reconstructed asset to its ground-truth asset by position proximity. */
function matchAsset(topology: MepTopology, name: string): MepAsset {
  const truth = TRUTH.assets.find((asset) => asset.name === name);
  if (truth === undefined) {
    throw new Error(`unknown ground-truth asset: ${name}`);
  }
  const asset = topology.assets.find(
    (candidate) =>
      Math.hypot(
        candidate.position.x - truth.position.x,
        candidate.position.y - truth.position.y,
        candidate.position.z - truth.position.z,
      ) < 0.2,
  );
  if (asset === undefined) {
    throw new Error(`no reconstructed asset near ground truth ${name}`);
  }
  return asset;
}

describe("golden EXACT topology (real pipeline, no noise)", () => {
  const topology = reconstructMepTopology(EXACT_INPUT);

  it("reconstructs exactly 5 pipes + 2 assets with zero refusals (topology correctness)", () => {
    expect(topology.counts.pipes).toBe(5);
    expect(topology.counts.assets).toBe(2);
    expect(topology.counts.valves).toBe(1);
    expect(topology.counts.equipment).toBe(1);
    expect(topology.counts.unassigned).toBe(0);
    expect(() => validateMepTopology(topology)).not.toThrow();
  });

  it("pins every pipe centerline, diameter and length to the ground truth (±1e-6)", () => {
    for (const truth of TRUTH.pipes) {
      const pipe = topology.pipes.find((candidate) => candidate.pipeId === matchPipeName(topology, truth.name))!;
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

  it("pins both assets: positions exact, sizes analytic, roles and bases exact", () => {
    const valve = matchAsset(topology, "V");
    expect(valve.role).toBe("valve");
    expect(valve.roleBasis).toBe("inline-continuation");
    expect(valve.position.x).toBeCloseTo(2, 6);
    expect(valve.position.y).toBeCloseTo(0, 6);
    expect(valve.position.z).toBeCloseTo(1, 6);
    expect(valve.size.value).toBeCloseTo(0.281753, 5);
    const equipment = matchAsset(topology, "E");
    expect(equipment.role).toBe("equipment");
    expect(equipment.roleBasis).toBe("terminal");
    expect(equipment.position.x).toBeCloseTo(5.5, 6);
    expect(equipment.position.y).toBeCloseTo(0, 6);
    expect(equipment.position.z).toBeCloseTo(1, 6);
    expect(equipment.size.value).toBeCloseTo(0.507050, 5);
    // Noise-free: position uncertainties ABSENT (not stated, never zero).
    expect(valve.positionUncertainty).toBeUndefined();
    expect(equipment.positionUncertainty).toBeUndefined();
    // Evidence linkage: provenance pins the input point-set.
    for (const asset of [valve, equipment]) {
      expect(asset.provenance.inputs[0]?.contentHash).toBe(topology.inputContentHash);
      expect(asset.epistemic).toBe("INFERRED");
    }
  });

  it("pins the asset connections: pairs, endpoints and analytic surface gaps", () => {
    expect(topology.counts.assetConnections).toBe(3);
    const valve = matchAsset(topology, "V");
    expect(valve.connections).toHaveLength(2);
    const a1 = matchPipeName(topology, "A1");
    const a2 = matchPipeName(topology, "A2");
    const valvePairs = valve.connections.map(
      (connection) => `${connection.pipeId === a1 ? "A1" : connection.pipeId === a2 ? "A2" : "?"}:${connection.endpointIndex}`,
    );
    expect(valvePairs).toContain("A1:1");
    expect(valvePairs).toContain("A2:0");
    for (const connection of valve.connections) {
      expect(connection.surfaceGap).toBeCloseTo(TOPOLOGY_VALVE_GAP, 5);
      expect(connection.assetId).toBe(valve.assetId);
    }
    const equipment = matchAsset(topology, "E");
    expect(equipment.connections).toHaveLength(1);
    const connection = equipment.connections[0]!;
    expect(connection.pipeId).toBe(matchPipeName(topology, "D"));
    expect(connection.endpointIndex).toBe(1);
    expect(connection.surfaceGap).toBeCloseTo(TOPOLOGY_EQUIPMENT_GAP, 5);
  });

  it("pins the pipe-junction topology: 3 junctions with exact kinds and relations", () => {
    expect(topology.counts.junctions).toBe(3);
    expect(topology.junctions.filter((junction) => junction.kind === "branch")).toHaveLength(2);
    expect(topology.junctions.filter((junction) => junction.kind === "coupled")).toHaveLength(1);
    expect(topology.junctions.filter((junction) => junction.diameterRelation === "mismatch")).toHaveLength(2);
    expect(topology.junctions.filter((junction) => junction.diameterRelation === "compatible")).toHaveLength(1);
    const nameOf = (pipeId: string): string =>
      TRUTH.pipes.find((pipe) => matchPipeName(topology, pipe.name) === pipeId)?.name ?? "?";
    const junctionKeys = topology.junctions.map((junction) => `${nameOf(junction.pipeId)}->${nameOf(junction.nearPipeId)}:${junction.kind}`);
    expect(junctionKeys).toContain("C->A2:branch");
    expect(junctionKeys).toContain("C->B:branch");
    expect(junctionKeys).toContain("A2->D:coupled");
    for (const junction of topology.junctions) {
      expect(junction.distance).toBeCloseTo(0.25, 6);
    }
  });

  it("pins the connectivity graph: 7 nodes, 6 edges, 1 component, exact degrees", () => {
    expect(topology.graph.counts.nodes).toBe(7);
    expect(topology.graph.counts.edges).toBe(6);
    expect(topology.graph.counts.components).toBe(1);
    const degreeOf = (id: string): number | undefined =>
      topology.graph.nodes.find((node) => node.id === id)?.degree;
    const expectedDegrees: Record<string, number> = {
      A1: 1,
      A2: 3,
      B: 1,
      C: 2,
      D: 2,
    };
    for (const [name, degree] of Object.entries(expectedDegrees)) {
      expect(degreeOf(matchPipeName(topology, name))).toBe(degree);
    }
    expect(degreeOf(matchAsset(topology, "V").assetId)).toBe(2);
    expect(degreeOf(matchAsset(topology, "E").assetId)).toBe(1);
    expect(topology.graph.nodes.every((node) => node.component === 0)).toBe(true);
    expect(() => validateMepTopology(topology)).not.toThrow();
  });

  it("is deterministic: byte-identical repeat reconstruction", () => {
    const second = reconstructMepTopology(EXACT_INPUT);
    expect(JSON.stringify(second)).toBe(JSON.stringify(topology));
    expect(second.digest).toBe(topology.digest);
  });
});

describe("golden NOISY topology (seeded, σ = 0.01 m, recorded seed)", () => {
  const NOISY_INPUT = {
    points: noisyTopologyPoints(),
    unit: "meter",
    joinTolerance: TOPOLOGY_JOIN_TOLERANCE,
    assetTolerance: TOPOLOGY_ASSET_TOLERANCE,
    perPointStandardUncertainty: 0.01,
  } as const;

  it("the fixture is reproducible (same seed -> identical points)", () => {
    expect(JSON.stringify(noisyTopologyPoints())).toBe(JSON.stringify(noisyTopologyPoints()));
    expect(TOPOLOGY_NOISE_SEED).toBe(0x27272);
  });

  it("reconstructs the SAME topology structure under noise (roles, counts, graph)", () => {
    const topology = reconstructMepTopology(NOISY_INPUT);
    expect(topology.counts.pipes).toBe(5);
    expect(topology.counts.assets).toBe(2);
    expect(topology.counts.valves).toBe(1);
    expect(topology.counts.equipment).toBe(1);
    expect(topology.counts.unassigned).toBe(0);
    expect(topology.counts.junctions).toBe(3);
    expect(topology.counts.assetConnections).toBe(3);
    expect(topology.graph.counts.nodes).toBe(7);
    expect(topology.graph.counts.edges).toBe(6);
    expect(topology.graph.counts.components).toBe(1);
    expect(() => validateMepTopology(topology)).not.toThrow();
    // The noisy valve is STILL a valve (the continuation evidence
    // survives noise); the equipment is STILL terminal.
    const valve = topology.assets.find((asset) => asset.role === "valve");
    const equipment = topology.assets.find((asset) => asset.role === "equipment");
    expect(valve?.roleBasis).toBe("inline-continuation");
    expect(valve?.connections.length).toBe(2);
    expect(equipment?.roleBasis).toBe("terminal");
    expect(equipment?.connections.length).toBe(1);
  });

  it("holds asset positions within the noise tolerance (±0.03 m) and junction structure", () => {
    const topology = reconstructMepTopology(NOISY_INPUT);
    for (const truth of TRUTH.assets) {
      const asset = matchAsset(topology, truth.name);
      expect(Math.hypot(asset.position.x - truth.position.x, asset.position.y - truth.position.y, asset.position.z - truth.position.z)).toBeLessThan(0.03);
      expect(asset.size.value).toBeCloseTo(truth.size, 1);
    }
    for (const truth of TRUTH.pipes) {
      const pipe = topology.pipes.find((candidate) => candidate.pipeId === matchPipeName(topology, truth.name))!;
      expect(pipe.diameter.value).toBeCloseTo(truth.diameter, 1);
      expect(pipe.length.value).toBeCloseTo(truth.length, 1);
    }
    // Connection surface gaps stay near the analytic gaps.
    const valve = topology.assets.find((asset) => asset.role === "valve")!;
    for (const connection of valve.connections) {
      expect(Math.abs(connection.surfaceGap - TOPOLOGY_VALVE_GAP)).toBeLessThan(0.06);
    }
    const equipment = topology.assets.find((asset) => asset.role === "equipment")!;
    expect(Math.abs(equipment.connections[0]!.surfaceGap - TOPOLOGY_EQUIPMENT_GAP)).toBeLessThan(0.06);
  });

  it("noisy assets carry honest standard uncertainties (uncertainty acceptance)", () => {
    const topology = reconstructMepTopology(NOISY_INPUT);
    for (const asset of topology.assets) {
      expect(asset.positionUncertainty?.kind).toBe("standard");
      if (asset.positionUncertainty?.kind === "standard") {
        // perPointSigma/√N with N = 144.
        expect(asset.positionUncertainty.u).toBeCloseTo(0.01 / 12, 3);
      }
    }
  });

  it("is deterministic under noise (same seed -> byte-identical topology)", () => {
    const first = reconstructMepTopology(NOISY_INPUT);
    const second = reconstructMepTopology(NOISY_INPUT);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
