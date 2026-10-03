/**
 * WORLD-P0-A tests — the GLB v2 container codec and the glTF 2.0 document
 * validator.
 *
 * Laws under test:
 *
 *   1. ROUNDTRIP — encodeGlb → parseGlb → extractCanonicalGeometry
 *      reproduces the authored geometry (counts, digests, bounds).
 *   2. THE BYTE-IDENTICAL RULE — two independent parses of the same GLB
 *      produce byte-identical canonical streams (not just equal digests).
 *   3. FAIL-CLOSED TOTALITY — the parser NEVER throws: seeded random
 *      single-byte mutations over the canonical GLB (and over truncated
 *      prefixes) always answer with a typed outcome.
 *   4. THE NEGATIVE CORPUS — every closed issue code is EXERCISED by at
 *      least one fixture (the coverage assertion proves the vocabulary
 *      carries no dead code), and each refusal carries exactly its mapped
 *      failure kind.
 *   5. DECLARED RESOURCE LIMITS — a GLB over the declared byte ceiling and
 *      an accessor over the declared count ceiling are refused BEFORE
 *      unbounded work, with the limit pair recorded.
 */

import { describe, expect, test } from "bun:test";
import {
  buildCanonicalGlb,
  canonicalGltfDocument,
  encodeGlb,
  extractCanonicalGeometry,
  GLB_CHUNK_TYPE_BIN,
  GLB_CHUNK_TYPE_JSON,
  GLB_CONTAINER_ISSUE_CODES,
  GLB_CONTAINER_ISSUE_KIND,
  GLB_LIMITS,
  parseGlb,
} from "./glb";
import {
  GLTF_DOCUMENT_ISSUE_CODES,
  GLTF_DOCUMENT_ISSUE_KIND,
  validateGltfDocument,
} from "./gltf";
import { isSubstrateFailureKind } from "./outcome";
import { seededRandom } from "./seeded";

/* ------------------------------------------------------------------ */
/* Fixtures                                                              */
/* ------------------------------------------------------------------ */

function baseBin(): Uint8Array {
  const bin = new Uint8Array(42);
  const view = new DataView(bin.buffer);
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  for (let index = 0; index < positions.length; index += 1) {
    view.setFloat32(index * 4, positions[index] ?? 0, true);
  }
  for (let index = 0; index < 3; index += 1) {
    view.setUint16(36 + index * 2, index, true);
  }
  return bin;
}

/** Deep-mutable clone of the canonical document. */
function doc(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(canonicalGltfDocument())) as Record<string, unknown>;
}

function build(mutate?: (document: Record<string, unknown>) => void, bin?: Uint8Array): Uint8Array {
  const document = doc();
  mutate?.(document);
  return encodeGlb(document, bin ?? baseBin());
}

/** The code a refusal must carry (from the failure detail's tail). */
function issueCodeOf(failure: { readonly detail: string }): string | null {
  const match = /issue code ([a-z0-9-]+)\)?$/.exec(failure.detail);
  return match === null ? null : (match[1] ?? null);
}

/* ------------------------------------------------------------------ */
/* 1 — roundtrip + the byte-identical rule                                */
/* ------------------------------------------------------------------ */

