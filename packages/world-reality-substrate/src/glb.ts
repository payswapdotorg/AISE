/**
 * WORLD-P0-A — the GLB v2 container codec with the byte-identical
 * canonical-extraction rule.
 *
 * The GLB container grammar validated here (glTF 2.0 specification, "GLB
 * Container Format" appendix):
 *
 *   - 12-byte header: magic "glTF" (0x46546C67 little-endian), version
 *     uint32, total byte length uint32;
 *   - the version MUST be 2 — any other version is well-formed container
 *     data outside this adapter's declared support;
 *   - the declared total length MUST equal the actual byte length of the
 *     input and MUST be a multiple of 4;
 *   - chunks follow, each with a uint32 length and a uint32 type; the
 *     FIRST chunk is JSON (padded with 0x20 to a multiple of 4); at most
 *     one BIN chunk (padded with 0x00 to a multiple of 4) may follow, and
 *     the BIN chunk is the LAST chunk;
 *   - a chunk type outside {JSON, BIN} is well-formed container data but
 *     outside this adapter's declared support (refused, never guessed).
 *
 * THE BYTE-IDENTICAL CANONICAL-EXTRACTION RULE: `extractCanonicalGeometry`
 * turns a parsed GLB into a deterministic canonical byte stream — for each
 * mesh, for each primitive, in document order, a fixed little-endian header
 * (mesh index, primitive index, mode, vertex count, index count) followed
 * by the accessor's tightly-packed POSITION bytes and indices bytes exactly
 * as stored in the BIN chunk. No reordering, no re-encoding, no float
 * rewriting: the same GLB bytes produce the IDENTICAL stream, and the
 * stream's sha-256 is the content address of the delivered geometry. Two
 * independent parses of the same file MUST agree byte-for-byte (tested).
 *
 * Totality: `parseGlb` and `extractCanonicalGeometry` never throw; every
 * input is answered with a typed `SubstrateOutcome`. The declared gate
 * order is: resource limits → header → chunk structure → JSON decode →
 * document validation (in gltf.ts) → data-level checks (extraction).
 */

import { createHash } from "node:crypto";
import { malformedInput, resourceLimitExceeded, unsupportedFormat } from "./outcome";
import type { SubstrateOutcome } from "./outcome";
import { validateGltfDocument } from "./gltf";
import type { GltfDocument, GltfPrimitive } from "./gltf";

/* ------------------------------------------------------------------ */
/* Declared resource limits (refused BEFORE unbounded work)              */
/* ------------------------------------------------------------------ */

/**
 * The declared bounded limits of this adapter build. A GLB larger than
 * `maxTotalBytes` or an accessor whose count exceeds `maxAccessorCount`
 * is refused `resource-limit-exceeded` with the declared limit and the
 * observed actual recorded — before any per-byte work happens.
 */
export const GLB_LIMITS = {
  /** 64 MiB — the P0 runtime-delivery lane's declared byte ceiling. */
  maxTotalBytes: 67_108_864,
  /** 10,000,000 — the declared accessor element-count ceiling. */
  maxAccessorCount: 10_000_000,
} as const;

/* ------------------------------------------------------------------ */
/* Container constants                                                   */
/* ------------------------------------------------------------------ */

export const GLB_MAGIC = 0x46546c67; // "glTF" little-endian
export const GLB_VERSION = 2;
export const GLB_CHUNK_TYPE_JSON = 0x4e4f534a; // "JSON" little-endian
export const GLB_CHUNK_TYPE_BIN = 0x004e4942; // "BIN\0" little-endian
export const GLB_HEADER_BYTES = 12;
export const GLB_CHUNK_HEADER_BYTES = 8;

/* ------------------------------------------------------------------ */
/* The container issue vocabulary                                        */
/* ------------------------------------------------------------------ */

