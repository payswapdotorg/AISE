/**
 * Topology reconstruction tests (AISE-027) — fail-closed inputs,
 * bit-identical composition with the AISE-026 pipe facts, honest
 * refusals, uncertainty discipline, epistemic passthrough, the
 * connectivity graph invariants, and the validator's fail-closed
 * tamper detection (digest content-binding included).
 */
import { describe, expect, it } from "vitest";
import { DeterministicRng, type GeomPoint } from "@aise/backend-geometry";
import { reconstructPipeNetwork } from "./network.js";
import { reconstructMepTopology, MEP_TOPOLOGY_LIMITATIONS, type MepTopology } from "./topology.js";
import { validateMepTopology } from "./validate.js";
import { toMepError, type MepError } from "./errors.js";
import {
  exactTopologyPoints,
  TOPOLOGY_ASSET_TOLERANCE,
  TOPOLOGY_JOIN_TOLERANCE,
} from "./fixtures/topology.js";
import { exactPipeNetworkPoints, GOLDEN_JOIN_TOLERANCE } from "./fixtures/golden.js";

function captureError(action: () => unknown): MepError | null {
  try {
    action();
  } catch (error) {
    return toMepError(error);
  }
  return null;
}

const TOPOLOGY_INPUT = {
  points: exactTopologyPoints(),
  unit: "meter",
  joinTolerance: TOPOLOGY_JOIN_TOLERANCE,
  assetTolerance: TOPOLOGY_ASSET_TOLERANCE,
} as const;

describe("reconstructMepTopology — fail-closed inputs", () => {
  it("refuses an empty point cloud", () => {
    const error = captureError(() => reconstructMepTopology({ points: [], unit: "meter" }));
    expect(error?.code).toBe("EMPTY_INPUT");
  });

  it("refuses an invalid unit (fail-closed before any work)", () => {
    const error = captureError(() => reconstructMepTopology({ points: exactTopologyPoints(), unit: "cubit" }));
    expect(error?.code).toBe("VALIDATION_FAILED");
    expect(error?.details.unit).toBe("cubit");
  });

  it("refuses non-finite coordinates", () => {
    const points = [...exactTopologyPoints(), { x: Number.NaN, y: 0, z: 1 }];
    const error = captureError(() => reconstructMepTopology({ points, unit: "meter" }));
    expect(error?.code).toBe("NON_FINITE_INPUT");
  });

  it("refuses invalid options (tolerances and gates)", () => {
    const cases: { options: Record<string, unknown>; code: string }[] = [
      { options: { clusterRadius: 0 }, code: "OPTION_INVALID" },
      { options: { clusterRadius: -0.1 }, code: "OPTION_INVALID" },
      { options: { joinTolerance: 0 }, code: "OPTION_INVALID" },
      { options: { joinTolerance: Number.POSITIVE_INFINITY }, code: "OPTION_INVALID" },
      { options: { assetTolerance: -1 }, code: "OPTION_INVALID" },
      { options: { assetTolerance: 0 }, code: "OPTION_INVALID" },
      { options: { minPipePoints: 1.5 }, code: "OPTION_INVALID" },
      { options: { minPipePoints: 1 }, code: "OPTION_INVALID" },
      { options: { perPointStandardUncertainty: -0.01 }, code: "VALIDATION_FAILED" },
      { options: { perPointStandardUncertainty: Number.NaN }, code: "VALIDATION_FAILED" },
    ];
    for (const testCase of cases) {
      const error = captureError(() =>
        reconstructMepTopology({ ...TOPOLOGY_INPUT, ...testCase.options }),
      );
      expect(error?.code, JSON.stringify(testCase.options)).toBe(testCase.code);
    }
  });
});

