/**
 * WORLD-P0-A tests — the REAL glTF 2.0 / GLB parser: valid-asset
 * traversal, generated-fixture property tests, and the fail-closed law
 * exercised across every typed issue code. These tests run the real
 * parser code (src/gltf/parse.ts) — no fixtures are faked, every
 * malformed case is a real byte-level mutation.
 */

import { describe, expect, test } from "bun:test";
import { parseGlb, validateGltfJson, type GltfIssueCode } from "./parse";
import { InMemoryGltfDeliveryDouble } from "./double";
import type { GltfAssetSource } from "./contract";

/* ------------------------------------------------------------------ */
/* Fixture builders (real glTF JSON generated in-test)                 */
/* ------------------------------------------------------------------ */

interface FixtureParams {
  readonly meshCount: number;
  readonly verticesPerMesh: number;
  readonly indicesPerMesh: number;
}

/** Build a REAL minimal glTF 2.0 JSON document with N meshes. */
function buildGltfJson(p: FixtureParams): string {
  const nodes: unknown[] = [];
  const meshes: unknown[] = [];
  for (let i = 0; i < p.meshCount; i++) {
    meshes.push({
      name: `mesh-${i}`,
      primitives: [
        {
          mode: 4,
          attributes: { POSITION: 2 * i },
          indices: 2 * i + 1,
          material: p.meshCount > 0 && i === 0 ? 0 : undefined,
        },
      ],
    });
    nodes.push({ mesh: i, name: `node-${i}` });
  }
  const accessors: unknown[] = [];
  for (let i = 0; i < p.meshCount; i++) {
    accessors.push({ componentType: 5126, count: p.verticesPerMesh, type: "VEC3", bufferView: 0 });
    accessors.push({ componentType: 5123, count: p.indicesPerMesh, type: "SCALAR", bufferView: 1 });
  }
  const doc = {
    asset: { version: "2.0", generator: "aise-fixture-builder" },
    scene: 0,
    scenes: [{ name: "FixtureScene", nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: [{ name: "fixture-material", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] } }],
    accessors,
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 4 * 3 * p.verticesPerMesh * p.meshCount },
      { buffer: 0, byteOffset: 4 * 3 * p.verticesPerMesh * p.meshCount, byteLength: 2 * p.indicesPerMesh * p.meshCount },
    ],
    buffers: [
      { byteLength: 4 * 3 * p.verticesPerMesh * p.meshCount + 2 * p.indicesPerMesh * p.meshCount },
    ],
  };
  return JSON.stringify(doc);
}

/** Build a REAL GLB container: header + JSON chunk (+ padding) + BIN chunk. */
function buildGlb(jsonText: string, binBytes = 8): Uint8Array {
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const binPad = (4 - (binBytes % 4)) % 4;
  const total = 12 + 8 + jsonBytes.byteLength + jsonPad + 8 + binBytes + binPad;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  // JSON chunk
  view.setUint32(12, jsonBytes.byteLength + jsonPad, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i++) out[20 + jsonBytes.byteLength + i] = 0x20; // spaces
  // BIN chunk
  const binHeader = 20 + jsonBytes.byteLength + jsonPad;
  view.setUint32(binHeader, binBytes + binPad, true);
  view.setUint32(binHeader + 4, 0x004e4942, true); // "BIN\0"
  return out;
}

const enc = new TextEncoder();

/* ------------------------------------------------------------------ */
/* Valid-asset traversal                                               */
/* ------------------------------------------------------------------ */

describe("valid glTF JSON traversal", () => {
  test("a generated valid document parses with exact counts", () => {
    const p: FixtureParams = { meshCount: 3, verticesPerMesh: 100, indicesPerMesh: 240 };
    const res = validateGltfJson(buildGltfJson(p));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.asset.version).toBe("2.0");
    expect(res.asset.generator).toBe("aise-fixture-builder");
    expect(res.asset.meshes).toHaveLength(3);
    expect(res.asset.nodes).toHaveLength(3);
    expect(res.asset.materials).toHaveLength(1);
    expect(res.asset.totalVertexCount).toBe(300);
    expect(res.asset.totalIndexCount).toBe(720);
    expect(res.asset.defaultScene).toBe(0);
    expect(res.asset.partIds).toContain("mesh:0");
    expect(res.asset.partIds).toContain("mesh:2/primitive:0");
  });

  test("property: vertex/index totals scale linearly with fixture size", () => {
    for (const meshCount of [1, 2, 5, 10]) {
      const p: FixtureParams = { meshCount, verticesPerMesh: 50, indicesPerMesh: 100 };
      const res = validateGltfJson(buildGltfJson(p));
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      expect(res.asset.totalVertexCount).toBe(50 * meshCount);
      expect(res.asset.totalIndexCount).toBe(100 * meshCount);
      expect(res.asset.partIds.length).toBe(meshCount * 2); // mesh:N + mesh:N/primitive:0
    }
  });
});