/** Container- and extraction-level issue codes (closed, tested). */
export const GLB_CONTAINER_ISSUE_CODES = [
  "glb-empty",
  "glb-header-truncated",
  "glb-bad-magic",
  "glb-version-unsupported",
  "glb-total-length-mismatch",
  "glb-total-length-unaligned",
  "glb-chunk-header-truncated",
  "glb-chunk-data-truncated",
  "glb-first-chunk-not-json",
  "glb-duplicate-json-chunk",
  "glb-unknown-chunk-type",
  "glb-json-chunk-unaligned",
  "glb-duplicate-bin-chunk",
  "glb-json-utf8-invalid",
  "glb-json-parse-failed",
  "glb-json-not-object",
  "gltf-indices-value-out-of-range",
] as const;
export type GlbIssueCode = (typeof GLB_CONTAINER_ISSUE_CODES)[number];

/**
 * Container issue-code → failure kind (closed; malformed by default).
 *
 * Declared note: there is no `glb-bin-chunk-unaligned` code and no
 * `glb-chunk-after-bin` code because both are UNREACHABLE under the
 * declared gate order — a BIN chunk whose length is not 4-aligned always
 * makes the declared total non-4-aligned first (the total-alignment gate
 * fires before any chunk is read), and any chunk that would FOLLOW a BIN
 * chunk is refused by its own type rule (duplicate JSON, duplicate BIN, or
 * unknown chunk type), which together enforce "the BIN chunk is last".
 * The vocabulary carries only reachable codes.
 */
export const GLB_CONTAINER_ISSUE_KIND: Readonly<
  Record<GlbIssueCode, "malformed-input" | "unsupported-format" | "resource-limit-exceeded">
> = {
  "glb-empty": "malformed-input",
  "glb-header-truncated": "malformed-input",
  "glb-bad-magic": "malformed-input",
  "glb-version-unsupported": "unsupported-format",
  "glb-total-length-mismatch": "malformed-input",
  "glb-total-length-unaligned": "malformed-input",
  "glb-chunk-header-truncated": "malformed-input",
  "glb-chunk-data-truncated": "malformed-input",
  "glb-first-chunk-not-json": "malformed-input",
  "glb-duplicate-json-chunk": "malformed-input",
  "glb-unknown-chunk-type": "unsupported-format",
  "glb-json-chunk-unaligned": "malformed-input",
  "glb-duplicate-bin-chunk": "malformed-input",
  "glb-json-utf8-invalid": "malformed-input",
  "glb-json-parse-failed": "malformed-input",
  "glb-json-not-object": "malformed-input",
  "gltf-indices-value-out-of-range": "malformed-input",
};

/* ------------------------------------------------------------------ */
/* The parse result                                                      */
/* ------------------------------------------------------------------ */

export interface GlbContainerInfo {
  readonly version: number;
  readonly totalBytes: number;
  readonly jsonChunkBytes: number;
  readonly binChunkBytes: number | null;
  readonly chunkCount: number;
}

export interface ParsedGlb {
  readonly container: GlbContainerInfo;
  readonly document: GltfDocument;
  /** The BIN chunk bytes (a private copy; never aliased to the input). */
  readonly binChunk: Uint8Array | null;
}

/* ------------------------------------------------------------------ */
/* The container decoder                                                 */
/* ------------------------------------------------------------------ */

function containerRefuse(
  code: GlbIssueCode,
  path: string,
  detail: string,
): SubstrateOutcome<ParsedGlb> {
  const kind = GLB_CONTAINER_ISSUE_KIND[code];
  if (kind === "unsupported-format") {
    return {
      ok: false,
      failure: unsupportedFormat(`${path}: ${detail} (issue code ${code})`, "gltf"),
    };
  }
  return {
    ok: false,
    failure: malformedInput(path, `${detail} (issue code ${code})`, "gltf"),
  };
}

/**
 * Parse and validate a GLB v2 byte stream. TOTAL: never throws; the
 * declared gate order is resource limits → header → chunks → JSON decode
 * → document validation.
 */