describe("reconstructMepTopology — composition with the AISE-026 pipe facts", () => {
  it("produces IDENTICAL pipes and junctions to reconstructPipeNetwork (bit-level)", () => {
    const topology = reconstructMepTopology(TOPOLOGY_INPUT);
    const network = reconstructPipeNetwork({
      points: exactTopologyPoints(),
      unit: "meter",
      joinTolerance: TOPOLOGY_JOIN_TOLERANCE,
    });
    expect(JSON.stringify(topology.pipes)).toBe(JSON.stringify(network.pipes));
    expect(JSON.stringify(topology.junctions)).toBe(JSON.stringify(network.junctions));
    expect(topology.inputContentHash).toBe(network.inputContentHash);
    expect(topology.sourceEpistemic).toBe(network.sourceEpistemic);
    expect(topology.counts.inputPoints).toBe(network.counts.inputPoints);
  });

  it("reconstructs the pure AISE-026 fixture with zero assets (graph = 4 nodes, 3 edges, 1 component)", () => {
    const topology = reconstructMepTopology({
      points: exactPipeNetworkPoints(),
      unit: "meter",
      joinTolerance: GOLDEN_JOIN_TOLERANCE,
    });
    expect(topology.counts.pipes).toBe(4);
    expect(topology.counts.assets).toBe(0);
    expect(topology.counts.unassigned).toBe(0);
    expect(topology.graph.counts.nodes).toBe(4);
    expect(topology.graph.counts.edges).toBe(3);
    expect(topology.graph.counts.components).toBe(1);
    expect(topology.graph.nodes.every((node) => node.kind === "pipe")).toBe(true);
    expect(() => validateMepTopology(topology)).not.toThrow();
  });

  it("is emission-order independent (canonicalization first, identical digest)", () => {
    const shuffled = [...exactTopologyPoints()];
    const rng = new DeterministicRng(0x777);
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng.nextUnit() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const first = reconstructMepTopology(TOPOLOGY_INPUT);
    const second = reconstructMepTopology({ ...TOPOLOGY_INPUT, points: shuffled });
    expect(second.digest).toBe(first.digest);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("is deterministic (byte-identical repeat)", () => {
    const first = reconstructMepTopology(TOPOLOGY_INPUT);
    const second = reconstructMepTopology(TOPOLOGY_INPUT);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("different input content produces a different topology digest", () => {
    const first = reconstructMepTopology(TOPOLOGY_INPUT);
    const moved = exactTopologyPoints().map((point) => ({ x: point.x + 0.5, y: point.y, z: point.z }));
    const second = reconstructMepTopology({ ...TOPOLOGY_INPUT, points: moved });
    expect(second.digest).not.toBe(first.digest);
  });
});

describe("reconstructMepTopology — honest refusals", () => {
  it("refuses an isolated squat blob as unconnected-cluster (never an asset)", () => {
    const blob: GeomPoint[] = [];
    for (let ring = 0; ring < 16; ring += 1) {
      const theta = (2 * Math.PI * ring) / 16;
      blob.push({ x: 50 + 0.075 * Math.cos(theta), y: 50 + 0.075 * Math.sin(theta), z: 50 });
    }
    const topology = reconstructMepTopology({ points: blob, unit: "meter" });
    expect(topology.counts.pipes).toBe(0);
    expect(topology.counts.assets).toBe(0);
    expect(topology.counts.unassigned).toBe(1);
    expect(topology.unassigned[0]?.reason).toBe("unconnected-cluster");
    expect(() => validateMepTopology(topology)).not.toThrow();
  });

  it("refuses an undersized cluster as insufficient-points (no claims from 9 points)", () => {
    const blob: GeomPoint[] = [];
    for (let index = 0; index < 9; index += 1) {
      const theta = (2 * Math.PI * index) / 9;
      blob.push({ x: 50 + 0.03 * Math.cos(theta), y: 50 + 0.03 * Math.sin(theta), z: 50 });
    }
    const topology = reconstructMepTopology({ points: blob, unit: "meter" });
    expect(topology.counts.pipes).toBe(0);
    expect(topology.counts.assets).toBe(0);
    expect(topology.counts.unassigned).toBe(1);
    expect(topology.unassigned[0]?.reason).toBe("insufficient-points");
    expect(() => validateMepTopology(topology)).not.toThrow();
  });
});

describe("reconstructMepTopology — uncertainty and epistemic discipline", () => {
  it("noise-free: position uncertainties ABSENT (not stated, never zero)", () => {
    const topology = reconstructMepTopology(TOPOLOGY_INPUT);
    for (const asset of topology.assets) {
      expect(asset.positionUncertainty).toBeUndefined();
    }
  });

  it("declared per-point sigma: assets carry standard uncertainties", () => {
    const topology = reconstructMepTopology({
      ...TOPOLOGY_INPUT,
      perPointStandardUncertainty: 0.01,
    });
    expect(topology.assets.length).toBeGreaterThan(0);
    for (const asset of topology.assets) {
      expect(asset.positionUncertainty?.kind).toBe("standard");
    }
  });

  it("epistemic passthrough: a declared source state is carried verbatim (never upgraded)", () => {
    const topology = reconstructMepTopology({ ...TOPOLOGY_INPUT, sourceEpistemic: "OBSERVED" });
    expect(topology.sourceEpistemic).toBe("OBSERVED");
    expect(topology.pipes.every((pipe) => pipe.epistemic === "OBSERVED")).toBe(true);
    expect(topology.assets.every((asset) => asset.epistemic === "OBSERVED")).toBe(true);
  });

  it("default epistemic state is INFERRED (the reconstruction grade)", () => {
    const topology = reconstructMepTopology(TOPOLOGY_INPUT);
    expect(topology.sourceEpistemic).toBe("INFERRED");
    expect(topology.assets.every((asset) => asset.epistemic === "INFERRED")).toBe(true);
  });

  it("embeds the AISE-027 topology limitations (pipe limitations + asset/topology entries)", () => {
    const topology = reconstructMepTopology(TOPOLOGY_INPUT);
    expect(topology.limitations).toEqual(MEP_TOPOLOGY_LIMITATIONS);
    expect(topology.limitations.length).toBe(14);
  });
});

describe("reconstructMepTopology — the connectivity graph", () => {
  const topology = reconstructMepTopology(TOPOLOGY_INPUT);

  it("nodes cover every pipe and asset exactly once, in canonical id order", () => {
    const expected = new Set([
      ...topology.pipes.map((pipe) => pipe.pipeId),
      ...topology.assets.map((asset) => asset.assetId),
    ]);
    const ids = topology.graph.nodes.map((node) => node.id);
    expect(new Set(ids)).toEqual(expected);
    expect(ids).toHaveLength(expected.size);
    expect([...ids].sort()).toEqual(ids);
    for (const node of topology.graph.nodes) {
      expect(node.kind).toBe(node.id.startsWith("mep-asset-") ? "asset" : "pipe");
    }
  });

  it("edges: 3 pipe-junction + 3 asset-connection, canonical (a, b) order, a < b", () => {
    expect(topology.graph.counts.edges).toBe(6);
    expect(topology.graph.edges.filter((edge) => edge.kind === "pipe-junction")).toHaveLength(3);
    expect(topology.graph.edges.filter((edge) => edge.kind === "asset-connection")).toHaveLength(3);
    let previous: readonly [string, string] | undefined;
    for (const edge of topology.graph.edges) {
      expect(edge.a < edge.b).toBe(true);
      const pair: readonly [string, string] = [edge.a, edge.b];
      if (previous !== undefined) {
        expect(previous[0] < pair[0] || (previous[0] === pair[0] && previous[1] < pair[1])).toBe(true);
      }
      previous = pair;
    }
  });

  it("degrees are the incident edge counts (sum = 2·edges)", () => {
    const degreeSum = topology.graph.nodes.reduce((total, node) => total + node.degree, 0);
    expect(degreeSum).toBe(2 * topology.graph.counts.edges);
    expect(topology.graph.nodes.some((node) => node.degree === 3)).toBe(true); // the run-splitting pipe
  });

  it("the fixture topology is ONE connected component", () => {
    expect(topology.graph.counts.components).toBe(1);
    expect(topology.graph.nodes.every((node) => node.component === 0)).toBe(true);
  });

  it("a disjoint mini network forms a SECOND component (canonical indices, validated)", () => {
    const miniShell = (startX: number, endX: number): GeomPoint[] => {
      const points: GeomPoint[] = [];
      const length = endX - startX;
      const steps = Math.round(length / 0.05);
      for (let step = 0; step <= steps; step += 1) {
        const t = (step / steps) * length;
        for (let ring = 0; ring < 16; ring += 1) {
          const theta = (2 * Math.PI * ring) / 16;
          points.push({ x: startX + t, y: 0.05 * Math.cos(theta), z: 1 + 0.05 * Math.sin(theta) });
        }
      }
      return points;
    };
    const mini = [...miniShell(25, 26.55), ...miniShell(26.8, 28)];
    const topology2 = reconstructMepTopology({
      points: [...exactTopologyPoints(), ...mini],
      unit: "meter",
      joinTolerance: TOPOLOGY_JOIN_TOLERANCE,
      assetTolerance: TOPOLOGY_ASSET_TOLERANCE,
    });
    expect(topology2.counts.pipes).toBe(7);
    expect(topology2.graph.counts.components).toBe(2);
    expect(new Set(topology2.graph.nodes.map((node) => node.component))).toEqual(new Set([0, 1]));
    // The two mini-network nodes share one component, distinct from the fixture's.
    const miniNodes = topology2.graph.nodes.filter(
      (node) => topology2.pipes.some((pipe) => pipe.pipeId === node.id && pipe.centerline.start.x > 20),
    );
    expect(miniNodes).toHaveLength(2);
    expect(miniNodes[0]!.component).toBe(miniNodes[1]!.component);
    expect(topology2.graph.nodes.filter((node) => node.component !== miniNodes[0]!.component).length).toBe(
      topology2.graph.counts.nodes - 2,
    );
    expect(() => validateMepTopology(topology2)).not.toThrow();
  });
});

describe("validateMepTopology — fail-closed tamper detection", () => {
  const topology = reconstructMepTopology(TOPOLOGY_INPUT);

  it("accepts the honest reconstruction", () => {
    expect(() => validateMepTopology(topology)).not.toThrow();
  });

  it("rejects a placeholder digest (content binding)", () => {
    const tampered: MepTopology = { ...topology, digest: "0".repeat(64) };
    const error = captureError(() => validateMepTopology(tampered));
    expect(error?.code).toBe("TOPOLOGY_INVALID");
  });

  it("rejects content tampering with a stale digest (size value changed)", () => {
    const tampered: MepTopology = {
      ...topology,
      assets: topology.assets.map((asset) => ({
        ...asset,
        size: { ...asset.size, value: asset.size.value + 0.5 },
      })),
    };
    const error = captureError(() => validateMepTopology(tampered));
    expect(error?.code).toBe("TOPOLOGY_INVALID");
  });

  it("rejects connections referencing unknown pipes", () => {
    const tampered: MepTopology = {
      ...topology,
      assets: topology.assets.map((asset) => ({
        ...asset,
        connections: asset.connections.map((connection) => ({
          ...connection,
          pipeId: connection.pipeId === topology.pipes[0]?.pipeId ? "mep-pipe-0000000000000000" : connection.pipeId,
        })),
      })),
    };
    const error = captureError(() => validateMepTopology(tampered));
    expect(error?.code).toBe("TOPOLOGY_INVALID");
  });

  it("rejects wrong node degrees", () => {
    const tampered: MepTopology = {
      ...topology,
      graph: {
        ...topology.graph,
        nodes: topology.graph.nodes.map((node, index) => (index === 0 ? { ...node, degree: node.degree + 1 } : node)),
      },
    };
    const error = captureError(() => validateMepTopology(tampered));
    expect(error?.code).toBe("TOPOLOGY_INVALID");
  });

  it("rejects out-of-range component labels", () => {
    const tampered: MepTopology = {
      ...topology,
      graph: {
        ...topology.graph,
        nodes: topology.graph.nodes.map((node, index) => (index === 0 ? { ...node, component: 5 } : node)),
      },
    };
    const error = captureError(() => validateMepTopology(tampered));
    expect(error?.code).toBe("TOPOLOGY_INVALID");
  });

  it("rejects duplicate asset identities", () => {
    const [first] = topology.assets;
    if (first === undefined) {
      throw new Error("the fixture must carry assets");
    }
    const tampered: MepTopology = { ...topology, assets: [...topology.assets, { ...first }] };
    const error = captureError(() => validateMepTopology(tampered));
    expect(error?.code).toBe("TOPOLOGY_INVALID");
  });

  it("rejects a valve without inline-continuation evidence (one connection)", () => {
    const valve = topology.assets.find((asset) => asset.role === "valve");
    if (valve === undefined) {
      throw new Error("the fixture must carry a valve");
    }
    const tampered: MepTopology = {
      ...topology,
      assets: topology.assets.map((asset) =>
        asset.assetId === valve.assetId ? { ...asset, connections: asset.connections.slice(0, 1) } : asset,
      ),
    };
    const error = captureError(() => validateMepTopology(tampered));
    expect(error?.code).toBe("TOPOLOGY_INVALID");
  });

  it("rejects non-canonical connection order", () => {
    const valve = topology.assets.find((asset) => asset.role === "valve");
    if (valve === undefined || valve.connections.length < 2) {
      throw new Error("the fixture valve must carry two connections");
    }
    const tampered: MepTopology = {
      ...topology,
      assets: topology.assets.map((asset) =>
        asset.assetId === valve.assetId
          ? { ...asset, connections: [...asset.connections].reverse() }
          : asset,
      ),
    };
    const error = captureError(() => validateMepTopology(tampered));
    expect(error?.code).toBe("TOPOLOGY_INVALID");
  });

  it("rejects a graph node set that misses an asset", () => {
    const tampered: MepTopology = {
      ...topology,
      graph: {
        ...topology.graph,
        nodes: topology.graph.nodes.slice(1),
        counts: { ...topology.graph.counts, nodes: topology.graph.nodes.length - 1 },
      },
    };
    const error = captureError(() => validateMepTopology(tampered));
    expect(error?.code).toBe("TOPOLOGY_INVALID");
  });

  it("rejects a deleted edge (degree + bijection violations)", () => {
    const tampered: MepTopology = {
      ...topology,
      graph: {
        ...topology.graph,
        edges: topology.graph.edges.slice(1),
        counts: { ...topology.graph.counts, edges: topology.graph.edges.length - 1 },
      },
    };
    const error = captureError(() => validateMepTopology(tampered));
    expect(error?.code).toBe("TOPOLOGY_INVALID");
  });

  it("rejects a role/basis mismatch", () => {
    const valve = topology.assets.find((asset) => asset.role === "valve");
    if (valve === undefined) {
      throw new Error("the fixture must carry a valve");
    }
    const tampered: MepTopology = {
      ...topology,
      assets: topology.assets.map((asset) =>
        asset.assetId === valve.assetId ? { ...asset, roleBasis: "terminal" } : asset,
      ),
    };
    const error = captureError(() => validateMepTopology(tampered));
    expect(error?.code).toBe("TOPOLOGY_INVALID");
  });
});