describe("valid GLB container parsing", () => {
  test("a generated GLB parses and reports its BIN chunk size", () => {
    const glb = buildGlb(buildGltfJson({ meshCount: 1, verticesPerMesh: 10, indicesPerMesh: 20 }), 16);
    const res = parseGlb(glb);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.asset.version).toBe("2.0");
    expect(res.asset.binChunkBytes).toBe(16);
    expect(res.asset.meshes).toHaveLength(1);
  });

  test("property: GLB size accounting is exact for a range of JSON sizes", () => {
    for (const meshCount of [1, 3, 7]) {
      const json = buildGltfJson({ meshCount, verticesPerMesh: 8, indicesPerMesh: 12 });
      const glb = buildGlb(json, 4);
      const res = parseGlb(glb);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.asset.meshes).toHaveLength(meshCount);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Fail-closed law (every typed issue code exercised by REAL mutations) */
/* ------------------------------------------------------------------ */

describe("fail-closed: malformed assets are refused, never partially loaded", () => {
  const expectRefusal = (json: string, code: GltfIssueCode): void => {
    const res = validateGltfJson(json);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.code === code)).toBe(true);
    }
  };

  test("not valid JSON", () => {
    expectRefusal("{ not json", "json_parse_error");
  });
  test("missing asset block", () => {
    expectRefusal(JSON.stringify({ scenes: [{ nodes: [] }] }), "missing_asset");
  });
  test("unsupported version", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 })) as Record<string, unknown>;
    (doc.asset as Record<string, unknown>).version = "1.0";
    expectRefusal(JSON.stringify(doc), "unsupported_asset_version");
  });
  test("default scene index out of range", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 })) as Record<string, unknown>;
    doc.scene = 5;
    expectRefusal(JSON.stringify(doc), "scene_index_out_of_range");
  });
  test("node child out of range", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 })) as Record<string, unknown>;
    (doc.nodes as Array<Record<string, unknown>>)[0]!.children = [99];
    expectRefusal(JSON.stringify(doc), "node_index_out_of_range");
  });
  test("node self-cycle", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 })) as Record<string, unknown>;
    (doc.nodes as Array<Record<string, unknown>>)[0]!.children = [0];
    expectRefusal(JSON.stringify(doc), "node_cycle");
  });
  test("deep node cycle (a→b→a)", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 2, verticesPerMesh: 1, indicesPerMesh: 1 })) as Record<string, unknown>;
    const nodes = doc.nodes as Array<Record<string, unknown>>;
    nodes[0]!.children = [1];
    nodes[1]!.children = [0];
    expectRefusal(JSON.stringify(doc), "node_cycle");
  });
  test("mesh index out of range on a node", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 })) as Record<string, unknown>;
    (doc.nodes as Array<Record<string, unknown>>)[0]!.mesh = 42;
    expectRefusal(JSON.stringify(doc), "mesh_index_out_of_range");
  });
  test("material index out of range on a primitive", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 })) as Record<string, unknown>;
    ((doc.meshes as Array<Record<string, unknown>>)[0]!.primitives as Array<Record<string, unknown>>)[0]!.material = 7;
    expectRefusal(JSON.stringify(doc), "material_index_out_of_range");
  });
  test("primitive without POSITION", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 })) as Record<string, unknown>;
    const mesh = (doc.meshes as Array<Record<string, unknown>>)[0]!;
    (mesh.primitives as Array<Record<string, unknown>>)[0]!.attributes = { NORMAL: 0 };
    expectRefusal(JSON.stringify(doc), "mesh_primitive_missing_position");
  });
  test("mesh with no primitives", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 })) as Record<string, unknown>;
    (doc.meshes as Array<Record<string, unknown>>)[0]!.primitives = [];
    expectRefusal(JSON.stringify(doc), "mesh_missing_attributes");
  });
  test("bufferView byte arithmetic out of bounds", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 1, verticesPerMesh: 10, indicesPerMesh: 10 })) as Record<string, unknown>;
    (doc.buffers as Array<Record<string, unknown>>)[0]!.byteLength = 8; // far too small
    expectRefusal(JSON.stringify(doc), "buffer_view_out_of_bounds");
  });
  test("accessor bufferView index out of range", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 })) as Record<string, unknown>;
    (doc.accessors as Array<Record<string, unknown>>)[0]!.bufferView = 99;
    expectRefusal(JSON.stringify(doc), "accessor_missing_buffer_view");
  });
  test("negative accessor count", () => {
    const doc = JSON.parse(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 })) as Record<string, unknown>;
    (doc.accessors as Array<Record<string, unknown>>)[0]!.count = -5;
    expectRefusal(JSON.stringify(doc), "count_negative");
  });
});