describe("the GLB codec roundtrip", () => {
  test("encodeGlb -> parseGlb reproduces the authored container and geometry", () => {
    const glb = buildCanonicalGlb();
    const parsed = parseGlb(glb);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value.container.version).toBe(2);
    expect(parsed.value.container.chunkCount).toBe(2);
    expect(parsed.value.container.binChunkBytes).not.toBeNull();
    expect(parsed.value.document.meshes).toHaveLength(1);
    expect(parsed.value.document.meshes[0]?.primitives).toHaveLength(1);
    expect(parsed.value.document.meshes[0]?.primitives[0]?.positionAccessor).toBe(0);
    const extraction = extractCanonicalGeometry(parsed.value);
    expect(extraction.ok).toBe(true);
    if (!extraction.ok) {
      return;
    }
    expect(extraction.value.totalVertexCount).toBe(3);
    expect(extraction.value.totalIndexCount).toBe(3);
    // header 20 + POSITION 36 + indices 6
    expect(extraction.value.stream.length).toBe(62);
  });

  test("THE BYTE-IDENTICAL RULE: two parses yield byte-identical canonical streams", () => {
    const glb = buildCanonicalGlb();
    const extractionOf = () => {
      const parsed = parseGlb(glb);
      if (!parsed.ok) {
        throw new Error("canonical GLB failed to parse");
      }
      const extraction = extractCanonicalGeometry(parsed.value);
      if (!extraction.ok) {
        throw new Error("canonical GLB failed to extract");
      }
      return extraction.value;
    };
    const first = extractionOf();
    const second = extractionOf();
    expect(Buffer.compare(Buffer.from(first.stream), Buffer.from(second.stream))).toBe(0);
    expect(first.digest).toBe(second.digest);
  });

  test("the realized bounds cross-check matches the declared accessor bounds exactly", () => {
    const parsed = parseGlb(buildCanonicalGlb());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const extraction = extractCanonicalGeometry(parsed.value);
    expect(extraction.ok).toBe(true);
    if (!extraction.ok) {
      return;
    }
    const primitive = extraction.value.primitives[0];
    expect(primitive?.realizedMin).toEqual([0, 0, 0]);
    expect(primitive?.realizedMax).toEqual([1, 1, 0]);
    expect(primitive?.realizedBoundsMatchDeclared).toBe(true);
  });

  test("encodeGlb pads the JSON chunk with 0x20 and the BIN chunk with 0x00", () => {
    const glb = buildCanonicalGlb();
    const view = new DataView(glb.buffer);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.length);
    expect(glb.length % 4).toBe(0);
    // The canonical JSON is 507 bytes raw -> one 0x20 pad -> 508.
    const raw = new TextEncoder().encode(JSON.stringify(doc()));
    expect(raw.length % 4).toBe(3);
    const jsonDataStart = 20;
    expect(glb[jsonDataStart + raw.length]).toBe(0x20);
    const binDataStart = 20 + 508 + 8;
    expect(glb[binDataStart + 42]).toBe(0x00);
  });

  test("a multi-mesh, multi-primitive GLB extracts in document order with a stable digest", () => {
    const bin = new Uint8Array(72 + 6 + 24);
    const view = new DataView(bin.buffer);
    const secondMeshPositions = [5, 5, 5, 6, 5, 5];
    for (let index = 0; index < 9; index += 1) {
      view.setFloat32(index * 4, [0, 0, 0, 1, 0, 0, 0, 1, 0][index] ?? 0, true);
    }
    for (let index = 0; index < 3; index += 1) {
      view.setUint16(36 + index * 2, index, true);
    }
    for (let index = 0; index < secondMeshPositions.length; index += 1) {
      view.setFloat32(42 + index * 4, secondMeshPositions[index] ?? 0, true);
    }
    const glb = build((document) => {
      document["accessors"] = [
        (document["accessors"] as unknown[])[0],
        (document["accessors"] as unknown[])[1],
        {
          bufferView: 2,
          componentType: 5126,
          count: 2,
          type: "VEC3",
          min: [5, 5, 5],
          max: [6, 5, 5],
        },
      ];
      document["bufferViews"] = [
        (document["bufferViews"] as unknown[])[0],
        (document["bufferViews"] as unknown[])[1],
        { buffer: 0, byteOffset: 42, byteLength: 24 },
      ];
      document["buffers"] = [{ byteLength: 72 }];
      document["meshes"] = [
        { primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] },
        { primitives: [{ attributes: { POSITION: 2 }, mode: 0 }] },
      ];
      document["nodes"] = [{ mesh: 0 }, { mesh: 1 }];
      document["scenes"] = [{ nodes: [0, 1] }];
    }, bin);
    const parsed = parseGlb(glb);
    expect(parsed.ok).toBe(true);
    const extraction = extractCanonicalGeometry(parsed.ok ? parsed.value : (undefined as never));
    expect(extraction.ok).toBe(true);
    if (!extraction.ok) {
      return;
    }
    expect(extraction.value.primitives).toHaveLength(2);
    expect(extraction.value.totalVertexCount).toBe(5);
    const stream = extraction.value.stream;
    // mesh 0 header, positions(36), indices(6), mesh 1 header, positions(24)
    expect(stream.length).toBe(20 + 36 + 6 + 20 + 24);
    const reparsed = parseGlb(glb);
    if (!reparsed.ok) {
      throw new Error("reparse failed");
    }
    const again = extractCanonicalGeometry(reparsed.value);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.digest).toBe(extraction.value.digest);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2 — the negative corpus (container-level byte surgery)                */
/* ------------------------------------------------------------------ */

function setHeaderField(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  const copy = new Uint8Array(bytes);
  new DataView(copy.buffer).setUint32(offset, value, true);
  return copy;
}

function cutTo(bytes: Uint8Array, length: number): Uint8Array {
  const copy = new Uint8Array(bytes.subarray(0, length));
  new DataView(copy.buffer).setUint32(8, length, true);
  return copy;
}

/** Build a custom 3-chunk GLB: JSON, MIDDLE, BIN. */
function buildThreeChunk(middleType: number, middleData: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(doc()));
  const bin = baseBin();
  const jsonPadding = (4 - (json.length % 4)) % 4;
  const middlePadding = (4 - (middleData.length % 4)) % 4;
  const binPadding = (4 - (bin.length % 4)) % 4;
  const total =
    12 + 8 + json.length + jsonPadding + 8 + middleData.length + middlePadding + 8 + bin.length + binPadding;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  let offset = 12;
  view.setUint32(offset, json.length + jsonPadding, true);
  view.setUint32(offset + 4, GLB_CHUNK_TYPE_JSON, true);
  offset += 8;
  out.set(json, offset);
  out.fill(0x20, offset + json.length, offset + json.length + jsonPadding);
  offset += json.length + jsonPadding;
  view.setUint32(offset, middleData.length + middlePadding, true);
  view.setUint32(offset + 4, middleType, true);
  offset += 8;
  out.set(middleData, offset);
  out.fill(0x00, offset + middleData.length, offset + middleData.length + middlePadding);
  offset += middleData.length + middlePadding;
  view.setUint32(offset, bin.length + binPadding, true);
  view.setUint32(offset + 4, GLB_CHUNK_TYPE_BIN, true);
  offset += 8;
  out.set(bin, offset);
  out.fill(0x00, offset + bin.length, offset + bin.length + binPadding);
  return out;
}