export function parseGlb(bytes: Uint8Array): SubstrateOutcome<ParsedGlb> {
  /* 1 — resource gate (before any per-byte work) ---------------------- */
  if (bytes.length > GLB_LIMITS.maxTotalBytes) {
    return {
      ok: false,
      failure: resourceLimitExceeded(
        "glb",
        GLB_LIMITS.maxTotalBytes,
        bytes.length,
        "gltf",
      ),
    };
  }

  /* 2 — header --------------------------------------------------------- */
  if (bytes.length === 0) {
    return containerRefuse("glb-empty", "glb", "the input is empty (0 bytes)");
  }
  if (bytes.length < GLB_HEADER_BYTES) {
    return containerRefuse(
      "glb-header-truncated",
      "glb",
      `the input carries ${bytes.length} byte(s) — fewer than the 12-byte GLB header`,
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    return containerRefuse(
      "glb-bad-magic",
      "glb.header.magic",
      `the 4-byte magic is 0x${magic.toString(16).padStart(8, "0")} — expected "glTF" (0x${GLB_MAGIC.toString(16)})`,
    );
  }
  const version = view.getUint32(4, true);
  if (version !== GLB_VERSION) {
    return containerRefuse(
      "glb-version-unsupported",
      "glb.header.version",
      `container version ${version} is outside this adapter's declared support (exactly version 2)`,
    );
  }
  const declaredTotal = view.getUint32(8, true);
  if (declaredTotal !== bytes.length) {
    return containerRefuse(
      "glb-total-length-mismatch",
      "glb.header.length",
      `the declared total length ${declaredTotal} does not equal the actual byte length ${bytes.length}`,
    );
  }
  if (declaredTotal % 4 !== 0) {
    return containerRefuse(
      "glb-total-length-unaligned",
      "glb.header.length",
      `the declared total length ${declaredTotal} is not a multiple of 4`,
    );
  }

  /* 3 — chunks --------------------------------------------------------- */
  let offset = GLB_HEADER_BYTES;
  let sawJson = false;
  let sawBin = false;
  let jsonChunkBytes = 0;
  let binChunk: Uint8Array | null = null;
  let chunkCount = 0;
  while (offset < bytes.length) {
    if (offset + GLB_CHUNK_HEADER_BYTES > bytes.length) {
      return containerRefuse(
        "glb-chunk-header-truncated",
        `glb.chunk[${chunkCount}].header`,
        `the chunk header at byte ${offset} is truncated (only ${bytes.length - offset} byte(s) remain)`,
      );
    }
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + GLB_CHUNK_HEADER_BYTES;
    if (chunkLength % 4 !== 0 && chunkType === GLB_CHUNK_TYPE_JSON) {
      return containerRefuse(
        "glb-json-chunk-unaligned",
        `glb.chunk[${chunkCount}].length`,
        `the JSON chunk length ${chunkLength} is not a multiple of 4 (0x20 padding required)`,
      );
    }
    if (dataStart + chunkLength > bytes.length) {
      return containerRefuse(
        "glb-chunk-data-truncated",
        `glb.chunk[${chunkCount}].data`,
        `the chunk at byte ${offset} declares ${chunkLength} data byte(s) but only ${bytes.length - dataStart} remain`,
      );
    }
    if (chunkCount === 0 && chunkType !== GLB_CHUNK_TYPE_JSON) {
      return containerRefuse(
        "glb-first-chunk-not-json",
        `glb.chunk[0].type`,
        `the first chunk type is 0x${chunkType.toString(16).padStart(8, "0")} — the first chunk MUST be JSON`,
      );
    }
    if (
      chunkType !== GLB_CHUNK_TYPE_JSON &&
      chunkType !== GLB_CHUNK_TYPE_BIN
    ) {
      return containerRefuse(
        "glb-unknown-chunk-type",
        `glb.chunk[${chunkCount}].type`,
        `chunk type 0x${chunkType.toString(16).padStart(8, "0")} is outside this adapter's declared chunk vocabulary {JSON, BIN}`,
      );
    }
    if (chunkType === GLB_CHUNK_TYPE_JSON) {
      if (sawJson) {
        return containerRefuse(
          "glb-duplicate-json-chunk",
          `glb.chunk[${chunkCount}].type`,
          "a second JSON chunk is present — exactly one JSON chunk is allowed, first",
        );
      }
      sawJson = true;
      jsonChunkBytes = chunkLength;
    } else {
      // No bin-alignment gate and no trailing-chunk gate here: both are
      // unreachable under the declared gate order (see the kind map's
      // declared note) — the total-alignment gate subsumes the former,
      // and every possible trailing chunk type refuses by its own rule
      // (duplicate JSON / duplicate BIN / unknown type), which together
      // enforce "the BIN chunk is the last chunk".
      if (sawBin) {
        return containerRefuse(
          "glb-duplicate-bin-chunk",
          `glb.chunk[${chunkCount}].type`,
          "a second BIN chunk is present — at most one BIN chunk is allowed",
        );
      }
      sawBin = true;
      binChunk = bytes.slice(dataStart, dataStart + chunkLength);
    }
    offset = dataStart + chunkLength;
    chunkCount += 1;
  }
  if (!sawJson) {
    return containerRefuse(
      "glb-first-chunk-not-json",
      "glb.chunk[0]",
      "the container carries no JSON chunk",
    );
  }

  /* 4 — JSON decode ----------------------------------------------------- */
  const jsonEnd = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + jsonChunkBytes;
  let jsonText: string;
  try {
    jsonText = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES, jsonEnd),
    );
  } catch {
    return containerRefuse(
      "glb-json-utf8-invalid",
      "glb.chunk[0].data",
      "the JSON chunk is not valid UTF-8",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(jsonText);
  } catch (error) {
    return containerRefuse(
      "glb-json-parse-failed",
      "glb.chunk[0].data",
      `the JSON chunk does not parse as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return containerRefuse(
      "glb-json-not-object",
      "glb.chunk[0].data",
      "the JSON chunk decodes to a non-object JSON value",
    );
  }

  /* 5 — document validation ---------------------------------------------- */
  const document = validateGltfDocument(json, {
    binChunkBytes: binChunk === null ? null : binChunk.length,
    maxAccessorCount: GLB_LIMITS.maxAccessorCount,
  });
  if (!document.ok) {
    return { ok: false, failure: document.failure };
  }

  return {
    ok: true,
    value: {
      container: {
        version,
        totalBytes: bytes.length,
        jsonChunkBytes,
        binChunkBytes: binChunk === null ? null : binChunk.length,
        chunkCount,
      },
      document: document.value,
      binChunk,
    },
  };
}

/* ------------------------------------------------------------------ */
/* The encoder (deterministic; used by fixtures, tests, the lane double)  */
/* ------------------------------------------------------------------ */

/** Encode a glTF JSON document + binary payload as a GLB v2 byte stream. */
export function encodeGlb(document: unknown, bin: Uint8Array): Uint8Array {
  const jsonBytes = new TextEncoder().encode(
    typeof document === "string" ? document : JSON.stringify(document),
  );
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const binPadding = (4 - (bin.length % 4)) % 4;
  const hasBin = bin.length > 0;
  const total =
    GLB_HEADER_BYTES +
    GLB_CHUNK_HEADER_BYTES +
    jsonBytes.length +
    jsonPadding +
    (hasBin ? GLB_CHUNK_HEADER_BYTES + bin.length + binPadding : 0);
  const out = new Uint8Array(total);
  const header = new DataView(out.buffer);
  header.setUint32(0, GLB_MAGIC, true);
  header.setUint32(4, GLB_VERSION, true);
  header.setUint32(8, total, true);
  let offset = GLB_HEADER_BYTES;
  header.setUint32(offset, jsonBytes.length + jsonPadding, true);
  header.setUint32(offset + 4, GLB_CHUNK_TYPE_JSON, true);
  offset += GLB_CHUNK_HEADER_BYTES;
  out.set(jsonBytes, offset);
  if (jsonPadding > 0) {
    out.fill(0x20, offset + jsonBytes.length, offset + jsonBytes.length + jsonPadding);
  }
  offset += jsonBytes.length + jsonPadding;
  if (hasBin) {
    header.setUint32(offset, bin.length + binPadding, true);
    header.setUint32(offset + 4, GLB_CHUNK_TYPE_BIN, true);
    offset += GLB_CHUNK_HEADER_BYTES;
    out.set(bin, offset);
    if (binPadding > 0) {
      out.fill(0x00, offset + bin.length, offset + bin.length + binPadding);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The byte-identical canonical extraction                                */
/* ------------------------------------------------------------------ */

export interface CanonicalPrimitiveExtraction {
  readonly mesh: number;
  readonly primitive: number;
  readonly mode: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly positionBytes: Uint8Array;
  readonly indicesBytes: Uint8Array | null;
  /** Realized min/max of the POSITION data (computed, never trusted). */
  readonly realizedMin: readonly number[];
  readonly realizedMax: readonly number[];
  /** Declared accessor min/max, when present (echoed for cross-check). */
  readonly declaredMin: readonly number[] | null;
  readonly declaredMax: readonly number[] | null;
  /** Honest cross-check: do realized bounds equal the declared bounds? */
  readonly realizedBoundsMatchDeclared: boolean | null;
}

export interface CanonicalExtraction {
  /** The canonical byte stream (the byte-identical rule's subject). */
  readonly stream: Uint8Array;
  /** sha-256 over the canonical stream — the delivered-geometry digest. */
  readonly digest: string;
  readonly primitives: readonly CanonicalPrimitiveExtraction[];
  readonly totalVertexCount: number;
  readonly totalIndexCount: number;
}

function extractRefuse(path: string, detail: string): SubstrateOutcome<CanonicalExtraction> {
  return {
    ok: false,
    failure: malformedInput(path, `${detail} (issue code gltf-indices-value-out-of-range)`, "gltf"),
  };
}

/**
 * Extract the canonical geometry stream from a parsed GLB. THE RULE: the
 * same GLB bytes yield the byte-identical stream and digest, on every
 * host, forever. Also performs the data-level validation the container
 * stage cannot: every index value must be a valid vertex index.
 */
export function extractCanonicalGeometry(
  parsed: ParsedGlb,
): SubstrateOutcome<CanonicalExtraction> {
  const bin = parsed.binChunk;
  const { document } = parsed;
  if (bin === null) {
    return extractRefuse(
      "glb.bin",
      "the document requires binary data but the GLB carries no BIN chunk (internal invariant — refused fail-closed)",
    );
  }

  const parts: Uint8Array[] = [];
  const records: CanonicalPrimitiveExtraction[] = [];
  let totalVertexCount = 0;
  let totalIndexCount = 0;

  for (let meshIndex = 0; meshIndex < document.meshes.length; meshIndex += 1) {
    const mesh = document.meshes[meshIndex];
    if (mesh === undefined) {
      continue;
    }
    for (
      let primitiveIndex = 0;
      primitiveIndex < mesh.primitives.length;
      primitiveIndex += 1
    ) {
      const primitive = mesh.primitives[primitiveIndex];
      if (primitive === undefined) {
        continue;
      }
      const position = document.accessors[primitive.positionAccessor];
      if (position === undefined) {
        continue;
      }
      const positionView = document.bufferViews[position.bufferView];
      if (positionView === undefined) {
        continue;
      }
      const positionStart =
        positionView.byteOffset + position.byteOffset;
      const positionBytes = bin.slice(
        positionStart,
        positionStart + position.count * 12,
      );

      let indicesBytes: Uint8Array | null = null;
      let indexCount = 0;
      const indicesAccessorIndex = primitive.indicesAccessor;
      if (indicesAccessorIndex !== undefined) {
        const indices = document.accessors[indicesAccessorIndex];
        const indicesView =
          indices === undefined ? undefined : document.bufferViews[indices.bufferView];
        if (indices !== undefined && indicesView !== undefined) {
          const componentSize =
            indices.componentType === 5121 ? 1 : indices.componentType === 5123 ? 2 : 4;
          const indicesStart = indicesView.byteOffset + indices.byteOffset;
          indexCount = indices.count;
          indicesBytes = bin.slice(
            indicesStart,
            indicesStart + indices.count * componentSize,
          );
          /* data-level gate: every index value must address a vertex ---- */
          const indexData = new DataView(
            indicesBytes.buffer,
            indicesBytes.byteOffset,
            indicesBytes.byteLength,
          );
          for (let i = 0; i < indices.count; i += 1) {
            const value =
              componentSize === 1
                ? indexData.getUint8(i)
                : componentSize === 2
                  ? indexData.getUint16(i * 2, true)
                  : indexData.getUint32(i * 4, true);
            if (value >= position.count) {
              return extractRefuse(
                `meshes[${meshIndex}].primitives[${primitiveIndex}].indices[${i}]`,
                `the index value ${value} addresses vertex ${value} of a POSITION table with only ${position.count} vertices`,
              );
            }
          }
        }
      }

      /* realized bounds: computed from the bytes, never trusted --------- */
      const floats = new Float32Array(
        positionBytes.buffer,
        positionBytes.byteOffset,
        position.count * 3,
      );
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < position.count * 3; i += 1) {
        const value = floats[i] ?? 0;
        const axis = i % 3;
        if (value < (min[axis] ?? Infinity)) {
          min[axis] = value;
        }
        if (value > (max[axis] ?? -Infinity)) {
          max[axis] = value;
        }
      }
      const realizedMin = [...min];
      const realizedMax = [...max];
      const declaredMin = position.min === undefined ? null : [...position.min];
      const declaredMax = position.max === undefined ? null : [...position.max];
      const boundsMatch =
        declaredMin === null || declaredMax === null
          ? null
          : boundsEqual(realizedMin, declaredMin) && boundsEqual(realizedMax, declaredMax);

      /* the fixed canonical header: 5 uint32, little-endian ------------- */
      const header = new Uint8Array(20);
      const headerView = new DataView(header.buffer);
      headerView.setUint32(0, meshIndex, true);
      headerView.setUint32(4, primitiveIndex, true);
      headerView.setUint32(8, primitive.mode, true);
      headerView.setUint32(12, position.count, true);
      headerView.setUint32(16, indexCount, true);
      parts.push(header, positionBytes);
      if (indicesBytes !== null) {
        parts.push(indicesBytes);
      }

      records.push({
        mesh: meshIndex,
        primitive: primitiveIndex,
        mode: primitive.mode,
        vertexCount: position.count,
        indexCount,
        positionBytes,
        indicesBytes,
        realizedMin,
        realizedMax,
        declaredMin,
        declaredMax,
        realizedBoundsMatchDeclared: boundsMatch,
      });
      totalVertexCount += position.count;
      totalIndexCount += indexCount;
    }
  }

  const stream = concatBytes(parts);
  return {
    ok: true,
    value: {
      stream,
      digest: createHash("sha256").update(stream).digest("hex"),
      primitives: records,
      totalVertexCount,
      totalIndexCount,
    },
  };
}

function boundsEqual(left: readonly number[], right: readonly number[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** The canonical GLB of the gltf lane's conformance subject (deterministic). */
export function buildCanonicalGlb(): Uint8Array {
  const document = canonicalGltfDocument();
  const bin = new Uint8Array(42);
  const binView = new DataView(bin.buffer);
  const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  for (let index = 0; index < positions.length; index += 1) {
    binView.setFloat32(index * 4, positions[index] ?? 0, true);
  }
  for (let index = 0; index < 3; index += 1) {
    binView.setUint16(36 + index * 2, index, true);
  }
  return encodeGlb(document, bin);
}

/** The canonical GLB's glTF JSON document (deterministic, committed shape). */
export function canonicalGltfDocument(): Record<string, unknown> {
  return {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "canonical-triangle" }],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 },
    ],
    buffers: [{ byteLength: 42 }],
  };
}

/** Re-export the primitive type for lane consumers. */
export type { GltfPrimitive };