describe("fail-closed: GLB container mutations", () => {
  test("bad magic", () => {
    const glb = buildGlb(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 }));
    const corrupt = new Uint8Array(glb);
    corrupt[0] = 0x58; // ruin "g"
    const res = parseGlb(corrupt);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0]?.code).toBe("glb_bad_magic");
  });
  test("unsupported container version", () => {
    const glb = buildGlb(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 }));
    const corrupt = new Uint8Array(glb);
    new DataView(corrupt.buffer).setUint32(4, 1, true);
    const res = parseGlb(corrupt);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0]?.code).toBe("glb_unsupported_version");
  });
  test("declared length mismatch", () => {
    const glb = buildGlb(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 }));
    const corrupt = new Uint8Array(glb);
    new DataView(corrupt.buffer).setUint32(8, corrupt.byteLength + 64, true);
    const res = parseGlb(corrupt);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0]?.code).toBe("glb_chunk_length_mismatch");
  });
  test("truncated header", () => {
    const res = parseGlb(new Uint8Array(8));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0]?.code).toBe("glb_truncated_header");
  });
  test("chunk length overrun", () => {
    const glb = buildGlb(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 }));
    const corrupt = new Uint8Array(glb);
    new DataView(corrupt.buffer).setUint32(12, 100000, true); // JSON chunk claims 100KB
    const res = parseGlb(corrupt);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues.some((i) => i.code === "glb_chunk_length_mismatch")).toBe(true);
  });
  test("non-UTF8 JSON chunk", () => {
    const glb = buildGlb(buildGltfJson({ meshCount: 1, verticesPerMesh: 1, indicesPerMesh: 1 }));
    const corrupt = new Uint8Array(glb);
    corrupt[21] = 0xff;
    corrupt[22] = 0xfe;
    corrupt[23] = 0xff;
    const res = parseGlb(corrupt);
    expect(res.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Delivery contract (double over the real parser)                     */
/* ------------------------------------------------------------------ */

describe("delivery contract (in-memory double over the REAL parser)", () => {
  test("deliver a valid GLB and resolve a part", () => {
    const adapter = new InMemoryGltfDeliveryDouble();
    const source: GltfAssetSource = {
      assetId: "asset-1",
      format: "glb",
      bytes: buildGlb(buildGltfJson({ meshCount: 2, verticesPerMesh: 30, indicesPerMesh: 60 })),
    };
    const delivered = adapter.deliver(source);
    expect(delivered.ok).toBe(true);
    if (!delivered.ok) return;
    const part = adapter.resolvePart(
      { assetId: "asset-1", partId: "mesh:1", format: "glb" },
      delivered.value,
    );
    expect(part.ok).toBe(true);
    if (part.ok) expect(part.value.meshIndex).toBe(1);
  });

  test("a malformed asset is refused with asset_malformed and typed issues", () => {
    const adapter = new InMemoryGltfDeliveryDouble();
    const bad: GltfAssetSource = { assetId: "bad-1", format: "gltf-json", bytes: enc.encode("{ broken") };
    const res = adapter.deliver(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.failure.code).toBe("asset_malformed");
      expect(res.failure.detail).toContain("json_parse_error");
    }
  });

  test("an empty source is refused asset_unreadable, never a partial load", () => {
    const adapter = new InMemoryGltfDeliveryDouble();
    const res = adapter.deliver({ assetId: "e", format: "glb", bytes: new Uint8Array(0) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure.code).toBe("asset_unreadable");
  });

  test("resolving a foreign assetId or unknown partId is refused", () => {
    const adapter = new InMemoryGltfDeliveryDouble();
    const source: GltfAssetSource = {
      assetId: "asset-1",
      format: "gltf-json",
      bytes: enc.encode(buildGltfJson({ meshCount: 1, verticesPerMesh: 5, indicesPerMesh: 9 })),
    };
    const delivered = adapter.deliver(source);
    if (!delivered.ok) throw new Error("deliver failed");
    const foreign = adapter.resolvePart(
      { assetId: "other-asset", partId: "mesh:0", format: "gltf-json" },
      delivered.value,
    );
    expect(foreign.ok).toBe(false);
    const unknownPart = adapter.resolvePart(
      { assetId: "asset-1", partId: "mesh:99", format: "gltf-json" },
      delivered.value,
    );
    expect(unknownPart.ok).toBe(false);
    if (!unknownPart.ok) expect(unknownPart.failure.code).toBe("asset_not_found");
  });

  test("capacity honesty: compression extensions declared BLOCKED", () => {
    const adapter = new InMemoryGltfDeliveryDouble();
    const draco = adapter.capabilities.blocked.find((b) => b.capability.includes("draco"));
    expect(draco).toBeDefined();
    expect(draco?.reason).toContain("WORLD-P1");
  });
});