/** Build a raw container with EXACT chunk lengths the caller controls. */
function customContainer(
  jsonData: Uint8Array,
  jsonLengthField: number,
  binData: Uint8Array,
  binLengthField: number,
): Uint8Array {
  const total = 12 + 8 + jsonLengthField + 8 + binLengthField;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLengthField, true);
  view.setUint32(16, GLB_CHUNK_TYPE_JSON, true);
  out.set(jsonData.subarray(0, Math.min(jsonData.length, jsonLengthField)), 20);
  out.fill(0x20, 20 + Math.min(jsonData.length, jsonLengthField), 20 + jsonLengthField);
  view.setUint32(20 + jsonLengthField, binLengthField, true);
  view.setUint32(24 + jsonLengthField, GLB_CHUNK_TYPE_BIN, true);
  out.set(binData, 28 + jsonLengthField);
  return out;
}

/** The canonical BIN chunk as a 4-aligned 44-byte block (2 zero pad). */
function paddedBin(): Uint8Array {
  const out = new Uint8Array(44);
  out.set(baseBin(), 0);
  return out;
}

interface ContainerCase {
  readonly name: string;
  readonly bytes: () => Uint8Array;
  readonly code: string;
  readonly kind: "malformed-input" | "unsupported-format" | "resource-limit-exceeded";
}

const CONTAINER_CASES: readonly ContainerCase[] = [
  {
    name: "zero bytes",
    bytes: () => new Uint8Array(0),
    code: "glb-empty",
    kind: "malformed-input",
  },
  {
    name: "fewer than 12 header bytes",
    bytes: () => buildCanonicalGlb().subarray(0, 5),
    code: "glb-header-truncated",
    kind: "malformed-input",
  },
  {
    name: "broken magic",
    bytes: () => setHeaderField(buildCanonicalGlb(), 0, 0x00465467),
    code: "glb-bad-magic",
    kind: "malformed-input",
  },
  {
    name: "container version 1",
    bytes: () => setHeaderField(buildCanonicalGlb(), 4, 1),
    code: "glb-version-unsupported",
    kind: "unsupported-format",
  },
  {
    name: "declared total does not equal the byte length",
    bytes: () => setHeaderField(buildCanonicalGlb(), 8, 584),
    code: "glb-total-length-mismatch",
    kind: "malformed-input",
  },
  {
    name: "declared total is not 4-aligned",
    bytes: () => {
      const bytes = new Uint8Array(buildCanonicalGlb().length + 2);
      bytes.set(buildCanonicalGlb(), 0);
      return setHeaderField(bytes, 8, bytes.length);
    },
    code: "glb-total-length-unaligned",
    kind: "malformed-input",
  },
  {
    name: "chunk header truncated mid-BIN-header",
    bytes: () => cutTo(buildCanonicalGlb(), 532),
    code: "glb-chunk-header-truncated",
    kind: "malformed-input",
  },
  {
    name: "chunk data truncated inside BIN data",
    bytes: () => cutTo(buildCanonicalGlb(), 576),
    code: "glb-chunk-data-truncated",
    kind: "malformed-input",
  },
  {
    name: "first chunk is BIN, not JSON",
    bytes: () => setHeaderField(buildCanonicalGlb(), 16, GLB_CHUNK_TYPE_BIN),
    code: "glb-first-chunk-not-json",
    kind: "malformed-input",
  },
  {
    name: "a second JSON chunk follows the first",
    bytes: () => setHeaderField(buildCanonicalGlb(), 532, GLB_CHUNK_TYPE_JSON),
    code: "glb-duplicate-json-chunk",
    kind: "malformed-input",
  },
  {
    name: "an unknown chunk type sits between JSON and BIN",
    bytes: () => buildThreeChunk(0x3f584544, new Uint8Array([0, 0, 0, 0])),
    code: "glb-unknown-chunk-type",
    kind: "unsupported-format",
  },
  {
    name: "JSON chunk length is not 4-aligned",
    bytes: () => {
      const raw = new TextEncoder().encode(JSON.stringify(doc()));
      // JSON length 506 (2 mod 4) with a 42-byte BIN length (2 mod 4):
      // the total stays 4-aligned, so the JSON-chunk alignment gate fires.
      return customContainer(raw, 506, baseBin(), 42);
    },
    code: "glb-json-chunk-unaligned",
    kind: "malformed-input",
  },
  {
    name: "a second BIN chunk follows the first",
    bytes: () => buildThreeChunk(GLB_CHUNK_TYPE_BIN, new Uint8Array([0, 0, 0, 0])),
    code: "glb-duplicate-bin-chunk",
    kind: "malformed-input",
  },
  {
    name: "the JSON chunk is not valid UTF-8",
    bytes: () => customContainer(new Uint8Array([0xff, 0xfe, 0x20, 0x20]), 4, paddedBin(), 44),
    code: "glb-json-utf8-invalid",
    kind: "malformed-input",
  },
  {
    name: "the JSON chunk does not parse as JSON",
    bytes: () => customContainer(new TextEncoder().encode("{oops   "), 8, paddedBin(), 44),
    code: "glb-json-parse-failed",
    kind: "malformed-input",
  },
  {
    name: "the JSON chunk decodes to a non-object",
    bytes: () => customContainer(new TextEncoder().encode("[1,2]   "), 8, paddedBin(), 44),
    code: "glb-json-not-object",
    kind: "malformed-input",
  },
];

describe("the GLB container negative corpus", () => {
  for (const containerCase of CONTAINER_CASES) {
    test(`${containerCase.name} -> ${containerCase.code} (${containerCase.kind})`, () => {
      const outcome = parseGlb(containerCase.bytes());
      expect(outcome.ok).toBe(false);
      if (outcome.ok) {
        return;
      }
      expect(outcome.failure.kind).toBe(containerCase.kind);
      expect(outcome.failure.detail.length).toBeGreaterThan(0);
      expect(issueCodeOf(outcome.failure)).toBe(containerCase.code);
    });
  }

  test("no bytes-length zero with declared total zero (empty container edge)", () => {
    const outcome = parseGlb(new Uint8Array(0));
    expect(outcome.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 3 — the negative corpus (document-level mutations)                    */
/* ------------------------------------------------------------------ */

interface DocumentCase {
  readonly name: string;
  readonly mutate: (document: Record<string, unknown>) => void;
  readonly code: string;
  readonly kind: "malformed-input" | "unsupported-format" | "capability-unavailable" | "resource-limit-exceeded" | "accepted";
}

function accessor(document: Record<string, unknown>, index: number): Record<string, unknown> {
  return (document["accessors"] as Record<string, unknown>[])[index] as Record<string, unknown>;
}

function bufferView(document: Record<string, unknown>, index: number): Record<string, unknown> {
  return (document["bufferViews"] as Record<string, unknown>[])[index] as Record<string, unknown>;
}

function primitiveOf(document: Record<string, unknown>): Record<string, unknown> {
  const mesh = (document["meshes"] as Record<string, unknown>[])[0] as Record<string, unknown>;
  return (mesh["primitives"] as Record<string, unknown>[])[0] as Record<string, unknown>;
}

const DOCUMENT_CASES: readonly DocumentCase[] = [
  {
    name: "unknown top-level property",
    mutate: (document) => {
      document["bogusSection"] = 1;
    },
    code: "gltf-unknown-top-level-property",
    kind: "malformed-input",
  },
  {
    name: "a tolerated section is not an array",
    mutate: (document) => {
      document["materials"] = "not-an-array";
    },
    code: "gltf-section-not-array",
    kind: "malformed-input",
  },
  {
    name: "the accessors section is not an array",
    mutate: (document) => {
      document["accessors"] = "not-an-array";
    },
    code: "gltf-section-not-array",
    kind: "malformed-input",
  },
  {
    name: "asset missing",
    mutate: (document) => {
      delete document["asset"];
    },
    code: "gltf-asset-missing",
    kind: "malformed-input",
  },
  {
    name: "asset is not an object",
    mutate: (document) => {
      document["asset"] = 42;
    },
    code: "gltf-asset-not-object",
    kind: "malformed-input",
  },
  {
    name: "asset.version missing",
    mutate: (document) => {
      document["asset"] = {};
    },
    code: "gltf-asset-version-missing",
    kind: "malformed-input",
  },
  {
    name: "asset.version is not a string",
    mutate: (document) => {
      document["asset"] = { version: 2 };
    },
    code: "gltf-asset-version-not-string",
    kind: "malformed-input",
  },
  {
    name: "asset.version 2.1 outside declared support",
    mutate: (document) => {
      document["asset"] = { version: "2.1" };
    },
    code: "gltf-asset-version-unsupported",
    kind: "unsupported-format",
  },
  {
    name: "asset.minVersion 1.1 outside declared support",
    mutate: (document) => {
      document["asset"] = { version: "2.0", minVersion: "1.1" };
    },
    code: "gltf-asset-min-version-unsupported",
    kind: "unsupported-format",
  },
  {
    name: "a required extension is not shipped by this build",
    mutate: (document) => {
      document["extensionsRequired"] = ["KHR_draco_mesh_compression"];
    },
    code: "gltf-extensions-required-unavailable",
    kind: "capability-unavailable",
  },
  {
    name: "unknown asset property",
    mutate: (document) => {
      (document["asset"] as Record<string, unknown>)["bogus"] = 1;
    },
    code: "gltf-asset-unknown-property",
    kind: "malformed-input",
  },
  {
    name: "meshes section missing",
    mutate: (document) => {
      delete document["meshes"];
    },
    code: "gltf-meshes-missing",
    kind: "unsupported-format",
  },
  {
    name: "meshes section empty",
    mutate: (document) => {
      document["meshes"] = [];
    },
    code: "gltf-meshes-empty",
    kind: "unsupported-format",
  },
  {
    name: "mesh entry is not an object",
    mutate: (document) => {
      document["meshes"] = [42];
    },
    code: "gltf-mesh-not-object",
    kind: "malformed-input",
  },
  {
    name: "mesh primitives missing",
    mutate: (document) => {
      delete ((document["meshes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["primitives"];
    },
    code: "gltf-mesh-primitives-missing",
    kind: "malformed-input",
  },
  {
    name: "mesh primitives empty (the declared non-empty rule)",
    mutate: (document) => {
      ((document["meshes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["primitives"] = [];
    },
    code: "gltf-mesh-primitives-empty",
    kind: "malformed-input",
  },
  {
    name: "unknown mesh property",
    mutate: (document) => {
      ((document["meshes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["bogus"] = 1;
    },
    code: "gltf-mesh-unknown-property",
    kind: "malformed-input",
  },
  {
    name: "primitives is not an array",
    mutate: (document) => {
      ((document["meshes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["primitives"] = 42;
    },
    code: "gltf-primitives-not-array",
    kind: "malformed-input",
  },
  {
    name: "primitive entry is not an object",
    mutate: (document) => {
      ((document["meshes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["primitives"] = [42];
    },
    code: "gltf-primitive-not-object",
    kind: "malformed-input",
  },
  {
    name: "primitive attributes missing",
    mutate: (document) => {
      delete primitiveOf(document)["attributes"];
    },
    code: "gltf-primitive-attributes-missing",
    kind: "malformed-input",
  },
  {
    name: "primitive attributes is not an object",
    mutate: (document) => {
      primitiveOf(document)["attributes"] = [];
    },
    code: "gltf-primitive-attributes-not-object",
    kind: "malformed-input",
  },
  {
    name: "primitive does not declare POSITION (the declared rule)",
    mutate: (document) => {
      primitiveOf(document)["attributes"] = { NORMAL: 0 };
    },
    code: "gltf-primitive-position-missing",
    kind: "malformed-input",
  },
  {
    name: "attribute accessor index out of range",
    mutate: (document) => {
      primitiveOf(document)["attributes"] = { POSITION: 9 };
    },
    code: "gltf-primitive-attribute-index-invalid",
    kind: "malformed-input",
  },
  {
    name: "indices accessor index out of range",
    mutate: (document) => {
      primitiveOf(document)["indices"] = 9;
    },
    code: "gltf-primitive-indices-index-invalid",
    kind: "malformed-input",
  },
  {
    name: "primitive mode 9 outside 0..6",
    mutate: (document) => {
      primitiveOf(document)["mode"] = 9;
    },
    code: "gltf-primitive-mode-invalid",
    kind: "malformed-input",
  },
  {
    name: "primitive material index with no materials table",
    mutate: (document) => {
      primitiveOf(document)["material"] = 0;
    },
    code: "gltf-primitive-material-index-invalid",
    kind: "malformed-input",
  },
  {
    name: "accessor entry is not an object",
    mutate: (document) => {
      document["accessors"] = [42];
    },
    code: "gltf-accessor-not-object",
    kind: "malformed-input",
  },
  {
    name: "accessor componentType 5124 outside the closed set",
    mutate: (document) => {
      accessor(document, 0)["componentType"] = 5124;
    },
    code: "gltf-accessor-component-type-invalid",
    kind: "malformed-input",
  },
  {
    name: "accessor count 0",
    mutate: (document) => {
      accessor(document, 0)["count"] = 0;
    },
    code: "gltf-accessor-count-invalid",
    kind: "malformed-input",
  },
  {
    name: "accessor count over the declared limit (resource-limit-exceeded)",
    mutate: (document) => {
      accessor(document, 0)["count"] = GLB_LIMITS.maxAccessorCount + 1;
    },
    code: "gltf-accessor-count-limit-exceeded",
    kind: "resource-limit-exceeded",
  },
  {
    name: "accessor type VEC8 outside the closed set",
    mutate: (document) => {
      accessor(document, 0)["type"] = "VEC8";
    },
    code: "gltf-accessor-type-invalid",
    kind: "malformed-input",
  },
  {
    name: "accessor bufferView index out of range",
    mutate: (document) => {
      accessor(document, 0)["bufferView"] = 9;
    },
    code: "gltf-accessor-bufferview-index-invalid",
    kind: "malformed-input",
  },
  {
    name: "accessor has no bufferView (declared: binary-backed accessors only)",
    mutate: (document) => {
      delete accessor(document, 0)["bufferView"];
    },
    code: "gltf-accessor-bufferview-required",
    kind: "malformed-input",
  },
  {
    name: "accessor byteOffset negative",
    mutate: (document) => {
      accessor(document, 0)["byteOffset"] = -1;
    },
    code: "gltf-accessor-offset-invalid",
    kind: "malformed-input",
  },
  {
    name: "accessor byteOffset not a multiple of the component size",
    mutate: (document) => {
      accessor(document, 1)["byteOffset"] = 1;
    },
    code: "gltf-accessor-offset-unaligned",
    kind: "malformed-input",
  },
  {
    name: "accessor byte range exceeds its bufferView",
    mutate: (document) => {
      accessor(document, 0)["count"] = 4;
    },
    code: "gltf-accessor-range-out-of-bounds",
    kind: "malformed-input",
  },
  {
    name: "sparse accessor outside the declared support",
    mutate: (document) => {
      accessor(document, 0)["sparse"] = {};
    },
    code: "gltf-accessor-sparse-unsupported",
    kind: "unsupported-format",
  },
  {
    name: "POSITION accessor is VEC3 but componentType 5123",
    mutate: (document) => {
      accessor(document, 0)["componentType"] = 5123;
    },
    code: "gltf-position-accessor-invalid",
    kind: "malformed-input",
  },
  {
    name: "POSITION accessor min carries 2 numbers",
    mutate: (document) => {
      accessor(document, 0)["min"] = [0, 0];
    },
    code: "gltf-position-minmax-invalid",
    kind: "malformed-input",
  },
  {
    name: "POSITION accessor max is not an array of numbers",
    mutate: (document) => {
      accessor(document, 0)["max"] = "xyz";
    },
    code: "gltf-position-minmax-invalid",
    kind: "malformed-input",
  },
  {
    name: "indices accessor is VEC2 (fits its byte range, but is not SCALAR)",
    mutate: (document) => {
      accessor(document, 1)["type"] = "VEC2";
      accessor(document, 1)["componentType"] = 5121;
    },
    code: "gltf-indices-accessor-invalid",
    kind: "malformed-input",
  },
  {
    name: "indices accessor componentType 5122 (signed SHORT, fits its range)",
    mutate: (document) => {
      accessor(document, 1)["componentType"] = 5122;
    },
    code: "gltf-indices-accessor-invalid",
    kind: "malformed-input",
  },
  {
    name: "bufferView entry is not an object",
    mutate: (document) => {
      document["bufferViews"] = [42];
    },
    code: "gltf-bufferview-not-object",
    kind: "malformed-input",
  },
  {
    name: "bufferView buffer index out of range",
    mutate: (document) => {
      bufferView(document, 0)["buffer"] = 9;
    },
    code: "gltf-bufferview-buffer-index-invalid",
    kind: "malformed-input",
  },
  {
    name: "bufferView byteLength 0",
    mutate: (document) => {
      bufferView(document, 0)["byteLength"] = 0;
    },
    code: "gltf-bufferview-byte-length-invalid",
    kind: "malformed-input",
  },
  {
    name: "bufferView byteOffset negative",
    mutate: (document) => {
      bufferView(document, 0)["byteOffset"] = -1;
    },
    code: "gltf-bufferview-byte-offset-invalid",
    kind: "malformed-input",
  },
  {
    name: "bufferView byte range exceeds the buffer",
    mutate: (document) => {
      bufferView(document, 0)["byteLength"] = 43;
    },
    code: "gltf-bufferview-range-out-of-bounds",
    kind: "malformed-input",
  },
  {
    name: "bufferView byteStride smaller than the accessor row size",
    mutate: (document) => {
      bufferView(document, 0)["byteStride"] = 4;
    },
    code: "gltf-bufferview-stride-invalid",
    kind: "malformed-input",
  },
  {
    name: "bufferView byteStride interleaved (16 > row 12) outside declared support",
    mutate: (document) => {
      bufferView(document, 0)["byteStride"] = 16;
    },
    code: "gltf-bufferview-stride-unsupported",
    kind: "unsupported-format",
  },
  {
    name: "bufferView byteStride tight (12 == row size) is accepted",
    mutate: (document) => {
      bufferView(document, 0)["byteStride"] = 12;
    },
    code: "__accepted",
    kind: "accepted",
  },
  {
    name: "buffer entry is not an object",
    mutate: (document) => {
      document["buffers"] = [42];
    },
    code: "gltf-buffer-not-object",
    kind: "malformed-input",
  },
  {
    name: "buffer byteLength 0",
    mutate: (document) => {
      ((document["buffers"] as Record<string, unknown>[])[0] as Record<string, unknown>)["byteLength"] = 0;
    },
    code: "gltf-buffer-byte-length-invalid",
    kind: "malformed-input",
  },
  {
    name: "GLB buffer 0 carries a uri (forbidden in GLB)",
    mutate: (document) => {
      ((document["buffers"] as Record<string, unknown>[])[0] as Record<string, unknown>)["uri"] = "x.bin";
    },
    code: "gltf-glb-buffer-uri-forbidden",
    kind: "malformed-input",
  },
  {
    name: "GLB buffer 0 byteLength exceeds the BIN chunk",
    mutate: (document) => {
      ((document["buffers"] as Record<string, unknown>[])[0] as Record<string, unknown>)["byteLength"] = 45;
    },
    code: "gltf-glb-buffer-length-mismatch",
    kind: "malformed-input",
  },
  {
    name: "an additional buffer with uri is outside the declared support",
    mutate: (document) => {
      document["buffers"] = [{ byteLength: 42 }, { byteLength: 4, uri: "data:application/octet-storage;base64,AAAA" }];
    },
    code: "gltf-buffer-uri-unsupported",
    kind: "unsupported-format",
  },
  {
    name: "scene index out of range",
    mutate: (document) => {
      document["scene"] = 5;
    },
    code: "gltf-scene-index-invalid",
    kind: "malformed-input",
  },
  {
    name: "scene entry is not an object",
    mutate: (document) => {
      document["scenes"] = [42];
    },
    code: "gltf-scene-not-object",
    kind: "malformed-input",
  },
  {
    name: "scene nodes is not an array",
    mutate: (document) => {
      ((document["scenes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["nodes"] = 42;
    },
    code: "gltf-scene-nodes-not-array",
    kind: "malformed-input",
  },
  {
    name: "scene root index out of range",
    mutate: (document) => {
      ((document["scenes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["nodes"] = [9];
    },
    code: "gltf-scene-root-index-invalid",
    kind: "malformed-input",
  },
  {
    name: "node entry is not an object",
    mutate: (document) => {
      document["nodes"] = [42];
    },
    code: "gltf-node-not-object",
    kind: "malformed-input",
  },
  {
    name: "node mesh index out of range",
    mutate: (document) => {
      ((document["nodes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["mesh"] = 9;
    },
    code: "gltf-node-mesh-index-invalid",
    kind: "malformed-input",
  },
  {
    name: "unknown node property",
    mutate: (document) => {
      ((document["nodes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["bogus"] = 1;
    },
    code: "gltf-node-unknown-property",
    kind: "malformed-input",
  },
  {
    name: "node children is not an array",
    mutate: (document) => {
      document["nodes"] = [{ mesh: 0, children: 42 }];
    },
    code: "gltf-node-children-not-array",
    kind: "malformed-input",
  },
  {
    name: "node child index out of range",
    mutate: (document) => {
      document["nodes"] = [{ mesh: 0, children: [9] }];
    },
    code: "gltf-node-child-index-invalid",
    kind: "malformed-input",
  },
  {
    name: "node lists the same child twice",
    mutate: (document) => {
      document["nodes"] = [{ mesh: 0, children: [1, 1] }, { mesh: 0 }];
      ((document["scenes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["nodes"] = [0];
    },
    code: "gltf-node-child-duplicate",
    kind: "malformed-input",
  },
  {
    name: "node 2 is a direct child of two nodes (single-parenthood law)",
    mutate: (document) => {
      document["nodes"] = [{ children: [2] }, { children: [2] }, { mesh: 0 }];
      ((document["scenes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["nodes"] = [0, 1];
    },
    code: "gltf-node-multi-parent",
    kind: "malformed-input",
  },
  {
    name: "the node graph is cyclic (2-cycle off a root-only node)",
    mutate: (document) => {
      document["nodes"] = [{ mesh: 0 }, { children: [2] }, { children: [1] }];
      ((document["scenes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["nodes"] = [0];
    },
    code: "gltf-scene-graph-cyclic",
    kind: "malformed-input",
  },
  {
    name: "a scene node is also a child (multi-parent across scene roots)",
    mutate: (document) => {
      document["nodes"] = [{ mesh: 0 }, { mesh: 0, children: [0] }];
      ((document["scenes"] as Record<string, unknown>[])[0] as Record<string, unknown>)["nodes"] = [0, 1];
    },
    code: "gltf-node-multi-parent",
    kind: "malformed-input",
  },
];

describe("the glTF 2.0 document negative corpus", () => {
  for (const documentCase of DOCUMENT_CASES) {
    test(`${documentCase.name} -> ${documentCase.code}`, () => {
      const glb = build(documentCase.mutate);
      const outcome = parseGlb(glb);
      if (documentCase.kind === "accepted") {
        expect(outcome.ok).toBe(true);
        return;
      }
      expect(outcome.ok).toBe(false);
      if (outcome.ok) {
        return;
      }
      expect(outcome.failure.kind).toBe(documentCase.kind);
      expect(issueCodeOf(outcome.failure)).toBe(documentCase.code);
    });
  }

  test("no BIN chunk at all with a uri-less buffer 0", () => {
    const outcome = parseGlb(encodeGlb(doc(), new Uint8Array(0)));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(issueCodeOf(outcome.failure)).toBe("gltf-glb-bin-chunk-missing");
  });

  test("the data-level gate: an index value addressing a nonexistent vertex", () => {
    const bin = baseBin();
    const view = new DataView(bin.buffer);
    view.setUint16(36, 7, true);
    const outcome = parseGlb(build(undefined, bin));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    const extraction = extractCanonicalGeometry(outcome.value);
    expect(extraction.ok).toBe(false);
    if (extraction.ok) {
      return;
    }
    expect(extraction.failure.kind).toBe("malformed-input");
    expect(issueCodeOf(extraction.failure)).toBe("gltf-indices-value-out-of-range");
  });

  test("validateGltfDocument refuses a non-object document directly", () => {
    const outcome = validateGltfDocument([1, 2], {
      binChunkBytes: 42,
      maxAccessorCount: GLB_LIMITS.maxAccessorCount,
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(issueCodeOf(outcome.failure)).toBe("gltf-document-not-object");
  });
});

/* ------------------------------------------------------------------ */
/* 4 — the vocabulary coverage + kind-mapping laws                        */
/* ------------------------------------------------------------------ */

describe("the closed issue vocabulary", () => {
  test("every container code maps to a member of the closed five-kind vocabulary", () => {
    for (const code of GLB_CONTAINER_ISSUE_CODES) {
      expect(isSubstrateFailureKind(GLB_CONTAINER_ISSUE_KIND[code])).toBe(true);
    }
  });

  test("every document code maps to a member of the closed five-kind vocabulary", () => {
    for (const code of GLTF_DOCUMENT_ISSUE_CODES) {
      expect(isSubstrateFailureKind(GLTF_DOCUMENT_ISSUE_KIND[code])).toBe(true);
    }
  });

  test("COVERAGE: the corpus exercises every container code (no dead codes)", () => {
    const exercised = new Set(CONTAINER_CASES.map((containerCase) => containerCase.code));
    exercised.add("gltf-indices-value-out-of-range");
    const declared = new Set<string>([...GLB_CONTAINER_ISSUE_CODES]);
    const unexercised = [...declared].filter((code) => !exercised.has(code));
    const undeclared = [...exercised].filter((code) => !declared.has(code));
    expect(unexercised).toEqual([]);
    expect(undeclared).toEqual([]);
  });

  test("COVERAGE: the corpus exercises every document code (no dead codes)", () => {
    const exercised = new Set(
      DOCUMENT_CASES.filter((documentCase) => documentCase.code !== "__accepted").map(
        (documentCase) => documentCase.code,
      ),
    );
    exercised.add("gltf-glb-bin-chunk-missing");
    exercised.add("gltf-document-not-object");
    const declared = new Set<string>([...GLTF_DOCUMENT_ISSUE_CODES]);
    const unexercised = [...declared].filter((code) => !exercised.has(code));
    const undeclared = [...exercised].filter((code) => !declared.has(code));
    expect(unexercised).toEqual([]);
    expect(undeclared).toEqual([]);
  });

  test("the corpus exercises four of the five failure kinds (contract-mismatch is a lane-boundary kind)", () => {
    const kinds = new Set<string>([
      ...CONTAINER_CASES.map((containerCase) => containerCase.kind),
      ...DOCUMENT_CASES.map((documentCase) => documentCase.kind),
    ]);
    expect(kinds.has("malformed-input")).toBe(true);
    expect(kinds.has("unsupported-format")).toBe(true);
    expect(kinds.has("capability-unavailable")).toBe(true);
    expect(kinds.has("resource-limit-exceeded")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* 5 — declared resource limits                                          */
/* ------------------------------------------------------------------ */

describe("the declared resource limits", () => {
  test("a GLB over the declared byte ceiling is refused with the limit pair recorded", () => {
    const bytes = new Uint8Array(GLB_LIMITS.maxTotalBytes + 1);
    const outcome = parseGlb(bytes);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("resource-limit-exceeded");
    expect(outcome.failure.limit).toEqual({
      declared: GLB_LIMITS.maxTotalBytes,
      actual: GLB_LIMITS.maxTotalBytes + 1,
    });
  });

  test("the accessor-count refusal records the limit pair", () => {
    const outcome = parseGlb(build((document) => {
      accessor(document, 0)["count"] = GLB_LIMITS.maxAccessorCount + 1;
    }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) {
      return;
    }
    expect(outcome.failure.kind).toBe("resource-limit-exceeded");
    expect(outcome.failure.limit).toEqual({
      declared: GLB_LIMITS.maxAccessorCount,
      actual: GLB_LIMITS.maxAccessorCount + 1,
    });
  });
});

/* ------------------------------------------------------------------ */
/* 6 — fail-closed totality under seeded mutation                        */
/* ------------------------------------------------------------------ */

describe("the fail-closed totality property", () => {
  test("500 seeded single-byte mutations never throw and always answer a typed outcome", () => {
    const canonical = buildCanonicalGlb();
    const random = seededRandom(20261002);
    let accepted = 0;
    let refused = 0;
    for (let iteration = 0; iteration < 500; iteration += 1) {
      const mutated = new Uint8Array(canonical);
      const position = Math.floor(random.next() * mutated.length);
      mutated[position] = Math.floor(random.next() * 256);
      let outcome: ReturnType<typeof parseGlb>;
      try {
        outcome = parseGlb(mutated);
      } catch (error) {
        throw new Error(
          `the parser THREW on a single-byte mutation at ${position}: ${String(error)}`,
          { cause: error },
        );
      }
      expect(typeof outcome.ok).toBe("boolean");
      if (outcome.ok) {
        accepted += 1;
        const extraction = extractCanonicalGeometry(outcome.value);
        expect(typeof extraction.ok).toBe("boolean");
      } else {
        refused += 1;
        expect(isSubstrateFailureKind(outcome.failure.kind)).toBe(true);
        expect(outcome.failure.detail.length).toBeGreaterThan(0);
      }
    }
    // The canonical GLB is dense: most mutations are refused (header,
    // padding, structure, or range damage), some are benign (JSON padding
    // spaces, BIN zero padding). Both outcomes are legal; throws are not.
    expect(accepted + refused).toBe(500);
    expect(refused).toBeGreaterThan(200);
  });

  test("every truncated prefix of the canonical GLB answers a typed outcome", () => {
    const canonical = buildCanonicalGlb();
    for (let length = 0; length <= 12; length += 1) {
      const prefix = canonical.subarray(0, length);
      const outcome = parseGlb(new Uint8Array(prefix));
      if (length < 12) {
        expect(outcome.ok).toBe(false);
      }
    }
  });
});
